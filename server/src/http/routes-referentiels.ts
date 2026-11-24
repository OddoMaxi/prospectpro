/** Référentiels (CDC chapitre 5) : tiers, rôles, foyers, coordonnées de paiement, fiche de la Compagnie, bureaux. */
import { Router } from 'express';
import { z } from 'zod';
import { getPool } from '../db/pool.js';
import { journaliser } from '../moteurs/audit.js';
import { controlerDroit } from '../modules/habilitations/droits.js';
import { creerBureau, lireBureau, listerBureaux } from '../modules/referentiels/bureaux.js';
import { creerTiers, lireTiers, modifierTiers, rechercherDoublons, schemaTiers } from '../modules/referentiels/tiers.js';
import type { ContexteAuth } from '../modules/auth/service.js';
import { attribuerRole, ROLES, rolesDuTiers, terminerRole } from '../modules/referentiels/roles.js';
import { changerCategorie, declarerMembre, foyer, retirerMembre } from '../modules/referentiels/foyer.js';
import { listerCoordonnees, lireNumero, proposerCoordonnee } from '../modules/referentiels/coordonnees.js';
import { champsManquants, CHAMPS_SOCIETE, ficheSociete, historiqueSociete, proposerModificationSociete } from '../modules/referentiels/societe.js';
import { droit, ecrire } from './socle.js';

const uuid = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export function routesReferentiels(ctx: ContexteAuth): Router {
  const r = Router();

  // ---------------------------------------------------------------- Tiers
  r.get('/tiers', droit('TIERS', 'CONSULTER'), async (req, res) => {
    const f = z.object({ recherche: z.string().trim().min(2).max(80) }).parse(req.query);
    res.json((await getPool().query(
      `SELECT id, code_tiers, nature, nom, prenoms, date_naissance, telephone, statut FROM tiers
        WHERE supprime_le IS NULL AND (code_tiers = upper($1) OR telephone = $1 OR (nom || ' ' || COALESCE(prenoms, '')) ILIKE '%' || $1 || '%')
        ORDER BY nom, prenoms LIMIT 50`, [f.recherche])).rows);
  });
  r.post('/tiers/doublons', droit('TIERS', 'CREER'), async (req, res) => {
    res.json(await rechercherDoublons(getPool(), schemaTiers.parse(req.body)));
  });
  r.post('/tiers', droit('TIERS', 'CREER'), async (req, res) => {
    const { decisionDoublon, ...t } = z.object({ decisionDoublon: z.object({ motif: z.string().min(5) }).optional() }).passthrough().parse(req.body);
    // Passer outre un doublon probable relève d'un gestionnaire habilité (REF-RG-002)
    if (decisionDoublon) await controlerDroit(getPool(), req.acteur.utilisateurId!, 'TIERS', 'VALIDER');
    res.status(201).json({ id: await ecrire(req, q => creerTiers(q, req.acteur, t as never, decisionDoublon)) });
  });
  r.get('/tiers/:id', droit('TIERS', 'CONSULTER'), async (req, res) => {
    const id = uuid.parse(req.params.id);
    const t = await lireTiers(getPool(), id);
    // Consultation d'une fiche d'identité : tracée (rapport L0, A.3 bis)
    await ecrire(req, q => journaliser(q, { ...req.acteur.trace(), action: 'CONSULTATION', objetType: 'tiers', objetId: id }));
    const roles = await getPool().query('SELECT role, date_debut, date_fin FROM tiers_role WHERE tiers_id = $1 AND supprime_le IS NULL ORDER BY date_debut', [id]);
    res.json({ ...t, roles: roles.rows });
  });
  r.patch('/tiers/:id', droit('TIERS', 'MODIFIER'), async (req, res) => {
    const { version, ...maj } = z.object({ version: z.number().int().positive() }).passthrough().parse(req.body);
    res.json(await ecrire(req, q => modifierTiers(q, req.acteur, uuid.parse(req.params.id), version, maj as never)));
  });

  // ---------------------------------------------------------------- Rôles (REF-RG-003, 004, 014)
  r.get('/tiers/:id/roles', droit('TIERS', 'CONSULTER'), async (req, res) => {
    res.json(await rolesDuTiers(getPool(), uuid.parse(req.params.id)));
  });
  r.post('/tiers/:id/roles', droit('TIERS', 'MODIFIER'), async (req, res) => {
    const d = z.object({ role: z.enum(ROLES), dateDebut: date.optional() }).parse(req.body);
    res.status(201).json(await ecrire(req, q => attribuerRole(q, req.acteur, { ...d, tiersId: uuid.parse(req.params.id) })));
  });
  r.post('/roles/:id/fin', droit('TIERS', 'MODIFIER'), async (req, res) => {
    const d = z.object({ dateFin: date, motif: z.string().min(1) }).parse(req.body);
    await ecrire(req, q => terminerRole(q, req.acteur, uuid.parse(req.params.id), d.dateFin, d.motif));
    res.status(204).end();
  });

  // ---------------------------------------------------------------- Foyer (REF-RG-007 à 009)
  r.get('/tiers/:id/foyer', droit('TIERS', 'CONSULTER'), async (req, res) => {
    const { date: d } = z.object({ date: date.optional() }).parse(req.query);
    res.json(await foyer(getPool(), uuid.parse(req.params.id), d));
  });
  r.post('/tiers/:id/foyer', droit('TIERS', 'MODIFIER'), async (req, res) => {
    const d = z.object({
      membreId: uuid, lien: z.enum(['CONJOINT', 'ENFANT']), parentConjointId: uuid.optional(),
      categorieEnfant: z.enum(['A_CHARGE', 'ETUDIANT', 'HANDICAPE']).optional(), justificatifDocumentId: uuid.optional(),
      justificatifValideJusquAu: date.optional(), dateDebut: date.optional(),
    }).parse(req.body);
    res.status(201).json({ id: await ecrire(req, q => declarerMembre(q, req.acteur, { ...d, assurePrincipalId: uuid.parse(req.params.id) })) });
  });
  r.post('/foyer/:id/categorie', droit('TIERS', 'MODIFIER'), async (req, res) => {
    const d = z.object({ categorie: z.enum(['A_CHARGE', 'ETUDIANT', 'HANDICAPE']), justificatifDocumentId: uuid, justificatifValideJusquAu: date.optional() }).parse(req.body);
    await ecrire(req, q => changerCategorie(q, req.acteur, uuid.parse(req.params.id), d));
    res.status(204).end();
  });
  r.post('/foyer/:id/fin', droit('TIERS', 'MODIFIER'), async (req, res) => {
    const d = z.object({ dateFin: date, motif: z.string().min(1) }).parse(req.body);
    await ecrire(req, q => retirerMembre(q, req.acteur, uuid.parse(req.params.id), d.dateFin, d.motif));
    res.status(204).end();
  });

  // ---------------------------------------------------------------- Coordonnées de paiement (REF-RG-005)
  r.get('/tiers/:id/coordonnees', droit('TIERS', 'CONSULTER'), async (req, res) => {
    res.json(await listerCoordonnees(getPool(), ctx.chiffrement, uuid.parse(req.params.id)));
  });
  r.post('/tiers/:id/coordonnees', droit('TIERS', 'MODIFIER'), async (req, res) => {
    const d = z.object({
      type: z.enum(['BANQUE', 'MONNAIE_ELECTRONIQUE']), etablissement: z.string().min(1).max(120), numero: z.string().min(8).max(40),
      intitule: z.string().min(1).max(200), principale: z.boolean().optional(), remplaceId: uuid.optional(),
    }).parse(req.body);
    res.status(201).json(await ecrire(req, q => proposerCoordonnee(q, req.acteur, ctx.chiffrement, { ...d, tiersId: uuid.parse(req.params.id) })));
  });
  /** Numéro complet : réservé à la comptabilité, consultation tracée. */
  r.get('/coordonnees/:id/numero', droit('JOURNAUX_TIERS', 'CREER'), async (req, res) => {
    res.json({ numero: await ecrire(req, q => lireNumero(q, req.acteur, ctx.chiffrement, uuid.parse(req.params.id))) });
  });

  // ---------------------------------------------------------------- Fiche de la Compagnie (REF-RG-010 à 013)
  r.get('/societe', droit('SOCIETE', 'CONSULTER'), async (req, res) => {
    const { date: d } = z.object({ date: date.optional() }).parse(req.query);
    res.json({
      fiche: await ficheSociete(getPool(), d), manquants: await champsManquants(getPool(), d),
      champs: Object.entries(CHAMPS_SOCIETE).map(([code, c]) => ({ code, libelle: c.libelle, obligatoire: c.obligatoire })),
    });
  });
  r.get('/societe/historique', droit('SOCIETE', 'CONSULTER'), async (_req, res) => {
    res.json(await historiqueSociete(getPool()));
  });
  r.post('/societe/modifications', droit('SOCIETE', 'CREER'), async (req, res) => {
    const d = z.object({ valeurs: z.record(z.string(), z.unknown()), dateEffet: date.optional(), motif: z.string().min(1) }).parse(req.body);
    res.status(201).json(await ecrire(req, q => proposerModificationSociete(q, req.acteur, d)));
  });

  // ---------------------------------------------------------------- Bureaux
  r.get('/bureaux', droit('BUREAUX', 'CONSULTER'), async (req, res) => {
    res.json(await listerBureaux(getPool(), req.perimetre));
  });
  r.get('/bureaux/:id', droit('BUREAUX', 'CONSULTER'), async (req, res) => {
    res.json(await lireBureau(getPool(), uuid.parse(req.params.id), req.perimetre));
  });
  r.post('/bureaux', droit('BUREAUX', 'PARAMETRER'), async (req, res) => {
    const d = z.object({ code: z.string().optional(), nom: z.string().min(1).max(120), type: z.enum(['BUREAU_DIRECT', 'CANAL_DIGITAL']), adresse: z.string().min(1).max(300) }).parse(req.body);
    res.status(201).json(await ecrire(req, q => creerBureau(q, req.acteur, d)));
  });

  return r;
}
