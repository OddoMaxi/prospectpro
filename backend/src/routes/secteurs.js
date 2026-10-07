const express = require('express');
const { all } = require('../database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
const ah = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.get('/', authenticateToken, ah(async (req, res) => {
  const rows = await all('SELECT nom FROM secteurs_activite ORDER BY nom');
  res.json(rows.map(r => r.nom));
}));

module.exports = router;
