/**
 * Plan de comptes : ce qu'exige le socle (CDC § 11.4 et 11.5 ; FIN-RG-001, 003, 012, 073, 078).
 * Le reste du module comptable (écritures, journaux, exercices) relève du lot Finances.
 *
 * - Numéro des comptes généraux sur une longueur fixe, complété par des zéros à droite (FIN-RG-073).
 * - Comptes auxiliaires : préfixe significatif du collectif + séquence, longueur paramétrée (FIN_LONGUEUR_AUXILIAIRES),
 *   capacité restante contrôlée avec alerte à 90 % (FIN-RG-003) ; un seul auxiliaire par tiers et par collectif (FIN-RG-012).
 */
import type { Executant } from '../../db/pool.js';
import type { Acteur } from '../../noyau/acteur.js';
import { ErreurMetier, exiger, nonTrouve } from '../../noyau/erreurs.js';
import { aujourdhui } from '../../noyau/dates.js';
import { journaliser } from '../../moteurs/audit.js';
import { entier } from '../../moteurs/parametres.js';
import { prochaineValeur } from '../../moteurs/numerotation.js';

export const LONGUEUR_COMPTES = 8;
const ALERTE_COLLECTIF = 0.9;

export function normaliserNumero(numero: string, longueur = LONGUEUR_COMPTES): string {
  const n = numero.trim();
  exiger(/^\d+$/.test(n) && n.length <= longueur, 'NUMERO_COMPTE_INVALIDE', `Numéro de compte : chiffres uniquement, ${longueur} au plus`);
  return n.padEnd(longueur, '0');
}

/** Préfixe significatif : le numéro sans les zéros de complétion (46810000 → 4681). */
export const prefixeCollectif = (numero: string) => numero.replace(/0+$/, '') || numero;

export async function creerNature(q: Executant, acteur: Acteur, d: { code: string; libelle: string; trancheDefaut: string; controles?: object }) {
  const r = await q.query<{ id: string }>('INSERT INTO nature_compte (code, libelle, tranche_defaut, controles) VALUES ($1,$2,$3,$4) RETURNING id',
    [d.code, d.libelle, d.trancheDefaut, JSON.stringify(d.controles ?? {})]);
  await journaliser(q, { ...acteur.trace(), action: 'CREATION', objetType: 'nature_compte', objetId: r.rows[0]!.id, apres: d });
  return r.rows[0]!.id;
}

/** Nature proposée selon la tranche (FIN-RG-078) : la tranche par défaut la plus longue qui préfixe le numéro. */
export async function natureProposee(q: Executant, numero: string): Promise<string | null> {
  const r = await q.query<{ id: string }>(
    `SELECT id FROM nature_compte WHERE supprime_le IS NULL AND $1 LIKE tranche_defaut || '%' ORDER BY length(tranche_defaut) DESC LIMIT 1`, [numero]);
  return r.rows[0]?.id ?? null;
}

export interface DonneesCompte {
  numero: string; libelle: string; natureId?: string; parentNumero?: string; imputable?: boolean; collectif?: boolean;
  sensHabituel?: 'D' | 'C'; reportANouveau?: 'AUCUN' | 'SOLDE' | 'DETAIL'; lettrable?: boolean; ligneEtatBcrg?: string; dateEffet?: string;
}

export async function creerCompteGeneral(q: Executant, acteur: Acteur, d: DonneesCompte): Promise<string> {
  const numero = normaliserNumero(d.numero);
  const classe = numero[0]!;
  exiger(/[1-7]/.test(classe), 'CLASSE_INVALIDE', 'Classe de compte : 1 à 7 (plan BCRG)');
  const natureId = d.natureId ?? await natureProposee(q, numero);
  exiger(natureId, 'NATURE_REQUISE', 'Aucune nature ne correspond à ce numéro : précisez-la');
  const parent = d.parentNumero
    ? (await q.query<{ id: string }>('SELECT id FROM compte WHERE numero = $1', [normaliserNumero(d.parentNumero)])).rows[0]?.id ?? null
    : null;
  exiger(!d.parentNumero || parent, 'PARENT_INCONNU', 'Compte parent introuvable');
  const collectif = d.collectif ?? false;
  const imputable = d.imputable ?? true;
  exiger(!collectif || imputable, 'COLLECTIF_IMPUTABLE', 'Un compte collectif est imputable (FIN-RG-012)');
  const r = await q.query<{ id: string }>(
    `INSERT INTO compte (numero, libelle, classe, parent_id, type, nature_id, imputable, collectif, sens_habituel, report_a_nouveau,
                         lettrable, analytique_obligatoire, ligne_etat_bcrg, en_sommeil, date_effet)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,false,$12,false,$13) RETURNING id`,
    [numero, d.libelle, classe, parent, Number(classe) <= 5 ? 'BILAN' : 'GESTION', natureId, imputable, collectif,
      d.sensHabituel ?? (Number(classe) === 7 ? 'C' : 'D'), d.reportANouveau ?? (Number(classe) <= 5 ? (collectif ? 'DETAIL' : 'SOLDE') : 'AUCUN'),
      d.lettrable ?? collectif, d.ligneEtatBcrg ?? 'A_RATTACHER', d.dateEffet ?? aujourdhui()])
    .catch(e => { if (e.code === '23505') throw new ErreurMetier('COMPTE_EXISTANT', `Le compte ${numero} existe déjà`, 409); throw e; });
  await journaliser(q, { ...acteur.trace(), action: 'CREATION', objetType: 'compte', objetId: r.rows[0]!.id, apres: { ...d, numero } });
  return r.rows[0]!.id;
}

/**
 * Ouvre le compte auxiliaire d'un tiers sous un collectif ; renvoie le compte existant s'il y en a déjà un.
 * Code : préfixe du collectif + séquence propre au collectif, sur la longueur paramétrée.
 */
export async function ouvrirCompteAuxiliaire(q: Executant, acteur: Acteur, tiersId: string, numeroCollectif: string, options: { nouveau?: boolean } = {}) {
  const c = await q.query<{ id: string; numero: string; collectif: boolean; imputable: boolean; en_sommeil: boolean }>(
    'SELECT id, numero, collectif, imputable, en_sommeil FROM compte WHERE numero = $1 AND supprime_le IS NULL', [normaliserNumero(numeroCollectif)]);
  const coll = c.rows[0];
  if (!coll) throw new ErreurMetier('COLLECTIF_ABSENT', `Le compte collectif ${numeroCollectif} n'existe pas dans le plan de comptes`, 422);
  exiger(coll.collectif && coll.imputable && !coll.en_sommeil, 'COLLECTIF_INVALIDE', `Le compte ${coll.numero} n'est pas un collectif actif`);
  // Un auxiliaire par tiers et par collectif (FIN-RG-012), sauf demande expresse : compte de production de chaque bureau (COM-RG-003, X24)
  await q.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`auxiliaire:${tiersId}:${coll.id}`]);
  const existant = await q.query<{ id: string; code: string }>('SELECT id, code FROM compte_auxiliaire WHERE tiers_id = $1 AND collectif_id = $2 ORDER BY cree_le LIMIT 1', [tiersId, coll.id]);
  if (existant.rows[0] && !options.nouveau) return { ...existant.rows[0], cree: false, alerte: null as string | null };

  const longueur = await entier(q, 'FIN_LONGUEUR_AUXILIAIRES');
  const prefixe = prefixeCollectif(coll.numero);
  const chiffres = longueur - prefixe.length;
  exiger(chiffres >= 2, 'LONGUEUR_INSUFFISANTE', `Longueur des auxiliaires (${longueur}) insuffisante pour le collectif ${prefixe}`, 500);
  const capacite = 10 ** chiffres - 1;
  const { valeur } = await prochaineValeur(q, 'COMPTE_AUXILIAIRE', coll.numero, capacite);
  const code = prefixe + String(valeur).padStart(chiffres, '0');
  const r = await q.query<{ id: string }>(
    `INSERT INTO compte_auxiliaire (code, tiers_id, collectif_id, statut) VALUES ($1,$2,$3,'ACTIF') RETURNING id`, [code, tiersId, coll.id]);
  const alerte = valeur >= Math.ceil(capacite * ALERTE_COLLECTIF) ? `Collectif ${prefixe} : ${valeur} comptes sur ${capacite}` : null;
  await journaliser(q, { ...acteur.trace(), action: 'CREATION', objetType: 'compte_auxiliaire', objetId: r.rows[0]!.id, apres: { code, tiersId, collectif: coll.numero, alerte } });
  return { id: r.rows[0]!.id, code, cree: true, alerte };
}

export async function listerComptes(q: Executant) {
  return (await q.query(
    `SELECT c.id, c.numero, c.libelle, c.classe, c.type, c.imputable, c.collectif, c.sens_habituel, c.en_sommeil, n.code AS nature,
            (SELECT count(*)::int FROM compte_auxiliaire a WHERE a.collectif_id = c.id) AS auxiliaires
       FROM compte c JOIN nature_compte n ON n.id = c.nature_id WHERE c.supprime_le IS NULL ORDER BY c.numero`)).rows;
}

export async function compteParNumero(q: Executant, numero: string) {
  const r = await q.query('SELECT * FROM compte WHERE numero = $1', [normaliserNumero(numero)]);
  if (!r.rows[0]) throw nonTrouve('Compte');
  return r.rows[0];
}

/**
 * Code taxe (DD code_taxe ; FIN-RG-080 et suivants). Un changement de taux est une nouvelle ligne du même code avec sa date d'effet :
 * les calculs retiennent la version en vigueur à la date de l'opération.
 */
export async function creerCodeTaxe(q: Executant, acteur: Acteur, d: {
  code: string; libelle: string; type: 'TAXE_PRIMES' | 'COLLECTEE' | 'DEDUCTIBLE' | 'RETENUE_SOURCE'; taux: number;
  assiette: 'PRIME_NETTE' | 'PRIME_NETTE_ACCESSOIRES' | 'COMMISSION' | 'HT'; compteNumero: string;
  exigibilite: 'EMISSION' | 'ENCAISSEMENT'; regime?: 'NON_RECUPERABLE' | 'RECUPERABLE' | 'PARTIEL'; pourcentageRecuperable?: number; dateEffet?: string;
}): Promise<string> {
  exiger(d.taux >= 0 && d.taux <= 1, 'TAUX_INVALIDE', 'Taux : entre 0 et 1 (ex. 0,05 pour 5 %)');
  const compte = await compteParNumero(q, d.compteNumero);
  exiger(compte.imputable, 'COMPTE_NON_IMPUTABLE', 'Le compte de taxe doit être imputable');
  const r = await q.query<{ id: string }>(
    `INSERT INTO code_taxe (code, libelle, type, taux, assiette, regime, pourcentage_recuperable, compte_id, exigibilite, date_effet)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [d.code, d.libelle, d.type, d.taux, d.assiette, d.regime ?? null, d.pourcentageRecuperable ?? null, compte.id, d.exigibilite, d.dateEffet ?? aujourdhui()]);
  await journaliser(q, { ...acteur.trace(), action: 'PARAMETRAGE', objetType: 'code_taxe', objetId: r.rows[0]!.id, apres: d });
  return r.rows[0]!.id;
}
