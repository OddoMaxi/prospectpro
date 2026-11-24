/** États de base (CDC § 11.15, 11.20) : balance générale et auxiliaire, grand livre, pièces. Seules les écritures validées comptent. */
import type { Executant } from '../../db/pool.js';
import { nonTrouve } from '../../noyau/erreurs.js';
import { normaliserNumero } from './plan.js';

export async function balanceGenerale(q: Executant, du: string, au: string) {
  return (await q.query<{ numero: string; libelle: string; debit: number; credit: number; solde: number }>(
    `SELECT c.numero, c.libelle, sum(l.debit)::bigint AS debit, sum(l.credit)::bigint AS credit, (sum(l.debit) - sum(l.credit))::bigint AS solde
       FROM ligne_ecriture l JOIN ecriture e ON e.id = l.ecriture_id JOIN compte c ON c.id = l.compte_id
      WHERE e.statut = 'VALIDEE' AND e.date_comptable BETWEEN $1 AND $2
      GROUP BY c.numero, c.libelle ORDER BY c.numero`, [du, au])).rows;
}

/** Balance auxiliaire d'un collectif ; sa somme égale le solde du collectif (FIN-RG-013). */
export async function balanceAuxiliaire(q: Executant, collectif: string, au: string) {
  return (await q.query<{ code: string; tiers: string; debit: number; credit: number; solde: number; non_lettre: number }>(
    `SELECT a.code, trim(t.nom || ' ' || COALESCE(t.prenoms, '')) AS tiers, sum(l.debit)::bigint AS debit, sum(l.credit)::bigint AS credit,
            (sum(l.debit) - sum(l.credit))::bigint AS solde, count(*) FILTER (WHERE l.lettrage_id IS NULL)::int AS non_lettre
       FROM ligne_ecriture l JOIN ecriture e ON e.id = l.ecriture_id JOIN compte_auxiliaire a ON a.id = l.compte_auxiliaire_id
       JOIN tiers t ON t.id = a.tiers_id JOIN compte c ON c.id = a.collectif_id
      WHERE e.statut = 'VALIDEE' AND e.date_comptable <= $2 AND c.numero = $1
      GROUP BY a.code, t.nom, t.prenoms ORDER BY a.code`, [normaliserNumero(collectif), au])).rows;
}

/** Grand livre d'un compte (ou d'un auxiliaire), avec solde progressif. */
export async function grandLivre(q: Executant, f: { compte?: string; auxiliaire?: string; du: string; au: string }) {
  const r = await q.query<{ date_comptable: string; numero_piece: string; journal: string; libelle: string; debit: number; credit: number; lettrage: string | null; ecriture_id: string; ligne_id: string }>(
    `SELECT e.date_comptable, e.numero_piece, j.code AS journal, l.libelle, l.debit, l.credit, lt.code AS lettrage, e.id AS ecriture_id, l.id AS ligne_id
       FROM ligne_ecriture l JOIN ecriture e ON e.id = l.ecriture_id JOIN journal j ON j.id = e.journal_id JOIN compte c ON c.id = l.compte_id
       LEFT JOIN compte_auxiliaire a ON a.id = l.compte_auxiliaire_id LEFT JOIN lettrage lt ON lt.id = l.lettrage_id AND lt.delettre_le IS NULL
      WHERE e.statut = 'VALIDEE' AND e.date_comptable BETWEEN $3 AND $4
        AND ($1::text IS NULL OR c.numero = $1) AND ($2::text IS NULL OR a.code = $2)
      ORDER BY e.date_comptable, e.rang, l.id`, [f.compte ? normaliserNumero(f.compte) : null, f.auxiliaire ?? null, f.du, f.au]);
  let solde = 0;
  return r.rows.map(x => ({ ...x, solde: (solde += Number(x.debit) - Number(x.credit)) }));
}

export async function lirePiece(q: Executant, id: string) {
  const e = (await q.query(
    `SELECT e.*, j.code AS journal, s.horodatage AS scelle_le FROM ecriture e JOIN journal j ON j.id = e.journal_id
       LEFT JOIN scellement_lot s ON s.id = e.scellement_lot_id WHERE e.id = $1`, [id])).rows[0];
  if (!e) throw nonTrouve('Pièce');
  const lignes = (await q.query(
    `SELECT l.id, c.numero AS compte, c.libelle AS compte_libelle, a.code AS auxiliaire, l.libelle, l.debit, l.credit, l.echeance, lt.code AS lettrage
       FROM ligne_ecriture l JOIN compte c ON c.id = l.compte_id LEFT JOIN compte_auxiliaire a ON a.id = l.compte_auxiliaire_id
       LEFT JOIN lettrage lt ON lt.id = l.lettrage_id AND lt.delettre_le IS NULL WHERE l.ecriture_id = $1 ORDER BY l.id`, [id])).rows;
  return { ...e, lignes };
}

export async function rechercherPieces(q: Executant, f: { journal?: string; du: string; au: string; reference?: string }) {
  return (await q.query(
    `SELECT e.id, e.numero_piece, j.code AS journal, e.date_comptable, e.date_origine, e.libelle, e.reference, e.origine, e.statut,
            (SELECT sum(debit)::bigint FROM ligne_ecriture WHERE ecriture_id = e.id) AS montant, e.scellement_lot_id IS NOT NULL AS scellee
       FROM ecriture e JOIN journal j ON j.id = e.journal_id
      WHERE e.date_comptable BETWEEN $2 AND $3 AND ($1::text IS NULL OR j.code = $1) AND ($4::text IS NULL OR e.reference ILIKE '%' || $4 || '%' OR e.libelle ILIKE '%' || $4 || '%')
      ORDER BY e.rang DESC LIMIT 500`, [f.journal ?? null, f.du, f.au, f.reference ?? null])).rows;
}
