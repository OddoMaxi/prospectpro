/** Environnement commun aux tests. */
import { randomBytes } from 'node:crypto';
import { chargerConfig } from '../src/config.js';

export const URL_TEST = (process.env.TEST_ADMIN_URL ?? 'postgres://localhost:5432/postgres').replace(/\/[^/]*$/, '/prospectpro_test');

export function configTest() {
  return chargerConfig({
    NODE_ENV: 'test',
    DATABASE_URL: URL_TEST,
    JWT_SECRET: randomBytes(32).toString('hex'),
    CLE_MAITRESSE_LOCALE: randomBytes(32).toString('hex'),
  });
}
