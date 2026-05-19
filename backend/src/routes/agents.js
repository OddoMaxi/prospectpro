const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { db, get, all, run } = require('../database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { generatePassword } = require('../utils/passwordGenerator');

const router = express.Router();
const ah = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const MULTIPLIERS = { annuel: 12, semestre: 6, trimestre: 3, mensuel: 1 };

async function saveObjectives(agentId, product_objectives) {
  await run("DELETE FROM agent_product_objectives WHERE agent_id=?", [agentId]);
  for (const obj of (product_objectives || [])) {
    const mensuel = Number(obj.objectif_mensuel) || 0;
    if (mensuel <= 0) continue;
    const mult = MULTIPLIERS[obj.periode] || 12;
    await run(
      `INSERT INTO agent_product_objectives (id, agent_id, product_id, objectif_mensuel, periode, objectif_annuel)
       VALUES (?,?,?,?,?,?)`,
      [uuidv4(), agentId, obj.product_id, mensuel, obj.periode || 'annuel', mensuel * mult]
    );
  }
}

router.post('/', authenticateToken, requireAdmin, ah(async (req, res) => {
  const {
    type_agent = 'physique',
    nom, prenom,
    raison_sociale, representant_legal,
    email, telephone,
    taux_commission,
    product_objectives
  } = req.body;

  const isMorale = type_agent === 'morale';

  if (isMorale) {
    if (!raison_sociale) return res.status(400).json({ error: 'Raison sociale requise' });
  } else {
    if (!nom || !prenom) return res.status(400).json({ error: 'Nom et prénom requis' });
  }

  const agentNom    = isMorale ? raison_sociale : nom;
  const agentPrenom = isMorale ? '' : prenom;

  const usernameBase = isMorale
    ? (raison_sociale || '').toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 8) || 'agent'
    : ((prenom || '').charAt(0) + (nom || '')).toLowerCase().replace(/[^a-z0-9]/g, '');

  let username = usernameBase, n = 1;
  while (await get('SELECT id FROM users WHERE username = ?', [username])) {
    username = usernameBase + n++;
  }

  // Calcul des objectifs globaux depuis les objectifs par produit
  const objectives = (product_objectives || []).filter(o => Number(o.objectif_mensuel) > 0);
  const totalMensuel = objectives.reduce((s, o) => s + Number(o.objectif_mensuel), 0);
  const totalAnnuel  = objectives.reduce((s, o) => {
    const mult = MULTIPLIERS[o.periode] || 12;
    return s + Number(o.objectif_mensuel) * mult;
  }, 0);

  const tempPassword = generatePassword();
  const id = uuidv4();

  await run(
    `INSERT INTO users (id, nom, prenom, email, telephone, role, username, password_hash,
       must_change_password, objectif_mensuel, objectif_annuel, taux_commission,
       type_agent, raison_sociale, representant_legal)
     VALUES (?,?,?,?,?,'agent',?,?,1,?,?,?,?,?,?)`,
    [id, agentNom, agentPrenom, email || null, telephone || null,
     username, bcrypt.hashSync(tempPassword, 10),
     totalMensuel, totalAnnuel, Number(taux_commission) || 5.0,
     type_agent, isMorale ? raison_sociale : null,
     isMorale ? (representant_legal || null) : null]
  );

  await saveObjectives(id, product_objectives);

  res.status(201).json({
    message: 'Agent créé avec succès',
    agent: { id, nom: agentNom, prenom: agentPrenom, email, telephone, username },
    credentials: { username, temp_password: tempPassword }
  });
}));

router.get('/', authenticateToken, requireAdmin, ah(async (req, res) => {
  const agents = await all(`
    SELECT u.id, u.nom, u.prenom, u.email, u.telephone, u.username,
           u.objectif_mensuel, u.objectif_annuel, u.taux_commission, u.is_active, u.created_at,
           u.type_agent, u.raison_sociale, u.representant_legal,
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
    `SELECT id, nom, prenom, email, telephone, username, objectif_mensuel, objectif_annuel,
            taux_commission, is_active, created_at, type_agent, raison_sociale, representant_legal
     FROM users WHERE id = ? AND role = 'agent'`,
    [req.params.id]
  );
  if (!agent) return res.status(404).json({ error: 'Agent non trouvé' });

  const product_objectives = await all(
    `SELECT apo.product_id, apo.objectif_mensuel, apo.periode, apo.objectif_annuel,
            p.nom as product_nom, p.prime_annuelle
     FROM agent_product_objectives apo
     JOIN products p ON p.id = apo.product_id
     WHERE apo.agent_id = ? ORDER BY p.nom`,
    [req.params.id]
  );

  res.json({ ...agent, product_objectives });
}));

router.put('/:id', authenticateToken, requireAdmin, ah(async (req, res) => {
  const {
    nom, prenom, email, telephone, taux_commission, is_active,
    type_agent, raison_sociale, representant_legal, product_objectives
  } = req.body;

  const agent = await get("SELECT id FROM users WHERE id = ? AND role = 'agent'", [req.params.id]);
  if (!agent) return res.status(404).json({ error: 'Agent non trouvé' });

  const isMorale = type_agent === 'morale';
  const agentNom    = isMorale ? raison_sociale : nom;
  const agentPrenom = isMorale ? '' : prenom;

  const objectives = (product_objectives || []).filter(o => Number(o.objectif_mensuel) > 0);
  const totalMensuel = objectives.reduce((s, o) => s + Number(o.objectif_mensuel), 0);
  const totalAnnuel  = objectives.reduce((s, o) => {
    const mult = MULTIPLIERS[o.periode] || 12;
    return s + Number(o.objectif_mensuel) * mult;
  }, 0);

  await run(
    `UPDATE users SET nom=?,prenom=?,email=?,telephone=?,
       objectif_mensuel=?,objectif_annuel=?,taux_commission=?,is_active=?,
       type_agent=?,raison_sociale=?,representant_legal=?,updated_at=datetime('now')
     WHERE id=?`,
    [agentNom, agentPrenom, isMorale ? (email || null) : null, telephone || null,
     totalMensuel, totalAnnuel, Number(taux_commission) || 5.0,
     is_active !== undefined ? (is_active ? 1 : 0) : 1,
     type_agent || 'physique',
     isMorale ? raison_sociale : null,
     isMorale ? (representant_legal || null) : null,
     req.params.id]
  );

  await saveObjectives(req.params.id, product_objectives);

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
      { sql: 'DELETE FROM agent_product_objectives WHERE agent_id = ?', args: [req.params.id] },
      { sql: 'DELETE FROM users WHERE id = ?', args: [req.params.id] }
    ], 'write');
  } else {
    await db.batch([
      { sql: 'DELETE FROM prospects WHERE agent_id = ?', args: [req.params.id] },
      { sql: 'DELETE FROM agent_product_objectives WHERE agent_id = ?', args: [req.params.id] },
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

// Transférer tout le portefeuille vers un autre agent sans supprimer la source
router.post('/:id/transfer-portfolio', authenticateToken, requireAdmin, ah(async (req, res) => {
  const { transfer_to } = req.body;
  if (!transfer_to) return res.status(400).json({ error: 'Agent cible requis' });
  if (req.params.id === transfer_to) return res.status(400).json({ error: 'Source et cible identiques' });

  const source = await get("SELECT id, nom, prenom FROM users WHERE id=? AND role='agent'", [req.params.id]);
  if (!source) return res.status(404).json({ error: 'Agent source introuvable' });

  const target = await get("SELECT id, nom, prenom FROM users WHERE id=? AND role='agent' AND is_active=1", [transfer_to]);
  if (!target) return res.status(400).json({ error: 'Agent cible introuvable ou inactif' });

  const result = await run("UPDATE prospects SET agent_id=? WHERE agent_id=?", [transfer_to, req.params.id]);
  const count = Number(result.rowsAffected) || 0;

  res.json({
    message: `${count} prospect(s) transféré(s) de ${source.prenom} ${source.nom} vers ${target.prenom} ${target.nom}`,
    count
  });
}));

module.exports = router;
