/**
 * Moteur d'événements métier (CDC § 3.4 ; DD evenement_metier ; écart X17).
 *
 * - Publication transactionnelle (outbox) : l'événement est écrit dans la même transaction que l'opération qui l'émet ;
 *   il n'existe que si l'opération est validée. Clé d'idempotence unique : une même opération ne publie qu'une fois.
 * - Chaque abonné reçoit l'événement une fois : sa distribution est suivie à part (table distribution_evenement).
 *   Le traitement de l'abonné et le marquage « traité » sont dans la même transaction : effet unique, même après une reprise.
 * - Échec : nouvel essai avec délai croissant ; au-delà de MAX_TENTATIVES, distribution abandonnée et signalée.
 */
import type pg from 'pg';
import type { Executant } from '../db/pool.js';
import { getPool, transaction } from '../db/pool.js';
import type { Acteur } from '../noyau/acteur.js';
import { exiger } from '../noyau/erreurs.js';

export interface Evenement {
  id: string; type_evenement: string; objet_type: string; objet_id: string; charge_utile: Record<string, unknown>; cree_le: string; cree_par: string | null;
}
export type Traitement = (q: pg.PoolClient, e: Evenement) => Promise<void>;

/** Liste minimale du § 3.4, complétée par les événements du socle. */
export const TYPES_EVENEMENTS = new Set([
  'DEPOT_CONFIRME', 'DEPOT_REMBOURSE', 'POLICE_EMISE', 'POLICE_RENOUVELEE', 'POLICE_ANNULEE', 'AVENANT_EMIS', 'POLICE_SUSPENDUE', 'POLICE_EXPIREE',
  'POLICE_ECHUE', 'PRESTATION_VALIDEE', 'FACTURE_MENSUELLE_VALIDEE', 'PAIEMENT_EXECUTE', 'SINISTRE_OUVERT', 'SINISTRE_EVALUE', 'INDEMNITE_VALIDEE',
  'FACTURE_ACHAT_VALIDEE', 'DECLARATION_TAXE_VALIDEE', 'APPEL_PRIME_EMIS', 'PAIEMENT_COLLECTIF_RECU', 'ADHERENT_ENTRE', 'ADHERENT_SORTI',
  'REGULARISATION_EMISE', 'MOTIF_BLOCAGE_AJOUTE', 'MOTIF_BLOCAGE_LEVE', 'RDV_TELECONSULTATION_PRIS', 'RDV_TELECONSULTATION_ANNULE', 'DECES_DECLARE',
  'DOSSIER_SOUSCRIPTION_A_VALIDER', 'PORTEFEUILLE_TRANSFERE', 'VERSEMENT_PROGRAMME_RECU', 'INTERVENANT_ACTIVE', 'INTERVENANT_SORTI',
  'IMMOBILISATION_CREEE', 'IMMOBILISATION_CEDEE', 'CLOTURE_PERIODE', 'ENCAISSEMENT_EN_ATTENTE_RECU', 'ENCAISSEMENT_EN_ATTENTE_REMBOURSE',
  'PRIME_ANTICIPATION_ACQUISE', 'VERSEMENT_PROGRAMME_REMBOURSE', 'RECOURS_RECONNU', 'RECOURS_ENCAISSE', 'FRAIS_HORS_PRIME_FACTURES',
  // Socle (lot 1)
  'RECLAMATION_ENREGISTREE', 'RECLAMATION_ESCALADEE', 'RECLAMATION_REPONDUE', 'DOCUMENT_ACCEPTE',
]);

export const MAX_TENTATIVES = 8;
const abonnes = new Map<string, Map<string, Traitement>>();

/** Abonne un traitement nommé à un type d'événement. Le nom identifie l'abonné de façon stable (reprises). */
export function abonner(type: string, nom: string, traitement: Traitement): void {
  exiger(TYPES_EVENEMENTS.has(type), 'EVENEMENT_INCONNU', `Type d'événement inconnu : ${type}`, 500);
  if (!abonnes.has(type)) abonnes.set(type, new Map());
  abonnes.get(type)!.set(nom, traitement);
}

/** Publie un événement dans la transaction de l'opération ; sans effet si la clé d'idempotence a déjà été publiée. */
export async function publier(q: Executant, acteur: Acteur, e: {
  type: string; objet: { type: string; id: string }; charge: Record<string, unknown>; cleIdempotence: string;
}): Promise<string | null> {
  exiger(TYPES_EVENEMENTS.has(e.type), 'EVENEMENT_INCONNU', `Type d'événement inconnu : ${e.type}`, 500);
  const r = await q.query<{ id: string }>(
    `INSERT INTO evenement_metier (cree_par, type_evenement, objet_type, objet_id, charge_utile, cle_idempotence, statut, tentatives)
     VALUES ($1,$2,$3,$4,$5,$6,'A_TRAITER',0) ON CONFLICT (cle_idempotence) DO NOTHING RETURNING id`,
    [acteur.utilisateurId, e.type, e.objet.type, e.objet.id, JSON.stringify(e.charge), e.cleIdempotence]);
  const id = r.rows[0]?.id;
  if (!id) return null;
  for (const nom of abonnes.get(e.type)?.keys() ?? []) {
    await q.query('INSERT INTO distribution_evenement (evenement_id, abonne) VALUES ($1,$2)', [id, nom]);
  }
  return id;
}

const delai = (tentatives: number) => Math.min(2 ** tentatives * 30, 6 * 3600); // 1 min, 2 min, 4 min… plafonné à 6 h

/**
 * Distribue un lot d'événements en attente. Plusieurs distributeurs peuvent tourner en parallèle (SKIP LOCKED).
 * Renvoie le nombre de distributions traitées ou en échec.
 */
export async function distribuer(lot = 50): Promise<{ traites: number; echecs: number }> {
  let traites = 0, echecs = 0;
  for (let i = 0; i < lot; i++) {
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      const d = (await client.query<{ id: string; abonne: string; tentatives: number; evenement_id: string }>(
        `SELECT id, abonne, tentatives, evenement_id FROM distribution_evenement
          WHERE statut IN ('A_TRAITER', 'EN_ERREUR') AND prochain_essai <= now()
          ORDER BY prochain_essai LIMIT 1 FOR UPDATE SKIP LOCKED`)).rows[0];
      if (!d) { await client.query('COMMIT'); break; }
      const e = (await client.query<Evenement>('SELECT * FROM evenement_metier WHERE id = $1', [d.evenement_id])).rows[0]!;
      const traitement = abonnes.get(e.type_evenement)?.get(d.abonne);
      try {
        if (!traitement) throw new Error(`Abonné ${d.abonne} non enregistré dans ce processus`);
        await client.query('SAVEPOINT traitement');
        await client.query(`SELECT set_config('app.utilisateur_id', '', true)`);
        await traitement(client, e);
        await client.query(`UPDATE distribution_evenement SET statut = 'TRAITE', tentatives = tentatives + 1, traite_le = now(), erreur = NULL WHERE id = $1`, [d.id]);
        traites++;
      } catch (err) {
        await client.query('ROLLBACK TO SAVEPOINT traitement').catch(() => undefined);
        const n = d.tentatives + 1;
        await client.query(
          `UPDATE distribution_evenement SET statut = $2, tentatives = $3, erreur = $4, prochain_essai = now() + make_interval(secs => $5) WHERE id = $1`,
          [d.id, n >= MAX_TENTATIVES ? 'ABANDONNE' : 'EN_ERREUR', n, (err as Error).message.slice(0, 2000), delai(n)]);
        echecs++;
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }
  return { traites, echecs };
}

/** Supervision : distributions en échec ou abandonnées (tableau de bord de l'exploitation). */
export async function distributionsEnAnomalie(q: Executant = getPool()) {
  return (await q.query(
    `SELECT d.id, d.abonne, d.statut, d.tentatives, d.erreur, d.prochain_essai, e.type_evenement, e.objet_type, e.objet_id, e.cree_le
       FROM distribution_evenement d JOIN evenement_metier e ON e.id = d.evenement_id
      WHERE d.statut IN ('EN_ERREUR', 'ABANDONNE') ORDER BY e.cree_le`)).rows;
}

/** Relance manuelle d'une distribution abandonnée, après correction de la cause. */
export async function relancer(id: string): Promise<void> {
  await transaction(null, q => q.query(`UPDATE distribution_evenement SET statut = 'A_TRAITER', prochain_essai = now(), tentatives = 0 WHERE id = $1 AND statut = 'ABANDONNE'`, [id]));
}
