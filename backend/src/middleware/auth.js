const jwt = require('jsonwebtoken');
const { get, run, tx } = require('../database');
const { restituer } = require('../utils/affectations');
const { audit } = require('../utils/audit');
const { personName } = require('../utils/names');

const JWT_SECRET = process.env.JWT_SECRET || 'prospection_jwt_secret_change_in_production_2024';
const BLOCKED = ['suspendu', 'supprime'];

// Un agent inactif qui revient : il redevient actif et récupère son portefeuille temporairement transféré
async function reprendreActivite(user) {
  await tx(async q => {
    await q.run("UPDATE users SET statut = 'actif', statut_depuis = NOW() WHERE id = ?", [user.id]);
    const n = await restituer(q, user.id, user.id);
    await audit({ user }, 'reprise_activite', { type: 'agent', id: user.id, label: user.label, apres: { elements_restitues: n } }, q);
  });
}

async function authenticateToken(req, res, next) {
  const token = (req.headers['authorization'] || '').split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token manquant' });
  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Session expirée, veuillez vous reconnecter' });
  }
  try {
    // Le statut est relu à chaque requête : une suspension prend effet immédiatement
    const u = await get(
      `SELECT id, username, role, statut, parent_agent_id, nom, prenom, raison_sociale, type_agent,
              (last_activity_at IS NULL OR last_activity_at < NOW() - INTERVAL '5 minutes') AS stale
       FROM users WHERE id = ?`, [payload.id]);
    if (!u || BLOCKED.includes(u.statut)) {
      return res.status(401).json({ error: 'Compte suspendu ou supprimé', code: 'ACCOUNT_BLOCKED' });
    }
    req.user = {
      id: u.id, username: u.username, role: u.role, parent_agent_id: u.parent_agent_id || null,
      must_change_password: payload.must_change_password, label: personName(u) || u.username,
    };
    if (u.statut === 'inactif') await reprendreActivite(req.user);
    if (u.stale) await run('UPDATE users SET last_activity_at = NOW() WHERE id = ?', [u.id]);
    next();
  } catch (e) {
    next(e);
  }
}

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Accès réservé aux administrateurs' });
  next();
}

function requireAgent(req, res, next) {
  if (req.user.role !== 'agent') return res.status(403).json({ error: 'Accès réservé aux agents' });
  next();
}

// Sénior = agent sans parent
function requireSenior(req, res, next) {
  if (req.user.role !== 'agent' || req.user.parent_agent_id) {
    return res.status(403).json({ error: 'Accès réservé aux agents Séniors' });
  }
  next();
}

module.exports = { authenticateToken, requireAdmin, requireAgent, requireSenior, reprendreActivite, JWT_SECRET };
