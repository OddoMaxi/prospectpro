const express = require('express');
const { get, all, run } = require('../database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();
const ah = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.get('/', authenticateToken, ah(async (req, res) => {
  const { search, agent_id, date_debut, date_fin } = req.query;

  let sql = `SELECT c.*, u.nom as agent_nom, u.prenom as agent_prenom
    FROM clients c JOIN users u ON u.id = c.agent_id WHERE 1=1`;
  const args = [];

  if (req.user.role !== 'admin') {
    const subs = await all("SELECT id FROM users WHERE parent_agent_id=? AND role='agent'", [req.user.id]);
    const ids = [req.user.id, ...subs.map(s => s.id)];
    sql += ` AND c.agent_id IN (${ids.map(() => '?').join(',')})`;
    args.push(...ids);
  } else if (agent_id) {
    sql += ' AND c.agent_id = ?'; args.push(agent_id);
  }

  if (search) {
    sql += ' AND (c.nom LIKE ? OR c.prenom LIKE ? OR c.numero_contrat LIKE ? OR c.telephone LIKE ? OR c.numero LIKE ?)';
    const s = `%${search}%`;
    args.push(s, s, s, s, s);
  }
  if (date_debut) { sql += ' AND date(c.converted_at) >= ?'; args.push(date_debut); }
  if (date_fin)   { sql += ' AND date(c.converted_at) <= ?'; args.push(date_fin); }

  sql += ' ORDER BY c.converted_at DESC';
  res.json(await all(sql, args));
}));

router.get('/:id', authenticateToken, ah(async (req, res) => {
  let sql = `SELECT c.*, u.nom as agent_nom, u.prenom as agent_prenom
    FROM clients c JOIN users u ON u.id = c.agent_id WHERE c.id = ?`;
  const args = [req.params.id];

  if (req.user.role !== 'admin') {
    const subs = await all("SELECT id FROM users WHERE parent_agent_id=? AND role='agent'", [req.user.id]);
    const ids = [req.user.id, ...subs.map(s => s.id)];
    sql += ` AND c.agent_id IN (${ids.map(() => '?').join(',')})`;
    args.push(...ids);
  }

  const client = await get(sql, args);
  if (!client) return res.status(404).json({ error: 'Client non trouvé' });

  const products = await all('SELECT * FROM client_products WHERE client_id = ?', [req.params.id]);
  res.json({ ...client, products });
}));

router.delete('/:id', authenticateToken, requireAdmin, ah(async (req, res) => {
  await run('DELETE FROM client_products WHERE client_id = ?', [req.params.id]);
  const r = await run('DELETE FROM clients WHERE id = ?', [req.params.id]);
  if (r.rowsAffected === 0) return res.status(404).json({ error: 'Client non trouvé' });
  res.json({ message: 'Client supprimé' });
}));

module.exports = router;
