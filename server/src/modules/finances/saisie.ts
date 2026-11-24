/**
 * Écritures manuelles et journaux (CDC § 11.7, 11.15 ; FIN-RG-025, 030 à 032, 110, 116 ; CA-FIN-03, 08, 09, 20).
 *
 * - Fiche d'imputation sur un journal manuel, pièce jointe obligatoire : l'écriture reste au brouillard (absente des
 *   soldes et des états) jusqu'à sa validation à deux niveaux (vérifiée par le comptable, approuvée par la DAF) ;
 *   elle reçoit alors son numéro de pièce définitif.
 * - La date doit appartenir à un exercice ouvert et à une période non clôturée.
 * - Un journal mouvementé ne se supprime pas et ne change pas de type : il se ferme pour l'avenir.
 */
import type { Executant } from '../../db/pool.js';
import type { Acteur } from '../../noyau/acteur.js';
import { ErreurMetier, exiger, nonTrouve } from '../../noyau/erreurs.js';
import { aujourdhui, dateValide } from '../../noyau/dates.js';
import { journaliser } from '../../moteurs/audit.js';
import { attribuer } from '../../moteurs/numerotation.js';
import { enregistrerOperation, soumettre } from '../../moteurs/validation.js';
import { numeroPiece } from '../comptabilite/moteur.js';
import { normaliserNumero } from '../comptabilite/plan.js';

export const OPERATION_ECRITURE = 'ECRITURE_MANUELLE';

export interface LigneSaisie { compte: string; auxiliaire?: string; libelle: string; debit: number; credit: number; echeance?: string }

/** Exercice et période de la date de saisie : ouverts, sinon refus (CA-FIN-20). */
async function exigerPeriodeOuverte(q: Executant, date: string): Promise<string> {
  const r = (await q.query<{ code: string; statut: string; periode: string | null }>(
    `SELECT e.code, e.statut, p.statut AS periode FROM exercice e LEFT JOIN periode p ON p.exercice_id = e.id AND p.mois = to_char($1::date, 'YYYY-MM')
      WHERE $1::date BETWEEN e.date_debut AND e.date_fin AND e.supprime_le IS NULL`, [date])).rows[0];
  exiger(r && r.statut === 'OUVERT', 'EXERCICE_FERME', 'Aucun exercice ouvert à cette date (FIN-RG-074)');
  exiger(r.periode === 'OUVERTE', 'PERIODE_CLOTUREE', 'Période clôturée : aucune saisie n\'y est admise (FIN-RG-072)');
  return r.code;
}

export async function creerFicheImputation(q: Executant, acteur: Acteur, d: {
  journal: string; date?: string; reference: string; libelle: string; pieceDocumentId: string; tiersId?: string; lignes: LigneSaisie[];
}) {
  const date = d.date ?? aujourdhui();
  exiger(dateValide(date), 'DATE_INVALIDE', 'Date invalide');
  exiger(d.reference?.trim() && d.libelle?.trim(), 'CHAMPS_REQUIS', 'Libellé et référence obligatoires (FIN-RG-074)');
  const j = (await q.query<{ id: string; mode: string; ferme: boolean }>('SELECT id, mode, ferme FROM journal WHERE code = $1 AND supprime_le IS NULL', [d.journal])).rows[0];
  if (!j) throw nonTrouve(`Journal ${d.journal}`);
  exiger(j.mode === 'MANUEL' && !j.ferme, 'JOURNAL_INVALIDE', 'Une fiche d\'imputation vise un journal manuel ouvert (FIN-RG-031)');
  await exigerPeriodeOuverte(q, date);
  const piece = await q.query('SELECT 1 FROM document WHERE id = $1 AND supprime_le IS NULL', [d.pieceDocumentId]);
  exiger(piece.rowCount, 'PIECE_REQUISE', 'Pièce jointe obligatoire (FIN-RG-025)');
  exiger(d.lignes.length >= 2, 'LIGNES_REQUISES', 'Au moins deux lignes');
  for (const l of d.lignes) exiger(Number.isInteger(l.debit) && Number.isInteger(l.credit) && l.debit >= 0 && l.credit >= 0 && (l.debit === 0) !== (l.credit === 0), 'LIGNE_INVALIDE', 'Chaque ligne porte un débit ou un crédit, en francs entiers');
  const debit = d.lignes.reduce((s, l) => s + l.debit, 0), credit = d.lignes.reduce((s, l) => s + l.credit, 0);
  exiger(debit === credit, 'PIECE_DESEQUILIBREE', `Pièce déséquilibrée : débit ${debit}, crédit ${credit}`);
  const ficheId = crypto.randomUUID(), ecritureId = crypto.randomUUID();
  const numero = await attribuer(q, acteur, { type: 'FICHE_IMPUTATION', annee: Number(date.slice(0, 4)) }, { type: 'fiche_imputation', id: ficheId });
  await q.query(
    `INSERT INTO fiche_imputation (id, numero_provisoire, journal_id, tiers_id, reference, piece_document_id, lignes, etabli_par) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [ficheId, numero, j.id, d.tiersId ?? null, d.reference, d.pieceDocumentId, JSON.stringify(d.lignes), acteur.utilisateurId]);
  // L'écriture existe au brouillard : sans effet sur les soldes ni les états (CA-FIN-03)
  await q.query(
    `INSERT INTO ecriture (id, numero_piece, journal_id, date_comptable, libelle, reference, origine, fiche_imputation_id, statut, piece_justificative_id)
     VALUES ($1,$2,$3,$4,$5,$6,'SAISIE',$7,'BROUILLARD',$8)`, [ecritureId, numero, j.id, date, d.libelle, d.reference, ficheId, d.pieceDocumentId]);
  for (const l of d.lignes) {
    const c = (await q.query<{ id: string }>('SELECT id FROM compte WHERE numero = $1', [normaliserNumero(l.compte)])).rows[0];
    if (!c) throw new ErreurMetier('COMPTE_INCONNU', `Compte ${l.compte} absent du plan`, 422);
    const aux = l.auxiliaire ? (await q.query<{ id: string }>('SELECT id FROM compte_auxiliaire WHERE code = $1', [l.auxiliaire])).rows[0]?.id : null;
    if (l.auxiliaire && !aux) throw new ErreurMetier('AUXILIAIRE_INCONNU', `Compte auxiliaire ${l.auxiliaire} inconnu`, 422);
    await q.query('INSERT INTO ligne_ecriture (ecriture_id, compte_id, compte_auxiliaire_id, libelle, debit, credit, echeance) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [ecritureId, c.id, aux ?? null, l.libelle.slice(0, 200), l.debit, l.credit, l.echeance ?? null]);
  }
  await q.query('UPDATE fiche_imputation SET ecriture_id = $2 WHERE id = $1', [ficheId, ecritureId]);
  const demande = await soumettre(q, acteur, { typeOperation: OPERATION_ECRITURE, objetType: 'fiche_imputation', objetId: ficheId, montant: debit, donnees: { numero, journal: d.journal, montant: debit, libelle: d.libelle } });
  await journaliser(q, { ...acteur.trace(), action: 'CREATION', objetType: 'fiche_imputation', objetId: ficheId, apres: { numero, journal: d.journal, date, montant: debit } });
  return { ficheId, numero, ecritureId, demandeValidation: demande.id };
}

enregistrerOperation(OPERATION_ECRITURE, {
  administrative: false,
  // Visas : « vérifié par » (niveau 1, comptable), « approuvé par » (niveau 2, DAF) ; numéro définitif à la validation (FIN-RG-116)
  async appliquer(q, demande, acteur) {
    const f = (await q.query<{ ecriture_id: string; journal: string; date_comptable: string }>(
      `SELECT f.ecriture_id, j.code AS journal, e.date_comptable::text FROM fiche_imputation f JOIN journal j ON j.id = f.journal_id JOIN ecriture e ON e.id = f.ecriture_id WHERE f.id = $1`,
      [demande.objet_id])).rows[0]!;
    const exercice = await exigerPeriodeOuverte(q, f.date_comptable);
    const verifie = (await q.query<{ valideur_id: string }>('SELECT valideur_id FROM validation_etape WHERE demande_validation_id = $1 AND niveau = 1', [demande.id])).rows[0]?.valideur_id ?? null;
    const numero = await numeroPiece(q, f.journal, exercice);
    await q.query(`UPDATE ecriture SET statut = 'VALIDEE', numero_piece = $2, valide_par = $3, valide_le = now() WHERE id = $1`, [f.ecriture_id, numero, acteur.utilisateurId]);
    await q.query('UPDATE fiche_imputation SET verifie_par = $2, approuve_par = $3 WHERE id = $1', [demande.objet_id, verifie, acteur.utilisateurId]);
    await journaliser(q, { ...acteur.trace(), action: 'VALIDATION', objetType: 'ecriture', objetId: f.ecriture_id, apres: { numero } });
  },
  // Fiche rejetée : le brouillard est retiré (il n'a jamais compté) ; la fiche et sa trace restent
  async rejeter(q, demande, acteur) {
    const f = (await q.query<{ ecriture_id: string }>('SELECT ecriture_id FROM fiche_imputation WHERE id = $1', [demande.objet_id])).rows[0]!;
    await q.query(`UPDATE ecriture SET supprime_le = now() WHERE id = $1 AND statut = 'BROUILLARD'`, [f.ecriture_id]);
    await journaliser(q, { ...acteur.trace(), action: 'REJET', objetType: 'fiche_imputation', objetId: demande.objet_id });
  },
});

export async function listerFiches(q: Executant) {
  return (await q.query(
    `SELECT f.id, f.numero_provisoire, j.code AS journal, f.reference, e.libelle, e.date_comptable, e.statut, e.numero_piece, e.supprime_le IS NOT NULL AS rejetee,
            (SELECT sum(debit)::bigint FROM ligne_ecriture l WHERE l.ecriture_id = e.id) AS montant, f.cree_le
       FROM fiche_imputation f JOIN journal j ON j.id = f.journal_id JOIN ecriture e ON e.id = f.ecriture_id ORDER BY f.cree_le DESC LIMIT 300`)).rows;
}

// ---------------------------------------------------------------- journaux (FIN-RG-030 à 032)

export async function creerJournal(q: Executant, acteur: Acteur, d: { code: string; libelle: string; type: string; mode: 'AUTOMATIQUE' | 'MANUEL'; compteTresorerie?: string }) {
  exiger(/^[A-Z0-9]{2,6}$/.test(d.code), 'CODE_INVALIDE', 'Code journal : 2 à 6 lettres ou chiffres');
  const tresorerie = d.compteTresorerie ? (await q.query<{ id: string }>('SELECT id FROM compte WHERE numero = $1', [normaliserNumero(d.compteTresorerie)])).rows[0]?.id : null;
  if (d.type.startsWith('TRESORERIE')) exiger(tresorerie, 'COMPTE_TRESORERIE_REQUIS', 'Un journal de trésorerie a son compte de trésorerie');
  const r = await q.query<{ id: string }>(
    `INSERT INTO journal (code, libelle, type, mode, compte_tresorerie_id, numerotation, rapprochement, ferme) VALUES ($1,$2,$3,$4,$5,'CONTINUE_JOURNAL_EXERCICE',$6,false) RETURNING id`,
    [d.code, d.libelle, d.type, d.mode, tresorerie ?? null, d.type.startsWith('TRESORERIE')])
    .catch(e => { if (e.code === '23505') throw new ErreurMetier('CODE_UTILISE', `Le journal ${d.code} existe déjà`, 409); throw e; });
  await journaliser(q, { ...acteur.trace(), action: 'PARAMETRAGE', objetType: 'journal', objetId: r.rows[0]!.id, apres: d });
  return r.rows[0]!.id;
}

/** CA-FIN-09 : un journal mouvementé ne se supprime pas ; il se ferme pour l'avenir, sauf si un schéma y renvoie (FIN-RG-032). */
export async function fermerJournal(q: Executant, acteur: Acteur, code: string) {
  const j = (await q.query<{ id: string }>('SELECT id FROM journal WHERE code = $1', [code])).rows[0];
  if (!j) throw nonTrouve('Journal');
  const schema = await q.query('SELECT 1 FROM schema_comptable WHERE journal_id = $1 AND actif AND supprime_le IS NULL LIMIT 1', [j.id]);
  exiger(!schema.rowCount, 'JOURNAL_UTILISE', 'Un schéma comptable alimente ce journal : il ne peut pas être fermé');
  await q.query('UPDATE journal SET ferme = true WHERE id = $1', [j.id]);
  await journaliser(q, { ...acteur.trace(), action: 'PARAMETRAGE', objetType: 'journal', objetId: j.id, apres: { ferme: true } });
}

export async function supprimerJournal(q: Executant, acteur: Acteur, code: string) {
  const j = (await q.query<{ id: string }>('SELECT id FROM journal WHERE code = $1', [code])).rows[0];
  if (!j) throw nonTrouve('Journal');
  const mvt = await q.query('SELECT 1 FROM ecriture WHERE journal_id = $1 LIMIT 1', [j.id]);
  if (mvt.rowCount) throw new ErreurMetier('JOURNAL_MOUVEMENTE', 'Journal mouvementé : il ne peut être supprimé ; fermez-le pour l\'avenir', 422, { proposition: 'FERMER' });
  await q.query('UPDATE journal SET supprime_le = now() WHERE id = $1', [j.id]);
  await journaliser(q, { ...acteur.trace(), action: 'SUPPRESSION', objetType: 'journal', objetId: j.id });
}
