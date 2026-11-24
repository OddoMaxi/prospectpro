/**
 * Référentiel unique des tiers (CDC § 5.3, REF-RG-001 à 009 et 014 ; DD 5.3 à 5.6).
 * Une fiche par personne, quels que soient ses rôles ; le prospect devient client sur la même fiche (REF-RG-003).
 */
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Executant } from '../../db/pool.js';
import type { Acteur } from '../../noyau/acteur.js';
import { ErreurMetier, exiger, nonTrouve } from '../../noyau/erreurs.js';
import { journaliser } from '../../moteurs/audit.js';
import { attribuer } from '../../moteurs/numerotation.js';
import { entier } from '../../moteurs/parametres.js';

export const schemaTiers = z.object({
  nature: z.enum(['PHYSIQUE', 'MORALE']),
  nom: z.string().trim().min(1).max(120),
  prenoms: z.string().trim().max(160).optional(),
  date_naissance: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  sexe: z.enum(['M', 'F']).optional(),
  type_piece: z.string().trim().max(40).optional(),
  numero_piece: z.string().trim().max(60).optional(),
  telephone: z.string().regex(/^\+?\d{8,15}$/, 'Téléphone : 8 à 15 chiffres').optional(),
  courriel: z.string().email().max(120).optional(),
  adresse: z.string().max(300).optional(),
  langue_notification: z.string().max(5).default('fr'),
  canal_prefere: z.enum(['SMS', 'WHATSAPP', 'COURRIEL', 'APPLICATION', 'USSD', 'COURRIER']).default('SMS'),
  rccm: z.string().max(60).optional(),
  nif: z.string().max(40).optional(),
  dirigeant_tiers_id: z.string().uuid().optional(),
  pep: z.boolean().optional(),
}).superRefine((t, ctx) => {
  if (t.nature === 'PHYSIQUE' && (t.rccm || t.dirigeant_tiers_id)) ctx.addIssue({ code: 'custom', message: 'RCCM et dirigeant réservés aux personnes morales' });
  if (t.nature === 'MORALE' && (t.prenoms || t.date_naissance || t.sexe)) ctx.addIssue({ code: 'custom', message: 'Prénoms, date de naissance et sexe réservés aux personnes physiques' });
  if (t.type_piece && !t.numero_piece) ctx.addIssue({ code: 'custom', message: 'Numéro de pièce manquant' });
});
export type DonneesTiers = z.input<typeof schemaTiers>;

/** Normalisation pour la comparaison des noms : majuscules, sans accent ni ponctuation. */
export function normaliser(s?: string | null): string {
  return (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function distance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0]![j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return d[a.length]![b.length]!;
}

/** Ressemblance de 0 à 1 entre deux noms complets (ordre des mots indifférent). */
export function ressemblance(a: string, b: string): number {
  const x = normaliser(a).split(' ').sort().join(' '), y = normaliser(b).split(' ').sort().join(' ');
  if (!x || !y) return 0;
  return 1 - distance(x, y) / Math.max(x.length, y.length);
}

export interface Candidat { id: string; code_tiers: string; nom: string; prenoms: string | null; score: number; motifs: string[] }

/** Recherche de doublons avant création (REF-RG-002) : nom, date de naissance, téléphone, pièce d'identité. */
export async function rechercherDoublons(q: Executant, t: DonneesTiers): Promise<Candidat[]> {
  const nomComplet = `${t.nom} ${t.prenoms ?? ''}`;
  const premierMot = normaliser(t.nom).split(' ')[0] ?? '';
  const r = await q.query<{ id: string; code_tiers: string; nom: string; prenoms: string | null; date_naissance: string | null; telephone: string | null; type_piece: string | null; numero_piece: string | null }>(
    `SELECT id, code_tiers, nom, prenoms, date_naissance, telephone, type_piece, numero_piece FROM tiers
      WHERE supprime_le IS NULL AND statut = 'ACTIF' AND (
            (numero_piece IS NOT NULL AND upper(replace(numero_piece,' ','')) = upper(replace($1,' ','')))
         OR (telephone IS NOT NULL AND telephone = $2)
         OR (date_naissance IS NOT NULL AND date_naissance = $3)
         OR upper(nom) LIKE $4)
      LIMIT 200`,
    [t.numero_piece ?? '', t.telephone ?? '', t.date_naissance ?? null, `${premierMot.slice(0, 3)}%`]);
  const res: Candidat[] = [];
  for (const c of r.rows) {
    const motifs: string[] = [];
    let score = 0;
    if (t.numero_piece && c.numero_piece && normaliser(c.numero_piece).replace(/ /g, '') === normaliser(t.numero_piece).replace(/ /g, '')) { score = 100; motifs.push('Même pièce d\'identité'); }
    if (t.telephone && c.telephone === t.telephone) { score = Math.max(score, 95); motifs.push('Même téléphone'); }
    const sim = ressemblance(nomComplet, `${c.nom} ${c.prenoms ?? ''}`);
    if (t.date_naissance && c.date_naissance === t.date_naissance) {
      score = Math.max(score, Math.round(40 + 60 * sim));
      motifs.push('Même date de naissance');
    } else {
      score = Math.max(score, Math.round(70 * sim));
    }
    if (sim >= 0.8) motifs.push(`Nom proche (${Math.round(sim * 100)} %)`);
    if (score >= 50) res.push({ id: c.id, code_tiers: c.code_tiers, nom: c.nom, prenoms: c.prenoms, score, motifs });
  }
  return res.sort((a, b) => b.score - a.score);
}

/**
 * Crée une fiche tiers. Au-delà du seuil de ressemblance, la création est bloquée (CA-REF-01) sauf décision
 * motivée d'un gestionnaire habilité ; une pièce d'identité identique bloque toujours.
 */
export async function creerTiers(q: Executant, acteur: Acteur, donnees: DonneesTiers, decisionDoublon?: { motif: string }): Promise<string> {
  const t = schemaTiers.parse(donnees);
  const candidats = await rechercherDoublons(q, t);
  const seuil = await entier(q, 'TIERS_SEUIL_DOUBLON');
  const max = candidats[0]?.score ?? 0;
  if (max >= 100 && candidats[0]!.motifs.includes('Même pièce d\'identité')) {
    throw new ErreurMetier('TIERS_EXISTANT', 'Une fiche existe déjà avec cette pièce d\'identité', 409, { candidats: candidats.slice(0, 5) });
  }
  if (max >= seuil && !decisionDoublon?.motif?.trim()) {
    throw new ErreurMetier('DOUBLON_PROBABLE', 'Fiche(s) très proche(s) : création bloquée en attendant la décision d\'un gestionnaire', 409, { candidats: candidats.slice(0, 5) });
  }
  const id = randomUUID();
  const code = await attribuer(q, acteur, { type: 'TIERS' }, { type: 'tiers', id });
  await q.query(
    `INSERT INTO tiers (id, code_tiers, nature, nom, prenoms, date_naissance, sexe, type_piece, numero_piece, telephone, telephone_verifie,
                        courriel, adresse, langue_notification, canal_prefere, rccm, nif, dirigeant_tiers_id, pep, statut, score_doublon_max)
     VALUES ($19,$1,$2,$3,$4,$5,$6,$7,$8,$9,false,$10,$11,$12,$13,$14,$15,$16,$17,'ACTIF',$18)`,
    [code, t.nature, t.nom, t.prenoms ?? null, t.date_naissance ?? null, t.sexe ?? null,
      t.type_piece ?? null, t.numero_piece ?? null, t.telephone ?? null, t.courriel ?? null, t.adresse ?? null,
      t.langue_notification, t.canal_prefere, t.rccm ?? null, t.nif ?? null, t.dirigeant_tiers_id ?? null, t.pep ?? null, max || null, id])
    .catch(e => {
      if (e.code === '23505') throw new ErreurMetier('TIERS_EXISTANT', 'Une fiche existe déjà avec ce téléphone, cette pièce ou ces nom, prénoms et date de naissance', 409);
      throw e;
    });
  await journaliser(q, {
    ...acteur.trace(), action: 'CREATION', objetType: 'tiers', objetId: id,
    apres: { ...t, code_tiers: code, decision_doublon: decisionDoublon ?? null, score_doublon_max: max || null },
  });
  return id;
}

export async function lireTiers(q: Executant, id: string) {
  const r = await q.query('SELECT * FROM tiers WHERE id = $1 AND supprime_le IS NULL', [id]);
  if (!r.rows[0]) throw nonTrouve('Tiers');
  return r.rows[0];
}

/** REF-RG-001 : la nature n'est plus modifiable. */
export async function modifierTiers(q: Executant, acteur: Acteur, id: string, version: number, maj: Partial<DonneesTiers>) {
  const avant = await lireTiers(q, id);
  exiger(maj.nature === undefined || maj.nature === avant.nature, 'NATURE_FIGEE', 'La nature d\'un tiers n\'est pas modifiable après création');
  const champs = Object.entries(maj).filter(([k, v]) => k !== 'nature' && v !== undefined);
  exiger(champs.length, 'AUCUNE_MODIFICATION', 'Aucune modification');
  const autorises = new Set(['nom', 'prenoms', 'date_naissance', 'sexe', 'type_piece', 'numero_piece', 'telephone', 'courriel', 'adresse',
    'langue_notification', 'canal_prefere', 'rccm', 'nif', 'dirigeant_tiers_id', 'pep']);
  for (const [k] of champs) exiger(autorises.has(k), 'CHAMP_NON_MODIFIABLE', `Champ ${k} non modifiable`);
  const sets = champs.map(([k], i) => `${k} = $${i + 3}`);
  if (champs.some(([k]) => k === 'telephone')) sets.push('telephone_verifie = false');
  const r = await q.query(`UPDATE tiers SET ${sets.join(', ')} WHERE id = $1 AND version_ligne = $2 RETURNING *`, [id, version, ...champs.map(([, v]) => v)]);
  if (!r.rowCount) throw new ErreurMetier('CONFLIT_VERSION', 'La fiche a été modifiée entre-temps : rechargez-la', 409);
  await journaliser(q, {
    ...acteur.trace(), action: 'MODIFICATION', objetType: 'tiers', objetId: id,
    avant: Object.fromEntries(champs.map(([k]) => [k, avant[k]])), apres: Object.fromEntries(champs),
  });
  return r.rows[0];
}
