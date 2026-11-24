/** Application HTTP du serveur cible. */
import express from 'express';
import type { Config } from './config.js';
import { GardienLocal, GardienVault, MoteurChiffrement } from './moteurs/chiffrement.js';
import type { ContexteAuth } from './modules/auth/service.js';
import { authentifier, contexte, gestionErreurs } from './http/socle.js';
import { routesAuth } from './http/routes-auth.js';
import { routesAdministration } from './http/routes-administration.js';
import { routesReferentiels } from './http/routes-referentiels.js';
import './modules/parametrage/service.js'; // enregistre les opérations de paramétrage

export function creerApplication(config: Config) {
  const gardien = config.VAULT_ADDR && config.VAULT_TOKEN
    ? new GardienVault(config.VAULT_ADDR, config.VAULT_TOKEN)
    : new GardienLocal(Buffer.from(config.CLE_MAITRESSE_LOCALE!, 'hex'));
  const ctx: ContexteAuth = { jwtSecret: config.JWT_SECRET, chiffrement: new MoteurChiffrement(gardien) };

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '1mb' }));
  app.use((_req, res, next) => {
    res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store' });
    next();
  });
  app.use(contexte);

  app.get('/api/sante', (_req, res) => { res.json({ statut: 'ok', version: '3.0.0-lot1' }); });
  app.use('/api/auth', routesAuth(ctx));
  app.use('/api/admin', authentifier(ctx), routesAdministration());
  app.use('/api', authentifier(ctx), routesReferentiels());
  app.use('/api', (_req, res) => { res.status(404).json({ code: 'NON_TROUVE', message: 'Route inconnue' }); });
  app.use(gestionErreurs);
  return { app, ctx };
}
