const { v4: uuidv4 } = require('uuid');

const TABLES = { client: 'clients', prospect: 'prospects' };

async function enregistrerCreation(q, entityType, entityId, agentId, auteurId) {
  await q.run(
    `INSERT INTO affectations (id, entity_type, entity_id, agent_origine_id, agent_destinataire_id, type, motif, auteur_id)
     VALUES (?,?,?,NULL,?,'definitif','creation',?)`,
    [uuidv4(), entityType, entityId, agentId, auteurId]
  );
}

// Réaffecte un élément : clôt l'affectation en cours et en ouvre une nouvelle. N'écrase jamais l'historique.
async function reaffecter(q, entityType, entityId, toAgentId, type, motif, auteurId) {
  const table = TABLES[entityType];
  const cur = await q.get(`SELECT agent_id FROM ${table} WHERE id = ?`, [entityId]);
  if (!cur || cur.agent_id === toAgentId) return false;
  await q.run(
    'UPDATE affectations SET date_fin = NOW() WHERE entity_type = ? AND entity_id = ? AND date_fin IS NULL',
    [entityType, entityId]
  );
  await q.run(
    `INSERT INTO affectations (id, entity_type, entity_id, agent_origine_id, agent_destinataire_id, type, motif, auteur_id)
     VALUES (?,?,?,?,?,?,?,?)`,
    [uuidv4(), entityType, entityId, cur.agent_id, toAgentId, type, motif, auteurId]
  );
  await q.run(`UPDATE ${table} SET agent_id = ? WHERE id = ?`, [toAgentId, entityId]);
  return true;
}

// Éléments du portefeuille actif d'un agent
async function portefeuille(q, agentId) {
  const clients = await q.all("SELECT id FROM clients WHERE agent_id = ? AND statut = 'actif'", [agentId]);
  const prospects = await q.all(
    "SELECT id FROM prospects WHERE agent_id = ? AND deleted_at IS NULL AND statut NOT IN ('converti','client')", [agentId]);
  return { clients: clients.map(c => c.id), prospects: prospects.map(p => p.id) };
}

// Transfère tout ou partie du portefeuille
async function transfererPortefeuille(q, fromId, toId, { type = 'definitif', motif = 'manuel', auteurId = null, clientIds, prospectIds } = {}) {
  const pf = await portefeuille(q, fromId);
  const cl = clientIds ? pf.clients.filter(id => clientIds.includes(id)) : pf.clients;
  const pr = prospectIds ? pf.prospects.filter(id => prospectIds.includes(id)) : pf.prospects;
  for (const id of cl) await reaffecter(q, 'client', id, toId, type, motif, auteurId);
  for (const id of pr) await reaffecter(q, 'prospect', id, toId, type, motif, auteurId);
  return { clients: cl.length, prospects: pr.length };
}

// Restitue à un agent qui reprend son activité tout ce qui lui avait été transféré temporairement.
// Les clients acquis par l'intérimaire pendant la période ne sont pas concernés.
async function restituer(q, agentId, auteurId = null) {
  const rows = await q.all(
    "SELECT entity_type, entity_id FROM affectations WHERE type = 'temporaire' AND date_fin IS NULL AND agent_origine_id = ?",
    [agentId]
  );
  let n = 0;
  for (const r of rows) if (await reaffecter(q, r.entity_type, r.entity_id, agentId, 'definitif', 'restitution', auteurId)) n++;
  return n;
}

module.exports = { enregistrerCreation, reaffecter, portefeuille, transfererPortefeuille, restituer };
