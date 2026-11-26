/**
 * Journée comptable, clôture de période et provision pour primes non acquises, déclarations de taxes
 * (CDC § 11.8, 11.12, 11.16, 11.18 ; FIN-RG-041, 060, 063, 072, 092, 093 ; CA-FIN-05, 06, 14).
 *
 * - Chaque jour, les anomalies sont listées sans bloquer la bascule de la journée : quittance ordinaire non soldée,
 *   écart entre les comptes de production et leur collectif. Elles bloquent la clôture de la période.
 * - Clôture mensuelle : PPNA police par police, au prorata au jour près sur la prime nette (EVT-13), état justificatif,
 *   reprise automatique au premier jour de la période suivante ; la période passe CLÔTURÉE.
 * - Dotations aux amortissements de tous les biens en service à chaque clôture (EVT-17, FIN-RG-143).
 * - Déclaration de taxe : montant égal au solde du compte de taxe de la période ; validation comptable puis DAF ;
 *   écriture de liquidation (EVT-14) et ordre de paiement à l'administration fiscale (automatique si son code tiers
 *   est paramétré, sinon ordonné par le comptable) ; dépôt daté et référencé (FIN-RG-094) ; paiement EVT-14 au journal
 *   de trésorerie ; une seule déclaration par taxe et par période.
 */
import type { Executant } from '../../db/pool.js';
import type { Acteur } from '../../noyau/acteur.js';
import { ErreurMetier, exiger, nonTrouve } from '../../noyau/erreurs.js';
import { ajouterJours, aujourdhui } from '../../noyau/dates.js';
import { journaliser } from '../../moteurs/audit.js';
import { publier } from '../../moteurs/evenements.js';
import { enregistrerOperation, soumettre } from '../../moteurs/validation.js';
import { genererDocument } from '../../moteurs/documents.js';
import { comptabiliser, extourner } from '../comptabilite/moteur.js';
import { controlerCollectif } from '../commercial/comptesProduction.js';
import { entier, valeurParametre } from '../../moteurs/parametres.js';
import { doterAmortissements } from './immobilisations.js';
import { enregistrerExecution, ordonnerPaiement } from './paiements.js';

export const OPERATION_DECLARATION = 'DECLARATION_TAXE';
const gnf = (n: number) => `${n.toLocaleString('fr-FR').replace(/ /g, ' ')} GNF`;
const finDuMois = (mois: string) => ajouterJours(mois.endsWith('-12') ? `${Number(mois.slice(0, 4)) + 1}-01-01` : `${mois.slice(0, 4)}-${String(Number(mois.slice(5)) + 1).padStart(2, '0')}-01`, -1);
const jours = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000) + 1;

/** Anomalies à une date (FIN-RG-041) : listées chaque jour, bloquantes à la clôture. */
export async function anomalies(q: Executant, date = aujourdhui()): Promise<string[]> {
  const res: string[] = [];
  // § 11.12 : sans crédit de prime, une quittance ordinaire est soldée le jour même ; seule la quittance à terme légal reste en créance
  const q1 = await q.query<{ numero: string }>(`SELECT numero FROM quittance WHERE statut = 'EMISE' AND type <> 'REGULARISATION' AND periode_debut <= $1`, [date]);
  for (const x of q1.rows) res.push(`Quittance ordinaire ${x.numero} non soldée`);
  const c = await controlerCollectif(q);
  if (c.ecart) res.push(`Écart de ${gnf(c.ecart)} entre les comptes de production et leur collectif`);
  return res;
}

/** Traitement de minuit : la journée bascule toujours ; ses anomalies sont enregistrées (CA-FIN-05). */
export async function basculerJournee(q: Executant, date = aujourdhui()) {
  const a = await anomalies(q, date);
  await q.query(`INSERT INTO journee_comptable (date, caisses_arretees, anomalies) VALUES ($1, false, $2) ON CONFLICT (date) DO UPDATE SET anomalies = EXCLUDED.anomalies`, [date, JSON.stringify(a)]);
  return a;
}

/** FIN-RG-060 : PPNA d'une période de garantie à une date d'arrêté, au prorata au jour près sur la prime nette. */
export function ppna(primeNette: number, debut: string, fin: string, arrete: string): number {
  if (arrete >= fin) return 0;
  if (arrete < debut) return primeNette;
  return Math.round(primeNette * jours(ajouterJours(arrete, 1), fin) / jours(debut, fin));
}

export async function cloturerPeriode(q: Executant, acteur: Acteur, mois: string) {
  exiger(/^\d{4}-(0[1-9]|1[0-2])$/.test(mois), 'MOIS_INVALIDE', 'Mois au format AAAA-MM');
  const p = (await q.query<{ id: string; statut: string; exercice: string }>(
    `SELECT p.id, p.statut, e.code AS exercice FROM periode p JOIN exercice e ON e.id = p.exercice_id WHERE p.mois = $1 FOR UPDATE OF p`, [mois])).rows[0];
  if (!p) throw nonTrouve('Période');
  exiger(p.statut === 'OUVERTE', 'DEJA_CLOTUREE', 'Période déjà clôturée');
  const fin = finDuMois(mois);
  const a = await anomalies(q, fin);
  if (a.length) throw new ErreurMetier('ANOMALIES_BLOQUANTES', `Clôture impossible : ${a.join(' ; ')}`, 422, { anomalies: a });
  // FIN-RG-143 : dotations aux amortissements de la période
  const amortissements = await doterAmortissements(q, acteur, mois, fin);
  // PPNA police par police (périodes en cours à la fin du mois)
  const periodes = (await q.query<{ police_id: string; numero: string; date_debut: string; date_fin: string; prime_nette: number }>(
    `SELECT pp.police_id, po.numero, pp.date_debut::text, pp.date_fin::text, pp.prime_nette FROM police_periode pp JOIN police po ON po.id = pp.police_id
      WHERE pp.date_debut <= $1 AND pp.date_fin > $1 AND po.statut NOT IN ('ANNULEE') ORDER BY po.numero`, [fin])).rows;
  const lignes = periodes.map(x => ({ ...x, ppna: ppna(Number(x.prime_nette), x.date_debut, x.date_fin, fin) })).filter(x => x.ppna > 0);
  const total = lignes.reduce((s, x) => s + x.ppna, 0);
  let ecritureId: string | null = null, reprise: string | null = null;
  if (total > 0) {
    const etat = await genererDocument(q, acteur, { modeleCode: 'ETAT_PPNA', typeDocument: 'ETAT_PROVISIONS', objet: { type: 'periode', id: p.id }, variables: {
      mois: mois.split('-').reverse().join('/'), total: gnf(total),
      lignes: lignes.map(x => ({ police: x.numero, periode: `${x.date_debut.split('-').reverse().join('/')} – ${x.date_fin.split('-').reverse().join('/')}`, prime: gnf(Number(x.prime_nette)), ppna: gnf(x.ppna) })),
    } });
    const [e] = await comptabiliser(q, acteur, { codeEvt: 'EVT-13', reference: `PPNA ${mois}`, pieceDocumentId: etat.id, date: fin, montants: { PPNA: total } });
    ecritureId = e!.id;
    for (const x of lignes) {
      await q.query(`INSERT INTO provision_calcul (periode_id, type, composante, objet_type, objet_id, montant, ecriture_id) VALUES ($1,'PPNA','Police','police',$2,$3,$4)`, [p.id, x.police_id, x.ppna, ecritureId]);
    }
    // FIN-RG-063 : reprise automatique à l'ouverture de la période suivante
    reprise = (await extourner(q, acteur, ecritureId, `Reprise de la PPNA de ${mois}`, ajouterJours(fin, 1))).numero;
  }
  await q.query(`UPDATE periode SET statut = 'CLOTUREE', cloturee_par = $2, anomalies = '[]' WHERE id = $1`, [p.id, acteur.utilisateurId]);
  await journaliser(q, { ...acteur.trace(), action: 'PARAMETRAGE', objetType: 'periode', objetId: p.id, apres: { mois, statut: 'CLOTUREE', ppna: total, polices: lignes.length, reprise, amortissements: amortissements.total } });
  await publier(q, acteur, { type: 'CLOTURE_PERIODE', objet: { type: 'periode', id: p.id }, charge: { mois, ppna: total }, cleIdempotence: `cloture:${mois}` });
  return { mois, ppna: total, polices: lignes.length, reprise, amortissements: amortissements.total };
}

// ---------------------------------------------------------------- déclarations de taxes (FIN-RG-092, 093)

export async function preparerDeclaration(q: Executant, acteur: Acteur, codeTaxe: string, mois: string) {
  exiger(/^\d{4}-(0[1-9]|1[0-2])$/.test(mois), 'MOIS_INVALIDE', 'Mois au format AAAA-MM');
  const t = (await q.query<{ id: string; compte_id: string; libelle: string; taux: string; numero: string }>(
    `SELECT ct.id, ct.compte_id, ct.libelle, ct.taux, c.numero FROM code_taxe ct JOIN compte c ON c.id = ct.compte_id
      WHERE ct.code = $1 AND ct.supprime_le IS NULL ORDER BY ct.date_effet DESC LIMIT 1`, [codeTaxe])).rows[0];
  if (!t) throw nonTrouve(`Code taxe ${codeTaxe}`);
  const numero = `${codeTaxe}${mois.replace('-', '')}`;
  const deja = await q.query('SELECT 1 FROM declaration_taxe WHERE numero = $1', [numero]);
  exiger(!deja.rowCount, 'DECLARATION_EXISTANTE', 'Déclaration déjà préparée pour cette taxe et cette période : une correction se porte sur la suivante', 409);
  const [du, au] = [`${mois}-01`, finDuMois(mois)];
  const r = (await q.query<{ collecte: number; solde: number }>(
    `SELECT (SELECT COALESCE(sum(l.credit - l.debit), 0) FROM ligne_ecriture l JOIN ecriture e ON e.id = l.ecriture_id JOIN code_taxe ct ON ct.id = l.code_taxe_id
              WHERE ct.code = $1 AND e.statut = 'VALIDEE' AND e.date_comptable BETWEEN $2 AND $3)::bigint AS collecte,
            (SELECT COALESCE(sum(l.credit - l.debit), 0) FROM ligne_ecriture l JOIN ecriture e ON e.id = l.ecriture_id
              WHERE l.compte_id = $4 AND e.statut = 'VALIDEE' AND e.date_comptable BETWEEN $2 AND $3 AND e.reference NOT LIKE 'DECL %')::bigint AS solde`,
    [codeTaxe, du, au, t.compte_id])).rows[0]!;
  const collecte = Number(r.collecte), solde = Number(r.solde);
  // FIN-RG-092 : la déclaration est égale au solde du compte de taxe de la période
  exiger(collecte === solde, 'ECART_COMPTE_TAXE', `Montant collecté (${gnf(collecte)}) différent du solde du compte ${t.numero} (${gnf(solde)}) : écritures à analyser`);
  const id = crypto.randomUUID();
  const assiette = Number(t.taux) > 0 ? Math.round(collecte / Number(t.taux)) : 0;
  const doc = await genererDocument(q, acteur, { modeleCode: 'DECLARATION_TAXE', typeDocument: 'DECLARATION_TAXE', objet: { type: 'declaration_taxe', id }, variables: {
    numero, taxe: t.libelle, periode: mois.split('-').reverse().join('/'), assiette: gnf(assiette), collecte: gnf(collecte), solde: gnf(collecte),
  } });
  await q.query(
    `INSERT INTO declaration_taxe (id, numero, code_taxe_id, periode, assiette, montant_collecte, montant_recuperable, solde, statut, document_id) VALUES ($1,$2,$3,$4,$5,$6,0,$6,'PREPAREE',$7)`,
    [id, numero, t.id, mois, assiette, collecte, doc.id]);
  const demande = await soumettre(q, acteur, { typeOperation: OPERATION_DECLARATION, objetType: 'declaration_taxe', objetId: id, montant: collecte, donnees: { numero, montant: collecte } });
  await journaliser(q, { ...acteur.trace(), action: 'CREATION', objetType: 'declaration_taxe', objetId: id, apres: { numero, collecte } });
  return { id, numero, montant: collecte, demandeValidation: demande.id };
}

enregistrerOperation(OPERATION_DECLARATION, {
  administrative: false,
  // Validée par le chef comptable puis la DAF : liquidation (EVT-14) vers le compte « État, taxes à payer »
  async appliquer(q, demande, acteur) {
    const d = (await q.query<{ numero: string; solde: number; compte_id: string; document_id: string }>(
      `SELECT dt.numero, dt.solde, ct.compte_id, dt.document_id FROM declaration_taxe dt JOIN code_taxe ct ON ct.id = dt.code_taxe_id WHERE dt.id = $1 FOR UPDATE OF dt`, [demande.objet_id])).rows[0]!;
    let ecritureId: string | null = null;
    if (Number(d.solde) > 0) {
      const [e] = await comptabiliser(q, acteur, { codeEvt: 'EVT-14', reference: `DECL ${d.numero}`, pieceDocumentId: d.document_id, montants: { MONTANT: Number(d.solde), PAIEMENT: 0 },
        comptes: { COMPTE_TAXE: { compteId: d.compte_id } } });
      ecritureId = e!.id;
    }
    await q.query(`UPDATE declaration_taxe SET statut = 'VALIDEE', ecriture_id = $2 WHERE id = $1`, [demande.objet_id, ecritureId]);
    // FIN-RG-093 : ordre de paiement généré avec la validation quand l'administration fiscale est paramétrée
    const code = await valeurParametre(q, 'FIN_BENEFICIAIRE_TAXES').catch(() => 'AUCUN');
    if (Number(d.solde) > 0 && code && code !== 'AUCUN') {
      const c = (await q.query<{ tiers_id: string; coordonnee_id: string | null }>(
        `SELECT t.id AS tiers_id, (SELECT cp.id FROM coordonnee_paiement cp WHERE cp.tiers_id = t.id AND cp.statut = 'VERIFIEE' AND cp.supprime_le IS NULL ORDER BY cp.principale DESC LIMIT 1) AS coordonnee_id
           FROM tiers t WHERE t.code_tiers = $1`, [code])).rows[0];
      if (c?.coordonnee_id) await ordonnerPaiementDeclaration(q, acteur, demande.objet_id, { beneficiaireTiersId: c.tiers_id, coordonneeId: c.coordonnee_id });
    }
    await journaliser(q, { ...acteur.trace(), action: 'VALIDATION', objetType: 'declaration_taxe', objetId: demande.objet_id, apres: { liquidation: ecritureId } });
    await publier(q, acteur, { type: 'DECLARATION_TAXE_VALIDEE', objet: { type: 'declaration_taxe', id: demande.objet_id }, charge: { numero: d.numero, montant: Number(d.solde) }, cleIdempotence: `declaration:${demande.objet_id}` });
  },
});

/** Ordre de paiement de la déclaration validée à l'administration fiscale (chaîne de paiement, type TAXE). */
export async function ordonnerPaiementDeclaration(q: Executant, acteur: Acteur, id: string, d: { beneficiaireTiersId: string; coordonneeId: string }) {
  const x = (await q.query<{ numero: string; solde: string; statut: string }>('SELECT numero, solde, statut FROM declaration_taxe WHERE id = $1 FOR UPDATE', [id])).rows[0];
  if (!x) throw nonTrouve('Déclaration');
  exiger(['VALIDEE', 'DEPOSEE'].includes(x.statut), 'DECLARATION_NON_VALIDEE', 'Seule une déclaration validée et non payée se paie');
  exiger(Number(x.solde) > 0, 'RIEN_A_PAYER', 'Déclaration sans montant à payer');
  const encours = await q.query(`SELECT 1 FROM ordre_paiement WHERE objet_type = 'declaration_taxe' AND objet_id = $1 AND statut <> 'REJETE'`, [id]);
  exiger(!encours.rowCount, 'ORDRE_EXISTANT', 'Un ordre de paiement existe déjà pour cette déclaration', 409);
  return ordonnerPaiement(q, acteur, { type: 'TAXE', beneficiaireTiersId: d.beneficiaireTiersId, coordonneeId: d.coordonneeId, montant: Number(x.solde), objet: { type: 'declaration_taxe', id },
    donnees: { libelle: `Déclaration ${x.numero}`, reference: x.numero } });
}

/** FIN-RG-094 : dépôt de la déclaration, daté et référencé. */
export async function enregistrerDepot(q: Executant, acteur: Acteur, id: string, d: { date: string; reference: string }) {
  exiger(/^\d{4}-\d{2}-\d{2}$/.test(d.date) && d.date <= aujourdhui() && d.reference?.trim(), 'DEPOT_INVALIDE', 'Date (passée) et référence du dépôt obligatoires');
  const x = (await q.query<{ statut: string }>('SELECT statut FROM declaration_taxe WHERE id = $1 FOR UPDATE', [id])).rows[0];
  if (!x) throw nonTrouve('Déclaration');
  exiger(['VALIDEE', 'PAYEE', 'DEPOSEE'].includes(x.statut), 'DECLARATION_NON_VALIDEE', 'Une déclaration est déposée après sa validation');
  await q.query(`UPDATE declaration_taxe SET date_depot = $2, reference_depot = $3, statut = CASE WHEN statut = 'VALIDEE' THEN 'DEPOSEE' ELSE statut END WHERE id = $1`, [id, d.date, d.reference.trim()]);
  await journaliser(q, { ...acteur.trace(), action: 'MODIFICATION', objetType: 'declaration_taxe', objetId: id, apres: { depot: d } });
}

// Paiement de la déclaration : « État, taxes déclarées à payer » soldé par la banque (EVT-14, journal de trésorerie)
enregistrerExecution('TAXE', async (q, acteur, ordre, tresorerie, avisDocumentId) => {
  const x = (await q.query<{ numero: string }>('SELECT numero FROM declaration_taxe WHERE id = $1', [ordre.objet_id])).rows[0]!;
  const [e] = await comptabiliser(q, acteur, { codeEvt: 'EVT-14', reference: `PAIE ${x.numero}`, pieceDocumentId: avisDocumentId, journalTresorerie: tresorerie.journal,
    montants: { MONTANT: 0, PAIEMENT: ordre.montant }, comptes: { TRESORERIE: { compteId: tresorerie.compteId } } });
  await q.query(`UPDATE declaration_taxe SET statut = 'PAYEE' WHERE id = $1`, [ordre.objet_id]);
  return { ecritureId: e!.id, libelle: `Déclaration ${x.numero}` };
});

export async function listerDeclarations(q: Executant) {
  const jour = await entier(q, 'FIN_ECHEANCE_DECLARATION_JOUR').catch(() => 15);
  const r = (await q.query<{ periode: string; statut: string }>(
    `SELECT dt.id, dt.numero, ct.code, ct.libelle, dt.periode, dt.assiette, dt.montant_collecte, dt.solde, dt.statut, dt.reference_depot, dt.date_depot, e.numero_piece,
            (SELECT o.numero || ' ' || o.statut FROM ordre_paiement o WHERE o.objet_type = 'declaration_taxe' AND o.objet_id = dt.id ORDER BY o.cree_le DESC LIMIT 1) AS ordre
       FROM declaration_taxe dt JOIN code_taxe ct ON ct.id = dt.code_taxe_id LEFT JOIN ecriture e ON e.id = dt.ecriture_id ORDER BY dt.periode DESC, ct.code`)).rows;
  // FIN-RG-094 : échéance de dépôt et de paiement, retard signalé
  return r.map(x => {
    const echeance = `${ajouterJours(finDuMois(x.periode), 1).slice(0, 8)}${String(jour).padStart(2, '0')}`;
    return { ...x, echeance, enRetard: x.statut !== 'PAYEE' && echeance < aujourdhui() };
  });
}

export async function listerPeriodes(q: Executant) {
  return (await q.query(
    `SELECT p.id, p.mois, p.statut, e.code AS exercice, u.identifiant AS cloturee_par,
            (SELECT COALESCE(sum(montant), 0)::bigint FROM provision_calcul pc WHERE pc.periode_id = p.id AND pc.type = 'PPNA') AS ppna
       FROM periode p JOIN exercice e ON e.id = p.exercice_id LEFT JOIN utilisateur u ON u.id = p.cloturee_par ORDER BY p.mois DESC`)).rows;
}
