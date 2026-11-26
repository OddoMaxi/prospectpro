/** Finances (sous-lot 2.6) : fiches d'imputation, journaux, journée comptable, clôture de période, déclarations de taxes, achats, immobilisations. */
import { Router } from 'express';
import { z } from 'zod';
import { getPool } from '../db/pool.js';
import { creerFicheImputation, creerJournal, fermerJournal, listerFiches, supprimerJournal } from '../modules/finances/saisie.js';
import { anomalies, cloturerPeriode, enregistrerDepot, listerDeclarations, listerPeriodes, ordonnerPaiementDeclaration, preparerDeclaration } from '../modules/finances/cloture.js';
import { calculerFactureAchat, listerFacturesAchat, modelesAchat, ordonnerPaiementFacture, saisirFactureAchat } from '../modules/finances/achats.js';
import { annulerRapprochement, comptabiliserOperationBanque, editerEtat, etatRapprochement, importerReleve, lireReleve, rapprocher, rapprocherAutomatiquement, releve } from '../modules/finances/rapprochement.js';
import { categories, completerBien, etatFiscal, ficheBien, proposerSortie, registre } from '../modules/finances/immobilisations.js';
import { soldesTresorerie } from '../modules/finances/tresorerie.js';
import { controlerCollectif } from '../modules/commercial/comptesProduction.js';
import { droit, ecrire } from './socle.js';

const uuid = z.string().uuid();
const mois = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const facture = z.object({
  fournisseurTiersId: uuid, numeroFacture: z.string().min(1).max(60), dateFacture: date, pieceDocumentId: uuid, modeleReglement: z.string().optional(), echeance: date.optional(),
  lignes: z.array(z.object({
    modele: z.string().optional(), compte: z.string().optional(), libelle: z.string().min(1).max(200), montantHT: z.number().int().positive(), quantite: z.number().int().positive().optional(),
    codeTaxe: z.string().optional(), accessoire: z.boolean().optional(), groupe: z.string().max(20).optional(),
    passageEnCharge: z.object({ motif: z.string().min(1).max(300), biensRemplaces: z.array(uuid).optional() }).optional(),
  })).min(1),
});

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
  // FI-06 : soldes, contrôles quotidiens (anomalies du jour, collectif des comptes de production)
  r.get('/tresorerie', droit('PAIEMENT', 'CONSULTER'), async (_req, res) => {
    res.json({ ...await soldesTresorerie(getPool()), anomalies: await anomalies(getPool()), collectif: await controlerCollectif(getPool()) });
  });
  r.get('/periodes', droit('ECRITURE_MANUELLE', 'CONSULTER'), async (_req, res) => { res.json(await listerPeriodes(getPool())); });
  r.get('/anomalies', droit('ECRITURE_MANUELLE', 'CONSULTER'), async (req, res) => {
    const { date } = z.object({ date: z.string().optional() }).parse(req.query);
    res.json(await anomalies(getPool(), date));
  });
  r.post('/periodes/:mois/cloture', droit('ECRITURE_MANUELLE', 'VALIDER'), async (req, res) => {
    res.json(await ecrire(req, q => cloturerPeriode(q, req.acteur, mois.parse(req.params.mois))));
  });
  r.get('/comptabilite/codes-taxes', droit('DECLARATION_TAXE', 'CONSULTER'), async (_req, res) => {
    res.json((await getPool().query(
      `SELECT DISTINCT ON (ct.code) ct.code, ct.libelle, ct.type, ct.taux, c.numero AS compte FROM code_taxe ct JOIN compte c ON c.id = ct.compte_id
        WHERE ct.supprime_le IS NULL ORDER BY ct.code, ct.date_effet DESC`)).rows);
  });
  r.post('/declarations-taxes/:id/depot', droit('DECLARATION_TAXE', 'CREER'), async (req, res) => {
    const d = z.object({ date, reference: z.string().min(1).max(60) }).parse(req.body);
    await ecrire(req, q => enregistrerDepot(q, req.acteur, uuid.parse(req.params.id), d));
    res.status(204).end();
  });
  r.post('/declarations-taxes/:id/paiement', droit('DECLARATION_TAXE', 'CREER'), async (req, res) => {
    const d = z.object({ beneficiaireTiersId: uuid, coordonneeId: uuid }).parse(req.body);
    res.status(201).json(await ecrire(req, q => ordonnerPaiementDeclaration(q, req.acteur, uuid.parse(req.params.id), d)));
  });
  // ---------------------------------------------------------------- Achats (FIN-RG-033, 034, 101)
  r.get('/achats/modeles', droit('FACTURE_ACHAT', 'CONSULTER'), async (_req, res) => { res.json(await modelesAchat(getPool())); });
  r.get('/achats/factures', droit('FACTURE_ACHAT', 'CONSULTER'), async (_req, res) => { res.json(await listerFacturesAchat(getPool())); });
  r.post('/achats/factures/calcul', droit('FACTURE_ACHAT', 'CREER'), async (req, res) => {
    const c = await calculerFactureAchat(getPool(), facture.parse(req.body));
    res.json({ ...c, lignes: c.lignes.map(l => ({ libelle: l.libelle, compte: l.compte, ht: l.ht, quantite: l.quantite, taxe: l.taxe, recuperable: l.recuperable, frais: l.frais, cout: l.cout,
      categorie: l.categorie?.libelle ?? null, unitaireHT: l.unitaireHT, traitement: l.traitement, proposePassageCharge: l.proposePassageCharge })) });
  });
  r.post('/achats/factures', droit('FACTURE_ACHAT', 'CREER'), async (req, res) => {
    const d = facture.parse(req.body);
    res.status(201).json(await ecrire(req, q => saisirFactureAchat(q, req.acteur, d)));
  });
  r.post('/achats/factures/:id/paiement', droit('FACTURE_ACHAT', 'CREER'), async (req, res) => {
    const { coordonneeId } = z.object({ coordonneeId: uuid }).parse(req.body);
    res.status(201).json(await ecrire(req, q => ordonnerPaiementFacture(q, req.acteur, uuid.parse(req.params.id), coordonneeId)));
  });
  // ---------------------------------------------------------------- Immobilisations (FIN-RG-140 à 149)
  r.get('/immobilisations/categories', droit('IMMOBILISATION', 'CONSULTER'), async (_req, res) => { res.json(await categories(getPool())); });
  r.get('/immobilisations/etat-fiscal', droit('IMMOBILISATION', 'CONSULTER'), async (req, res) => {
    const { exercice } = z.object({ exercice: z.string().regex(/^\d{4}$/) }).parse(req.query);
    res.json(await etatFiscal(getPool(), exercice));
  });
  r.get('/immobilisations', droit('IMMOBILISATION', 'CONSULTER'), async (req, res) => {
    const { statut } = z.object({ statut: z.string().optional() }).parse(req.query);
    res.json(await registre(getPool(), { statut }));
  });
  r.get('/immobilisations/:id', droit('IMMOBILISATION', 'CONSULTER'), async (req, res) => { res.json(await ficheBien(getPool(), uuid.parse(req.params.id))); });
  r.patch('/immobilisations/:id', droit('IMMOBILISATION', 'MODIFIER'), async (req, res) => {
    const d = z.object({ dateMiseEnService: date.optional(), localisation: z.record(z.string(), z.string()).optional(), responsableId: uuid.nullable().optional(), usageDomestique: z.boolean().optional() }).parse(req.body);
    await ecrire(req, q => completerBien(q, req.acteur, uuid.parse(req.params.id), d));
    res.status(204).end();
  });
  r.post('/immobilisations/:id/sortie', droit('IMMOBILISATION', 'CREER'), async (req, res) => {
    const d = z.object({ type: z.enum(['CESSION', 'REBUT']), date, prix: z.number().int().min(0).optional(), banque: z.string().optional(), motif: z.string().min(1).max(300) }).parse(req.body);
    res.status(201).json(await ecrire(req, q => proposerSortie(q, req.acteur, uuid.parse(req.params.id), d)));
  });
  // ---------------------------------------------------------------- Rapprochement bancaire (FIN-RG-042, 043)
  const banque = z.string().regex(/^[A-Z0-9]{2,6}$/);
  r.get('/rapprochement/:banque', droit('PAIEMENT', 'CONSULTER'), async (req, res) => {
    const f = z.object({ statut: z.string().optional(), du: date.optional(), au: date.optional() }).parse(req.query);
    res.json(await releve(getPool(), banque.parse(req.params.banque), f));
  });
  r.post('/rapprochement/:banque/releve', droit('PAIEMENT', 'CREER'), async (req, res) => {
    const d = z.object({ contenu: z.string().min(1).max(2_000_000) }).parse(req.body);
    const lignes = lireReleve(d.contenu);
    res.status(201).json(await ecrire(req, q => importerReleve(q, req.acteur, banque.parse(req.params.banque), lignes)));
  });
  r.post('/rapprochement/:banque/automatique', droit('PAIEMENT', 'CREER'), async (req, res) => {
    res.json(await ecrire(req, q => rapprocherAutomatiquement(q, req.acteur, banque.parse(req.params.banque))));
  });
  r.post('/releve-lignes/:id/rapprochement', droit('PAIEMENT', 'CREER'), async (req, res) => {
    const { ligneEcritureId } = z.object({ ligneEcritureId: uuid }).parse(req.body);
    await ecrire(req, q => rapprocher(q, req.acteur, uuid.parse(req.params.id), ligneEcritureId));
    res.status(204).end();
  });
  r.delete('/releve-lignes/:id/rapprochement', droit('PAIEMENT', 'CREER'), async (req, res) => {
    await ecrire(req, q => annulerRapprochement(q, req.acteur, uuid.parse(req.params.id)));
    res.status(204).end();
  });
  r.post('/releve-lignes/:id/comptabilisation', droit('PAIEMENT', 'CREER'), async (req, res) => {
    const d = z.object({ modele: z.string().optional(), compte: z.string().optional(), pieceDocumentId: uuid }).parse(req.body);
    res.status(201).json(await ecrire(req, q => comptabiliserOperationBanque(q, req.acteur, uuid.parse(req.params.id), d)));
  });
  r.get('/rapprochement/:banque/etat', droit('PAIEMENT', 'CONSULTER'), async (req, res) => {
    const f = z.object({ date, soldeReleve: z.coerce.number().int().optional() }).parse(req.query);
    res.json(await etatRapprochement(getPool(), banque.parse(req.params.banque), f.date, f.soldeReleve));
  });
  r.post('/rapprochement/:banque/etat', droit('PAIEMENT', 'CONSULTER'), async (req, res) => {
    const f = z.object({ date, soldeReleve: z.number().int().optional() }).parse(req.body);
    res.status(201).json(await ecrire(req, q => editerEtat(q, req.acteur, banque.parse(req.params.banque), f.date, f.soldeReleve)));
  });
  r.get('/declarations-taxes', droit('DECLARATION_TAXE', 'CONSULTER'), async (_req, res) => { res.json(await listerDeclarations(getPool())); });
  r.post('/declarations-taxes', droit('DECLARATION_TAXE', 'CREER'), async (req, res) => {
    const d = z.object({ codeTaxe: z.string(), mois }).parse(req.body);
    res.status(201).json(await ecrire(req, q => preparerDeclaration(q, req.acteur, d.codeTaxe, d.mois)));
  });
  return r;
}
