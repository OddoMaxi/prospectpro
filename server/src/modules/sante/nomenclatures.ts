/**
 * Nomenclatures de santé (CDC § 5.6 ; DD 5.14, 5.15) : actes médicaux codifiés et liste des médicaments couverts,
 * tenues par le service santé et le médecin-conseil ; chaque modification est tracée. Un code n'est jamais réutilisé :
 * un acte ou un médicament retiré est désactivé.
 */
import type { Executant } from '../../db/pool.js';
import type { Acteur } from '../../noyau/acteur.js';
import { ErreurMetier, exiger, nonTrouve } from '../../noyau/erreurs.js';
import { journaliser } from '../../moteurs/audit.js';

const TYPES_GARANTIE = ['FRAIS_SOINS', 'INCAPACITE_TEMPORAIRE', 'INCAPACITE_PERMANENTE', 'DECES', 'FRAIS_FUNERAIRES', 'TELECONSULTATION', 'AUTRE'];
export const FAMILLES_ACTE = ['CONSULTATION', 'ANALYSE', 'IMAGERIE', 'HOSPITALISATION', 'CHIRURGIE', 'DENTAIRE', 'OPTIQUE', 'KINESITHERAPIE', 'MATERNITE', 'TELECONSULTATION', 'AUTRE'];

export async function enregistrerActe(q: Executant, acteur: Acteur, d: { code: string; libelle: string; famille: string; specialite?: string | null; garantieType?: string; actif?: boolean }) {
  const code = d.code.trim().toUpperCase();
  exiger(/^[A-Z0-9._-]{2,20}$/.test(code), 'CODE_INVALIDE', 'Code d\'acte : 2 à 20 lettres, chiffres, points ou tirets');
  exiger(d.libelle?.trim(), 'LIBELLE_REQUIS', 'Libellé obligatoire');
  exiger(FAMILLES_ACTE.includes(d.famille), 'FAMILLE_INVALIDE', 'Famille d\'acte inconnue');
  const garantie = d.garantieType ?? (d.famille === 'TELECONSULTATION' ? 'TELECONSULTATION' : 'FRAIS_SOINS');
  exiger(TYPES_GARANTIE.includes(garantie), 'GARANTIE_INVALIDE', 'Type de garantie inconnu');
  const avant = (await q.query('SELECT * FROM nomenclature_acte WHERE code = $1', [code])).rows[0];
  await q.query(
    `INSERT INTO nomenclature_acte (code, libelle, famille, specialite, garantie_type, actif) VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (code) DO UPDATE SET libelle = EXCLUDED.libelle, famille = EXCLUDED.famille, specialite = EXCLUDED.specialite, garantie_type = EXCLUDED.garantie_type, actif = EXCLUDED.actif`,
    [code, d.libelle.trim(), d.famille, d.specialite ?? null, garantie, d.actif ?? true]);
  await journaliser(q, { ...acteur.trace(), action: avant ? 'MODIFICATION' : 'CREATION', objetType: 'nomenclature_acte', objetId: null, avant: avant ?? undefined, apres: { ...d, code } });
  return code;
}

export async function listerActes(q: Executant, f: { recherche?: string; famille?: string; actifs?: boolean } = {}) {
  return (await q.query(
    `SELECT code, libelle, famille, specialite, garantie_type, actif FROM nomenclature_acte
      WHERE supprime_le IS NULL AND ($1::text IS NULL OR code ILIKE $1 || '%' OR libelle ILIKE '%' || $1 || '%') AND ($2::text IS NULL OR famille = $2) AND (NOT $3 OR actif)
      ORDER BY famille, code LIMIT 500`, [f.recherche ?? null, f.famille ?? null, f.actifs ?? false])).rows;
}

export async function enregistrerMedicament(q: Executant, acteur: Acteur, d: { code: string; denomination: string; dci: string; generique: boolean; couvert: boolean; quantiteMaxOrdonnance?: number | null }) {
  const code = d.code.trim().toUpperCase();
  exiger(/^[A-Z0-9._-]{2,20}$/.test(code), 'CODE_INVALIDE', 'Code du médicament : 2 à 20 lettres, chiffres, points ou tirets');
  exiger(d.denomination?.trim() && d.dci?.trim(), 'CHAMPS_REQUIS', 'Dénomination et DCI obligatoires');
  if (d.quantiteMaxOrdonnance !== undefined && d.quantiteMaxOrdonnance !== null) exiger(Number.isInteger(d.quantiteMaxOrdonnance) && d.quantiteMaxOrdonnance > 0, 'QUANTITE_INVALIDE', 'Quantité maximale invalide');
  const avant = (await q.query('SELECT * FROM medicament WHERE code = $1', [code])).rows[0];
  const r = await q.query<{ id: string }>(
    `INSERT INTO medicament (code, denomination, dci, generique, couvert, quantite_max_ordonnance) VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (code) DO UPDATE SET denomination = EXCLUDED.denomination, dci = EXCLUDED.dci, generique = EXCLUDED.generique, couvert = EXCLUDED.couvert,
       quantite_max_ordonnance = EXCLUDED.quantite_max_ordonnance RETURNING id`,
    [code, d.denomination.trim(), d.dci.trim(), d.generique, d.couvert, d.quantiteMaxOrdonnance ?? null]);
  await journaliser(q, { ...acteur.trace(), action: avant ? 'MODIFICATION' : 'CREATION', objetType: 'medicament', objetId: r.rows[0]!.id, avant: avant ?? undefined, apres: { ...d, code } });
  return r.rows[0]!.id;
}

export async function listerMedicaments(q: Executant, f: { recherche?: string; couverts?: boolean } = {}) {
  return (await q.query(
    `SELECT id, code, denomination, dci, generique, couvert, quantite_max_ordonnance FROM medicament
      WHERE supprime_le IS NULL AND ($1::text IS NULL OR code ILIKE $1 || '%' OR denomination ILIKE '%' || $1 || '%' OR dci ILIKE '%' || $1 || '%') AND (NOT $2 OR couvert)
      ORDER BY denomination LIMIT 500`, [f.recherche ?? null, f.couverts ?? false])).rows;
}

/** Import d'une liste (CSV « code;libellé;famille;spécialité » ou « code;dénomination;dci;générique;couvert;quantité ») : ligne par ligne, erreurs rapportées. */
export async function importer(q: Executant, acteur: Acteur, nature: 'ACTES' | 'MEDICAMENTS', contenu: string) {
  const res = { importees: 0, erreurs: [] as string[] };
  const lignes = contenu.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  for (const [i, l] of lignes.entries()) {
    const c = l.split(/[;\t]/).map(x => x.trim().replace(/^"|"$/g, ''));
    if (i === 0 && /code/i.test(c[0] ?? '')) continue;
    try {
      await q.query('SAVEPOINT ligne');
      if (nature === 'ACTES') await enregistrerActe(q, acteur, { code: c[0] ?? '', libelle: c[1] ?? '', famille: (c[2] ?? '').toUpperCase(), specialite: c[3] || null });
      else await enregistrerMedicament(q, acteur, { code: c[0] ?? '', denomination: c[1] ?? '', dci: c[2] ?? '', generique: /^(o|oui|1|true)$/i.test(c[3] ?? ''), couvert: !/^(n|non|0|false)$/i.test(c[4] ?? ''), quantiteMaxOrdonnance: c[5] ? Number(c[5]) : null });
      await q.query('RELEASE SAVEPOINT ligne');
      res.importees++;
    } catch (e) {
      await q.query('ROLLBACK TO SAVEPOINT ligne');
      res.erreurs.push(`Ligne ${i + 1} : ${e instanceof ErreurMetier ? e.message : (e as Error).message}`);
    }
  }
  exiger(res.importees || res.erreurs.length, 'FICHIER_VIDE', 'Fichier vide');
  return res;
}

export async function lireActe(q: Executant, code: string) {
  const r = (await q.query('SELECT * FROM nomenclature_acte WHERE code = $1', [code])).rows[0];
  if (!r) throw nonTrouve('Acte');
  return r;
}
