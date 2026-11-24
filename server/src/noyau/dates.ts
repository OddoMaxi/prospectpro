/** Dates civiles au format AAAA-MM-JJ (fuseau de la Guinée : UTC, sans heure d'été). */

export const aujourdhui = (): string => new Date().toISOString().slice(0, 10);

export function ajouterJours(date: string, jours: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + jours);
  return d.toISOString().slice(0, 10);
}

/** Même jour, n années plus tard (un 29 février devient le 28 février d'une année non bissextile). */
export function ajouterAnnees(date: string, annees: number): string {
  const [a, m, j] = date.split('-').map(Number) as [number, number, number];
  const fin = new Date(Date.UTC(a + annees, m, 0)).getUTCDate();
  return `${a + annees}-${String(m).padStart(2, '0')}-${String(Math.min(j, fin)).padStart(2, '0')}`;
}

/** Âge révolu à une date. */
export function age(dateNaissance: string, date: string): number {
  const [an, mn, jn] = dateNaissance.split('-').map(Number) as [number, number, number];
  const [a, m, j] = date.split('-').map(Number) as [number, number, number];
  return a - an - (m < mn || (m === mn && j < jn) ? 1 : 0);
}

export const dateValide = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
