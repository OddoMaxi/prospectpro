/**
 * Relevés et rapprochement bancaire (CDC § 11.15 ; FIN-RG-042, 043 ; CA-FIN-19).
 *
 * - Import du relevé d'une banque ou d'un opérateur (fichier texte : date ; libellé ; montant ; référence), lignes déjà
 *   importées ignorées. Montant signé du point de vue de la Compagnie : positif = entrée sur le compte.
 * - Rapprochement automatique avec les écritures validées du compte de trésorerie de la banque, non encore rapprochées :
 *   même montant, d'abord par la référence, sinon par un candidat unique dans l'écart de dates paramétré ; les
 *   cas ambigus restent présentés à la Trésorerie pour un rapprochement manuel.
 * - Opération de la banque non comptabilisée (frais, agios) : fiche d'imputation générée par modèle, validée par la
 *   comptabilité (comptable puis DAF) ; elle ne compte qu'une fois validée.
 * - État de rapprochement à toute date : solde comptable, écritures absentes du relevé, opérations du relevé non
 *   comptabilisées, solde du relevé reconstitué et écart avec le solde déclaré.
 */
import type { Executant } from '../../db/pool.js';
import type { Acteur } from '../../noyau/acteur.js';
import { ErreurMetier, exiger, nonTrouve } from '../../noyau/erreurs.js';
import { aujourdhui, dateValide } from '../../noyau/dates.js';
import { journaliser } from '../../moteurs/audit.js';
import { entier } from '../../moteurs/parametres.js';
import { genererDocument } from '../../moteurs/documents.js';
import { creerFicheImputation } from './saisie.js';

const gnf = (n: number) => `${n.toLocaleString('fr-FR').replace(/ /g, ' ')} GNF`;
const fr = (d: string) => d.slice(0, 10).split('-').reverse().join('/');

interface Banque { id: string; code: string; nom: string; compte_id: string; compte: string }
async function banque(q: Executant, code: string): Promise<Banque> {
  const b = (await q.query<Banque>(`SELECT b.id, b.code, b.nom, b.compte_id, c.numero AS compte FROM banque_operateur b JOIN compte c ON c.id = b.compte_id WHERE b.code = $1 AND b.supprime_le IS NULL`, [code])).rows[0];
  if (!b) throw nonTrouve(`Banque ou opérateur ${code}`);
  return b;
}

export interface LigneReleve { date: string; libelle: string; montant: number; reference?: string }

/** Lecture d'un relevé texte : séparateur « ; » ou tabulation, dates JJ/MM/AAAA ou AAAA-MM-JJ, montants avec espaces ou virgule. */
export function lireReleve(contenu: string): LigneReleve[] {
  const lignes: LigneReleve[] = [];
  contenu.split(/\r?\n/).forEach((brut, i) => {
    const t = brut.trim();
    if (!t) return;
    const c = t.split(/[;\t]/).map(x => x.trim().replace(/^"|"$/g, ''));
    let date = c[0] ?? '';
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(date);
    if (m) date = `${m[3]}-${m[2]}-${m[1]}`;
    if (!dateValide(date)) {
      if (i === 0) return; // ligne d'en-tête
      throw new ErreurMetier('RELEVE_INVALIDE', `Ligne ${i + 1} : date illisible « ${c[0]} »`, 422);
    }
    const montant = Number((c[2] ?? '').replace(/[\s  ]/g, '').replace(',', '.'));
    if (!Number.isInteger(montant) || montant === 0) throw new ErreurMetier('RELEVE_INVALIDE', `Ligne ${i + 1} : montant illisible « ${c[2]} » (francs entiers, signe moins pour une sortie)`, 422);
    lignes.push({ date, libelle: (c[1] || 'Opération').slice(0, 200), montant, reference: c[3]?.slice(0, 80) || undefined });
  });
  exiger(lignes.length, 'RELEVE_VIDE', 'Aucune opération dans le relevé');
  return lignes;
}

/** Remet « à rapprocher » les lignes liées à une écriture retirée (fiche rejetée). */
async function liberer(q: Executant, banqueId: string) {
  await q.query(
    `UPDATE releve_ligne r SET ligne_ecriture_id = NULL, statut = 'A_RAPPROCHER' FROM ligne_ecriture l JOIN ecriture e ON e.id = l.ecriture_id
      WHERE r.ligne_ecriture_id = l.id AND r.banque_operateur_id = $1 AND e.supprime_le IS NOT NULL`, [banqueId]);
  // Opération générée dont la fiche est désormais validée : rapprochée
  await q.query(
    `UPDATE releve_ligne r SET statut = 'RAPPROCHEE' FROM ligne_ecriture l JOIN ecriture e ON e.id = l.ecriture_id
      WHERE r.ligne_ecriture_id = l.id AND r.banque_operateur_id = $1 AND r.statut = 'GENEREE' AND e.statut = 'VALIDEE'`, [banqueId]);
}

/** FIN-RG-042 : import puis rapprochement automatique. */
export async function importerReleve(q: Executant, acteur: Acteur, code: string, lignes: LigneReleve[]) {
  const b = await banque(q, code);
  let importees = 0, ignorees = 0;
  for (const l of lignes) {
    exiger(dateValide(l.date) && l.date <= aujourdhui(), 'RELEVE_INVALIDE', `Date d'opération invalide : ${l.date}`);
    exiger(Number.isInteger(l.montant) && l.montant !== 0, 'RELEVE_INVALIDE', 'Montant invalide');
    const deja = await q.query(
      `SELECT 1 FROM releve_ligne WHERE banque_operateur_id = $1 AND date_operation = $2 AND montant = $3 AND libelle = $4 AND COALESCE(reference, '') = $5 AND supprime_le IS NULL`,
      [b.id, l.date, l.montant, l.libelle, l.reference ?? '']);
    if (deja.rowCount) { ignorees++; continue; }
    await q.query(`INSERT INTO releve_ligne (banque_operateur_id, date_operation, libelle, montant, reference, statut) VALUES ($1,$2,$3,$4,$5,'A_RAPPROCHER')`,
      [b.id, l.date, l.libelle, l.montant, l.reference ?? null]);
    importees++;
  }
  await journaliser(q, { ...acteur.trace(), action: 'CREATION', objetType: 'banque_operateur', objetId: b.id, apres: { releve: { importees, ignorees } } });
  const auto = await rapprocherAutomatiquement(q, acteur, code);
  return { importees, ignorees, ...auto };
}

/** Écritures validées du compte de la banque, non rapprochées : montant signé (débit − crédit). */
async function ecrituresLibres(q: Executant, b: Banque, jusquau?: string) {
  return (await q.query<{ id: string; date: string; montant: number; reference: string; libelle: string; piece: string }>(
    `SELECT l.id, e.date_comptable::text AS date, (l.debit - l.credit)::bigint AS montant, e.reference, COALESCE(l.libelle, e.libelle) AS libelle, e.numero_piece AS piece
       FROM ligne_ecriture l JOIN ecriture e ON e.id = l.ecriture_id
      WHERE l.compte_id = $1 AND e.statut = 'VALIDEE' AND e.supprime_le IS NULL AND ($2::date IS NULL OR e.date_comptable <= $2)
        AND NOT EXISTS (SELECT 1 FROM releve_ligne r WHERE r.ligne_ecriture_id = l.id AND r.supprime_le IS NULL)
      ORDER BY e.date_comptable, e.numero_piece`, [b.compte_id, jusquau ?? null])).rows.map(x => ({ ...x, montant: Number(x.montant) }));
}

const proche = (a: string, b: string, jours: number) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) <= jours * 86_400_000;

export async function rapprocherAutomatiquement(q: Executant, acteur: Acteur, code: string) {
  const b = await banque(q, code);
  await liberer(q, b.id);
  const ecart = await entier(q, 'FIN_RAPPROCHEMENT_ECART_JOURS');
  const releve = (await q.query<{ id: string; date: string; montant: number; reference: string | null; libelle: string }>(
    `SELECT id, date_operation::text AS date, montant::bigint AS montant, reference, libelle FROM releve_ligne WHERE banque_operateur_id = $1 AND statut = 'A_RAPPROCHER' AND supprime_le IS NULL ORDER BY date_operation`, [b.id])).rows
    .map(x => ({ ...x, montant: Number(x.montant) }));
  const libres = await ecrituresLibres(q, b);
  const prises = new Set<string>();
  let rapprochees = 0;
  const lier = async (r: { id: string }, l: { id: string }) => {
    await q.query(`UPDATE releve_ligne SET ligne_ecriture_id = $2, statut = 'RAPPROCHEE' WHERE id = $1`, [r.id, l.id]);
    prises.add(l.id); rapprochees++;
  };
  // 1. Même montant et même référence (dans la référence ou le libellé de l'écriture)
  const restants: typeof releve = [];
  for (const r of releve) {
    const ref = r.reference?.toUpperCase();
    const l = ref ? libres.find(x => !prises.has(x.id) && x.montant === r.montant && (x.reference?.toUpperCase().includes(ref) || x.libelle?.toUpperCase().includes(ref))) : undefined;
    if (l) await lier(r, l); else restants.push(r);
  }
  // 2. Même montant, candidat unique dans l'écart de dates (de part et d'autre)
  for (const r of restants) {
    const candidats = libres.filter(x => !prises.has(x.id) && x.montant === r.montant && proche(x.date, r.date, ecart));
    const concurrents = restants.filter(y => y !== r && y.montant === r.montant && candidats.some(c => proche(c.date, y.date, ecart)));
    if (candidats.length === 1 && !concurrents.length) await lier(r, candidats[0]!);
  }
  if (rapprochees) await journaliser(q, { ...acteur.trace(), action: 'MODIFICATION', objetType: 'banque_operateur', objetId: b.id, apres: { rapprochementAutomatique: rapprochees } });
  return { rapprochees, restantes: releve.length - rapprochees };
}

/** Rapprochement manuel : une ligne du relevé et une ligne d'écriture validée du compte de la banque, de même montant. */
export async function rapprocher(q: Executant, acteur: Acteur, releveLigneId: string, ligneEcritureId: string) {
  const r = (await q.query<{ banque_operateur_id: string; montant: string; statut: string; compte_id: string }>(
    `SELECT r.banque_operateur_id, r.montant, r.statut, b.compte_id FROM releve_ligne r JOIN banque_operateur b ON b.id = r.banque_operateur_id WHERE r.id = $1 AND r.supprime_le IS NULL FOR UPDATE OF r`, [releveLigneId])).rows[0];
  if (!r) throw nonTrouve('Ligne de relevé');
  exiger(r.statut === 'A_RAPPROCHER', 'DEJA_RAPPROCHEE', 'Ligne déjà rapprochée', 409);
  const l = (await q.query<{ compte_id: string; montant: string; statut: string }>(
    `SELECT l.compte_id, (l.debit - l.credit) AS montant, e.statut FROM ligne_ecriture l JOIN ecriture e ON e.id = l.ecriture_id WHERE l.id = $1 AND e.supprime_le IS NULL`, [ligneEcritureId])).rows[0];
  if (!l) throw nonTrouve('Ligne d\'écriture');
  exiger(l.compte_id === r.compte_id && l.statut === 'VALIDEE', 'ECRITURE_INVALIDE', 'L\'écriture est une écriture validée du compte de cette banque');
  exiger(Number(l.montant) === Number(r.montant), 'MONTANTS_DIFFERENTS', 'Montants différents : rapprochement refusé');
  const prise = await q.query('SELECT 1 FROM releve_ligne WHERE ligne_ecriture_id = $1 AND supprime_le IS NULL', [ligneEcritureId]);
  exiger(!prise.rowCount, 'ECRITURE_DEJA_RAPPROCHEE', 'Cette écriture est déjà rapprochée', 409);
  await q.query(`UPDATE releve_ligne SET ligne_ecriture_id = $2, statut = 'RAPPROCHEE' WHERE id = $1`, [releveLigneId, ligneEcritureId]);
  await journaliser(q, { ...acteur.trace(), action: 'MODIFICATION', objetType: 'releve_ligne', objetId: releveLigneId, apres: { rapprochement: ligneEcritureId } });
}

export async function annulerRapprochement(q: Executant, acteur: Acteur, releveLigneId: string) {
  const r = (await q.query<{ statut: string }>('SELECT statut FROM releve_ligne WHERE id = $1 AND supprime_le IS NULL FOR UPDATE', [releveLigneId])).rows[0];
  if (!r) throw nonTrouve('Ligne de relevé');
  exiger(r.statut === 'RAPPROCHEE', 'NON_RAPPROCHEE', 'Ligne non rapprochée');
  await q.query(`UPDATE releve_ligne SET ligne_ecriture_id = NULL, statut = 'A_RAPPROCHER' WHERE id = $1`, [releveLigneId]);
  await journaliser(q, { ...acteur.trace(), action: 'MODIFICATION', objetType: 'releve_ligne', objetId: releveLigneId, apres: { rapprochement: null } });
}

/**
 * FIN-RG-043 : opération de la banque non comptabilisée (frais, agios, intérêts) : fiche d'imputation générée par
 * modèle sur le journal des opérations diverses, contrepartie le compte de la banque ; validée par la comptabilité.
 */
export async function comptabiliserOperationBanque(q: Executant, acteur: Acteur, releveLigneId: string, d: { modele?: string; compte?: string; pieceDocumentId: string }) {
  const r = (await q.query<{ banque_operateur_id: string; date: string; libelle: string; montant: string; reference: string | null; statut: string; code: string; compte: string }>(
    `SELECT r.banque_operateur_id, r.date_operation::text AS date, r.libelle, r.montant, r.reference, r.statut, b.code, c.numero AS compte
       FROM releve_ligne r JOIN banque_operateur b ON b.id = r.banque_operateur_id JOIN compte c ON c.id = b.compte_id WHERE r.id = $1 AND r.supprime_le IS NULL FOR UPDATE OF r`, [releveLigneId])).rows[0];
  if (!r) throw nonTrouve('Ligne de relevé');
  exiger(r.statut === 'A_RAPPROCHER', 'DEJA_RAPPROCHEE', 'Ligne déjà rapprochée ou comptabilisée', 409);
  let compte = d.compte;
  if (d.modele) {
    const m = (await q.query<{ lignes: { compte: string } }>('SELECT lignes FROM modele_ecriture WHERE code = $1 AND supprime_le IS NULL', [d.modele])).rows[0];
    if (!m) throw nonTrouve(`Modèle ${d.modele}`);
    compte ??= m.lignes.compte;
  }
  exiger(compte, 'COMPTE_REQUIS', 'Modèle ou compte de contrepartie requis');
  const montant = Math.abs(Number(r.montant)), entree = Number(r.montant) > 0;
  const f = await creerFicheImputation(q, acteur, {
    journal: 'OD', date: r.date, reference: (r.reference ?? `REL ${r.code}`).slice(0, 60), libelle: `${r.libelle} (relevé ${r.code})`.slice(0, 200), pieceDocumentId: d.pieceDocumentId,
    lignes: [
      { compte: compte!, libelle: r.libelle, debit: entree ? 0 : montant, credit: entree ? montant : 0 },
      { compte: r.compte, libelle: `${r.code} – ${r.libelle}`, debit: entree ? montant : 0, credit: entree ? 0 : montant },
    ],
  });
  const ligne = (await q.query<{ id: string }>(`SELECT l.id FROM ligne_ecriture l JOIN compte c ON c.id = l.compte_id WHERE l.ecriture_id = $1 AND c.numero = $2`, [f.ecritureId, r.compte])).rows[0]!;
  await q.query(`UPDATE releve_ligne SET ligne_ecriture_id = $2, statut = 'GENEREE' WHERE id = $1`, [releveLigneId, ligne.id]);
  return f;
}

// ---------------------------------------------------------------- consultation et état

export async function releve(q: Executant, code: string, f: { statut?: string; du?: string; au?: string } = {}) {
  const b = await banque(q, code);
  await liberer(q, b.id);
  const lignes = (await q.query(
    `SELECT r.id, r.date_operation, r.libelle, r.montant::bigint AS montant, r.reference, r.statut, e.numero_piece AS piece, e.date_comptable, e.statut AS statut_ecriture
       FROM releve_ligne r LEFT JOIN ligne_ecriture l ON l.id = r.ligne_ecriture_id LEFT JOIN ecriture e ON e.id = l.ecriture_id
      WHERE r.banque_operateur_id = $1 AND r.supprime_le IS NULL AND ($2::text IS NULL OR r.statut = $2)
        AND ($3::date IS NULL OR r.date_operation >= $3) AND ($4::date IS NULL OR r.date_operation <= $4)
      ORDER BY r.date_operation DESC, r.cree_le DESC LIMIT 500`, [b.id, f.statut ?? null, f.du ?? null, f.au ?? null])).rows;
  return { banque: { code: b.code, nom: b.nom, compte: b.compte }, lignes, ecrituresLibres: await ecrituresLibres(q, b) };
}

/** FIN-RG-043 : état de rapprochement à une date, éventuellement comparé au solde déclaré du relevé. */
export async function etatRapprochement(q: Executant, code: string, date: string, soldeReleve?: number) {
  exiger(dateValide(date), 'DATE_INVALIDE', 'Date invalide');
  const b = await banque(q, code);
  await liberer(q, b.id);
  const soldeComptable = Number((await q.query<{ s: string }>(
    `SELECT COALESCE(sum(l.debit - l.credit), 0)::bigint AS s FROM ligne_ecriture l JOIN ecriture e ON e.id = l.ecriture_id
      WHERE l.compte_id = $1 AND e.statut = 'VALIDEE' AND e.supprime_le IS NULL AND e.date_comptable <= $2`, [b.compte_id, date])).rows[0]!.s);
  // Écritures du compte jusqu'à la date sans ligne de relevé rapprochée à cette date
  const ecritures = (await q.query<{ date: string; piece: string; libelle: string; montant: string }>(
    `SELECT e.date_comptable::text AS date, e.numero_piece AS piece, COALESCE(l.libelle, e.libelle) AS libelle, (l.debit - l.credit)::bigint AS montant
       FROM ligne_ecriture l JOIN ecriture e ON e.id = l.ecriture_id
      WHERE l.compte_id = $1 AND e.statut = 'VALIDEE' AND e.supprime_le IS NULL AND e.date_comptable <= $2
        AND NOT EXISTS (SELECT 1 FROM releve_ligne r WHERE r.ligne_ecriture_id = l.id AND r.supprime_le IS NULL AND r.statut = 'RAPPROCHEE' AND r.date_operation <= $2)
      ORDER BY e.date_comptable`, [b.compte_id, date])).rows.map(x => ({ ...x, montant: Number(x.montant) }));
  // Opérations du relevé jusqu'à la date sans écriture validée à cette date
  const operations = (await q.query<{ date: string; libelle: string; reference: string | null; montant: string }>(
    `SELECT r.date_operation::text AS date, r.libelle, r.reference, r.montant::bigint AS montant FROM releve_ligne r
       LEFT JOIN ligne_ecriture l ON l.id = r.ligne_ecriture_id LEFT JOIN ecriture e ON e.id = l.ecriture_id
      WHERE r.banque_operateur_id = $1 AND r.supprime_le IS NULL AND r.date_operation <= $2
        AND NOT (r.statut = 'RAPPROCHEE' AND e.statut = 'VALIDEE' AND e.date_comptable <= $2)
      ORDER BY r.date_operation`, [b.id, date])).rows.map(x => ({ ...x, montant: Number(x.montant) }));
  const totalEcritures = ecritures.reduce((s, x) => s + x.montant, 0), totalOperations = operations.reduce((s, x) => s + x.montant, 0);
  const soldeReconstitue = soldeComptable - totalEcritures + totalOperations;
  const cumulReleve = Number((await q.query<{ s: string }>(`SELECT COALESCE(sum(montant), 0)::bigint AS s FROM releve_ligne WHERE banque_operateur_id = $1 AND supprime_le IS NULL AND date_operation <= $2`, [b.id, date])).rows[0]!.s);
  return {
    banque: { code: b.code, nom: b.nom, compte: b.compte }, date, soldeComptable, ecritures, totalEcritures, operations, totalOperations, soldeReconstitue,
    cumulReleve, soldeReleve: soldeReleve ?? null, ecart: soldeReleve === undefined ? null : soldeReleve - soldeReconstitue,
  };
}

export async function editerEtat(q: Executant, acteur: Acteur, code: string, date: string, soldeReleve?: number) {
  const e = await etatRapprochement(q, code, date, soldeReleve);
  const b = await banque(q, code);
  const doc = await genererDocument(q, acteur, { modeleCode: 'ETAT_RAPPROCHEMENT', typeDocument: 'ETAT_RAPPROCHEMENT', objet: { type: 'banque_operateur', id: b.id }, variables: {
    banque: e.banque.nom, compte: e.banque.compte, date: fr(date), solde_comptable: gnf(e.soldeComptable), ecritures_non_rapprochees: gnf(e.totalEcritures),
    releve_non_comptabilise: gnf(e.totalOperations), solde_reconstitue: gnf(e.soldeReconstitue), solde_releve: e.soldeReleve === null ? '—' : gnf(e.soldeReleve), ecart: e.ecart === null ? '—' : gnf(e.ecart),
    ecritures: e.ecritures.length ? e.ecritures.map(x => ({ date: fr(x.date), piece: x.piece, libelle: x.libelle, montant: gnf(x.montant) })) : [{ date: '—', piece: '—', libelle: 'Aucune', montant: '—' }],
    releve: e.operations.length ? e.operations.map(x => ({ date: fr(x.date), libelle: x.libelle, reference: x.reference ?? '—', montant: gnf(x.montant) })) : [{ date: '—', libelle: 'Aucune', reference: '—', montant: '—' }],
  } });
  return { documentId: doc.id, ...e };
}
