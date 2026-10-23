const { HttpError } = require('./http');

// N°ID agent sur 6 chiffres, attribué chronologiquement et jamais réutilisé :
//  - Sénior : centaines successives (000100, 000200, …) ;
//  - Junior : N°ID de son Sénior + rang sur 2 chiffres (000101, 000102, … 000199).
const pad = n => String(n).padStart(6, '0');

async function nextNumeroAgent(q, parentId) {
  // Sérialise les attributions concurrentes jusqu'à la fin de la transaction
  await q.run('SELECT pg_advisory_xact_lock(424242)');
  if (!parentId) {
    const r = await q.get("SELECT MAX(CAST(numero_agent AS INTEGER) / 100) m FROM users WHERE numero_agent IS NOT NULL");
    const n = (Number(r.m) || 0) + 1;
    if (n > 9999) throw new HttpError(400, 'Plus aucun N°ID Sénior disponible');
    return pad(n * 100);
  }
  const p = await q.get('SELECT numero_agent FROM users WHERE id = ?', [parentId]);
  if (!p || !p.numero_agent) throw new HttpError(400, "Le Sénior de rattachement n'a pas de N°ID");
  const prefixe = p.numero_agent.slice(0, 4);
  const r = await q.get('SELECT MAX(CAST(numero_agent AS INTEGER) % 100) m FROM users WHERE numero_agent LIKE ?', [`${prefixe}__`]);
  const k = (Number(r.m) || 0) + 1;
  if (k > 99) throw new HttpError(400, 'Ce Sénior a atteint le maximum de 99 agents Juniors');
  return prefixe + String(k).padStart(2, '0');
}

// Attribue un N°ID aux agents existants qui n'en ont pas encore, par ordre de création
async function attribuerNumerosManquants(q) {
  const seniors = await q.all("SELECT id FROM users WHERE role = 'agent' AND parent_agent_id IS NULL AND numero_agent IS NULL ORDER BY created_at, id");
  for (const s of seniors) await q.run('UPDATE users SET numero_agent = ? WHERE id = ?', [await nextNumeroAgent(q, null), s.id]);
  const juniors = await q.all("SELECT id, parent_agent_id FROM users WHERE role = 'agent' AND parent_agent_id IS NOT NULL AND numero_agent IS NULL ORDER BY created_at, id");
  for (const j of juniors) await q.run('UPDATE users SET numero_agent = ? WHERE id = ?', [await nextNumeroAgent(q, j.parent_agent_id), j.id]);
  return seniors.length + juniors.length;
}

module.exports = { nextNumeroAgent, attribuerNumerosManquants };
