/**
 * Banques, opérateurs de monnaie électronique et caisse (CDC § 11.9, 11.16 ; FIN-RG-040, 103).
 * Chaque banque ou opérateur a son sous-compte de trésorerie, son journal et un responsable.
 */
import type { Executant } from '../../db/pool.js';
import type { Acteur } from '../../noyau/acteur.js';
import { ErreurMetier, exiger, nonTrouve } from '../../noyau/erreurs.js';
import { journaliser } from '../../moteurs/audit.js';
import { creerCompteGeneral, normaliserNumero } from '../comptabilite/plan.js';

export type Moyen = 'ESPECES_SIEGE' | 'BANQUE' | 'MONNAIE_ELECTRONIQUE';

export async function creerBanqueOperateur(q: Executant, acteur: Acteur, d: {
  code: string; nom: string; type: 'BANQUE' | 'MONNAIE_ELECTRONIQUE'; compteNumero: string; responsableId: string;
  formatVirement?: string; formatReleve?: string;
}): Promise<string> {
  exiger(/^[A-Z0-9]{2,6}$/.test(d.code), 'CODE_INVALIDE', 'Code : 2 à 6 lettres ou chiffres (il sert aussi de code journal)');
  const numero = normaliserNumero(d.compteNumero);
  exiger(numero.startsWith('56'), 'COMPTE_INVALIDE', 'Le compte de trésorerie d\'une banque ou d\'un opérateur est un sous-compte de la classe 56');
  const existe = await q.query('SELECT 1 FROM journal WHERE code = $1', [d.code]);
  exiger(!existe.rowCount, 'CODE_UTILISE', `Le code ${d.code} est déjà un code journal`, 409);
  const compteId = (await q.query<{ id: string }>('SELECT id FROM compte WHERE numero = $1', [numero])).rows[0]?.id
    ?? await creerCompteGeneral(q, acteur, { numero, libelle: `${d.type === 'BANQUE' ? 'Banque' : 'Monnaie électronique'} – ${d.nom}`, parentNumero: '56', sensHabituel: 'D' });
  const j = await q.query<{ id: string }>(
    `INSERT INTO journal (code, libelle, type, mode, compte_tresorerie_id, numerotation, rapprochement, ferme)
     VALUES ($1,$2,'TRESORERIE_BANQUE','AUTOMATIQUE',$3,'CONTINUE_JOURNAL_EXERCICE',true,false) RETURNING id`, [d.code, d.nom, compteId]);
  const r = await q.query<{ id: string }>(
    `INSERT INTO banque_operateur (code, nom, compte_id, journal_id, format_virement, format_releve, responsable_id) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [d.code, d.nom, compteId, j.rows[0]!.id, d.formatVirement ?? null, d.formatReleve ?? null, d.responsableId]);
  await journaliser(q, { ...acteur.trace(), action: 'PARAMETRAGE', objetType: 'banque_operateur', objetId: r.rows[0]!.id, apres: d });
  return r.rows[0]!.id;
}

/** Compte et journal de trésorerie d'un moyen de paiement : caisse du siège, ou banque / opérateur désigné. */
export async function tresorerieDe(q: Executant, moyen: Moyen, banqueCode?: string | null): Promise<{ compteId: string; journal: string }> {
  if (moyen === 'ESPECES_SIEGE') {
    const c = (await q.query<{ compte_tresorerie_id: string | null }>(`SELECT compte_tresorerie_id FROM journal WHERE code = 'CAI' AND NOT ferme`)).rows[0];
    if (!c?.compte_tresorerie_id) throw new ErreurMetier('CAISSE_ABSENTE', 'Journal de caisse CAI absent ou sans compte de trésorerie', 422);
    return { compteId: c.compte_tresorerie_id, journal: 'CAI' };
  }
  exiger(banqueCode, 'BANQUE_REQUISE', 'Préciser la banque ou l\'opérateur de monnaie électronique');
  const b = (await q.query<{ compte_id: string; journal: string }>(
    `SELECT b.compte_id, j.code AS journal FROM banque_operateur b JOIN journal j ON j.id = b.journal_id WHERE b.code = $1 AND b.supprime_le IS NULL AND NOT j.ferme`, [banqueCode])).rows[0];
  if (!b) throw nonTrouve(`Banque ou opérateur ${banqueCode}`);
  return { compteId: b.compte_id, journal: b.journal };
}

export async function listerBanquesOperateurs(q: Executant) {
  return (await q.query(
    `SELECT b.id, b.code, b.nom, c.numero AS compte, u.identifiant AS responsable FROM banque_operateur b
       JOIN compte c ON c.id = b.compte_id JOIN utilisateur u ON u.id = b.responsable_id WHERE b.supprime_le IS NULL ORDER BY b.code`)).rows;
}

/** FI-06 : solde de chaque compte de trésorerie (banques, opérateurs, caisse du siège) et encaissements en attente d'affectation. */
export async function soldesTresorerie(q: Executant) {
  const comptes = (await q.query<{ code: string; nom: string; numero: string; libelle: string; type: string; solde: number }>(
    `SELECT j.code, COALESCE(bo.nom, j.libelle) AS nom, c.numero, c.libelle, j.type,
            (SELECT COALESCE(sum(l.debit - l.credit), 0) FROM ligne_ecriture l JOIN ecriture e ON e.id = l.ecriture_id
              WHERE l.compte_id = c.id AND e.statut = 'VALIDEE' AND e.supprime_le IS NULL)::bigint AS solde
       FROM journal j JOIN compte c ON c.id = j.compte_tresorerie_id LEFT JOIN banque_operateur bo ON bo.journal_id = j.id
      WHERE j.supprime_le IS NULL AND j.type LIKE 'TRESORERIE%' ORDER BY j.code`)).rows
    .map(x => ({ ...x, solde: Number(x.solde), nature: x.type === 'TRESORERIE_CAISSE' ? 'CAISSE' : x.libelle.startsWith('Monnaie') ? 'MONNAIE_ELECTRONIQUE' : 'BANQUE' }));
  const attente = (await q.query<{ solde: number; n: number }>(
    `SELECT COALESCE(sum(l.credit - l.debit), 0)::bigint AS solde, count(DISTINCT e.id)::int AS n FROM ligne_ecriture l JOIN ecriture e ON e.id = l.ecriture_id JOIN compte c ON c.id = l.compte_id
      WHERE c.numero = $1 AND e.statut = 'VALIDEE' AND e.supprime_le IS NULL AND l.lettrage_id IS NULL`, [normaliserNumero('471')])).rows[0]!;
  return { comptes, attente: { montant: Number(attente.solde), pieces: attente.n } };
}
