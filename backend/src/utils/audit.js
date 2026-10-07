const { v4: uuidv4 } = require('uuid');
const { run } = require('../database');

// Inscrit une action sensible dans le journal d'audit.
// q : helpers de transaction optionnels (pour écrire dans la même transaction)
async function audit(req, action, { type, id, label, avant, apres } = {}, q = null) {
  const r = q ? q.run : run;
  const user = req && req.user;
  await r(
    `INSERT INTO audit_log (id, user_id, user_label, action, entity_type, entity_id, entity_label, avant, apres)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [uuidv4(), user ? user.id : null, user ? (user.label || user.username) : 'Système',
     action, type || null, id || null, label || null,
     avant === undefined ? null : JSON.stringify(avant),
     apres === undefined ? null : JSON.stringify(apres)]
  );
}

const SYSTEM = { user: null };

module.exports = { audit, SYSTEM };
