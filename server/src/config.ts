/**
 * Configuration lue dans l'environnement et validée au démarrage.
 * Le serveur refuse de démarrer si un secret manque ou garde une valeur d'exemple (sous-lot 1.0).
 */
import { z } from 'zod';

const secret = (nom: string) =>
  z.string({ error: `${nom} manquant` })
    .min(32, `${nom} : 32 caractères au moins`)
    .refine(v => !/change|exemple|remplacer|secret_/i.test(v), `${nom} : valeur d'exemple refusée`);

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'recette', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: secret('JWT_SECRET'),
  /** Durée de validité du jeton de session, en minutes */
  SESSION_MINUTES: z.coerce.number().int().positive().default(480),
  /** Clé maîtresse locale du chiffrement par enveloppe, 32 octets en hexadécimal.
   * Développement et tests uniquement : en recette et en production, les clés sont dans Vault (partie G). */
  CLE_MAITRESSE_LOCALE: z.string().regex(/^[0-9a-f]{64}$/i).optional(),
  VAULT_ADDR: z.string().url().optional(),
  VAULT_TOKEN: z.string().optional(),
});

export type Config = z.infer<typeof schema>;

export function chargerConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const r = schema.safeParse(env);
  if (!r.success) {
    const details = r.error.issues.map(i => `- ${i.path.join('.')} : ${i.message}`).join('\n');
    throw new Error(`Configuration invalide, démarrage refusé :\n${details}`);
  }
  const c = r.data;
  if ((c.NODE_ENV === 'production' || c.NODE_ENV === 'recette') && !(c.VAULT_ADDR && c.VAULT_TOKEN)) {
    throw new Error('Configuration invalide : VAULT_ADDR et VAULT_TOKEN sont obligatoires en recette et en production.');
  }
  if (c.NODE_ENV !== 'production' && c.NODE_ENV !== 'recette' && !c.CLE_MAITRESSE_LOCALE && !c.VAULT_ADDR) {
    throw new Error('Configuration invalide : CLE_MAITRESSE_LOCALE ou VAULT_ADDR requis.');
  }
  return c;
}
