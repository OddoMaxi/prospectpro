/** Environnement commun aux tests. */
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chargerConfig } from '../src/config.js';

export const URL_TEST = (process.env.TEST_ADMIN_URL ?? 'postgres://localhost:5432/postgres').replace(/\/[^/]*$/, '/prospectpro_test');

export const STOCKAGE_TEST = join(tmpdir(), `prospectpro-test-${process.pid}`);

export function configTest() {
  return chargerConfig({
    NODE_ENV: 'test',
    DATABASE_URL: URL_TEST,
    JWT_SECRET: randomBytes(32).toString('hex'),
    CLE_MAITRESSE_LOCALE: randomBytes(32).toString('hex'),
    STOCKAGE_DIR: STOCKAGE_TEST,
    ORDONNANCEUR_ACTIF: 'NON',
  });
}
