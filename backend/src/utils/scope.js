const { all } = require('../database');

// Périmètre de données d'un utilisateur :
//   admin  → null (tout)
//   Sénior → lui-même + ses Juniors (même supprimés, pour l'historique)
//   Junior → lui-même
async function scopeIds(user) {
  if (user.role === 'admin') return null;
  if (user.parent_agent_id) return [user.id];
  const juniors = await all("SELECT id FROM users WHERE parent_agent_id = ? AND role = 'agent'", [user.id]);
  return [user.id, ...juniors.map(j => j.id)];
}

// Ajoute « AND col IN (...) » à une requête si un périmètre s'applique
function scopeClause(ids, col, args) {
  if (!ids) return '';
  if (!ids.length) return ' AND 1=0';
  args.push(...ids);
  return ` AND ${col} IN (${ids.map(() => '?').join(',')})`;
}

module.exports = { scopeIds, scopeClause };
