const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { get, all, run, tx } = require('../database');
const { authenticateToken, requireAdmin, requireSenior, reprendreActivite } = require('../middleware/auth');
const { generatePassword } = require('../utils/passwordGenerator');
const { ah, HttpError } = require('../utils/http');
const { audit } = require('../utils/audit');
const { personName } = require('../utils/names');
const { portefeuille, transfererPortefeuille } = require('../utils/affectations');

const router = express.Router();

const MULTIPLIERS = { annuel: 12, semestre: 6, trimestre: 3, mensuel: 1 };
const PERIODES = Object.keys(MULTIPLIERS);

const AGENT_COLS = `u.id, u.nom, u.prenom, u.sexe, u.email, u.telephone, u.username, u.type_agent,
  u.raison_sociale, u.representant_legal, u.parent_agent_id, u.statut, u.statut_depuis,
  u.last_activity_at, u.interim_agent_id, u.created_at, u.deleted_at`;

// ── Objectifs ───────────────────────────────────────────────────────────────

async function getObjectives(q, agentId) {
  return q.all(
    `SELECT apo.product_id, apo.objectif_mensuel, apo.periode, apo.objectif_annuel, apo.updated_at,
            p.nom AS product_nom, p.prime_pure, p.statut AS product_statut
     FROM agent_product_objectives apo JOIN products p ON p.id = apo.product_id
     WHERE apo.agent_id = ? ORDER BY p.nom`, [agentId]);
}

function cleanObjectives(list) {
  return (list || [])
    .map(o => ({
      product_id: o.product_id,
      objectif_mensuel: Math.max(0, parseInt(o.objectif_mensuel, 10) || 0),
      periode: PERIODES.includes(o.periode) ? o.periode : 'annuel',
    }))
    .filter(o => o.product_id && o.objectif_mensuel > 0);
}

// Remplace les objectifs en conservant les anciennes valeurs dans l'historique
async function saveObjectives(q, agentId, list, userId) {
  const next = cleanObjectives(list);
  const prev = await getObjectives(q, agentId);
  const key = arr => JSON.stringify(arr.map(o => [o.product_id, Number(o.objectif_mensuel), o.periode]).sort());
  if (key(prev) === key(next)) return false;

  if (prev.length) {
    const since = prev.reduce((m, o) => (!m || o.updated_at < m ? o.updated_at : m), null);
    await q.run(
      'INSERT INTO objectifs_historique (id, agent_id, objectifs, valid_from, modifie_par) VALUES (?,?,?,?,?)',
      [uuidv4(), agentId, JSON.stringify(prev.map(o => ({
        product_id: o.product_id, product_nom: o.product_nom, objectif_mensuel: o.objectif_mensuel, periode: o.periode,
      }))), since, userId]
    );
  }
  await q.run('DELETE FROM agent_product_objectives WHERE agent_id = ?', [agentId]);
  let totalM = 0, totalA = 0;
  for (const o of next) {
    const annuel = o.objectif_mensuel * 12;
    totalM += o.objectif_mensuel; totalA += annuel;
    await q.run(
      `INSERT INTO agent_product_objectives (id, agent_id, product_id, objectif_mensuel, periode, objectif_annuel)
       VALUES (?,?,?,?,?,?)`, [uuidv4(), agentId, o.product_id, o.objectif_mensuel, o.periode, annuel]);
  }
  await q.run('UPDATE users SET objectif_mensuel = ?, objectif_annuel = ? WHERE id = ?', [totalM, totalA, agentId]);
  return true;
}

// ── Création / modification ────────────────────────────────────────────────

function readIdentity(body) {
  const type_agent = body.type_agent === 'morale' ? 'morale' : 'physique';
  const isMorale = type_agent === 'morale';
  if (isMorale) {
    if (!body.raison_sociale) throw new HttpError(400, 'Raison sociale requise');
    if (!body.representant_legal) throw new HttpError(400, 'Représentant légal requis');
  } else if (!body.nom || !body.prenom) {
    throw new HttpError(400, 'Nom et prénom requis');
  }
  if (!body.telephone) throw new HttpError(400, 'Numéro de téléphone requis');
  return {
    type_agent,
    nom: (isMorale ? body.raison_sociale : body.nom).trim(),
    prenom: isMorale ? '' : body.prenom.trim(),
    sexe: isMorale ? null : (body.sexe || null),
    raison_sociale: isMorale ? body.raison_sociale.trim() : null,
    representant_legal: isMorale ? body.representant_legal.trim() : null,
    email: body.email ? String(body.email).trim() : null,
    telephone: String(body.telephone).trim(),
  };
}

async function uniqueUsername(idt) {
  const base = (idt.type_agent === 'morale'
    ? idt.raison_sociale.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 8)
    : (idt.prenom.charAt(0) + idt.nom).toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '')) || 'agent';
  let username = base, n = 1;
  while (await get('SELECT id FROM users WHERE username = ?', [username])) username = base + n++;
  return username;
}

async function checkInterim(interimId, agentId) {
  if (!interimId) return null;
  if (interimId === agentId) throw new HttpError(400, "Un agent ne peut pas être son propre intérimaire");
  const i = await get("SELECT id FROM users WHERE id = ? AND role = 'agent' AND statut = 'actif'", [interimId]);
  if (!i) throw new HttpError(400, 'Agent intérimaire introuvable ou non actif');
  return interimId;
}

async function createAgent(req, parentId) {
  const idt = readIdentity(req.body);
  if (idt.email && await get('SELECT id FROM users WHERE email = ?', [idt.email])) {
    throw new HttpError(400, 'Cet email est déjà utilisé');
  }
  const username = await uniqueUsername(idt);
  const tempPassword = generatePassword();
  const id = uuidv4();
  const interim = parentId ? null : await checkInterim(req.body.interim_agent_id, id);

  await tx(async q => {
    await q.run(
      `INSERT INTO users (id, nom, prenom, sexe, email, telephone, role, username, password_hash,
         must_change_password, type_agent, raison_sociale, representant_legal, parent_agent_id, interim_agent_id)
       VALUES (?,?,?,?,?,?,'agent',?,?,1,?,?,?,?,?)`,
      [id, idt.nom, idt.prenom, idt.sexe, idt.email, idt.telephone, username,
       bcrypt.hashSync(tempPassword, 10), idt.type_agent, idt.raison_sociale, idt.representant_legal,
       parentId, interim]
    );
    await saveObjectives(q, id, req.body.product_objectives, req.user.id);
    await audit(req, parentId ? 'creation_junior' : 'creation_senior',
      { type: 'agent', id, label: personName(idt), apres: { ...idt, username, objectifs: cleanObjectives(req.body.product_objectives) } }, q);
  });

  return { agent: { id, nom: idt.nom, prenom: idt.prenom, username }, credentials: { username, temp_password: tempPassword } };
}

async function updateAgent(req, agentId) {
  const before = await get('SELECT * FROM users WHERE id = ?', [agentId]);
  const idt = readIdentity(req.body);
  if (idt.email && await get('SELECT id FROM users WHERE email = ? AND id <> ?', [idt.email, agentId])) {
    throw new HttpError(400, 'Cet email est déjà utilisé');
  }
  const interim = before.parent_agent_id ? null : await checkInterim(req.body.interim_agent_id, agentId);
  // Seul l'administrateur peut rattacher un Junior à un autre Sénior
  let parentId = before.parent_agent_id;
  if (req.user.role === 'admin' && before.parent_agent_id && req.body.parent_agent_id && req.body.parent_agent_id !== before.parent_agent_id) {
    const s = await get("SELECT id FROM users WHERE id = ? AND role = 'agent' AND parent_agent_id IS NULL AND statut = 'actif'", [req.body.parent_agent_id]);
    if (!s) throw new HttpError(400, 'Sénior de rattachement introuvable ou non actif');
    parentId = s.id;
  }
  await tx(async q => {
    const prevObj = await getObjectives(q, agentId);
    await q.run(
      `UPDATE users SET nom=?, prenom=?, sexe=?, email=?, telephone=?, type_agent=?, raison_sociale=?,
         representant_legal=?, interim_agent_id=?, parent_agent_id=?, updated_at=NOW() WHERE id=?`,
      [idt.nom, idt.prenom, idt.sexe, idt.email, idt.telephone, idt.type_agent, idt.raison_sociale,
       idt.representant_legal, interim, parentId, agentId]
    );
    if (parentId !== before.parent_agent_id) {
      await audit(req, 'changement_senior', { type: 'agent', id: agentId, label: personName(idt), avant: { parent_agent_id: before.parent_agent_id }, apres: { parent_agent_id: parentId } }, q);
    }
    const objChanged = await saveObjectives(q, agentId, req.body.product_objectives, req.user.id);
    await audit(req, 'modification_agent', {
      type: 'agent', id: agentId, label: personName(idt),
      avant: { ...pick(before), ...(objChanged ? { objectifs: prevObj.map(o => ({ produit: o.product_nom, mensuel: o.objectif_mensuel })) } : {}) },
      apres: { ...idt, interim_agent_id: interim, ...(objChanged ? { objectifs: cleanObjectives(req.body.product_objectives) } : {}) },
    }, q);
  });
}

const pick = u => ({
  nom: u.nom, prenom: u.prenom, sexe: u.sexe, email: u.email, telephone: u.telephone,
  type_agent: u.type_agent, raison_sociale: u.raison_sociale, representant_legal: u.representant_legal,
  interim_agent_id: u.interim_agent_id,
});

async function agentDetail(agentId) {
  const agent = await get(
    `SELECT ${AGENT_COLS}, pa.nom AS parent_nom, pa.prenom AS parent_prenom, pa.raison_sociale AS parent_raison_sociale,
            pa.type_agent AS parent_type_agent
     FROM users u LEFT JOIN users pa ON pa.id = u.parent_agent_id
     WHERE u.id = ? AND u.role = 'agent'`, [agentId]);
  if (!agent) throw new HttpError(404, 'Agent non trouvé');
  const product_objectives = await getObjectives({ all }, agentId);
  const historique_objectifs = await all(
    `SELECT h.*, m.nom AS modifie_par_nom, m.prenom AS modifie_par_prenom
     FROM objectifs_historique h LEFT JOIN users m ON m.id = h.modifie_par
     WHERE h.agent_id = ? ORDER BY h.valid_to DESC`, [agentId]);
  return { ...agent, product_objectives, historique_objectifs };
}

// ── Routes Sénior : gestion de ses Juniors ──────────────────────────────────

router.get('/sous-agents', authenticateToken, requireSenior, ah(async (req, res) => {
  res.json(await all(
    `SELECT ${AGENT_COLS},
       (SELECT COUNT(*) FROM prospects p WHERE p.agent_id = u.id AND p.deleted_at IS NULL AND p.statut NOT IN ('converti','client')) AS total_prospects,
       (SELECT COUNT(*) FROM clients c WHERE c.agent_id = u.id AND c.statut = 'actif') AS total_clients
     FROM users u WHERE u.parent_agent_id = ? AND u.role = 'agent' AND u.statut <> 'supprime'
     ORDER BY u.nom, u.prenom`, [req.user.id]));
}));

router.post('/sous-agents', authenticateToken, requireSenior, ah(async (req, res) => {
  const r = await createAgent(req, req.user.id);
  res.status(201).json({ message: 'Agent Junior créé avec succès', ...r });
}));

async function ownJunior(req) {
  const a = await get(
    "SELECT id FROM users WHERE id = ? AND parent_agent_id = ? AND role = 'agent' AND statut <> 'supprime'",
    [req.params.id, req.user.id]);
  if (!a) throw new HttpError(404, 'Agent Junior non trouvé');
}

router.get('/sous-agents/:id', authenticateToken, requireSenior, ah(async (req, res) => {
  await ownJunior(req);
  res.json(await agentDetail(req.params.id));
}));

router.put('/sous-agents/:id', authenticateToken, requireSenior, ah(async (req, res) => {
  await ownJunior(req);
  await updateAgent(req, req.params.id);
  res.json({ message: 'Agent Junior mis à jour' });
}));

router.post('/sous-agents/:id/reset-password', authenticateToken, requireSenior, ah(async (req, res) => {
  await ownJunior(req);
  const tempPassword = generatePassword();
  await run('UPDATE users SET password_hash=?, must_change_password=1, updated_at=NOW() WHERE id=?',
    [bcrypt.hashSync(tempPassword, 10), req.params.id]);
  await audit(req, 'reinitialisation_mot_de_passe', { type: 'agent', id: req.params.id });
  res.json({ message: 'Mot de passe réinitialisé', credentials: { temp_password: tempPassword } });
}));

// ── Routes administrateur ───────────────────────────────────────────────────

// Agents proposés dans les listes de sélection (transferts, intérim) : actifs uniquement
router.get('/selectable', authenticateToken, requireAdmin, ah(async (req, res) => {
  res.json(await all(
    `SELECT u.id, u.nom, u.prenom, u.raison_sociale, u.type_agent, u.parent_agent_id
     FROM users u WHERE u.role = 'agent' AND u.statut = 'actif' ORDER BY u.nom, u.prenom`));
}));

router.get('/', authenticateToken, requireAdmin, ah(async (req, res) => {
  const inclureSupprimes = req.query.inclure_supprimes === '1';
  res.json(await all(
    `SELECT ${AGENT_COLS},
       pa.nom AS parent_nom, pa.prenom AS parent_prenom, pa.raison_sociale AS parent_raison_sociale,
       pa.type_agent AS parent_type_agent,
       (SELECT COUNT(*) FROM prospects p WHERE p.agent_id = u.id AND p.deleted_at IS NULL AND p.statut NOT IN ('converti','client')) AS total_prospects,
       (SELECT COUNT(*) FROM clients c WHERE c.agent_id = u.id AND c.statut = 'actif') AS total_clients,
       (SELECT COUNT(*) FROM users j WHERE j.parent_agent_id = u.id AND j.statut <> 'supprime') AS total_juniors
     FROM users u LEFT JOIN users pa ON pa.id = u.parent_agent_id
     WHERE u.role = 'agent' ${inclureSupprimes ? '' : "AND u.statut <> 'supprime'"}
     ORDER BY u.nom, u.prenom`));
}));

// Seul l'administrateur crée des Séniors
router.post('/', authenticateToken, requireAdmin, ah(async (req, res) => {
  const r = await createAgent(req, null);
  res.status(201).json({ message: 'Agent Sénior créé avec succès', ...r });
}));

router.get('/:id', authenticateToken, requireAdmin, ah(async (req, res) => {
  res.json(await agentDetail(req.params.id));
}));

// L'administrateur modifie les Séniors et garde un droit de regard sur les Juniors
router.put('/:id', authenticateToken, requireAdmin, ah(async (req, res) => {
  const a = await get("SELECT id FROM users WHERE id = ? AND role = 'agent' AND statut <> 'supprime'", [req.params.id]);
  if (!a) throw new HttpError(404, 'Agent non trouvé');
  await updateAgent(req, req.params.id);
  res.json({ message: 'Agent mis à jour' });
}));

router.patch('/:id/statut', authenticateToken, requireAdmin, ah(async (req, res) => {
  const { action } = req.body;
  const a = await get("SELECT * FROM users WHERE id = ? AND role = 'agent'", [req.params.id]);
  if (!a || a.statut === 'supprime') throw new HttpError(404, 'Agent non trouvé');
  const label = personName(a);

  if (action === 'suspendre') {
    if (a.statut === 'suspendu') throw new HttpError(400, 'Agent déjà suspendu');
    await run("UPDATE users SET statut = 'suspendu', statut_depuis = NOW() WHERE id = ?", [a.id]);
    await audit(req, 'suspension_agent', { type: 'agent', id: a.id, label, avant: { statut: a.statut }, apres: { statut: 'suspendu' } });
    return res.json({ message: `${label} est suspendu : connexion bloquée` });
  }
  if (action === 'reactiver') {
    if (a.statut === 'actif') throw new HttpError(400, 'Agent déjà actif');
    if (a.statut === 'inactif') {
      await reprendreActivite({ id: a.id, username: a.username, role: 'agent', label });
    } else {
      await run("UPDATE users SET statut = 'actif', statut_depuis = NOW(), last_activity_at = NOW() WHERE id = ?", [a.id]);
    }
    await audit(req, 'reactivation_agent', { type: 'agent', id: a.id, label, avant: { statut: a.statut }, apres: { statut: 'actif' } });
    return res.json({ message: `${label} est réactivé` });
  }
  throw new HttpError(400, 'Action invalide');
}));

router.get('/:id/portefeuille', authenticateToken, requireAdmin, ah(async (req, res) => {
  const [clients, prospects] = await Promise.all([
    all(`SELECT c.id, c.numero, c.type, c.nom, c.prenom, c.telephone,
           (SELECT COUNT(*) FROM contrats k WHERE k.client_id = c.id AND k.statut = 'actif') AS nb_contrats
         FROM clients c WHERE c.agent_id = ? AND c.statut = 'actif' ORDER BY c.nom`, [req.params.id]),
    all(`SELECT id, numero, type, nom, prenom, telephone, statut FROM prospects
         WHERE agent_id = ? AND deleted_at IS NULL AND statut NOT IN ('converti','client') ORDER BY nom`, [req.params.id]),
  ]);
  res.json({ clients, prospects });
}));

// Transfert de portefeuille (global ou élément par élément), définitif ou temporaire
router.post('/:id/transferer', authenticateToken, requireAdmin, ah(async (req, res) => {
  const { destinataire_id, type = 'definitif', motif, client_ids, prospect_ids } = req.body;
  if (!['definitif', 'temporaire'].includes(type)) throw new HttpError(400, 'Type de transfert invalide');
  if (!destinataire_id || destinataire_id === req.params.id) throw new HttpError(400, 'Agent destinataire invalide');
  const [src, dst] = await Promise.all([
    get("SELECT * FROM users WHERE id = ? AND role = 'agent'", [req.params.id]),
    get("SELECT * FROM users WHERE id = ? AND role = 'agent' AND statut = 'actif'", [destinataire_id]),
  ]);
  if (!src) throw new HttpError(404, 'Agent source introuvable');
  if (!dst) throw new HttpError(400, 'Agent destinataire introuvable ou non actif');
  const m = ['inactivite', 'suppression', 'manuel'].includes(motif) ? motif : (type === 'temporaire' ? 'inactivite' : 'manuel');

  const r = await tx(async q => {
    const out = await transfererPortefeuille(q, src.id, dst.id, {
      type, motif: m, auteurId: req.user.id,
      clientIds: Array.isArray(client_ids) ? client_ids : undefined,
      prospectIds: Array.isArray(prospect_ids) ? prospect_ids : undefined,
    });
    await audit(req, type === 'temporaire' ? 'transfert_temporaire' : 'transfert_definitif', {
      type: 'agent', id: src.id, label: personName(src),
      apres: { destinataire: personName(dst), motif: m, ...out },
    }, q);
    return out;
  });
  res.json({ message: `${r.clients} client(s) et ${r.prospects} prospect(s) transférés vers ${personName(dst)}`, ...r });
}));

// Suppression logique, uniquement quand le portefeuille a été entièrement transféré
router.delete('/:id', authenticateToken, requireAdmin, ah(async (req, res) => {
  const a = await get("SELECT * FROM users WHERE id = ? AND role = 'agent'", [req.params.id]);
  if (!a || a.statut === 'supprime') throw new HttpError(404, 'Agent non trouvé');
  const pf = await portefeuille({ all }, a.id);
  const juniors = await get("SELECT COUNT(*) c FROM users WHERE parent_agent_id = ? AND statut <> 'supprime'", [a.id]);
  if (pf.clients.length || pf.prospects.length || juniors.c > 0) {
    throw new HttpError(409, 'Suppression impossible : le portefeuille doit d\'abord être transféré', {
      clients: pf.clients.length, prospects: pf.prospects.length, juniors: juniors.c,
    });
  }
  await tx(async q => {
    await q.run(
      "UPDATE users SET statut = 'supprime', statut_depuis = NOW(), deleted_at = NOW(), deleted_by = ? WHERE id = ?",
      [req.user.id, a.id]);
    await q.run('UPDATE users SET interim_agent_id = NULL WHERE interim_agent_id = ?', [a.id]);
    await audit(req, 'suppression_agent', { type: 'agent', id: a.id, label: personName(a), avant: { statut: a.statut }, apres: { statut: 'supprime' } }, q);
  });
  res.json({ message: 'Agent supprimé. Ses commissions acquises restent dues.' });
}));

router.post('/:id/reset-password', authenticateToken, requireAdmin, ah(async (req, res) => {
  const a = await get("SELECT id FROM users WHERE id = ? AND role = 'agent' AND statut <> 'supprime'", [req.params.id]);
  if (!a) throw new HttpError(404, 'Agent non trouvé');
  const tempPassword = generatePassword();
  await run('UPDATE users SET password_hash=?, must_change_password=1, updated_at=NOW() WHERE id=?',
    [bcrypt.hashSync(tempPassword, 10), req.params.id]);
  await audit(req, 'reinitialisation_mot_de_passe', { type: 'agent', id: req.params.id });
  res.json({ message: 'Mot de passe réinitialisé', credentials: { temp_password: tempPassword } });
}));

module.exports = router;
