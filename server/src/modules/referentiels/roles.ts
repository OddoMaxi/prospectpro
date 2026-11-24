/**
 * Rôles des tiers (CDC § 5.3 ; REF-RG-003, 004, 014 ; DD tiers_role).
 *
 * - Une fiche unique, plusieurs rôles datés ; le prospect converti devient souscripteur sur la même fiche (REF-RG-003).
 * - Un rôle à incidence comptable ouvre automatiquement le compte auxiliaire sous le collectif paramétré du rôle (REF-RG-004).
 *   Pour un bénéficiaire, le compte n'est ouvert qu'à l'acceptation d'une indemnité (SIN-RG-031) : `ouvrirCompteBeneficiaire`.
 * - Agent général : personne physique ou morale (avec son dirigeant) ; junior et prescripteur : personnes physiques (REF-RG-014).
 */
import type { Executant } from '../../db/pool.js';
import type { Acteur } from '../../noyau/acteur.js';
import { ErreurMetier, exiger, nonTrouve } from '../../noyau/erreurs.js';
import { aujourdhui, dateValide } from '../../noyau/dates.js';
import { journaliser } from '../../moteurs/audit.js';
import { valeurParametre } from '../../moteurs/parametres.js';
import { ouvrirCompteAuxiliaire } from '../comptabilite/plan.js';

export const ROLES = ['PROSPECT', 'SOUSCRIPTEUR', 'ASSURE', 'AYANT_DROIT', 'BENEFICIAIRE', 'AGENT_GENERAL', 'COLLABORATEUR', 'JUNIOR',
  'PRESCRIPTEUR', 'PRESTATAIRE', 'PROFESSIONNEL_SANTE', 'FOURNISSEUR', 'EMPLOYE', 'DECLARANT', 'TIERS_RESPONSABLE'] as const;
export type Role = typeof ROLES[number];

/** Rôles à incidence comptable → paramètre désignant leur collectif (§ 11.10). */
export const COLLECTIF_DU_ROLE: Partial<Record<Role, string>> = {
  SOUSCRIPTEUR: 'COLLECTIF_SOUSCRIPTEUR',
  AGENT_GENERAL: 'COLLECTIF_AGENT_GENERAL',
  JUNIOR: 'COLLECTIF_APPORTEUR',
  PRESCRIPTEUR: 'COLLECTIF_APPORTEUR',
  PRESTATAIRE: 'COLLECTIF_PRESTATAIRE',
  FOURNISSEUR: 'COLLECTIF_FOURNISSEUR',
  BENEFICIAIRE: 'COLLECTIF_BENEFICIAIRE',
};
/** Rôles réservés aux personnes physiques. */
const PHYSIQUE_SEULEMENT: Role[] = ['JUNIOR', 'PRESCRIPTEUR', 'COLLABORATEUR', 'ASSURE', 'AYANT_DROIT', 'PROFESSIONNEL_SANTE', 'EMPLOYE'];

export async function attribuerRole(q: Executant, acteur: Acteur, d: { tiersId: string; role: Role; dateDebut?: string }) {
  const dateDebut = d.dateDebut ?? aujourdhui();
  exiger(dateValide(dateDebut), 'DATE_INVALIDE', 'Date de début invalide');
  exiger(ROLES.includes(d.role), 'ROLE_INCONNU', `Rôle inconnu : ${d.role}`);
  const t = (await q.query<{ nature: string; dirigeant_tiers_id: string | null; statut: string }>(
    'SELECT nature, dirigeant_tiers_id, statut FROM tiers WHERE id = $1 AND supprime_le IS NULL FOR UPDATE', [d.tiersId])).rows[0];
  if (!t) throw nonTrouve('Fiche tiers');
  exiger(t.nature === 'PHYSIQUE' || !PHYSIQUE_SEULEMENT.includes(d.role), 'NATURE_INCOMPATIBLE',
    `Le rôle ${d.role} est réservé aux personnes physiques (REF-RG-014)`);
  exiger(!(d.role === 'AGENT_GENERAL' && t.nature === 'MORALE' && !t.dirigeant_tiers_id), 'DIRIGEANT_REQUIS',
    'Un agent général personne morale est enregistré avec son dirigeant (REF-RG-014)');

  const actif = await q.query('SELECT 1 FROM tiers_role WHERE tiers_id = $1 AND role = $2 AND date_fin IS NULL AND supprime_le IS NULL', [d.tiersId, d.role]);
  exiger(!actif.rowCount, 'ROLE_DEJA_ACTIF', `Ce tiers a déjà le rôle ${d.role}`, 409);

  // REF-RG-003 : le prospect devient client sur la même fiche
  if (d.role === 'SOUSCRIPTEUR') {
    await q.query(`UPDATE tiers_role SET date_fin = $2 WHERE tiers_id = $1 AND role = 'PROSPECT' AND date_fin IS NULL AND supprime_le IS NULL`, [d.tiersId, dateDebut]);
  }

  let compte: Awaited<ReturnType<typeof ouvrirCompteAuxiliaire>> | null = null;
  const parametre = COLLECTIF_DU_ROLE[d.role];
  if (parametre && d.role !== 'BENEFICIAIRE') compte = await ouvrirCompteAuxiliaire(q, acteur, d.tiersId, await valeurParametre(q, parametre));

  const r = await q.query<{ id: string }>(
    'INSERT INTO tiers_role (tiers_id, role, date_debut, compte_auxiliaire_id) VALUES ($1,$2,$3,$4) RETURNING id',
    [d.tiersId, d.role, dateDebut, compte?.id ?? null]);
  await journaliser(q, { ...acteur.trace(), action: 'CREATION', objetType: 'tiers_role', objetId: r.rows[0]!.id, apres: { ...d, dateDebut, compteAuxiliaire: compte?.code ?? null } });
  return { id: r.rows[0]!.id, compteAuxiliaire: compte ? { id: compte.id, code: compte.code } : null, alerte: compte?.alerte ?? null };
}

export async function terminerRole(q: Executant, acteur: Acteur, roleId: string, dateFin: string, motif: string) {
  exiger(motif?.trim(), 'MOTIF_REQUIS', 'Motif obligatoire');
  const r = await q.query<{ date_debut: string }>('SELECT date_debut FROM tiers_role WHERE id = $1 AND date_fin IS NULL AND supprime_le IS NULL FOR UPDATE', [roleId]);
  if (!r.rows[0]) throw nonTrouve('Rôle actif');
  exiger(dateFin >= r.rows[0].date_debut, 'DATE_INVALIDE', 'La fin ne peut précéder le début');
  await q.query('UPDATE tiers_role SET date_fin = $2 WHERE id = $1', [roleId, dateFin]);
  await journaliser(q, { ...acteur.trace(), action: 'MODIFICATION', objetType: 'tiers_role', objetId: roleId, apres: { dateFin, motif } });
}

/** SIN-RG-031 : le compte du bénéficiaire est ouvert à l'acceptation de l'indemnité, pas à sa désignation. */
export async function ouvrirCompteBeneficiaire(q: Executant, acteur: Acteur, tiersId: string) {
  const role = await q.query<{ id: string; compte_auxiliaire_id: string | null }>(
    `SELECT id, compte_auxiliaire_id FROM tiers_role WHERE tiers_id = $1 AND role = 'BENEFICIAIRE' AND date_fin IS NULL AND supprime_le IS NULL`, [tiersId]);
  if (!role.rows[0]) throw new ErreurMetier('ROLE_ABSENT', 'Ce tiers n\'est pas désigné bénéficiaire', 422);
  const compte = await ouvrirCompteAuxiliaire(q, acteur, tiersId, await valeurParametre(q, 'COLLECTIF_BENEFICIAIRE'));
  if (!role.rows[0].compte_auxiliaire_id) await q.query('UPDATE tiers_role SET compte_auxiliaire_id = $2 WHERE id = $1', [role.rows[0].id, compte.id]);
  return compte;
}

export async function rolesDuTiers(q: Executant, tiersId: string) {
  return (await q.query(
    `SELECT r.id, r.role, r.date_debut, r.date_fin, a.code AS compte_auxiliaire, c.numero AS collectif
       FROM tiers_role r LEFT JOIN compte_auxiliaire a ON a.id = r.compte_auxiliaire_id LEFT JOIN compte c ON c.id = a.collectif_id
      WHERE r.tiers_id = $1 AND r.supprime_le IS NULL ORDER BY r.date_debut DESC, r.role`, [tiersId])).rows;
}
