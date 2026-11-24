/** Application HTTP du serveur cible. */
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import express from 'express';
import type { Config } from './config.js';
import { GardienLocal, GardienVault, MoteurChiffrement } from './moteurs/chiffrement.js';
import type { ContexteAuth } from './modules/auth/service.js';
import { authentifier, contexte, gestionErreurs } from './http/socle.js';
import { routesAuth } from './http/routes-auth.js';
import { routesAdministration } from './http/routes-administration.js';
import { routesReferentiels } from './http/routes-referentiels.js';
import { routesCatalogue } from './http/routes-catalogue.js';
import { routesSocle } from './http/routes-socle.js';
import { routesComptabilite } from './http/routes-comptabilite.js';
import { routesCommercial } from './http/routes-commercial.js';
import { routesProduction } from './http/routes-production.js';
import { configurerStockage, StockageLocal } from './moteurs/documents.js';
// Enregistrement des opérations soumises à validation
import './modules/parametrage/service.js';
import './modules/referentiels/societe.js';
import './modules/referentiels/coordonnees.js';
import './modules/catalogue/service.js';
import './modules/comptabilite/schemas.js';
import './modules/comptabilite/moteur.js';
import './modules/commercial/intervenants.js';
import './modules/commercial/comptesProduction.js';
import './modules/production/emission.js';

export function creerApplication(config: Config) {
  const gardien = config.VAULT_ADDR && config.VAULT_TOKEN
    ? new GardienVault(config.VAULT_ADDR, config.VAULT_TOKEN)
    : new GardienLocal(Buffer.from(config.CLE_MAITRESSE_LOCALE!, 'hex'));
  const ctx: ContexteAuth = { jwtSecret: config.JWT_SECRET, chiffrement: new MoteurChiffrement(gardien), dispenseSecondFacteur: new Set(config.SECOND_FACTEUR_DISPENSE) };
  configurerStockage(new StockageLocal(config.STOCKAGE_DIR));

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
  app.use('/api', authentifier(ctx), routesReferentiels(ctx), routesCatalogue(), routesSocle(), routesComptabilite(), routesCommercial(), routesProduction());
  app.use('/api', (_req, res) => { res.status(404).json({ code: 'NON_TROUVE', message: 'Route inconnue' }); });
  // Interface (application monopage) : fichiers statiques, puis page d'entrée pour toute autre adresse hors /api
  const web = resolve(config.WEB_DIR);
  if (existsSync(join(web, 'index.html'))) {
    app.use(express.static(web, { index: false, maxAge: '1h' }));
    app.get(/^(?!\/api\/).*/, (_req, res) => { res.set('Cache-Control', 'no-cache').sendFile(join(web, 'index.html')); });
  }
  app.use(gestionErreurs);
  return { app, ctx };
}
