/**
 * Exercices, périodes et date comptable (CDC § 11.3, 11.16 ; FIN-RG-071, 072, 041).
 * Deux exercices ouverts au plus ; une période clôturée ne reçoit plus rien : l'écriture est datée du premier jour
 * ouvert suivant, avec mention de sa date d'origine.
 */
import type { Executant } from '../../db/pool.js';
import type { Acteur } from '../../noyau/acteur.js';
import { ErreurMetier, exiger } from '../../noyau/erreurs.js';
import { aujourdhui, dateValide } from '../../noyau/dates.js';
import { journaliser } from '../../moteurs/audit.js';
import { entier } from '../../moteurs/parametres.js';

export async function creerExercice(q: Executant, acteur: Acteur, d: { code: string; dateDebut: string; dateFin: string }): Promise<string> {
  exiger(/^\d{4}$/.test(d.code), 'CODE_INVALIDE', 'Code d\'exercice : l\'année (AAAA)');
  exiger(dateValide(d.dateDebut) && dateValide(d.dateFin) && d.dateFin > d.dateDebut, 'DATES_INVALIDES', 'Dates de l\'exercice invalides');
  const ouverts = (await q.query<{ n: number }>(`SELECT count(*)::int n FROM exercice WHERE statut = 'OUVERT' AND supprime_le IS NULL`)).rows[0]!.n;
  const max = await entier(q, 'FIN_EXERCICES_OUVERTS_MAX');
  exiger(ouverts < max, 'EXERCICES_OUVERTS_MAX', `${max} exercices ouverts au plus (FIN-RG-071)`);
  const chevauche = await q.query('SELECT 1 FROM exercice WHERE supprime_le IS NULL AND date_debut <= $2 AND date_fin >= $1', [d.dateDebut, d.dateFin]);
  exiger(!chevauche.rowCount, 'EXERCICES_CHEVAUCHANTS', 'Cet exercice chevauche un exercice existant');
  const r = await q.query<{ id: string }>(`INSERT INTO exercice (code, date_debut, date_fin, statut) VALUES ($1,$2,$3,'OUVERT') RETURNING id`, [d.code, d.dateDebut, d.dateFin]);
  const id = r.rows[0]!.id;
  // Périodes mensuelles couvrant l'exercice (un premier exercice peut ne pas compter 12 mois)
  await q.query(
    `INSERT INTO periode (exercice_id, mois, statut)
     SELECT $1, to_char(m, 'YYYY-MM'), 'OUVERTE' FROM generate_series(date_trunc('month', $2::date), $3::date, interval '1 month') m`, [id, d.dateDebut, d.dateFin]);
  await journaliser(q, { ...acteur.trace(), action: 'PARAMETRAGE', objetType: 'exercice', objetId: id, apres: d });
  return id;
}

export interface DateComptable { date: string; origine: string | null; exercice: string; exerciceId: string }

/**
 * Date comptable d'une opération du jour `date` (FIN-RG-041, 072) : la date elle-même si sa période est ouverte,
 * sinon le premier jour de la période ouverte suivante (date d'origine conservée).
 */
export async function dateComptable(q: Executant, date = aujourdhui()): Promise<DateComptable> {
  const r = await q.query<{ mois: string; statut: string; code: string; id: string; date_debut: string; date_fin: string }>(
    `SELECT p.mois, p.statut, e.code, e.id, e.date_debut::text, e.date_fin::text FROM periode p JOIN exercice e ON e.id = p.exercice_id
      WHERE e.statut = 'OUVERT' AND e.supprime_le IS NULL AND p.supprime_le IS NULL AND p.mois >= to_char($1::date, 'YYYY-MM')
      ORDER BY p.mois`, [date]);
  const courante = r.rows.find(p => p.mois === date.slice(0, 7));
  if (courante && courante.statut === 'OUVERTE' && date >= courante.date_debut && date <= courante.date_fin) {
    return { date, origine: null, exercice: courante.code, exerciceId: courante.id };
  }
  const suivante = r.rows.find(p => p.statut === 'OUVERTE' && p.mois > date.slice(0, 7));
  if (!suivante) throw new ErreurMetier('EXERCICE_FERME', `Aucun exercice ni période ouverts pour le ${date} : ouvrir l'exercice (FIN-RG-071)`, 422);
  const premier = `${suivante.mois}-01` < suivante.date_debut ? suivante.date_debut : `${suivante.mois}-01`;
  return { date: premier, origine: date, exercice: suivante.code, exerciceId: suivante.id };
}

export async function listerExercices(q: Executant) {
  return (await q.query(
    `SELECT e.id, e.code, e.date_debut, e.date_fin, e.statut,
            COALESCE(json_agg(json_build_object('mois', p.mois, 'statut', p.statut) ORDER BY p.mois) FILTER (WHERE p.id IS NOT NULL), '[]') AS periodes
       FROM exercice e LEFT JOIN periode p ON p.exercice_id = e.id AND p.supprime_le IS NULL
      WHERE e.supprime_le IS NULL GROUP BY e.id ORDER BY e.code DESC`)).rows;
}
