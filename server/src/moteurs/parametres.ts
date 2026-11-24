/**
 * Paramètres historisés (DD 4.14 à 4.16 ; CDC § 5.6, ARC-RG-003, DEV-RG-004).
 *
 * - La valeur à une date est celle du dernier changement dont la date d'effet est atteinte.
 * - Un paramètre lié à une règle légale verrouillée ne peut évoluer que dans le sens protecteur
 *   (sens_protecteur) et jamais en deçà de sa valeur par défaut légale.
 * - Une règle verrouillée reste en mode BLOQUANT.
 */
import type { Executant } from '../db/pool.js';
import { ErreurMetier, exiger, nonTrouve } from '../noyau/erreurs.js';
import { journaliser } from './audit.js';
import type { Acteur } from '../noyau/acteur.js';

export type TypeValeur = 'ENTIER' | 'MONTANT' | 'TAUX' | 'DUREE' | 'BOOLEEN' | 'TEXTE' | 'LISTE';

export interface Parametre {
  id: string; code: string; libelle: string; module: string; type_valeur: TypeValeur;
  valeur: string; valeur_defaut: string; regle_legale_id: string | null; date_effet: string;
  sens_protecteur: 'HAUSSE' | 'BAISSE' | null; verrouillee: boolean | null;
}

const aujourdhui = () => new Date().toISOString().slice(0, 10);

export function controlerValeur(type: TypeValeur, valeur: string): void {
  const ok = {
    ENTIER: /^-?\d+$/, MONTANT: /^\d+$/, TAUX: /^(0(\.\d{1,6})?|1(\.0+)?)$/, DUREE: /^\d+$/,
    BOOLEEN: /^(OUI|NON)$/, TEXTE: /^[\s\S]*$/, LISTE: /^[\s\S]*$/,
  }[type].test(valeur);
  exiger(ok, 'VALEUR_INVALIDE', `Valeur « ${valeur} » invalide pour un paramètre de type ${type}`);
}

async function charger(q: Executant, code: string): Promise<Parametre> {
  const r = await q.query<Parametre>(
    `SELECT p.*, r.verrouillee FROM parametre p LEFT JOIN regle_legale r ON r.id = p.regle_legale_id
     WHERE p.code = $1 AND p.supprime_le IS NULL`, [code]);
  if (!r.rows[0]) throw nonTrouve(`Paramètre ${code}`);
  return r.rows[0];
}

/** Valeur en vigueur à une date (par défaut aujourd'hui). */
export async function valeurParametre(q: Executant, code: string, date = aujourdhui()): Promise<string> {
  const p = await charger(q, code);
  const h = await q.query<{ nouvelle_valeur: string }>(
    `SELECT nouvelle_valeur FROM parametre_historique WHERE parametre_id = $1 AND date_effet <= $2
     ORDER BY date_effet DESC, cree_le DESC LIMIT 1`, [p.id, date]);
  return h.rows[0]?.nouvelle_valeur ?? p.valeur_defaut;
}

export async function entier(q: Executant, code: string, date?: string): Promise<number> {
  return Number(await valeurParametre(q, code, date));
}

export async function booleen(q: Executant, code: string, date?: string): Promise<boolean> {
  return (await valeurParametre(q, code, date)) === 'OUI';
}

/** Contrôle d'une nouvelle valeur au regard de la règle légale portée (ARC-RG-003). */
export async function controlerChangement(q: Executant, code: string, nouvelle: string): Promise<Parametre> {
  const p = await charger(q, code);
  controlerValeur(p.type_valeur, nouvelle);
  if (p.verrouillee) {
    exiger(p.sens_protecteur, 'REGLE_VERROUILLEE', `Le paramètre ${code} porte une règle d'ordre public : il n'est pas modifiable`);
    const n = Number(nouvelle), d = Number(p.valeur_defaut);
    const protecteur = p.sens_protecteur === 'HAUSSE' ? n >= d : n <= d;
    exiger(protecteur, 'REGLE_VERROUILLEE',
      `Le paramètre ${code} porte une règle d'ordre public : la valeur ne peut être que ${p.sens_protecteur === 'HAUSSE' ? 'supérieure' : 'inférieure'} ou égale au minimum légal (${p.valeur_defaut})`);
  }
  return p;
}

/**
 * Applique un changement de paramètre (après décision du comité de paramétrage le cas échéant).
 * Appelé par le moteur de validation ; ne vérifie pas les droits.
 */
export async function appliquerChangement(
  q: Executant, acteur: Acteur, code: string, nouvelle: string, dateEffet: string, decisionId: string | null,
): Promise<void> {
  const p = await controlerChangement(q, code, nouvelle);
  const ancienne = await valeurParametre(q, code, dateEffet);
  exiger(ancienne !== nouvelle, 'VALEUR_INCHANGEE', 'La nouvelle valeur est identique à la valeur en vigueur');
  await q.query(
    `INSERT INTO parametre_historique (parametre_id, ancienne_valeur, nouvelle_valeur, date_effet, auteur_id, decision_comite_id)
     VALUES ($1,$2,$3,$4,$5,$6)`, [p.id, ancienne, nouvelle, dateEffet, acteur.utilisateurId, decisionId]);
  if (dateEffet <= aujourdhui()) {
    await q.query('UPDATE parametre SET valeur=$2, date_effet=$3 WHERE id=$1', [p.id, nouvelle, dateEffet]);
  }
  await journaliser(q, {
    ...acteur.trace(), action: 'PARAMETRAGE', objetType: 'parametre', objetId: p.id,
    avant: { code, valeur: ancienne }, apres: { code, valeur: nouvelle, date_effet: dateEffet },
  });
}

/** Mode d'une règle légale : une règle verrouillée est toujours BLOQUANT. */
export async function modeRegle(q: Executant, code: string): Promise<'BLOQUANT' | 'ALERTE' | 'DESACTIVE'> {
  const r = await q.query<{ mode: 'BLOQUANT' | 'ALERTE' | 'DESACTIVE'; verrouillee: boolean }>(
    'SELECT mode, verrouillee FROM regle_legale WHERE code=$1 AND supprime_le IS NULL', [code]);
  if (!r.rows[0]) throw new ErreurMetier('REGLE_INCONNUE', `Règle légale ${code} non paramétrée`, 500);
  return r.rows[0].verrouillee ? 'BLOQUANT' : r.rows[0].mode;
}
