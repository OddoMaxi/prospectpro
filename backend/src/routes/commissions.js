const express = require('express');
const { get, all, run } = require('../database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();
const ah = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.get('/', authenticateToken, ah(async (req, res) => {
  const { statut, agent_id, date_debut, date_fin, search } = req.query;

  let sql = `
    SELECT cm.*,
           u.nom as agent_nom, u.prenom as agent_prenom, u.username as agent_username,
           c.numero as client_numero, c.nom as client_nom, c.prenom as client_prenom,
           c.type as client_type, c.numero_contrat, c.date_effet, c.date_fin,
           c.prime_totale as client_prime,
           su.nom as source_nom, su.prenom as source_prenom
    FROM commissions cm
    JOIN users u ON u.id = cm.agent_id
    JOIN clients c ON c.id = cm.client_id
    LEFT JOIN users su ON su.id = cm.source_agent_id
    WHERE 1=1`;
  const args = [];

  if (req.user.role !== 'admin') {
    sql += ' AND cm.agent_id = ?'; args.push(req.user.id);
  } else if (agent_id) {
    sql += ' AND cm.agent_id = ?'; args.push(agent_id);
  }

  if (statut) { sql += ' AND cm.statut = ?'; args.push(statut); }
  if (search) {
    sql += ' AND (c.nom LIKE ? OR c.prenom LIKE ? OR c.numero LIKE ? OR cm.reference_paiement LIKE ?)';
    const s = `%${search}%`;
    args.push(s, s, s, s);
  }
  if (date_debut) { sql += ' AND date(cm.created_at) >= ?'; args.push(date_debut); }
  if (date_fin)   { sql += ' AND date(cm.created_at) <= ?'; args.push(date_fin); }

  sql += ' ORDER BY cm.created_at DESC';
  res.json(await all(sql, args));
}));

router.get('/stats', authenticateToken, ah(async (req, res) => {
  let where = 'WHERE 1=1';
  const args = [];

  if (req.user.role !== 'admin') {
    where += ' AND cm.agent_id = ?'; args.push(req.user.id);
  }

  const [total, paye, partiel, nonPaye] = await Promise.all([
    get(`SELECT COALESCE(SUM(montant_du),0) v, COALESCE(SUM(montant_paye),0) p, COUNT(*) c FROM commissions cm ${where}`, args),
    get(`SELECT COUNT(*) c, COALESCE(SUM(montant_paye),0) v FROM commissions cm ${where} AND cm.statut='paye'`, args),
    get(`SELECT COUNT(*) c, COALESCE(SUM(montant_du-montant_paye),0) v FROM commissions cm ${where} AND cm.statut='partiel'`, args),
    get(`SELECT COUNT(*) c, COALESCE(SUM(montant_du),0) v FROM commissions cm ${where} AND cm.statut='non_paye'`, args),
  ]);

  res.json({
    total_du:    Number(total.v),
    total_paye:  Number(total.p),
    total_reste: Number(total.v) - Number(total.p),
    nb_total:    Number(total.c),
    nb_paye:     Number(paye.c),
    nb_partiel:  Number(partiel.c),
    nb_non_paye: Number(nonPaye.c),
  });
}));

router.patch('/:id/pay', authenticateToken, requireAdmin, ah(async (req, res) => {
  const { montant_paye, date_paiement, reference_paiement, notes } = req.body;

  const comm = await get('SELECT * FROM commissions WHERE id = ?', [req.params.id]);
  if (!comm) return res.status(404).json({ error: 'Commission non trouvée' });

  const paid = Number(montant_paye) || 0;
  const due  = Number(comm.montant_du);
  const statut = paid >= due ? 'paye' : paid > 0 ? 'partiel' : 'non_paye';

  await run(
    `UPDATE commissions SET montant_paye=?, statut=?, date_paiement=?, reference_paiement=?, notes=?, updated_at=datetime('now') WHERE id=?`,
    [paid, statut, date_paiement || null, reference_paiement || null, notes || null, req.params.id]
  );

  res.json({ message: 'Commission mise à jour' });
}));

module.exports = router;
