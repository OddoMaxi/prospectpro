const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { get, all, run } = require('../database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();
const ah = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.post('/', authenticateToken, ah(async (req, res) => {
  const {
    type, nom, prenom, siret, nom_contact, prenom_contact,
    telephone, email, adresse, ville, code_postal,
    secteur_activite, notes, statut, montant_potentiel,
    taux_commission, date_prospection, produit_id
  } = req.body;

  if (!type || !nom) return res.status(400).json({ error: 'Type et nom requis' });
  if (!['physique', 'morale'].includes(type)) return res.status(400).json({ error: 'Type invalide' });

  const agent = await get('SELECT taux_commission FROM users WHERE id = ?', [req.user.id]);
  const commRate = taux_commission !== undefined ? Number(taux_commission) : (agent?.taux_commission || 5.0);
  const id = uuidv4();

  await run(
    `INSERT INTO prospects (id, agent_id, type, nom, prenom, siret, nom_contact, prenom_contact,
      telephone, email, adresse, ville, code_postal, secteur_activite, notes, statut,
      montant_potentiel, taux_commission, produit_id, date_prospection)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, req.user.id, type, nom, prenom||null, siret||null,
     nom_contact||null, prenom_contact||null, telephone||null, email||null,
     adresse||null, ville||null, code_postal||null, secteur_activite||null,
     notes||null, statut||'prospect', Number(montant_potentiel)||0, commRate,
     produit_id||null, date_prospection || new Date().toISOString().split('T')[0]]
  );
  res.status(201).json({ message: 'Prospect créé avec succès', id });
}));

router.get('/', authenticateToken, ah(async (req, res) => {
  const { type, statut, date_debut, date_fin, agent_id, search } = req.query;

  let sql = `SELECT p.*, u.nom as agent_nom, u.prenom as agent_prenom
    FROM prospects p JOIN users u ON u.id = p.agent_id WHERE 1=1`;
  const args = [];

  if (req.user.role !== 'admin') {
    sql += ' AND p.agent_id = ?'; args.push(req.user.id);
  } else if (agent_id) {
    sql += ' AND p.agent_id = ?'; args.push(agent_id);
  }
  if (type)       { sql += ' AND p.type = ?';               args.push(type); }
  if (statut)     { sql += ' AND p.statut = ?';             args.push(statut); }
  if (date_debut) { sql += ' AND p.date_prospection >= ?';  args.push(date_debut); }
  if (date_fin)   { sql += ' AND p.date_prospection <= ?';  args.push(date_fin); }
  if (search) {
    sql += ' AND (p.nom LIKE ? OR p.prenom LIKE ? OR p.ville LIKE ? OR p.email LIKE ? OR p.telephone LIKE ?)';
    const s = `%${search}%`;
    args.push(s, s, s, s, s);
  }
  sql += ' ORDER BY p.created_at DESC';

  res.json(await all(sql, args));
}));

router.get('/:id', authenticateToken, ah(async (req, res) => {
  let sql = 'SELECT p.*, u.nom as agent_nom, u.prenom as agent_prenom FROM prospects p JOIN users u ON u.id = p.agent_id WHERE p.id = ?';
  const args = [req.params.id];
  if (req.user.role !== 'admin') { sql += ' AND p.agent_id = ?'; args.push(req.user.id); }
  const prospect = await get(sql, args);
  if (!prospect) return res.status(404).json({ error: 'Prospect non trouvé' });
  res.json(prospect);
}));

router.put('/:id', authenticateToken, ah(async (req, res) => {
  let cq = 'SELECT id FROM prospects WHERE id = ?';
  const ca = [req.params.id];
  if (req.user.role !== 'admin') { cq += ' AND agent_id = ?'; ca.push(req.user.id); }
  if (!await get(cq, ca)) return res.status(404).json({ error: 'Prospect non trouvé' });

  const {
    type, nom, prenom, siret, nom_contact, prenom_contact,
    telephone, email, adresse, ville, code_postal,
    secteur_activite, notes, statut, montant_potentiel,
    taux_commission, date_prospection, produit_id
  } = req.body;

  await run(
    `UPDATE prospects SET type=?,nom=?,prenom=?,siret=?,nom_contact=?,prenom_contact=?,
    telephone=?,email=?,adresse=?,ville=?,code_postal=?,secteur_activite=?,notes=?,
    statut=?,montant_potentiel=?,taux_commission=?,produit_id=?,date_prospection=?,updated_at=datetime('now')
    WHERE id=?`,
    [type, nom, prenom||null, siret||null, nom_contact||null, prenom_contact||null,
     telephone||null, email||null, adresse||null, ville||null, code_postal||null,
     secteur_activite||null, notes||null, statut||'prospect',
     Number(montant_potentiel)||0, Number(taux_commission)||5.0,
     produit_id||null, date_prospection||new Date().toISOString().split('T')[0], req.params.id]
  );
  res.json({ message: 'Prospect mis à jour avec succès' });
}));

router.delete('/:id', authenticateToken, requireAdmin, ah(async (req, res) => {
  const r = await run('DELETE FROM prospects WHERE id = ?', [req.params.id]);
  if (r.rowsAffected === 0) return res.status(404).json({ error: 'Prospect non trouvé' });
  res.json({ message: 'Prospect supprimé' });
}));

module.exports = router;
