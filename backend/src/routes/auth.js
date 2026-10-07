const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { get, run } = require('../database');
const { authenticateToken, reprendreActivite, JWT_SECRET } = require('../middleware/auth');
const { ah } = require('../utils/http');
const { personName } = require('../utils/names');

const router = express.Router();

const publicUser = u => ({
  id: u.id, nom: u.nom, prenom: u.prenom, username: u.username, role: u.role,
  must_change_password: Number(u.must_change_password) === 1,
  email: u.email, telephone: u.telephone, type_agent: u.type_agent, raison_sociale: u.raison_sociale,
  parent_agent_id: u.parent_agent_id || null, statut: u.statut,
});

router.post('/login', ah(async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Identifiant et mot de passe requis' });

  const user = await get('SELECT * FROM users WHERE username = ?', [username]);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Identifiant ou mot de passe incorrect' });
  }
  if (user.statut === 'suspendu') return res.status(403).json({ error: 'Votre compte est suspendu. Contactez l\'administrateur.' });
  if (user.statut === 'supprime') return res.status(401).json({ error: 'Identifiant ou mot de passe incorrect' });

  if (user.statut === 'inactif') {
    await reprendreActivite({ id: user.id, username: user.username, role: user.role, label: personName(user) });
    user.statut = 'actif';
  }
  await run('UPDATE users SET last_activity_at = NOW() WHERE id = ?', [user.id]);

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role, must_change_password: user.must_change_password },
    JWT_SECRET, { expiresIn: '8h' }
  );
  res.json({ token, user: publicUser(user) });
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
  await run('UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = NOW() WHERE id = ?',
    [hash, req.user.id]);

  const newToken = jwt.sign(
    { id: user.id, username: user.username, role: user.role, must_change_password: 0 },
    JWT_SECRET, { expiresIn: '8h' }
  );
  res.json({ message: 'Mot de passe modifié avec succès', token: newToken });
}));

router.get('/me', authenticateToken, ah(async (req, res) => {
  const user = await get('SELECT * FROM users WHERE id = ?', [req.user.id]);
  if (!user) return res.status(404).json({ error: 'Utilisateur non trouvé' });
  res.json(publicUser(user));
}));

module.exports = router;
