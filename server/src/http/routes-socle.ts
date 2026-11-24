/** Moteurs communs exposés : documents et preuves, réclamations, motifs de blocage, supervision des événements et traitements. */
import express, { Router, type Request } from 'express';
import { z } from 'zod';
import { getPool } from '../db/pool.js';
import { ErreurMetier } from '../noyau/erreurs.js';
import { aujourdhui } from '../noyau/dates.js';
import { controlerDroit, profilsActifs, type Action } from '../modules/habilitations/droits.js';
import { Refus } from '../modules/auth/service.js';
import {
  apercuModele, controlerLisibilite, deposerPiece, documentsDeLObjet, imprimerDocument, lireDocument, TAILLE_MAX_PIECE, verifierDocument,
} from '../moteurs/documents.js';
import { confirmerAcceptation, demanderAcceptation, enregistrerSignatureManuscrite, preuvesDuDocument } from '../modules/documents/acceptation.js';
import {
  affecterReclamation, CANAUX, cloreReclamation, enregistrerReclamation, indicateursReclamations, lireReclamation, listerReclamations,
  OBJETS_RECLAMATION, prendreEnCharge, repondreReclamation,
} from '../modules/reclamations/service.js';
import { deposerMotif, leverMotif, MODULE_DU_PROFIL, referentielMotifs, vueMotifs } from '../modules/droits/blocages.js';
import { distributionsEnAnomalie, relancer } from '../moteurs/evenements.js';
import { executerTraitement, TRAITEMENTS } from '../ordonnanceur.js';
import { droit, ecrire } from './socle.js';

const uuid = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const leverRefus = <T>(x: T | Refus): T => { if (x instanceof Refus) throw x.erreur; return x; };

/** Fonction du système qui protège les documents d'un objet ; les autres objets arrivent avec leurs modules. */
const FONCTION_DE_L_OBJET: Record<string, string> = { tiers: 'TIERS', reclamation: 'RECLAMATIONS', societe: 'SOCIETE' };
async function droitSurObjet(req: Request, objetType: string, action: Action) {
  const f = FONCTION_DE_L_OBJET[objetType];
  if (!f) throw new ErreurMetier('INTERDIT', `Documents de type d'objet ${objetType} : non disponibles dans ce lot`, 403);
  await controlerDroit(getPool(), req.acteur.utilisateurId!, f, action);
}
async function droitSurDocument(req: Request, id: string, action: Action) {
  const d = (await getPool().query<{ objet_type: string }>('SELECT objet_type FROM document WHERE id = $1 AND supprime_le IS NULL', [id])).rows[0];
  if (!d) throw new ErreurMetier('NON_TROUVE', 'Document introuvable', 404);
  await droitSurObjet(req, d.objet_type, action);
}

export function routesSocle(): Router {
  const r = Router();

  // ---------------------------------------------------------------- Documents (DIG-RG-001 à 007)
  r.get('/documents', async (req, res) => {
    const o = z.object({ objetType: z.string(), objetId: uuid }).parse(req.query);
    await droitSurObjet(req, o.objetType, 'CONSULTER');
    res.json(await documentsDeLObjet(getPool(), { type: o.objetType, id: o.objetId }));
  });
  r.get('/documents/:id/fichier', async (req, res) => {
    const id = uuid.parse(req.params.id);
    await droitSurDocument(req, id, 'CONSULTER');
    const l = await ecrire(req, q => lireDocument(q, req.acteur, id));
    res.type(l.type).set('Content-Disposition', `inline; filename="${l.document.type_document}-${id}.${l.document.fichier_ref.split('.').pop()}"`).send(l.contenu);
  });
  r.post('/documents/:id/impression', async (req, res) => {
    const id = uuid.parse(req.params.id);
    await droitSurDocument(req, id, 'CONSULTER');
    const l = await ecrire(req, q => imprimerDocument(q, req.acteur, id));
    res.type(l.type).set('Content-Disposition', `attachment; filename="copie-${id}.pdf"`).send(l.contenu);
  });
  r.get('/documents/:id/verification', async (req, res) => {
    const id = uuid.parse(req.params.id);
    await droitSurDocument(req, id, 'CONSULTER');
    res.json(await verifierDocument(getPool(), id));
  });
  /** Dépôt d'une pièce : corps binaire (PDF, JPEG, PNG), métadonnées en paramètres. */
  r.post('/pieces', express.raw({ type: ['application/pdf', 'image/jpeg', 'image/png', 'application/octet-stream'], limit: TAILLE_MAX_PIECE }), async (req, res) => {
    const m = z.object({ objetType: z.string(), objetId: uuid, typeDocument: z.string().min(1).max(40), dateExpiration: date.optional() }).parse(req.query);
    await droitSurObjet(req, m.objetType, 'MODIFIER');
    const contenu = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    res.status(201).json(await ecrire(req, q => deposerPiece(q, req.acteur, { typeDocument: m.typeDocument, objet: { type: m.objetType, id: m.objetId }, contenu, dateExpiration: m.dateExpiration })));
  });
  r.post('/documents/:id/lisibilite', async (req, res) => {
    const id = uuid.parse(req.params.id);
    await droitSurDocument(req, id, 'MODIFIER');
    const d = z.object({ lisible: z.boolean(), motif: z.string().optional() }).parse(req.body);
    await ecrire(req, q => controlerLisibilite(q, req.acteur, id, d.lisible, d.motif));
    res.status(204).end();
  });
  r.post('/modeles/:code/apercu', droit('MODELES', 'CONSULTER'), async (req, res) => {
    const d = z.object({ variables: z.record(z.string(), z.unknown()).default({}), date: date.optional() }).parse(req.body ?? {});
    res.type('application/pdf').send(await apercuModele(getPool(), req.params.code as string, d.variables, d.date));
  });

  // ---------------------------------------------------------------- Acceptation électronique (DIG-RG-002, 005)
  r.post('/documents/:id/acceptation/code', async (req, res) => {
    const id = uuid.parse(req.params.id);
    await droitSurDocument(req, id, 'MODIFIER');
    const { signataireId } = z.object({ signataireId: uuid }).parse(req.body);
    res.json(await ecrire(req, q => demanderAcceptation(q, req.acteur, id, signataireId)));
  });
  r.post('/documents/:id/acceptation', async (req, res) => {
    const id = uuid.parse(req.params.id);
    await droitSurDocument(req, id, 'MODIFIER');
    const d = z.object({ signataireId: uuid, code: z.string().regex(/^\d{6}$/) }).parse(req.body);
    res.status(201).json(leverRefus(await ecrire(req, q => confirmerAcceptation(q, req.acteur, { documentId: id, signataireId: d.signataireId, code: d.code, assiste: true }))));
  });
  r.post('/documents/:id/signature-manuscrite', async (req, res) => {
    const id = uuid.parse(req.params.id);
    await droitSurDocument(req, id, 'MODIFIER');
    const d = z.object({ signataireId: uuid, scanDocumentId: uuid }).parse(req.body);
    res.status(201).json(await ecrire(req, q => enregistrerSignatureManuscrite(q, req.acteur, { documentId: id, ...d })));
  });
  r.get('/documents/:id/preuves', async (req, res) => {
    const id = uuid.parse(req.params.id);
    await droitSurDocument(req, id, 'CONSULTER');
    res.json(await preuvesDuDocument(getPool(), id));
  });

  // ---------------------------------------------------------------- Réclamations (§ 8.10)
  r.get('/reclamations', droit('RECLAMATIONS', 'CONSULTER'), async (req, res) => {
    const f = z.object({
      statut: z.enum(['OUVERTE', 'AFFECTEE', 'EN_COURS', 'ESCALADEE', 'REPONDUE', 'CLOSE']).optional(), objet: z.enum(OBJETS_RECLAMATION).optional(),
      mes: z.enum(['0', '1']).optional(), enRetard: z.enum(['0', '1']).optional(),
    }).parse(req.query);
    res.json(await listerReclamations(getPool(), { statut: f.statut, objet: f.objet, gestionnaireId: f.mes === '1' ? req.acteur.utilisateurId! : undefined, enRetard: f.enRetard === '1' }));
  });
  r.get('/reclamations/indicateurs', droit('RECLAMATIONS', 'CONSULTER'), async (req, res) => {
    const f = z.object({ du: date.optional(), au: date.optional() }).parse(req.query);
    res.json(await indicateursReclamations(getPool(), f.du ?? `${aujourdhui().slice(0, 4)}-01-01`, f.au ?? aujourdhui()));
  });
  r.get('/reclamations/:id', droit('RECLAMATIONS', 'CONSULTER'), async (req, res) => {
    res.json(await lireReclamation(getPool(), uuid.parse(req.params.id)));
  });
  r.post('/reclamations', droit('RECLAMATIONS', 'CREER'), async (req, res) => {
    const d = z.object({
      tiersId: uuid, canal: z.enum(CANAUX), objet: z.enum(OBJETS_RECLAMATION), objetType: z.string().max(60).optional(), objetId: uuid.optional(),
      description: z.string().min(1).max(5000), dateReception: date.optional(),
    }).parse(req.body);
    res.status(201).json(await ecrire(req, q => enregistrerReclamation(q, req.acteur, d)));
  });
  r.post('/reclamations/:id/affectation', droit('RECLAMATIONS', 'MODIFIER'), async (req, res) => {
    const { gestionnaireId } = z.object({ gestionnaireId: uuid }).parse(req.body);
    await ecrire(req, q => affecterReclamation(q, req.acteur, uuid.parse(req.params.id), gestionnaireId));
    res.status(204).end();
  });
  r.post('/reclamations/:id/prise-en-charge', droit('RECLAMATIONS', 'MODIFIER'), async (req, res) => {
    await ecrire(req, q => prendreEnCharge(q, req.acteur, uuid.parse(req.params.id)));
    res.status(204).end();
  });
  r.post('/reclamations/:id/reponse', droit('RECLAMATIONS', 'MODIFIER'), async (req, res) => {
    const { reponse } = z.object({ reponse: z.string().min(1).max(10000) }).parse(req.body);
    await ecrire(req, q => repondreReclamation(q, req.acteur, uuid.parse(req.params.id), reponse));
    res.status(204).end();
  });
  r.post('/reclamations/:id/cloture', droit('RECLAMATIONS', 'MODIFIER'), async (req, res) => {
    await ecrire(req, q => cloreReclamation(q, req.acteur, uuid.parse(req.params.id)));
    res.status(204).end();
  });

  // ---------------------------------------------------------------- Motifs de blocage (§ 3.7)
  r.get('/motifs-blocage', droit('MOTIF_BLOCAGE', 'CONSULTER'), async (_req, res) => { res.json(await referentielMotifs(getPool())); });
  r.get('/tiers/:id/blocages', droit('MOTIF_BLOCAGE', 'CREER'), async (req, res) => {
    res.json(await vueMotifs(getPool(), uuid.parse(req.params.id), 'GESTIONNAIRE'));
  });
  r.post('/tiers/:id/blocages', droit('MOTIF_BLOCAGE', 'CREER'), async (req, res) => {
    const d = z.object({ code: z.string(), justification: z.string().min(1), carteId: uuid.optional() }).parse(req.body);
    const modules = (await profilsActifs(getPool(), req.acteur.utilisateurId!)).map(p => MODULE_DU_PROFIL[p.code]).filter(Boolean);
    const tiersId = uuid.parse(req.params.id);
    // Le premier module de l'utilisateur autorisé à déposer ce motif
    const ref = (await getPool().query<{ module_deposant: string }>('SELECT module_deposant FROM motif_blocage_ref WHERE code = $1', [d.code])).rows[0];
    const module = modules.find(m => ref?.module_deposant.split(',').includes(m!)) ?? modules[0];
    if (!module) throw new ErreurMetier('INTERDIT', 'Aucun de vos profils ne dépose de motif de blocage', 403);
    res.status(201).json({ id: await ecrire(req, q => deposerMotif(q, req.acteur, { code: d.code, justification: d.justification, module, ...(d.carteId ? { carteId: d.carteId } : { tiersId }) })) });
  });
  r.post('/blocages/:id/levee', droit('MOTIF_BLOCAGE', 'MODIFIER'), async (req, res) => {
    const { justification } = z.object({ justification: z.string().min(1) }).parse(req.body);
    await ecrire(req, q => leverMotif(q, req.acteur, uuid.parse(req.params.id), justification));
    res.status(204).end();
  });

  // ---------------------------------------------------------------- Exploitation : événements et traitements planifiés
  r.get('/exploitation/evenements/anomalies', droit('AUDIT', 'CONSULTER'), async (_req, res) => { res.json(await distributionsEnAnomalie()); });
  r.post('/exploitation/evenements/:id/relance', droit('AUDIT', 'CONSULTER'), async (req, res) => {
    await relancer(uuid.parse(req.params.id));
    res.status(204).end();
  });
  r.get('/exploitation/traitements', droit('AUDIT', 'CONSULTER'), (_req, res) => {
    res.json(TRAITEMENTS.map(t => ({ nom: t.nom, libelle: t.libelle, cron: t.cron })));
  });
  r.post('/exploitation/traitements/:nom', droit('PARAMETRES', 'CREER'), async (req, res) => {
    res.json({ resultat: await executerTraitement(req.params.nom as string) });
  });

  return r;
}
