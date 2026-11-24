/** Production (CDC chapitre 8, sous-lot 2.3) : dossiers de souscription, émission, polices, annulation pour erreur. */
import { Router, type Request } from 'express';
import { z } from 'zod';
import { getPool } from '../db/pool.js';
import { ErreurMetier } from '../noyau/erreurs.js';
import { Refus } from '../modules/auth/service.js';
import {
  accepterRecapitulatif, controlerDossier, enregistrerDonnees, lireDossier, listerDossiers, ouvrirDossier, presenterRecapitulatif, rejeterDossier, soumettreDossier, tarifierDossier,
} from '../modules/production/dossiers.js';
import { emettre, lirePolice, proposerAnnulationErreur, rechercherPolices } from '../modules/production/emission.js';
import { demanderNonRenouvellement, disponibleVersements, lirePoliceVie, policesARenouveler, primeRenouvellement, recevoirVersement, rembourserVersements, renouveler } from '../modules/production/renouvellement.js';
import { ajouterJours, aujourdhui } from '../noyau/dates.js';
import { droit, ecrire } from './socle.js';

const uuid = z.string().uuid();

/** Bureaux visibles : bureaux gérés (agent général et son réseau), sinon périmètre ; null = toute la Compagnie. */
async function bureauxVisibles(req: Request): Promise<string[] | null> {
  const r = await getPool().query<{ code: string }>(
    `SELECT DISTINCT b.code FROM utilisateur u JOIN intervenant i ON i.tiers_id = u.tiers_id AND i.statut <> 'SORTI'
       JOIN bureau_gestionnaire g ON g.intervenant_id = COALESCE(i.rattachement_id, i.id) AND g.date_fin IS NULL AND g.supprime_le IS NULL JOIN bureau b ON b.id = g.bureau_id
      WHERE u.id = $1`, [req.acteur.utilisateurId]);
  if (r.rowCount) return r.rows.map(x => x.code);
  return req.perimetre?.bureaux?.length ? req.perimetre.bureaux : null;
}
async function exigerDossierVisible(req: Request, id: string) {
  const d = await lireDossier(getPool(), id);
  const b = (await getPool().query<{ code: string }>('SELECT code FROM bureau WHERE id = $1', [d.bureau_id])).rows[0]!.code;
  const v = await bureauxVisibles(req);
  if (v && !v.includes(b)) throw new ErreurMetier('NON_TROUVE', 'Dossier introuvable', 404);
  return d;
}

export function routesProduction(): Router {
  const r = Router();

  r.get('/dossiers', droit('SOUSCRIPTION', 'CONSULTER'), async (req, res) => {
    const f = z.object({ statut: z.string().optional() }).parse(req.query);
    res.json(await listerDossiers(getPool(), { statut: f.statut, bureaux: await bureauxVisibles(req) }));
  });
  r.post('/dossiers', droit('SOUSCRIPTION', 'CREER'), async (req, res) => {
    const d = z.object({ souscripteurId: uuid, formuleId: uuid, bureauId: uuid }).parse(req.body);
    res.status(201).json(await ecrire(req, q => ouvrirDossier(q, req.acteur, d)));
  });
  r.get('/dossiers/:id', droit('SOUSCRIPTION', 'CONSULTER'), async (req, res) => {
    const d = await exigerDossierVisible(req, uuid.parse(req.params.id));
    res.json({ ...d, anomalies: await controlerDossier(getPool(), d) });
  });
  r.put('/dossiers/:id/donnees', droit('SOUSCRIPTION', 'CREER'), async (req, res) => {
    const id = uuid.parse(req.params.id);
    await exigerDossierVisible(req, id);
    const { donnees, etape } = z.object({ donnees: z.unknown(), etape: z.number().int().min(3).max(5) }).parse(req.body);
    await ecrire(req, q => enregistrerDonnees(q, req.acteur, id, donnees, etape));
    res.status(204).end();
  });
  r.post('/dossiers/:id/tarification', droit('SOUSCRIPTION', 'CREER'), async (req, res) => {
    const id = uuid.parse(req.params.id);
    await exigerDossierVisible(req, id);
    res.json(await ecrire(req, q => tarifierDossier(q, req.acteur, id)));
  });
  r.post('/dossiers/:id/recapitulatif', droit('SOUSCRIPTION', 'CREER'), async (req, res) => {
    const id = uuid.parse(req.params.id);
    await exigerDossierVisible(req, id);
    res.json(await ecrire(req, q => presenterRecapitulatif(q, req.acteur, id)));
  });
  r.post('/dossiers/:id/acceptation', droit('SOUSCRIPTION', 'CREER'), async (req, res) => {
    const id = uuid.parse(req.params.id);
    await exigerDossierVisible(req, id);
    const d = z.object({ documentId: uuid, code: z.string().regex(/^\d{6}$/) }).parse(req.body);
    const x = await ecrire(req, q => accepterRecapitulatif(q, req.acteur, id, d.documentId, d.code));
    if (x instanceof Refus) throw x.erreur;
    res.json(x);
  });
  r.post('/dossiers/:id/soumission', droit('SOUSCRIPTION', 'CREER'), async (req, res) => {
    const id = uuid.parse(req.params.id);
    await exigerDossierVisible(req, id);
    await ecrire(req, q => soumettreDossier(q, req.acteur, id));
    res.status(204).end();
  });
  r.post('/dossiers/:id/rejet', droit('SOUSCRIPTION', 'CREER'), async (req, res) => {
    const id = uuid.parse(req.params.id);
    await exigerDossierVisible(req, id);
    const { motif } = z.object({ motif: z.string().min(1) }).parse(req.body);
    await ecrire(req, q => rejeterDossier(q, req.acteur, id, motif));
    res.status(204).end();
  });
  r.post('/dossiers/:id/emission', droit('SOUSCRIPTION', 'CREER'), async (req, res) => {
    const id = uuid.parse(req.params.id);
    await exigerDossierVisible(req, id);
    res.status(201).json(await ecrire(req, q => emettre(q, req.acteur, id)));
  });

  r.get('/polices', droit('SOUSCRIPTION', 'CONSULTER'), async (req, res) => {
    const f = z.object({ recherche: z.string().max(60).optional(), statut: z.string().optional() }).parse(req.query);
    res.json(await rechercherPolices(getPool(), { ...f, bureaux: await bureauxVisibles(req) }));
  });
  r.get('/polices/:id', droit('SOUSCRIPTION', 'CONSULTER'), async (req, res) => {
    const p = await lirePolice(getPool(), uuid.parse(req.params.id));
    const v = await bureauxVisibles(req);
    if (v && !v.includes(p.bureau)) throw new ErreurMetier('NON_TROUVE', 'Police introuvable', 404);
    res.json(p);
  });
  r.post('/polices/:id/annulation-erreur', droit('ANNULATION_ERREUR', 'CREER'), async (req, res) => {
    const { motif } = z.object({ motif: z.string().min(1) }).parse(req.body);
    res.status(201).json(await ecrire(req, q => proposerAnnulationErreur(q, req.acteur, uuid.parse(req.params.id), motif)));
  });
  // ---------------------------------------------------------------- Renouvellement et versements (PR-03, AS-06)
  r.get('/polices-a-renouveler', droit('SOUSCRIPTION', 'CONSULTER'), async (req, res) => {
    const { jours } = z.object({ jours: z.coerce.number().int().min(1).max(120).default(45) }).parse(req.query);
    res.json(await policesARenouveler(getPool(), await bureauxVisibles(req), jours));
  });
  r.get('/polices/:id/renouvellement', droit('SOUSCRIPTION', 'CONSULTER'), async (req, res) => {
    const p = await lirePoliceVie(getPool(), uuid.parse(req.params.id));
    const debut = p.statut === 'ACTIVE' ? ajouterJours(p.echeance, 1) : aujourdhui();
    const { tarif } = await primeRenouvellement(getPool(), p, debut);
    res.json({ echeance: p.echeance, dateDebut: debut, tarif, versements: await disponibleVersements(getPool(), p.id), statut: p.statut, nePasRenouveler: p.ne_pas_renouveler });
  });
  r.post('/polices/:id/renouvellement', droit('SOUSCRIPTION', 'CREER'), async (req, res) => {
    const mode = z.discriminatedUnion('type', [
      z.object({ type: z.literal('COMPTE_PRODUCTION') }),
      z.object({ type: z.literal('PAIEMENT_DIRECT'), moyen: z.enum(['ESPECES_SIEGE', 'BANQUE', 'MONNAIE_ELECTRONIQUE']), banque: z.string().optional(), reference: z.string().max(60).optional() }),
      z.object({ type: z.literal('VERSEMENTS') }),
    ]).parse(req.body);
    res.status(201).json(await ecrire(req, q => renouveler(q, req.acteur, uuid.parse(req.params.id), mode)));
  });
  r.post('/polices/:id/non-renouvellement', droit('SOUSCRIPTION', 'CREER'), async (req, res) => {
    const { motif } = z.object({ motif: z.string().min(1) }).parse(req.body);
    await ecrire(req, q => demanderNonRenouvellement(q, req.acteur, uuid.parse(req.params.id), motif));
    res.status(204).end();
  });
  r.post('/polices/:id/versements', droit('SOUSCRIPTION', 'CREER'), async (req, res) => {
    const d = z.object({ montant: z.number().int().positive(), moyen: z.enum(['MONNAIE_ELECTRONIQUE', 'BUREAU']), banque: z.string().optional(), reference: z.string().max(60).optional() }).parse(req.body);
    res.status(201).json(await ecrire(req, q => recevoirVersement(q, req.acteur, { ...d, policeId: uuid.parse(req.params.id) })));
  });
  r.post('/polices/:id/versements/remboursement', droit('PAIEMENT', 'CREER'), async (req, res) => {
    const d = z.object({ banque: z.string(), pieceDocumentId: uuid }).parse(req.body);
    res.json(await ecrire(req, q => rembourserVersements(q, req.acteur, uuid.parse(req.params.id), d)));
  });
  return r;
}
