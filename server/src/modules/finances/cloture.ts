/**
 * Journée comptable, clôture de période et provision pour primes non acquises, déclarations de taxes
 * (CDC § 11.8, 11.12, 11.16, 11.18 ; FIN-RG-041, 060, 063, 072, 092, 093 ; CA-FIN-05, 06, 14).
 *
 * - Chaque jour, les anomalies sont listées sans bloquer la bascule de la journée : quittance ordinaire non soldée,
 *   écart entre les comptes de production et leur collectif. Elles bloquent la clôture de la période.
 * - Clôture mensuelle : PPNA police par police, au prorata au jour près sur la prime nette (EVT-13), état justificatif,
 *   reprise automatique au premier jour de la période suivante ; la période passe CLÔTURÉE.
 * - Déclaration de taxe : montant égal au solde du compte de taxe de la période ; validation comptable puis DAF ;
 *   écriture de liquidation (EVT-14) ; une seule déclaration par taxe et par période.
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
  await journaliser(q, { ...acteur.trace(), action: 'PARAMETRAGE', objetType: 'periode', objetId: p.id, apres: { mois, statut: 'CLOTUREE', ppna: total, polices: lignes.length, reprise } });
  await publier(q, acteur, { type: 'CLOTURE_PERIODE', objet: { type: 'periode', id: p.id }, charge: { mois, ppna: total }, cleIdempotence: `cloture:${mois}` });
  return { mois, ppna: total, polices: lignes.length, reprise };
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
      const [e] = await comptabiliser(q, acteur, { codeEvt: 'EVT-14', reference: `DECL ${d.numero}`, pieceDocumentId: d.document_id, montants: { MONTANT: Number(d.solde) },
        comptes: { COMPTE_TAXE: { compteId: d.compte_id } } });
      ecritureId = e!.id;
    }
    await q.query(`UPDATE declaration_taxe SET statut = 'VALIDEE', ecriture_id = $2 WHERE id = $1`, [demande.objet_id, ecritureId]);
    await journaliser(q, { ...acteur.trace(), action: 'VALIDATION', objetType: 'declaration_taxe', objetId: demande.objet_id, apres: { liquidation: ecritureId } });
    await publier(q, acteur, { type: 'DECLARATION_TAXE_VALIDEE', objet: { type: 'declaration_taxe', id: demande.objet_id }, charge: { numero: d.numero, montant: Number(d.solde) }, cleIdempotence: `declaration:${demande.objet_id}` });
  },
});

export async function listerDeclarations(q: Executant) {
  return (await q.query(
    `SELECT dt.id, dt.numero, ct.code, ct.libelle, dt.periode, dt.assiette, dt.montant_collecte, dt.solde, dt.statut, dt.reference_depot, e.numero_piece
       FROM declaration_taxe dt JOIN code_taxe ct ON ct.id = dt.code_taxe_id LEFT JOIN ecriture e ON e.id = dt.ecriture_id ORDER BY dt.periode DESC, ct.code`)).rows;
}

export async function listerPeriodes(q: Executant) {
  return (await q.query(
    `SELECT p.id, p.mois, p.statut, e.code AS exercice, u.identifiant AS cloturee_par,
            (SELECT COALESCE(sum(montant), 0)::bigint FROM provision_calcul pc WHERE pc.periode_id = p.id AND pc.type = 'PPNA') AS ppna
       FROM periode p JOIN exercice e ON e.id = p.exercice_id LEFT JOIN utilisateur u ON u.id = p.cloturee_par ORDER BY p.mois DESC`)).rows;
}
