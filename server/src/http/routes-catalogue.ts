/** Catalogue des produits (§ 5.5), modèles de documents, plan de comptes du socle (§ 11.4, 11.5) et jours fériés (§ 5.6). */
import { Router } from 'express';
import { z } from 'zod';
import { getPool } from '../db/pool.js';
import { catalogue, detailFormule, proposerCatalogue, tarifer } from '../modules/catalogue/service.js';
import { creerModeleDocument, listerModeles } from '../modules/referentiels/modeles.js';
import { creerCodeTaxe, creerCompteGeneral, listerComptes } from '../modules/comptabilite/plan.js';
import { ajouterJourFerie, ajouterJoursOuvrables, joursFeries, retirerJourFerie } from '../modules/referentiels/calendrier.js';
import { aujourdhui } from '../noyau/dates.js';
import { droit, ecrire } from './socle.js';

const uuid = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export function routesCatalogue(): Router {
  const r = Router();

  // ---------------------------------------------------------------- Catalogue
  r.get('/catalogue', droit('CATALOGUE', 'CONSULTER'), async (req, res) => {
    const { date: d } = z.object({ date: date.optional() }).parse(req.query);
    res.json(await catalogue(getPool(), d));
  });
  r.get('/catalogue/formules/:id', droit('CATALOGUE', 'CONSULTER'), async (req, res) => {
    res.json(await detailFormule(getPool(), uuid.parse(req.params.id)));
  });
  /** Proposition soumise au comité de paramétrage ; appliquée à sa validation. */
  r.post('/catalogue/propositions', droit('CATALOGUE', 'CREER'), async (req, res) => {
    const { motif, operation } = z.object({ motif: z.string().min(1), operation: z.unknown() }).parse(req.body);
    res.status(201).json(await ecrire(req, q => proposerCatalogue(q, req.acteur, operation, motif)));
  });
  r.post('/catalogue/tarification', droit('CATALOGUE', 'CONSULTER'), async (req, res) => {
    const d = z.object({
      formuleId: uuid, date: date.optional(),
      membres: z.array(z.object({ qualite: z.enum(['ASSURE_PRINCIPAL', 'CONJOINT', 'ENFANT', 'ADULTE']), dateNaissance: date })).min(1),
    }).parse(req.body);
    res.json(await tarifer(getPool(), d.formuleId, d.membres, d.date ?? aujourdhui()));
  });

  // ---------------------------------------------------------------- Modèles de documents
  r.get('/modeles', droit('MODELES', 'CONSULTER'), async (_req, res) => { res.json(await listerModeles(getPool())); });
  r.post('/modeles', droit('MODELES', 'CREER'), async (req, res) => {
    const d = z.object({
      code: z.string(), libelle: z.string().min(1).max(200), contenu: z.string().min(1),
      niveauSignature: z.enum(['CODE_USAGE_UNIQUE', 'CERTIFIEE_ANDE', 'MANUSCRITE_NUMERISEE']), dateEffet: date.optional(),
    }).parse(req.body);
    res.status(201).json(await ecrire(req, q => creerModeleDocument(q, req.acteur, d)));
  });

  // ---------------------------------------------------------------- Plan de comptes (socle)
  r.get('/comptabilite/comptes', droit('PLAN_COMPTES', 'CONSULTER'), async (_req, res) => { res.json(await listerComptes(getPool())); });
  r.post('/comptabilite/comptes', droit('PLAN_COMPTES', 'PARAMETRER'), async (req, res) => {
    const d = z.object({
      numero: z.string(), libelle: z.string().min(1).max(200), natureId: uuid.optional(), parentNumero: z.string().optional(),
      imputable: z.boolean().optional(), collectif: z.boolean().optional(), sensHabituel: z.enum(['D', 'C']).optional(),
      reportANouveau: z.enum(['AUCUN', 'SOLDE', 'DETAIL']).optional(), lettrable: z.boolean().optional(), ligneEtatBcrg: z.string().max(40).optional(), dateEffet: date.optional(),
    }).parse(req.body);
    res.status(201).json({ id: await ecrire(req, q => creerCompteGeneral(q, req.acteur, d)) });
  });
  r.post('/comptabilite/codes-taxe', droit('PLAN_COMPTES', 'PARAMETRER'), async (req, res) => {
    const d = z.object({
      code: z.string().min(1).max(10), libelle: z.string().min(1).max(120), type: z.enum(['TAXE_PRIMES', 'COLLECTEE', 'DEDUCTIBLE', 'RETENUE_SOURCE']),
      taux: z.number(), assiette: z.enum(['PRIME_NETTE', 'PRIME_NETTE_ACCESSOIRES', 'COMMISSION', 'HT']), compteNumero: z.string(),
      exigibilite: z.enum(['EMISSION', 'ENCAISSEMENT']), regime: z.enum(['NON_RECUPERABLE', 'RECUPERABLE', 'PARTIEL']).optional(),
      pourcentageRecuperable: z.number().optional(), dateEffet: date.optional(),
    }).parse(req.body);
    res.status(201).json({ id: await ecrire(req, q => creerCodeTaxe(q, req.acteur, d)) });
  });

  // ---------------------------------------------------------------- Jours fériés
  r.get('/jours-feries', droit('NOMENCLATURES', 'CONSULTER'), async (req, res) => {
    const { annee } = z.object({ annee: z.coerce.number().int().min(2000).max(2100) }).parse(req.query);
    res.json(await joursFeries(getPool(), annee));
  });
  r.post('/jours-feries', droit('NOMENCLATURES', 'CREER'), async (req, res) => {
    const d = z.object({ date, libelle: z.string().min(1).max(120) }).parse(req.body);
    res.status(201).json({ id: await ecrire(req, q => ajouterJourFerie(q, req.acteur, d)) });
  });
  r.delete('/jours-feries/:id', droit('NOMENCLATURES', 'MODIFIER'), async (req, res) => {
    const { motif } = z.object({ motif: z.string().min(1) }).parse(req.body ?? {});
    await ecrire(req, q => retirerJourFerie(q, req.acteur, uuid.parse(req.params.id), motif));
    res.status(204).end();
  });
  r.get('/jours-ouvrables', droit('NOMENCLATURES', 'CONSULTER'), async (req, res) => {
    const d = z.object({ depuis: date, jours: z.coerce.number().int().min(0).max(365) }).parse(req.query);
    res.json({ date: await ajouterJoursOuvrables(getPool(), d.depuis, d.jours) });
  });

  return r;
}
