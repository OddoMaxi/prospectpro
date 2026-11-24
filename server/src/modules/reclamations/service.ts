/**
 * Réclamations (CDC § 8.10 ; DD reclamation). Module unique pour toute la Compagnie : production, santé, sinistres
 * (dont le réexamen d'un rejet), commissions, portails et données personnelles y aboutissent.
 *
 * Cycle : OUVERTE → AFFECTEE → EN_COURS → REPONDUE → CLOSE ; ESCALADEE si l'échéance est dépassée sans réponse.
 * Échéance : RECLAMATION_DELAI_JOURS_OUVRABLES jours ouvrables (15 par défaut) après la réception.
 */
import type { Executant } from '../../db/pool.js';
import type { Acteur } from '../../noyau/acteur.js';
import { exiger, interdit, nonTrouve } from '../../noyau/erreurs.js';
import { aujourdhui } from '../../noyau/dates.js';
import { journaliser } from '../../moteurs/audit.js';
import { entier } from '../../moteurs/parametres.js';
import { attribuer } from '../../moteurs/numerotation.js';
import { notifier } from '../../moteurs/notifications.js';
import { publier } from '../../moteurs/evenements.js';
import { ajouterJoursOuvrables } from '../referentiels/calendrier.js';
import { controlerDroit } from '../habilitations/droits.js';

export const OBJETS_RECLAMATION = ['PRODUCTION', 'SANTE', 'SINISTRE', 'COMMISSION', 'PORTAIL', 'DONNEES_PERSONNELLES'] as const;
export const CANAUX = ['SMS', 'WHATSAPP', 'COURRIEL', 'APPLICATION', 'USSD', 'COURRIER'] as const;
type Statut = 'OUVERTE' | 'AFFECTEE' | 'EN_COURS' | 'ESCALADEE' | 'REPONDUE' | 'CLOSE';

interface Reclamation {
  id: string; numero: string; tiers_id: string; statut: Statut; gestionnaire_id: string | null; echeance: string; objet: string;
}

async function charger(q: Executant, id: string): Promise<Reclamation> {
  const r = await q.query<Reclamation>('SELECT * FROM reclamation WHERE id = $1 AND supprime_le IS NULL FOR UPDATE', [id]);
  if (!r.rows[0]) throw nonTrouve('Réclamation');
  return r.rows[0];
}

/** Message au réclamant sur son téléphone, s'il en a un ; un échec d'envoi n'empêche pas l'enregistrement. */
async function informer(q: Executant, tiersId: string, code: string, variables: Record<string, string>, objetId: string) {
  const t = (await q.query<{ telephone: string | null }>('SELECT telephone FROM tiers WHERE id = $1', [tiersId])).rows[0];
  if (!t?.telephone) return;
  await notifier(q, { tiersId, code, canal: 'SMS', adresse: t.telephone, variables, objet: { type: 'reclamation', id: objetId } }).catch(() => undefined);
}

export async function enregistrerReclamation(q: Executant, acteur: Acteur, d: {
  tiersId: string; canal: typeof CANAUX[number]; objet: typeof OBJETS_RECLAMATION[number];
  objetType?: string; objetId?: string; description: string; dateReception?: string;
}) {
  exiger(d.description?.trim(), 'DESCRIPTION_REQUISE', 'Description obligatoire');
  exiger(OBJETS_RECLAMATION.includes(d.objet), 'OBJET_INVALIDE', 'Objet de réclamation inconnu');
  exiger(!!d.objetType === !!d.objetId, 'OBJET_INCOMPLET', 'Objet concerné : type et identifiant vont ensemble');
  const t = await q.query('SELECT 1 FROM tiers WHERE id = $1 AND supprime_le IS NULL', [d.tiersId]);
  if (!t.rowCount) throw nonTrouve('Réclamant');
  const reception = d.dateReception ?? aujourdhui();
  const echeance = await ajouterJoursOuvrables(q, reception, await entier(q, 'RECLAMATION_DELAI_JOURS_OUVRABLES', reception));
  const numero = await attribuer(q, acteur, { type: 'RECLAMATION', annee: Number(reception.slice(0, 4)) });
  const r = await q.query<{ id: string }>(
    `INSERT INTO reclamation (numero, tiers_id, canal, objet, objet_type, objet_id, description, echeance, statut)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'OUVERTE') RETURNING id`,
    [numero, d.tiersId, d.canal, d.objet, d.objetType ?? null, d.objetId ?? null, d.description.trim(), echeance]);
  const id = r.rows[0]!.id;
  await journaliser(q, { ...acteur.trace(), action: 'CREATION', objetType: 'reclamation', objetId: id, apres: { ...d, numero, echeance } });
  await publier(q, acteur, { type: 'RECLAMATION_ENREGISTREE', objet: { type: 'reclamation', id }, charge: { numero, objet: d.objet, echeance }, cleIdempotence: `reclamation:${id}:enregistree` });
  await informer(q, d.tiersId, 'RECLAMATION_RECUE', { numero, echeance: echeance.split('-').reverse().join('/') }, id);
  return { id, numero, echeance };
}

/** Affectation à un gestionnaire habilité (droit de traitement des réclamations). */
export async function affecterReclamation(q: Executant, acteur: Acteur, id: string, gestionnaireId: string) {
  const r = await charger(q, id);
  exiger(!['REPONDUE', 'CLOSE'].includes(r.statut), 'RECLAMATION_CLOSE', 'Réclamation déjà traitée');
  await controlerDroit(q, gestionnaireId, 'RECLAMATIONS', 'MODIFIER')
    .catch(() => { throw interdit('Ce gestionnaire n\'est pas habilité à traiter les réclamations'); });
  const statut: Statut = r.statut === 'ESCALADEE' ? 'ESCALADEE' : 'AFFECTEE';
  await q.query('UPDATE reclamation SET gestionnaire_id = $2, statut = $3 WHERE id = $1', [id, gestionnaireId, statut]);
  await journaliser(q, { ...acteur.trace(), action: 'MODIFICATION', objetType: 'reclamation', objetId: id, avant: { gestionnaire_id: r.gestionnaire_id }, apres: { gestionnaire_id: gestionnaireId, statut } });
}

export async function prendreEnCharge(q: Executant, acteur: Acteur, id: string) {
  const r = await charger(q, id);
  exiger(r.gestionnaire_id === acteur.utilisateurId, 'NON_AFFECTEE', 'Seul le gestionnaire affecté prend en charge la réclamation', 403);
  exiger(r.statut === 'AFFECTEE', 'STATUT_INVALIDE', 'Réclamation non affectée ou déjà en cours');
  await q.query(`UPDATE reclamation SET statut = 'EN_COURS' WHERE id = $1`, [id]);
  await journaliser(q, { ...acteur.trace(), action: 'MODIFICATION', objetType: 'reclamation', objetId: id, apres: { statut: 'EN_COURS' } });
}

export async function repondreReclamation(q: Executant, acteur: Acteur, id: string, reponse: string) {
  exiger(reponse?.trim(), 'REPONSE_REQUISE', 'Réponse obligatoire');
  const r = await charger(q, id);
  exiger(r.gestionnaire_id === acteur.utilisateurId, 'NON_AFFECTEE', 'Seul le gestionnaire affecté répond à la réclamation', 403);
  exiger(['AFFECTEE', 'EN_COURS', 'ESCALADEE'].includes(r.statut), 'STATUT_INVALIDE', 'Réclamation déjà répondue ou close');
  await q.query(`UPDATE reclamation SET statut = 'REPONDUE', reponse = $2, repondu_le = now() WHERE id = $1`, [id, reponse.trim()]);
  await journaliser(q, { ...acteur.trace(), action: 'MODIFICATION', objetType: 'reclamation', objetId: id, apres: { statut: 'REPONDUE', reponse } });
  await publier(q, acteur, { type: 'RECLAMATION_REPONDUE', objet: { type: 'reclamation', id }, charge: { numero: r.numero }, cleIdempotence: `reclamation:${id}:repondue` });
  await informer(q, r.tiers_id, 'RECLAMATION_REPONDUE', { numero: r.numero }, id);
}

export async function cloreReclamation(q: Executant, acteur: Acteur, id: string) {
  const r = await charger(q, id);
  exiger(r.statut === 'REPONDUE', 'STATUT_INVALIDE', 'Seule une réclamation répondue peut être close');
  await q.query(`UPDATE reclamation SET statut = 'CLOSE' WHERE id = $1`, [id]);
  await journaliser(q, { ...acteur.trace(), action: 'MODIFICATION', objetType: 'reclamation', objetId: id, apres: { statut: 'CLOSE' } });
}

/** Traitement quotidien : escalade automatique des réclamations sans réponse à l'échéance. */
export async function escaladerReclamations(q: Executant, acteur: Acteur, date = aujourdhui()) {
  const r = await q.query<{ id: string; numero: string; objet: string; echeance: string }>(
    `UPDATE reclamation SET statut = 'ESCALADEE'
      WHERE statut IN ('OUVERTE', 'AFFECTEE', 'EN_COURS') AND echeance < $1 AND supprime_le IS NULL
      RETURNING id, numero, objet, echeance`, [date]);
  for (const x of r.rows) {
    await journaliser(q, { ...acteur.trace(), action: 'MODIFICATION', objetType: 'reclamation', objetId: x.id, apres: { statut: 'ESCALADEE', echeance: x.echeance } });
    await publier(q, acteur, { type: 'RECLAMATION_ESCALADEE', objet: { type: 'reclamation', id: x.id }, charge: { numero: x.numero, objet: x.objet, echeance: x.echeance }, cleIdempotence: `reclamation:${x.id}:escaladee` });
  }
  return r.rows.map(x => x.numero);
}

export async function listerReclamations(q: Executant, f: { statut?: Statut; objet?: string; gestionnaireId?: string; enRetard?: boolean }) {
  return (await q.query(
    `SELECT r.id, r.numero, r.canal, r.objet, r.statut, r.echeance, r.cree_le, r.repondu_le, t.code_tiers, t.nom, t.prenoms, u.identifiant AS gestionnaire,
            (r.statut NOT IN ('REPONDUE', 'CLOSE') AND r.echeance < current_date) AS en_retard
       FROM reclamation r JOIN tiers t ON t.id = r.tiers_id LEFT JOIN utilisateur u ON u.id = r.gestionnaire_id
      WHERE r.supprime_le IS NULL AND ($1::text IS NULL OR r.statut = $1) AND ($2::text IS NULL OR r.objet = $2)
        AND ($3::uuid IS NULL OR r.gestionnaire_id = $3)
        AND (NOT $4::boolean OR (r.statut NOT IN ('REPONDUE', 'CLOSE') AND r.echeance < current_date))
      ORDER BY r.echeance, r.numero LIMIT 500`, [f.statut ?? null, f.objet ?? null, f.gestionnaireId ?? null, f.enRetard ?? false])).rows;
}

export async function lireReclamation(q: Executant, id: string) {
  const r = await q.query(
    `SELECT r.*, t.code_tiers, t.nom, t.prenoms, u.identifiant AS gestionnaire FROM reclamation r JOIN tiers t ON t.id = r.tiers_id
       LEFT JOIN utilisateur u ON u.id = r.gestionnaire_id WHERE r.id = $1 AND r.supprime_le IS NULL`, [id]);
  if (!r.rows[0]) throw nonTrouve('Réclamation');
  return r.rows[0];
}

/** Indicateurs du § 8.10 : nombre, motifs (objets), délais. Les délais sont en jours calendaires. */
export async function indicateursReclamations(q: Executant, du: string, au: string) {
  const r = await q.query(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE statut IN ('REPONDUE', 'CLOSE'))::int AS repondues,
            count(*) FILTER (WHERE statut IN ('REPONDUE', 'CLOSE') AND repondu_le::date <= echeance)::int AS dans_les_delais,
            count(*) FILTER (WHERE statut NOT IN ('REPONDUE', 'CLOSE') AND echeance < current_date)::int AS en_retard,
            count(*) FILTER (WHERE statut = 'ESCALADEE')::int AS escaladees,
            round(avg(extract(epoch FROM repondu_le - cree_le) / 86400) FILTER (WHERE repondu_le IS NOT NULL)::numeric, 1)::float AS delai_moyen_jours,
            COALESCE((SELECT json_object_agg(objet, n) FROM (SELECT objet, count(*)::int n FROM reclamation
                       WHERE supprime_le IS NULL AND cree_le::date BETWEEN $1 AND $2 GROUP BY objet) o), '{}') AS par_objet
       FROM reclamation WHERE supprime_le IS NULL AND cree_le::date BETWEEN $1 AND $2`, [du, au]);
  return r.rows[0];
}
