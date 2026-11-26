/**
 * Factures d'achat et paiement des fournisseurs (CDC § 11.7, 11.8, 11.9, 11.17, 11.19 ; FIN-RG-033, 034, 100, 101,
 * 141, 145, 146 ; CA-FIN-11, 13, 17, 22, 24, 26 à 29).
 *
 * - La facture est une fiche d'imputation du journal des achats (ACH), avec pièce jointe et échéance ; elle n'affecte
 *   les comptes qu'après validation (comptable puis DAF), ce qui constitue l'écriture EVT-15.
 * - Taxe calculée sur le hors taxe selon le régime du code taxe : non récupérable (incluse dans la charge ou la valeur
 *   du bien, par défaut), récupérable (compte de taxe), partiellement récupérable (pourcentage, le reste en charge).
 * - Échéance calculée par le modèle de règlement (comptant, n jours, n jours fin de mois, le n du mois suivant).
 * - Ligne imputée en immobilisation : fiches créées à la validation, une par unité ; frais accessoires répartis sur
 *   les biens au prorata ; seuil des biens de faible valeur apprécié hors taxe par unité (ou sur le prix global d'un
 *   bien composé) ; passage en charge seulement si la catégorie le permet, sous le seuil, avec motif (mobilier :
 *   renouvellement, biens remplacés désignés et sortis du registre).
 * - Paiement par la chaîne de paiement (ordre FOURNISSEUR), écriture EVT-16 et lettrage avec la facture.
 */
import type { Executant } from '../../db/pool.js';
import type { Acteur } from '../../noyau/acteur.js';
import { ErreurMetier, exiger, nonTrouve } from '../../noyau/erreurs.js';
import { ajouterJours, dateValide } from '../../noyau/dates.js';
import { journaliser } from '../../moteurs/audit.js';
import { publier } from '../../moteurs/evenements.js';
import { booleen, entier } from '../../moteurs/parametres.js';
import { enregistrerOperation } from '../../moteurs/validation.js';
import { comptabiliser, lettrer } from '../comptabilite/moteur.js';
import { attribuerRole } from '../referentiels/roles.js';
import { creerFicheImputation, rejeterFiche, validerFiche, type LigneSaisie } from './saisie.js';
import { enregistrerExecution, ordonnerPaiement } from './paiements.js';
import { creerBiens, sortirBiensRemplaces, type NouveauBien } from './immobilisations.js';

export const OPERATION_FACTURE_ACHAT = 'FACTURE_ACHAT';
const COMPTE_CHARGE_FAIBLE_VALEUR = '6312';

export interface LigneAchat {
  modele?: string; compte?: string; libelle: string; montantHT: number; quantite?: number; codeTaxe?: string;
  /** Frais accessoires (transport, installation) répartis sur les biens de la facture. */
  accessoire?: boolean;
  /** Bien composé : les lignes d'un même groupe forment un seul bien, apprécié sur son prix global. */
  groupe?: string;
  passageEnCharge?: { motif: string; biensRemplaces?: string[] };
}
export interface FactureAchat {
  fournisseurTiersId: string; numeroFacture: string; dateFacture: string; pieceDocumentId: string; modeleReglement?: string; echeance?: string; lignes: LigneAchat[];
}

/** FIN-RG-101 : échéance par condition (CA-FIN-17 : 10/03 à 30 jours fin de mois → 30/04). */
export function echeanceDe(date: string, condition: string): string {
  if (condition === 'COMPTANT') return date;
  const finDeMois = (d: string) => { const [a, m] = d.split('-').map(Number) as [number, number]; return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10); };
  let m = /^J(\d+)FM$/.exec(condition);
  if (m) return finDeMois(ajouterJours(date, Number(m[1])));
  m = /^J(\d+)$/.exec(condition);
  if (m) return ajouterJours(date, Number(m[1]));
  m = /^LE(\d+)$/.exec(condition);
  if (m) {
    const [a, mo] = date.split('-').map(Number) as [number, number];
    const suivant = new Date(Date.UTC(a, mo, 1)).toISOString().slice(0, 7);
    const jour = Math.min(Number(m[1]), Number(finDeMois(`${suivant}-01`).slice(8)));
    return `${suivant}-${String(jour).padStart(2, '0')}`;
  }
  throw new ErreurMetier('CONDITION_INVALIDE', `Condition de règlement inconnue : ${condition}`, 422);
}

interface Categorie { id: string; code: string; libelle: string; faible_valeur_autorisee: boolean }
interface LigneCalculee {
  libelle: string; compte: string; ht: number; quantite: number; taxe: number; recuperable: number; codeTaxeId: string | null; compteTaxe: string | null;
  cout: number; frais: number; categorie: Categorie | null; groupe: string | null; unitaireHT: number;
  traitement: 'CHARGE' | 'IMMOBILISATION' | 'PASSAGE_CHARGE'; proposePassageCharge: boolean; motif: string | null; biensRemplaces: string[];
}

async function taxeDe(q: Executant, code: string, date: string) {
  const t = (await q.query<{ id: string; taux: string; regime: string | null; pourcentage_recuperable: string | null; numero: string }>(
    `SELECT ct.id, ct.taux, ct.regime, ct.pourcentage_recuperable, c.numero FROM code_taxe ct JOIN compte c ON c.id = ct.compte_id
      WHERE ct.code = $1 AND ct.date_effet <= $2 AND ct.supprime_le IS NULL ORDER BY ct.date_effet DESC LIMIT 1`, [code, date])).rows[0];
  if (!t) throw nonTrouve(`Code taxe ${code}`);
  return t;
}

/** Calcul de la facture (proposition présentée au comptable avant l'enregistrement). */
export async function calculerFactureAchat(q: Executant, d: FactureAchat) {
  exiger(dateValide(d.dateFacture), 'DATE_INVALIDE', 'Date de facture invalide');
  exiger(d.lignes.length >= 1, 'LIGNES_REQUISES', 'Au moins une ligne');
  const seuil = await entier(q, 'FIN_SEUIL_FAIBLE_VALEUR');
  const faibleValeurActive = await booleen(q, 'FIN_FAIBLE_VALEUR_ACTIVE', d.dateFacture);
  const lignes: LigneCalculee[] = [];
  for (const l of d.lignes) {
    exiger(Number.isInteger(l.montantHT) && l.montantHT > 0, 'MONTANT_INVALIDE', `Montant hors taxe invalide : ${l.libelle}`);
    const quantite = l.quantite ?? 1;
    exiger(Number.isInteger(quantite) && quantite >= 1, 'QUANTITE_INVALIDE', 'Quantité invalide');
    let compte = l.compte, categorie: Categorie | null = null;
    if (l.modele) {
      const m = (await q.query<{ lignes: { compte: string; categorie: string | null } }>('SELECT lignes FROM modele_ecriture WHERE code = $1 AND supprime_le IS NULL', [l.modele])).rows[0];
      if (!m) throw nonTrouve(`Modèle d'achat ${l.modele}`);
      compte ??= m.lignes.compte;
    }
    exiger(compte, 'COMPTE_REQUIS', `Compte ou modèle requis : ${l.libelle}`);
    const c = (await q.query<{ numero: string; imputable: boolean }>(`SELECT numero, imputable FROM compte WHERE numero = rpad($1, 8, '0') AND supprime_le IS NULL`, [compte])).rows[0];
    if (!c) throw new ErreurMetier('COMPTE_INCONNU', `Compte ${compte} absent du plan`, 422);
    exiger(c.imputable, 'COMPTE_NON_IMPUTABLE', `Compte ${compte} non imputable (CA-FIN-07)`);
    exiger(/^[26]/.test(c.numero), 'COMPTE_ACHAT', 'Une facture d\'achat s\'impute en charge (classe 6) ou en immobilisation (classe 2)');
    if (c.numero.startsWith('2')) {
      categorie = (await q.query<Categorie>('SELECT k.id, k.code, k.libelle, k.faible_valeur_autorisee FROM categorie_immobilisation k JOIN compte x ON x.id = k.compte_immo_id WHERE x.numero = $1 AND k.supprime_le IS NULL', [c.numero])).rows[0] ?? null;
      exiger(categorie, 'CATEGORIE_ABSENTE', `Aucune catégorie d'immobilisation pour le compte ${compte}`);
    }
    let taxe = 0, recuperable = 0, codeTaxeId: string | null = null, compteTaxe: string | null = null;
    if (l.codeTaxe) {
      const t = await taxeDe(q, l.codeTaxe, d.dateFacture);
      taxe = Math.round(l.montantHT * Number(t.taux));
      // FIN-RG-034 : non récupérable par défaut (la Compagnie n'est pas assujettie à la TVA)
      recuperable = t.regime === 'RECUPERABLE' ? taxe : t.regime === 'PARTIEL' ? Math.round(taxe * Number(t.pourcentage_recuperable ?? 0)) : 0;
      codeTaxeId = t.id; compteTaxe = t.numero;
    }
    lignes.push({ libelle: l.libelle, compte: c.numero, ht: l.montantHT, quantite, taxe, recuperable, codeTaxeId, compteTaxe, cout: l.montantHT + taxe - recuperable, frais: 0,
      categorie, groupe: categorie ? l.groupe ?? null : null, unitaireHT: 0, traitement: categorie ? 'IMMOBILISATION' : 'CHARGE', proposePassageCharge: false,
      motif: l.passageEnCharge?.motif?.trim() || null, biensRemplaces: l.passageEnCharge?.biensRemplaces ?? [] });
    if (l.accessoire) (lignes[lignes.length - 1] as LigneCalculee & { accessoire?: boolean }).accessoire = true;
  }
  // Frais accessoires répartis sur les biens au prorata du hors taxe (CA-FIN-29), coût compris
  const biens = lignes.filter(x => x.categorie);
  const accessoires = lignes.filter(x => (x as { accessoire?: boolean }).accessoire && !x.categorie);
  if (biens.length && accessoires.length) {
    const baseHT = biens.reduce((s, x) => s + x.ht, 0);
    for (const a of accessoires) {
      let resteHT = a.ht, resteCout = a.cout;
      biens.forEach((b, i) => {
        const partHT = i === biens.length - 1 ? resteHT : Math.round(a.ht * b.ht / baseHT);
        const partCout = i === biens.length - 1 ? resteCout : Math.round(a.cout * b.ht / baseHT);
        b.frais += partHT; b.cout += partCout; resteHT -= partHT; resteCout -= partCout;
      });
      a.cout = 0; // absorbé par les biens ; la taxe récupérable des frais reste au compte de taxe
    }
  }
  // Seuil des biens de faible valeur : hors taxe par unité, frais répartis ; bien composé apprécié sur son prix global
  for (const b of biens) b.unitaireHT = Math.round((b.ht + b.frais) / b.quantite);
  const groupes = new Map<string, LigneCalculee[]>();
  for (const b of biens.filter(x => x.groupe)) groupes.set(b.groupe!, [...(groupes.get(b.groupe!) ?? []), b]);
  for (const g of groupes.values()) {
    exiger(g.every(x => x.quantite === g[0]!.quantite), 'GROUPE_INVALIDE', 'Les éléments d\'un bien composé ont la même quantité');
    const global = g.reduce((s, x) => s + x.unitaireHT, 0);
    for (const x of g) x.unitaireHT = global;
  }
  for (const b of biens) {
    b.proposePassageCharge = faibleValeurActive && b.categorie!.faible_valeur_autorisee && b.unitaireHT <= seuil;
    if (!b.motif) continue;
    exiger(b.proposePassageCharge, 'IMMOBILISATION_IMPOSEE', `${b.libelle} : prix unitaire hors taxe de ${b.unitaireHT.toLocaleString('fr-FR')} GNF${b.groupe ? ' (bien composé)' : ''} au-delà du seuil ou catégorie non éligible : immobilisation imposée (CGI art. 101-VIII)`);
    if (b.categorie!.code === 'MOBILIER') {
      // CA-FIN-26, 27 : mobilier de bureau passé en charge seulement en renouvellement de biens désignés
      exiger(/renouvel/i.test(b.motif) && b.biensRemplaces.length >= b.quantite, 'RENOUVELLEMENT_REQUIS', 'Mobilier de bureau : passage en charge seulement en renouvellement, avec la désignation des biens remplacés');
      const r = await q.query(`SELECT 1 FROM immobilisation i JOIN categorie_immobilisation k ON k.id = i.categorie_id WHERE i.id = ANY($1) AND i.statut = 'EN_SERVICE' AND k.code = 'MOBILIER'`, [b.biensRemplaces]);
      exiger(r.rowCount === new Set(b.biensRemplaces).size, 'BIENS_REMPLACES_INVALIDES', 'Les biens remplacés sont du mobilier en service inscrit au registre');
    }
    b.traitement = 'PASSAGE_CHARGE';
  }
  const ht = lignes.reduce((s, x) => s + x.ht, 0), taxe = lignes.reduce((s, x) => s + x.taxe, 0);
  let echeance = d.echeance ?? null;
  if (!echeance && d.modeleReglement) {
    const m = (await q.query<{ condition: string }>('SELECT condition FROM modele_reglement WHERE code = $1 AND supprime_le IS NULL', [d.modeleReglement])).rows[0];
    if (!m) throw nonTrouve(`Modèle de règlement ${d.modeleReglement}`);
    echeance = echeanceDe(d.dateFacture, m.condition);
  }
  exiger(echeance && dateValide(echeance), 'ECHEANCE_REQUISE', 'Échéance ou modèle de règlement requis (FIN-RG-033)');
  return { lignes, ht, taxe, ttc: ht + taxe, recuperable: lignes.reduce((s, x) => s + x.recuperable, 0), echeance: echeance! };
}

/** Compte auxiliaire du fournisseur (rôle FOURNISSEUR attribué au besoin, sous le collectif 461). */
async function auxiliaireFournisseur(q: Executant, acteur: Acteur, tiersId: string) {
  let r = (await q.query<{ code: string; id: string }>(
    `SELECT a.code, a.id FROM tiers_role tr JOIN compte_auxiliaire a ON a.id = tr.compte_auxiliaire_id WHERE tr.tiers_id = $1 AND tr.role = 'FOURNISSEUR' AND tr.date_fin IS NULL`, [tiersId])).rows[0];
  if (!r) {
    await attribuerRole(q, acteur, { tiersId, role: 'FOURNISSEUR' });
    r = (await q.query<{ code: string; id: string }>(
      `SELECT a.code, a.id FROM tiers_role tr JOIN compte_auxiliaire a ON a.id = tr.compte_auxiliaire_id WHERE tr.tiers_id = $1 AND tr.role = 'FOURNISSEUR' AND tr.date_fin IS NULL`, [tiersId])).rows[0];
  }
  if (!r) throw new ErreurMetier('COMPTE_FOURNISSEUR_ABSENT', 'Fournisseur sans compte auxiliaire', 422);
  return r;
}

/** Saisie de la facture sur le journal ACH : brouillard soumis à validation (comptable, puis DAF). */
export async function saisirFactureAchat(q: Executant, acteur: Acteur, d: FactureAchat) {
  exiger(d.numeroFacture?.trim(), 'REFERENCE_REQUISE', 'Numéro de la facture du fournisseur obligatoire');
  const doublon = await q.query(`SELECT 1 FROM fiche_imputation f JOIN ecriture e ON e.id = f.ecriture_id WHERE f.tiers_id = $1 AND f.reference = $2 AND e.supprime_le IS NULL`, [d.fournisseurTiersId, d.numeroFacture]);
  exiger(!doublon.rowCount, 'FACTURE_EXISTANTE', 'Cette facture du fournisseur est déjà enregistrée', 409);
  const c = await calculerFactureAchat(q, d);
  const aux = await auxiliaireFournisseur(q, acteur, d.fournisseurTiersId);
  const fournisseur = (await q.query<{ n: string }>(`SELECT trim(nom || ' ' || COALESCE(prenoms, '')) AS n FROM tiers WHERE id = $1`, [d.fournisseurTiersId])).rows[0]!.n;
  const lignes: LigneSaisie[] = [];
  for (const l of c.lignes) {
    if (l.cout > 0) lignes.push({ compte: l.traitement === 'PASSAGE_CHARGE' ? COMPTE_CHARGE_FAIBLE_VALEUR : l.compte, libelle: `${l.libelle}${l.taxe && !l.recuperable ? ' – taxe incluse' : ''}`, debit: l.cout, credit: 0 });
    if (l.recuperable > 0) lignes.push({ compte: l.compteTaxe!, libelle: `Taxe récupérable – ${l.libelle}`, debit: l.recuperable, credit: 0, codeTaxeId: l.codeTaxeId! });
  }
  lignes.push({ compte: '461', auxiliaire: aux.code, libelle: `${fournisseur} – facture ${d.numeroFacture}`, debit: 0, credit: c.ttc, echeance: c.echeance });
  const biens = c.lignes.filter(l => l.categorie).map(l => ({
    libelle: l.libelle, categorieId: l.categorie!.id, quantite: l.quantite, cout: l.cout, groupe: l.groupe, traitement: l.traitement, motif: l.motif, biensRemplaces: l.biensRemplaces,
  }));
  const r = await creerFicheImputation(q, acteur, { journal: 'ACH', date: d.dateFacture, reference: d.numeroFacture, libelle: `Facture ${d.numeroFacture} – ${fournisseur}`, pieceDocumentId: d.pieceDocumentId, tiersId: d.fournisseurTiersId, lignes },
    { typeOperation: OPERATION_FACTURE_ACHAT, donnees: { fournisseur, ttc: c.ttc, echeance: c.echeance, biens } });
  return { ...r, ht: c.ht, taxe: c.taxe, ttc: c.ttc, echeance: c.echeance, lignes: c.lignes.map(l => ({ libelle: l.libelle, compte: l.compte, cout: l.cout, traitement: l.traitement, unitaireHT: l.unitaireHT, proposePassageCharge: l.proposePassageCharge })) };
}

type BienFacture = { libelle: string; categorieId: string; quantite: number; cout: number; groupe: string | null; traitement: string; motif: string | null; biensRemplaces: string[] };

enregistrerOperation(OPERATION_FACTURE_ACHAT, {
  administrative: false,
  // EVT-15 : la facture affecte les comptes ; les fiches d'immobilisation sont créées sans double saisie (FIN-RG-141)
  async appliquer(q, demande, acteur) {
    const { ecritureId } = await validerFiche(q, demande, acteur);
    const f = (await q.query<{ tiers_id: string; reference: string; date: string }>(
      `SELECT f.tiers_id, f.reference, e.date_comptable::text AS date FROM fiche_imputation f JOIN ecriture e ON e.id = f.ecriture_id WHERE f.id = $1`, [demande.objet_id])).rows[0]!;
    const biens = ((demande.donnees as { biens?: BienFacture[] }).biens ?? []);
    // Une fiche par unité ; un bien composé (groupe) forme une fiche par unité, de valeur égale à la somme de ses éléments
    const nouveaux: NouveauBien[] = [];
    const parGroupe = new Map<string, BienFacture[]>();
    for (const b of biens) {
      if (b.groupe) { parGroupe.set(b.groupe, [...(parGroupe.get(b.groupe) ?? []), b]); continue; }
      let reste = b.cout;
      for (let i = 0; i < b.quantite; i++) {
        const v = i === b.quantite - 1 ? reste : Math.round(b.cout / b.quantite);
        reste -= v;
        nouveaux.push({ categorieId: b.categorieId, designation: b.quantite > 1 ? `${b.libelle} (${i + 1}/${b.quantite})` : b.libelle, valeurOrigine: v,
          statut: b.traitement === 'PASSAGE_CHARGE' ? 'PASSE_EN_CHARGE' : 'EN_SERVICE', motif: b.motif ?? undefined });
      }
    }
    for (const g of parGroupe.values()) {
      const quantite = g[0]!.quantite, total = g.reduce((s, x) => s + x.cout, 0);
      let reste = total;
      for (let i = 0; i < quantite; i++) {
        const v = i === quantite - 1 ? reste : Math.round(total / quantite);
        reste -= v;
        nouveaux.push({ categorieId: g[0]!.categorieId, designation: `${g.map(x => x.libelle).join(' + ')}${quantite > 1 ? ` (${i + 1}/${quantite})` : ''}`, valeurOrigine: v,
          statut: g[0]!.traitement === 'PASSAGE_CHARGE' ? 'PASSE_EN_CHARGE' : 'EN_SERVICE', motif: g[0]!.motif ?? undefined });
      }
    }
    if (nouveaux.length) await creerBiens(q, acteur, { ficheImputationId: demande.objet_id, fournisseurTiersId: f.tiers_id, dateAcquisition: f.date, biens: nouveaux });
    const remplaces = biens.flatMap(b => b.biensRemplaces ?? []);
    if (remplaces.length) await sortirBiensRemplaces(q, acteur, remplaces, f.date, demande.objet_id, f.reference);
    await publier(q, acteur, { type: 'FACTURE_ACHAT_VALIDEE', objet: { type: 'fiche_imputation', id: demande.objet_id }, charge: { reference: f.reference, ecritureId, biens: nouveaux.length }, cleIdempotence: `facture_achat:${demande.objet_id}` });
  },
  async rejeter(q, demande, acteur) { await rejeterFiche(q, demande, acteur); },
});

// ---------------------------------------------------------------- paiement (FIN-RG-050, EVT-16)

/** Ligne fournisseur de la facture (crédit de l'auxiliaire) et ce qui reste dû. */
async function detteFacture(q: Executant, ficheId: string) {
  const r = (await q.query<{ ligne_id: string; auxiliaire_id: string; credit: string; statut: string; lettrage_id: string | null; tiers_id: string; reference: string; journal: string }>(
    `SELECT l.id AS ligne_id, l.compte_auxiliaire_id AS auxiliaire_id, l.credit, e.statut, l.lettrage_id, f.tiers_id, f.reference, j.code AS journal
       FROM fiche_imputation f JOIN journal j ON j.id = f.journal_id JOIN ecriture e ON e.id = f.ecriture_id JOIN ligne_ecriture l ON l.ecriture_id = e.id
      WHERE f.id = $1 AND l.credit > 0 AND l.compte_auxiliaire_id IS NOT NULL AND e.supprime_le IS NULL`, [ficheId])).rows[0];
  if (!r) throw nonTrouve('Facture d\'achat');
  return r;
}

export async function ordonnerPaiementFacture(q: Executant, acteur: Acteur, ficheId: string, coordonneeId: string) {
  const f = await detteFacture(q, ficheId);
  exiger(f.journal === 'ACH', 'PAS_UNE_FACTURE', 'Seule une facture d\'achat se paie ici');
  exiger(f.statut === 'VALIDEE', 'FACTURE_NON_VALIDEE', 'La facture est payée après sa validation');
  exiger(!f.lettrage_id, 'DEJA_PAYEE', 'Facture déjà réglée', 409);
  const encours = await q.query(`SELECT 1 FROM ordre_paiement WHERE objet_type = 'fiche_imputation' AND objet_id = $1 AND statut NOT IN ('REJETE')`, [ficheId]);
  exiger(!encours.rowCount, 'ORDRE_EXISTANT', 'Un ordre de paiement existe déjà pour cette facture', 409);
  return ordonnerPaiement(q, acteur, { type: 'FOURNISSEUR', beneficiaireTiersId: f.tiers_id, coordonneeId, montant: Number(f.credit), objet: { type: 'fiche_imputation', id: ficheId },
    donnees: { libelle: `Facture ${f.reference}`, reference: f.reference } });
}

enregistrerExecution('FOURNISSEUR', async (q, acteur, ordre, tresorerie, avisDocumentId) => {
  const f = await detteFacture(q, ordre.objet_id);
  const aux = (await q.query<{ collectif_id: string }>('SELECT collectif_id FROM compte_auxiliaire WHERE id = $1', [f.auxiliaire_id])).rows[0]!;
  const [e] = await comptabiliser(q, acteur, { codeEvt: 'EVT-16', reference: f.reference, pieceDocumentId: avisDocumentId, journalTresorerie: tresorerie.journal,
    montants: { MONTANT: ordre.montant }, comptes: { FOURNISSEUR: { compteId: aux.collectif_id, auxiliaireId: f.auxiliaire_id }, TRESORERIE: { compteId: tresorerie.compteId } } });
  // Lettrage automatique avec la facture (FIN-RG-026)
  const reglement = (await q.query<{ id: string }>('SELECT id FROM ligne_ecriture WHERE ecriture_id = $1 AND compte_auxiliaire_id = $2', [e!.id, f.auxiliaire_id])).rows[0]!;
  if (Number(f.credit) === ordre.montant) await lettrer(q, f.auxiliaire_id, [f.ligne_id, reglement.id], 'AUTOMATIQUE', null);
  return { ecritureId: e!.id, libelle: `Facture ${f.reference}` };
});

// ---------------------------------------------------------------- consultation

export async function listerFacturesAchat(q: Executant) {
  return (await q.query(
    `SELECT f.id, f.numero_provisoire, f.reference, f.tiers_id, f.cree_le, e.date_comptable, e.statut, e.numero_piece, e.supprime_le IS NOT NULL AS rejetee,
            trim(t.nom || ' ' || COALESCE(t.prenoms, '')) AS fournisseur, l.credit::bigint AS montant, l.echeance, l.lettrage_id IS NOT NULL AS payee,
            (SELECT o.numero || ' ' || o.statut FROM ordre_paiement o WHERE o.objet_type = 'fiche_imputation' AND o.objet_id = f.id ORDER BY o.cree_le DESC LIMIT 1) AS ordre,
            (SELECT count(*)::int FROM immobilisation i WHERE i.fiche_imputation_id = f.id) AS biens
       FROM fiche_imputation f JOIN journal j ON j.id = f.journal_id AND j.code = 'ACH' JOIN ecriture e ON e.id = f.ecriture_id
       JOIN ligne_ecriture l ON l.ecriture_id = e.id AND l.credit > 0 AND l.compte_auxiliaire_id IS NOT NULL LEFT JOIN tiers t ON t.id = f.tiers_id
      ORDER BY f.cree_le DESC LIMIT 300`)).rows;
}

export async function modelesAchat(q: Executant) {
  const [achat, reglement] = await Promise.all([
    q.query(`SELECT code, libelle, lignes->>'compte' AS compte, lignes->>'categorie' AS categorie FROM modele_ecriture WHERE lignes->>'nature' = 'ACHAT' AND supprime_le IS NULL ORDER BY libelle`),
    q.query('SELECT code, mode, condition FROM modele_reglement WHERE supprime_le IS NULL ORDER BY code'),
  ]);
  return { achat: achat.rows, reglement: reglement.rows };
}

