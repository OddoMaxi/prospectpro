const express = require('express');
const { get, all } = require('../database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();
const ah = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.get('/agent', authenticateToken, ah(async (req, res) => {
  const id = req.user.id;
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const monthStart = `${y}-${m}-01`;
  const yearStart  = `${y}-01-01`;

  const agent = await get('SELECT objectif_mensuel, objectif_annuel, taux_commission FROM users WHERE id = ?', [id]);

  const [total, monthly, annual, clients, clientsMonth] = await Promise.all([
    get("SELECT COUNT(*) c FROM prospects WHERE agent_id=?", [id]),
    get("SELECT COUNT(*) c FROM prospects WHERE agent_id=? AND date_prospection>=?", [id, monthStart]),
    get("SELECT COUNT(*) c FROM prospects WHERE agent_id=? AND date_prospection>=?", [id, yearStart]),
    get("SELECT COUNT(*) c FROM prospects WHERE agent_id=? AND statut='client'", [id]),
    get("SELECT COUNT(*) c FROM prospects WHERE agent_id=? AND statut='client' AND date_prospection>=?", [id, monthStart]),
  ]);

  const [commAll, commClients, primesAll, primesClients] = await Promise.all([
    get("SELECT COALESCE(SUM(montant_potentiel*taux_commission/100),0) v FROM prospects WHERE agent_id=?", [id]),
    get("SELECT COALESCE(SUM(montant_potentiel*taux_commission/100),0) v FROM prospects WHERE agent_id=? AND statut='client'", [id]),
    get("SELECT COALESCE(SUM(montant_potentiel),0) v FROM prospects WHERE agent_id=?", [id]),
    get("SELECT COALESCE(SUM(montant_potentiel),0) v FROM prospects WHERE agent_id=? AND statut='client'", [id]),
  ]);

  // Commission et stats provenant des sous-agents
  const [sousAgentCount, commSousAgents, commSousAgentsClients] = await Promise.all([
    get("SELECT COUNT(*) c FROM users WHERE parent_agent_id=? AND role='agent'", [id]),
    get(`SELECT COALESCE(SUM(p.montant_potentiel * u.taux_commission_parent / 100), 0) v
         FROM prospects p JOIN users u ON u.id = p.agent_id
         WHERE u.parent_agent_id = ?`, [id]),
    get(`SELECT COALESCE(SUM(p.montant_potentiel * u.taux_commission_parent / 100), 0) v
         FROM prospects p JOIN users u ON u.id = p.agent_id
         WHERE u.parent_agent_id = ? AND p.statut = 'client'`, [id]),
  ]);

  const [byStatus, byType, trend, daily, recents] = await Promise.all([
    all("SELECT statut, COUNT(*) count FROM prospects WHERE agent_id=? GROUP BY statut", [id]),
    all("SELECT type, COUNT(*) count FROM prospects WHERE agent_id=? GROUP BY type", [id]),
    all("SELECT strftime('%Y-%m',date_prospection) month, COUNT(*) count FROM prospects WHERE agent_id=? GROUP BY month ORDER BY month DESC LIMIT 6", [id]),
    all("SELECT date_prospection day, COUNT(*) count FROM prospects WHERE agent_id=? AND date_prospection>=? GROUP BY day ORDER BY day", [id, monthStart]),
    all("SELECT id, type, nom, prenom, ville, statut, montant_potentiel, date_prospection FROM prospects WHERE agent_id=? ORDER BY created_at DESC LIMIT 5", [id]),
  ]);

  const totalC = Number(total.c), monthlyC = Number(monthly.c), annualC = Number(annual.c), clientsC = Number(clients.c);
  const objM = Number(agent.objectif_mensuel), objA = Number(agent.objectif_annuel);

  res.json({
    total_prospects: totalC, monthly_prospects: monthlyC, annual_prospects: annualC,
    total_clients: clientsC, clients_this_month: Number(clientsMonth.c),
    conversion_rate: totalC > 0 ? parseFloat((clientsC / totalC * 100).toFixed(1)) : 0,
    commission_total: Number(commAll.v), commission_clients: Number(commClients.v),
    prime_total: Number(primesAll.v), prime_clients: Number(primesClients.v),
    objectif_mensuel: objM, objectif_annuel: objA,
    monthly_progress: objM > 0 ? parseFloat((monthlyC / objM * 100).toFixed(1)) : 0,
    annual_progress:  objA > 0 ? parseFloat((annualC  / objA * 100).toFixed(1)) : 0,
    // Données sous-agents
    sous_agent_count: Number(sousAgentCount.c),
    commission_sous_agents: Number(commSousAgents.v),
    commission_sous_agents_clients: Number(commSousAgentsClients.v),
    by_status: byStatus, by_type: byType, monthly_trend: [...trend].reverse(),
    daily_this_month: daily, recents
  });
}));

// Stats détaillées par sous-agent pour l'agent parent
router.get('/sous-agents', authenticateToken, ah(async (req, res) => {
  if (req.user.role !== 'agent') return res.status(403).json({ error: 'Accès réservé aux agents' });

  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const monthStart = `${y}-${m}-01`;

  const stats = await all(`
    SELECT u.id, u.nom, u.prenom, u.username, u.type_agent, u.raison_sociale,
           u.objectif_mensuel, u.objectif_annuel, u.taux_commission, u.taux_commission_parent,
           u.is_active,
           COUNT(p.id) as total_prospects,
           SUM(CASE WHEN p.statut='client' THEN 1 ELSE 0 END) as total_clients,
           SUM(CASE WHEN p.date_prospection>=? THEN 1 ELSE 0 END) as monthly_prospects,
           COALESCE(SUM(p.montant_potentiel * p.taux_commission / 100), 0) as commission_agent,
           COALESCE(SUM(p.montant_potentiel * u.taux_commission_parent / 100), 0) as commission_parent,
           COALESCE(SUM(p.montant_potentiel), 0) as prime_total,
           COALESCE(SUM(CASE WHEN p.statut='client' THEN p.montant_potentiel ELSE 0 END), 0) as prime_clients
    FROM users u LEFT JOIN prospects p ON p.agent_id = u.id
    WHERE u.parent_agent_id = ?
    GROUP BY u.id ORDER BY u.nom, u.prenom
  `, [monthStart, req.user.id]);

  res.json(stats);
}));

router.get('/admin', authenticateToken, requireAdmin, ah(async (req, res) => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const monthStart = `${y}-${m}-01`;

  const [totalAgents, totalSousAgents, totalProspects, monthly, totalClients, commTotal, primesTotal, primesClients, commClients] = await Promise.all([
    get("SELECT COUNT(*) c FROM users WHERE role='agent' AND is_active=1 AND (parent_agent_id IS NULL OR parent_agent_id='')"),
    get("SELECT COUNT(*) c FROM users WHERE role='agent' AND is_active=1 AND parent_agent_id IS NOT NULL AND parent_agent_id != ''"),
    get("SELECT COUNT(*) c FROM prospects"),
    get("SELECT COUNT(*) c FROM prospects WHERE date_prospection>=?", [monthStart]),
    get("SELECT COUNT(*) c FROM prospects WHERE statut='client'"),
    get("SELECT COALESCE(SUM(montant_potentiel*taux_commission/100),0) v FROM prospects"),
    get("SELECT COALESCE(SUM(montant_potentiel),0) v FROM prospects"),
    get("SELECT COALESCE(SUM(montant_potentiel),0) v FROM prospects WHERE statut='client'"),
    get("SELECT COALESCE(SUM(montant_potentiel*taux_commission/100),0) v FROM prospects WHERE statut='client'"),
  ]);

  const agentStats = await all(`
    SELECT u.id, u.nom, u.prenom, u.username, u.objectif_mensuel, u.taux_commission,
           u.type_agent, u.raison_sociale, u.parent_agent_id,
           COUNT(p.id) total_prospects,
           SUM(CASE WHEN p.statut='client' THEN 1 ELSE 0 END) total_clients,
           SUM(CASE WHEN p.date_prospection>=? THEN 1 ELSE 0 END) monthly_prospects,
           COALESCE(SUM(p.montant_potentiel*p.taux_commission/100),0) commission_total,
           COALESCE(SUM(p.montant_potentiel),0) prime_total,
           COALESCE(SUM(CASE WHEN p.statut='client' THEN p.montant_potentiel ELSE 0 END),0) prime_clients,
           COALESCE(SUM(CASE WHEN p.statut='client' THEN p.montant_potentiel*p.taux_commission/100 ELSE 0 END),0) commission_clients
    FROM users u LEFT JOIN prospects p ON p.agent_id=u.id
    WHERE u.role='agent' AND u.is_active=1
    GROUP BY u.id ORDER BY total_prospects DESC
  `, [monthStart]);

  const [bySector, trend] = await Promise.all([
    all("SELECT secteur_activite, COUNT(*) count FROM prospects WHERE secteur_activite IS NOT NULL GROUP BY secteur_activite ORDER BY count DESC LIMIT 10"),
    all("SELECT strftime('%Y-%m',date_prospection) month, COUNT(*) count FROM prospects GROUP BY month ORDER BY month DESC LIMIT 6"),
  ]);

  const tp = Number(totalProspects.c), tc = Number(totalClients.c);

  res.json({
    total_agents: Number(totalAgents.c),
    total_sous_agents: Number(totalSousAgents.c),
    total_prospects: tp,
    monthly_prospects: Number(monthly.c), total_clients: tc,
    commission_total: Number(commTotal.v),
    primes_total: Number(primesTotal.v),
    primes_clients: Number(primesClients.v),
    commission_clients: Number(commClients.v),
    global_conversion_rate: tp > 0 ? parseFloat((tc / tp * 100).toFixed(1)) : 0,
    agent_stats: agentStats, by_sector: bySector, monthly_trend: [...trend].reverse()
  });
}));

module.exports = router;
