/**
 * Immobilisations et amortissements (CDC § 11.19 ; FIN-RG-140 à 149 ; CA-FIN-22 à 29).
 *
 * - Fiche créée sans double saisie par la validation d'une facture d'achat imputée en immobilisation (une fiche par
 *   unité) ; le comptable la complète (mise en service, localisation). Un bien de faible valeur passé en charge reste
 *   suivi à l'inventaire (statut PASSE_EN_CHARGE).
 * - Linéaire : annuité = valeur d'origine ÷ durée ; prorata temporis au jour près depuis la mise en service, sur le
 *   nombre de jours de l'année ; le cumul est calculé de bout en bout puis arrondi, de sorte que la somme des dotations
 *   mensuelles égale l'annuité de l'exercice et que le cumul ne dépasse jamais la valeur d'origine.
 * - Dotations à chaque clôture de période (EVT-17), état justificatif bien par bien ; part fiscalement non déductible :
 *   véhicule de tourisme au-delà du plafond paramétré, bien à usage domestique.
 * - Cession ou mise au rebut validée : dotation complémentaire jusqu'au jour de la sortie, puis sortie (EVT-18) avec
 *   plus- ou moins-value.
 */
import type { Executant } from '../../db/pool.js';
import type { Acteur } from '../../noyau/acteur.js';
import { ErreurMetier, exiger, nonTrouve } from '../../noyau/erreurs.js';
import { aujourdhui, ajouterAnnees, ajouterJours, dateValide } from '../../noyau/dates.js';
import { journaliser } from '../../moteurs/audit.js';
import { attribuer } from '../../moteurs/numerotation.js';
import { publier } from '../../moteurs/evenements.js';
import { genererDocument } from '../../moteurs/documents.js';
import { entier } from '../../moteurs/parametres.js';
import { enregistrerOperation, soumettre } from '../../moteurs/validation.js';
import { comptabiliser, type CompteResolu } from '../comptabilite/moteur.js';
import { tresorerieDe } from './tresorerie.js';

export const OPERATION_SORTIE = 'SORTIE_IMMOBILISATION';
const gnf = (n: number) => `${n.toLocaleString('fr-FR').replace(/ /g, ' ')} GNF`;
const fr = (d: string | null) => (d ? d.split('-').reverse().join('/') : '—');
const joursEntre = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000) + 1;
const joursAnnee = (annee: number) => ((annee % 4 === 0 && annee % 100 !== 0) || annee % 400 === 0 ? 366 : 365);

interface Bien {
  id: string; numero_inventaire: string; designation: string; categorie: string; categorie_code: string; statut: string; date_mise_en_service: string | null;
  valeur_origine: number; cumul_amortissements: number; duree_annees: number; usage_domestique: boolean;
  compte_immo_id: string; compte_amort_id: string | null; compte_dotation_id: string | null;
}
const SELECT_BIEN = `SELECT i.id, i.numero_inventaire, i.designation, k.libelle AS categorie, k.code AS categorie_code, i.statut, i.date_mise_en_service::text,
    i.valeur_origine::bigint AS valeur_origine, i.cumul_amortissements::bigint AS cumul_amortissements, i.duree_annees, i.usage_domestique,
    k.compte_immo_id, k.compte_amort_id, k.compte_dotation_id
  FROM immobilisation i JOIN categorie_immobilisation k ON k.id = i.categorie_id`;
const normaliser = (b: Bien): Bien => ({ ...b, valeur_origine: Number(b.valeur_origine), cumul_amortissements: Number(b.cumul_amortissements) });

async function lireBien(q: Executant, id: string, verrou = false): Promise<Bien> {
  const r = (await q.query<Bien>(`${SELECT_BIEN} WHERE i.id = $1 AND i.supprime_le IS NULL${verrou ? ' FOR UPDATE OF i' : ''}`, [id])).rows[0];
  if (!r) throw nonTrouve('Immobilisation');
  return normaliser(r);
}

// ---------------------------------------------------------------- calcul (FIN-RG-142)

/** Cumul des amortissements au soir d'une date : prorata au jour près, année par année, plafonné à la valeur d'origine. */
export function cumulAu(b: { valeur_origine: number; duree_annees: number; date_mise_en_service: string | null }, date: string): number {
  if (!b.date_mise_en_service || !b.duree_annees || date < b.date_mise_en_service) return 0;
  const annuite = b.valeur_origine / b.duree_annees;
  const fin = ajouterJours(ajouterAnnees(b.date_mise_en_service, b.duree_annees), -1);
  const jusqua = date < fin ? date : fin;
  let total = 0;
  for (let a = Number(b.date_mise_en_service.slice(0, 4)); a <= Number(jusqua.slice(0, 4)); a++) {
    const debut = a === Number(b.date_mise_en_service.slice(0, 4)) ? b.date_mise_en_service : `${a}-01-01`;
    const finA = a === Number(jusqua.slice(0, 4)) ? jusqua : `${a}-12-31`;
    total += annuite * joursEntre(debut, finA) / joursAnnee(a);
  }
  // La dernière dotation solde le plan
  return jusqua === fin ? b.valeur_origine : Math.min(b.valeur_origine, Math.round(total));
}

/** Plan d'amortissement par exercice civil (calculé à la création, recalculé en cas de révision). */
export function planAmortissement(b: { valeur_origine: number; duree_annees: number; date_mise_en_service: string | null }) {
  if (!b.date_mise_en_service || !b.duree_annees) return [];
  const plan: { annee: number; dotation: number; cumul: number; vnc: number }[] = [];
  let precedent = 0;
  for (let a = Number(b.date_mise_en_service.slice(0, 4)); precedent < b.valeur_origine; a++) {
    const cumul = cumulAu(b, `${a}-12-31`);
    plan.push({ annee: a, dotation: cumul - precedent, cumul, vnc: b.valeur_origine - cumul });
    precedent = cumul;
  }
  return plan;
}

/** FIN-RG-144 : part non déductible d'une dotation (véhicule de tourisme au-delà du plafond, usage domestique). */
async function nonDeductible(q: Executant, b: Bien, dotation: number) {
  if (b.usage_domestique) return dotation;
  if (b.categorie_code !== 'VEHICULE') return 0;
  const plafond = await entier(q, 'FIN_PLAFOND_VEHICULES');
  return b.valeur_origine > plafond ? Math.round(dotation * (b.valeur_origine - plafond) / b.valeur_origine) : 0;
}

/** Comptabilise les dotations des biens jusqu'à une date (EVT-17) et met à jour cumul et plan de l'exercice. */
async function doter(q: Executant, acteur: Acteur, biens: Bien[], date: string, reference: string, titre: string) {
  const lignes: { b: Bien; dotation: number; nd: number }[] = [];
  for (const b of biens) {
    if (!b.compte_amort_id || !b.compte_dotation_id) continue; // terrains : non amortissables
    const dotation = cumulAu(b, date) - b.cumul_amortissements;
    if (dotation > 0) lignes.push({ b, dotation, nd: await nonDeductible(q, b, dotation) });
  }
  if (!lignes.length) return { total: 0, ecritureId: null as string | null, biens: 0 };
  const total = lignes.reduce((s, l) => s + l.dotation, 0);
  const regrouper = (cle: 'compte_dotation_id' | 'compte_amort_id') => {
    const m = new Map<string, number>();
    for (const l of lignes) m.set(l.b[cle]!, (m.get(l.b[cle]!) ?? 0) + l.dotation);
    return [...m].map(([compteId, montant]): CompteResolu => ({ compteId, montant }));
  };
  const etat = await genererDocument(q, acteur, { modeleCode: 'ETAT_AMORTISSEMENTS', typeDocument: 'ETAT_AMORTISSEMENTS', objet: { type: 'immobilisation', id: lignes[0]!.b.id }, date, variables: {
    periode: titre, total: gnf(total),
    lignes: lignes.map(l => ({ numero: l.b.numero_inventaire, designation: l.b.designation, categorie: l.b.categorie, mise_en_service: fr(l.b.date_mise_en_service),
      valeur: gnf(l.b.valeur_origine), dotation: gnf(l.dotation), cumul: gnf(l.b.cumul_amortissements + l.dotation), vnc: gnf(l.b.valeur_origine - l.b.cumul_amortissements - l.dotation) })),
  } });
  const [e] = await comptabiliser(q, acteur, { codeEvt: 'EVT-17', reference, pieceDocumentId: etat.id, date, comptes: { DOTATIONS: regrouper('compte_dotation_id'), AMORTISSEMENTS: regrouper('compte_amort_id') } });
  const exercice = (await q.query<{ id: string }>('SELECT id FROM exercice WHERE $1::date BETWEEN date_debut AND date_fin AND supprime_le IS NULL', [date])).rows[0];
  if (!exercice) throw new ErreurMetier('EXERCICE_ABSENT', 'Aucun exercice à cette date', 422);
  for (const l of lignes) {
    await q.query('UPDATE immobilisation SET cumul_amortissements = cumul_amortissements + $2 WHERE id = $1', [l.b.id, l.dotation]);
    await q.query(
      `INSERT INTO plan_amortissement (immobilisation_id, exercice_id, dotation, non_deductible, ecriture_id) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (immobilisation_id, exercice_id) DO UPDATE SET dotation = plan_amortissement.dotation + EXCLUDED.dotation,
         non_deductible = plan_amortissement.non_deductible + EXCLUDED.non_deductible, ecriture_id = EXCLUDED.ecriture_id`,
      [l.b.id, exercice.id, l.dotation, l.nd, e!.id]);
    l.b.cumul_amortissements += l.dotation;
  }
  return { total, ecritureId: e!.id, biens: lignes.length };
}

/** FIN-RG-143 : dotations de tous les biens en service à la clôture d'une période (appelée par la clôture mensuelle). */
export async function doterAmortissements(q: Executant, acteur: Acteur, mois: string, fin: string) {
  const biens = (await q.query<Bien>(`${SELECT_BIEN} WHERE i.statut = 'EN_SERVICE' AND i.date_mise_en_service <= $1 AND i.supprime_le IS NULL ORDER BY i.numero_inventaire FOR UPDATE OF i`, [fin])).rows.map(normaliser);
  return doter(q, acteur, biens, fin, `AMORT ${mois}`, mois.split('-').reverse().join('/'));
}

// ---------------------------------------------------------------- fiches (FIN-RG-140, 141, 146)

export interface NouveauBien { categorieId: string; designation: string; valeurOrigine: number; statut: 'EN_SERVICE' | 'PASSE_EN_CHARGE'; motif?: string }

/** Crée les fiches d'une facture d'achat validée, préremplies ; le comptable les complète. */
export async function creerBiens(q: Executant, acteur: Acteur, d: { ficheImputationId: string; fournisseurTiersId: string; dateAcquisition: string; biens: NouveauBien[] }) {
  const ids: string[] = [];
  for (const x of d.biens) {
    exiger(Number.isInteger(x.valeurOrigine) && x.valeurOrigine > 0, 'VALEUR_INVALIDE', 'Valeur d\'origine invalide');
    const k = (await q.query<{ duree_annees: number | null }>('SELECT duree_annees FROM categorie_immobilisation WHERE id = $1', [x.categorieId])).rows[0];
    if (!k) throw nonTrouve('Catégorie d\'immobilisation');
    const id = crypto.randomUUID();
    const numero = await attribuer(q, acteur, { type: 'IMMOBILISATION', annee: Number(d.dateAcquisition.slice(0, 4)) }, { type: 'immobilisation', id });
    await q.query(
      `INSERT INTO immobilisation (id, numero_inventaire, designation, categorie_id, fournisseur_tiers_id, fiche_imputation_id, date_acquisition, valeur_origine, localisation, duree_annees, statut, cumul_amortissements, usage_domestique)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'{}',$9,$10,0,false)`,
      [id, numero, x.designation.slice(0, 200), x.categorieId, d.fournisseurTiersId, d.ficheImputationId, d.dateAcquisition, x.valeurOrigine, k.duree_annees ?? 0, x.statut]);
    await q.query(`INSERT INTO mouvement_immobilisation (immobilisation_id, type, date, montant, motif) VALUES ($1,$2,$3,$4,$5)`,
      [id, x.statut === 'PASSE_EN_CHARGE' ? 'PASSAGE_CHARGE' : 'ACQUISITION', d.dateAcquisition, x.valeurOrigine, x.motif ?? 'Facture d\'achat validée']);
    await journaliser(q, { ...acteur.trace(), action: 'CREATION', objetType: 'immobilisation', objetId: id, apres: { numero, ...x } });
    ids.push(id);
  }
  return ids;
}

/** Complément de la fiche : mise en service (départ du plan), localisation, responsable, usage domestique. */
export async function completerBien(q: Executant, acteur: Acteur, id: string, d: { dateMiseEnService?: string; localisation?: Record<string, string>; responsableId?: string | null; usageDomestique?: boolean }) {
  const b = await lireBien(q, id, true);
  exiger(b.statut === 'EN_SERVICE' || b.statut === 'PASSE_EN_CHARGE', 'STATUT_INVALIDE', 'Bien sorti du registre');
  if (d.dateMiseEnService) {
    exiger(dateValide(d.dateMiseEnService), 'DATE_INVALIDE', 'Date de mise en service invalide');
    exiger(!b.cumul_amortissements || d.dateMiseEnService === b.date_mise_en_service, 'PLAN_ENGAGE', 'Des dotations ont été comptabilisées : la mise en service ne change plus (révision pour l\'avenir)');
  }
  await q.query(`UPDATE immobilisation SET date_mise_en_service = COALESCE($2, date_mise_en_service), localisation = COALESCE($3, localisation),
                   responsable_id = CASE WHEN $5 THEN $4 ELSE responsable_id END, usage_domestique = COALESCE($6, usage_domestique) WHERE id = $1`,
    [id, d.dateMiseEnService ?? null, d.localisation ? JSON.stringify(d.localisation) : null, d.responsableId ?? null, d.responsableId !== undefined, d.usageDomestique ?? null]);
  if (d.localisation) await q.query(`INSERT INTO mouvement_immobilisation (immobilisation_id, type, date, motif) VALUES ($1,'TRANSFERT',current_date,$2)`, [id, `Localisation : ${Object.values(d.localisation).join(', ')}`]);
  await journaliser(q, { ...acteur.trace(), action: 'MODIFICATION', objetType: 'immobilisation', objetId: id, apres: d });
}

// ---------------------------------------------------------------- sorties (FIN-RG-147)

export interface Sortie { type: 'CESSION' | 'REBUT'; date: string; prix?: number; banque?: string; motif: string }

/** Sortie effective : dotation complémentaire au jour de la sortie, puis EVT-18 ; renvoie la plus- ou moins-value. */
export async function sortirBien(q: Executant, acteur: Acteur, id: string, s: Sortie, demandeId: string | null = null) {
  const b = await lireBien(q, id, true);
  exiger(b.statut === 'EN_SERVICE', 'STATUT_INVALIDE', 'Seul un bien en service sort du registre par cession ou rebut');
  await doter(q, acteur, [b], s.date, `AMORT ${b.numero_inventaire}`, `sortie du ${fr(s.date)}`);
  const prix = s.type === 'CESSION' ? s.prix ?? 0 : 0;
  const vnc = b.valeur_origine - b.cumul_amortissements;
  const doc = await genererDocument(q, acteur, { modeleCode: 'SORTIE_IMMOBILISATION', typeDocument: 'SORTIE_IMMOBILISATION', objet: { type: 'immobilisation', id }, variables: {
    nature: s.type === 'CESSION' ? 'Cession' : 'Mise au rebut', numero: b.numero_inventaire, designation: b.designation, categorie: b.categorie, date: fr(s.date), motif: s.motif,
    lignes: [{ libelle: 'Valeur d\'origine', montant: gnf(b.valeur_origine) }, { libelle: 'Amortissements cumulés', montant: gnf(b.cumul_amortissements) },
      { libelle: 'Valeur nette comptable', montant: gnf(vnc) }, { libelle: 'Prix de cession', montant: gnf(prix) }, { libelle: prix - vnc >= 0 ? 'Plus-value' : 'Moins-value', montant: gnf(Math.abs(prix - vnc)) }],
  } });
  const tresorerie = prix > 0 ? await tresorerieDe(q, 'BANQUE', s.banque) : null;
  const [e] = await comptabiliser(q, acteur, { codeEvt: 'EVT-18', reference: b.numero_inventaire, pieceDocumentId: doc.id, date: s.date,
    montants: { CUMUL: b.cumul_amortissements, VNC: vnc, VALEUR_ORIGINE: b.valeur_origine, PRIX: prix },
    comptes: { IMMOBILISATIONS: { compteId: b.compte_immo_id }, ...(b.compte_amort_id ? { AMORTISSEMENTS: { compteId: b.compte_amort_id } } : {}), ...(tresorerie ? { TRESORERIE: { compteId: tresorerie.compteId } } : {}) } });
  await q.query('UPDATE immobilisation SET statut = $2 WHERE id = $1', [id, s.type === 'CESSION' ? 'CEDE' : 'MIS_AU_REBUT']);
  await q.query(`INSERT INTO mouvement_immobilisation (immobilisation_id, type, date, montant, motif, demande_validation_id, ecriture_id) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [id, s.type, s.date, prix, s.motif.slice(0, 300), demandeId, e!.id]);
  await journaliser(q, { ...acteur.trace(), action: 'MODIFICATION', objetType: 'immobilisation', objetId: id, apres: { statut: s.type, vnc, prix, resultat: prix - vnc } });
  await publier(q, acteur, { type: 'IMMOBILISATION_CEDEE', objet: { type: 'immobilisation', id }, charge: { numero: b.numero_inventaire, type: s.type, vnc, prix }, cleIdempotence: `immobilisation:${id}:sortie` });
  return { vnc, prix, resultat: prix - vnc, cumul: b.cumul_amortissements };
}

export async function proposerSortie(q: Executant, acteur: Acteur, id: string, s: Sortie) {
  exiger(s.motif?.trim(), 'MOTIF_REQUIS', 'Une sortie est motivée');
  exiger(dateValide(s.date) && s.date <= aujourdhui(), 'DATE_INVALIDE', 'Date de sortie invalide');
  if (s.type === 'CESSION') exiger(Number.isInteger(s.prix) && s.prix! >= 0 && (!s.prix || s.banque), 'PRIX_INVALIDE', 'Prix de cession et banque de l\'encaissement');
  const b = await lireBien(q, id, true);
  exiger(b.statut === 'EN_SERVICE', 'STATUT_INVALIDE', 'Bien déjà sorti du registre');
  exiger(!b.date_mise_en_service || s.date >= b.date_mise_en_service, 'DATE_INVALIDE', 'Sortie antérieure à la mise en service');
  const deja = await q.query(`SELECT 1 FROM demande_validation WHERE type_operation = $1 AND objet_id = $2 AND statut = 'EN_ATTENTE'`, [OPERATION_SORTIE, id]);
  exiger(!deja.rowCount, 'DEMANDE_EN_COURS', 'Une sortie est déjà en cours de validation', 409);
  const vnc = b.valeur_origine - cumulAu(b, s.date);
  const demande = await soumettre(q, acteur, { typeOperation: OPERATION_SORTIE, objetType: 'immobilisation', objetId: id, montant: s.prix ?? 0,
    donnees: { numero: b.numero_inventaire, designation: b.designation, sortie: s, vncEstimee: vnc } });
  return { demandeValidation: demande.id, vncEstimee: vnc, resultatEstime: (s.prix ?? 0) - vnc };
}

enregistrerOperation(OPERATION_SORTIE, {
  administrative: false,
  async appliquer(q, demande, acteur) {
    await sortirBien(q, acteur, demande.objet_id, (demande.donnees as { sortie: Sortie }).sortie, demande.id);
  },
});

/** FIN-RG-146 : biens remplacés sortis du registre et liés à la facture de remplacement (mise au rebut). */
export async function sortirBiensRemplaces(q: Executant, acteur: Acteur, ids: string[], date: string, ficheImputationId: string, reference: string) {
  for (const id of ids) {
    await sortirBien(q, acteur, id, { type: 'REBUT', date, motif: `Remplacé (facture ${reference})` });
    await q.query(`UPDATE mouvement_immobilisation SET type = 'SORTIE_REMPLACEMENT', biens_remplaces = $2 WHERE immobilisation_id = $1 AND type = 'REBUT'`,
      [id, JSON.stringify({ ficheImputationId, reference })]);
  }
}

// ---------------------------------------------------------------- états (FIN-RG-149, 144)

export async function registre(q: Executant, f: { statut?: string } = {}) {
  return (await q.query(
    `SELECT i.id, i.numero_inventaire, i.designation, k.code AS categorie_code, k.libelle AS categorie, i.statut, i.date_acquisition, i.date_mise_en_service,
            i.valeur_origine::bigint AS valeur_origine, i.cumul_amortissements::bigint AS cumul, (i.valeur_origine - i.cumul_amortissements)::bigint AS vnc, i.duree_annees,
            i.localisation, trim(t.nom || ' ' || COALESCE(t.prenoms, '')) AS fournisseur, fi.reference AS facture
       FROM immobilisation i JOIN categorie_immobilisation k ON k.id = i.categorie_id LEFT JOIN tiers t ON t.id = i.fournisseur_tiers_id LEFT JOIN fiche_imputation fi ON fi.id = i.fiche_imputation_id
      WHERE i.supprime_le IS NULL AND ($1::text IS NULL OR i.statut = $1) ORDER BY i.numero_inventaire DESC LIMIT 500`, [f.statut ?? null])).rows;
}

export async function ficheBien(q: Executant, id: string) {
  const b = await lireBien(q, id);
  const mouvements = (await q.query(`SELECT type, date, montant, motif, biens_remplaces FROM mouvement_immobilisation WHERE immobilisation_id = $1 ORDER BY date, cree_le`, [id])).rows;
  const comptabilise = (await q.query(`SELECT e.code AS exercice, p.dotation, p.non_deductible FROM plan_amortissement p JOIN exercice e ON e.id = p.exercice_id WHERE p.immobilisation_id = $1 ORDER BY e.code`, [id])).rows;
  return { ...b, plan: b.statut === 'PASSE_EN_CHARGE' ? [] : planAmortissement(b), comptabilise, mouvements };
}

/** État fiscal des amortissements d'un exercice : dotations, parts non déductibles, biens passés en charge et biens remplacés. */
export async function etatFiscal(q: Executant, exercice: string) {
  const dotations = (await q.query(
    `SELECT i.numero_inventaire, i.designation, k.libelle AS categorie, i.valeur_origine::bigint AS valeur_origine, p.dotation::bigint AS dotation, p.non_deductible::bigint AS non_deductible,
            CASE WHEN i.usage_domestique THEN 'Usage domestique' WHEN p.non_deductible > 0 THEN 'Véhicule au-delà du plafond' END AS motif
       FROM plan_amortissement p JOIN exercice e ON e.id = p.exercice_id JOIN immobilisation i ON i.id = p.immobilisation_id JOIN categorie_immobilisation k ON k.id = i.categorie_id
      WHERE e.code = $1 ORDER BY i.numero_inventaire`, [exercice])).rows;
  const charges = (await q.query(
    `SELECT i.numero_inventaire, i.designation, i.valeur_origine::bigint AS valeur_origine, m.motif, m.date
       FROM immobilisation i JOIN mouvement_immobilisation m ON m.immobilisation_id = i.id AND m.type = 'PASSAGE_CHARGE' WHERE to_char(m.date, 'YYYY') = $1 ORDER BY i.numero_inventaire`, [exercice])).rows;
  const remplaces = (await q.query(
    `SELECT i.numero_inventaire, i.designation, m.date, m.biens_remplaces->>'reference' AS facture FROM immobilisation i JOIN mouvement_immobilisation m ON m.immobilisation_id = i.id
      WHERE m.type = 'SORTIE_REMPLACEMENT' AND to_char(m.date, 'YYYY') = $1 ORDER BY i.numero_inventaire`, [exercice])).rows;
  const cessions = (await q.query(
    `SELECT i.numero_inventaire, i.designation, m.type, m.date, i.valeur_origine::bigint AS valeur_origine, i.cumul_amortissements::bigint AS cumul, m.montant::bigint AS prix,
            (m.montant - (i.valeur_origine - i.cumul_amortissements))::bigint AS resultat
       FROM immobilisation i JOIN mouvement_immobilisation m ON m.immobilisation_id = i.id AND m.type IN ('CESSION', 'REBUT') WHERE to_char(m.date, 'YYYY') = $1 ORDER BY m.date`, [exercice])).rows;
  return {
    dotations, totalDotations: dotations.reduce((s, x) => s + Number(x.dotation), 0), aReintegrer: dotations.reduce((s, x) => s + Number(x.non_deductible), 0),
    passagesEnCharge: charges, biensRemplaces: remplaces, cessions,
  };
}

export async function categories(q: Executant) {
  return (await q.query(
    `SELECT k.id, k.code, k.libelle, k.duree_annees, k.taux_affiche, k.faible_valeur_autorisee, ci.numero AS compte_immo, ca.numero AS compte_amort, cd.numero AS compte_dotation
       FROM categorie_immobilisation k JOIN compte ci ON ci.id = k.compte_immo_id LEFT JOIN compte ca ON ca.id = k.compte_amort_id LEFT JOIN compte cd ON cd.id = k.compte_dotation_id
      WHERE k.supprime_le IS NULL ORDER BY k.libelle`)).rows;
}
