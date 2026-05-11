const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { db, get, all, run } = require('../database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { generatePassword } = require('../utils/passwordGenerator');

const router = express.Router();
const ah = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.post('/', authenticateToken, requireAdmin, ah(async (req, res) => {
  const { nom, prenom, email, telephone, objectif_mensuel, objectif_annuel, taux_commission } = req.body;
  if (!nom || !prenom) return res.status(400).json({ error: 'Nom et prénom requis' });

  const base = (prenom.charAt(0) + nom).toLowerCase().replace(/[^a-z0-9]/g, '');
  let username = base, n = 1;
  while ((await get('SELECT id FROM users WHERE username = ?', [username]))) {
    username = base + n++;
  }

  const tempPassword = generatePassword();
  const id = uuidv4();
  await run(
    `INSERT INTO users (id, nom, prenom, email, telephone, role, username, password_hash, must_change_password, objectif_mensuel, objectif_annuel, taux_commission)
     VALUES (?, ?, ?, ?, ?, 'agent', ?, ?, 1, ?, ?, ?)`,
    [id, nom, prenom, email||null, telephone||null, username, bcrypt.hashSync(tempPassword, 10),
     Number(objectif_mensuel)||0, Number(objectif_annuel)||0, Number(taux_commission)||5.0]
  );
  res.status(201).json({
    message: 'Agent créé avec succès',
    agent: { id, nom, prenom, email, telephone, username },
    credentials: { username, temp_password: tempPassword }
  });
}));

router.get('/', authenticateToken, requireAdmin, ah(async (req, res) => {
  const agents = await all(`
    SELECT u.id, u.nom, u.prenom, u.email, u.telephone, u.username,
           u.objectif_mensuel, u.objectif_annuel, u.taux_commission, u.is_active, u.created_at,
           COUNT(p.id) as total_prospects,
           SUM(CASE WHEN p.statut = 'client' THEN 1 ELSE 0 END) as total_clients
    FROM users u LEFT JOIN prospects p ON p.agent_id = u.id
    WHERE u.role = 'agent'
    GROUP BY u.id ORDER BY u.nom, u.prenom
  `);
  res.json(agents);
}));

router.get('/:id', authenticateToken, requireAdmin, ah(async (req, res) => {
  const agent = await get(
    "SELECT id, nom, prenom, email, telephone, username, objectif_mensuel, objectif_annuel, taux_commission, is_active, created_at FROM users WHERE id = ? AND role = 'agent'",
    [req.params.id]
  );
  if (!agent) return res.status(404).json({ error: 'Agent non trouvé' });
  res.json(agent);
}));

router.put('/:id', authenticateToken, requireAdmin, ah(async (req, res) => {
  const { nom, prenom, email, telephone, objectif_mensuel, objectif_annuel, taux_commission, is_active } = req.body;
  const agent = await get("SELECT id FROM users WHERE id = ? AND role = 'agent'", [req.params.id]);
  if (!agent) return res.status(404).json({ error: 'Agent non trouvé' });

  await run(
    `UPDATE users SET nom=?,prenom=?,email=?,telephone=?,objectif_mensuel=?,objectif_annuel=?,taux_commission=?,is_active=?,updated_at=datetime('now') WHERE id=?`,
    [nom, prenom, email||null, telephone||null,
     Number(objectif_mensuel)||0, Number(objectif_annuel)||0,
     Number(taux_commission)||5.0, is_active !== undefined ? (is_active ? 1 : 0) : 1,
     req.params.id]
  );
  res.json({ message: 'Agent mis à jour avec succès' });
}));

router.delete('/:id', authenticateToken, requireAdmin, ah(async (req, res) => {
  const { transfer_to } = req.body;
  const agent = await get("SELECT id FROM users WHERE id = ? AND role = 'agent'", [req.params.id]);
  if (!agent) return res.status(404).json({ error: 'Agent non trouvé' });

  if (transfer_to) {
    const target = await get("SELECT id FROM users WHERE id = ? AND role = 'agent' AND is_active = 1", [transfer_to]);
    if (!target) return res.status(400).json({ error: 'Agent cible introuvable' });
    await db.batch([
      { sql: 'UPDATE prospects SET agent_id = ? WHERE agent_id = ?', args: [transfer_to, req.params.id] },
      { sql: 'DELETE FROM users WHERE id = ?', args: [req.params.id] }
    ], 'write');
  } else {
    await db.batch([
      { sql: 'DELETE FROM prospects WHERE agent_id = ?', args: [req.params.id] },
      { sql: 'DELETE FROM users WHERE id = ?', args: [req.params.id] }
    ], 'write');
  }
  res.json({ message: 'Agent supprimé avec succès' });
}));

router.post('/:id/reset-password', authenticateToken, requireAdmin, ah(async (req, res) => {
  const agent = await get("SELECT id FROM users WHERE id = ? AND role = 'agent'", [req.params.id]);
  if (!agent) return res.status(404).json({ error: 'Agent non trouvé' });

  const tempPassword = generatePassword();
  await run("UPDATE users SET password_hash=?,must_change_password=1,updated_at=datetime('now') WHERE id=?",
    [bcrypt.hashSync(tempPassword, 10), req.params.id]);

  res.json({ message: 'Mot de passe réinitialisé', credentials: { temp_password: tempPassword } });
}));

module.exports = router;
