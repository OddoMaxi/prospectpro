/** B.5 : chaque migration a un « down » rejoué. Exécuté sur une base séparée. */
import { describe, expect, it } from 'vitest';
import pg from 'pg';
import { migrer } from '../src/db/migrer.js';

const ADMIN = process.env.TEST_ADMIN_URL ?? 'postgres://localhost:5432/postgres';
const URL = ADMIN.replace(/\/[^/]*$/, '/prospectpro_test_retour');

async function compterTables(): Promise<number> {
  const c = new pg.Client({ connectionString: URL });
  await c.connect();
  const r = await c.query(`SELECT count(*)::int n FROM information_schema.tables WHERE table_schema='public' AND table_name <> 'pgmigrations'`);
  await c.end();
  return r.rows[0].n;
}

describe('Migrations : aller et retour', () => {
  it('applique, annule puis réapplique toutes les migrations', async () => {
    const a = new pg.Client({ connectionString: ADMIN });
    await a.connect();
    await a.query('DROP DATABASE IF EXISTS prospectpro_test_retour WITH (FORCE)');
    await a.query('CREATE DATABASE prospectpro_test_retour');
    const montees = await migrer(URL, 'up');
    expect(await compterTables()).toBe(162);
    const descentes = await migrer(URL, 'down', montees.length);
    expect(descentes.length).toBe(montees.length);
    expect(await compterTables()).toBe(0);
    await migrer(URL, 'up');
    expect(await compterTables()).toBe(162);
    await a.query('DROP DATABASE prospectpro_test_retour WITH (FORCE)');
    await a.end();
  });
});
