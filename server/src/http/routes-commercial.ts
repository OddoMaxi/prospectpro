/** Commercial (CDC chapitre 7, sous-lot 2.2) : intervenants, gestion des bureaux, comptes de production, banques et opérateurs. */
import { Router, type Request } from 'express';
import { z } from 'zod';
import { getPool } from '../db/pool.js';
import { ErreurMetier } from '../noyau/erreurs.js';
import {
  activerEmission, affecterBureau, changerStatutIntervenant, conditionsEmission, creerIntervenant, enregistrerTraite, listerIntervenants, proposerAgrement, validerControlesJunior,
} from '../modules/commercial/intervenants.js';
import {
  confirmerApprovisionnement, controlerCollectif, declarerApprovisionnement, definirSeuilAlerte, demanderRestitution, executerRestitution, lireCompteProduction,
  listerComptesProduction, recevableA, rejeterApprovisionnement, releve,
} from '../modules/commercial/comptesProduction.js';
import { creerBanqueOperateur, listerBanquesOperateurs } from '../modules/finances/tresorerie.js';
import { droit, ecrire } from './socle.js';

const uuid = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/**
 * Bureaux visibles : ceux du périmètre de l'utilisateur ; pour un agent général, ceux qu'il gère.
 * null = toute la Compagnie.
 */
async function bureauxVisibles(req: Request): Promise<string[] | null> {
  const gere = await getPool().query<{ code: string }>(
    `SELECT b.code FROM utilisateur u JOIN intervenant i ON i.tiers_id = u.tiers_id AND i.role = 'AGENT_GENERAL' AND i.statut <> 'SORTI'
       JOIN bureau_gestionnaire g ON g.intervenant_id = i.id AND g.date_fin IS NULL AND g.supprime_le IS NULL JOIN bureau b ON b.id = g.bureau_id
      WHERE u.id = $1`, [req.acteur.utilisateurId]);
  if (gere.rowCount) return gere.rows.map(r => r.code);
  return req.perimetre?.bureaux?.length ? req.perimetre.bureaux : null;
}
async function exigerCompteVisible(req: Request, compteId: string) {
  const visibles = await bureauxVisibles(req);
  const cp = await lireCompteProduction(getPool(), compteId);
  if (visibles && !visibles.includes(cp.bureau)) throw new ErreurMetier('NON_TROUVE', 'Compte de production introuvable', 404);
  return cp;
}

export function routesCommercial(): Router {
  const r = Router();

  // ---------------------------------------------------------------- Intervenants (CM-01)
  r.get('/intervenants', droit('AGREMENT', 'CONSULTER'), async (req, res) => {
    const f = z.object({ role: z.string().optional(), statut: z.string().optional() }).parse(req.query);
    res.json(await listerIntervenants(getPool(), f));
  });
  r.post('/intervenants', droit('AGREMENT', 'CREER'), async (req, res) => {
    const d = z.object({ tiersId: uuid, role: z.enum(['AGENT_GENERAL', 'COLLABORATEUR', 'JUNIOR', 'PRESCRIPTEUR', 'CANAL_DIGITAL']), rattachementId: uuid.optional(), numeroInscription: z.string().max(60).optional(), dateEntree: date.optional() }).parse(req.body);
    res.status(201).json({ id: await ecrire(req, q => creerIntervenant(q, req.acteur, d)) });
  });
  r.post('/intervenants/:id/traite', droit('AGREMENT', 'CREER'), async (req, res) => {
    const { documentId } = z.object({ documentId: uuid }).parse(req.body);
    await ecrire(req, q => enregistrerTraite(q, req.acteur, uuid.parse(req.params.id), documentId));
    res.status(204).end();
  });
  r.post('/intervenants/:id/agrement', droit('AGREMENT', 'CREER'), async (req, res) => {
    res.status(201).json(await ecrire(req, q => proposerAgrement(q, req.acteur, uuid.parse(req.params.id))));
  });
  r.post('/intervenants/:id/controles-conformite', droit('COMPTES_RESEAU', 'VALIDER'), async (req, res) => {
    await ecrire(req, q => validerControlesJunior(q, req.acteur, uuid.parse(req.params.id)));
    res.status(204).end();
  });
  r.get('/intervenants/:id/conditions-emission', droit('AGREMENT', 'CONSULTER'), async (req, res) => {
    res.json({ manques: await conditionsEmission(getPool(), uuid.parse(req.params.id)) });
  });
  r.post('/intervenants/:id/emission', droit('AGREMENT', 'CREER'), async (req, res) => {
    await ecrire(req, q => activerEmission(q, req.acteur, uuid.parse(req.params.id)));
    res.status(204).end();
  });
  r.post('/intervenants/:id/statut', droit('AGREMENT', 'CREER'), async (req, res) => {
    const d = z.object({ statut: z.enum(['SUSPENDU', 'SORTI', 'ACTIF']), motif: z.string().min(1) }).parse(req.body);
    await ecrire(req, q => changerStatutIntervenant(q, req.acteur, uuid.parse(req.params.id), d.statut, d.motif));
    res.status(204).end();
  });
  r.post('/bureaux/:id/gestionnaire', droit('BUREAUX', 'PARAMETRER'), async (req, res) => {
    const d = z.object({ intervenantId: uuid, dateDebut: date.optional() }).parse(req.body);
    await ecrire(req, q => affecterBureau(q, req.acteur, { ...d, bureauId: uuid.parse(req.params.id) }));
    res.status(204).end();
  });

  // ---------------------------------------------------------------- Comptes de production (CM-02, AG-11 à 13, AG-18)
  r.get('/comptes-production', droit('COMPTE_PRODUCTION', 'CONSULTER'), async (req, res) => {
    res.json(await listerComptesProduction(getPool(), await bureauxVisibles(req)));
  });
  r.get('/comptes-production/controle', droit('JOURNAUX_TIERS', 'CONSULTER'), async (_req, res) => { res.json(await controlerCollectif(getPool())); });
  r.get('/comptes-production/:id', droit('COMPTE_PRODUCTION', 'CONSULTER'), async (req, res) => {
    const cp = await exigerCompteVisible(req, uuid.parse(req.params.id));
    const approvisionnements = (await getPool().query(
      `SELECT id, numero_recu, moyen, montant, reference_externe, statut, confirme_le, motif_rejet, cree_le FROM approvisionnement_compte WHERE compte_production_id = $1 ORDER BY cree_le DESC LIMIT 50`, [cp.id])).rows;
    const restitutions = (await getPool().query(
      `SELECT id, date_heure_demande, motif, solde_fige, montant_restitue, statut, suite FROM demande_restitution WHERE compte_production_id = $1 ORDER BY date_heure_demande DESC`, [cp.id])).rows;
    res.json({ ...cp, mouvements: await releve(getPool(), cp.id), approvisionnements, restitutions, restitutionRecevableA: await recevableA(getPool(), cp.id) });
  });
  r.post('/comptes-production/:id/approvisionnements', droit('COMPTE_PRODUCTION', 'CREER'), async (req, res) => {
    const id = uuid.parse(req.params.id);
    await exigerCompteVisible(req, id);
    const d = z.object({ moyen: z.enum(['ESPECES_SIEGE', 'BANQUE', 'MONNAIE_ELECTRONIQUE']), montant: z.number().int().positive(), banque: z.string().optional(), referenceExterne: z.string().max(60).optional() }).parse(req.body);
    res.status(201).json(await ecrire(req, q => declarerApprovisionnement(q, req.acteur, { ...d, compteId: id })));
  });
  /** Confirmation par la Trésorerie au vu du relevé (banque), ou par la notification de l'opérateur. */
  r.post('/approvisionnements/:id/confirmation', droit('COMPTE_PRODUCTION', 'CREER'), async (req, res) => {
    res.json(await ecrire(req, q => confirmerApprovisionnement(q, req.acteur, uuid.parse(req.params.id))));
  });
  r.post('/approvisionnements/:id/rejet', droit('COMPTE_PRODUCTION', 'CREER'), async (req, res) => {
    const { motif } = z.object({ motif: z.string().min(1) }).parse(req.body);
    await ecrire(req, q => rejeterApprovisionnement(q, req.acteur, uuid.parse(req.params.id), motif));
    res.status(204).end();
  });
  r.put('/comptes-production/:id/seuil-alerte', droit('COMPTE_PRODUCTION', 'CREER'), async (req, res) => {
    const id = uuid.parse(req.params.id);
    await exigerCompteVisible(req, id);
    const { seuil } = z.object({ seuil: z.number().int().nonnegative().nullable() }).parse(req.body);
    await ecrire(req, q => definirSeuilAlerte(q, req.acteur, id, seuil));
    res.status(204).end();
  });
  r.post('/comptes-production/:id/restitution', droit('RESTITUTION', 'CREER'), async (req, res) => {
    const id = uuid.parse(req.params.id);
    await exigerCompteVisible(req, id);
    const d = z.object({ motif: z.enum(['FIN_ACTIVITE', 'DEMANDE_MOTIVEE']), justification: z.string().max(2000).optional(), coordonneePaiementId: uuid, justificatifDocumentId: uuid.optional() }).parse(req.body);
    res.status(201).json(await ecrire(req, q => demanderRestitution(q, req.acteur, { ...d, compteId: id })));
  });
  r.post('/restitutions/:id/paiement', droit('RESTITUTION', 'CREER'), async (req, res) => {
    const d = z.object({ pieceDocumentId: uuid, banque: z.string() }).parse(req.body);
    await ecrire(req, q => executerRestitution(q, req.acteur, uuid.parse(req.params.id), d));
    res.status(204).end();
  });

  // ---------------------------------------------------------------- Banques et opérateurs (FI-06)
  r.get('/banques-operateurs', droit('COMPTE_PRODUCTION', 'CONSULTER'), async (_req, res) => { res.json(await listerBanquesOperateurs(getPool())); });
  r.post('/banques-operateurs', droit('PLAN_COMPTES', 'PARAMETRER'), async (req, res) => {
    const d = z.object({ code: z.string(), nom: z.string().min(1).max(120), type: z.enum(['BANQUE', 'MONNAIE_ELECTRONIQUE']), compteNumero: z.string(), responsableId: uuid }).parse(req.body);
    res.status(201).json({ id: await ecrire(req, q => creerBanqueOperateur(q, req.acteur, d)) });
  });
  return r;
}
