// Journal d'audit, paramètres, notifications et historique des affectations
const express = require('express');
const { get, all, run } = require('../database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { ah, HttpError } = require('../utils/http');
const { audit } = require('../utils/audit');

const router = express.Router();

// ── Journal d'audit ─────────────────────────────────────────────────────────
router.get('/audit', authenticateToken, requireAdmin, ah(async (req, res) => {
  const { user_id, action, entity_type, date_debut, date_fin, search } = req.query;
  const limit = Math.min(2000, parseInt(req.query.limit, 10) || 500);
  const args = [];
  let sql = 'SELECT * FROM audit_log WHERE 1=1';
  if (user_id) { sql += ' AND user_id = ?'; args.push(user_id); }
  if (action) { sql += ' AND action = ?'; args.push(action); }
  if (entity_type) { sql += ' AND entity_type = ?'; args.push(entity_type); }
  if (date_debut) { sql += ' AND created_at >= ?'; args.push(date_debut); }
  if (date_fin) { sql += " AND created_at < (?::date + INTERVAL '1 day')"; args.push(date_fin); }
  if (search) { sql += ' AND (entity_label ILIKE ? OR user_label ILIKE ?)'; args.push(`%${search}%`, `%${search}%`); }
  sql += ` ORDER BY created_at DESC LIMIT ${limit}`;
  res.json(await all(sql, args));
}));

router.get('/audit/filtres', authenticateToken, requireAdmin, ah(async (req, res) => {
  const [actions, users, types] = await Promise.all([
    all('SELECT DISTINCT action FROM audit_log ORDER BY action'),
    all('SELECT DISTINCT user_id, user_label FROM audit_log WHERE user_id IS NOT NULL ORDER BY user_label'),
    all('SELECT DISTINCT entity_type FROM audit_log WHERE entity_type IS NOT NULL ORDER BY entity_type'),
  ]);
  res.json({ actions: actions.map(a => a.action), users, types: types.map(t => t.entity_type) });
}));

// ── Paramètres ──────────────────────────────────────────────────────────────
router.get('/parametres', authenticateToken, ah(async (req, res) => {
  const rows = await all('SELECT cle, valeur, libelle, type FROM parametres ORDER BY cle');
  res.json(rows);
}));

router.put('/parametres', authenticateToken, requireAdmin, ah(async (req, res) => {
  const values = req.body || {};
  const rows = await all('SELECT * FROM parametres');
  const changes = { avant: {}, apres: {} };
  for (const r of rows) {
    if (!(r.cle in values)) continue;
    let v = values[r.cle] === null || values[r.cle] === undefined ? '' : String(values[r.cle]).trim();
    if (r.type === 'int' && !(Number.isInteger(Number(v)) && Number(v) >= 0)) throw new HttpError(400, `${r.libelle} : nombre entier attendu`);
    if (r.type === 'float' && !(Number(v) > 0 && Number(v) <= 1)) throw new HttpError(400, `${r.libelle} : valeur entre 0 et 1 attendue`);
    if (r.cle === 'alertes_echeance_jours' && !/^\d+(\s*,\s*\d+)*$/.test(v)) throw new HttpError(400, `${r.libelle} : liste de nombres attendue (ex. 60,45,30)`);
    if (r.type === 'agent' && v) {
      const a = await get("SELECT id FROM users WHERE id = ? AND role = 'agent' AND statut = 'actif'", [v]);
      if (!a) throw new HttpError(400, `${r.libelle} : agent introuvable ou non actif`);
    }
    if (v !== (r.valeur || '')) {
      changes.avant[r.cle] = r.valeur;
      changes.apres[r.cle] = v;
      await run('UPDATE parametres SET valeur = ?, updated_at = NOW() WHERE cle = ?', [v, r.cle]);
    }
  }
  if (Object.keys(changes.apres).length) await audit(req, 'modification_parametres', { type: 'parametres', ...changes });
  res.json({ message: 'Paramètres enregistrés' });
}));

// ── Notifications ───────────────────────────────────────────────────────────
function notifWhere(req, args) {
  if (req.user.role === 'admin') return '(user_id IS NULL OR user_id = ?)';
  args.push(req.user.id);
  return 'user_id = ?';
}

router.get('/notifications', authenticateToken, ah(async (req, res) => {
  const args = req.user.role === 'admin' ? [req.user.id] : [];
  const where = notifWhere(req, args);
  const rows = await all(`SELECT * FROM notifications WHERE ${where} ORDER BY created_at DESC LIMIT 100`, args);
  res.json({ items: rows, non_lues: rows.filter(r => !r.lu_le).length });
}));

router.post('/notifications/lire', authenticateToken, ah(async (req, res) => {
  const args = req.user.role === 'admin' ? [req.user.id] : [];
  const where = notifWhere(req, args);
  if (req.body.id) {
    args.push(req.body.id);
    await run(`UPDATE notifications SET lu_le = NOW() WHERE ${where} AND id = ?`, args);
  } else {
    await run(`UPDATE notifications SET lu_le = NOW() WHERE ${where} AND lu_le IS NULL`, args);
  }
  res.json({ ok: true });
}));

// ── Historique des affectations ─────────────────────────────────────────────
router.get('/affectations', authenticateToken, requireAdmin, ah(async (req, res) => {
  const { agent_id, type, motif, entity_type, en_cours } = req.query;
  const args = [];
  let sql = `SELECT a.*,
      o.nom AS origine_nom, o.prenom AS origine_prenom, o.raison_sociale AS origine_raison_sociale, o.type_agent AS origine_type_agent,
      d.nom AS dest_nom, d.prenom AS dest_prenom, d.raison_sociale AS dest_raison_sociale, d.type_agent AS dest_type_agent,
      x.nom AS auteur_nom, x.prenom AS auteur_prenom,
      COALESCE(c.numero, p.numero) AS entity_numero, COALESCE(c.nom, p.nom) AS entity_nom,
      COALESCE(c.prenom, p.prenom) AS entity_prenom, COALESCE(c.type, p.type) AS entity_kind
    FROM affectations a
    LEFT JOIN users o ON o.id = a.agent_origine_id
    JOIN users d ON d.id = a.agent_destinataire_id
    LEFT JOIN users x ON x.id = a.auteur_id
    LEFT JOIN clients c ON a.entity_type = 'client' AND c.id = a.entity_id
    LEFT JOIN prospects p ON a.entity_type = 'prospect' AND p.id = a.entity_id
    WHERE a.motif <> 'creation'`;
  if (agent_id) { sql += ' AND (a.agent_origine_id = ? OR a.agent_destinataire_id = ?)'; args.push(agent_id, agent_id); }
  if (type) { sql += ' AND a.type = ?'; args.push(type); }
  if (motif) { sql += ' AND a.motif = ?'; args.push(motif); }
  if (entity_type) { sql += ' AND a.entity_type = ?'; args.push(entity_type); }
  if (en_cours === '1') sql += ' AND a.date_fin IS NULL';
  sql += ' ORDER BY a.date_debut DESC LIMIT 1000';
  res.json(await all(sql, args));
}));

module.exports = router;
