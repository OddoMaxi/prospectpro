/**
 * Alertes de conformité (CDC § 12 ; DD 11.4 ; COM-RG-084).
 *
 * - Une alerte porte une règle (type), un objet, une gravité et un motif lisible ; une seule alerte ouverte par règle
 *   et par objet (une nouvelle occurrence complète l'alerte ouverte au lieu d'en créer une autre).
 * - La Conformité la prend en examen puis la clôt par une décision tracée.
 * - Concentration anormale de souscriptions sur un code prescripteur (COM-RG-084) : contrôlée à chaque émission.
 */
import type { Executant } from '../../db/pool.js';
import type { Acteur } from '../../noyau/acteur.js';
import { exiger, nonTrouve } from '../../noyau/erreurs.js';
import { journaliser } from '../../moteurs/audit.js';
import { entier } from '../../moteurs/parametres.js';

export type Gravite = 'FAIBLE' | 'MOYENNE' | 'FORTE';
export const TYPES_ALERTE: Record<string, string> = {
  CONCENTRATION_CODE_PRESCRIPTEUR: 'Concentration anormale de souscriptions sur un code prescripteur',
};

export async function leverAlerte(q: Executant, acteur: Acteur, d: { type: string; objet: { type: string; id: string }; gravite: Gravite; description: string; donnees?: Record<string, unknown> }) {
  const ouverte = (await q.query<{ id: string; gravite: Gravite }>(
    `SELECT id, gravite FROM alerte_conformite WHERE type = $1 AND objet_id = $2 AND statut <> 'CLOSE' AND supprime_le IS NULL FOR UPDATE`, [d.type, d.objet.id])).rows[0];
  if (ouverte) {
    // Nouvelle occurrence : motif et données mis à jour, gravité jamais abaissée
    const ordre: Gravite[] = ['FAIBLE', 'MOYENNE', 'FORTE'];
    const gravite = ordre.indexOf(d.gravite) > ordre.indexOf(ouverte.gravite) ? d.gravite : ouverte.gravite;
    await q.query('UPDATE alerte_conformite SET gravite = $2, description = $3, donnees = $4 WHERE id = $1', [ouverte.id, gravite, d.description, JSON.stringify(d.donnees ?? {})]);
    return { id: ouverte.id, nouvelle: false };
  }
  const r = await q.query<{ id: string }>(
    `INSERT INTO alerte_conformite (type, objet_type, objet_id, gravite, statut, description, donnees) VALUES ($1,$2,$3,$4,'OUVERTE',$5,$6) RETURNING id`,
    [d.type, d.objet.type, d.objet.id, d.gravite, d.description, JSON.stringify(d.donnees ?? {})]);
  await journaliser(q, { ...acteur.trace(), action: 'CREATION', objetType: 'alerte_conformite', objetId: r.rows[0]!.id, apres: { type: d.type, objet: d.objet, gravite: d.gravite } });
  return { id: r.rows[0]!.id, nouvelle: true };
}

export async function traiterAlerte(q: Executant, acteur: Acteur, id: string, d: { statut: 'EN_EXAMEN' | 'CLOSE'; decision?: string }) {
  const a = (await q.query<{ statut: string }>('SELECT statut FROM alerte_conformite WHERE id = $1 AND supprime_le IS NULL FOR UPDATE', [id])).rows[0];
  if (!a) throw nonTrouve('Alerte');
  exiger(a.statut !== 'CLOSE', 'ALERTE_CLOSE', 'Alerte déjà close', 409);
  if (d.statut === 'CLOSE') exiger(d.decision?.trim(), 'DECISION_REQUISE', 'La clôture d\'une alerte porte une décision motivée');
  await q.query('UPDATE alerte_conformite SET statut = $2, decision = COALESCE($3, decision), traite_par = $4 WHERE id = $1', [id, d.statut, d.decision?.trim() || null, acteur.utilisateurId]);
  await journaliser(q, { ...acteur.trace(), action: d.statut === 'CLOSE' ? 'VALIDATION' : 'MODIFICATION', objetType: 'alerte_conformite', objetId: id, apres: d });
}

export async function listerAlertes(q: Executant, f: { statut?: string } = {}) {
  return (await q.query(
    `SELECT a.id, a.type, a.objet_type, a.objet_id, a.gravite, a.statut, a.description, a.donnees, a.decision, a.cree_le, a.modifie_le, u.identifiant AS traite_par
       FROM alerte_conformite a LEFT JOIN utilisateur u ON u.id = a.traite_par
      WHERE a.supprime_le IS NULL AND ($1::text IS NULL OR ($1 = 'ACTIVES' AND a.statut <> 'CLOSE') OR a.statut = $1)
      ORDER BY (a.statut = 'CLOSE'), CASE a.gravite WHEN 'FORTE' THEN 0 WHEN 'MOYENNE' THEN 1 ELSE 2 END, a.cree_le DESC LIMIT 300`, [f.statut ?? null])).rows;
}

/**
 * COM-RG-084 : concentration anormale de souscriptions sur un code prescripteur. Au-delà du seuil de polices obtenues
 * dans la fenêtre, alerte MOYENNE ; au double du seuil, FORTE. Le détail par bureau et par jour aide l'examen.
 */
export async function controlerConcentrationCode(q: Executant, acteur: Acteur, codePrescripteurId: string) {
  const seuil = await entier(q, 'COM_CONCENTRATION_CODE_NOMBRE');
  const jours = await entier(q, 'COM_CONCENTRATION_CODE_JOURS');
  const r = (await q.query<{ code: string; prescripteur: string; nombre: number; bureaux: Record<string, number>; max_jour: number }>(
    `WITH polices AS (
       SELECT p.id, b.code AS bureau, (p.cree_le AT TIME ZONE 'Africa/Conakry')::date AS jour
         FROM dossier_souscription d JOIN police p ON p.id = d.police_id JOIN bureau b ON b.id = p.bureau_emetteur_id
        WHERE d.code_prescripteur_id = $1 AND p.cree_le >= now() - make_interval(days => $2))
     SELECT c.code, trim(t.nom || ' ' || COALESCE(t.prenoms, '')) AS prescripteur, (SELECT count(*)::int FROM polices) AS nombre,
            COALESCE((SELECT jsonb_object_agg(bureau, n) FROM (SELECT bureau, count(*)::int AS n FROM polices GROUP BY bureau) x), '{}') AS bureaux,
            COALESCE((SELECT max(n) FROM (SELECT count(*)::int AS n FROM polices GROUP BY jour) y), 0) AS max_jour
       FROM code_prescripteur c JOIN intervenant i ON i.id = c.intervenant_id JOIN tiers t ON t.id = i.tiers_id WHERE c.id = $1`, [codePrescripteurId, jours])).rows[0];
  if (!r || r.nombre < seuil) return null;
  return leverAlerte(q, acteur, {
    type: 'CONCENTRATION_CODE_PRESCRIPTEUR', objet: { type: 'code_prescripteur', id: codePrescripteurId }, gravite: r.nombre >= 2 * seuil ? 'FORTE' : 'MOYENNE',
    description: `Code ${r.code} (${r.prescripteur}) : ${r.nombre} polices en ${jours} jours (seuil ${seuil}) ; jusqu'à ${r.max_jour} le même jour`,
    donnees: { code: r.code, nombre: r.nombre, seuil, jours, bureaux: r.bureaux, maxJour: r.max_jour },
  });
}
