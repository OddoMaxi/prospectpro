/**
 * Prescripteurs partenaires et code prescripteur (CDC § 7.5.9 ; COM-RG-064, 080 à 084 ; CA-COM-13, 19).
 *
 * - Le code est choisi avec le prescripteur, normalisé (majuscules, sans accents ni espaces), de 4 à 20 caractères.
 * - Il ne doit ni égaler un code existant ou retiré, ni en différer d'un seul caractère, ni en être l'inversion de deux
 *   caractères voisins, ni figurer parmi les mots interdits ; les caractères visuellement proches sont assimilés.
 * - Un code validé est unique et jamais réutilisé ; il peut être suspendu ou retiré ; il ne donne aucune réduction.
 * - Le prescripteur ne voit que des statistiques anonymes.
 */
import type { Executant } from '../../db/pool.js';
import type { Acteur } from '../../noyau/acteur.js';
import { ErreurMetier, exiger, nonTrouve } from '../../noyau/erreurs.js';
import { journaliser } from '../../moteurs/audit.js';
import { entier, valeurParametre } from '../../moteurs/parametres.js';

/** COM-RG-080 : majuscules, sans accents, sans espaces ni ponctuation. */
export function normaliserCode(code: string): string {
  return code.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** COM-RG-081 : caractères visuellement proches assimilés avant comparaison (O/0 ; I/L/1 ; S/5 ; B/8). */
export function formeCanonique(code: string): string {
  return normaliserCode(code).replace(/O/g, '0').replace(/[IL]/g, '1').replace(/S/g, '5').replace(/B/g, '8');
}

/** Vrai si a et b diffèrent d'un seul caractère (substitution, ajout ou retrait) ou de l'inversion de deux voisins. */
export function tropProches(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length === b.length) {
    const diff = [...a].map((c, i) => (c === b[i] ? -1 : i)).filter(i => i >= 0);
    if (diff.length === 1) return true;
    if (diff.length === 2 && diff[1] === diff[0]! + 1 && a[diff[0]!] === b[diff[1]!] && a[diff[1]!] === b[diff[0]!]) return true;
    return false;
  }
  if (Math.abs(a.length - b.length) !== 1) return false;
  const [court, long] = a.length < b.length ? [a, b] : [b, a];
  for (let i = 0; i < long.length; i++) if (long.slice(0, i) + long.slice(i + 1) === court) return true;
  return false;
}

/** Contrôles d'un code demandé ; renvoie le code normalisé ou lève le motif de refus. */
export async function controlerCode(q: Executant, demande: string): Promise<string> {
  const code = normaliserCode(demande);
  const [min, max] = [await entier(q, 'COM_CODE_PRESCRIPTEUR_MIN'), await entier(q, 'COM_CODE_PRESCRIPTEUR_MAX')];
  exiger(code.length >= min && code.length <= max, 'CODE_LONGUEUR', `Le code compte de ${min} à ${max} lettres ou chiffres`);
  const canon = formeCanonique(code);
  // Mots interdits (injures, noms de la Compagnie ou de concurrents) et formats de numéros de police ou de carte
  const interdits = (await valeurParametre(q, 'COM_CODES_INTERDITS')).split(',').map(m => formeCanonique(m.trim())).filter(Boolean);
  if (interdits.some(m => canon.includes(m))) throw new ErreurMetier('CODE_INTERDIT', 'Ce code contient un mot interdit', 422);
  if (/^\d{8,}$/.test(code) || /^CP\d+$/.test(code)) throw new ErreurMetier('CODE_INTERDIT', 'Un code ne reprend pas le format d\'un numéro de police ou de carte', 422);
  // Codes existants, y compris suspendus et retirés : jamais réutilisés
  const existants = (await q.query<{ code_normalise: string }>('SELECT code_normalise FROM code_prescripteur')).rows;
  const proche = existants.find(e => tropProches(formeCanonique(e.code_normalise), canon));
  if (proche) {
    const motif = proche.code_normalise === code ? 'existe déjà' : formeCanonique(proche.code_normalise) === canon ? 'se confond avec un code existant (caractères visuellement proches)' : 'est trop proche d\'un code existant';
    throw new ErreurMetier('CODE_TROP_PROCHE', `Le code ${code} ${motif} : choisissez-en un autre`, 409);
  }
  return code;
}

/** COM-RG-064, 082 : attribution d'un code à un prescripteur actif, par la Direction commerciale. */
export async function attribuerCode(q: Executant, acteur: Acteur, intervenantId: string, demande: string): Promise<{ id: string; code: string }> {
  const i = (await q.query<{ role: string; statut: string }>('SELECT role, statut FROM intervenant WHERE id = $1 AND supprime_le IS NULL', [intervenantId])).rows[0];
  if (!i) throw nonTrouve('Intervenant');
  exiger(i.role === 'PRESCRIPTEUR', 'ROLE_INVALIDE', 'Un code prescripteur s\'attribue à un prescripteur partenaire');
  exiger(i.statut === 'ACTIF', 'STATUT_INVALIDE', 'Le prescripteur doit être agréé (contrat écrit validé) avant d\'obtenir un code');
  const code = await controlerCode(q, demande);
  const r = await q.query<{ id: string }>(
    `INSERT INTO code_prescripteur (intervenant_id, code, code_normalise, statut, valide_le) VALUES ($1,$2,$2,'ACTIF',current_date) RETURNING id`, [intervenantId, code]);
  await journaliser(q, { ...acteur.trace(), action: 'CREATION', objetType: 'code_prescripteur', objetId: r.rows[0]!.id, apres: { intervenantId, code } });
  return { id: r.rows[0]!.id, code };
}

export async function changerStatutCode(q: Executant, acteur: Acteur, codeId: string, statut: 'ACTIF' | 'SUSPENDU' | 'RETIRE', motif: string) {
  exiger(motif?.trim(), 'MOTIF_REQUIS', 'Motif obligatoire');
  const c = (await q.query<{ statut: string }>('SELECT statut FROM code_prescripteur WHERE id = $1 FOR UPDATE', [codeId])).rows[0];
  if (!c) throw nonTrouve('Code prescripteur');
  exiger(c.statut !== 'RETIRE', 'CODE_RETIRE', 'Un code retiré ne revient jamais en service (COM-RG-082)');
  await q.query('UPDATE code_prescripteur SET statut = $2 WHERE id = $1', [codeId, statut]);
  await journaliser(q, { ...acteur.trace(), action: 'MODIFICATION', objetType: 'code_prescripteur', objetId: codeId, avant: { statut: c.statut }, apres: { statut, motif } });
}

/** COM-RG-083 : code saisi à la souscription ; seul un code actif d'un prescripteur actif est accepté. */
export async function codeActif(q: Executant, saisi: string): Promise<{ id: string; intervenantId: string; code: string }> {
  const code = normaliserCode(saisi);
  const r = (await q.query<{ id: string; intervenant_id: string; statut: string; intervenant_statut: string }>(
    `SELECT c.id, c.intervenant_id, c.statut, i.statut AS intervenant_statut FROM code_prescripteur c JOIN intervenant i ON i.id = c.intervenant_id
      WHERE c.code_normalise = $1 AND c.supprime_le IS NULL`, [code])).rows[0];
  if (!r || r.statut !== 'ACTIF' || r.intervenant_statut !== 'ACTIF') throw new ErreurMetier('CODE_INCONNU', `Code prescripteur ${code} inconnu ou inactif`, 422);
  return { id: r.id, intervenantId: r.intervenant_id, code };
}

export async function listerCodes(q: Executant, intervenantId?: string) {
  return (await q.query(
    `SELECT c.id, c.code, c.statut, c.valide_le, c.intervenant_id, trim(t.nom || ' ' || COALESCE(t.prenoms, '')) AS prescripteur,
            (SELECT count(DISTINCT pi.police_id)::int FROM police_intervenant pi WHERE pi.intervenant_id = c.intervenant_id AND pi.qualite = 'PRESCRIPTEUR') AS polices
       FROM code_prescripteur c JOIN intervenant i ON i.id = c.intervenant_id JOIN tiers t ON t.id = i.tiers_id
      WHERE ($1::uuid IS NULL OR c.intervenant_id = $1) ORDER BY c.code`, [intervenantId ?? null])).rows;
}

/** COM-RG-084 : statistiques anonymes du prescripteur, par mois ; alerte de concentration (plus de N polices un même jour). */
export async function statistiquesPrescripteur(q: Executant, intervenantId: string) {
  const mois = (await q.query<{ mois: string; polices: number; renouvellements: number; commissions: number }>(
    `WITH periodes AS (SELECT to_char(pp.date_debut, 'YYYY-MM') AS mois, count(*) FILTER (WHERE pp.rang = 1)::int AS polices, count(*) FILTER (WHERE pp.rang > 1)::int AS renouvellements
                         FROM police_intervenant pi JOIN police_periode pp ON pp.police_id = pi.police_id
                        WHERE pi.intervenant_id = $1 AND pi.qualite = 'PRESCRIPTEUR' GROUP BY 1),
          commissions AS (SELECT to_char(c.cree_le, 'YYYY-MM') AS mois, sum(c.montant)::bigint AS montant FROM commission c
                           WHERE c.intervenant_id = $1 AND c.statut <> 'REPRISE' GROUP BY 1)
     SELECT p.mois, p.polices, p.renouvellements, COALESCE(c.montant, 0)::bigint AS commissions FROM periodes p LEFT JOIN commissions c ON c.mois = p.mois
      ORDER BY p.mois DESC LIMIT 12`, [intervenantId])).rows;
  const pic = (await q.query<{ n: number }>(
    `SELECT COALESCE(max(n), 0)::int AS n FROM (SELECT count(*) AS n FROM police_intervenant pi JOIN police p ON p.id = pi.police_id
      WHERE pi.intervenant_id = $1 AND pi.qualite = 'PRESCRIPTEUR' GROUP BY p.date_premiere_effet) x`, [intervenantId])).rows[0]!.n;
  return { mois: mois.map(m => ({ ...m, commissions: Number(m.commissions) })), concentration: pic >= 10 };
}
