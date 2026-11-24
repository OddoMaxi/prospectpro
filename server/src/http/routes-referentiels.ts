/** Référentiels (CDC chapitre 5) : tiers et bureaux. */
import { Router } from 'express';
import { z } from 'zod';
import { getPool } from '../db/pool.js';
import { journaliser } from '../moteurs/audit.js';
import { controlerDroit } from '../modules/habilitations/droits.js';
import { creerBureau, lireBureau, listerBureaux } from '../modules/referentiels/bureaux.js';
import { creerTiers, lireTiers, modifierTiers, rechercherDoublons, schemaTiers } from '../modules/referentiels/tiers.js';
import { droit, ecrire } from './socle.js';

const uuid = z.string().uuid();

export function routesReferentiels(): Router {
  const r = Router();

  // ---------------------------------------------------------------- Tiers
  r.get('/tiers', droit('TIERS', 'CONSULTER'), async (req, res) => {
    const f = z.object({ recherche: z.string().trim().min(2).max(80) }).parse(req.query);
    res.json((await getPool().query(
      `SELECT id, code_tiers, nature, nom, prenoms, date_naissance, telephone, statut FROM tiers
        WHERE supprime_le IS NULL AND (code_tiers = upper($1) OR telephone = $1 OR (nom || ' ' || COALESCE(prenoms, '')) ILIKE '%' || $1 || '%')
        ORDER BY nom, prenoms LIMIT 50`, [f.recherche])).rows);
  });
  r.post('/tiers/doublons', droit('TIERS', 'CREER'), async (req, res) => {
    res.json(await rechercherDoublons(getPool(), schemaTiers.parse(req.body)));
  });
  r.post('/tiers', droit('TIERS', 'CREER'), async (req, res) => {
    const { decisionDoublon, ...t } = z.object({ decisionDoublon: z.object({ motif: z.string().min(5) }).optional() }).passthrough().parse(req.body);
    // Passer outre un doublon probable relève d'un gestionnaire habilité (REF-RG-002)
    if (decisionDoublon) await controlerDroit(getPool(), req.acteur.utilisateurId!, 'TIERS', 'VALIDER');
    res.status(201).json({ id: await ecrire(req, q => creerTiers(q, req.acteur, t as never, decisionDoublon)) });
  });
  r.get('/tiers/:id', droit('TIERS', 'CONSULTER'), async (req, res) => {
    const id = uuid.parse(req.params.id);
    const t = await lireTiers(getPool(), id);
    // Consultation d'une fiche d'identité : tracée (rapport L0, A.3 bis)
    await ecrire(req, q => journaliser(q, { ...req.acteur.trace(), action: 'CONSULTATION', objetType: 'tiers', objetId: id }));
    const roles = await getPool().query('SELECT role, date_debut, date_fin FROM tiers_role WHERE tiers_id = $1 AND supprime_le IS NULL ORDER BY date_debut', [id]);
    res.json({ ...t, roles: roles.rows });
  });
  r.patch('/tiers/:id', droit('TIERS', 'MODIFIER'), async (req, res) => {
    const { version, ...maj } = z.object({ version: z.number().int().positive() }).passthrough().parse(req.body);
    res.json(await ecrire(req, q => modifierTiers(q, req.acteur, uuid.parse(req.params.id), version, maj as never)));
  });

  // ---------------------------------------------------------------- Bureaux
  r.get('/bureaux', droit('BUREAUX', 'CONSULTER'), async (req, res) => {
    res.json(await listerBureaux(getPool(), req.perimetre));
  });
  r.get('/bureaux/:id', droit('BUREAUX', 'CONSULTER'), async (req, res) => {
    res.json(await lireBureau(getPool(), uuid.parse(req.params.id), req.perimetre));
  });
  r.post('/bureaux', droit('BUREAUX', 'PARAMETRER'), async (req, res) => {
    const d = z.object({ code: z.string().optional(), nom: z.string().min(1).max(120), type: z.enum(['BUREAU_DIRECT', 'CANAL_DIGITAL']), adresse: z.string().min(1).max(300) }).parse(req.body);
    res.status(201).json(await ecrire(req, q => creerBureau(q, req.acteur, d)));
  });

  return r;
}
