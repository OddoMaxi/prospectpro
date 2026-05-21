const express = require('express');
const { all } = require('../database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();
const ah = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// GET /api/lieux/regions
router.get('/regions', authenticateToken, ah(async (req, res) => {
  const rows = await all('SELECT DISTINCT region FROM lieux ORDER BY region');
  res.json(rows.map(r => r.region));
}));

// GET /api/lieux/communes?region=CONAKRY
router.get('/communes', authenticateToken, ah(async (req, res) => {
  const { region } = req.query;
  if (!region) return res.status(400).json({ error: 'region requis' });
  const rows = await all('SELECT DISTINCT commune FROM lieux WHERE region = ? ORDER BY commune', [region]);
  res.json(rows.map(r => r.commune));
}));

// GET /api/lieux/quartiers?region=CONAKRY&commune=RATOMA
router.get('/quartiers', authenticateToken, ah(async (req, res) => {
  const { region, commune } = req.query;
  if (!commune) return res.status(400).json({ error: 'commune requis' });
  let sql = 'SELECT DISTINCT quartier FROM lieux WHERE commune = ?';
  const args = [commune];
  if (region) { sql += ' AND region = ?'; args.push(region); }
  sql += ' ORDER BY quartier';
  const rows = await all(sql, args);
  res.json(rows.map(r => r.quartier));
}));

module.exports = router;
