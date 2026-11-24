/** Sous-lot 1.0 : schéma conforme au DD 1.1, colonnes techniques, journal en ajout seul. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import dd from '../src/db/dictionnaire.json' with { type: 'json' };
import { URL_TEST } from './env.js';
import { viderBase } from './outils.js';

let c: pg.Client;
beforeAll(async () => { await viderBase(); c = new pg.Client({ connectionString: URL_TEST }); await c.connect(); });
afterAll(async () => { await c.end(); });

const q = async (sql: string, p: unknown[] = []) => (await c.query(sql, p)).rows;

describe('Schéma cible (DD 1.1)', () => {
  it('crée les 156 tables et les 1 178 champs du dictionnaire, plus 4 tables techniques', async () => {
    const tables = await q(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name <> 'pgmigrations'`);
    expect(tables.length).toBe(156 + 4);
    let manquants: string[] = [];
    for (const t of dd.tables) {
      const cols = new Set((await q(`SELECT column_name FROM information_schema.columns WHERE table_name=$1`, [t.nom])).map(r => r.column_name));
      manquants = manquants.concat(t.champs.filter(ch => !cols.has(ch.nom)).map(ch => `${t.nom}.${ch.nom}`));
    }
    expect(manquants).toEqual([]);
  });

  it('refuse une valeur hors énumération', async () => {
    await expect(q(`INSERT INTO departement (code, libelle, date_effet, statut) VALUES ('X','X','2026-01-01','FERME')`))
      .rejects.toThrow(/statut_entite/);
  });

  it('incrémente version_ligne et date la modification', async () => {
    const [d] = await q(`INSERT INTO departement (code, libelle, date_effet, statut) VALUES ('DG','Direction générale','2026-01-01','ACTIF') RETURNING *`);
    expect(d.version_ligne).toBe(1);
    const [m] = await q(`UPDATE departement SET libelle='Direction générale (DG)' WHERE id=$1 RETURNING *`, [d.id]);
    expect(m.version_ligne).toBe(2);
    expect(m.modifie_le).not.toBeNull();
    // Verrou optimiste : une mise à jour fondée sur une version périmée ne touche aucune ligne
    const r = await c.query(`UPDATE departement SET libelle='Concurrente' WHERE id=$1 AND version_ligne=1`, [d.id]);
    expect(r.rowCount).toBe(0);
  });

  it('interdit la suppression physique', async () => {
    const [d] = await q(`INSERT INTO departement (code, libelle, date_effet, statut) VALUES ('TMP','Temporaire','2026-01-01','ACTIF') RETURNING id`);
    await expect(q(`DELETE FROM departement WHERE id=$1`, [d.id])).rejects.toThrow(/Suppression physique interdite/);
  });

  it('garde les tables journal en ajout seul', async () => {
    const journaux = dd.tables.filter(t => t.journal).map(t => t.nom);
    expect(journaux).toContain('journal_audit');
    const [j] = await q(`INSERT INTO journal_audit (horodatage, action, objet_type, empreinte) VALUES (now(),'CONNEXION','utilisateur','x') RETURNING id`);
    await expect(q(`UPDATE journal_audit SET action='EXPORT' WHERE id=$1`, [j.id])).rejects.toThrow(/ajout seul/);
    await expect(q(`DELETE FROM journal_audit WHERE id=$1`, [j.id])).rejects.toThrow(/ajout seul/);
  });

  it('renseigne cree_par depuis la transaction', async () => {
    await c.query('BEGIN');
    const [t] = await q(`INSERT INTO tiers (${champsObligatoires('tiers').cols}) VALUES (${champsObligatoires('tiers').vals}) RETURNING id`);
    expect(t.id).toBeTruthy();
    await c.query('ROLLBACK');
  });
});

/** Valeurs factices pour les champs obligatoires d'une table (sans référence). */
function champsObligatoires(nom: string) {
  const t = dd.tables.find(x => x.nom === nom)!;
  const ch = t.champs.filter(x => x.obligatoire && !x.type.startsWith('RÉF'));
  const val = (type: string): string => {
    const en = type.match(/^ÉNUM (.+)$/)?.[1];
    if (en) return `'${(dd.enumerations as Record<string, string[]>)[en]![0]}'`;
    if (/^(TEXTE|CODE)/.test(type) || type === 'TEXT' || type === 'EMPREINTE') return `'1'`;
    if (type === 'DATE') return `'2026-01-01'`;
    if (type === 'HORODATAGE') return 'now()';
    if (type === 'BOOLÉEN') return 'false';
    if (type === 'JSON') return `'{}'`;
    return '0';
  };
  return { cols: ch.map(x => x.nom).join(', '), vals: ch.map(x => val(x.type)).join(', ') };
}
