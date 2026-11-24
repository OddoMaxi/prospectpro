/**
 * Motifs de blocage (CDC § 3.7 ; ARC-RG-011 à 013 ; DD motif_blocage_ref, motif_blocage ; écart X18).
 *
 * - Aucun module ne bloque directement une carte : il dépose ou lève un motif daté et justifié.
 *   Une carte est bloquée tant qu'au moins un motif est actif sur elle ou sur la personne.
 * - Le statut de la police n'est jamais recopié en motif : le moteur de droits le lit directement.
 * - Chaque profil voit ce qui le concerne (ARC-RG-012). Un nouveau cas = une ligne du référentiel (ARC-RG-013).
 */
import type { Executant } from '../../db/pool.js';
import type { Acteur } from '../../noyau/acteur.js';
import { ErreurMetier, exiger, nonTrouve } from '../../noyau/erreurs.js';
import { journaliser } from '../../moteurs/audit.js';
import { publier } from '../../moteurs/evenements.js';

/** Module déposant : code du module appelant, ou SYSTEME pour un traitement planifié. */
export type Module = 'PRD' | 'SAN' | 'SIN' | 'CNF' | 'COM' | 'ASSURE' | 'ENTREPRISE' | 'SYSTEME';

/** Module au nom duquel agit un gestionnaire, selon ses profils (dépôt manuel depuis les écrans). */
export const MODULE_DU_PROFIL: Record<string, Module> = {
  GEST_PRODUCTION: 'PRD', GEST_SANTE: 'SAN', MEDECIN_CONSEIL: 'SAN', GEST_SINISTRES: 'SIN', CONFORMITE: 'CNF',
};

export interface Cible { tiersId?: string; carteId?: string }

async function cibleValide(q: Executant, c: Cible) {
  exiger(!!c.tiersId !== !!c.carteId, 'CIBLE_INVALIDE', 'Un motif vise soit une personne (toutes ses cartes), soit une carte');
  const r = c.tiersId
    ? await q.query('SELECT 1 FROM tiers WHERE id = $1 AND supprime_le IS NULL', [c.tiersId])
    : await q.query('SELECT 1 FROM carte_assure WHERE id = $1 AND supprime_le IS NULL', [c.carteId]);
  if (!r.rowCount) throw nonTrouve(c.tiersId ? 'Personne' : 'Carte');
}

export async function deposerMotif(q: Executant, acteur: Acteur, d: Cible & { code: string; justification: string; module: Module }): Promise<string> {
  exiger(d.justification?.trim(), 'JUSTIFICATION_REQUISE', 'Un motif de blocage est toujours justifié');
  const ref = (await q.query<{ id: string; actif: boolean; module_deposant: string; libelle_assure: string }>(
    'SELECT id, actif, module_deposant, libelle_assure FROM motif_blocage_ref WHERE code = $1 AND supprime_le IS NULL', [d.code])).rows[0];
  if (!ref || !ref.actif) throw new ErreurMetier('MOTIF_INCONNU', `Motif de blocage ${d.code} inconnu ou inactif`, 422);
  const autorises = ref.module_deposant.split(',').map(s => s.trim());
  if (!autorises.includes(d.module)) throw new ErreurMetier('INTERDIT', `Le motif ${d.code} ne peut être déposé que par : ${autorises.join(', ')}`, 403);
  await cibleValide(q, d);
  await q.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`blocage:${d.tiersId ?? d.carteId}`]);
  const deja = await q.query(
    `SELECT 1 FROM motif_blocage WHERE motif_ref_id = $1 AND date_fin IS NULL AND supprime_le IS NULL
        AND (tiers_id = $2 OR carte_assure_id = $3)`, [ref.id, d.tiersId ?? null, d.carteId ?? null]);
  exiger(!deja.rowCount, 'MOTIF_DEJA_ACTIF', 'Ce motif est déjà actif sur cette cible', 409);
  const r = await q.query<{ id: string }>(
    `INSERT INTO motif_blocage (motif_ref_id, carte_assure_id, tiers_id, date_debut, justification, depose_par) VALUES ($1,$2,$3,now(),$4,$5) RETURNING id`,
    [ref.id, d.carteId ?? null, d.tiersId ?? null, d.justification.trim(), acteur.utilisateurId]);
  const id = r.rows[0]!.id;
  await journaliser(q, { ...acteur.trace(), action: 'CREATION', objetType: 'motif_blocage', objetId: id, apres: { ...d } });
  await publier(q, acteur, { type: 'MOTIF_BLOCAGE_AJOUTE', objet: { type: 'motif_blocage', id }, charge: { code: d.code, tiersId: d.tiersId ?? null, carteId: d.carteId ?? null }, cleIdempotence: `motif_blocage:${id}:ajout` });
  return id;
}

export async function leverMotif(q: Executant, acteur: Acteur, id: string, justification: string): Promise<void> {
  exiger(justification?.trim(), 'JUSTIFICATION_REQUISE', 'La levée d\'un motif est justifiée');
  const m = (await q.query<{ code: string; definitif: boolean; tiers_id: string | null; carte_assure_id: string | null }>(
    `SELECT r.code, r.definitif, m.tiers_id, m.carte_assure_id FROM motif_blocage m JOIN motif_blocage_ref r ON r.id = m.motif_ref_id
      WHERE m.id = $1 AND m.date_fin IS NULL AND m.supprime_le IS NULL FOR UPDATE OF m`, [id])).rows[0];
  if (!m) throw nonTrouve('Motif de blocage actif');
  exiger(!m.definitif, 'MOTIF_DEFINITIF', `Le motif ${m.code} est définitif : il ne se lève pas`);
  await q.query('UPDATE motif_blocage SET date_fin = now(), leve_par = $2 WHERE id = $1', [id, acteur.utilisateurId]);
  await journaliser(q, { ...acteur.trace(), action: 'MODIFICATION', objetType: 'motif_blocage', objetId: id, apres: { levee: true, justification } });
  await publier(q, acteur, { type: 'MOTIF_BLOCAGE_LEVE', objet: { type: 'motif_blocage', id }, charge: { code: m.code, tiersId: m.tiers_id, carteId: m.carte_assure_id, justification }, cleIdempotence: `motif_blocage:${id}:levee` });
}

interface Actif { id: string; code: string; libelle_assure: string; libelle_prestataire: string; date_debut: string; definitif: boolean }

/** Motifs actifs sur une personne, et sur une carte précise si elle est fournie. */
export async function motifsActifs(q: Executant, c: { tiersId: string; carteId?: string }): Promise<Actif[]> {
  return (await q.query<Actif>(
    `SELECT m.id, r.code, r.libelle_assure, r.libelle_prestataire, m.date_debut, r.definitif
       FROM motif_blocage m JOIN motif_blocage_ref r ON r.id = m.motif_ref_id
      WHERE m.date_fin IS NULL AND m.supprime_le IS NULL AND (m.tiers_id = $1 OR ($2::uuid IS NOT NULL AND m.carte_assure_id = $2))
      ORDER BY m.date_debut`, [c.tiersId, c.carteId ?? null])).rows;
}

export const estBloque = async (q: Executant, c: { tiersId: string; carteId?: string }) => (await motifsActifs(q, c)).length > 0;

/** ARC-RG-012 : ce que chaque profil voit des motifs d'une personne. */
export async function vueMotifs(q: Executant, tiersId: string, profil: 'ASSURE' | 'PRESTATAIRE' | 'ENTREPRISE' | 'GESTIONNAIRE', carteId?: string) {
  const actifs = await motifsActifs(q, { tiersId, carteId });
  switch (profil) {
    case 'PRESTATAIRE':
      // Carte refusée et motif général, sans détail
      return { bloque: actifs.length > 0, motif: actifs[0]?.libelle_prestataire ?? null };
    case 'ENTREPRISE':
      // Statut seulement : aucun détail, a fortiori médical
      return { statut: actifs.length ? 'BLOQUE' : 'ACTIF' };
    case 'ASSURE':
      // Motif et démarche pour le lever
      return { bloque: actifs.length > 0, motifs: actifs.map(a => ({ libelle: a.libelle_assure, depuis: a.date_debut })) };
    case 'GESTIONNAIRE':
      return {
        bloque: actifs.length > 0,
        historique: (await q.query(
          `SELECT m.id, r.code, r.libelle_assure, m.carte_assure_id, m.date_debut, m.date_fin, m.justification, d.identifiant AS depose_par, l.identifiant AS leve_par
             FROM motif_blocage m JOIN motif_blocage_ref r ON r.id = m.motif_ref_id
             LEFT JOIN utilisateur d ON d.id = m.depose_par LEFT JOIN utilisateur l ON l.id = m.leve_par
            WHERE m.supprime_le IS NULL AND (m.tiers_id = $1 OR m.carte_assure_id IN (SELECT ca.id FROM carte_assure ca JOIN police_assure pa ON pa.id = ca.police_assure_id WHERE pa.tiers_id = $1))
            ORDER BY m.date_debut DESC`, [tiersId])).rows,
      };
  }
}

export async function referentielMotifs(q: Executant) {
  return (await q.query('SELECT id, code, libelle_assure, libelle_prestataire, module_deposant, definitif, actif FROM motif_blocage_ref WHERE supprime_le IS NULL ORDER BY code')).rows;
}
