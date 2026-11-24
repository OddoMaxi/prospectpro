/** Application des migrations versionnées (node-pg-migrate). Chaque migration a son « down ». */
import { fileURLToPath } from 'node:url';
import { runner } from 'node-pg-migrate';

export const DOSSIER_MIGRATIONS = fileURLToPath(new URL('../../migrations', import.meta.url));

export async function migrer(databaseUrl: string, direction: 'up' | 'down' = 'up', count?: number): Promise<string[]> {
  const faites = await runner({
    databaseUrl,
    dir: DOSSIER_MIGRATIONS,
    direction,
    count: count ?? (direction === 'up' ? Infinity : 1),
    migrationsTable: 'pgmigrations',
    singleTransaction: true,
    log: () => undefined,
  });
  return faites.map(m => m.name);
}
