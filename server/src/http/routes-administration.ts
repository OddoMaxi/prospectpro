/** Administration et SI (CDC § 4.7) : organigramme, utilisateurs, profils, délégations, intérims, validations, paramètres, audit. */
import { Router } from 'express';
import { z } from 'zod';
import { getPool } from '../db/pool.js';
import { journaliser, verifierChaine } from '../moteurs/audit.js';
import { corbeille, decider } from '../moteurs/validation.js';
import { creer, desactiver, organigramme, proposer, renommer, simuler, type Restructuration } from '../modules/organisation/service.js';
import {
  attribuerProfil, changerStatut, creerInterim, creerUtilisateur, declarerIncompatibilite, definirDelegation, retirerProfil,
} from '../modules/habilitations/service.js';
import { proposerChangement } from '../modules/parametrage/service.js';
import { droit, ecrire } from './socle.js';

const uuid = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const perimetre = z.object({
  departements: z.array(uuid).optional(), services: z.array(uuid).optional(),
  bureaux: z.array(z.string().regex(/^\d{2}$/)).optional(), produits: z.array(z.string()).optional(),
}).nullable().optional();

export function routesAdministration(): Router {
  const r = Router();
  const type = z.enum(['DEPARTEMENT', 'SERVICE', 'FONCTION']);

  // ---------------------------------------------------------------- Organisation
  r.get('/organigramme', droit('ORGANISATION', 'CONSULTER'), async (req, res) => {
    const q = z.object({ date: date.optional(), inactifs: z.enum(['0', '1']).optional() }).parse(req.query);
    res.json(await organigramme(getPool(), q.date, q.inactifs === '1'));
  });
  r.get('/organisation/historique', droit('ORGANISATION', 'CONSULTER'), async (_req, res) => {
    res.json((await getPool().query(`SELECT h.*, u.identifiant AS valideur FROM historique_organisation h LEFT JOIN utilisateur u ON u.id = h.valide_par ORDER BY h.date_effet DESC, h.cree_le DESC LIMIT 500`)).rows);
  });
  r.post('/organisation', droit('ORGANISATION', 'PARAMETRER'), async (req, res) => {
    const d = z.object({ type, code: z.string(), libelle: z.string().min(1).max(120), parentId: uuid.optional(), responsableId: uuid.optional(), profilDefautId: uuid.optional(), dateEffet: date.optional() }).parse(req.body);
    res.status(201).json({ id: await ecrire(req, q => creer(q, req.acteur, d.type, d)) });
  });
  r.post('/organisation/:id/renommage', droit('ORGANISATION', 'PARAMETRER'), async (req, res) => {
    const d = z.object({ type, libelle: z.string().min(1).max(120), dateEffet: date.optional() }).parse(req.body);
    await ecrire(req, q => renommer(q, req.acteur, d.type, uuid.parse(req.params.id), d.libelle, d.dateEffet));
    res.status(204).end();
  });
  r.post('/organisation/:id/desactivation', droit('ORGANISATION', 'PARAMETRER'), async (req, res) => {
    const d = z.object({ type, dateEffet: date.optional() }).parse(req.body);
    await ecrire(req, q => desactiver(q, req.acteur, d.type, uuid.parse(req.params.id), d.dateEffet));
    res.status(204).end();
  });
  const restructuration = z.discriminatedUnion('operation', [
    z.object({ operation: z.literal('DEPLACEMENT'), type: z.enum(['SERVICE', 'FONCTION']), id: uuid, nouveauParentId: uuid, dateEffet: date }),
    z.object({ operation: z.literal('FUSION'), type: z.enum(['DEPARTEMENT', 'SERVICE']), sources: z.array(uuid).min(1), cibleId: uuid, dateEffet: date }),
    z.object({ operation: z.literal('SCISSION'), type: z.enum(['DEPARTEMENT', 'SERVICE']), sourceId: uuid, dateEffet: date,
      nouvelles: z.array(z.object({ code: z.string(), libelle: z.string(), parentId: uuid.optional(), enfants: z.array(uuid) })).min(2) }),
  ]);
  r.post('/organisation/simulation', droit('ORGANISATION', 'PARAMETRER'), async (req, res) => {
    res.json(await simuler(getPool(), restructuration.parse(req.body) as Restructuration));
  });
  r.post('/organisation/restructurations', droit('ORGANISATION', 'PARAMETRER'), async (req, res) => {
    res.status(201).json(await ecrire(req, q => proposer(q, req.acteur, restructuration.parse(req.body) as Restructuration)));
  });

  // ---------------------------------------------------------------- Validations (corbeille de travail)
  /** Corbeille : demandes que l'utilisateur peut trancher, avec l'auteur et l'opération proposée. */
  r.get('/validations', async (req, res) => {
    const demandes = await corbeille(getPool(), req.acteur.utilisateurId!);
    const auteurs = new Map((await getPool().query<{ id: string; identifiant: string; nom: string; prenoms: string | null }>(
      'SELECT u.id, u.identifiant, t.nom, t.prenoms FROM utilisateur u JOIN tiers t ON t.id = u.tiers_id WHERE u.id = ANY($1)',
      [[...new Set(demandes.map(d => d.initiateur_id))]])).rows.map(u => [u.id, u]));
    res.json(demandes.map(d => ({ ...d, initiateur: auteurs.get(d.initiateur_id) ?? null })));
  });
  /** Demandes soumises par l'utilisateur, avec leur suivi. */
  r.get('/validations/miennes', async (req, res) => {
    res.json((await getPool().query(
      `SELECT d.id, d.type_operation, d.objet_type, d.statut, d.niveaux_requis, d.cree_le, d.decide_le, d.donnees,
              (SELECT count(*)::int FROM validation_etape e WHERE e.demande_validation_id = d.id) AS niveaux_valides,
              (SELECT e.motif FROM validation_etape e WHERE e.demande_validation_id = d.id AND e.decision = 'REJETE' LIMIT 1) AS motif_rejet
         FROM demande_validation d WHERE d.initiateur_id = $1 ORDER BY d.cree_le DESC LIMIT 200`, [req.acteur.utilisateurId])).rows);
  });
  r.post('/validations/:id/decision', async (req, res) => {
    const d = z.object({ decision: z.enum(['VALIDE', 'REJETE']), motif: z.string().max(2000).optional() }).parse(req.body);
    res.json(await ecrire(req, q => decider(q, req.acteur, uuid.parse(req.params.id), d.decision, d.motif)));
  });

  // ---------------------------------------------------------------- Utilisateurs
  r.get('/utilisateurs', droit('UTILISATEURS', 'CONSULTER'), async (req, res) => {
    const f = z.object({ statut: z.string().optional(), recherche: z.string().max(80).optional() }).parse(req.query);
    res.json((await getPool().query(
      `SELECT u.id, u.identifiant, u.type_compte, u.statut, u.derniere_connexion, u.double_facteur, t.nom, t.prenoms, f.libelle AS fonction,
              (SELECT json_agg(json_build_object('id', up.id, 'code', p.code, 'perimetre', up.perimetre, 'date_fin', up.date_fin, 'valide', (NOT p.privilegie OR up.valide_par IS NOT NULL)))
                 FROM utilisateur_profil up JOIN profil p ON p.id = up.profil_id WHERE up.utilisateur_id = u.id AND up.supprime_le IS NULL) AS profils
         FROM utilisateur u JOIN tiers t ON t.id = u.tiers_id LEFT JOIN fonction f ON f.id = u.fonction_id
        WHERE ($1::text IS NULL OR u.statut = $1) AND ($2::text IS NULL OR u.identifiant ILIKE '%' || $2 || '%' OR t.nom ILIKE '%' || $2 || '%')
        ORDER BY t.nom, t.prenoms LIMIT 500`, [f.statut ?? null, f.recherche ?? null])).rows);
  });
  r.post('/utilisateurs', droit('UTILISATEURS', 'CREER'), async (req, res) => {
    const d = z.object({
      identifiant: z.string(), tiersId: uuid, typeCompte: z.enum(['INTERNE', 'AGENT_GENERAL', 'COLLABORATEUR', 'JUNIOR', 'PRESCRIPTEUR', 'ADMIN_PRESTATAIRE', 'PROFESSIONNEL_SANTE', 'ASSURE', 'REPRESENTANT_ENTREPRISE', 'RESPONSABLE_GROUPEMENT', 'DECLARANT']),
      fonctionId: uuid.optional(), motDePasse: z.string(), telephone: z.string().optional(),
    }).parse(req.body);
    res.status(201).json({ id: await ecrire(req, q => creerUtilisateur(q, req.acteur, d)) });
  });
  r.post('/utilisateurs/:id/statut', droit('UTILISATEURS', 'MODIFIER'), async (req, res) => {
    const d = z.object({ statut: z.enum(['ACTIF', 'SUSPENDU', 'DESACTIVE']), motif: z.string().min(1) }).parse(req.body);
    await ecrire(req, q => changerStatut(q, req.acteur, uuid.parse(req.params.id), d.statut, d.motif));
    res.status(204).end();
  });
  r.post('/utilisateurs/:id/profils', droit('UTILISATEURS', 'PARAMETRER'), async (req, res) => {
    const d = z.object({ profilId: uuid, perimetre, dateDebut: date.optional(), dateFin: date.optional() }).parse(req.body);
    res.status(201).json(await ecrire(req, q => attribuerProfil(q, req.acteur, { ...d, utilisateurId: uuid.parse(req.params.id) })));
  });
  r.delete('/attributions/:id', droit('UTILISATEURS', 'PARAMETRER'), async (req, res) => {
    const { motif } = z.object({ motif: z.string().min(1) }).parse(req.body ?? {});
    await ecrire(req, q => retirerProfil(q, req.acteur, uuid.parse(req.params.id), motif));
    res.status(204).end();
  });
  r.get('/utilisateurs/:id/connexions', droit('UTILISATEURS', 'CONSULTER'), async (req, res) => {
    res.json((await getPool().query(
      `SELECT horodatage, action, adresse_ip, appareil, valeur_apres FROM journal_audit WHERE objet_type = 'utilisateur' AND objet_id = $1
          AND action IN ('CONNEXION','ECHEC_CONNEXION','DECONNEXION') ORDER BY rang DESC LIMIT 100`, [uuid.parse(req.params.id)])).rows);
  });

  // ---------------------------------------------------------------- Profils et droits
  r.get('/profils', droit('UTILISATEURS', 'CONSULTER'), async (_req, res) => {
    const p = await getPool().query(
      `SELECT p.id, p.code, p.libelle, p.externe, p.privilegie,
              COALESCE(json_agg(json_build_object('fonction', d.fonction_systeme, 'action', d.action, 'niveau', d.niveau_validation)) FILTER (WHERE d.id IS NOT NULL), '[]') AS droits
         FROM profil p LEFT JOIN profil_droit pd ON pd.profil_id = p.id AND pd.supprime_le IS NULL LEFT JOIN droit d ON d.id = pd.droit_id
        WHERE p.supprime_le IS NULL GROUP BY p.id ORDER BY p.libelle`);
    const i = await getPool().query(`SELECT a.code AS a, b.code AS b, i.motif FROM incompatibilite_profil i JOIN profil a ON a.id = i.profil_a_id JOIN profil b ON b.id = i.profil_b_id WHERE i.supprime_le IS NULL`);
    res.json({ profils: p.rows, incompatibilites: i.rows });
  });
  r.post('/incompatibilites', droit('UTILISATEURS', 'PARAMETRER'), async (req, res) => {
    const d = z.object({ profilA: uuid, profilB: uuid, motif: z.string().min(1).max(200) }).parse(req.body);
    await ecrire(req, q => declarerIncompatibilite(q, req.acteur, d.profilA, d.profilB, d.motif));
    res.status(204).end();
  });

  // ---------------------------------------------------------------- Délégations et intérims
  r.get('/delegations', droit('DELEGATIONS', 'CONSULTER'), async (_req, res) => {
    res.json((await getPool().query(
      `SELECT d.type_operation, d.niveau, p.code AS profil, d.seuil_min, d.seuil_max, d.date_effet FROM delegation_validation d JOIN profil p ON p.id = d.profil_id
        WHERE d.supprime_le IS NULL ORDER BY d.type_operation, d.date_effet DESC, d.niveau`)).rows);
  });
  r.put('/delegations/:type', droit('DELEGATIONS', 'PARAMETRER'), async (req, res) => {
    const d = z.object({ dateEffet: date, niveaux: z.array(z.object({ niveau: z.number().int().min(1), profilId: uuid, seuilMin: z.number().int().min(0).optional(), seuilMax: z.number().int().min(0).optional() })).min(1) }).parse(req.body);
    await ecrire(req, q => definirDelegation(q, req.acteur, { ...d, typeOperation: z.string().regex(/^[A-Z_]{3,60}$/).parse(req.params.type) }));
    res.status(204).end();
  });
  r.get('/interims', droit('DELEGATIONS', 'CONSULTER'), async (_req, res) => {
    res.json((await getPool().query(
      `SELECT i.id, a.identifiant AS delegant, b.identifiant AS delegataire, i.date_debut, i.date_fin, i.motif FROM interim i
         JOIN utilisateur a ON a.id = i.delegant_id JOIN utilisateur b ON b.id = i.delegataire_id
        WHERE i.supprime_le IS NULL AND i.date_fin > now() ORDER BY i.date_debut`)).rows);
  });
  r.post('/interims', droit('DELEGATIONS', 'CREER'), async (req, res) => {
    const d = z.object({ delegataireId: uuid, debut: z.string().datetime(), fin: z.string().datetime(), motif: z.string().min(1).max(200) }).parse(req.body);
    res.status(201).json({ id: await ecrire(req, q => creerInterim(q, req.acteur, d)) });
  });

  // ---------------------------------------------------------------- Paramètres
  r.get('/parametres', droit('PARAMETRES', 'CONSULTER'), async (_req, res) => {
    res.json((await getPool().query(
      `SELECT p.code, p.libelle, p.module, p.type_valeur, p.valeur, p.valeur_defaut, p.date_effet, p.sens_protecteur,
              r.code AS regle, r.texte_reference, r.verrouillee
         FROM parametre p LEFT JOIN regle_legale r ON r.id = p.regle_legale_id WHERE p.supprime_le IS NULL ORDER BY p.module, p.code`)).rows);
  });
  r.get('/parametres/:code/historique', droit('PARAMETRES', 'CONSULTER'), async (req, res) => {
    res.json((await getPool().query(
      `SELECT h.ancienne_valeur, h.nouvelle_valeur, h.date_effet, h.cree_le, u.identifiant AS auteur, h.decision_comite_id
         FROM parametre_historique h JOIN parametre p ON p.id = h.parametre_id LEFT JOIN utilisateur u ON u.id = h.auteur_id
        WHERE p.code = $1 ORDER BY h.date_effet DESC, h.cree_le DESC`, [req.params.code])).rows);
  });
  r.post('/parametres/:code/changements', droit('PARAMETRES', 'CREER'), async (req, res) => {
    const d = z.object({ valeur: z.string().max(2000), dateEffet: date, motif: z.string().min(1).max(500) }).parse(req.body);
    res.status(201).json(await ecrire(req, q => proposerChangement(q, req.acteur, String(req.params.code), d.valeur, d.dateEffet, d.motif)));
  });

  // ---------------------------------------------------------------- Journal d'audit (§ 4.6)
  const filtreAudit = z.object({ utilisateur: uuid.optional(), objetType: z.string().max(60).optional(), objetId: uuid.optional(), action: z.string().max(40).optional(), du: date.optional(), au: date.optional() });
  const rechercheAudit = (f: z.infer<typeof filtreAudit>, limite: number) => getPool().query(
    `SELECT j.rang, j.horodatage, u.identifiant AS utilisateur, j.adresse_ip, j.appareil, j.action, j.objet_type, j.objet_id, j.valeur_avant, j.valeur_apres
       FROM journal_audit j LEFT JOIN utilisateur u ON u.id = j.utilisateur_id
      WHERE ($1::uuid IS NULL OR j.utilisateur_id = $1) AND ($2::text IS NULL OR j.objet_type = $2) AND ($3::uuid IS NULL OR j.objet_id = $3)
        AND ($4::text IS NULL OR j.action = $4) AND ($5::date IS NULL OR j.horodatage >= $5) AND ($6::date IS NULL OR j.horodatage < $6::date + 1)
      ORDER BY j.rang DESC LIMIT ${limite}`,
    [f.utilisateur ?? null, f.objetType ?? null, f.objetId ?? null, f.action ?? null, f.du ?? null, f.au ?? null]);
  r.get('/audit', droit('AUDIT', 'CONSULTER'), async (req, res) => {
    res.json((await rechercheAudit(filtreAudit.parse(req.query), 500)).rows);
  });
  r.get('/audit/export', droit('AUDIT', 'EXPORTER'), async (req, res) => {
    const f = filtreAudit.parse(req.query);
    const lignes = (await rechercheAudit(f, 50_000)).rows;
    await ecrire(req, q => journaliser(q, { ...req.acteur.trace(), action: 'EXPORT', objetType: 'journal_audit', apres: { filtre: f, lignes: lignes.length } }));
    const champ = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = ['rang;horodatage;utilisateur;adresse_ip;action;objet_type;objet_id;valeur_avant;valeur_apres',
      ...lignes.map(l => [l.rang, new Date(l.horodatage).toISOString(), l.utilisateur, l.adresse_ip, l.action, l.objet_type, l.objet_id,
        JSON.stringify(l.valeur_avant ?? ''), JSON.stringify(l.valeur_apres ?? '')].map(champ).join(';'))].join('\n');
    res.type('text/csv; charset=utf-8').attachment('journal-audit.csv').send('﻿' + csv);
  });
  r.get('/audit/verification', droit('AUDIT', 'CONSULTER'), async (_req, res) => {
    res.json(await verifierChaine(getPool()));
  });

  return r;
}
