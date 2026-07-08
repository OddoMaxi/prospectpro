const express = require('express');
const { get, all } = require('../database');
const { authenticateToken } = require('../middleware/auth');

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

  // NB : les clients vivent dans la table `clients` (le prospect est supprimé à la conversion),
  // donc les compteurs "clients" doivent interroger `clients`, jamais `prospects WHERE statut='client'`.
  const [total, monthly, annual, clients, clientsMonth, periodRow] = await Promise.all([
    get("SELECT COUNT(*) c FROM prospects WHERE agent_id=?", [id]),
    get("SELECT COUNT(*) c FROM prospects WHERE agent_id=? AND date_prospection>=?", [id, monthStart]),
    get("SELECT COUNT(*) c FROM prospects WHERE agent_id=? AND date_prospection>=?", [id, yearStart]),
    get("SELECT COUNT(*) c FROM clients WHERE agent_id=?", [id]),
    get("SELECT COUNT(*) c FROM clients WHERE agent_id=? AND converted_at>=?", [id, monthStart]),
    get(`SELECT COUNT(*) c,
          COALESCE(SUM(montant_potentiel),0) pt,
          COALESCE(SUM(montant_potentiel*taux_commission/100),0) ct
         FROM prospects WHERE agent_id=? AND date_prospection>=?`, [id, periodStart]),
  ]);

  const [commAll, commClients, primesAll, primesClients] = await Promise.all([
    get("SELECT COALESCE(SUM(montant_potentiel*taux_commission/100),0) v FROM prospects WHERE agent_id=?", [id]),
    get("SELECT COALESCE(SUM(commission_totale),0) v FROM clients WHERE agent_id=?", [id]),
    get("SELECT COALESCE(SUM(montant_potentiel),0) v FROM prospects WHERE agent_id=?", [id]),
    get("SELECT COALESCE(SUM(prime_totale),0) v FROM clients WHERE agent_id=?", [id]),
  ]);

  const [sousAgentCount, commSousAgents, commSousAgentsClients] = await Promise.all([
    get("SELECT COUNT(*) c FROM users WHERE parent_agent_id=? AND role='agent'", [id]),
    get(`SELECT COALESCE(SUM(p.montant_potentiel * u.taux_commission_parent / 100), 0) v
         FROM prospects p JOIN users u ON u.id = p.agent_id
         WHERE u.parent_agent_id = ?`, [id]),
    // Réalisé : on prend la source de vérité, la table commissions (type='parent'), alimentée à la conversion
    get(`SELECT COALESCE(SUM(montant_du), 0) v FROM commissions WHERE agent_id = ? AND type = 'parent'`, [id]),
  ]);

  // Objectif = objectif mensuel fixé × multiplicateur de la période sélectionnée
  // (mois=×1, trimestre=×3, semestre=×6, année=×12 ; même formule que /admin et /sous-agents)
  const agentObj = await get(`
    SELECT
      COALESCE(SUM(apo.objectif_mensuel), 0) objectif_base_prospects,
      COALESCE(SUM(apo.objectif_mensuel * pr.prime_annuelle), 0) objectif_base_primes,
      COALESCE(SUM(apo.objectif_mensuel * pr.prime_annuelle * pr.taux_commission / 100.0), 0) objectif_base_commissions
    FROM agent_product_objectives apo
    JOIN products pr ON pr.id = apo.product_id
    WHERE apo.agent_id = ?
  `, [id]);

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

  const [byStatus, byType, trend, recents, byProductPipeline, byProductClients] = await Promise.all([
    all(`SELECT statut, COUNT(*) AS "count" FROM prospects WHERE agent_id=? GROUP BY statut`, [id]),
    all(`SELECT type, COUNT(*) AS "count" FROM prospects WHERE agent_id=? GROUP BY type`, [id]),
    all(`SELECT to_char(date_prospection, 'YYYY-MM') AS "month", COUNT(*) AS "count" FROM prospects WHERE agent_id=? GROUP BY to_char(date_prospection, 'YYYY-MM') ORDER BY "month" DESC LIMIT 6`, [id]),
    all("SELECT id, type, nom, prenom, statut, montant_potentiel, date_prospection FROM prospects WHERE agent_id=? ORDER BY created_at DESC LIMIT 5", [id]),
    all(`SELECT pr.id as product_id, pr.nom as product_nom, pr.taux_commission as product_taux,
              COUNT(DISTINCT p.id) as total_prospects,
              COALESCE(SUM(pp.nb_beneficiaires * pr.prime_annuelle), 0) as prime_total,
              COALESCE(SUM(pp.nb_beneficiaires * pr.prime_annuelle * pr.taux_commission / 100), 0) as commission_total
         FROM products pr
         JOIN prospect_products pp ON pp.product_id = pr.id
         JOIN prospects p ON p.id = pp.prospect_id
         WHERE p.agent_id = ?
         GROUP BY pr.id`, [id]),
    all(`SELECT cp.product_id, COUNT(DISTINCT cp.client_id) as total_clients
         FROM client_products cp JOIN clients c ON c.id = cp.client_id
         WHERE c.agent_id = ?
         GROUP BY cp.product_id`, [id]),
  ]);

  const clientsByProduct = {};
  for (const r of byProductClients) clientsByProduct[r.product_id] = Number(r.total_clients);
  const byProduct = byProductPipeline
    .map(p => ({ ...p, total_clients: clientsByProduct[p.product_id] || 0 }))
    .sort((a, b) => Number(b.prime_total) - Number(a.prime_total));

  const totalC = Number(total.c), monthlyC = Number(monthly.c), annualC = Number(annual.c), clientsC = Number(clients.c);
  const objM = Number(agent.objectif_mensuel), objA = Number(agent.objectif_annuel);

  res.json({
    total_prospects: totalC, monthly_prospects: monthlyC, annual_prospects: annualC,
    total_clients: clientsC, clients_this_month: Number(clientsMonth.c),
    conversion_rate: (totalC + clientsC) > 0 ? parseFloat((clientsC / (totalC + clientsC) * 100).toFixed(1)) : 0,
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
    objectif_period_prospects:    Number(agentObj?.objectif_base_prospects   || 0) * periodMonths,
    objectif_period_primes:       Number(agentObj?.objectif_base_primes      || 0) * periodMonths,
    objectif_period_commissions:  Number(agentObj?.objectif_base_commissions || 0) * periodMonths,
    // Données sous-agents
    sous_agent_count: Number(sousAgentCount.c),
    commission_sous_agents: Number(commSousAgents.v),
    commission_sous_agents_clients: Number(commSousAgentsClients.v),
    by_status: byStatus, by_type: byType, monthly_trend: [...trend].reverse(),
    period_trend: periodTrend, recents, by_product: byProduct
  });
}));

// Stats détaillées par sous-agent pour l'agent parent (sénior), avec objectifs par période
router.get('/sous-agents', authenticateToken, ah(async (req, res) => {
  if (req.user.role !== 'agent') return res.status(403).json({ error: 'Accès réservé aux agents' });

  const now = new Date();
  const y = now.getFullYear();
  const mn = now.getMonth() + 1;
  const monthStart = `${y}-${String(mn).padStart(2,'0')}-01`;

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

  const [prospectStats, clientStats, objectives] = await Promise.all([
    all(`
      SELECT u.id, u.nom, u.prenom, u.username, u.type_agent, u.raison_sociale,
             u.objectif_mensuel, u.objectif_annuel, u.taux_commission, u.taux_commission_parent,
             u.is_active,
             COUNT(p.id) as total_prospects,
             SUM(CASE WHEN p.date_prospection>=? THEN 1 ELSE 0 END) as period_prospects,
             COALESCE(SUM(p.montant_potentiel * p.taux_commission / 100), 0) as commission_agent,
             COALESCE(SUM(p.montant_potentiel * u.taux_commission_parent / 100), 0) as commission_parent,
             COALESCE(SUM(p.montant_potentiel), 0) as prime_total,
             COALESCE(SUM(CASE WHEN p.date_prospection>=? THEN p.montant_potentiel ELSE 0 END), 0) as period_prime_total
      FROM users u LEFT JOIN prospects p ON p.agent_id = u.id
      WHERE u.parent_agent_id = ?
      GROUP BY u.id ORDER BY u.nom, u.prenom
    `, [periodStart, periodStart, req.user.id]),
    // Réalisé : compté depuis la table clients (correction du bug statut='client' jamais atteint)
    all(`
      SELECT c.agent_id, COUNT(*) as total_clients, COALESCE(SUM(c.prime_totale),0) as prime_clients
      FROM clients c JOIN users u ON u.id = c.agent_id
      WHERE u.parent_agent_id = ?
      GROUP BY c.agent_id
    `, [req.user.id]),
    // Objectif fixé par le sénior pour chacun de ses juniors : dénominateur = objectif mensuel × période
    all(`
      SELECT apo.agent_id,
        COALESCE(SUM(apo.objectif_mensuel), 0) objectif_base_prospects,
        COALESCE(SUM(apo.objectif_mensuel * pr.prime_annuelle), 0) objectif_base_primes
      FROM agent_product_objectives apo
      JOIN products pr ON pr.id = apo.product_id
      JOIN users u ON u.id = apo.agent_id
      WHERE u.parent_agent_id = ?
      GROUP BY apo.agent_id
    `, [req.user.id]),
  ]);

  const clientMap = {};
  for (const c of clientStats) clientMap[c.agent_id] = c;
  const objMap = {};
  for (const o of objectives) objMap[o.agent_id] = o;

  const sousAgents = prospectStats.map(s => ({
    ...s,
    total_clients: Number(clientMap[s.id]?.total_clients || 0),
    prime_clients: Number(clientMap[s.id]?.prime_clients || 0),
    objectif_period_prospects: Number(objMap[s.id]?.objectif_base_prospects || 0) * periodMonths,
    objectif_period_primes:    Number(objMap[s.id]?.objectif_base_primes    || 0) * periodMonths,
  }));

  res.json({ period, period_months: periodMonths, sous_agents: sousAgents });
}));

// Tableau de bord global (données de toute l'entreprise) — accessible aux admins ET aux agents
// (chaque commercial, sénior ou juniore, voit le même tableau de bord que l'administrateur)
router.get('/admin', authenticateToken, ah(async (req, res) => {
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

  // ── Agents actifs : total + croisement séniore/juniore × physique/morale ──
  const agentCounts = await get(`
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE parent_agent_id IS NULL OR parent_agent_id = '') AS seniors,
      COUNT(*) FILTER (WHERE parent_agent_id IS NOT NULL AND parent_agent_id != '') AS juniors,
      COUNT(*) FILTER (WHERE type_agent = 'physique') AS physiques,
      COUNT(*) FILTER (WHERE type_agent = 'morale') AS morales,
      COUNT(*) FILTER (WHERE (parent_agent_id IS NULL OR parent_agent_id = '') AND type_agent = 'physique') AS senior_physique,
      COUNT(*) FILTER (WHERE (parent_agent_id IS NULL OR parent_agent_id = '') AND type_agent = 'morale')   AS senior_morale,
      COUNT(*) FILTER (WHERE (parent_agent_id IS NOT NULL AND parent_agent_id != '') AND type_agent = 'physique') AS junior_physique,
      COUNT(*) FILTER (WHERE (parent_agent_id IS NOT NULL AND parent_agent_id != '') AND type_agent = 'morale')   AS junior_morale
    FROM users WHERE role = 'agent' AND is_active = 1
  `);

  // ── Prospects (pipeline ouvert) et Clients (réalisé) — total + par type ──
  // Correction du bug : les clients sont comptés dans la table `clients`, pas `prospects WHERE statut='client'`
  const [prospectCounts, clientCounts, monthly] = await Promise.all([
    get(`SELECT COUNT(*) AS total,
                COUNT(*) FILTER (WHERE type='physique') AS physique,
                COUNT(*) FILTER (WHERE type='morale') AS morale
         FROM prospects`),
    get(`SELECT COUNT(*) AS total,
                COUNT(*) FILTER (WHERE type='physique') AS physique,
                COUNT(*) FILTER (WHERE type='morale') AS morale
         FROM clients`),
    get("SELECT COUNT(*) c FROM prospects WHERE date_prospection>=?", [monthStart]),
  ]);

  // ── 2 blocs financiers : prévisionnel (pipeline ouvert) vs perçu/payé (réalisé) ──
  const [primePrev, primePercu, commDu, commPaye] = await Promise.all([
    get("SELECT COALESCE(SUM(montant_potentiel),0) v FROM prospects"),
    get("SELECT COALESCE(SUM(prime_totale),0) v FROM clients"),
    get("SELECT COALESCE(SUM(montant_du),0) v FROM commissions"),
    get("SELECT COALESCE(SUM(montant_paye),0) v FROM commissions"),
  ]);

  // Prime commerciale : le prévisionnel (pipeline encore ouvert) et le perçu (déjà encaissé chez
  // les clients) forment deux populations disjointes → taux = perçu / (perçu+prévisionnel)
  const primeBlock = {
    previsionnel: Number(primePrev.v), percu: Number(primePercu.v),
    taux_realisation: (Number(primePercu.v) + Number(primePrev.v)) > 0
      ? parseFloat((Number(primePercu.v) / (Number(primePercu.v) + Number(primePrev.v)) * 100).toFixed(1)) : 0,
  };
  // Commission : montant_du est le total dû (payé inclus dedans), donc taux = payé / dû
  const commissionBlock = {
    previsionnel: Number(commDu.v),
    paye: Number(commPaye.v),
    taux_realisation: Number(commDu.v) > 0 ? parseFloat((Number(commPaye.v) / Number(commDu.v) * 100).toFixed(1)) : 0,
  };

  // ── Taux de conversion global + par type ──
  const tp = Number(prospectCounts.total), tc = Number(clientCounts.total);
  const tpPhy = Number(prospectCounts.physique), tcPhy = Number(clientCounts.physique);
  const tpMor = Number(prospectCounts.morale), tcMor = Number(clientCounts.morale);
  const convRate = (c, p) => (Number(c) + Number(p)) > 0 ? parseFloat((Number(c) / (Number(c) + Number(p)) * 100).toFixed(1)) : 0;

  // ── Taux de renouvellement des contrats ──
  const renewalRow = await get(`
    SELECT COUNT(*) FILTER (WHERE statut_renouvellement='renouvele') AS renouveles,
           COUNT(*) FILTER (WHERE statut_renouvellement='non_renouvele') AS non_renouveles,
           COUNT(*) FILTER (WHERE statut_renouvellement='en_attente') AS en_attente
    FROM clients
  `);
  const renouveles = Number(renewalRow.renouveles), nonRenouveles = Number(renewalRow.non_renouveles);

  // ── Perf par agent (séniore/juniore), période sélectionnée ──
  const [agentStats, clientStatsByAgent, objectives] = await Promise.all([
    all(`
      SELECT u.id, u.nom, u.prenom, u.username, u.objectif_mensuel, u.objectif_annuel, u.taux_commission,
             u.type_agent, u.raison_sociale, u.parent_agent_id,
             COUNT(p.id) total_prospects,
             SUM(CASE WHEN p.date_prospection>=? THEN 1 ELSE 0 END) period_prospects,
             COALESCE(SUM(p.montant_potentiel*p.taux_commission/100),0) commission_total,
             COALESCE(SUM(p.montant_potentiel),0) prime_total,
             COALESCE(SUM(CASE WHEN p.date_prospection>=? THEN p.montant_potentiel ELSE 0 END),0) period_prime_total,
             COALESCE(SUM(CASE WHEN p.date_prospection>=? THEN p.montant_potentiel*p.taux_commission/100 ELSE 0 END),0) period_commission_total
      FROM users u LEFT JOIN prospects p ON p.agent_id=u.id
      WHERE u.role='agent' AND u.is_active=1
      GROUP BY u.id ORDER BY total_prospects DESC
    `, [periodStart, periodStart, periodStart]),
    all(`
      SELECT agent_id,
             COUNT(*) total_clients,
             SUM(CASE WHEN converted_at>=? THEN 1 ELSE 0 END) period_clients,
             COALESCE(SUM(prime_totale),0) prime_clients,
             COALESCE(SUM(commission_totale),0) commission_clients,
             COALESCE(SUM(CASE WHEN converted_at>=? THEN commission_totale ELSE 0 END),0) period_commission_clients
      FROM clients GROUP BY agent_id
    `, [periodStart, periodStart]),
    // Le dénominateur d'objectif ne dépend que de l'objectif mensuel fixé et de la période
    // choisie dans le dashboard : mensuel=×1, trimestre=×3, semestre=×6, année=×12
    // (la "periode" propre à chaque objectif produit n'entre plus en jeu ici).
    all(`
      SELECT apo.agent_id,
        COALESCE(SUM(apo.objectif_mensuel), 0) objectif_base_prospects,
        COALESCE(SUM(apo.objectif_mensuel * pr.prime_annuelle), 0) objectif_base_primes
      FROM agent_product_objectives apo
      JOIN products pr ON pr.id = apo.product_id
      GROUP BY apo.agent_id
    `),
  ]);

  const clientMap = {}; for (const c of clientStatsByAgent) clientMap[c.agent_id] = c;
  const objMap = {}; for (const o of objectives) objMap[o.agent_id] = o;

  const enrichedAgentStats = agentStats.map(a => {
    const cs = clientMap[a.id] || {};
    return {
      ...a,
      hierarchie: a.parent_agent_id ? 'juniore' : 'seniore',
      total_clients: Number(cs.total_clients || 0),
      period_clients: Number(cs.period_clients || 0),
      prime_clients: Number(cs.prime_clients || 0),
      commission_clients: Number(cs.commission_clients || 0),
      period_commission_clients: Number(cs.period_commission_clients || 0),
      objectif_period_prospects: Number(objMap[a.id]?.objectif_base_prospects || 0) * periodMonths,
      objectif_period_primes:    Number(objMap[a.id]?.objectif_base_primes    || 0) * periodMonths,
    };
  });

  // ── Stats par produit : pipeline (prospects encore ouverts) + réalisé (clients) ──
  const [productPipeline, productClients, products] = await Promise.all([
    all(`
      SELECT pp.product_id, COUNT(DISTINCT p.id) total_prospects
      FROM prospect_products pp JOIN prospects p ON p.id = pp.prospect_id
      GROUP BY pp.product_id
    `),
    all(`
      SELECT cp.product_id,
             COUNT(DISTINCT cp.client_id) total_clients,
             COALESCE(SUM(cp.nb_beneficiaires),0) total_beneficiaires,
             COALESCE(SUM(cp.prime_payee),0) total_primes,
             COALESCE(SUM(cp.commission),0) total_commissions
      FROM client_products cp
      GROUP BY cp.product_id
    `),
    all("SELECT id, nom FROM products WHERE is_active=1 ORDER BY nom"),
  ]);

  const pipelineMap = {}; for (const r of productPipeline) pipelineMap[r.product_id] = r;
  const clientsProductMap = {}; for (const r of productClients) clientsProductMap[r.product_id] = r;
  const byProduct = products.map(pr => ({
    id: pr.id, nom: pr.nom,
    total_prospects: Number(pipelineMap[pr.id]?.total_prospects || 0),
    total_clients: Number(clientsProductMap[pr.id]?.total_clients || 0),
    total_beneficiaires: Number(clientsProductMap[pr.id]?.total_beneficiaires || 0),
    total_primes: Number(clientsProductMap[pr.id]?.total_primes || 0),
    total_commissions: Number(clientsProductMap[pr.id]?.total_commissions || 0),
  })).sort((a, b) => b.total_primes - a.total_primes);

  res.json({
    period, period_months: periodMonths,
    agents: {
      total: Number(agentCounts.total),
      seniors: { total: Number(agentCounts.seniors), physique: Number(agentCounts.senior_physique), morale: Number(agentCounts.senior_morale) },
      juniors: { total: Number(agentCounts.juniors), physique: Number(agentCounts.junior_physique), morale: Number(agentCounts.junior_morale) },
      physique: Number(agentCounts.physiques), morale: Number(agentCounts.morales),
    },
    prospects: { total: tp, physique: tpPhy, morale: tpMor },
    clients: { total: tc, physique: tcPhy, morale: tcMor },
    monthly_prospects: Number(monthly.c),
    conversion: {
      total: convRate(tc, tp),
      physique: convRate(tcPhy, tpPhy),
      morale: convRate(tcMor, tpMor),
    },
    prime: primeBlock,
    commission: commissionBlock,
    renouvellement: {
      renouveles, non_renouveles: nonRenouveles, en_attente: Number(renewalRow.en_attente),
      taux: (renouveles + nonRenouveles) > 0 ? parseFloat((renouveles / (renouveles + nonRenouveles) * 100).toFixed(1)) : 0,
    },
    agent_stats: enrichedAgentStats,
    by_product: byProduct,
  });
}));

module.exports = router;
