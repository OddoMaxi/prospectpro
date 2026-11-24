/** Base de test recréée à chaque exécution, puis migrée jusqu'à la dernière version. */
import pg from 'pg';
import { migrer } from '../src/db/migrer.js';

export const URL_ADMIN = process.env.TEST_ADMIN_URL ?? 'postgres://localhost:5432/postgres';
export const BASE_TEST = 'prospectpro_test';

export default async function setup() {
  const admin = new pg.Client({ connectionString: URL_ADMIN });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${BASE_TEST} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${BASE_TEST}`);
  await admin.end();
  const url = URL_ADMIN.replace(/\/[^/]*$/, `/${BASE_TEST}`);
  await migrer(url, 'up');
  process.env.DATABASE_URL = url;
}
