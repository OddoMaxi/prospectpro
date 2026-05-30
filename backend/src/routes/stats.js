const express = require('express');
const { get, all } = require('../database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();
const ah = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.get('/agent', authenticateToken, ah(async (req, res) => {
  const id = req.user.id;
  const now = new Date();
  const y = now.getFullYear();
  const mn = now.getMonth() + 1;
  const m = String(mn).padStart(2, '0');
  const monthStart = `${y}-${m}-01`;
  const yearStart  = `${y}-01-01`;

  const period = ['semaine','mois','trimestre','semestre','annee'].includes(req.query.period) ? req.query.period : 'mois';
  const PERIOD_MONTHS = { semaine: 0.25, mois: 1, trimestre: 3, semestre: 6, annee: 12 };
  const periodMonths = PERIOD_MONTHS[period];
  let periodStart;
  if (period === 'semaine') {
    const day = now.getDay();
    const diff = day === 0 ? 6 : day - 1;
    const monday = new Date(now);
    monday.setDate(now.getDate() - diff);
    periodStart = monday.toISOString().split('T')[0];
  } else if (period === 'mois') {
    periodStart = monthStart;
  } else if (period === 'trimestre') {
    const qm = Math.floor((mn - 1) / 3) * 3 + 1;
    periodStart = `${y}-${String(qm).padStart(2,'0')}-01`;
  } else if (period === 'semestre') {
    periodStart = `${y}-${mn <= 6 ? '01' : '07'}-01`;
  } else {
    periodStart = yearStart;
  }

  const agent = await get('SELECT objectif_mensuel, objectif_annuel, taux_commission FROM users WHERE id = ?', [id]);

  const [total, monthly, annual, clients, clientsMonth, periodRow] = await Promise.all([
    get("SELECT COUNT(*) c FROM prospects WHERE agent_id=?", [id]),
    get("SELECT COUNT(*) c FROM prospects WHERE agent_id=? AND date_prospection>=?", [id, monthStart]),
    get("SELECT COUNT(*) c FROM prospects WHERE agent_id=? AND date_prospection>=?", [id, yearStart]),
    get("SELECT COUNT(*) c FROM prospects WHERE agent_id=? AND statut='client'", [id]),
    get("SELECT COUNT(*) c FROM prospects WHERE agent_id=? AND statut='client' AND date_prospection>=?", [id, monthStart]),
    get(`SELECT COUNT(*) c,
          COALESCE(SUM(montant_potentiel),0) pt,
          COALESCE(SUM(montant_potentiel*taux_commission/100),0) ct
         FROM prospects WHERE agent_id=? AND date_prospection>=?`, [id, periodStart]),
  ]);

  const [commAll, commClients, primesAll, primesClients] = await Promise.all([
    get("SELECT COALESCE(SUM(montant_potentiel*taux_commission/100),0) v FROM prospects WHERE agent_id=?", [id]),
    get("SELECT COALESCE(SUM(montant_potentiel*taux_commission/100),0) v FROM prospects WHERE agent_id=? AND statut='client'", [id]),
    get("SELECT COALESCE(SUM(montant_potentiel),0) v FROM prospects WHERE agent_id=?", [id]),
    get("SELECT COALESCE(SUM(montant_potentiel),0) v FROM prospects WHERE agent_id=? AND statut='client'", [id]),
  ]);

  const [sousAgentCount, commSousAgents, commSousAgentsClients] = await Promise.all([
    get("SELECT COUNT(*) c FROM users WHERE parent_agent_id=? AND role='agent'", [id]),
    get(`SELECT COALESCE(SUM(p.montant_potentiel * u.taux_commission_parent / 100), 0) v
         FROM prospects p JOIN users u ON u.id = p.agent_id
         WHERE u.parent_agent_id = ?`, [id]),
    get(`SELECT COALESCE(SUM(p.montant_potentiel * u.taux_commission_parent / 100), 0) v
         FROM prospects p JOIN users u ON u.id = p.agent_id
         WHERE u.parent_agent_id = ? AND p.statut = 'client'`, [id]),
  ]);

  // Objectives scaled to selected period
  const agentObj = await get(`
    SELECT
      COALESCE(SUM(CASE apo.periode
        WHEN 'mensuel'   THEN apo.objectif_mensuel * ?
        WHEN 'trimestre' THEN apo.objectif_mensuel * ? / 3.0
        WHEN 'semestre'  THEN apo.objectif_mensuel * ? / 6.0
        WHEN 'annuel'    THEN apo.objectif_mensuel * ? / 12.0
        ELSE apo.objectif_mensuel * ?
      END), 0) objectif_period_prospects,
      COALESCE(SUM(CASE apo.periode
        WHEN 'mensuel'   THEN apo.objectif_mensuel * pr.prime_annuelle / 12.0 * ?
        WHEN 'trimestre' THEN apo.objectif_mensuel * pr.prime_annuelle / 12.0 * ? / 3.0
        WHEN 'semestre'  THEN apo.objectif_mensuel * pr.prime_annuelle / 12.0 * ? / 6.0
        WHEN 'annuel'    THEN apo.objectif_mensuel * pr.prime_annuelle / 12.0 * ? / 12.0
        ELSE apo.objectif_mensuel * pr.prime_annuelle / 12.0 * ?
      END), 0) objectif_period_primes,
      COALESCE(SUM(CASE apo.periode
        WHEN 'mensuel'   THEN apo.objectif_mensuel * pr.prime_annuelle * pr.taux_commission / 100.0 / 12.0 * ?
        WHEN 'trimestre' THEN apo.objectif_mensuel * pr.prime_annuelle * pr.taux_commission / 100.0 / 12.0 * ? / 3.0
        WHEN 'semestre'  THEN apo.objectif_mensuel * pr.prime_annuelle * pr.taux_commission / 100.0 / 12.0 * ? / 6.0
        WHEN 'annuel'    THEN apo.objectif_mensuel * pr.prime_annuelle * pr.taux_commission / 100.0 / 12.0 * ? / 12.0
        ELSE apo.objectif_mensuel * pr.prime_annuelle * pr.taux_commission / 100.0 / 12.0 * ?
      END), 0) objectif_period_commissions
    FROM agent_product_objectives apo
    JOIN products pr ON pr.id = apo.product_id
    WHERE apo.agent_id = ?
  `, [...Array(15).fill(periodMonths), id]);

  // Activity trend — daily for semaine/mois, monthly otherwise
  let periodTrend;
  if (period === 'semaine' || period === 'mois') {
    periodTrend = await all(
      `SELECT date_prospection AS "day", COUNT(*) AS "count" FROM prospects WHERE agent_id=? AND date_prospection>=? GROUP BY date_prospection ORDER BY date_prospection`,
      [id, periodStart]
    );
  } else {
    periodTrend = await all(
      `SELECT to_char(date_prospection, 'YYYY-MM') AS "month", COUNT(*) AS "count" FROM prospects WHERE agent_id=? AND date_prospection>=? GROUP BY to_char(date_prospection, 'YYYY-MM') ORDER BY "month"`,
      [id, periodStart]
    );
  }

  const [byStatus, byType, trend, recents, byProduct] = await Promise.all([
    all(`SELECT statut, COUNT(*) AS "count" FROM prospects WHERE agent_id=? GROUP BY statut`, [id]),
    all(`SELECT type, COUNT(*) AS "count" FROM prospects WHERE agent_id=? GROUP BY type`, [id]),
    all(`SELECT to_char(date_prospection, 'YYYY-MM') AS "month", COUNT(*) AS "count" FROM prospects WHERE agent_id=? GROUP BY to_char(date_prospection, 'YYYY-MM') ORDER BY "month" DESC LIMIT 6`, [id]),
    all("SELECT id, type, nom, prenom, statut, montant_potentiel, date_prospection FROM prospects WHERE agent_id=? ORDER BY created_at DESC LIMIT 5", [id]),
    all(`SELECT pr.id as product_id, pr.nom as product_nom, pr.taux_commission as product_taux,
              COUNT(DISTINCT p.id) as total_prospects,
              SUM(CASE WHEN p.statut='client' THEN 1 ELSE 0 END) as total_clients,
              COALESCE(SUM(pp.nb_beneficiaires * pr.prime_annuelle), 0) as prime_total,
              COALESCE(SUM(pp.nb_beneficiaires * pr.prime_annuelle * pr.taux_commission / 100), 0) as commission_total
         FROM products pr
         JOIN prospect_products pp ON pp.product_id = pr.id
         JOIN prospects p ON p.id = pp.prospect_id
         WHERE p.agent_id = ?
         GROUP BY pr.id ORDER BY prime_total DESC`, [id]),
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
    // Période sélectionnée
    period, period_start: periodStart,
    period_prospects: Number(periodRow.c),
    period_prime_total: Number(periodRow.pt),
    period_commission_total: Number(periodRow.ct),
    objectif_period_prospects:    Number(agentObj?.objectif_period_prospects    || 0),
    objectif_period_primes:       Number(agentObj?.objectif_period_primes       || 0),
    objectif_period_commissions:  Number(agentObj?.objectif_period_commissions  || 0),
    // Données sous-agents
    sous_agent_count: Number(sousAgentCount.c),
    commission_sous_agents: Number(commSousAgents.v),
    commission_sous_agents_clients: Number(commSousAgentsClients.v),
    by_status: byStatus, by_type: byType, monthly_trend: [...trend].reverse(),
    period_trend: periodTrend, recents, by_product: byProduct
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
  const mn = now.getMonth() + 1;
  const monthStart = `${y}-${String(mn).padStart(2,'0')}-01`;

  // Period filter
  const period = ['mois','trimestre','semestre','annee'].includes(req.query.period) ? req.query.period : 'mois';
  const periodMonths = { mois:1, trimestre:3, semestre:6, annee:12 }[period];
  let periodStart;
  if (period === 'mois') {
    periodStart = monthStart;
  } else if (period === 'trimestre') {
    const qm = Math.floor((mn - 1) / 3) * 3 + 1;
    periodStart = `${y}-${String(qm).padStart(2,'0')}-01`;
  } else if (period === 'semestre') {
    periodStart = `${y}-${mn <= 6 ? '01' : '07'}-01`;
  } else {
    periodStart = `${y}-01-01`;
  }

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
    SELECT u.id, u.nom, u.prenom, u.username, u.objectif_mensuel, u.objectif_annuel, u.taux_commission,
           u.type_agent, u.raison_sociale, u.parent_agent_id,
           COUNT(p.id) total_prospects,
           SUM(CASE WHEN p.statut='client' THEN 1 ELSE 0 END) total_clients,
           SUM(CASE WHEN p.date_prospection>=? THEN 1 ELSE 0 END) period_prospects,
           SUM(CASE WHEN p.date_prospection>=? AND p.statut='client' THEN 1 ELSE 0 END) period_clients,
           COALESCE(SUM(p.montant_potentiel*p.taux_commission/100),0) commission_total,
           COALESCE(SUM(p.montant_potentiel),0) prime_total,
           COALESCE(SUM(CASE WHEN p.date_prospection>=? THEN p.montant_potentiel ELSE 0 END),0) period_prime_total,
           COALESCE(SUM(CASE WHEN p.date_prospection>=? THEN p.montant_potentiel*p.taux_commission/100 ELSE 0 END),0) period_commission_total,
           COALESCE(SUM(CASE WHEN p.statut='client' THEN p.montant_potentiel ELSE 0 END),0) prime_clients,
           COALESCE(SUM(CASE WHEN p.statut='client' THEN p.montant_potentiel*p.taux_commission/100 ELSE 0 END),0) commission_clients
    FROM users u LEFT JOIN prospects p ON p.agent_id=u.id
    WHERE u.role='agent' AND u.is_active=1
    GROUP BY u.id ORDER BY total_prospects DESC
  `, [periodStart, periodStart, periodStart, periodStart]);

  // Objectives per agent scaled to selected period
  const objectives = await all(`
    SELECT apo.agent_id,
      COALESCE(SUM(
        CASE apo.periode
          WHEN 'mensuel'   THEN apo.objectif_mensuel * ?
          WHEN 'trimestre' THEN apo.objectif_mensuel * ? / 3.0
          WHEN 'semestre'  THEN apo.objectif_mensuel * ? / 6.0
          WHEN 'annuel'    THEN apo.objectif_mensuel * ? / 12.0
          ELSE apo.objectif_mensuel * ?
        END
      ), 0) objectif_period_prospects,
      COALESCE(SUM(
        CASE apo.periode
          WHEN 'mensuel'   THEN apo.objectif_mensuel * pr.prime_annuelle / 12.0 * ?
          WHEN 'trimestre' THEN apo.objectif_mensuel * pr.prime_annuelle / 12.0 * ? / 3.0
          WHEN 'semestre'  THEN apo.objectif_mensuel * pr.prime_annuelle / 12.0 * ? / 6.0
          WHEN 'annuel'    THEN apo.objectif_mensuel * pr.prime_annuelle / 12.0 * ? / 12.0
          ELSE apo.objectif_mensuel * pr.prime_annuelle / 12.0 * ?
        END
      ), 0) objectif_period_primes
    FROM agent_product_objectives apo
    JOIN products pr ON pr.id = apo.product_id
    GROUP BY apo.agent_id
  `, Array(10).fill(periodMonths));

  const [byProduct, bySector, trend] = await Promise.all([
    all(`
      SELECT pr.id, pr.nom, pr.prime_annuelle, pr.taux_commission,
        COUNT(DISTINCT pp.prospect_id) total_prospects,
        COALESCE(SUM(pp.nb_beneficiaires), 0) total_beneficiaires,
        SUM(CASE WHEN p2.statut='client' THEN 1 ELSE 0 END) total_clients,
        COALESCE(SUM(pp.nb_beneficiaires * pr.prime_annuelle), 0) total_primes,
        COALESCE(SUM(pp.nb_beneficiaires * pr.prime_annuelle * pr.taux_commission / 100.0), 0) total_commissions
      FROM products pr
      LEFT JOIN prospect_products pp ON pp.product_id = pr.id
      LEFT JOIN prospects p2 ON p2.id = pp.prospect_id
      WHERE pr.is_active = 1
      GROUP BY pr.id
      ORDER BY total_primes DESC
    `),
    all(`SELECT secteur_activite, COUNT(*) AS "count" FROM prospects WHERE secteur_activite IS NOT NULL GROUP BY secteur_activite ORDER BY "count" DESC LIMIT 10`),
    all(`SELECT to_char(date_prospection, 'YYYY-MM') AS "month", COUNT(*) AS "count" FROM prospects GROUP BY to_char(date_prospection, 'YYYY-MM') ORDER BY "month" DESC LIMIT 6`),
  ]);

  const objMap = {};
  for (const o of objectives) objMap[o.agent_id] = o;
  const enrichedAgentStats = agentStats.map(a => ({
    ...a,
    objectif_period_prospects: Number(objMap[a.id]?.objectif_period_prospects || 0),
    objectif_period_primes:    Number(objMap[a.id]?.objectif_period_primes    || 0),
  }));

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
    period, period_months: periodMonths,
    agent_stats: enrichedAgentStats, by_sector: bySector,
    monthly_trend: [...trend].reverse(), by_product: byProduct,
  });
}));

module.exports = router;
