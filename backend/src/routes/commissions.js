const express = require('express');
const { v4: uuidv4 } = require('uuid');
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

// Situation périodique des paiements par agent
router.get('/situation', authenticateToken, ah(async (req, res) => {
  const { agent_id, date_debut, date_fin } = req.query;
  const effectiveAgentId = req.user.role !== 'admin' ? req.user.id : (agent_id || null);

  // Total commissions dues pour cet agent (toutes périodes)
  let totalDuSql = 'SELECT COALESCE(SUM(montant_du), 0) v FROM commissions';
  const totalDuArgs = [];
  if (effectiveAgentId) { totalDuSql += ' WHERE agent_id = ?'; totalDuArgs.push(effectiveAgentId); }
  const totalDuRow = await get(totalDuSql, totalDuArgs);

  // Total payé avant la période (pour calculer le solde d'ouverture)
  let initSolde = Number(totalDuRow.v);
  if (date_debut) {
    let preSql = `SELECT COALESCE(SUM(cp.montant), 0) v
      FROM commission_payments cp
      JOIN commissions cm ON cm.id = cp.commission_id
      WHERE cp.date_paiement < ?`;
    const preArgs = [date_debut];
    if (effectiveAgentId) { preSql += ' AND cm.agent_id = ?'; preArgs.push(effectiveAgentId); }
    const preRow = await get(preSql, preArgs);
    initSolde = Number(totalDuRow.v) - Number(preRow.v);
  }

  // Paiements de la période
  let sql = `
    SELECT cp.id, cp.date_paiement, cp.reference, cp.libelle, cp.montant,
           u.nom as agent_nom, u.prenom as agent_prenom,
           c.nom as client_nom, c.prenom as client_prenom, c.type as client_type,
           c.numero as client_numero
    FROM commission_payments cp
    JOIN commissions cm ON cm.id = cp.commission_id
    JOIN users u ON u.id = cm.agent_id
    JOIN clients c ON c.id = cm.client_id
    WHERE 1=1`;
  const args = [];

  if (effectiveAgentId) { sql += ' AND cm.agent_id = ?'; args.push(effectiveAgentId); }
  if (date_debut) { sql += ' AND cp.date_paiement >= ?'; args.push(date_debut); }
  if (date_fin)   { sql += ' AND cp.date_paiement <= ?'; args.push(date_fin); }
  sql += ' ORDER BY cp.date_paiement ASC, cp.created_at ASC';

  const payments = await all(sql, args);

  // Calcul du solde courant après chaque paiement
  let running = initSolde;
  const rows = payments.map(p => {
    running -= Number(p.montant);
    return { ...p, solde: running };
  });

  res.json({ initial_solde: initSolde, payments: rows });
}));

// Historique des paiements d'une commission
router.get('/:id/payments', authenticateToken, ah(async (req, res) => {
  const comm = await get('SELECT id, agent_id FROM commissions WHERE id = ?', [req.params.id]);
  if (!comm) return res.status(404).json({ error: 'Commission non trouvée' });
  if (req.user.role !== 'admin' && comm.agent_id !== req.user.id)
    return res.status(403).json({ error: 'Accès refusé' });

  const payments = await all(
    'SELECT * FROM commission_payments WHERE commission_id = ? ORDER BY date_paiement ASC, created_at ASC',
    [req.params.id]
  );
  res.json(payments);
}));

// Enregistrer un paiement (multi-paiements supportés)
router.patch('/:id/pay', authenticateToken, requireAdmin, ah(async (req, res) => {
  const { montant, date_paiement, reference, libelle } = req.body;

  const comm = await get('SELECT * FROM commissions WHERE id = ?', [req.params.id]);
  if (!comm) return res.status(404).json({ error: 'Commission non trouvée' });

  const paid = Number(montant) || 0;
  if (paid <= 0) return res.status(400).json({ error: 'Le montant doit être supérieur à 0' });

  await run(
    `INSERT INTO commission_payments (id, commission_id, date_paiement, reference, libelle, montant)
     VALUES (?,?,?,?,?,?)`,
    [uuidv4(), req.params.id,
     date_paiement || new Date().toISOString().split('T')[0],
     reference || null, libelle || null, paid]
  );

  // Recalcul du total payé à partir de tous les paiements
  const totalRow = await get(
    'SELECT COALESCE(SUM(montant), 0) v FROM commission_payments WHERE commission_id = ?',
    [req.params.id]
  );
  const totalPaid = Number(totalRow.v);
  const due = Number(comm.montant_du);
  const statut = totalPaid >= due ? 'paye' : totalPaid > 0 ? 'partiel' : 'non_paye';

  await run(
    `UPDATE commissions SET montant_paye=?, statut=?, date_paiement=?, reference_paiement=?, updated_at=NOW() WHERE id=?`,
    [totalPaid, statut, date_paiement || null, reference || null, req.params.id]
  );

  res.json({ message: 'Paiement enregistré' });
}));

module.exports = router;
