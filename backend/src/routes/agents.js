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

// ─── Routes sous-agents (accessibles par les agents) ─────────────────────────
// Ces routes doivent être placées AVANT /:id pour éviter les conflits

// Lister les sous-agents de l'agent connecté
router.get('/sous-agents', authenticateToken, ah(async (req, res) => {
  if (req.user.role !== 'agent') return res.status(403).json({ error: 'Accès réservé aux agents' });

  const sousAgents = await all(`
    SELECT u.id, u.nom, u.prenom, u.email, u.telephone, u.username,
           u.objectif_mensuel, u.objectif_annuel, u.taux_commission, u.taux_commission_parent,
           u.is_active, u.created_at, u.type_agent, u.raison_sociale,
           COUNT(p.id) as total_prospects,
           SUM(CASE WHEN p.statut = 'client' THEN 1 ELSE 0 END) as total_clients,
           COALESCE(SUM(p.montant_potentiel * p.taux_commission / 100), 0) as commission_agent,
           COALESCE(SUM(p.montant_potentiel), 0) as prime_total
    FROM users u LEFT JOIN prospects p ON p.agent_id = u.id
    WHERE u.parent_agent_id = ?
    GROUP BY u.id ORDER BY u.nom, u.prenom
  `, [req.user.id]);

  res.json(sousAgents);
}));

// Créer un sous-agent
router.post('/sous-agents', authenticateToken, ah(async (req, res) => {
  if (req.user.role !== 'agent') return res.status(403).json({ error: 'Accès réservé aux agents' });

  // Un sous-agent ne peut pas créer de sous-agents
  const currentUser = await get("SELECT parent_agent_id FROM users WHERE id=?", [req.user.id]);
  if (currentUser && currentUser.parent_agent_id) {
    return res.status(403).json({ error: 'Les sous-agents ne peuvent pas créer de sous-agents' });
  }

  const {
    type_agent = 'physique',
    nom, prenom,
    raison_sociale, representant_legal,
    email, telephone,
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
       type_agent, raison_sociale, representant_legal, parent_agent_id)
     VALUES (?,?,?,?,?,'agent',?,?,1,?,?,5.0,?,?,?,?)`,
    [id, agentNom, agentPrenom, email || null, telephone || null,
     username, bcrypt.hashSync(tempPassword, 10),
     totalMensuel, totalAnnuel,
     type_agent, isMorale ? raison_sociale : null,
     isMorale ? (representant_legal || null) : null,
     req.user.id]
  );

  await saveObjectives(id, product_objectives);

  res.status(201).json({
    message: 'Sous-agent créé avec succès',
    agent: { id, nom: agentNom, prenom: agentPrenom, email, telephone, username },
    credentials: { username, temp_password: tempPassword }
  });
}));

// Obtenir les détails d'un sous-agent
router.get('/sous-agents/:id', authenticateToken, ah(async (req, res) => {
  if (req.user.role !== 'agent') return res.status(403).json({ error: 'Accès réservé aux agents' });

  const agent = await get(
    `SELECT id, nom, prenom, email, telephone, username, objectif_mensuel, objectif_annuel,
            taux_commission, taux_commission_parent, is_active, created_at,
            type_agent, raison_sociale, representant_legal
     FROM users WHERE id = ? AND parent_agent_id = ? AND role = 'agent'`,
    [req.params.id, req.user.id]
  );
  if (!agent) return res.status(404).json({ error: 'Sous-agent non trouvé' });

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

// Modifier les objectifs d'un sous-agent (l'agent parent ne peut pas modifier les taux de commission)
router.put('/sous-agents/:id', authenticateToken, ah(async (req, res) => {
  if (req.user.role !== 'agent') return res.status(403).json({ error: 'Accès réservé aux agents' });

  const agent = await get(
    "SELECT id FROM users WHERE id=? AND parent_agent_id=? AND role='agent'",
    [req.params.id, req.user.id]
  );
  if (!agent) return res.status(404).json({ error: 'Sous-agent non trouvé' });

  const {
    nom, prenom, email, telephone,
    type_agent, raison_sociale, representant_legal, product_objectives
  } = req.body;

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
       objectif_mensuel=?,objectif_annuel=?,
       type_agent=?,raison_sociale=?,representant_legal=?,updated_at=NOW()
     WHERE id=?`,
    [agentNom, agentPrenom, email || null, telephone || null,
     totalMensuel, totalAnnuel,
     type_agent || 'physique',
     isMorale ? raison_sociale : null,
     isMorale ? (representant_legal || null) : null,
     req.params.id]
  );

  await saveObjectives(req.params.id, product_objectives);

  res.json({ message: 'Sous-agent mis à jour avec succès' });
}));

// Supprimer un sous-agent
router.delete('/sous-agents/:id', authenticateToken, ah(async (req, res) => {
  if (req.user.role !== 'agent') return res.status(403).json({ error: 'Accès réservé aux agents' });

  const { transfer_to } = req.body;
  const agent = await get(
    "SELECT id FROM users WHERE id=? AND parent_agent_id=? AND role='agent'",
    [req.params.id, req.user.id]
  );
  if (!agent) return res.status(404).json({ error: 'Sous-agent non trouvé' });

  if (transfer_to) {
    const target = await get("SELECT id FROM users WHERE id=? AND role='agent' AND is_active=1", [transfer_to]);
    if (!target) return res.status(400).json({ error: 'Agent cible introuvable' });
    await db.batch([
      { sql: 'UPDATE prospects SET agent_id=? WHERE agent_id=?', args: [transfer_to, req.params.id] },
      { sql: 'DELETE FROM agent_product_objectives WHERE agent_id=?', args: [req.params.id] },
      { sql: 'DELETE FROM users WHERE id=?', args: [req.params.id] }
    ]);
  } else {
    await db.batch([
      { sql: 'DELETE FROM prospects WHERE agent_id=?', args: [req.params.id] },
      { sql: 'DELETE FROM agent_product_objectives WHERE agent_id=?', args: [req.params.id] },
      { sql: 'DELETE FROM users WHERE id=?', args: [req.params.id] }
    ]);
  }
  res.json({ message: 'Sous-agent supprimé avec succès' });
}));

// Réinitialiser le mot de passe d'un sous-agent
router.post('/sous-agents/:id/reset-password', authenticateToken, ah(async (req, res) => {
  if (req.user.role !== 'agent') return res.status(403).json({ error: 'Accès réservé aux agents' });

  const agent = await get(
    "SELECT id FROM users WHERE id=? AND parent_agent_id=? AND role='agent'",
    [req.params.id, req.user.id]
  );
  if (!agent) return res.status(404).json({ error: 'Sous-agent non trouvé' });

  const tempPassword = generatePassword();
  await run(
    "UPDATE users SET password_hash=?,must_change_password=1,updated_at=NOW() WHERE id=?",
    [bcrypt.hashSync(tempPassword, 10), req.params.id]
  );

  res.json({ message: 'Mot de passe réinitialisé', credentials: { temp_password: tempPassword } });
}));

// ─── Routes admin ─────────────────────────────────────────────────────────────

// Admin: créer un agent
router.post('/', authenticateToken, requireAdmin, ah(async (req, res) => {
  const {
    type_agent = 'physique',
    nom, prenom, sexe,
    raison_sociale, representant_legal,
    email, telephone,
    taux_commission,
    product_objectives
  } = req.body;

  const isMorale = type_agent === 'morale';

  if (isMorale) {
    if (!raison_sociale)      return res.status(400).json({ error: 'Raison sociale requise' });
    if (!representant_legal)  return res.status(400).json({ error: 'Représentant légal requis' });
    if (!telephone)           return res.status(400).json({ error: 'Numéro de téléphone requis' });
  } else {
    if (!nom || !prenom)  return res.status(400).json({ error: 'Nom et prénom requis' });
    if (!telephone)       return res.status(400).json({ error: 'Numéro de téléphone requis' });
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

  const objectives = (product_objectives || []).filter(o => Number(o.objectif_mensuel) > 0);
  const totalMensuel = objectives.reduce((s, o) => s + Number(o.objectif_mensuel), 0);
  const totalAnnuel  = objectives.reduce((s, o) => {
    const mult = MULTIPLIERS[o.periode] || 12;
    return s + Number(o.objectif_mensuel) * mult;
  }, 0);

  const tempPassword = generatePassword();
  const id = uuidv4();

  await run(
    `INSERT INTO users (id, nom, prenom, sexe, email, telephone, role, username, password_hash,
       must_change_password, objectif_mensuel, objectif_annuel, taux_commission,
       type_agent, raison_sociale, representant_legal)
     VALUES (?,?,?,?,?,?,'agent',?,?,1,?,?,?,?,?,?)`,
    [id, agentNom, agentPrenom, isMorale ? null : (sexe || null), isMorale ? (email || null) : null, telephone || null,
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

// Admin: lister tous les agents (y compris les sous-agents)
router.get('/', authenticateToken, requireAdmin, ah(async (req, res) => {
  const agents = await all(`
    SELECT u.id, u.nom, u.prenom, u.email, u.telephone, u.username,
           u.objectif_mensuel, u.objectif_annuel, u.taux_commission, u.taux_commission_parent,
           u.is_active, u.created_at, u.type_agent, u.raison_sociale, u.representant_legal,
           u.parent_agent_id,
           pa.nom as parent_nom, pa.prenom as parent_prenom, pa.raison_sociale as parent_raison_sociale,
           COUNT(p.id) as total_prospects,
           SUM(CASE WHEN p.statut = 'client' THEN 1 ELSE 0 END) as total_clients
    FROM users u
    LEFT JOIN prospects p ON p.agent_id = u.id
    LEFT JOIN users pa ON pa.id = u.parent_agent_id
    WHERE u.role = 'agent'
    GROUP BY u.id ORDER BY u.nom, u.prenom
  `);
  res.json(agents);
}));

// Admin: obtenir un agent par ID
router.get('/:id', authenticateToken, requireAdmin, ah(async (req, res) => {
  const agent = await get(
    `SELECT id, nom, prenom, sexe, email, telephone, username, objectif_mensuel, objectif_annuel,
            taux_commission, taux_commission_parent, is_active, created_at,
            type_agent, raison_sociale, representant_legal, parent_agent_id
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

// Admin: modifier un Agent Commercial Séniore uniquement
router.put('/:id', authenticateToken, requireAdmin, ah(async (req, res) => {
  const {
    nom, prenom, sexe, email, telephone, taux_commission, taux_commission_parent, is_active,
    type_agent, raison_sociale, representant_legal, product_objectives
  } = req.body;

  const agent = await get("SELECT id, parent_agent_id FROM users WHERE id = ? AND role = 'agent'", [req.params.id]);
  if (!agent) return res.status(404).json({ error: 'Agent non trouvé' });
  if (agent.parent_agent_id) {
    return res.status(403).json({ error: 'Modification des Agents Commerciaux Juniors réservée à l\'agent parent' });
  }

  const isMorale = type_agent === 'morale';

  if (isMorale) {
    if (!raison_sociale)     return res.status(400).json({ error: 'Raison sociale requise' });
    if (!representant_legal) return res.status(400).json({ error: 'Représentant légal requis' });
    if (!telephone)          return res.status(400).json({ error: 'Numéro de téléphone requis' });
  } else {
    if (!nom || !prenom) return res.status(400).json({ error: 'Nom et prénom requis' });
    if (!telephone)      return res.status(400).json({ error: 'Numéro de téléphone requis' });
  }

  const agentNom    = isMorale ? raison_sociale : nom;
  const agentPrenom = isMorale ? '' : prenom;

  const objectives = (product_objectives || []).filter(o => Number(o.objectif_mensuel) > 0);
  const totalMensuel = objectives.reduce((s, o) => s + Number(o.objectif_mensuel), 0);
  const totalAnnuel  = objectives.reduce((s, o) => {
    const mult = MULTIPLIERS[o.periode] || 12;
    return s + Number(o.objectif_mensuel) * mult;
  }, 0);

  await run(
    `UPDATE users SET nom=?,prenom=?,sexe=?,email=?,telephone=?,
       objectif_mensuel=?,objectif_annuel=?,taux_commission=?,taux_commission_parent=?,is_active=?,
       type_agent=?,raison_sociale=?,representant_legal=?,updated_at=NOW()
     WHERE id=?`,
    [agentNom, agentPrenom, isMorale ? null : (sexe || null),
     isMorale ? (email || null) : null, telephone || null,
     totalMensuel, totalAnnuel, Number(taux_commission) || 5.0,
     Number(taux_commission_parent) || 0,
     is_active !== undefined ? (is_active ? 1 : 0) : 1,
     type_agent || 'physique',
     isMorale ? raison_sociale : null,
     isMorale ? (representant_legal || null) : null,
     req.params.id]
  );

  await saveObjectives(req.params.id, product_objectives);

  res.json({ message: 'Agent mis à jour avec succès' });
}));

// Admin: supprimer un agent
router.delete('/:id', authenticateToken, requireAdmin, ah(async (req, res) => {
  const { transfer_to, type } = req.body;
  const agent = await get("SELECT id FROM users WHERE id = ? AND role = 'agent'", [req.params.id]);
  if (!agent) return res.status(404).json({ error: 'Agent non trouvé' });

  const typeFilter = type && ['physique', 'morale'].includes(type) ? type : null;

  if (transfer_to) {
    const target = await get("SELECT id FROM users WHERE id = ? AND role = 'agent' AND is_active = 1", [transfer_to]);
    if (!target) return res.status(400).json({ error: 'Agent cible introuvable' });

    if (typeFilter) {
      // Transférer les prospects du type sélectionné, supprimer les autres
      await run(
        'UPDATE prospects SET agent_id = ? WHERE agent_id = ? AND type = ?',
        [transfer_to, req.params.id, typeFilter]
      );
      await run('DELETE FROM prospect_products WHERE prospect_id IN (SELECT id FROM prospects WHERE agent_id = ?)', [req.params.id]);
      await run('DELETE FROM prospects WHERE agent_id = ?', [req.params.id]);
    } else {
      await run('UPDATE prospects SET agent_id = ? WHERE agent_id = ?', [transfer_to, req.params.id]);
    }
    await db.batch([
      { sql: 'UPDATE users SET parent_agent_id = NULL WHERE parent_agent_id = ?', args: [req.params.id] },
      { sql: 'DELETE FROM agent_product_objectives WHERE agent_id = ?', args: [req.params.id] },
      { sql: 'DELETE FROM users WHERE id = ?', args: [req.params.id] }
    ]);
  } else {
    await db.batch([
      { sql: 'DELETE FROM prospect_products WHERE prospect_id IN (SELECT id FROM prospects WHERE agent_id = ?)', args: [req.params.id] },
      { sql: 'DELETE FROM prospects WHERE agent_id = ?', args: [req.params.id] },
      { sql: 'UPDATE users SET parent_agent_id = NULL WHERE parent_agent_id = ?', args: [req.params.id] },
      { sql: 'DELETE FROM agent_product_objectives WHERE agent_id = ?', args: [req.params.id] },
      { sql: 'DELETE FROM users WHERE id = ?', args: [req.params.id] }
    ]);
  }
  res.json({ message: 'Agent supprimé avec succès' });
}));

// Admin: réinitialiser le mot de passe d'un agent
router.post('/:id/reset-password', authenticateToken, requireAdmin, ah(async (req, res) => {
  const agent = await get("SELECT id FROM users WHERE id = ? AND role = 'agent'", [req.params.id]);
  if (!agent) return res.status(404).json({ error: 'Agent non trouvé' });

  const tempPassword = generatePassword();
  await run("UPDATE users SET password_hash=?,must_change_password=1,updated_at=NOW() WHERE id=?",
    [bcrypt.hashSync(tempPassword, 10), req.params.id]);

  res.json({ message: 'Mot de passe réinitialisé', credentials: { temp_password: tempPassword } });
}));

// Admin: transférer le portefeuille vers un autre agent (avec filtre optionnel par type)
router.post('/:id/transfer-portfolio', authenticateToken, requireAdmin, ah(async (req, res) => {
  const { transfer_to, type } = req.body;
  if (!transfer_to) return res.status(400).json({ error: 'Agent cible requis' });
  if (req.params.id === transfer_to) return res.status(400).json({ error: 'Source et cible identiques' });

  const source = await get("SELECT id, nom, prenom, raison_sociale, type_agent FROM users WHERE id=? AND role='agent'", [req.params.id]);
  if (!source) return res.status(404).json({ error: 'Agent source introuvable' });

  const target = await get("SELECT id, nom, prenom, raison_sociale, type_agent FROM users WHERE id=? AND role='agent' AND is_active=1", [transfer_to]);
  if (!target) return res.status(400).json({ error: 'Agent cible introuvable ou inactif' });

  const typeFilter = type && ['physique', 'morale'].includes(type) ? type : null;
  let sql = "UPDATE prospects SET agent_id=? WHERE agent_id=?";
  const args = [transfer_to, req.params.id];
  if (typeFilter) { sql += " AND type=?"; args.push(typeFilter); }

  const result = await run(sql, args);
  const count = Number(result.rowsAffected) || 0;

  const sourceName = source.type_agent === 'morale' ? source.raison_sociale : `${source.prenom} ${source.nom}`;
  const targetName = target.type_agent === 'morale' ? target.raison_sociale : `${target.prenom} ${target.nom}`;
  const typeLabel  = typeFilter === 'physique' ? ' particuliers' : typeFilter === 'morale' ? ' entreprises' : '';

  res.json({
    message: `${count} prospect(s)${typeLabel} transféré(s) de ${sourceName} vers ${targetName}`,
    count
  });
}));

module.exports = router;
