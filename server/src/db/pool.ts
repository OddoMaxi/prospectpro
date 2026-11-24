/**
 * Accès à PostgreSQL. Toute écriture passe par `transaction()`, qui déclare l'utilisateur courant
 * (colonnes techniques cree_par / modifie_par renseignées par déclencheur, DD § 2.4).
 */
import pg from 'pg';

// MONTANT = bigint (DD § 2.2) : les montants GNF tiennent dans un Number sans perte (< 2^53).
pg.types.setTypeParser(20, v => {
  const n = Number(v);
  if (!Number.isSafeInteger(n)) throw new Error(`Entier hors capacité : ${v}`);
  return n;
});
// DATE : renvoyée telle quelle (AAAA-MM-JJ), sans conversion de fuseau.
pg.types.setTypeParser(1082, v => v);

export type Executant = Pick<pg.PoolClient, 'query'>;

let pool: pg.Pool | undefined;

export function initialiserPool(databaseUrl: string): pg.Pool {
  pool = new pg.Pool({ connectionString: databaseUrl, max: 20 });
  return pool;
}

export function getPool(): pg.Pool {
  if (!pool) throw new Error('Pool PostgreSQL non initialisé');
  return pool;
}

export async function fermerPool(): Promise<void> {
  await pool?.end();
  pool = undefined;
}

/** Exécute `fn` dans une transaction ; l'utilisateur est visible des déclencheurs via app.utilisateur_id. */
export async function transaction<T>(utilisateurId: string | null, fn: (q: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    if (utilisateurId) await client.query(`SELECT set_config('app.utilisateur_id', $1, true)`, [utilisateurId]);
    const r = await fn(client);
    await client.query('COMMIT');
    return r;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}

export async function lire<T extends pg.QueryResultRow>(sql: string, params: unknown[] = [], q: Executant = getPool()): Promise<T[]> {
  return (await q.query<T>(sql, params)).rows;
}

export async function lireUn<T extends pg.QueryResultRow>(sql: string, params: unknown[] = [], q: Executant = getPool()): Promise<T | undefined> {
  return (await q.query<T>(sql, params)).rows[0];
}
