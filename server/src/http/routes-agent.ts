/**
 * Application agent (maquettes AG-01 à AG-21), version web : vues propres à l'intervenant connecté.
 * Les opérations réutilisent les routes métier (dossiers, comptes de production, factures…), filtrées par bureaux gérés.
 */
import { Router, type Request } from 'express';
import { getPool } from '../db/pool.js';
import { ErreurMetier } from '../noyau/erreurs.js';
import { policesARenouveler } from '../modules/production/renouvellement.js';

/** Intervenant actif rattaché à l'utilisateur connecté, et l'agent général dont il dépend. */
export async function intervenantConnecte(req: Request) {
  const i = (await getPool().query<{ id: string; role: string; statut: string; emission_activee: boolean; controles_conformite_le: string | null; tiers_id: string; nom: string; prenoms: string | null; agent_id: string; agent: string }>(
    `SELECT i.id, i.role, i.statut, i.emission_activee, i.controles_conformite_le, t.id AS tiers_id, t.nom, t.prenoms,
            COALESCE(i.rattachement_id, i.id) AS agent_id, trim(ta.nom || ' ' || COALESCE(ta.prenoms, '')) AS agent
       FROM utilisateur u JOIN intervenant i ON i.tiers_id = u.tiers_id AND i.statut <> 'SORTI' AND i.supprime_le IS NULL JOIN tiers t ON t.id = i.tiers_id
       JOIN intervenant ia ON ia.id = COALESCE(i.rattachement_id, i.id) JOIN tiers ta ON ta.id = ia.tiers_id
      WHERE u.id = $1 ORDER BY i.role = 'AGENT_GENERAL' DESC LIMIT 1`, [req.acteur.utilisateurId])).rows[0];
  if (!i) throw new ErreurMetier('NON_TROUVE', 'Aucun intervenant actif n\'est rattaché à ce compte', 404);
  return i;
}

export function routesAgent(): Router {
  const r = Router();

  // AG-02 : tableau de bord du portefeuille
  r.get('/agent/accueil', async (req, res) => {
    const i = await intervenantConnecte(req);
    const bureaux = (await getPool().query(
      `SELECT b.id, b.code, b.nom, cp.id AS compte_id, cp.solde::bigint AS solde, cp.seuil_alerte, cp.statut AS compte_statut, cp.motif_gel
         FROM bureau_gestionnaire g JOIN bureau b ON b.id = g.bureau_id LEFT JOIN compte_production_agent cp ON cp.bureau_id = b.id AND cp.supprime_le IS NULL
        WHERE g.intervenant_id = $1 AND g.date_fin IS NULL AND g.supprime_le IS NULL ORDER BY b.code`, [i.agent_id])).rows;
    const codes = bureaux.map(b => b.code as string);
    const n = (await getPool().query<{ actives: number; dossiers: number; brouillons: number; commissions: number; renouvelees: number; echues_an: number }>(
      `SELECT (SELECT count(*)::int FROM police p JOIN bureau b ON b.id = p.bureau_gestion_id WHERE b.code = ANY($1) AND p.statut = 'ACTIVE') AS actives,
              (SELECT count(*)::int FROM dossier_souscription d JOIN intervenant x ON x.id = d.prepare_par_id
                WHERE x.rattachement_id = $2 AND d.statut = 'A_VALIDER' AND d.supprime_le IS NULL) AS dossiers,
              (SELECT count(*)::int FROM dossier_souscription d WHERE d.prepare_par_id = $3 AND d.statut IN ('BROUILLON', 'REJETE') AND d.supprime_le IS NULL) AS brouillons,
              (SELECT COALESCE(sum(f.net - COALESCE((SELECT sum(pf.net) FROM paiement_facture_commission pf WHERE pf.facture_id = f.id AND pf.paye_le IS NOT NULL), 0)), 0)::bigint
                 FROM facture_commission f WHERE f.intervenant_id = $3 AND f.statut NOT IN ('PAYEE')) AS commissions,
              (SELECT count(*)::int FROM police_periode pp JOIN police p ON p.id = pp.police_id JOIN bureau b ON b.id = p.bureau_gestion_id
                WHERE b.code = ANY($1) AND pp.rang > 1 AND pp.date_debut >= date_trunc('year', current_date)) AS renouvelees,
              (SELECT count(*)::int FROM police_periode pp JOIN police p ON p.id = pp.police_id JOIN bureau b ON b.id = p.bureau_gestion_id
                WHERE b.code = ANY($1) AND pp.date_fin >= date_trunc('year', current_date) AND pp.date_fin < current_date
                  AND pp.rang = (SELECT max(rang) FROM police_periode x WHERE x.police_id = p.id AND x.date_debut <= pp.date_fin)) AS echues_an`,
      [codes, i.agent_id, i.id])).rows[0]!;
    const echeances = codes.length ? (await policesARenouveler(getPool(), codes, 30)).slice(0, 20) : [];
    res.json({
      intervenant: { id: i.id, role: i.role, statut: i.statut, emissionActivee: i.emission_activee, prospectionSeule: i.role === 'JUNIOR' && !i.controles_conformite_le, nom: i.nom, prenoms: i.prenoms, tiersId: i.tiers_id, agent: i.agent },
      bureaux, policesActives: n.actives, echeances,
      reseau: { dossiersAValider: n.dossiers, mesDossiersEnCours: n.brouillons, commissionsDues: Number(n.commissions),
        tauxRenouvellement: n.renouvelees + n.echues_an ? Math.round(100 * n.renouvelees / (n.renouvelees + n.echues_an)) : null },
    });
  });

  // AG-15 : mon réseau (collaborateurs et juniors de l'agent général)
  r.get('/agent/reseau', async (req, res) => {
    const i = await intervenantConnecte(req);
    res.json((await getPool().query(
      `SELECT x.id, x.role, x.statut, x.date_entree, x.controles_conformite_le, x.date_entree + 15 AS limite_controles, t.id AS tiers_id, t.nom, t.prenoms, t.telephone,
              (SELECT count(*)::int FROM dossier_souscription d WHERE d.prepare_par_id = x.id AND d.statut = 'A_VALIDER') AS dossiers_soumis,
              (SELECT count(*)::int FROM police_intervenant pi WHERE pi.intervenant_id = x.id AND pi.date_fin IS NULL) AS polices
         FROM intervenant x JOIN tiers t ON t.id = x.tiers_id WHERE x.rattachement_id = $1 AND x.supprime_le IS NULL ORDER BY x.statut = 'SORTI', t.nom`, [i.agent_id])).rows);
  });
  return r;
}
