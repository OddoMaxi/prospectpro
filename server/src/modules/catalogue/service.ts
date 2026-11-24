/**
 * Catalogue des produits (CDC § 5.5 ; REF-RG-030 à 035 ; CA-REF-03, 04, 08 ; DD produit, formule, garantie, tarif, exclusion).
 *
 * Produit → Formule (versionnée) → Garanties ; grille de tarifs datée par formule.
 * - Toute modification est proposée puis validée par le comité de paramétrage (circuit CATALOGUE) et prend effet
 *   à sa date, au plus tôt aujourd'hui : jamais sur les périodes en cours (CA-REF-03).
 * - Une nouvelle grille de tarifs remplace la précédente en entier à sa date d'effet.
 * - La prime est toujours calculée : prime nette + accessoires + taxes (REF-RG-030), arrondie au franc, ligne par ligne.
 */
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Executant } from '../../db/pool.js';
import type { Acteur } from '../../noyau/acteur.js';
import { ErreurMetier, exiger, nonTrouve } from '../../noyau/erreurs.js';
import { age, aujourdhui } from '../../noyau/dates.js';
import { journaliser } from '../../moteurs/audit.js';
import { entier } from '../../moteurs/parametres.js';
import { enregistrerOperation, soumettre } from '../../moteurs/validation.js';

export const OPERATION_CATALOGUE = 'CATALOGUE';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const montant = z.number().int().nonnegative();
const taux = z.number().min(0).max(1);

export const schemaGarantie = z.object({
  code: z.string().regex(/^[A-Z0-9_]{1,10}$/), libelle: z.string().trim().min(1).max(120),
  type: z.enum(['FRAIS_SOINS', 'INCAPACITE_TEMPORAIRE', 'INCAPACITE_PERMANENTE', 'DECES', 'FRAIS_FUNERAIRES', 'TELECONSULTATION', 'AUTRE']),
  plafond: montant.optional(), nombreActes: z.number().int().positive().optional(), tauxPriseEnCharge: taux,
  carenceJours: z.number().int().nonnegative(), accordPrealable: z.boolean().default(false), seuilAccordPrealable: montant.optional(),
  beneficiaires: z.enum(['VICTIME', 'AYANTS_DROIT']), modeCalcul: z.enum(['FORFAIT', 'COUT_REEL', 'CAPITAL_X_TAUX', 'INDEMNITE_JOURNALIERE']),
  capital: montant.optional(), indemniteJournaliere: montant.optional(), ageMinDeces: z.number().int().nonnegative().optional(),
});
export const schemaTarif = z.object({
  qualite: z.enum(['ASSURE_PRINCIPAL', 'CONJOINT', 'ENFANT', 'ADULTE']),
  ageMin: z.number().int().nonnegative(), ageMax: z.number().int().nonnegative(), primeNette: montant,
});
export const schemaFormule = z.object({
  code: z.string().regex(/^[A-Z0-9_]{1,10}$/), libelle: z.string().trim().min(1).max(120),
  composition: z.object({ conjointsMax: z.number().int().nonnegative(), enfantsMax: z.number().int().nonnegative(), personnesMax: z.number().int().positive() }),
  accessoires: montant, ticketModerateur: taux, plafondAnnuelPersonne: montant, plafondAnnuelFamille: montant.optional(),
  nombreActesAnnuel: z.number().int().positive().optional(),
  garanties: z.array(schemaGarantie).min(1), tarifs: z.array(schemaTarif).min(1),
});
export const schemaProduit = z.object({
  code: z.string().regex(/^\d{2}$/, 'Code produit : 2 chiffres'), libelle: z.string().trim().min(1).max(120),
  brancheBcrg: z.string().trim().min(1).max(60), typeCouverture: z.enum(['INDIVIDUEL', 'FAMILLE', 'GROUPE']),
  typeContrat: z.enum(['INDIVIDUEL', 'COLLECTIF']), ageMin: z.number().int().nonnegative(), ageMax: z.number().int().nonnegative(),
  dureeMois: z.number().int().positive().default(12), documentsExiges: z.array(z.string()).default([]),
  modeleCgId: z.uuid(), modeleCpId: z.uuid(), delaiRenonciationJours: z.number().int().nonnegative().optional(),
  ristourneDeces: z.boolean().default(false), taxes: z.array(z.uuid()).default([]),
  formules: z.array(schemaFormule).min(1),
});

export const schemaOperationCatalogue = z.discriminatedUnion('type', [
  z.object({ type: z.literal('CREER_PRODUIT'), dateEffet: date, produit: schemaProduit }),
  z.object({ type: z.literal('VERSION_FORMULE'), dateEffet: date, produitId: z.uuid(), formule: schemaFormule }),
  z.object({ type: z.literal('GRILLE_TARIFS'), dateEffet: date, formuleId: z.uuid(), tarifs: z.array(schemaTarif).min(1) }),
  z.object({ type: z.literal('FERMER_PRODUIT'), dateEffet: date, produitId: z.uuid(), formuleRemplacementId: z.uuid() }),
]);
export type OperationCatalogue = z.infer<typeof schemaOperationCatalogue>;
type Formule = z.infer<typeof schemaFormule>;
type Tarif = z.infer<typeof schemaTarif>;

// ---------------------------------------------------------------- contrôles

function controlerGrille(tarifs: Tarif[]): void {
  for (const t of tarifs) exiger(t.ageMax >= t.ageMin, 'TRANCHE_INVALIDE', `Tranche ${t.qualite} ${t.ageMin}-${t.ageMax} invalide`);
  for (const qualite of new Set(tarifs.map(t => t.qualite))) {
    const tr = tarifs.filter(t => t.qualite === qualite).sort((a, b) => a.ageMin - b.ageMin);
    for (let i = 1; i < tr.length; i++) {
      exiger(tr[i]!.ageMin > tr[i - 1]!.ageMax, 'TRANCHES_CHEVAUCHANTES', `Tranches ${qualite} chevauchantes autour de ${tr[i]!.ageMin} ans`);
    }
  }
  exiger(tarifs.some(t => t.qualite === 'ASSURE_PRINCIPAL' || t.qualite === 'ADULTE'), 'TARIF_PRINCIPAL_REQUIS', 'La grille comporte un tarif de l\'assuré principal (ou adulte)');
}

async function controlerFormule(q: Executant, f: Formule): Promise<void> {
  const maxConjoints = await entier(q, 'TIERS_MAX_CONJOINTS');
  exiger(f.composition.conjointsMax <= maxConjoints, 'COMPOSITION_INVALIDE', `Au plus ${maxConjoints} conjoints (REF-RG-007)`);
  exiger(!f.plafondAnnuelFamille || f.plafondAnnuelFamille >= f.plafondAnnuelPersonne, 'PLAFONDS_INCOHERENTS', 'Le plafond famille ne peut être inférieur au plafond par personne');
  const codes = f.garanties.map(g => g.code);
  exiger(new Set(codes).size === codes.length, 'GARANTIE_EN_DOUBLE', 'Code de garantie en double');
  const ageMinDeces = await entier(q, 'AGE_MIN_GARANTIE_DECES');
  for (const g of f.garanties) {
    if (g.type === 'DECES') {
      // REF-RG-034, art. 194 : aucune garantie décès sur un mineur de moins de 12 ans
      exiger((g.ageMinDeces ?? -1) >= ageMinDeces, 'AGE_DECES_INTERDIT', `Garantie décès ${g.code} : âge minimal d'au moins ${ageMinDeces} ans (art. 194)`);
      exiger(g.capital, 'CAPITAL_REQUIS', `Garantie décès ${g.code} : capital obligatoire`);
    }
    if (g.modeCalcul === 'CAPITAL_X_TAUX') exiger(g.capital, 'CAPITAL_REQUIS', `Garantie ${g.code} : capital obligatoire pour le mode capital × taux`);
    if (g.modeCalcul === 'INDEMNITE_JOURNALIERE') exiger(g.indemniteJournaliere, 'INDEMNITE_REQUISE', `Garantie ${g.code} : indemnité journalière obligatoire`);
    if (g.accordPrealable === false) exiger(!g.seuilAccordPrealable, 'SEUIL_INCOHERENT', `Garantie ${g.code} : seuil sans accord préalable`);
  }
  controlerGrille(f.tarifs);
}

async function controler(q: Executant, op: OperationCatalogue): Promise<void> {
  exiger(op.dateEffet >= aujourdhui(), 'DATE_PASSEE', 'Une modification du catalogue prend effet au plus tôt aujourd\'hui : jamais sur les périodes en cours');
  switch (op.type) {
    case 'CREER_PRODUIT': {
      const p = op.produit;
      exiger(p.ageMax >= p.ageMin, 'AGES_INVALIDES', 'Âge maximal inférieur à l\'âge minimal');
      const existe = await q.query('SELECT 1 FROM produit WHERE code = $1', [p.code]);
      exiger(!existe.rowCount, 'CODE_PRODUIT_UTILISE', `Le code produit ${p.code} est déjà attribué`, 409);
      const modeles = await q.query('SELECT id FROM modele_document WHERE id = ANY($1) AND supprime_le IS NULL', [[p.modeleCgId, p.modeleCpId]]);
      exiger(modeles.rowCount === new Set([p.modeleCgId, p.modeleCpId]).size, 'MODELE_INCONNU', 'Modèle de conditions générales ou particulières introuvable');
      if (p.taxes.length) {
        const t = await q.query(`SELECT id FROM code_taxe WHERE id = ANY($1) AND type = 'TAXE_PRIMES'`, [p.taxes]);
        exiger(t.rowCount === p.taxes.length, 'TAXE_INVALIDE', 'Seuls des codes taxe de type « taxe sur primes » s\'appliquent à un produit');
      }
      const codes = p.formules.map(f => f.code);
      exiger(new Set(codes).size === codes.length, 'FORMULE_EN_DOUBLE', 'Code de formule en double');
      for (const f of p.formules) await controlerFormule(q, f);
      return;
    }
    case 'VERSION_FORMULE': {
      const p = await q.query<{ date_fin_commercialisation: string | null }>('SELECT date_fin_commercialisation FROM produit WHERE id = $1', [op.produitId]);
      if (!p.rows[0]) throw nonTrouve('Produit');
      exiger(!p.rows[0].date_fin_commercialisation || p.rows[0].date_fin_commercialisation > op.dateEffet, 'PRODUIT_FERME', 'Produit fermé à cette date');
      await controlerFormule(q, op.formule);
      return;
    }
    case 'GRILLE_TARIFS': {
      const f = await q.query('SELECT 1 FROM formule WHERE id = $1', [op.formuleId]);
      exiger(f.rowCount, 'FORMULE_INCONNUE', 'Formule introuvable', 404);
      controlerGrille(op.tarifs);
      return;
    }
    case 'FERMER_PRODUIT': {
      const r = await q.query<{ produit_id: string }>('SELECT produit_id FROM formule WHERE id = $1', [op.formuleRemplacementId]);
      exiger(r.rows[0], 'FORMULE_INCONNUE', 'Formule de remplacement introuvable', 404);
      exiger(r.rows[0].produit_id !== op.produitId, 'REMPLACEMENT_INVALIDE', 'La formule de remplacement appartient à un autre produit, toujours commercialisé');
      return;
    }
  }
}

// ---------------------------------------------------------------- proposition et application

export async function proposerCatalogue(q: Executant, acteur: Acteur, brut: unknown, motif: string) {
  exiger(motif?.trim(), 'MOTIF_REQUIS', 'Motif obligatoire');
  const op = schemaOperationCatalogue.parse(brut);
  await controler(q, op);
  const objetId = op.type === 'CREER_PRODUIT' ? randomUUID() : op.type === 'GRILLE_TARIFS' ? op.formuleId : op.produitId;
  return soumettre(q, acteur, {
    typeOperation: OPERATION_CATALOGUE, objetType: op.type === 'GRILLE_TARIFS' ? 'formule' : 'produit', objetId,
    donnees: { ...op, motif } as unknown as Record<string, unknown>,
  });
}

async function insererFormule(q: Executant, produitId: string, f: Formule, version: number, dateEffet: string): Promise<string> {
  const r = await q.query<{ id: string }>(
    `INSERT INTO formule (produit_id, code, libelle, version, composition, accessoires, ticket_moderateur, plafond_annuel_personne, plafond_annuel_famille, nombre_actes_annuel, date_effet)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
    [produitId, f.code, f.libelle, version, JSON.stringify(f.composition), f.accessoires, f.ticketModerateur, f.plafondAnnuelPersonne,
      f.plafondAnnuelFamille ?? null, f.nombreActesAnnuel ?? null, dateEffet]);
  const id = r.rows[0]!.id;
  for (const g of f.garanties) {
    await q.query(
      `INSERT INTO garantie (formule_id, code, libelle, type, plafond, nombre_actes, taux_prise_en_charge, carence_jours, accord_prealable, seuil_accord_prealable,
                             beneficiaires, mode_calcul, capital, indemnite_journaliere, age_min_deces)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [id, g.code, g.libelle, g.type, g.plafond ?? null, g.nombreActes ?? null, g.tauxPriseEnCharge, g.carenceJours, g.accordPrealable,
        g.seuilAccordPrealable ?? null, g.beneficiaires, g.modeCalcul, g.capital ?? null, g.indemniteJournaliere ?? null, g.ageMinDeces ?? null]);
  }
  await insererGrille(q, id, f.tarifs, dateEffet);
  return id;
}

async function insererGrille(q: Executant, formuleId: string, tarifs: Tarif[], dateEffet: string) {
  // Aucune suppression : la nouvelle grille remplace la précédente à sa date d'effet ; l'ancienne reste applicable avant.
  for (const t of tarifs) {
    await q.query('INSERT INTO tarif (formule_id, qualite, age_min, age_max, prime_nette, date_effet) VALUES ($1,$2,$3,$4,$5,$6)',
      [formuleId, t.qualite, t.ageMin, t.ageMax, t.primeNette, dateEffet]);
  }
}

enregistrerOperation(OPERATION_CATALOGUE, {
  administrative: false,
  async appliquer(q, demande, acteur) {
    const op = schemaOperationCatalogue.parse(demande.donnees);
    await controler(q, op);
    switch (op.type) {
      case 'CREER_PRODUIT': {
        const p = op.produit;
        await q.query(
          `INSERT INTO produit (id, code, libelle, branche_bcrg, type_couverture, type_contrat, age_min, age_max, duree_mois, documents_exiges,
                                modele_cg_id, modele_cp_id, delai_renonciation_jours, ristourne_deces, date_effet)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
          [demande.objet_id, p.code, p.libelle, p.brancheBcrg, p.typeCouverture, p.typeContrat, p.ageMin, p.ageMax, p.dureeMois,
            JSON.stringify(p.documentsExiges), p.modeleCgId, p.modeleCpId, p.delaiRenonciationJours ?? null, p.ristourneDeces, op.dateEffet]);
        for (const f of p.formules) await insererFormule(q, demande.objet_id, f, 1, op.dateEffet);
        for (const t of p.taxes) await q.query('INSERT INTO produit_taxe (produit_id, code_taxe_id, date_effet) VALUES ($1,$2,$3)', [demande.objet_id, t, op.dateEffet]);
        break;
      }
      case 'VERSION_FORMULE': {
        const v = (await q.query<{ v: number }>('SELECT COALESCE(max(version), 0) + 1 AS v FROM formule WHERE produit_id = $1 AND code = $2',
          [op.produitId, op.formule.code])).rows[0]!.v;
        await insererFormule(q, op.produitId, op.formule, v, op.dateEffet);
        break;
      }
      case 'GRILLE_TARIFS':
        await insererGrille(q, op.formuleId, op.tarifs, op.dateEffet);
        break;
      case 'FERMER_PRODUIT':
        await q.query('UPDATE produit SET date_fin_commercialisation = $2, formule_remplacement_id = $3 WHERE id = $1', [op.produitId, op.dateEffet, op.formuleRemplacementId]);
        break;
    }
    await journaliser(q, { ...acteur.trace(), action: 'PARAMETRAGE', objetType: 'catalogue', objetId: demande.objet_id, apres: { type: op.type, dateEffet: op.dateEffet } });
  },
});

// ---------------------------------------------------------------- lecture et tarification

/** Version d'une formule en vigueur à une date (nouvelles souscriptions et renouvellements). */
export async function formuleEnVigueur(q: Executant, produitId: string, code: string, date = aujourdhui()) {
  const r = await q.query(
    `SELECT f.* FROM formule f JOIN produit p ON p.id = f.produit_id
      WHERE f.produit_id = $1 AND f.code = $2 AND f.date_effet <= $3 AND f.supprime_le IS NULL
        AND p.date_effet <= $3 AND (p.date_fin_commercialisation IS NULL OR p.date_fin_commercialisation > $3)
      ORDER BY f.date_effet DESC, f.version DESC LIMIT 1`, [produitId, code, date]);
  return r.rows[0] ?? null;
}

/** Catalogue commercialisé à une date : produits ouverts et dernière version de chaque formule. */
export async function catalogue(q: Executant, date = aujourdhui()) {
  return (await q.query(
    `SELECT p.id, p.code, p.libelle, p.branche_bcrg, p.type_couverture, p.type_contrat, p.age_min, p.age_max, p.date_fin_commercialisation,
            COALESCE((SELECT json_agg(json_build_object('id', f.id, 'code', f.code, 'libelle', f.libelle, 'version', f.version, 'date_effet', f.date_effet) ORDER BY f.code)
               FROM (SELECT DISTINCT ON (code) * FROM formule WHERE produit_id = p.id AND date_effet <= $1 AND supprime_le IS NULL ORDER BY code, date_effet DESC, version DESC) f), '[]') AS formules
       FROM produit p WHERE p.supprime_le IS NULL AND p.date_effet <= $1 AND (p.date_fin_commercialisation IS NULL OR p.date_fin_commercialisation > $1)
      ORDER BY p.code`, [date])).rows;
}

export async function detailFormule(q: Executant, formuleId: string) {
  const f = (await q.query('SELECT * FROM formule WHERE id = $1', [formuleId])).rows[0];
  if (!f) throw nonTrouve('Formule');
  const garanties = (await q.query('SELECT * FROM garantie WHERE formule_id = $1 AND supprime_le IS NULL ORDER BY code', [formuleId])).rows;
  const tarifs = (await q.query('SELECT qualite, age_min, age_max, prime_nette, date_effet FROM tarif WHERE formule_id = $1 AND supprime_le IS NULL ORDER BY date_effet DESC, qualite, age_min', [formuleId])).rows;
  return { ...f, garanties, tarifs };
}

export interface MembreTarife { qualite: Tarif['qualite']; dateNaissance: string }
export interface Tarification {
  dateTarif: string; lignes: { qualite: string; age: number; primeNette: number }[];
  primeNette: number; accessoires: number; taxes: { code: string; libelle: string; taux: number; base: number; montant: number }[]; primeTotale: number;
}

/**
 * REF-RG-030 : prime totale = prime nette (grille de la formule en vigueur à `date`) + accessoires + taxes.
 * `date` est la date d'effet de la période tarifée : souscription ou renouvellement (CA-REF-03).
 */
export async function tarifer(q: Executant, formuleId: string, membres: MembreTarife[], date: string): Promise<Tarification> {
  const f = (await q.query<{ produit_id: string; accessoires: number; composition: { conjointsMax: number; enfantsMax: number; personnesMax: number } }>(
    'SELECT produit_id, accessoires, composition FROM formule WHERE id = $1', [formuleId])).rows[0];
  if (!f) throw nonTrouve('Formule');
  exiger(membres.length >= 1 && membres.length <= f.composition.personnesMax, 'COMPOSITION_DEPASSEE', `Au plus ${f.composition.personnesMax} personnes sur cette formule`);
  exiger(membres.filter(m => m.qualite === 'CONJOINT').length <= f.composition.conjointsMax, 'COMPOSITION_DEPASSEE', `Au plus ${f.composition.conjointsMax} conjoint(s) sur cette formule`);
  exiger(membres.filter(m => m.qualite === 'ENFANT').length <= f.composition.enfantsMax, 'COMPOSITION_DEPASSEE', `Au plus ${f.composition.enfantsMax} enfant(s) sur cette formule`);

  const g = await q.query<{ d: string | null }>('SELECT max(date_effet) AS d FROM tarif WHERE formule_id = $1 AND date_effet <= $2 AND supprime_le IS NULL', [formuleId, date]);
  const dateTarif = g.rows[0]?.d;
  if (!dateTarif) throw new ErreurMetier('TARIF_ABSENT', 'Aucun tarif en vigueur à cette date pour cette formule', 422);
  const grille = (await q.query<{ qualite: string; age_min: number; age_max: number; prime_nette: number }>(
    'SELECT qualite, age_min, age_max, prime_nette FROM tarif WHERE formule_id = $1 AND date_effet = $2 AND supprime_le IS NULL', [formuleId, dateTarif])).rows;

  const lignes = membres.map(m => {
    const a = age(m.dateNaissance, date);
    const t = grille.find(x => x.qualite === m.qualite && a >= x.age_min && a <= x.age_max);
    if (!t) throw new ErreurMetier('HORS_GRILLE', `Aucun tarif ${m.qualite} pour ${a} ans`, 422);
    return { qualite: m.qualite, age: a, primeNette: Number(t.prime_nette) };
  });
  const primeNette = lignes.reduce((s, l) => s + l.primeNette, 0);
  const accessoires = Number(f.accessoires);

  // Taxes du produit en vigueur à la date : pour chaque code lié, la version du taux en vigueur
  const tx = await q.query<{ code: string; libelle: string; taux: string; assiette: string }>(
    `SELECT DISTINCT ON (ct.code) ct.code, ct.libelle, ct.taux, ct.assiette
       FROM produit_taxe pt JOIN code_taxe lien ON lien.id = pt.code_taxe_id JOIN code_taxe ct ON ct.code = lien.code
      WHERE pt.produit_id = $1 AND pt.supprime_le IS NULL AND pt.date_effet <= $2 AND (pt.date_fin IS NULL OR pt.date_fin > $2)
        AND ct.date_effet <= $2 AND ct.supprime_le IS NULL
      ORDER BY ct.code, ct.date_effet DESC`, [f.produit_id, date]);
  const taxes = tx.rows.map(t => {
    const base = t.assiette === 'PRIME_NETTE' ? primeNette : primeNette + accessoires;
    return { code: t.code, libelle: t.libelle, taux: Number(t.taux), base, montant: Math.round(base * Number(t.taux)) };
  });
  const primeTotale = primeNette + accessoires + taxes.reduce((s, t) => s + t.montant, 0);
  return { dateTarif, lignes, primeNette, accessoires, taxes, primeTotale };
}

// ---------------------------------------------------------------- règles des bénéficiaires et de la garantie décès

/** REF-RG-031, CA-REF-04 : quotités strictement positives, totalisant exactement 100 %. */
export function controlerQuotites(quotites: number[]): void {
  exiger(quotites.length > 0, 'BENEFICIAIRE_REQUIS', 'Au moins un bénéficiaire');
  exiger(quotites.every(x => x > 0 && Number.isFinite(x)), 'QUOTITE_INVALIDE', 'Chaque quotité est strictement positive');
  const centiemes = quotites.reduce((s, x) => s + Math.round(x * 100), 0);
  exiger(centiemes === 10_000, 'QUOTITES_INCOMPLETES', `Les quotités totalisent ${centiemes / 100} % : le total doit être de 100 % (REF-RG-031)`);
}

/**
 * REF-RG-034, CA-REF-08 (Code des assurances, art. 193 à 195) : conditions d'octroi de la garantie décès sur une personne.
 * Renvoie la liste des conditions non remplies (vide : garantie accordée).
 */
export async function conditionsGarantieDeces(q: Executant, d: {
  dateNaissance: string; date: string; estSouscripteur: boolean; consentementAssure?: boolean;
  autorisationRepresentant?: boolean; consentementMineur?: boolean;
}): Promise<string[]> {
  const minimum = await entier(q, 'AGE_MIN_GARANTIE_DECES', d.date);
  const a = age(d.dateNaissance, d.date);
  if (a < minimum) return [`Garantie décès interdite sur un mineur de moins de ${minimum} ans (art. 194) : l'assuré a ${a} ans`];
  const manques: string[] = [];
  if (a < 18) {
    if (!d.autorisationRepresentant) manques.push('Autorisation du représentant légal');
    if (!d.consentementMineur) manques.push('Consentement personnel du mineur');
  }
  if (!d.estSouscripteur && !d.consentementAssure) manques.push('Consentement écrit de l\'assuré indiquant le capital garanti (code SMS ou signature)');
  return manques;
}

export async function exigerGarantieDeces(q: Executant, d: Parameters<typeof conditionsGarantieDeces>[1]): Promise<void> {
  const manques = await conditionsGarantieDeces(q, d);
  if (manques.length) throw new ErreurMetier('GARANTIE_DECES_REFUSEE', `Garantie décès refusée : ${manques.join(' ; ')}`, 422, { manques });
}
