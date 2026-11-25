/**
 * Prospects (CDC § 7.5.8 ; COM-RG-070, 071 ; REF-RG-002, 003 ; CA-COM-18).
 *
 * - Le premier intervenant qui enregistre un prospect le garde pendant 90 jours (paramètre) : il en est l'apporteur.
 * - Un client déjà actif, ou un prospect encore sous exclusivité, garde son titulaire, quel que soit le canal.
 * - La conversion en client garde la même fiche tiers ; le prospect passe CONVERTI à l'émission.
 */
import type { Executant } from '../../db/pool.js';
import type { Acteur } from '../../noyau/acteur.js';
import { ErreurMetier, exiger, nonTrouve } from '../../noyau/erreurs.js';
import { ajouterJours, aujourdhui } from '../../noyau/dates.js';
import { journaliser } from '../../moteurs/audit.js';
import { entier } from '../../moteurs/parametres.js';

export type StatutProspect = 'NOUVEAU' | 'CONTACTE' | 'INTERESSE' | 'CONVERTI' | 'PERDU';

/** Agent général dont relève un intervenant (lui-même s'il est agent général). */
export async function agentDe(q: Executant, intervenantId: string): Promise<string> {
  const r = (await q.query<{ agent: string }>('SELECT COALESCE(rattachement_id, id) AS agent FROM intervenant WHERE id = $1', [intervenantId])).rows[0];
  if (!r) throw nonTrouve('Intervenant');
  return r.agent;
}

/**
 * COM-RG-071 : qui détient déjà la relation avec ce tiers ?
 * - TITULAIRE : client actif (police en cours dont il est souscripteur) ; intervenant = titulaire du portefeuille ;
 * - PROSPECT : prospect sous exclusivité ; intervenant = celui qui l'a enregistré.
 */
export async function relationExistante(q: Executant, tiersId: string, date = aujourdhui()): Promise<{ type: 'TITULAIRE' | 'PROSPECT'; intervenantId: string; nom: string; prospectId?: string } | null> {
  const t = (await q.query<{ intervenant_id: string; nom: string }>(
    `SELECT pi.intervenant_id, trim(ti.nom || ' ' || COALESCE(ti.prenoms, '')) AS nom FROM police p JOIN police_intervenant pi ON pi.police_id = p.id AND pi.qualite = 'TITULAIRE' AND pi.date_fin IS NULL
       JOIN intervenant i ON i.id = pi.intervenant_id JOIN tiers ti ON ti.id = i.tiers_id
      WHERE p.souscripteur_id = $1 AND p.statut IN ('ACTIVE', 'ECHUE') ORDER BY p.date_premiere_effet DESC LIMIT 1`, [tiersId])).rows[0];
  if (t) return { type: 'TITULAIRE', intervenantId: t.intervenant_id, nom: t.nom };
  const p = (await q.query<{ id: string; intervenant_id: string; nom: string }>(
    `SELECT p.id, p.intervenant_id, trim(ti.nom || ' ' || COALESCE(ti.prenoms, '')) AS nom FROM prospect p JOIN intervenant i ON i.id = p.intervenant_id JOIN tiers ti ON ti.id = i.tiers_id
      WHERE p.tiers_id = $1 AND p.statut NOT IN ('CONVERTI', 'PERDU') AND p.exclusivite_jusqu_au >= $2 AND p.supprime_le IS NULL ORDER BY p.cree_le LIMIT 1`, [tiersId, date])).rows[0];
  return p ? { type: 'PROSPECT', intervenantId: p.intervenant_id, nom: p.nom, prospectId: p.id } : null;
}

/** Enregistrement d'un prospect par l'intervenant connecté ; refusé si un autre réseau détient déjà la relation. */
export async function enregistrerProspect(q: Executant, acteur: Acteur, intervenantId: string, tiersId: string) {
  const t = (await q.query<{ nature: string }>('SELECT nature FROM tiers WHERE id = $1 AND supprime_le IS NULL', [tiersId])).rows[0];
  if (!t) throw nonTrouve('Tiers');
  const i = (await q.query<{ role: string; statut: string }>('SELECT role, statut FROM intervenant WHERE id = $1', [intervenantId])).rows[0];
  exiger(i && i.statut === 'ACTIF' && i.role !== 'PRESCRIPTEUR', 'INTERDIT', 'Seul un intervenant actif du réseau de vente enregistre des prospects', 403);
  const existante = await relationExistante(q, tiersId);
  if (existante) {
    const memeReseau = (await agentDe(q, existante.intervenantId)) === (await agentDe(q, intervenantId));
    if (existante.intervenantId === intervenantId) throw new ErreurMetier('DEJA_PROSPECT', existante.type === 'TITULAIRE' ? 'Ce client est déjà dans votre portefeuille' : 'Ce prospect est déjà le vôtre', 409);
    throw new ErreurMetier('RELATION_EXISTANTE', existante.type === 'TITULAIRE'
      ? `Client actif de ${memeReseau ? 'votre réseau' : 'un autre intervenant'} : il garde son titulaire (COM-RG-071)`
      : `Prospect sous exclusivité de ${memeReseau ? existante.nom : 'un autre intervenant'} (COM-RG-071)`, 409);
  }
  const jours = await entier(q, 'COM_EXCLUSIVITE_PROSPECT_JOURS');
  const r = await q.query<{ id: string }>(
    `INSERT INTO prospect (tiers_id, intervenant_id, exclusivite_jusqu_au, statut) VALUES ($1,$2,$3,'NOUVEAU') RETURNING id`, [tiersId, intervenantId, ajouterJours(aujourdhui(), jours)]);
  await journaliser(q, { ...acteur.trace(), action: 'CREATION', objetType: 'prospect', objetId: r.rows[0]!.id, apres: { tiersId, intervenantId, jours } });
  return { id: r.rows[0]!.id, exclusiviteJusquAu: ajouterJours(aujourdhui(), jours) };
}

export async function changerStatutProspect(q: Executant, acteur: Acteur, intervenantId: string, prospectId: string, statut: Exclude<StatutProspect, 'CONVERTI'>) {
  const p = (await q.query<{ intervenant_id: string; statut: string }>('SELECT intervenant_id, statut FROM prospect WHERE id = $1 AND supprime_le IS NULL FOR UPDATE', [prospectId])).rows[0];
  if (!p) throw nonTrouve('Prospect');
  exiger(p.intervenant_id === intervenantId, 'INTERDIT', 'Ce prospect n\'est pas le vôtre', 403);
  exiger(!['CONVERTI', 'PERDU'].includes(p.statut), 'PROSPECT_CLOS', 'Prospect converti ou perdu');
  await q.query('UPDATE prospect SET statut = $2 WHERE id = $1', [prospectId, statut]);
  await journaliser(q, { ...acteur.trace(), action: 'MODIFICATION', objetType: 'prospect', objetId: prospectId, avant: { statut: p.statut }, apres: { statut } });
}

/** À l'émission : le prospect devient client (même fiche) ; renvoie l'intervenant qui l'avait enregistré. */
export async function convertirProspect(q: Executant, tiersId: string): Promise<string | null> {
  const r = await q.query<{ intervenant_id: string }>(
    `UPDATE prospect SET statut = 'CONVERTI', converti_le = now() WHERE tiers_id = $1 AND statut NOT IN ('CONVERTI', 'PERDU') AND supprime_le IS NULL RETURNING intervenant_id`, [tiersId]);
  return r.rows[0]?.intervenant_id ?? null;
}

/** Prospects de l'intervenant (et, pour un agent général, ceux de son réseau). */
export async function listerProspects(q: Executant, intervenantId: string, f: { statut?: string; finExclusiviteAvant?: string } = {}) {
  return (await q.query(
    `SELECT p.id, p.statut, p.exclusivite_jusqu_au, p.converti_le, p.cree_le, t.id AS tiers_id, t.code_tiers, t.nom, t.prenoms, t.telephone, t.date_naissance,
            p.intervenant_id, trim(ti.nom || ' ' || COALESCE(ti.prenoms, '')) AS intervenant, p.intervenant_id = $1 AS mien
       FROM prospect p JOIN tiers t ON t.id = p.tiers_id JOIN intervenant i ON i.id = p.intervenant_id JOIN tiers ti ON ti.id = i.tiers_id
      WHERE p.supprime_le IS NULL AND (p.intervenant_id = $1 OR i.rattachement_id = $1)
        AND ($2::text IS NULL OR p.statut = $2) AND ($3::date IS NULL OR p.exclusivite_jusqu_au <= $3)
      ORDER BY p.statut IN ('CONVERTI', 'PERDU'), p.exclusivite_jusqu_au`, [intervenantId, f.statut ?? null, f.finExclusiviteAvant ?? null])).rows;
}
