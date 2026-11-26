/**
 * Santé (lot 3) : prestataires agréés, professionnels, nomenclatures, tarifs conventionnés (back-office) et portail
 * de l'administrateur du prestataire (professionnels de sa structure, journal).
 */
import express, { Router } from 'express';
import { z } from 'zod';
import { getPool } from '../db/pool.js';
import { deposerPiece, TAILLE_MAX_PIECE } from '../moteurs/documents.js';
import {
  activerProfessionnel, ajouterProfessionnel, ajouterTarif, changerStatutPrestataire, changerStatutProfessionnel, creerPrestataire, definirOption, fichePrestataire,
  habiliterTeleconsultation, journalStructure, listerPrestataires, listerProfessionnels, modifierPrestataire, OPTIONS, professionnelsDe, proposerAgrementPrestataire,
  structureDe, typesPrestataire,
} from '../modules/sante/prestataires.js';
import { enregistrerActe, enregistrerMedicament, FAMILLES_ACTE, importer, listerActes, listerMedicaments } from '../modules/sante/nomenclatures.js';
import { droit, ecrire } from './socle.js';

const uuid = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const PROFESSIONS = ['MEDECIN', 'CHIRURGIEN_DENTISTE', 'SAGE_FEMME', 'BIOLOGISTE', 'RADIOLOGUE', 'PHARMACIEN', 'OPTICIEN', 'KINESITHERAPEUTE', 'AUTRE'] as const;

export function routesSante(): Router {
  const r = Router();
  // ---------------------------------------------------------------- nomenclatures (§ 5.6)
  r.get('/sante/actes', droit('NOMENCLATURES', 'CONSULTER'), async (req, res) => {
    const f = z.object({ recherche: z.string().max(60).optional(), famille: z.string().optional(), actifs: z.coerce.boolean().optional() }).parse(req.query);
    res.json({ actes: await listerActes(getPool(), f), familles: FAMILLES_ACTE });
  });
  r.post('/sante/actes', droit('NOMENCLATURES', 'CREER'), async (req, res) => {
    const d = z.object({ code: z.string(), libelle: z.string().min(1).max(300), famille: z.string(), specialite: z.string().max(60).nullable().optional(), garantieType: z.string().optional(), actif: z.boolean().optional() }).parse(req.body);
    res.status(201).json({ code: await ecrire(req, q => enregistrerActe(q, req.acteur, d)) });
  });
  r.get('/sante/medicaments', droit('NOMENCLATURES', 'CONSULTER'), async (req, res) => {
    const f = z.object({ recherche: z.string().max(60).optional(), couverts: z.coerce.boolean().optional() }).parse(req.query);
    res.json(await listerMedicaments(getPool(), f));
  });
  r.post('/sante/medicaments', droit('NOMENCLATURES', 'CREER'), async (req, res) => {
    const d = z.object({ code: z.string(), denomination: z.string().min(1).max(200), dci: z.string().min(1).max(200), generique: z.boolean(), couvert: z.boolean(), quantiteMaxOrdonnance: z.number().int().positive().nullable().optional() }).parse(req.body);
    res.status(201).json({ id: await ecrire(req, q => enregistrerMedicament(q, req.acteur, d)) });
  });
  r.post('/sante/nomenclatures/import', droit('NOMENCLATURES', 'CREER'), async (req, res) => {
    const d = z.object({ nature: z.enum(['ACTES', 'MEDICAMENTS']), contenu: z.string().min(1).max(2_000_000) }).parse(req.body);
    res.json(await ecrire(req, q => importer(q, req.acteur, d.nature, d.contenu)));
  });

  // ---------------------------------------------------------------- prestataires (SAN-RG-001 à 003, 010, 060)
  r.get('/sante/types-prestataire', droit('PRESTATAIRES', 'CONSULTER'), async (_req, res) => { res.json({ types: await typesPrestataire(getPool()), options: OPTIONS }); });
  r.get('/sante/prestataires', droit('PRESTATAIRES', 'CONSULTER'), async (req, res) => {
    const f = z.object({ statut: z.string().optional(), type: z.string().optional(), recherche: z.string().max(60).optional() }).parse(req.query);
    res.json(await listerPrestataires(getPool(), f));
  });
  r.post('/sante/prestataires', droit('PRESTATAIRES', 'CREER'), async (req, res) => {
    const d = z.object({ tiersId: uuid, type: z.string(), latitude: z.number().optional(), longitude: z.number().optional(), horaires: z.record(z.string(), z.string()).optional(), telephoneModeDegrade: z.string().max(20).optional() }).parse(req.body);
    res.status(201).json(await ecrire(req, q => creerPrestataire(q, req.acteur, d)));
  });
  r.get('/sante/prestataires/:id', droit('PRESTATAIRES', 'CONSULTER'), async (req, res) => { res.json(await fichePrestataire(getPool(), uuid.parse(req.params.id))); });
  r.patch('/sante/prestataires/:id', droit('PRESTATAIRES', 'MODIFIER'), async (req, res) => {
    const d = z.object({ conventionDocumentId: uuid.optional(), latitude: z.number().nullable().optional(), longitude: z.number().nullable().optional(), horaires: z.record(z.string(), z.string()).nullable().optional(), telephoneModeDegrade: z.string().max(20).nullable().optional() }).parse(req.body);
    await ecrire(req, q => modifierPrestataire(q, req.acteur, uuid.parse(req.params.id), d));
    res.status(204).end();
  });
  r.post('/sante/prestataires/:id/options', droit('PRESTATAIRES', 'MODIFIER'), async (req, res) => {
    const d = z.object({ option: z.enum(OPTIONS), actif: z.boolean(), calendrier: z.unknown().optional() }).parse(req.body);
    await ecrire(req, q => definirOption(q, req.acteur, uuid.parse(req.params.id), d));
    res.status(204).end();
  });
  r.post('/sante/prestataires/:id/tarifs', droit('PRESTATAIRES', 'CREER'), async (req, res) => {
    const b = z.object({ acteCode: z.string().optional(), medicamentCode: z.string().optional(), forfaitCode: z.string().optional(), tarif: z.number().int().positive(), dateEffet: date }).parse(req.body);
    const objet = b.acteCode ? { acteCode: b.acteCode } : b.medicamentCode ? { medicamentCode: b.medicamentCode } : { forfaitCode: b.forfaitCode ?? '' };
    res.status(201).json({ id: await ecrire(req, q => ajouterTarif(q, req.acteur, uuid.parse(req.params.id), { ...objet, tarif: b.tarif, dateEffet: b.dateEffet })) });
  });
  r.post('/sante/prestataires/:id/agrement', droit('PRESTATAIRES', 'CREER'), async (req, res) => {
    const d = z.object({ tiersId: uuid, identifiant: z.string().min(3).max(60), motDePasse: z.string().min(8) }).parse(req.body);
    res.status(201).json(await ecrire(req, q => proposerAgrementPrestataire(q, req.acteur, uuid.parse(req.params.id), d)));
  });
  r.post('/sante/prestataires/:id/statut', droit('PRESTATAIRES', 'MODIFIER'), async (req, res) => {
    const d = z.object({ statut: z.enum(['SUSPENDU', 'FIN_CONVENTION']), motif: z.string().min(1).max(500) }).parse(req.body);
    res.json(await ecrire(req, q => changerStatutPrestataire(q, req.acteur, uuid.parse(req.params.id), d.statut, d.motif)));
  });
  r.get('/sante/professionnels', droit('PRESTATAIRES', 'CONSULTER'), async (req, res) => {
    const f = z.object({ statut: z.enum(['A_AGREER', 'AGREES', 'INACTIFS']).optional() }).parse(req.query);
    res.json(await listerProfessionnels(getPool(), f));
  });
  r.post('/sante/professionnels/:id/statut', droit('PRESTATAIRES', 'MODIFIER'), async (req, res) => {
    const d = z.object({ actif: z.boolean(), motif: z.string().min(1).max(500) }).parse(req.body);
    await ecrire(req, q => changerStatutProfessionnel(q, req.acteur, uuid.parse(req.params.id), d.actif, d.motif));
    res.status(204).end();
  });
  r.post('/sante/professionnels/:id/teleconsultation', droit('PRESTATAIRES', 'MODIFIER'), async (req, res) => {
    const { habilite } = z.object({ habilite: z.boolean() }).parse(req.body);
    await ecrire(req, q => habiliterTeleconsultation(q, req.acteur, uuid.parse(req.params.id), habilite));
    res.status(204).end();
  });
  r.get('/sante/prestataires/:id/journal', droit('PRESTATAIRES', 'CONSULTER'), async (req, res) => { res.json(await journalStructure(getPool(), uuid.parse(req.params.id))); });

  // ---------------------------------------------------------------- portail : administrateur du prestataire (§ 9.4.1)
  r.get('/portail/structure', droit('MA_STRUCTURE', 'CONSULTER'), async (req, res) => {
    const s = await structureDe(getPool(), req.acteur.utilisateurId!);
    const types = await typesPrestataire(getPool());
    res.json({ id: s.id, code: s.code, nom: s.nom, type: s.type, typeLibelle: types.find(t => t.code === s.type)?.libelle, professions: s.professions, professionnels: await professionnelsDe(getPool(), s.id) });
  });
  r.post('/portail/pieces', express.raw({ type: ['application/pdf', 'image/jpeg', 'image/png', 'application/octet-stream'], limit: TAILLE_MAX_PIECE }), droit('MA_STRUCTURE', 'CREER'), async (req, res) => {
    const { typeDocument } = z.object({ typeDocument: z.enum(['DIPLOME', 'PIECE_IDENTITE']) }).parse(req.query);
    const contenu = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    res.status(201).json(await ecrire(req, async q => {
      const s = await structureDe(q, req.acteur.utilisateurId!);
      return deposerPiece(q, req.acteur, { typeDocument, objet: { type: 'prestataire', id: s.id }, contenu });
    }));
  });
  r.post('/portail/professionnels', droit('MA_STRUCTURE', 'CREER'), async (req, res) => {
    const d = z.object({
      nom: z.string().min(1).max(100), prenoms: z.string().min(1).max(150), telephone: z.string().min(8).max(20), courriel: z.string().email().optional(),
      typePiece: z.string().min(1).max(40), numeroPiece: z.string().min(1).max(60), profession: z.enum(PROFESSIONS), specialite: z.string().max(60).optional(),
      numeroOrdre: z.string().min(1).max(40), diplomeDocumentId: uuid, pieceDocumentId: uuid, identifiant: z.string().min(3).max(60), motDePasse: z.string().min(8),
    }).parse(req.body);
    res.status(201).json(await ecrire(req, q => ajouterProfessionnel(q, req.acteur, d)));
  });
  r.post('/portail/professionnels/:exercice/activation', droit('MA_STRUCTURE', 'MODIFIER'), async (req, res) => {
    const d = z.object({ actif: z.boolean(), motif: z.string().min(1).max(300) }).parse(req.body);
    await ecrire(req, q => activerProfessionnel(q, req.acteur, uuid.parse(req.params.exercice), d.actif, d.motif));
    res.status(204).end();
  });
  r.get('/portail/journal', droit('MA_STRUCTURE', 'CONSULTER'), async (req, res) => {
    const s = await structureDe(getPool(), req.acteur.utilisateurId!);
    res.json(await journalStructure(getPool(), s.id));
  });
  return r;
}
