/**
 * Réseau commercial (sous-lot 2.9) : codes prescripteurs (CM-06), cartes professionnelles (CM-08), mouvements de
 * portefeuille (CM-05) ; vues de l'agent : prospects (AG-03), carte (AG-20), mouvements (AG-19), comptes du réseau
 * (AG-15), espace prescripteur (AG-21). La vérification publique d'une carte ne demande aucune connexion.
 */
import { Router, type Request } from 'express';
import { z } from 'zod';
import { getPool } from '../db/pool.js';
import { ErreurMetier } from '../noyau/erreurs.js';
import { Refus } from '../modules/auth/service.js';
import { attribuerCode, changerStatutCode, controlerCode, listerCodes, statistiquesPrescripteur } from '../modules/commercial/prescripteurs.js';
import { confirmerRemise, demanderRemise, listerCartes, produireCarte, validerCarte, verifierCarte } from '../modules/commercial/cartes.js';
import { listerMouvements, portefeuille, proposerMouvement } from '../modules/commercial/portefeuille.js';
import { changerStatutProspect, enregistrerProspect, listerProspects } from '../modules/commercial/prospects.js';
import { creerIntervenant } from '../modules/commercial/intervenants.js';
import { changerStatut, creerUtilisateur } from '../modules/habilitations/service.js';
import { intervenantConnecte } from './routes-agent.js';
import { droit, ecrire } from './socle.js';

const uuid = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const urlVerification = (req: Request) => `${req.protocol}://${req.get('host')}/verification/carte`;
const schemaMouvement = z.object({
  type: z.enum(['CESSION', 'TRANSFERT', 'REAFFECTATION']), cedantId: uuid, cessionnaireId: uuid, polices: z.array(uuid).optional(), dateEffet: date,
  motif: z.string().min(1).max(300), prix: z.number().int().nonnegative().optional(), casTransfert: z.enum(['DEPART', 'SUSPENSION', 'INACTIVITE', 'ACCORD_ECRIT']).optional(),
  accordDocumentId: uuid.optional(),
});

/** Page publique de vérification d'une carte (COM-RG-104), sans authentification. */
export function routesPubliques(): Router {
  const r = Router();
  r.get('/public/cartes/:jeton', async (req, res) => {
    const jeton = z.string().min(10).max(200).regex(/^[A-Za-z0-9_-]+$/).parse(req.params.jeton);
    res.json(await verifierCarte(getPool(), jeton));
  });
  return r;
}

export function routesReseau(): Router {
  const r = Router();

  // ---------------------------------------------------------------- codes prescripteurs (CM-06)
  r.get('/codes-prescripteurs', droit('AGREMENT', 'CONSULTER'), async (_req, res) => { res.json(await listerCodes(getPool())); });
  r.get('/codes-prescripteurs/disponibilite', droit('AGREMENT', 'CONSULTER'), async (req, res) => {
    const { code } = z.object({ code: z.string().max(40) }).parse(req.query);
    try { res.json({ disponible: true, code: await controlerCode(getPool(), code) }); }
    catch (e) { if (e instanceof ErreurMetier) res.json({ disponible: false, motif: e.message }); else throw e; }
  });
  r.post('/intervenants/:id/codes', droit('AGREMENT', 'CREER'), async (req, res) => {
    const { code } = z.object({ code: z.string().min(1).max(40) }).parse(req.body);
    res.status(201).json(await ecrire(req, q => attribuerCode(q, req.acteur, uuid.parse(req.params.id), code)));
  });
  r.post('/codes-prescripteurs/:id/statut', droit('AGREMENT', 'CREER'), async (req, res) => {
    const d = z.object({ statut: z.enum(['ACTIF', 'SUSPENDU', 'RETIRE']), motif: z.string().min(1) }).parse(req.body);
    await ecrire(req, q => changerStatutCode(q, req.acteur, uuid.parse(req.params.id), d.statut, d.motif));
    res.status(204).end();
  });

  // ---------------------------------------------------------------- cartes professionnelles (CM-08)
  r.get('/cartes-pro', droit('CARTE_PRO', 'CONSULTER'), async (req, res) => {
    const f = z.object({ statut: z.string().optional() }).parse(req.query);
    res.json(await listerCartes(getPool(), f));
  });
  r.post('/cartes-pro/:id/validation', droit('CARTE_PRO', 'VALIDER'), async (req, res) => {
    await ecrire(req, q => validerCarte(q, req.acteur, uuid.parse(req.params.id)));
    res.status(204).end();
  });
  r.post('/cartes-pro/:id/production', droit('CARTE_PRO', 'CREER'), async (req, res) => {
    res.json(await ecrire(req, q => produireCarte(q, req.acteur, uuid.parse(req.params.id), urlVerification(req))));
  });
  r.post('/cartes-pro/:id/remise/code', droit('CARTE_PRO', 'CREER'), async (req, res) => {
    res.json(await ecrire(req, q => demanderRemise(q, req.acteur, uuid.parse(req.params.id))));
  });
  r.post('/cartes-pro/:id/remise', droit('CARTE_PRO', 'CREER'), async (req, res) => {
    const { code } = z.object({ code: z.string().regex(/^\d{6}$/) }).parse(req.body);
    const x = await ecrire(req, q => confirmerRemise(q, req.acteur, uuid.parse(req.params.id), code));
    if (x instanceof Refus) throw x.erreur;
    res.json(x);
  });

  // ---------------------------------------------------------------- mouvements de portefeuille (CM-05)
  r.get('/mouvements-portefeuille', droit('MOUVEMENT_PORTEFEUILLE', 'CONSULTER'), async (req, res) => {
    const f = z.object({ statut: z.string().optional() }).parse(req.query);
    res.json(await listerMouvements(getPool(), f));
  });
  r.get('/intervenants/:id/portefeuille', droit('AGREMENT', 'CONSULTER'), async (req, res) => { res.json(await portefeuille(getPool(), uuid.parse(req.params.id))); });
  /** Direction commerciale : réaffectation d'office, ou cession proposée pour le compte d'un agent sortant. */
  r.post('/mouvements-portefeuille', droit('AGREMENT', 'CREER'), async (req, res) => {
    const d = schemaMouvement.parse(req.body);
    res.status(201).json(await ecrire(req, q => proposerMouvement(q, req.acteur, { directionCommerciale: true }, d)));
  });

  // ---------------------------------------------------------------- application agent
  r.get('/agent/prospects', async (req, res) => {
    const i = await intervenantConnecte(req);
    const f = z.object({ statut: z.string().optional(), finExclusiviteAvant: date.optional() }).parse(req.query);
    res.json(await listerProspects(getPool(), i.id, f));
  });
  r.post('/agent/prospects', droit('TIERS', 'CREER'), async (req, res) => {
    const i = await intervenantConnecte(req);
    const { tiersId } = z.object({ tiersId: uuid }).parse(req.body);
    res.status(201).json(await ecrire(req, q => enregistrerProspect(q, req.acteur, i.id, tiersId)));
  });
  r.post('/agent/prospects/:id/statut', async (req, res) => {
    const i = await intervenantConnecte(req);
    const { statut } = z.object({ statut: z.enum(['NOUVEAU', 'CONTACTE', 'INTERESSE', 'PERDU']) }).parse(req.body);
    await ecrire(req, q => changerStatutProspect(q, req.acteur, i.id, uuid.parse(req.params.id), statut));
    res.status(204).end();
  });
  r.get('/agent/carte', async (req, res) => {
    const i = await intervenantConnecte(req);
    const c = (await listerCartes(getPool(), { intervenantId: i.id })).find(x => x.statut !== 'RETIREE') ?? null;
    res.json(c ? { ...c, verification: `${urlVerification(req)}/${c.jeton_qr}` } : null);
  });
  r.get('/agent/portefeuille', async (req, res) => {
    const i = await intervenantConnecte(req);
    res.json(await portefeuille(getPool(), i.id));
  });
  r.get('/agent/mouvements', async (req, res) => {
    const i = await intervenantConnecte(req);
    res.json(await listerMouvements(getPool(), { intervenantId: i.agent_id }));
  });
  r.post('/agent/mouvements', droit('MOUVEMENT_PORTEFEUILLE', 'CREER'), async (req, res) => {
    const i = await intervenantConnecte(req);
    const d = schemaMouvement.parse(req.body);
    res.status(201).json(await ecrire(req, q => proposerMouvement(q, req.acteur, { intervenantId: i.id }, d)));
  });
  /** Cessionnaires possibles : agents généraux en activité (nom seulement). */
  r.get('/agent/agents-generaux', async (req, res) => {
    const i = await intervenantConnecte(req);
    res.json((await getPool().query(
      `SELECT x.id, trim(t.nom || ' ' || COALESCE(t.prenoms, '')) AS nom FROM intervenant x JOIN tiers t ON t.id = x.tiers_id
        WHERE x.role = 'AGENT_GENERAL' AND x.statut = 'ACTIF' AND x.id <> $1 AND x.supprime_le IS NULL ORDER BY t.nom`, [i.agent_id])).rows);
  });
  r.get('/agent/reseau/:id/portefeuille', async (req, res) => {
    const i = await intervenantConnecte(req);
    const id = uuid.parse(req.params.id);
    const membre = await getPool().query('SELECT 1 FROM intervenant WHERE id = $1 AND rattachement_id = $2', [id, i.id]);
    if (!membre.rowCount) throw new ErreurMetier('NON_TROUVE', 'Intervenant introuvable dans votre réseau', 404);
    res.json(await portefeuille(getPool(), id));
  });
  /** AG-15, COM-RG-061, 062 : l'agent général crée et valide lui-même les comptes de ses juniors et collaborateurs. */
  r.post('/agent/reseau', droit('COMPTES_RESEAU', 'CREER'), async (req, res) => {
    const i = await intervenantConnecte(req);
    if (i.role !== 'AGENT_GENERAL') throw new ErreurMetier('INTERDIT', 'Seul l\'agent général crée les comptes de son réseau', 403);
    const d = z.object({ tiersId: uuid, role: z.enum(['JUNIOR', 'COLLABORATEUR']), identifiant: z.string(), motDePasse: z.string(), telephone: z.string().optional() }).parse(req.body);
    res.status(201).json(await ecrire(req, async q => {
      const intervenantId = await creerIntervenant(q, req.acteur, { tiersId: d.tiersId, role: d.role, rattachementId: i.id });
      const tel = d.telephone ?? (await q.query<{ telephone: string | null }>('SELECT telephone FROM tiers WHERE id = $1', [d.tiersId])).rows[0]?.telephone ?? undefined;
      const utilisateurId = await creerUtilisateur(q, req.acteur, { identifiant: d.identifiant, tiersId: d.tiersId, typeCompte: d.role, motDePasse: d.motDePasse, telephone: tel, intervenantId });
      await changerStatut(q, req.acteur, utilisateurId, 'ACTIF', 'Compte créé et validé par l\'agent général (COM-RG-062)');
      return { intervenantId, utilisateurId };
    }));
  });
  /** AG-21 : statistiques anonymes du prescripteur. */
  r.get('/agent/prescripteur', async (req, res) => {
    const i = await intervenantConnecte(req);
    if (i.role !== 'PRESCRIPTEUR') throw new ErreurMetier('NON_TROUVE', 'Espace réservé aux prescripteurs', 404);
    res.json({ codes: (await listerCodes(getPool(), i.id)).map(c => ({ code: c.code, statut: c.statut, valide_le: c.valide_le })), ...(await statistiquesPrescripteur(getPool(), i.id)) });
  });
  return r;
}
