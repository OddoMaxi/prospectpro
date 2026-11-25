/**
 * Vie du contrat, suite (CDC § 8.8, 8.9, 8.11 ; PROD-RG-041, 044, 045, 046, 060 à 062, 074 ; CA-PROD-22, 24).
 *
 * - Avenant de correction : donnée ayant un effet sur le tarif (date de naissance, qualité) ; prime annuelle recalculée,
 *   différence au prorata depuis la date d'effet : quittance à régler (prime supplémentaire) ou ristourne (EVT-04).
 *   Même numéro de police, carences conservées (les dates d'entrée ne changent pas), validation par délégation.
 * - Retrait d'un ayant droit : à l'échéance sans ristourne ; en cas de décès, sortie à la date du décès et ristourne
 *   au prorata si le produit le prévoit, après validation.
 * - Changement de souscripteur : sans incidence sur la prime, accepté par le nouveau souscripteur par code à usage
 *   unique, qui reconfirme la désignation des bénéficiaires.
 * - Résiliation par la Compagnie (fraude, usurpation d'identité), validée ; ristourne selon le produit ; cartes
 *   bloquées à la date d'effet (le moteur de droits lit le statut de la police) ; souscripteur et agent notifiés.
 * - Renonciation après une souscription en ligne, dans le délai et sans prestation : police annulée depuis l'origine,
 *   prime intégralement remboursée (EVT-04).
 *
 * Toute ristourne est une contre-passation EVT-04 : la part payée par le compte de production y est recréditée,
 * la part payée directement est versée au client par la chaîne de paiement (ordre RIST, écriture EVT-04 au journal TRE).
 * La commission correspondante est reprise par une ligne négative, déduite de la facture suivante (COM-RG-121).
 */
import type { Executant } from '../../db/pool.js';
import type { Acteur } from '../../noyau/acteur.js';
import { ErreurMetier, exiger, nonTrouve } from '../../noyau/erreurs.js';
import { age, ajouterJours, aujourdhui, dateValide } from '../../noyau/dates.js';
import { journaliser } from '../../moteurs/audit.js';
import { attribuer } from '../../moteurs/numerotation.js';
import { publier } from '../../moteurs/evenements.js';
import { genererDocument } from '../../moteurs/documents.js';
import { notifier } from '../../moteurs/notifications.js';
import { entier } from '../../moteurs/parametres.js';
import { enregistrerOperation, soumettre } from '../../moteurs/validation.js';
import { comptabiliser, type CompteResolu } from '../comptabilite/moteur.js';
import { tarifer } from '../catalogue/service.js';
import { compteComptable, lireCompteProduction, mouvementer } from '../commercial/comptesProduction.js';
import { enregistrerExecution, ordonnerPaiement } from '../finances/paiements.js';
import { confirmerAcceptation, demanderAcceptation } from '../documents/acceptation.js';
import { attribuerRole } from '../referentiels/roles.js';
import { Refus } from '../auth/service.js';
import { lirePoliceVie, type PoliceVie } from './renouvellement.js';
import { compteClient, compteCommissions, encaisserPrimeAvenant, periodeCourante, prorata, type PaiementAvenant, type TaxeCalculee } from './avenants.js';

export const OPERATION_CORRECTION = 'AVENANT_CORRECTION';
export const OPERATION_RESILIATION = 'RESILIATION';
export const OPERATION_RETRAIT = 'RETRAIT_AYANT_DROIT';

const gnf = (n: number) => `${n.toLocaleString('fr-FR').replace(/ /g, ' ')} GNF`;
const fr = (d: string) => d.split('-').reverse().join('/');
const jours = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000) + 1;
const nomTiers = async (q: Executant, id: string) => (await q.query<{ n: string }>(`SELECT trim(nom || ' ' || COALESCE(prenoms, '')) AS n FROM tiers WHERE id = $1`, [id])).rows[0]?.n ?? '';
const MOTIFS_RESILIATION = { FRAUDE: 'fraude avérée', USURPATION_IDENTITE: 'usurpation d\'identité' } as const;
export type MotifResiliation = keyof typeof MOTIFS_RESILIATION;

// ---------------------------------------------------------------- ristourne (EVT-04)

interface Ristourne {
  nette: number; accessoires: number; taxes: { compteId: string; codeTaxeId: string; montant: number }[];
  commissions: { intervenantId: string; quittanceId: string; montant: number; assiette: number }[];
  /** Part recréditée au compte de production (prime payée par débit de ce compte). */
  versCompteProduction: number; compteProductionId: string | null;
  /** Part versée au client par la chaîne de paiement (prime payée directement). */
  versClient: number;
  client: CompteResolu; quittances: string[];
}
const totalRistourne = (r: Ristourne) => r.nette + r.accessoires + r.taxes.reduce((s, t) => s + t.montant, 0);

/** Compte de production débité pour une quittance (mouvement lié à son écriture de règlement). */
async function compteProductionDeQuittance(q: Executant, ecriturePerceptionId: string | null) {
  if (!ecriturePerceptionId) return null;
  return (await q.query<{ compte_production_id: string }>('SELECT compte_production_id FROM mouvement_compte_production WHERE ecriture_id = $1 LIMIT 1', [ecriturePerceptionId])).rows[0]?.compte_production_id ?? null;
}

/**
 * Part non couverte des quittances soldées à partir d'une date (toute la prime si `depuis` précède la période) :
 * pour chaque quittance, prorata des jours restants sur ses jours, taxes et commission dans la même proportion.
 */
async function partNonCouverte(q: Executant, policeId: string, depuis: string): Promise<Ristourne> {
  const qts = (await q.query<{ id: string; periode_debut: string; periode_fin: string; prime_nette: string; accessoires: string; mode_paiement: string; ecriture_constatation_id: string; ecriture_perception_id: string | null }>(
    `SELECT id, periode_debut::text, periode_fin::text, prime_nette, accessoires, mode_paiement, ecriture_constatation_id, ecriture_perception_id
       FROM quittance WHERE police_id = $1 AND statut = 'SOLDEE' AND periode_fin >= $2 ORDER BY periode_debut`, [policeId, depuis])).rows;
  const r: Ristourne = { nette: 0, accessoires: 0, taxes: [], commissions: [], versCompteProduction: 0, compteProductionId: null, versClient: 0, client: { compteId: '' }, quittances: [] };
  const taxes = new Map<string, { compteId: string; codeTaxeId: string; montant: number }>();
  for (const qt of qts) {
    const ratio = depuis <= qt.periode_debut ? 1 : jours(depuis, qt.periode_fin) / jours(qt.periode_debut, qt.periode_fin);
    const lignes = (await q.query<{ compte_id: string; compte_auxiliaire_id: string | null; debit: string; credit: string; code_taxe_id: string | null }>(
      'SELECT compte_id, compte_auxiliaire_id, debit, credit, code_taxe_id FROM ligne_ecriture WHERE ecriture_id = $1', [qt.ecriture_constatation_id])).rows;
    const client = lignes.find(l => Number(l.debit) > 0 && l.compte_auxiliaire_id);
    if (client) r.client = { compteId: client.compte_id, auxiliaireId: client.compte_auxiliaire_id };
    const nette = Math.round(Number(qt.prime_nette) * ratio), acc = Math.round(Number(qt.accessoires) * ratio);
    let tx = 0;
    for (const l of lignes.filter(x => x.code_taxe_id)) {
      const m = Math.round(Number(l.credit) * ratio);
      tx += m;
      const t = taxes.get(l.code_taxe_id!) ?? { compteId: l.compte_id, codeTaxeId: l.code_taxe_id!, montant: 0 };
      t.montant += m; taxes.set(l.code_taxe_id!, t);
    }
    const com = (await q.query<{ intervenant_id: string; montant: string }>(
      `SELECT intervenant_id, sum(montant)::bigint AS montant FROM commission WHERE quittance_id = $1 GROUP BY intervenant_id`, [qt.id])).rows;
    for (const c of com) {
      const m = Math.round(Number(c.montant) * ratio);
      if (m > 0) r.commissions.push({ intervenantId: c.intervenant_id, quittanceId: qt.id, montant: m, assiette: nette });
    }
    r.nette += nette; r.accessoires += acc; r.quittances.push(qt.id);
    const total = nette + acc + tx;
    const cp = qt.mode_paiement === 'DEPOT' ? await compteProductionDeQuittance(q, qt.ecriture_perception_id) : null;
    if (cp) { r.versCompteProduction += total; r.compteProductionId = cp; } else r.versClient += total;
  }
  r.taxes = [...taxes.values()];
  return r;
}

/** Coordonnées vérifiées du souscripteur pour lui verser une ristourne (REF-RG-005). */
async function coordonneeDuSouscripteur(q: Executant, tiersId: string, coordonneeId?: string | null) {
  const c = (await q.query<{ id: string }>(
    `SELECT id FROM coordonnee_paiement WHERE tiers_id = $1 AND statut = 'VERIFIEE' AND supprime_le IS NULL AND ($2::uuid IS NULL OR id = $2) ORDER BY principale DESC, cree_le DESC LIMIT 1`,
    [tiersId, coordonneeId ?? null])).rows[0];
  if (!c) throw new ErreurMetier('COORDONNEE_REQUISE', 'La ristourne est versée au souscripteur : enregistrez et faites vérifier ses coordonnées de paiement (REF-RG-005)', 422);
  return c.id;
}

/** Contre-passation EVT-04, recrédit du compte de production, reprise de commission et ordre de paiement au client. */
async function contrePasser(q: Executant, acteur: Acteur, p: PoliceVie, r: Ristourne, d: { reference: string; pieceDocumentId: string; libelle: string; coordonneeId?: string | null }) {
  const total = totalRistourne(r);
  if (total <= 0) return { montant: 0, ordre: null as null | { ordreId: string; numero: string } };
  const branche = (await q.query<{ compte_annulations_id: string }>('SELECT compte_annulations_id FROM branche_comptable WHERE code = $1', [p.branche])).rows[0]!;
  const cp = r.compteProductionId ? await lireCompteProduction(q, r.compteProductionId) : null;
  const commission = r.commissions.reduce((s, c) => s + c.montant, 0);
  const parIntervenant = new Map<string, number>();
  for (const c of r.commissions) parIntervenant.set(c.intervenantId, (parIntervenant.get(c.intervenantId) ?? 0) + c.montant);
  const ecritures = await comptabiliser(q, acteur, {
    codeEvt: 'EVT-04', reference: d.reference, pieceDocumentId: d.pieceDocumentId, libelle: { police: p.numero },
    montants: { PRIME_NETTE: r.nette, ACCESSOIRES: r.accessoires, PRIME_TOTALE: total, COMMISSION: commission, REMBOURSE: r.versCompteProduction, PAIEMENT_RISTOURNE: 0 },
    comptes: {
      CLIENT: r.client.compteId ? r.client : await compteClient(q, p.souscripteur_id), ANNULATIONS_BRANCHE: { compteId: branche.compte_annulations_id },
      TAXES: r.taxes.map(t => ({ compteId: t.compteId, montant: t.montant, codeTaxeId: t.codeTaxeId })),
      ...(cp ? { REMBOURSEMENT: compteComptable(cp) } : {}),
      COMMISSIONS_A_PAYER: await Promise.all([...parIntervenant].map(async ([id, m]) => ({ ...(await compteCommissions(q, id)), montant: m }))),
    },
  });
  const enc = ecritures.find(e => e.journal === 'ENC'), com = ecritures.find(e => e.journal === 'COM');
  if (cp && enc) await mouvementer(q, acteur, { compteId: cp.id, nature: 'ANNULATION', montant: r.versCompteProduction, reference: d.reference, ecritureId: enc.id, ignorerGel: true });
  for (const c of r.commissions) {
    await q.query(`INSERT INTO commission (police_id, quittance_id, intervenant_id, type, assiette, taux, montant, statut, ecriture_id) VALUES ($1,$2,$3,'REPRISE',$4,NULL,$5,'DUE',$6)`,
      [p.id, c.quittanceId, c.intervenantId, c.assiette, -c.montant, com!.id]);
  }
  let ordre: { ordreId: string; numero: string } | null = null;
  if (r.versClient > 0) {
    const coordonneeId = await coordonneeDuSouscripteur(q, p.souscripteur_id, d.coordonneeId);
    ordre = await ordonnerPaiement(q, acteur, { type: 'RIST', beneficiaireTiersId: p.souscripteur_id, coordonneeId, montant: r.versClient, objet: { type: 'police', id: p.id },
      donnees: { libelle: d.libelle, police: p.numero, reference: d.reference } });
  }
  return { montant: total, ordre, ecritures };
}

// Paiement de la ristourne au client : écriture EVT-04 au journal de trésorerie (client débité, banque créditée)
enregistrerExecution('RIST', async (q, acteur, ordre, tresorerie, avisDocumentId) => {
  const p = (await q.query<{ numero: string; souscripteur_id: string }>('SELECT numero, souscripteur_id FROM police WHERE id = $1', [ordre.objet_id])).rows[0]!;
  const client = (await q.query<{ id: string; collectif_id: string }>(
    `SELECT a.id, a.collectif_id FROM tiers_role r JOIN compte_auxiliaire a ON a.id = r.compte_auxiliaire_id WHERE r.tiers_id = $1 AND r.role = 'SOUSCRIPTEUR' ORDER BY r.date_fin NULLS FIRST LIMIT 1`,
    [ordre.beneficiaire_tiers_id])).rows[0];
  if (!client) throw new ErreurMetier('COMPTE_CLIENT_ABSENT', 'Bénéficiaire sans compte client', 422);
  const [e] = await comptabiliser(q, acteur, {
    codeEvt: 'EVT-04', reference: ordre.numero, pieceDocumentId: avisDocumentId, journalTresorerie: tresorerie.journal, libelle: { police: p.numero },
    montants: { PRIME_NETTE: 0, ACCESSOIRES: 0, PRIME_TOTALE: 0, COMMISSION: 0, REMBOURSE: 0, PAIEMENT_RISTOURNE: ordre.montant },
    comptes: { CLIENT: { compteId: client.collectif_id, auxiliaireId: client.id }, TRESORERIE: { compteId: tresorerie.compteId }, TAXES: [], COMMISSIONS_A_PAYER: [] },
  });
  return { ecritureId: e!.id, libelle: `Ristourne police ${p.numero}` };
});

/** Prestation ou sinistre enregistré sur la police (renonciation et annulation impossibles). */
async function prestationEnregistree(q: Executant, policeId: string) {
  return !!(await q.query(
    `SELECT 1 FROM sinistre WHERE police_id = $1
     UNION ALL SELECT 1 FROM prise_en_charge pc JOIN carte_assure ca ON ca.id = pc.carte_assure_id JOIN police_assure pa ON pa.id = ca.police_assure_id WHERE pa.police_id = $1
     LIMIT 1`, [policeId])).rowCount;
}

async function demandeEnCours(q: Executant, type: string, policeId: string) {
  const r = await q.query(`SELECT 1 FROM demande_validation WHERE type_operation = $1 AND objet_id = $2 AND statut = 'EN_ATTENTE'`, [type, policeId]);
  exiger(!r.rowCount, 'DEMANDE_EN_COURS', 'Une demande est déjà en cours de validation pour cette police', 409);
}

async function nouvelAvenant(q: Executant, acteur: Acteur, p: PoliceVie) {
  const id = crypto.randomUUID();
  return { id, numero: await attribuer(q, acteur, { type: 'AVENANT', numeroPolice: p.numero }, { type: 'avenant', id }) };
}

/** Taxes du produit sur un montant de prime nette (taux en vigueur, même assiette qu'à l'émission). */
function taxesSur(base: number, taux: { libelle: string; taux: number; compteId: string; codeTaxeId: string }[]): TaxeCalculee[] {
  return taux.map(t => ({ libelle: t.libelle, montant: Math.round(base * t.taux), compteId: t.compteId, codeTaxeId: t.codeTaxeId }));
}

/** Commission reprise ou due sur une prime d'avenant, selon la clé de répartition en vigueur. */
async function commissionsSur(q: Executant, p: PoliceVie, nette: number, jour: string, quittanceId: string) {
  const b = (await q.query<{ taux: string }>(`SELECT taux FROM bareme_commission WHERE produit_id = $1 AND role = 'AGENT_GENERAL' AND date_effet <= $2 AND supprime_le IS NULL ORDER BY date_effet DESC LIMIT 1`, [p.produit_id, jour])).rows[0];
  const total = Math.round(nette * Number(b?.taux ?? 0));
  const cles = (await q.query<{ intervenant_id: string; cle_repartition: string }>(`SELECT intervenant_id, cle_repartition FROM police_intervenant WHERE police_id = $1 AND date_fin IS NULL ORDER BY cle_repartition DESC`, [p.id])).rows;
  const r = cles.map(c => ({ intervenantId: c.intervenant_id, quittanceId, montant: Math.round(total * Number(c.cle_repartition)), assiette: nette }));
  const ecart = total - r.reduce((s, x) => s + x.montant, 0);
  if (ecart && r[0]) r[0].montant += ecart;
  return r.filter(x => x.montant > 0);
}

/** Dernière quittance soldée : mode de paiement de référence d'une ristourne d'avenant. */
async function derniereQuittance(q: Executant, policeId: string) {
  const r = (await q.query<{ id: string; mode_paiement: string; ecriture_perception_id: string | null }>(
    `SELECT id, mode_paiement, ecriture_perception_id FROM quittance WHERE police_id = $1 AND statut = 'SOLDEE' ORDER BY periode_debut DESC, cree_le DESC LIMIT 1`, [policeId])).rows[0];
  if (!r) throw nonTrouve('Quittance soldée de la police');
  return { ...r, compteProductionId: r.mode_paiement === 'DEPOT' ? await compteProductionDeQuittance(q, r.ecriture_perception_id) : null };
}

/** Ristourne calculée par tarif (correction, décès d'un ayant droit) : destination selon le dernier paiement. */
async function ristourneTarif(q: Executant, p: PoliceVie, nette: number, taxes: TaxeCalculee[], jour: string): Promise<Ristourne> {
  const dq = await derniereQuittance(q, p.id);
  const total = nette + taxes.reduce((s, t) => s + t.montant, 0);
  return {
    nette, accessoires: 0, taxes: taxes.map(t => ({ compteId: t.compteId, codeTaxeId: t.codeTaxeId, montant: t.montant })), commissions: await commissionsSur(q, p, nette, jour, dq.id),
    versCompteProduction: dq.compteProductionId ? total : 0, compteProductionId: dq.compteProductionId, versClient: dq.compteProductionId ? 0 : total,
    client: await compteClient(q, p.souscripteur_id), quittances: [dq.id],
  };
}

// ---------------------------------------------------------------- avenant de correction (PROD-RG-045, CA-PROD-22)

export interface Correction { policeAssureId: string; dateNaissance?: string; qualite?: 'CONJOINT' | 'ENFANT'; dateEffet?: string; motif: string; pieceDocumentId?: string; coordonneeId?: string }

/** Calcul de la correction : primes annuelles avant et après, différence au prorata depuis la date d'effet. */
async function calculerCorrection(q: Executant, p: PoliceVie, d: Correction, jour: string) {
  const periode = await periodeCourante(q, p.id);
  const dateEffet = d.dateEffet ?? jour;
  exiger(dateValide(dateEffet) && dateEffet >= periode.date_debut && dateEffet <= periode.date_fin, 'HORS_PERIODE', 'La date d\'effet de la correction est dans la période en cours');
  const assures = (await q.query<{ id: string; tiers_id: string; qualite: string; date_naissance: string | null; nom: string }>(
    `SELECT pa.id, pa.tiers_id, pa.qualite, t.date_naissance::text, trim(t.nom || ' ' || COALESCE(t.prenoms, '')) AS nom
       FROM police_assure pa JOIN tiers t ON t.id = pa.tiers_id WHERE pa.police_id = $1 AND (pa.date_sortie IS NULL OR pa.date_sortie > $2) ORDER BY pa.rang_carte`, [p.id, dateEffet])).rows;
  const cible = assures.find(a => a.id === d.policeAssureId);
  if (!cible) throw nonTrouve('Assuré de la police');
  const corrections: { donnee: string; avant: string; apres: string }[] = [];
  if (d.dateNaissance && d.dateNaissance !== cible.date_naissance) {
    exiger(dateValide(d.dateNaissance) && d.dateNaissance < jour, 'DATE_INVALIDE', 'Date de naissance invalide');
    corrections.push({ donnee: 'Date de naissance', avant: cible.date_naissance ? fr(cible.date_naissance) : '—', apres: fr(d.dateNaissance) });
  }
  if (d.qualite && d.qualite !== cible.qualite) {
    exiger(cible.qualite !== 'ASSURE_PRINCIPAL', 'QUALITE_PRINCIPAL', 'La qualité de l\'assuré principal ne se corrige pas : changement de souscripteur ou nouvelle souscription');
    corrections.push({ donnee: 'Qualité', avant: cible.qualite.toLowerCase(), apres: d.qualite.toLowerCase() });
  }
  exiger(corrections.length, 'AUCUNE_CORRECTION', 'Aucune donnée n\'est modifiée');
  const membres = (avecCorrection: boolean) => assures.map(a => ({
    qualite: (avecCorrection && a.id === cible.id ? d.qualite ?? a.qualite : a.qualite) as 'ASSURE_PRINCIPAL' | 'CONJOINT' | 'ENFANT',
    dateNaissance: (avecCorrection && a.id === cible.id ? d.dateNaissance ?? a.date_naissance : a.date_naissance)!,
  }));
  // Tarif de la période (date de début), comme à l'émission ou au renouvellement
  const avant = await tarifer(q, p.formule_id, membres(false), periode.date_debut);
  const apres = await tarifer(q, p.formule_id, membres(true), periode.date_debut);
  const difference = apres.primeNette - avant.primeNette;
  const nette = prorata(Math.abs(difference), dateEffet, periode.date_debut, periode.date_fin);
  const taxes = taxesSur(nette, apres.taxes);
  const totale = nette + taxes.reduce((s, t) => s + t.montant, 0);
  return { periode, dateEffet, cible, corrections, primeAvant: avant.primeNette, primeApres: apres.primeNette, sens: Math.sign(difference) as -1 | 0 | 1, nette, taxes, totale, joursRestants: jours(dateEffet, periode.date_fin) };
}

/** Proposition de correction : calcul présenté, soumis à validation (référentiel des délégations). */
export async function proposerCorrection(q: Executant, acteur: Acteur, policeId: string, d: Correction, jour = aujourdhui()) {
  exiger(d.motif?.trim(), 'MOTIF_REQUIS', 'Une correction est motivée');
  const p = await lirePoliceVie(q, policeId, true);
  exiger(p.statut === 'ACTIVE', 'STATUT_INVALIDE', 'Une correction porte sur une police active');
  await demandeEnCours(q, OPERATION_CORRECTION, policeId);
  const nonRegle = await q.query(`SELECT numero FROM avenant WHERE police_id = $1 AND type = 'CORRECTION' AND difference_prime > 0 AND quittance_id IS NULL AND supprime_le IS NULL`, [policeId]);
  exiger(!nonRegle.rowCount, 'AVENANT_A_REGLER', `L'avenant ${nonRegle.rows[0]?.numero} est à régler avant toute nouvelle correction`, 409);
  const c = await calculerCorrection(q, p, d, jour);
  // Ristourne versée au client : ses coordonnées vérifiées sont exigées dès la proposition
  if (c.sens < 0 && c.totale > 0 && !(await derniereQuittance(q, policeId)).compteProductionId) await coordonneeDuSouscripteur(q, p.souscripteur_id, d.coordonneeId);
  const demande = await soumettre(q, acteur, { typeOperation: OPERATION_CORRECTION, objetType: 'police', objetId: policeId, montant: c.totale, donnees: {
    numero: p.numero, assure: c.cible.nom, motif: d.motif, corrections: c.corrections, primeAvant: c.primeAvant, primeApres: c.primeApres,
    nature: c.sens > 0 ? 'PRIME_SUPPLEMENTAIRE' : c.sens < 0 ? 'RISTOURNE' : 'SANS_INCIDENCE', montant: c.totale, saisie: d,
  } });
  return { demandeValidation: demande.id, ...c, cible: undefined, assure: c.cible.nom };
}

enregistrerOperation(OPERATION_CORRECTION, {
  administrative: false,
  async appliquer(q, demande, acteur) {
    const jour = aujourdhui();
    const saisie = (demande.donnees as { saisie: Correction }).saisie;
    const p = await lirePoliceVie(q, demande.objet_id, true);
    exiger(p.statut === 'ACTIVE', 'STATUT_INVALIDE', 'La police n\'est plus active : correction sans objet');
    // Recalcul au moment de la validation : les données ont pu changer depuis la proposition
    const c = await calculerCorrection(q, p, saisie, jour);
    if (saisie.dateNaissance) {
      await q.query('UPDATE tiers SET date_naissance = $2 WHERE id = $1', [c.cible.tiers_id, saisie.dateNaissance]);
      await journaliser(q, { ...acteur.trace(), action: 'MODIFICATION', objetType: 'tiers', objetId: c.cible.tiers_id, avant: { date_naissance: c.cible.date_naissance }, apres: { date_naissance: saisie.dateNaissance, avenant: true } });
    }
    if (saisie.qualite) await q.query('UPDATE police_assure SET qualite = $2 WHERE id = $1', [c.cible.id, saisie.qualite]);
    const av = await nouvelAvenant(q, acteur, p);
    const signe = c.sens < 0 ? -1 : 1;
    const doc = await genererDocument(q, acteur, { modeleCode: 'AVENANT_CORRECTION', typeDocument: 'AVENANT', objet: { type: 'police', id: p.id }, variables: {
      numero: av.numero, police: p.numero, souscripteur: await nomTiers(q, p.souscripteur_id), assure: c.cible.nom, corrections: c.corrections,
      prime_avant: gnf(c.primeAvant), prime_apres: gnf(c.primeApres), date_effet: fr(c.dateEffet), date_fin: fr(c.periode.date_fin), jours: c.joursRestants,
      lignes: c.sens === 0 ? [{ libelle: 'Sans incidence sur la prime', montant: gnf(0) }]
        : [{ libelle: c.sens > 0 ? 'Prime supplémentaire nette' : 'Ristourne de prime nette', montant: gnf(c.nette) }, ...c.taxes.map(t => ({ libelle: t.libelle, montant: gnf(t.montant) })),
          { libelle: c.sens > 0 ? 'Total à régler' : 'Total ristourné', montant: gnf(c.totale) }],
    } });
    await q.query(`INSERT INTO avenant (id, numero, police_id, type, date_effet, description, difference_prime, demande_validation_id) VALUES ($1,$2,$3,'CORRECTION',$4,$5,$6,$7)`,
      [av.id, av.numero, p.id, c.dateEffet, `Correction (${c.cible.nom}) : ${c.corrections.map(x => `${x.donnee.toLowerCase()} ${x.avant} → ${x.apres}`).join(', ')} – ${saisie.motif}`, signe * c.totale, demande.id]);
    if (c.sens > 0) {
      await q.query(`UPDATE demande_validation SET donnees = donnees || $2::jsonb WHERE id = $1`, [demande.id, JSON.stringify({ regle: { nette: c.nette, taxes: c.taxes, totale: c.totale } })]);
    }
    if (c.sens < 0 && c.totale > 0) {
      await contrePasser(q, acteur, p, await ristourneTarif(q, p, c.nette, c.taxes, jour), { reference: av.numero, pieceDocumentId: doc.id, libelle: `Ristourne de l'avenant ${av.numero}`, coordonneeId: saisie.coordonneeId });
    }
    await journaliser(q, { ...acteur.trace(), action: 'CREATION', objetType: 'avenant', objetId: av.id, apres: { numero: av.numero, police: p.numero, difference: signe * c.totale } });
    await publier(q, acteur, { type: 'AVENANT_EMIS', objet: { type: 'avenant', id: av.id }, charge: { police: p.numero, type: 'CORRECTION', difference: signe * c.totale }, cleIdempotence: `avenant:${av.id}` });
  },
});

/** Règlement de la prime supplémentaire d'un avenant de correction (EVT-02 ou EVT-03), au prorata déjà validé. */
export async function reglerAvenant(q: Executant, acteur: Acteur, avenantId: string, paiement: PaiementAvenant, jour = aujourdhui()) {
  const a = (await q.query<{ numero: string; police_id: string; type: string; difference_prime: string; quittance_id: string | null; date_effet: string; demande_validation_id: string | null }>(
    'SELECT numero, police_id, type, difference_prime, quittance_id, date_effet::text, demande_validation_id FROM avenant WHERE id = $1 FOR UPDATE', [avenantId])).rows[0];
  if (!a) throw nonTrouve('Avenant');
  exiger(a.type === 'CORRECTION' && Number(a.difference_prime) > 0, 'AVENANT_SANS_PRIME', 'Cet avenant n\'a pas de prime à régler');
  exiger(!a.quittance_id, 'DEJA_REGLE', 'Avenant déjà réglé', 409);
  const p = await lirePoliceVie(q, a.police_id, true);
  exiger(p.statut === 'ACTIVE', 'STATUT_INVALIDE', 'La police n\'est plus active');
  const periode = await periodeCourante(q, p.id);
  // Montants figés à la validation (enregistrés avec la demande) : pas de recalcul sur des données déjà corrigées
  const f = (await q.query<{ donnees: { regle?: { nette: number; taxes: TaxeCalculee[]; totale: number } } }>('SELECT donnees FROM demande_validation WHERE id = $1', [a.demande_validation_id])).rows[0]?.donnees.regle;
  exiger(f && f.totale === Number(a.difference_prime), 'MONTANT_INCONNU', 'Montants de l\'avenant introuvables', 500);
  const r = await encaisserPrimeAvenant(q, acteur, p, { numeroAvenant: a.numero, libelle: `Avenant ${a.numero} : correction, prime supplémentaire au prorata (${jours(a.date_effet, periode.date_fin)} jours)`,
    nette: f!.nette, taxes: f!.taxes, debut: a.date_effet, fin: periode.date_fin, paiement }, jour);
  await q.query('UPDATE avenant SET quittance_id = $2 WHERE id = $1', [avenantId, r.quittanceId]);
  await journaliser(q, { ...acteur.trace(), action: 'MODIFICATION', objetType: 'avenant', objetId: avenantId, apres: { regle: r.numeroQuittance } });
  return { quittance: r.numeroQuittance, primeTotale: r.totale };
}

// ---------------------------------------------------------------- retrait d'un ayant droit (PROD-RG-041)

export async function retirerAyantDroit(q: Executant, acteur: Acteur, policeId: string, d: { policeAssureId: string; motif: 'DEMANDE' | 'DECES'; dateDeces?: string; pieceDocumentId?: string; coordonneeId?: string }, jour = aujourdhui()) {
  const p = await lirePoliceVie(q, policeId, true);
  exiger(p.statut === 'ACTIVE', 'STATUT_INVALIDE', 'Un retrait porte sur une police active');
  const pa = (await q.query<{ id: string; tiers_id: string; qualite: string; date_sortie: string | null }>(
    'SELECT id, tiers_id, qualite, date_sortie::text FROM police_assure WHERE id = $1 AND police_id = $2', [d.policeAssureId, policeId])).rows[0];
  if (!pa) throw nonTrouve('Assuré de la police');
  exiger(pa.qualite !== 'ASSURE_PRINCIPAL', 'QUALITE_PRINCIPAL', 'L\'assuré principal ne se retire pas : non-renouvellement, résiliation ou changement de souscripteur');
  exiger(!pa.date_sortie || pa.date_sortie > jour, 'DEJA_SORTI', 'Cet ayant droit est déjà sorti', 409);
  if (d.motif === 'DEMANDE') {
    // Effet à l'échéance, sans ristourne : l'ayant droit n'est pas repris au renouvellement
    const av = await nouvelAvenant(q, acteur, p);
    const nom = await nomTiers(q, pa.tiers_id);
    await genererDocument(q, acteur, { modeleCode: 'AVENANT_RETRAIT', typeDocument: 'AVENANT', objet: { type: 'police', id: p.id }, variables: {
      numero: av.numero, police: p.numero, souscripteur: await nomTiers(q, p.souscripteur_id), assure: nom, motif: 'à la demande du souscripteur', date_sortie: fr(p.echeance),
      lignes: [{ libelle: 'Ristourne', montant: gnf(0) }], mention: 'L\'ayant droit reste couvert jusqu\'à l\'échéance ; le retrait ne donne lieu à aucune ristourne (PROD-RG-041).',
    } });
    await q.query(`UPDATE police_assure SET date_sortie = $2, motif_sortie = 'Retrait à la demande du souscripteur' WHERE id = $1`, [pa.id, p.echeance]);
    await q.query(`INSERT INTO avenant (id, numero, police_id, type, date_effet, description, difference_prime) VALUES ($1,$2,$3,'RETRAIT_AYANT_DROIT',$4,$5,0)`,
      [av.id, av.numero, p.id, p.echeance, `Retrait de ${nom} à l'échéance, sans ristourne`]);
    await journaliser(q, { ...acteur.trace(), action: 'CREATION', objetType: 'avenant', objetId: av.id, apres: { numero: av.numero, police: p.numero, retrait: nom } });
    await publier(q, acteur, { type: 'AVENANT_EMIS', objet: { type: 'avenant', id: av.id }, charge: { police: p.numero, type: 'RETRAIT_AYANT_DROIT' }, cleIdempotence: `avenant:${av.id}` });
    return { avenant: av.numero, dateSortie: p.echeance, ristourne: 0 };
  }
  // Décès : sortie à la date du décès, ristourne au prorata si le produit le prévoit, après validation
  exiger(d.dateDeces && dateValide(d.dateDeces) && d.dateDeces <= jour, 'DATE_INVALIDE', 'Date du décès requise');
  await demandeEnCours(q, OPERATION_RETRAIT, policeId);
  const c = await calculerRetrait(q, p, pa, d.dateDeces!);
  if (c.totale > 0 && !(await derniereQuittance(q, policeId)).compteProductionId) await coordonneeDuSouscripteur(q, p.souscripteur_id, d.coordonneeId);
  const demande = await soumettre(q, acteur, { typeOperation: OPERATION_RETRAIT, objetType: 'police', objetId: policeId, montant: c.totale, donnees: {
    numero: p.numero, assure: await nomTiers(q, pa.tiers_id), motif: 'Décès', dateDeces: d.dateDeces, ristourne: c.totale, saisie: d,
  } });
  return { demandeValidation: demande.id, dateSortie: d.dateDeces, ristourne: c.totale };
}

async function calculerRetrait(q: Executant, p: PoliceVie, pa: { tiers_id: string; qualite: string }, dateDeces: string) {
  const ristourne = (await q.query<{ ristourne_deces: boolean }>('SELECT ristourne_deces FROM produit WHERE id = $1', [p.produit_id])).rows[0]!.ristourne_deces;
  const periode = await periodeCourante(q, p.id);
  const lendemain = ajouterJours(dateDeces, 1);
  if (!ristourne || lendemain > periode.date_fin) return { nette: 0, taxes: [] as TaxeCalculee[], totale: 0, periode };
  const t = (await q.query<{ date_naissance: string }>('SELECT date_naissance::text FROM tiers WHERE id = $1', [pa.tiers_id])).rows[0]!;
  const annuel = await tarifer(q, p.formule_id, [{ qualite: pa.qualite as 'CONJOINT' | 'ENFANT', dateNaissance: t.date_naissance }], periode.date_debut);
  const nette = prorata(annuel.lignes[0]!.primeNette, lendemain < periode.date_debut ? periode.date_debut : lendemain, periode.date_debut, periode.date_fin);
  const taxes = taxesSur(nette, annuel.taxes);
  return { nette, taxes, totale: nette + taxes.reduce((s, x) => s + x.montant, 0), periode };
}

enregistrerOperation(OPERATION_RETRAIT, {
  administrative: false,
  async appliquer(q, demande, acteur) {
    const jour = aujourdhui();
    const saisie = (demande.donnees as { saisie: { policeAssureId: string; dateDeces: string; coordonneeId?: string } }).saisie;
    const p = await lirePoliceVie(q, demande.objet_id, true);
    const pa = (await q.query<{ id: string; tiers_id: string; qualite: string }>('SELECT id, tiers_id, qualite FROM police_assure WHERE id = $1', [saisie.policeAssureId])).rows[0]!;
    const c = await calculerRetrait(q, p, pa, saisie.dateDeces);
    const nom = await nomTiers(q, pa.tiers_id);
    const av = await nouvelAvenant(q, acteur, p);
    const doc = await genererDocument(q, acteur, { modeleCode: 'AVENANT_RETRAIT', typeDocument: 'AVENANT', objet: { type: 'police', id: p.id }, variables: {
      numero: av.numero, police: p.numero, souscripteur: await nomTiers(q, p.souscripteur_id), assure: nom, motif: 'décès', date_sortie: fr(saisie.dateDeces),
      lignes: c.totale ? [{ libelle: 'Ristourne de prime nette au prorata', montant: gnf(c.nette) }, ...c.taxes.map(t => ({ libelle: t.libelle, montant: gnf(t.montant) })), { libelle: 'Total ristourné', montant: gnf(c.totale) }]
        : [{ libelle: 'Ristourne', montant: gnf(0) }],
      mention: c.totale ? 'Ristourne au prorata des jours non couverts (PROD-RG-041).' : 'Le produit ne prévoit pas de ristourne en cas de décès.',
    } });
    await q.query(`UPDATE police_assure SET date_sortie = $2, motif_sortie = 'Décès' WHERE id = $1`, [pa.id, saisie.dateDeces]);
    await q.query(`INSERT INTO avenant (id, numero, police_id, type, date_effet, description, difference_prime, demande_validation_id) VALUES ($1,$2,$3,'RETRAIT_AYANT_DROIT',$4,$5,$6,$7)`,
      [av.id, av.numero, p.id, saisie.dateDeces, `Retrait de ${nom} (décès)${c.totale ? ', ristourne au prorata' : ''}`, -c.totale, demande.id]);
    if (c.totale > 0) await contrePasser(q, acteur, p, await ristourneTarif(q, p, c.nette, c.taxes, jour), { reference: av.numero, pieceDocumentId: doc.id, libelle: `Ristourne de l'avenant ${av.numero}`, coordonneeId: saisie.coordonneeId });
    await journaliser(q, { ...acteur.trace(), action: 'CREATION', objetType: 'avenant', objetId: av.id, apres: { numero: av.numero, police: p.numero, retrait: nom, ristourne: c.totale } });
    await publier(q, acteur, { type: 'AVENANT_EMIS', objet: { type: 'avenant', id: av.id }, charge: { police: p.numero, type: 'RETRAIT_AYANT_DROIT' }, cleIdempotence: `avenant:${av.id}` });
  },
});

// ---------------------------------------------------------------- changement de souscripteur (PROD-RG-046)

export async function preparerChangementSouscripteur(q: Executant, acteur: Acteur, policeId: string, d: { nouveauTiersId: string; motif: 'DECES_SOUSCRIPTEUR' | 'ACCORD_PARTIES' }) {
  const p = await lirePoliceVie(q, policeId, true);
  exiger(['ACTIVE', 'ECHUE'].includes(p.statut), 'STATUT_INVALIDE', 'Police non active');
  exiger(d.nouveauTiersId !== p.souscripteur_id, 'MEME_SOUSCRIPTEUR', 'Le nouveau souscripteur est déjà le souscripteur');
  const t = (await q.query<{ nature: string; date_naissance: string | null; statut: string }>('SELECT nature, date_naissance::text, statut FROM tiers WHERE id = $1 AND supprime_le IS NULL', [d.nouveauTiersId])).rows[0];
  if (!t) throw nonTrouve('Fiche du nouveau souscripteur');
  if (t.nature === 'PHYSIQUE') {
    exiger(t.date_naissance && age(t.date_naissance, aujourdhui()) >= 18, 'SOUSCRIPTEUR_MINEUR', 'Le nouveau souscripteur est majeur');
  }
  const deja = await q.query(`SELECT 1 FROM avenant WHERE police_id = $1 AND type = 'CHANGEMENT_SOUSCRIPTEUR' AND preuve_id IS NULL AND supprime_le IS NULL AND cree_le > now() - interval '1 day'`, [policeId]);
  exiger(!deja.rowCount, 'DEMANDE_EN_COURS', 'Un changement de souscripteur attend déjà la confirmation du nouveau souscripteur', 409);
  const av = await nouvelAvenant(q, acteur, p);
  const benef = (await q.query<{ nom: string; quotite: string; rang: number }>(
    `SELECT trim(t.nom || ' ' || COALESCE(t.prenoms, '')) AS nom, b.quotite, b.rang FROM designation_version v JOIN beneficiaire b ON b.designation_version_id = v.id JOIN tiers t ON t.id = b.tiers_id
      WHERE v.police_id = $1 AND v.police_assure_id IS NULL AND v.version = (SELECT max(version) FROM designation_version WHERE police_id = $1 AND police_assure_id IS NULL) ORDER BY b.rang`, [policeId])).rows;
  await q.query(`INSERT INTO avenant (id, numero, police_id, type, date_effet, description, difference_prime) VALUES ($1,$2,$3,'CHANGEMENT_SOUSCRIPTEUR',current_date,$4,0)`,
    [av.id, av.numero, policeId, JSON.stringify({ ancien: p.souscripteur_id, nouveau: d.nouveauTiersId, motif: d.motif })]);
  const doc = await genererDocument(q, acteur, { modeleCode: 'AVENANT_SOUSCRIPTEUR', typeDocument: 'AVENANT', objet: { type: 'avenant', id: av.id }, variables: {
    numero: av.numero, police: p.numero, ancien: await nomTiers(q, p.souscripteur_id), nouveau: await nomTiers(q, d.nouveauTiersId),
    motif: d.motif === 'DECES_SOUSCRIPTEUR' ? 'décès du souscripteur' : 'accord des parties', date_effet: fr(aujourdhui()),
    beneficiaires: benef.length ? benef.map(b => ({ nom: b.nom, quotite: `${Number(b.quotite)} %`, rang: b.rang })) : [{ nom: 'Aucune désignation nominative', quotite: '—', rang: '—' }],
  } });
  const envoi = await demanderAcceptation(q, acteur, doc.id, d.nouveauTiersId);
  return { avenantId: av.id, numero: av.numero, documentId: doc.id, ...envoi };
}

export async function confirmerChangementSouscripteur(q: Executant, acteur: Acteur, avenantId: string, code: string) {
  const a = (await q.query<{ police_id: string; description: string; preuve_id: string | null; type: string; numero: string }>(
    'SELECT police_id, description, preuve_id, type, numero FROM avenant WHERE id = $1 FOR UPDATE', [avenantId])).rows[0];
  if (!a) throw nonTrouve('Avenant');
  exiger(a.type === 'CHANGEMENT_SOUSCRIPTEUR' && !a.preuve_id, 'DEJA_CONFIRME', 'Avenant déjà confirmé', 409);
  const d = JSON.parse(a.description) as { ancien: string; nouveau: string; motif: string };
  const p = await lirePoliceVie(q, a.police_id, true);
  exiger(p.souscripteur_id === d.ancien, 'SOUSCRIPTEUR_MODIFIE', 'Le souscripteur a changé depuis la préparation de l\'avenant', 409);
  const doc = (await q.query<{ id: string }>(`SELECT id FROM document WHERE objet_type = 'avenant' AND objet_id = $1 ORDER BY horodatage_scellement DESC LIMIT 1`, [avenantId])).rows[0]!;
  const r = await confirmerAcceptation(q, acteur, { documentId: doc.id, signataireId: d.nouveau, code, assiste: true });
  if (r instanceof Refus) return r;
  const role = await q.query(`SELECT 1 FROM tiers_role WHERE tiers_id = $1 AND role = 'SOUSCRIPTEUR' AND date_fin IS NULL`, [d.nouveau]);
  if (!role.rowCount) await attribuerRole(q, acteur, { tiersId: d.nouveau, role: 'SOUSCRIPTEUR' });
  await q.query('UPDATE police SET souscripteur_id = $2 WHERE id = $1', [a.police_id, d.nouveau]);
  // Désignation reconfirmée par le nouveau souscripteur : nouvelle version identique, prouvée par son acceptation
  const v = (await q.query<{ id: string; version: number; mode: string; clause_texte: string | null }>(
    'SELECT id, version, mode, clause_texte FROM designation_version WHERE police_id = $1 AND police_assure_id IS NULL ORDER BY version DESC LIMIT 1', [a.police_id])).rows[0];
  if (v) {
    const nv = await q.query<{ id: string }>(`INSERT INTO designation_version (police_id, version, mode, clause_texte, date_effet, preuve_id) VALUES ($1,$2,$3,$4,now(),$5) RETURNING id`,
      [a.police_id, v.version + 1, v.mode, v.clause_texte, r.preuveId]);
    await q.query(`INSERT INTO beneficiaire (designation_version_id, tiers_id, quotite, rang, acceptant) SELECT $2, tiers_id, quotite, rang, acceptant FROM beneficiaire WHERE designation_version_id = $1`, [v.id, nv.rows[0]!.id]);
  }
  await q.query('UPDATE avenant SET preuve_id = $2 WHERE id = $1', [avenantId, r.preuveId]);
  await journaliser(q, { ...acteur.trace(), action: 'MODIFICATION', objetType: 'police', objetId: a.police_id, avant: { souscripteur: d.ancien }, apres: { souscripteur: d.nouveau, avenant: a.numero } });
  await publier(q, acteur, { type: 'AVENANT_EMIS', objet: { type: 'avenant', id: avenantId }, charge: { police: p.numero, type: 'CHANGEMENT_SOUSCRIPTEUR' }, cleIdempotence: `avenant:${avenantId}` });
  return { numero: a.numero };
}

// ---------------------------------------------------------------- résiliation (PROD-RG-061, 062)

async function ristourneResiliation(q: Executant, p: PoliceVie, effet: string) {
  const prevue = (await q.query<{ ristourne_resiliation: boolean }>('SELECT ristourne_resiliation FROM produit WHERE id = $1', [p.produit_id])).rows[0]!.ristourne_resiliation;
  return prevue ? partNonCouverte(q, p.id, ajouterJours(effet, 1)) : null;
}

export async function proposerResiliation(q: Executant, acteur: Acteur, policeId: string, d: { motif: MotifResiliation; justification: string; pieceDocumentId?: string; coordonneeId?: string }) {
  exiger(d.motif in MOTIFS_RESILIATION, 'MOTIF_INVALIDE', 'La Compagnie résilie pour fraude avérée ou usurpation d\'identité (PROD-RG-061)');
  exiger(d.justification?.trim(), 'JUSTIFICATION_REQUISE', 'La décision de résiliation est motivée');
  const reseau = await q.query('SELECT 1 FROM utilisateur u JOIN intervenant i ON i.tiers_id = u.tiers_id WHERE u.id = $1', [acteur.utilisateurId]);
  exiger(!reseau.rowCount, 'RESERVE_COMPAGNIE', 'La résiliation est une décision de la Compagnie (PROD-RG-061)', 403);
  const p = await lirePoliceVie(q, policeId, true);
  exiger(['ACTIVE', 'SUSPENDUE'].includes(p.statut), 'STATUT_INVALIDE', 'Seule une police en cours se résilie ; à l\'échéance, utiliser « ne pas renouveler » (PROD-RG-060)');
  await demandeEnCours(q, OPERATION_RESILIATION, policeId);
  const r = await ristourneResiliation(q, p, aujourdhui());
  if (r?.versClient) await coordonneeDuSouscripteur(q, p.souscripteur_id, d.coordonneeId);
  const demande = await soumettre(q, acteur, { typeOperation: OPERATION_RESILIATION, objetType: 'police', objetId: policeId, montant: r ? totalRistourne(r) : 0, donnees: {
    numero: p.numero, motif: MOTIFS_RESILIATION[d.motif], justification: d.justification, ristourneEstimee: r ? totalRistourne(r) : 0, saisie: d,
  } });
  return { demandeValidation: demande.id, ristourneEstimee: r ? totalRistourne(r) : 0 };
}

enregistrerOperation(OPERATION_RESILIATION, {
  administrative: false,
  async appliquer(q, demande, acteur) {
    const effet = aujourdhui();
    const saisie = (demande.donnees as { saisie: { motif: MotifResiliation; justification: string; coordonneeId?: string } }).saisie;
    const p = await lirePoliceVie(q, demande.objet_id, true);
    exiger(['ACTIVE', 'SUSPENDUE'].includes(p.statut), 'STATUT_INVALIDE', 'La police n\'est plus en cours');
    const r = await ristourneResiliation(q, p, effet);
    const total = r ? totalRistourne(r) : 0;
    const av = await nouvelAvenant(q, acteur, p);
    const motif = MOTIFS_RESILIATION[saisie.motif];
    const doc = await genererDocument(q, acteur, { modeleCode: 'LETTRE_RESILIATION', typeDocument: 'AVENANT', objet: { type: 'police', id: p.id }, variables: {
      numero: av.numero, police: p.numero, souscripteur: await nomTiers(q, p.souscripteur_id), date_effet: fr(effet), motif,
      lignes: total ? [{ libelle: 'Ristourne de prime nette (jours non couverts)', montant: gnf(r!.nette) }, ...(r!.accessoires ? [{ libelle: 'Accessoires', montant: gnf(r!.accessoires) }] : []),
        { libelle: 'Taxes', montant: gnf(r!.taxes.reduce((s, t) => s + t.montant, 0)) }, { libelle: 'Total ristourné', montant: gnf(total) }] : [{ libelle: 'Ristourne', montant: gnf(0) }],
      mention_ristourne: total ? 'La ristourne est remboursée selon le mode de paiement de la prime.' : 'Le produit ne prévoit pas de ristourne en cas de résiliation.',
    } });
    const res = r && total ? await contrePasser(q, acteur, p, r, { reference: av.numero, pieceDocumentId: doc.id, libelle: `Ristourne de résiliation ${av.numero}`, coordonneeId: saisie.coordonneeId }) : null;
    await q.query(`UPDATE police SET statut = 'RESILIEE' WHERE id = $1`, [p.id]);
    await q.query(`UPDATE police_assure SET date_sortie = $2, motif_sortie = 'Résiliation' WHERE police_id = $1 AND (date_sortie IS NULL OR date_sortie > $2)`, [p.id, effet]);
    await q.query(`INSERT INTO avenant (id, numero, police_id, type, date_effet, description, difference_prime, demande_validation_id) VALUES ($1,$2,$3,'RESILIATION',$4,$5,$6,$7)`,
      [av.id, av.numero, p.id, effet, `Résiliation par la Compagnie : ${motif} – ${saisie.justification}`, -total, demande.id]);
    await journaliser(q, { ...acteur.trace(), action: 'MODIFICATION', objetType: 'police', objetId: p.id, avant: { statut: p.statut }, apres: { statut: 'RESILIEE', avenant: av.numero, ristourne: total, motif } });
    await publier(q, acteur, { type: 'POLICE_RESILIEE', objet: { type: 'police', id: p.id }, charge: { numero: p.numero, motif: saisie.motif, effet, ristourne: total }, cleIdempotence: `police:${p.id}:resiliee` });
    // PROD-RG-062 : souscripteur et agent notifiés
    const souscripteur = await nomTiers(q, p.souscripteur_id);
    if (p.telephone) {
      await notifier(q, { tiersId: p.souscripteur_id, code: 'POLICE_RESILIEE', canal: 'SMS', adresse: p.telephone, objet: { type: 'police', id: p.id },
        variables: { police: p.numero, date: fr(effet), motif, ristourne: total ? ` Une ristourne de ${gnf(total)} vous sera remboursée.` : '' } }).catch(() => undefined);
    }
    const agents = (await q.query<{ tiers_id: string; telephone: string | null }>(
      `SELECT i.tiers_id, t.telephone FROM police_intervenant pi JOIN intervenant i ON i.id = pi.intervenant_id JOIN tiers t ON t.id = i.tiers_id
        WHERE pi.police_id = $1 AND pi.date_fin IS NULL AND i.role = 'AGENT_GENERAL'`, [p.id])).rows;
    for (const a of agents.filter(x => x.telephone)) {
      await notifier(q, { tiersId: a.tiers_id, code: 'POLICE_RESILIEE_AGENT', canal: 'SMS', adresse: a.telephone!, objet: { type: 'police', id: p.id },
        variables: { police: p.numero, souscripteur, date: fr(effet), motif } }).catch(() => undefined);
    }
    void res;
  },
});

// ---------------------------------------------------------------- renonciation (PROD-RG-074, CA-PROD-24)

export async function delaiRenonciation(q: Executant, produitId: string) {
  const r = (await q.query<{ delai_renonciation_jours: number | null }>('SELECT delai_renonciation_jours FROM produit WHERE id = $1', [produitId])).rows[0];
  return r?.delai_renonciation_jours ?? await entier(q, 'PROD_DELAI_RENONCIATION_JOURS');
}

/** Renonciation dans le délai, sans prestation : police annulée depuis l'origine, prime intégralement remboursée. */
export async function renoncer(q: Executant, acteur: Acteur, policeId: string, d: { dateDemande?: string; pieceDocumentId?: string; coordonneeId?: string }, jour = aujourdhui()) {
  const p = await lirePoliceVie(q, policeId, true);
  const x = (await q.query<{ canal: string; emission: string }>(`SELECT canal, (cree_le AT TIME ZONE 'Africa/Conakry')::date::text AS emission FROM police WHERE id = $1`, [policeId])).rows[0]!;
  exiger(x.canal === 'EN_LIGNE', 'RENONCIATION_HORS_LIGNE', 'Le délai de renonciation s\'applique aux souscriptions en ligne (PROD-RG-074) ; au bureau, voir l\'annulation pour erreur ou la résiliation');
  exiger(p.statut === 'ACTIVE', 'STATUT_INVALIDE', 'Seule une police active fait l\'objet d\'une renonciation');
  const dateDemande = d.dateDemande ?? jour;
  exiger(dateValide(dateDemande) && dateDemande <= jour && dateDemande >= x.emission, 'DATE_INVALIDE', 'Date de la demande invalide');
  const delai = await delaiRenonciation(q, p.produit_id);
  const limite = ajouterJours(x.emission, delai);
  exiger(dateDemande <= limite, 'DELAI_DEPASSE', `Délai de renonciation de ${delai} jours dépassé depuis le ${fr(limite)}`);
  exiger(!(await prestationEnregistree(q, policeId)), 'PRESTATION_ENREGISTREE', 'Une prestation ou un sinistre est enregistré : la renonciation n\'est plus possible');
  const r = await partNonCouverte(q, policeId, '0001-01-01');
  const total = totalRistourne(r);
  if (r.versClient) await coordonneeDuSouscripteur(q, p.souscripteur_id, d.coordonneeId);
  const av = await nouvelAvenant(q, acteur, p);
  const doc = await genererDocument(q, acteur, { modeleCode: 'ATTESTATION_RENONCIATION', typeDocument: 'AVENANT', objet: { type: 'police', id: p.id }, variables: {
    numero: av.numero, police: p.numero, souscripteur: await nomTiers(q, p.souscripteur_id), date_demande: fr(dateDemande), delai,
    lignes: [{ libelle: 'Prime nette', montant: gnf(r.nette) }, ...(r.accessoires ? [{ libelle: 'Accessoires', montant: gnf(r.accessoires) }] : []),
      { libelle: 'Taxes', montant: gnf(r.taxes.reduce((s, t) => s + t.montant, 0)) }, { libelle: 'Total remboursé', montant: gnf(total) }],
    destination: r.versClient ? 'virement sur les coordonnées vérifiées du souscripteur' : 'crédit du compte de production du bureau, qui rembourse le client',
  } });
  const res = await contrePasser(q, acteur, p, r, { reference: av.numero, pieceDocumentId: doc.id, libelle: `Remboursement de la renonciation ${av.numero}`, coordonneeId: d.coordonneeId });
  await q.query(`UPDATE quittance SET statut = 'ANNULEE' WHERE id = ANY($1)`, [r.quittances]);
  await q.query(`UPDATE police SET statut = 'ANNULEE' WHERE id = $1`, [policeId]);
  await q.query(`UPDATE police_assure SET date_sortie = $2, motif_sortie = 'Renonciation' WHERE police_id = $1 AND (date_sortie IS NULL OR date_sortie > $2)`, [policeId, jour]);
  await q.query(`INSERT INTO avenant (id, numero, police_id, type, date_effet, description, difference_prime) VALUES ($1,$2,$3,'ANNULATION',$4,$5,$6)`,
    [av.id, av.numero, policeId, jour, `Renonciation demandée le ${fr(dateDemande)} (délai de ${delai} jours) : police annulée, prime remboursée`, -total]);
  await journaliser(q, { ...acteur.trace(), action: 'MODIFICATION', objetType: 'police', objetId: policeId, avant: { statut: 'ACTIVE' }, apres: { statut: 'ANNULEE', renonciation: av.numero, rembourse: total } });
  await publier(q, acteur, { type: 'POLICE_ANNULEE', objet: { type: 'police', id: policeId }, charge: { numero: p.numero, motif: 'RENONCIATION', rembourse: total }, cleIdempotence: `police:${policeId}:annulee` });
  if (p.telephone) {
    await notifier(q, { tiersId: p.souscripteur_id, code: 'POLICE_RENONCIATION', canal: 'SMS', adresse: p.telephone, objet: { type: 'police', id: policeId },
      variables: { police: p.numero, montant: gnf(total) } }).catch(() => undefined);
  }
  return { avenant: av.numero, rembourse: total, ordrePaiement: res.ordre?.numero ?? null, versCompteProduction: r.versCompteProduction };
}

// ---------------------------------------------------------------- consultation

/** Avenants d'une police, avec ce qui reste à faire (prime à régler, acceptation attendue). */
export async function avenantsDePolice(q: Executant, policeId: string) {
  return (await q.query(
    `SELECT a.id, a.numero, a.type, a.date_effet, a.description, a.difference_prime::bigint AS difference_prime, qt.numero AS quittance, a.preuve_id IS NOT NULL AS confirme, a.cree_le,
            (a.type = 'CORRECTION' AND a.difference_prime > 0 AND a.quittance_id IS NULL) AS a_regler
       FROM avenant a LEFT JOIN quittance qt ON qt.id = a.quittance_id WHERE a.police_id = $1 AND a.supprime_le IS NULL ORDER BY a.cree_le DESC`, [policeId])).rows;
}
