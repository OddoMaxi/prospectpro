/**
 * Souscription en ligne (CDC § 8.11, AS-07) et corbeille de la cellule Canal digital (PR-02).
 *
 * - Parcours public : identification par téléphone vérifié par code ; une session propre au client (jeton signé de
 *   type EN_LIGNE, sans accès au back-office) lui donne accès à ses seuls dossiers en ligne.
 * - Confirmation de paiement par l'opérateur : signée (HMAC-SHA256 du corps avec le secret partagé). En développement
 *   et en recette, un paiement simulé remplace l'interface de l'opérateur.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import express, { Router, type NextFunction, type Request, type Response } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { getPool } from '../db/pool.js';
import { ErreurMetier } from '../noyau/erreurs.js';
import { Refus, type ContexteAuth } from '../modules/auth/service.js';
import type { Config } from '../config.js';
import { deposerPiece, lireDocument, TAILLE_MAX_PIECE } from '../moteurs/documents.js';
import { accepterRecapitulatif, controlerDossier, presenterRecapitulatif, tarifierDossier, enregistrerDonnees } from '../modules/production/dossiers.js';
import { emettre } from '../modules/production/emission.js';
import {
  canalDigital, confirmerIdentification, confirmerPaiement, controlerPersonnesDuDossier, corbeilleCellule, declarerPersonne, demanderPaiement, dossierDuClient,
  espaceClient, identifier, installerCanalDigital, offre, operateurs, ouvrirDossierEnLigne, rejeterDossierEnLigne,
} from '../modules/production/enLigne.js';
import { cartesDuClient, declarerGroupeSanguin, declarerPerte, demanderCartePhysique, exigerCarteDuClient } from '../modules/sante/cartes.js';
import { droit, ecrire } from './socle.js';

const uuid = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const DUREE_SESSION = 2 * 3600;
declare module 'express-serve-static-core' { interface Request { clientEnLigne?: string } }

function sessionEnLigne(ctx: ContexteAuth) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const h = req.get('authorization');
    if (!h?.startsWith('Bearer ')) return next(new ErreurMetier('NON_AUTHENTIFIE', 'Identifiez-vous pour poursuivre la souscription', 401));
    try {
      const p = jwt.verify(h.slice(7), ctx.jwtSecret) as { type?: string; tiers?: string };
      if (p.type !== 'EN_LIGNE' || !p.tiers) throw new Error();
      req.clientEnLigne = p.tiers;
      next();
    } catch { next(new ErreurMetier('SESSION_INVALIDE', 'Session expirée : identifiez-vous de nouveau', 401)); }
  };
}

export function routesEnLignePubliques(ctx: ContexteAuth, config: Config): Router {
  const r = Router();
  const P = '/public/en-ligne';
  r.get(`${P}/offre`, async (_req, res) => { res.json({ formules: await offre(getPool()), operateurs: await operateurs(getPool()), canal: await canalDigital(getPool()).then(() => true, () => false) }); });
  r.post(`${P}/identification`, async (req, res) => {
    const d = z.object({ nom: z.string().min(1).max(100), prenoms: z.string().min(1).max(150), dateNaissance: date, telephone: z.string().min(8).max(20), sexe: z.enum(['M', 'F']).optional() }).parse(req.body);
    const x = await ecrire(req, q => identifier(q, req.acteur, d));
    res.status(201).json({ tiersId: x.tiersId });
  });
  r.post(`${P}/verification`, async (req, res) => {
    const d = z.object({ tiersId: uuid, code: z.string().regex(/^\d{6}$/) }).parse(req.body);
    const x = await ecrire(req, q => confirmerIdentification(q, req.acteur, d.tiersId, d.code));
    if (x instanceof Refus) throw x.erreur;
    res.json({ jeton: jwt.sign({ type: 'EN_LIGNE', tiers: x.tiersId }, ctx.jwtSecret, { expiresIn: DUREE_SESSION }), nom: x.nom });
  });

  // Confirmation de l'opérateur de monnaie électronique (rappel signé)
  r.post('/public/paiements/operateur', express.raw({ type: '*/*', limit: '64kb' }), async (req, res) => {
    if (!config.PAIEMENT_OPERATEUR_SECRET) throw new ErreurMetier('INTERFACE_INACTIVE', 'Interface de l\'opérateur non configurée', 503);
    const corps = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
    const attendue = createHmac('sha256', config.PAIEMENT_OPERATEUR_SECRET).update(corps).digest('hex');
    const recue = String(req.get('x-signature') ?? '');
    if (recue.length !== attendue.length || !timingSafeEqual(Buffer.from(recue), Buffer.from(attendue))) throw new ErreurMetier('SIGNATURE_INVALIDE', 'Signature invalide', 401);
    const d = z.object({ reference: z.string().min(1), operateur: z.string(), montant: z.number().int().positive(), referenceExterne: z.string().min(1).max(80) }).parse(JSON.parse(corps.toString('utf8')));
    res.json(await ecrire(req, q => confirmerPaiement(q, req.acteur, d)));
  });

  const s = Router();
  s.use(sessionEnLigne(ctx));
  s.get(`/moi`, async (req, res) => { res.json(await espaceClient(getPool(), req.clientEnLigne!)); });
  s.post(`/dossiers`, async (req, res) => {
    const d = z.object({ formuleId: uuid, codePrescripteur: z.string().max(20).optional() }).parse(req.body);
    res.status(201).json(await ecrire(req, q => ouvrirDossierEnLigne(q, req.acteur, req.clientEnLigne!, d)));
  });
  s.get(`/dossiers/:id`, async (req, res) => {
    const d = await dossierDuClient(getPool(), req.clientEnLigne!, uuid.parse(req.params.id));
    const ids = [...new Set([d.souscripteur_id, ...d.donnees.assures.map(a => a.tiersId), ...(d.donnees.beneficiaires?.liste ?? []).map(b => b.tiersId)])];
    const personnes = (await getPool().query(`SELECT id, nom, prenoms, date_naissance::text AS date_naissance FROM tiers WHERE id = ANY($1)`, [ids])).rows;
    const f = (await getPool().query(`SELECT f.libelle AS formule, f.composition, p.libelle AS produit, p.documents_exiges FROM formule f JOIN produit p ON p.id = f.produit_id WHERE f.id = $1`, [d.formule_id])).rows[0];
    const code = d.code_prescripteur_id ? (await getPool().query('SELECT code FROM code_prescripteur WHERE id = $1', [d.code_prescripteur_id])).rows[0]?.code : null;
    res.json({ id: d.id, numero: d.numero_dossier, statut: d.statut, etape: d.etape_courante, donnees: d.donnees, primeNette: d.prime_nette, accessoires: d.accessoires, taxes: d.taxes,
      primeTotale: d.prime_totale, accepte: !!d.acceptation_preuve_id, motifRejet: d.motif_rejet, expireLe: d.expire_le, personnes, ...f, codePrescripteur: code,
      anomalies: d.statut === 'BROUILLON' ? await controlerDossier(getPool(), d) : [] });
  });
  s.post(`/dossiers/:id/personnes`, async (req, res) => {
    const d = z.object({ nom: z.string().min(1).max(100), prenoms: z.string().min(1).max(150), dateNaissance: date, sexe: z.enum(['M', 'F']).optional() }).parse(req.body);
    res.status(201).json(await ecrire(req, q => declarerPersonne(q, req.acteur, req.clientEnLigne!, uuid.parse(req.params.id), d)));
  });
  s.put(`/dossiers/:id/donnees`, async (req, res) => {
    const id = uuid.parse(req.params.id);
    const { donnees, etape } = z.object({ donnees: z.unknown(), etape: z.number().int().min(3).max(5) }).parse(req.body);
    await ecrire(req, async q => {
      const d = await dossierDuClient(q, req.clientEnLigne!, id, true);
      if (d.statut !== 'BROUILLON') throw new ErreurMetier('DOSSIER_CLOS', 'Dossier payé ou clos : il n\'est plus modifiable', 409);
      await enregistrerDonnees(q, req.acteur, id, await controlerPersonnesDuDossier(q, req.clientEnLigne!, id, donnees), etape);
    });
    res.status(204).end();
  });
  s.post(`/dossiers/:id/pieces`, express.raw({ type: ['application/pdf', 'image/jpeg', 'image/png', 'application/octet-stream'], limit: TAILLE_MAX_PIECE }), async (req, res) => {
    const id = uuid.parse(req.params.id);
    const m = z.object({ typeDocument: z.string().min(1).max(40) }).parse(req.query);
    const contenu = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    res.status(201).json(await ecrire(req, async q => {
      await dossierDuClient(q, req.clientEnLigne!, id);
      return deposerPiece(q, req.acteur, { typeDocument: m.typeDocument, objet: { type: 'dossier_souscription', id }, contenu });
    }));
  });
  s.post(`/dossiers/:id/tarif`, async (req, res) => {
    const id = uuid.parse(req.params.id);
    res.json(await ecrire(req, async q => { await dossierDuClient(q, req.clientEnLigne!, id); return tarifierDossier(q, req.acteur, id); }));
  });
  s.post(`/dossiers/:id/recapitulatif`, async (req, res) => {
    const id = uuid.parse(req.params.id);
    res.status(201).json(await ecrire(req, async q => { await dossierDuClient(q, req.clientEnLigne!, id); return presenterRecapitulatif(q, req.acteur, id); }));
  });
  s.get(`/dossiers/:id/documents/:doc`, async (req, res) => {
    const id = uuid.parse(req.params.id), doc = uuid.parse(req.params.doc);
    const l = await ecrire(req, async q => {
      await dossierDuClient(q, req.clientEnLigne!, id);
      const ok = await q.query(`SELECT 1 FROM document WHERE id = $1 AND objet_type = 'dossier_souscription' AND objet_id = $2`, [doc, id]);
      if (!ok.rowCount) throw new ErreurMetier('NON_TROUVE', 'Document introuvable', 404);
      return lireDocument(q, req.acteur, doc);
    });
    res.type(l.type).set('Content-Disposition', `inline; filename="${l.document.type_document}.pdf"`).send(l.contenu);
  });
  s.post(`/dossiers/:id/acceptation`, async (req, res) => {
    const id = uuid.parse(req.params.id);
    const d = z.object({ documentId: uuid, code: z.string().regex(/^\d{6}$/) }).parse(req.body);
    const x = await ecrire(req, async q => { await dossierDuClient(q, req.clientEnLigne!, id); return accepterRecapitulatif(q, req.acteur, id, d.documentId, d.code); });
    if (x instanceof Refus) throw x.erreur;
    res.json({ accepte: true });
  });
  s.post(`/dossiers/:id/paiement`, async (req, res) => {
    const d = z.object({ operateur: z.string(), telephone: z.string().min(8).max(20) }).parse(req.body);
    res.json(await demanderPaiement(getPool(), req.clientEnLigne!, uuid.parse(req.params.id), d));
  });
  // Cartes numériques (AS-02) : perte ou vol, carte physique sur demande (frais éventuels réglés au bureau), groupe sanguin
  s.get('/cartes', async (req, res) => { res.json(await cartesDuClient(getPool(), req.clientEnLigne!)); });
  s.post('/cartes/:id/perte', async (req, res) => {
    const id = uuid.parse(req.params.id);
    const { motif } = z.object({ motif: z.enum(['PERTE', 'VOL']) }).parse(req.body);
    res.json(await ecrire(req, async q => { await exigerCarteDuClient(q, req.clientEnLigne!, id); return declarerPerte(q, req.acteur, id, motif); }));
  });
  s.post('/cartes/:id/physique', async (req, res) => {
    const id = uuid.parse(req.params.id);
    const d = z.object({ lieu: z.enum(['BUREAU', 'SIEGE', 'LIVRAISON']), bureauId: uuid.optional(), adresse: z.string().max(300).optional() }).parse(req.body);
    res.json(await ecrire(req, async q => { await exigerCarteDuClient(q, req.clientEnLigne!, id); return demanderCartePhysique(q, req.acteur, id, d); }));
  });
  s.post('/cartes/:id/groupe-sanguin', async (req, res) => {
    const id = uuid.parse(req.params.id);
    const d = z.object({ groupe: z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']).nullable(), consentementImpression: z.boolean() }).parse(req.body);
    await ecrire(req, async q => { await exigerCarteDuClient(q, req.clientEnLigne!, id); await declarerGroupeSanguin(q, req.acteur, id, d); });
    res.status(204).end();
  });
  // Paiement simulé (hors production) : tient lieu de confirmation de l'opérateur pour les essais
  if (config.NODE_ENV !== 'production') {
    s.post(`/dossiers/:id/paiement/simulation`, async (req, res) => {
      const d = z.object({ operateur: z.string(), telephone: z.string().min(8).max(20) }).parse(req.body);
      const p = await demanderPaiement(getPool(), req.clientEnLigne!, uuid.parse(req.params.id), d);
      res.json(await ecrire(req, q => confirmerPaiement(q, req.acteur, { reference: p.reference, operateur: p.operateur, montant: p.montant!, referenceExterne: `SIM-${Date.now()}` })));
    });
  }
  r.use(P, s);
  return r;
}

/** Corbeille de la cellule Canal digital (back-office). */
export function routesCanalDigital(): Router {
  const r = Router();
  r.get('/canal-digital', droit('SOUSCRIPTION_EN_LIGNE', 'CONSULTER'), async (_req, res) => {
    res.json({ canal: await canalDigital(getPool()).catch(() => null), dossiers: await corbeilleCellule(getPool()) });
  });
  r.post('/canal-digital', droit('SOUSCRIPTION_EN_LIGNE', 'VALIDER'), async (req, res) => {
    const d = z.object({ code: z.string().optional(), nom: z.string().min(1).max(120), adresse: z.string().min(1).max(300) }).parse(req.body);
    res.status(201).json(await ecrire(req, q => installerCanalDigital(q, req.acteur, d)));
  });
  r.post('/canal-digital/dossiers/:id/emission', droit('SOUSCRIPTION_EN_LIGNE', 'CREER'), async (req, res) => {
    res.status(201).json(await ecrire(req, q => emettre(q, req.acteur, uuid.parse(req.params.id))));
  });
  r.post('/canal-digital/dossiers/:id/rejet', droit('SOUSCRIPTION_EN_LIGNE', 'CREER'), async (req, res) => {
    const { motif } = z.object({ motif: z.string().min(1).max(300) }).parse(req.body);
    res.json(await ecrire(req, q => rejeterDossierEnLigne(q, req.acteur, uuid.parse(req.params.id), motif)));
  });
  return r;
}
