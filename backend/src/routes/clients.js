const express = require('express');
const { get, all, run } = require('../database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { ah, HttpError } = require('../utils/http');
const { audit } = require('../utils/audit');
const { scopeIds, scopeClause } = require('../utils/scope');
const { personName } = require('../utils/names');

const router = express.Router();

router.get('/', authenticateToken, ah(async (req, res) => {
  const { search, agent_id, annee, type } = req.query;
  const args = [];
  let sql = `SELECT c.*, u.nom AS agent_nom, u.prenom AS agent_prenom, u.raison_sociale AS agent_raison_sociale,
      u.type_agent AS agent_type_agent,
      (SELECT COUNT(*) FROM v_contrats v WHERE v.client_id = c.id AND v.statut_calcule NOT IN ('resilie','expire')) AS nb_contrats_actifs,
      (SELECT COUNT(*) FROM contrats k WHERE k.client_id = c.id) AS nb_contrats,
      (SELECT MIN(v.date_echeance) FROM v_contrats v WHERE v.client_id = c.id AND v.statut = 'actif' AND v.date_echeance >= CURRENT_DATE) AS prochaine_echeance,
      (SELECT COALESCE(SUM(v.prime_ttc),0) FROM v_contrats v WHERE v.client_id = c.id AND v.statut_calcule NOT IN ('resilie','expire')) AS prime_ttc_en_cours
    FROM clients c JOIN users u ON u.id = c.agent_id WHERE c.statut = 'actif'`;
  sql += scopeClause(await scopeIds(req.user), 'c.agent_id', args);
  if (agent_id) { sql += ' AND c.agent_id = ?'; args.push(agent_id); }
  if (type) { sql += ' AND c.type = ?'; args.push(type); }
  if (annee) {
    // Clients acquis pendant l'exercice ou ayant un contrat en vigueur pendant l'exercice
    sql += ` AND (EXTRACT(YEAR FROM c.converted_at) = ? OR EXISTS (
      SELECT 1 FROM contrats k JOIN contrat_periodes p ON p.contrat_id = k.id
      WHERE k.client_id = c.id AND p.date_debut <= ? AND p.date_echeance >= ?))`;
    args.push(Number(annee), `${annee}-12-31`, `${annee}-01-01`);
  }
  if (search) {
    sql += ' AND (c.nom ILIKE ? OR c.prenom ILIKE ? OR c.telephone ILIKE ? OR c.numero ILIKE ?)';
    const s = `%${search}%`;
    args.push(s, s, s, s);
  }
  sql += ' ORDER BY c.converted_at DESC';
  res.json(await all(sql, args));
}));

router.get('/:id', authenticateToken, ah(async (req, res) => {
  const args = [req.params.id];
  const client = await get(
    `SELECT c.*, u.nom AS agent_nom, u.prenom AS agent_prenom, u.raison_sociale AS agent_raison_sociale, u.type_agent AS agent_type_agent
     FROM clients c JOIN users u ON u.id = c.agent_id WHERE c.id = ?` + scopeClause(await scopeIds(req.user), 'c.agent_id', args), args);
  if (!client) throw new HttpError(404, 'Client non trouvé');
  const [contrats, affectations] = await Promise.all([
    all(`SELECT v.*, (SELECT string_agg(pr.nom, ', ') FROM contrat_produits cp JOIN products pr ON pr.id = cp.product_id
           WHERE cp.contrat_id = v.id) AS produits
         FROM v_contrats v WHERE v.client_id = ? ORDER BY v.date_effet DESC`, [client.id]),
    historique('client', client.id),
  ]);
  res.json({ ...client, contrats, affectations });
}));

async function historique(type, id) {
  return all(
    `SELECT a.*, o.nom AS origine_nom, o.prenom AS origine_prenom, o.raison_sociale AS origine_raison_sociale, o.type_agent AS origine_type_agent,
            d.nom AS dest_nom, d.prenom AS dest_prenom, d.raison_sociale AS dest_raison_sociale, d.type_agent AS dest_type_agent,
            x.nom AS auteur_nom, x.prenom AS auteur_prenom
     FROM affectations a
     LEFT JOIN users o ON o.id = a.agent_origine_id
     JOIN users d ON d.id = a.agent_destinataire_id
     LEFT JOIN users x ON x.id = a.auteur_id
     WHERE a.entity_type = ? AND a.entity_id = ? ORDER BY a.date_debut`, [type, id]);
}

// Suppression logique, refusée tant qu'un contrat est en vigueur
router.delete('/:id', authenticateToken, requireAdmin, ah(async (req, res) => {
  const c = await get("SELECT * FROM clients WHERE id = ? AND statut = 'actif'", [req.params.id]);
  if (!c) throw new HttpError(404, 'Client non trouvé');
  const n = await get("SELECT COUNT(*) c FROM v_contrats WHERE client_id = ? AND statut_calcule NOT IN ('resilie','expire')", [c.id]);
  if (n.c > 0) throw new HttpError(409, `Suppression impossible : ${n.c} contrat(s) en vigueur. Résiliez-les d'abord.`);
  await run("UPDATE clients SET statut = 'supprime', deleted_at = NOW(), deleted_by = ? WHERE id = ?", [req.user.id, c.id]);
  await audit(req, 'suppression_client', { type: 'client', id: c.id, label: `${c.numero} ${personName(c)}` });
  res.json({ message: 'Client supprimé' });
}));

module.exports = router;
module.exports.historique = historique;
