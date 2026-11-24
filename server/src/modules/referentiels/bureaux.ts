/**
 * Bureaux directs et bureau Canal digital (CDC § 5.4 ; REF-RG-020, 021 ; DD 5.7, 5.8).
 * Code de 2 chiffres, unique, jamais réutilisé ; capacité de 99 contrôlée, alerte au seuil paramétré.
 * Toute lecture est filtrée par le périmètre de l'utilisateur (ORG-RG-040, CA-ORG-03).
 */
import type { Executant } from '../../db/pool.js';
import type { Acteur } from '../../noyau/acteur.js';
import { ErreurMetier, exiger, nonTrouve } from '../../noyau/erreurs.js';
import { journaliser } from '../../moteurs/audit.js';
import { entier } from '../../moteurs/parametres.js';
import type { Perimetre } from '../habilitations/droits.js';

export async function creerBureau(q: Executant, acteur: Acteur, d: { code?: string; nom: string; type: 'BUREAU_DIRECT' | 'CANAL_DIGITAL'; adresse: string }) {
  await q.query('LOCK TABLE bureau IN SHARE ROW EXCLUSIVE MODE');
  const utilises = (await q.query<{ code: string }>('SELECT code FROM bureau')).rows.map(r => r.code);
  let code = d.code;
  if (code) {
    exiger(/^(0[1-9]|[1-9]\d)$/.test(code), 'CODE_INVALIDE', 'Code bureau : 2 chiffres, de 01 à 99');
    exiger(!utilises.includes(code), 'CODE_DEJA_UTILISE', `Le code ${code} est déjà attribué ou l'a été : il n'est jamais réutilisé`);
  } else {
    code = Array.from({ length: 99 }, (_, i) => String(i + 1).padStart(2, '0')).find(c => !utilises.includes(c));
    if (!code) throw new ErreurMetier('CAPACITE_BUREAUX', 'Les 99 codes bureau sont épuisés', 409);
  }
  exiger(d.nom.trim() && d.adresse.trim(), 'CHAMPS_REQUIS', 'Nom et adresse obligatoires');
  const r = await q.query<{ id: string }>(`INSERT INTO bureau (code, nom, type, adresse, statut) VALUES ($1,$2,$3,$4,'ACTIF') RETURNING id`, [code, d.nom, d.type, d.adresse]);
  const nb = utilises.length + 1;
  const seuil = await entier(q, 'BUREAU_ALERTE_CODES');
  await journaliser(q, { ...acteur.trace(), action: 'CREATION', objetType: 'bureau', objetId: r.rows[0]!.id, apres: { ...d, code, alerte_capacite: nb >= seuil } });
  return { id: r.rows[0]!.id, code, alerteCapacite: nb >= seuil ? `${nb} codes bureau utilisés sur 99` : null };
}

const filtre = (p: Perimetre | null | undefined) => (p?.bureaux?.length ? p.bureaux : null);

export async function listerBureaux(q: Executant, perimetre: Perimetre | null | undefined) {
  return (await q.query(
    `SELECT b.id, b.code, b.nom, b.type, b.adresse, b.statut,
            (SELECT bg.intervenant_id FROM bureau_gestionnaire bg WHERE bg.bureau_id = b.id AND bg.date_fin IS NULL AND bg.supprime_le IS NULL LIMIT 1) AS gestionnaire_id
       FROM bureau b WHERE b.supprime_le IS NULL AND ($1::text[] IS NULL OR b.code = ANY($1)) ORDER BY b.code`, [filtre(perimetre)])).rows;
}

/** Hors périmètre, le bureau est « introuvable » : on ne révèle pas son existence. */
export async function lireBureau(q: Executant, id: string, perimetre: Perimetre | null | undefined) {
  const r = await q.query('SELECT * FROM bureau WHERE id = $1 AND supprime_le IS NULL AND ($2::text[] IS NULL OR code = ANY($2))', [id, filtre(perimetre)]);
  if (!r.rows[0]) throw nonTrouve('Bureau');
  return r.rows[0];
}
