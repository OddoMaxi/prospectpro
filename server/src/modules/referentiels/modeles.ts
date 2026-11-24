/**
 * Modèles de documents (DD modele_document) : version et date d'effet. Le moteur de génération PDF/A (sous-lot 1.5)
 * fusionne ces modèles avec les variables métier et les mentions légales en vigueur (REF-RG-011).
 */
import type { Executant } from '../../db/pool.js';
import type { Acteur } from '../../noyau/acteur.js';
import { exiger } from '../../noyau/erreurs.js';
import { aujourdhui, dateValide } from '../../noyau/dates.js';
import { journaliser } from '../../moteurs/audit.js';

export type NiveauSignature = 'CODE_USAGE_UNIQUE' | 'CERTIFIEE_ANDE' | 'MANUSCRITE_NUMERISEE';

/** Nouvelle version d'un modèle (la première si le code est nouveau). */
export async function creerModeleDocument(q: Executant, acteur: Acteur, d: { code: string; libelle: string; contenu: string; niveauSignature: NiveauSignature; dateEffet?: string }) {
  const dateEffet = d.dateEffet ?? aujourdhui();
  exiger(dateValide(dateEffet), 'DATE_INVALIDE', 'Date d\'effet invalide');
  exiger(/^[A-Z0-9_]{2,40}$/.test(d.code), 'CODE_INVALIDE', 'Code : majuscules, chiffres et _ (40 au plus)');
  exiger(d.libelle?.trim() && d.contenu?.trim(), 'CHAMPS_REQUIS', 'Libellé et contenu obligatoires');
  await q.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`modele:${d.code}`]);
  const v = (await q.query<{ v: number }>('SELECT COALESCE(max(version), 0) + 1 AS v FROM modele_document WHERE code = $1', [d.code])).rows[0]!.v;
  const r = await q.query<{ id: string }>(
    `INSERT INTO modele_document (code, version, libelle, contenu, niveau_signature, date_effet, valide_comite) VALUES ($1,$2,$3,$4,$5,$6,false) RETURNING id`,
    [d.code, v, d.libelle, d.contenu, d.niveauSignature, dateEffet]);
  await journaliser(q, { ...acteur.trace(), action: 'CREATION', objetType: 'modele_document', objetId: r.rows[0]!.id, apres: { code: d.code, version: v, libelle: d.libelle, dateEffet } });
  return { id: r.rows[0]!.id, version: v };
}

/** Version d'un modèle en vigueur à une date. */
export async function modeleEnVigueur(q: Executant, code: string, date = aujourdhui()) {
  const r = await q.query('SELECT * FROM modele_document WHERE code = $1 AND date_effet <= $2 AND supprime_le IS NULL ORDER BY date_effet DESC, version DESC LIMIT 1', [code, date]);
  return r.rows[0] ?? null;
}

export async function listerModeles(q: Executant) {
  return (await q.query('SELECT id, code, version, libelle, niveau_signature, date_effet, valide_comite FROM modele_document WHERE supprime_le IS NULL ORDER BY code, version DESC')).rows;
}
