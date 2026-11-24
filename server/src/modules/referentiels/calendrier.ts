/**
 * Jours fériés et jours ouvrables (CDC § 5.6). Les délais exprimés en jours ouvrables (réclamations, sinistres)
 * excluent samedis, dimanches et jours fériés enregistrés. Les fêtes mobiles sont saisies chaque année.
 */
import type { Executant } from '../../db/pool.js';
import type { Acteur } from '../../noyau/acteur.js';
import { ErreurMetier, exiger } from '../../noyau/erreurs.js';
import { ajouterJours, dateValide } from '../../noyau/dates.js';
import { journaliser } from '../../moteurs/audit.js';

export async function ajouterJourFerie(q: Executant, acteur: Acteur, d: { date: string; libelle: string }) {
  exiger(dateValide(d.date), 'DATE_INVALIDE', 'Date invalide');
  exiger(d.libelle?.trim(), 'LIBELLE_REQUIS', 'Libellé obligatoire');
  const r = await q.query<{ id: string }>('INSERT INTO jour_ferie (date, libelle) VALUES ($1,$2) RETURNING id', [d.date, d.libelle.trim()])
    .catch(e => { if (e.code === '23505') throw new ErreurMetier('JOUR_DEJA_FERIE', 'Ce jour est déjà enregistré comme férié', 409); throw e; });
  await journaliser(q, { ...acteur.trace(), action: 'PARAMETRAGE', objetType: 'jour_ferie', objetId: r.rows[0]!.id, apres: d });
  return r.rows[0]!.id;
}

/** Retrait logique (suppression physique interdite) : un jour saisi par erreur redevient ouvrable. */
export async function retirerJourFerie(q: Executant, acteur: Acteur, id: string, motif: string) {
  exiger(motif?.trim(), 'MOTIF_REQUIS', 'Motif obligatoire');
  const r = await q.query('UPDATE jour_ferie SET supprime_le = now() WHERE id = $1 AND supprime_le IS NULL', [id]);
  exiger(r.rowCount, 'NON_TROUVE', 'Jour férié introuvable', 404);
  await journaliser(q, { ...acteur.trace(), action: 'SUPPRESSION', objetType: 'jour_ferie', objetId: id, apres: { motif } });
}

export async function joursFeries(q: Executant, annee: number) {
  return (await q.query('SELECT id, date, libelle FROM jour_ferie WHERE supprime_le IS NULL AND extract(year FROM date) = $1 ORDER BY date', [annee])).rows;
}

async function feries(q: Executant, de: string, a: string): Promise<Set<string>> {
  const r = await q.query<{ date: string }>('SELECT date FROM jour_ferie WHERE supprime_le IS NULL AND date BETWEEN $1 AND $2', [de, a]);
  return new Set(r.rows.map(x => String(x.date).slice(0, 10)));
}

const weekEnd = (date: string) => [0, 6].includes(new Date(`${date}T00:00:00Z`).getUTCDay());

export async function estOuvrable(q: Executant, date: string): Promise<boolean> {
  return !weekEnd(date) && !(await feries(q, date, date)).has(date);
}

/** Date atteinte après n jours ouvrables comptés à partir du lendemain de `date`. */
export async function ajouterJoursOuvrables(q: Executant, date: string, n: number): Promise<string> {
  exiger(n >= 0, 'DUREE_INVALIDE', 'Nombre de jours négatif');
  const f = await feries(q, date, ajouterJours(date, n * 2 + 30));
  let d = date, restants = n;
  while (restants > 0) {
    d = ajouterJours(d, 1);
    if (!weekEnd(d) && !f.has(d)) restants--;
  }
  return d;
}
