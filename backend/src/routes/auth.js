const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { get, run } = require('../database');
const { authenticateToken, JWT_SECRET } = require('../middleware/auth');

const router = express.Router();
const ah = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.post('/login', ah(async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Identifiant et mot de passe requis' });

  const user = await get('SELECT * FROM users WHERE username = ? AND is_active = 1', [username]);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Identifiant ou mot de passe incorrect' });
  }

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role, must_change_password: user.must_change_password },
    JWT_SECRET, { expiresIn: '8h' }
  );
  res.json({
    token,
    user: {
      id: user.id, nom: user.nom, prenom: user.prenom, username: user.username,
      role: user.role, must_change_password: Number(user.must_change_password) === 1,
      email: user.email, telephone: user.telephone,
      parent_agent_id: user.parent_agent_id || null
    }
  });
}));

router.post('/change-password', authenticateToken, ah(async (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) return res.status(400).json({ error: 'Les deux mots de passe sont requis' });
  if (new_password.length < 8) return res.status(400).json({ error: 'Minimum 8 caractères requis' });

  const user = await get('SELECT * FROM users WHERE id = ?', [req.user.id]);
  if (!bcrypt.compareSync(current_password, user.password_hash)) {
    return res.status(401).json({ error: 'Mot de passe actuel incorrect' });
  }

  const hash = bcrypt.hashSync(new_password, 10);
  await run("UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = NOW() WHERE id = ?",
    [hash, req.user.id]);

  const newToken = jwt.sign(
    { id: user.id, username: user.username, role: user.role, must_change_password: 0 },
    JWT_SECRET, { expiresIn: '8h' }
  );
  res.json({ message: 'Mot de passe modifié avec succès', token: newToken });
}));

router.get('/me', authenticateToken, ah(async (req, res) => {
  const user = await get(
    'SELECT id, nom, prenom, email, telephone, role, username, must_change_password, objectif_mensuel, objectif_annuel, taux_commission, parent_agent_id, created_at FROM users WHERE id = ?',
    [req.user.id]
  );
  if (!user) return res.status(404).json({ error: 'Utilisateur non trouvé' });
  res.json({ ...user, must_change_password: Number(user.must_change_password) === 1, parent_agent_id: user.parent_agent_id || null });
}));

module.exports = router;
