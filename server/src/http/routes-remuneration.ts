/** Rémunération et paiements (sous-lot 2.5) : factures de commissions, mandats d'affectation, ordres de paiement. */
import { Router } from 'express';
import { z } from 'zod';
import { getPool } from '../db/pool.js';
import { Refus } from '../modules/auth/service.js';
import {
  confirmerEmission, contesterFacture, creerMandat, demanderEmission, deposerFacture, etablirFactures, listerFactures, payerFacture, revoquerMandat,
} from '../modules/commercial/factures.js';
import { executerOrdre, listerOrdres } from '../modules/finances/paiements.js';
import { droit, ecrire } from './socle.js';

const uuid = z.string().uuid();

export function routesRemuneration(): Router {
  const r = Router();
  /** Le commercial ne voit que ses factures ; la Direction commerciale et la Trésorerie, toutes. */
  r.get('/factures-commissions', droit('FACTURE_COMMISSION', 'CONSULTER'), async (req, res) => {
    const f = z.object({ statut: z.string().optional(), mois: z.string().optional() }).parse(req.query);
    const moi = (await getPool().query<{ id: string }>(`SELECT i.id FROM utilisateur u JOIN intervenant i ON i.tiers_id = u.tiers_id WHERE u.id = $1 AND i.statut <> 'SORTI' LIMIT 1`, [req.acteur.utilisateurId])).rows[0];
    res.json(await listerFactures(getPool(), { ...f, intervenantId: moi?.id }));
  });
  r.post('/factures-commissions/etablissement', droit('FACTURE_COMMISSION', 'CREER'), async (req, res) => {
    const { mois } = z.object({ mois: z.string() }).parse(req.body);
    res.status(201).json(await ecrire(req, q => etablirFactures(q, req.acteur, mois)));
  });
  r.post('/factures-commissions/:id/code-emission', droit('FACTURE_COMMISSION', 'CONSULTER'), async (req, res) => {
    res.json(await ecrire(req, q => demanderEmission(q, req.acteur, uuid.parse(req.params.id))));
  });
  r.post('/factures-commissions/:id/emission', droit('FACTURE_COMMISSION', 'CONSULTER'), async (req, res) => {
    const { code } = z.object({ code: z.string().regex(/^\d{6}$/) }).parse(req.body);
    const x = await ecrire(req, q => confirmerEmission(q, req.acteur, uuid.parse(req.params.id), code));
    if (x instanceof Refus) throw x.erreur;
    res.json(x);
  });
  r.post('/factures-commissions/:id/depot', droit('FACTURE_COMMISSION', 'CONSULTER'), async (req, res) => {
    const d = z.object({ documentId: uuid, reference: z.string(), montantNet: z.number().int() }).parse(req.body);
    res.json(await ecrire(req, q => deposerFacture(q, req.acteur, uuid.parse(req.params.id), d)));
  });
  r.post('/factures-commissions/:id/contestation', droit('FACTURE_COMMISSION', 'CONSULTER'), async (req, res) => {
    const { motif } = z.object({ motif: z.string().min(1) }).parse(req.body);
    await ecrire(req, q => contesterFacture(q, req.acteur, uuid.parse(req.params.id), motif));
    res.status(204).end();
  });
  r.post('/factures-commissions/:id/paiements', droit('FACTURE_COMMISSION', 'CREER'), async (req, res) => {
    const d = z.object({ montant: z.number().int().positive(), destination: z.enum(['VIREMENT', 'MONNAIE_ELECTRONIQUE', 'COMPTE_PRODUCTION']), coordonneeId: uuid.optional(), motifFraction: z.string().max(200).optional() }).parse(req.body);
    res.status(201).json(await ecrire(req, q => payerFacture(q, req.acteur, uuid.parse(req.params.id), d)));
  });
  r.post('/mandats-affectation', droit('COMPTE_PRODUCTION', 'CREER'), async (req, res) => {
    const d = z.object({ intervenantId: uuid, compteProductionId: uuid, type: z.enum(['PONCTUEL', 'PERMANENT']), factureId: uuid.optional(), documentId: uuid }).parse(req.body);
    res.status(201).json({ id: await ecrire(req, q => creerMandat(q, req.acteur, d)) });
  });
  r.post('/mandats-affectation/:id/revocation', droit('COMPTE_PRODUCTION', 'CREER'), async (req, res) => {
    await ecrire(req, q => revoquerMandat(q, req.acteur, uuid.parse(req.params.id)));
    res.status(204).end();
  });
  r.get('/ordres-paiement', droit('PAIEMENT', 'CONSULTER'), async (req, res) => {
    const f = z.object({ statut: z.string().optional(), type: z.string().optional() }).parse(req.query);
    res.json(await listerOrdres(getPool(), f));
  });
  r.post('/ordres-paiement/:id/execution', droit('PAIEMENT', 'CREER'), async (req, res) => {
    const { banque } = z.object({ banque: z.string() }).parse(req.body);
    res.json(await ecrire(req, q => executerOrdre(q, req.acteur, uuid.parse(req.params.id), { banque })));
  });
  return r;
}
