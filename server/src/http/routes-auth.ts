/** Routes d'authentification et profil de l'utilisateur connecté. */
import { Router } from 'express';
import { z } from 'zod';
import { getPool, transaction } from '../db/pool.js';
import { droitsEffectifs, profilsActifs } from '../modules/habilitations/droits.js';
import {
  confirmerEnrolementTotp, connecter, deconnecter, demarrerEnrolementTotp, Refus, verifierSecondFacteur, type ContexteAuth,
} from '../modules/auth/service.js';
import { authentifier } from './socle.js';

export function routesAuth(ctx: ContexteAuth): Router {
  const r = Router();
  const leverRefus = <T>(x: T | Refus): T => { if (x instanceof Refus) throw x.erreur; return x; };

  r.post('/connexion', async (req, res) => {
    const { identifiant, motDePasse } = z.object({ identifiant: z.string().min(1).max(80), motDePasse: z.string().min(1).max(200) }).parse(req.body);
    res.json(leverRefus(await transaction(null, q => connecter(q, ctx, req.acteur, identifiant.trim().toLowerCase(), motDePasse))));
  });

  r.post('/second-facteur', authentifier(ctx, ['SECOND_FACTEUR']), async (req, res) => {
    const { code } = z.object({ code: z.string().min(6).max(12) }).parse(req.body);
    res.json(leverRefus(await transaction(null, q => verifierSecondFacteur(q, ctx, req.acteur, req.session!, code))));
  });

  r.post('/totp/enrolement', authentifier(ctx, ['ENROLEMENT_TOTP', 'OUVERTE']), async (req, res) => {
    res.json(await transaction(req.acteur.utilisateurId, q => demarrerEnrolementTotp(q, ctx, req.session!)));
  });

  r.post('/totp/confirmation', authentifier(ctx, ['ENROLEMENT_TOTP', 'OUVERTE']), async (req, res) => {
    const { code } = z.object({ code: z.string().length(6) }).parse(req.body);
    res.json(await transaction(req.acteur.utilisateurId, q => confirmerEnrolementTotp(q, ctx, req.acteur, req.session!, code)));
  });

  r.post('/deconnexion', authentifier(ctx, ['SECOND_FACTEUR', 'ENROLEMENT_TOTP', 'OUVERTE']), async (req, res) => {
    await transaction(req.acteur.utilisateurId, q => deconnecter(q, req.acteur, req.session!));
    res.status(204).end();
  });

  /** Profil, droits et départements : l'interface construit le menu à partir de cette seule réponse. */
  r.get('/moi', authentifier(ctx), async (req, res) => {
    const id = req.acteur.utilisateurId!;
    const u = await getPool().query(
      `SELECT u.id, u.identifiant, u.type_compte, u.derniere_connexion, t.nom, t.prenoms, f.libelle AS fonction, s.libelle AS service, d.code AS departement
         FROM utilisateur u JOIN tiers t ON t.id = u.tiers_id
         LEFT JOIN fonction f ON f.id = u.fonction_id LEFT JOIN service s ON s.id = f.service_id LEFT JOIN departement d ON d.id = s.departement_id
        WHERE u.id = $1`, [id]);
    const droits = await droitsEffectifs(getPool(), id);
    res.json({
      ...u.rows[0],
      profils: (await profilsActifs(getPool(), id)).map(p => ({ code: p.code, perimetre: p.perimetre })),
      droits: [...new Set(droits.map(d => `${d.fonction}:${d.action}${d.niveau ? `:${d.niveau}` : ''}`))].sort(),
    });
  });

  return r;
}
