/** Comptabilité (CDC chapitre 11, sous-lot 2.1) : exercices, journaux, schémas, pièces, balances, grand livre, lettrage, contre-passation. */
import { Router } from 'express';
import { z } from 'zod';
import { getPool } from '../db/pool.js';
import { aujourdhui } from '../noyau/dates.js';
import { creerExercice, listerExercices } from '../modules/comptabilite/exercices.js';
import { listerSchemas, proposerSchema, REGLES } from '../modules/comptabilite/schemas.js';
import { delettrer, lettrerManuellement, proposerExtourne, verifierScellement } from '../modules/comptabilite/moteur.js';
import { balanceAuxiliaire, balanceGenerale, grandLivre, lirePiece, rechercherPieces } from '../modules/comptabilite/etats.js';
import { droit, ecrire } from './socle.js';

const uuid = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const debutAnnee = () => `${aujourdhui().slice(0, 4)}-01-01`;

export function routesComptabilite(): Router {
  const r = Router();
  const consulter = droit('JOURNAUX_TIERS', 'CONSULTER');
  const parametrer = droit('PLAN_COMPTES', 'PARAMETRER');

  r.get('/comptabilite/exercices', consulter, async (_req, res) => { res.json(await listerExercices(getPool())); });
  r.post('/comptabilite/exercices', parametrer, async (req, res) => {
    const d = z.object({ code: z.string(), dateDebut: date, dateFin: date }).parse(req.body);
    res.status(201).json({ id: await ecrire(req, q => creerExercice(q, req.acteur, d)) });
  });
  r.get('/comptabilite/journaux', consulter, async (_req, res) => {
    res.json((await getPool().query(
      `SELECT j.code, j.libelle, j.type, j.mode, j.ferme, c.numero AS compte_tresorerie,
              (SELECT count(*)::int FROM ecriture e WHERE e.journal_id = j.id) AS pieces,
              (EXISTS (SELECT 1 FROM schema_comptable s WHERE s.journal_id = j.id AND s.actif AND s.supprime_le IS NULL)
                OR EXISTS (SELECT 1 FROM banque_operateur b WHERE b.journal_id = j.id AND b.supprime_le IS NULL) OR j.code IN ('CAI', 'TRE', 'AN')) AS systeme
         FROM journal j LEFT JOIN compte c ON c.id = j.compte_tresorerie_id WHERE j.supprime_le IS NULL ORDER BY j.code`)).rows);
  });
  r.get('/comptabilite/branches', consulter, async (_req, res) => {
    res.json((await getPool().query(
      `SELECT b.code, b.libelle, p.numero AS primes, a.numero AS annulations, s.numero AS sinistres FROM branche_comptable b
         JOIN compte p ON p.id = b.compte_primes_id JOIN compte a ON a.id = b.compte_annulations_id JOIN compte s ON s.id = b.compte_sinistres_id
        WHERE b.supprime_le IS NULL ORDER BY b.code`)).rows);
  });
  r.get('/comptabilite/schemas', consulter, async (req, res) => {
    const { date: d } = z.object({ date: date.optional() }).parse(req.query);
    res.json({ schemas: await listerSchemas(getPool(), d), regles: REGLES });
  });
  r.post('/comptabilite/schemas/propositions', parametrer, async (req, res) => {
    const { motif, schema } = z.object({ motif: z.string().min(1), schema: z.unknown() }).parse(req.body);
    res.status(201).json(await ecrire(req, q => proposerSchema(q, req.acteur, schema, motif)));
  });

  r.get('/comptabilite/pieces', consulter, async (req, res) => {
    const f = z.object({ journal: z.string().optional(), du: date.optional(), au: date.optional(), reference: z.string().max(60).optional() }).parse(req.query);
    res.json(await rechercherPieces(getPool(), { ...f, du: f.du ?? debutAnnee(), au: f.au ?? aujourdhui() }));
  });
  r.get('/comptabilite/pieces/:id', consulter, async (req, res) => { res.json(await lirePiece(getPool(), uuid.parse(req.params.id))); });
  r.post('/comptabilite/pieces/:id/extourne', droit('JOURNAUX_TIERS', 'CREER'), async (req, res) => {
    const d = z.object({ motif: z.string().min(1), date: date.optional() }).parse(req.body);
    res.status(201).json(await ecrire(req, q => proposerExtourne(q, req.acteur, uuid.parse(req.params.id), d.motif, d.date)));
  });

  r.get('/comptabilite/balance', consulter, async (req, res) => {
    const f = z.object({ du: date.optional(), au: date.optional() }).parse(req.query);
    res.json(await balanceGenerale(getPool(), f.du ?? debutAnnee(), f.au ?? aujourdhui()));
  });
  r.get('/comptabilite/balance-auxiliaire', consulter, async (req, res) => {
    const f = z.object({ collectif: z.string(), au: date.optional() }).parse(req.query);
    res.json(await balanceAuxiliaire(getPool(), f.collectif, f.au ?? aujourdhui()));
  });
  r.get('/comptabilite/grand-livre', consulter, async (req, res) => {
    const f = z.object({ compte: z.string().optional(), auxiliaire: z.string().optional(), du: date.optional(), au: date.optional() }).parse(req.query);
    res.json(await grandLivre(getPool(), { ...f, du: f.du ?? debutAnnee(), au: f.au ?? aujourdhui() }));
  });
  r.post('/comptabilite/lettrages', droit('JOURNAUX_TIERS', 'CREER'), async (req, res) => {
    const { lignes } = z.object({ lignes: z.array(uuid).min(2) }).parse(req.body);
    res.status(201).json({ code: await ecrire(req, q => lettrerManuellement(q, req.acteur, lignes)) });
  });
  r.delete('/comptabilite/lettrages/:code', droit('JOURNAUX_TIERS', 'CREER'), async (req, res) => {
    await ecrire(req, q => delettrer(q, req.acteur, String(req.params.code)));
    res.status(204).end();
  });
  r.get('/comptabilite/scellement/verification', consulter, async (_req, res) => { res.json(await verifierScellement(getPool())); });
  return r;
}
