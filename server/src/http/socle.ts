/**
 * Socle HTTP : contexte de requête, authentification, contrôle des droits côté serveur (ORG-RG-040), erreurs.
 * L'interface n'est jamais la seule barrière : chaque route déclare le droit exigé.
 */
import type { NextFunction, Request, Response } from 'express';
import type pg from 'pg';
import { ZodError } from 'zod';
import { getPool, transaction } from '../db/pool.js';
import { Acteur } from '../noyau/acteur.js';
import { ErreurMetier } from '../noyau/erreurs.js';
import { controlerDroit, type Action, type Perimetre } from '../modules/habilitations/droits.js';
import { verifierJeton, type ContexteAuth, type Etape, type JetonSession } from '../modules/auth/service.js';

declare module 'express-serve-static-core' {
  interface Request {
    session?: JetonSession;
    acteur: Acteur;
    perimetre?: Perimetre | null;
  }
}

export function contexte(req: Request, _res: Response, next: NextFunction) {
  req.acteur = new Acteur(null, req.ip ?? null, req.get('user-agent') ?? null);
  next();
}

/** Exige un jeton valide à l'étape demandée (session ouverte par défaut). */
export function authentifier(ctx: ContexteAuth, etapes: Etape[] = ['OUVERTE']) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const h = req.get('authorization');
    if (!h?.startsWith('Bearer ')) return next(new ErreurMetier('NON_AUTHENTIFIE', 'Authentification requise', 401));
    const s = await verifierJeton(getPool(), ctx, h.slice(7));
    if (!etapes.includes(s.etape)) return next(new ErreurMetier('SESSION_INCOMPLETE', 'Authentification à terminer', 401));
    req.session = s;
    req.acteur = new Acteur(s.uid, req.ip ?? null, req.get('user-agent') ?? null);
    next();
  };
}

/** Contrôle d'un droit ; le périmètre autorisé est placé dans req.perimetre pour filtrer les données. */
export function droit(fonction: string, action: Action) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    req.perimetre = await controlerDroit(getPool(), req.acteur.utilisateurId!, fonction, action);
    next();
  };
}

/** Exécute une écriture dans une transaction au nom de l'utilisateur. */
export function ecrire<T>(req: Request, fn: (q: pg.PoolClient) => Promise<T>): Promise<T> {
  return transaction(req.acteur.utilisateurId, fn);
}

export function gestionErreurs(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ErreurMetier) {
    res.status(err.statut).json({ code: err.code, message: err.message, details: err.details });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({ code: 'DONNEES_INVALIDES', message: 'Données invalides', details: err.issues.map(i => ({ champ: i.path.join('.'), message: i.message })) });
    return;
  }
  const e = err as { code?: string; message?: string };
  if (e.code === '23505') { res.status(409).json({ code: 'DOUBLON', message: 'Cette valeur existe déjà' }); return; }
  if (e.code === '23503') { res.status(422).json({ code: 'REFERENCE_INVALIDE', message: 'Référence inconnue' }); return; }
  if (e.code === '23514' || e.code === 'P0001') { res.status(422).json({ code: 'CONTRAINTE', message: e.message }); return; }
  console.error('[erreur]', e.message); // jamais de données métier dans les traces
  res.status(500).json({ code: 'ERREUR_INTERNE', message: 'Erreur interne' });
}
