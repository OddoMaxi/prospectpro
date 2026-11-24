/** Finances (sous-lot 2.6) : fiches d'imputation, journaux, journée comptable, clôture de période, déclarations de taxes. */
import { Router } from 'express';
import { z } from 'zod';
import { getPool } from '../db/pool.js';
import { creerFicheImputation, creerJournal, fermerJournal, listerFiches, supprimerJournal } from '../modules/finances/saisie.js';
import { anomalies, cloturerPeriode, listerDeclarations, listerPeriodes, preparerDeclaration } from '../modules/finances/cloture.js';
import { droit, ecrire } from './socle.js';

const uuid = z.string().uuid();
const mois = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

export function routesFinances(): Router {
  const r = Router();
  r.get('/fiches-imputation', droit('ECRITURE_MANUELLE', 'CONSULTER'), async (_req, res) => { res.json(await listerFiches(getPool())); });
  r.post('/fiches-imputation', droit('ECRITURE_MANUELLE', 'CREER'), async (req, res) => {
    const d = z.object({
      journal: z.string(), date: z.string().optional(), reference: z.string().min(1).max(60), libelle: z.string().min(1).max(200), pieceDocumentId: uuid, tiersId: uuid.optional(),
      lignes: z.array(z.object({ compte: z.string(), auxiliaire: z.string().optional(), libelle: z.string().min(1), debit: z.number().int(), credit: z.number().int(), echeance: z.string().optional() })).min(2),
    }).parse(req.body);
    res.status(201).json(await ecrire(req, q => creerFicheImputation(q, req.acteur, d)));
  });
  r.post('/journaux', droit('JOURNAUX_TIERS', 'PARAMETRER'), async (req, res) => {
    const d = z.object({ code: z.string(), libelle: z.string().min(1), type: z.string(), mode: z.enum(['AUTOMATIQUE', 'MANUEL']), compteTresorerie: z.string().optional() }).parse(req.body);
    res.status(201).json({ id: await ecrire(req, q => creerJournal(q, req.acteur, d)) });
  });
  r.post('/journaux/:code/fermeture', droit('JOURNAUX_TIERS', 'PARAMETRER'), async (req, res) => {
    await ecrire(req, q => fermerJournal(q, req.acteur, String(req.params.code)));
    res.status(204).end();
  });
  r.delete('/journaux/:code', droit('JOURNAUX_TIERS', 'PARAMETRER'), async (req, res) => {
    await ecrire(req, q => supprimerJournal(q, req.acteur, String(req.params.code)));
    res.status(204).end();
  });
  r.get('/periodes', droit('ECRITURE_MANUELLE', 'CONSULTER'), async (_req, res) => { res.json(await listerPeriodes(getPool())); });
  r.get('/anomalies', droit('ECRITURE_MANUELLE', 'CONSULTER'), async (req, res) => {
    const { date } = z.object({ date: z.string().optional() }).parse(req.query);
    res.json(await anomalies(getPool(), date));
  });
  r.post('/periodes/:mois/cloture', droit('ECRITURE_MANUELLE', 'VALIDER'), async (req, res) => {
    res.json(await ecrire(req, q => cloturerPeriode(q, req.acteur, mois.parse(req.params.mois))));
  });
  r.get('/declarations-taxes', droit('DECLARATION_TAXE', 'CONSULTER'), async (_req, res) => { res.json(await listerDeclarations(getPool())); });
  r.post('/declarations-taxes', droit('DECLARATION_TAXE', 'CREER'), async (req, res) => {
    const d = z.object({ codeTaxe: z.string(), mois }).parse(req.body);
    res.status(201).json(await ecrire(req, q => preparerDeclaration(q, req.acteur, d.codeTaxe, d.mois)));
  });
  return r;
}
