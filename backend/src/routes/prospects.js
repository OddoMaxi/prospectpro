const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { get, all, run } = require('../database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();
const ah = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

async function saveProspectProducts(prospectId, items) {
  await run("DELETE FROM prospect_products WHERE prospect_id=?", [prospectId]);
  for (const item of (items || [])) {
    if (!item.product_id) continue;
    await run(
      "INSERT INTO prospect_products (id, prospect_id, product_id, nb_beneficiaires) VALUES (?,?,?,?)",
      [uuidv4(), prospectId, item.product_id, Number(item.nb_beneficiaires) || 1]
    );
  }
}

async function computeTotalsFromProducts(items) {
  let totalPrime = 0, totalCommission = 0;
  for (const item of (items || [])) {
    if (!item.product_id) continue;
    const product = await get("SELECT prime_annuelle, taux_commission FROM products WHERE id=?", [item.product_id]);
    if (product) {
      const nb = Number(item.nb_beneficiaires) || 1;
      const prime = nb * Number(product.prime_annuelle);
      totalPrime += prime;
      totalCommission += prime * Number(product.taux_commission) / 100;
    }
  }
  const effectiveTaux = totalPrime > 0 ? (totalCommission / totalPrime * 100) : 0;
  return { montant_potentiel: totalPrime, taux_commission: effectiveTaux };
}

router.post('/', authenticateToken, ah(async (req, res) => {
  const {
    type, nom, prenom, nom_contact, prenom_contact,
    telephone, email, secteur_activite, statut,
    date_prospection, prospect_products,
    lieu_residence_commune, lieu_residence_quartier,
    lieu_activite_commune, lieu_activite_quartier,
    siege_social_commune, siege_social_quartier,
    niveau_interet, profession, sexe,
  } = req.body;

  if (!type || !nom) return res.status(400).json({ error: 'Type et nom requis' });
  if (!['physique', 'morale'].includes(type)) return res.status(400).json({ error: 'Type invalide' });

  const { montant_potentiel, taux_commission } = await computeTotalsFromProducts(prospect_products);
  const id = uuidv4();

  const [lastP, lastC] = await Promise.all([
    get("SELECT MAX(CAST(numero AS INTEGER)) v FROM prospects"),
    get("SELECT MAX(CAST(numero AS INTEGER)) v FROM clients"),
  ]);
  const numero = String(Math.max(Number(lastP?.v || 0), Number(lastC?.v || 0)) + 1).padStart(6, '0');

  await run(
    `INSERT INTO prospects (id, agent_id, type, nom, prenom, nom_contact, prenom_contact,
      telephone, email, secteur_activite, statut, montant_potentiel, taux_commission,
      lieu_residence_commune, lieu_residence_quartier, lieu_activite_commune, lieu_activite_quartier,
      siege_social_commune, siege_social_quartier, niveau_interet, profession, sexe,
      date_prospection, numero)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, req.user.id, type, nom, prenom||null, nom_contact||null, prenom_contact||null,
     telephone||null, email||null, secteur_activite||null, statut||'prospect',
     montant_potentiel, taux_commission,
     lieu_residence_commune||null, lieu_residence_quartier||null,
     lieu_activite_commune||null, lieu_activite_quartier||null,
     siege_social_commune||null, siege_social_quartier||null,
     niveau_interet||null, profession||null, sexe||null,
     date_prospection || new Date().toISOString().split('T')[0], numero]
  );

  await saveProspectProducts(id, prospect_products);

  res.status(201).json({ message: 'Prospect créé avec succès', id });
}));

router.get('/', authenticateToken, ah(async (req, res) => {
  const { type, statut, date_debut, date_fin, agent_id, search } = req.query;

  let sql = `SELECT p.*, u.nom as agent_nom, u.prenom as agent_prenom
    FROM prospects p JOIN users u ON u.id = p.agent_id WHERE 1=1`;
  const args = [];

  if (req.user.role !== 'admin') {
    const subs = await all("SELECT id FROM users WHERE parent_agent_id=? AND role='agent'", [req.user.id]);
    const ids = [req.user.id, ...subs.map(s => s.id)];
    if (agent_id && ids.includes(agent_id)) {
      sql += ' AND p.agent_id = ?'; args.push(agent_id);
    } else {
      sql += ` AND p.agent_id IN (${ids.map(() => '?').join(',')})`;
      args.push(...ids);
    }
  } else if (agent_id) {
    sql += ' AND p.agent_id = ?'; args.push(agent_id);
  }
  if (type)       { sql += ' AND p.type = ?';               args.push(type); }
  if (statut)     { sql += ' AND p.statut = ?';             args.push(statut); }
  if (date_debut) { sql += ' AND p.date_prospection >= ?';  args.push(date_debut); }
  if (date_fin)   { sql += ' AND p.date_prospection <= ?';  args.push(date_fin); }
  if (search) {
    sql += ' AND (p.nom LIKE ? OR p.prenom LIKE ? OR p.lieu_residence_commune LIKE ? OR p.telephone LIKE ?)';
    const s = `%${search}%`;
    args.push(s, s, s, s);
  }
  sql += ' ORDER BY p.created_at DESC';

  res.json(await all(sql, args));
}));

router.get('/:id', authenticateToken, ah(async (req, res) => {
  let sql = 'SELECT p.*, u.nom as agent_nom, u.prenom as agent_prenom FROM prospects p JOIN users u ON u.id = p.agent_id WHERE p.id = ?';
  const args = [req.params.id];
  if (req.user.role !== 'admin') {
    const subs = await all("SELECT id FROM users WHERE parent_agent_id=? AND role='agent'", [req.user.id]);
    const ids = [req.user.id, ...subs.map(s => s.id)];
    sql += ` AND p.agent_id IN (${ids.map(() => '?').join(',')})`;
    args.push(...ids);
  }
  const prospect = await get(sql, args);
  if (!prospect) return res.status(404).json({ error: 'Prospect non trouvé' });

  const pp = await all(
    `SELECT pp.product_id, pp.nb_beneficiaires,
            p.nom as product_nom, p.prime_annuelle, p.taux_commission as product_taux
     FROM prospect_products pp
     LEFT JOIN products p ON p.id = pp.product_id
     WHERE pp.prospect_id = ?`,
    [req.params.id]
  );
  res.json({ ...prospect, prospect_products: pp });
}));

router.put('/:id', authenticateToken, ah(async (req, res) => {
  let cq = 'SELECT id FROM prospects WHERE id = ?';
  const ca = [req.params.id];
  if (req.user.role !== 'admin') { cq += ' AND agent_id = ?'; ca.push(req.user.id); }
  if (!await get(cq, ca)) return res.status(404).json({ error: 'Prospect non trouvé' });

  const {
    type, nom, prenom, nom_contact, prenom_contact,
    telephone, email, secteur_activite, statut,
    date_prospection, prospect_products,
    lieu_residence_commune, lieu_residence_quartier,
    lieu_activite_commune, lieu_activite_quartier,
    siege_social_commune, siege_social_quartier,
    niveau_interet, profession, sexe,
  } = req.body;

  const { montant_potentiel, taux_commission } = await computeTotalsFromProducts(prospect_products);

  await run(
    `UPDATE prospects SET type=?,nom=?,prenom=?,nom_contact=?,prenom_contact=?,
    telephone=?,email=?,secteur_activite=?,statut=?,montant_potentiel=?,taux_commission=?,
    lieu_residence_commune=?,lieu_residence_quartier=?,lieu_activite_commune=?,lieu_activite_quartier=?,
    siege_social_commune=?,siege_social_quartier=?,niveau_interet=?,profession=?,sexe=?,
    date_prospection=?,updated_at=datetime('now') WHERE id=?`,
    [type, nom, prenom||null, nom_contact||null, prenom_contact||null,
     telephone||null, email||null, secteur_activite||null, statut||'prospect',
     montant_potentiel, taux_commission,
     lieu_residence_commune||null, lieu_residence_quartier||null,
     lieu_activite_commune||null, lieu_activite_quartier||null,
     siege_social_commune||null, siege_social_quartier||null,
     niveau_interet||null, profession||null, sexe||null,
     date_prospection||new Date().toISOString().split('T')[0], req.params.id]
  );

  await saveProspectProducts(req.params.id, prospect_products);

  res.json({ message: 'Prospect mis à jour avec succès' });
}));

router.post('/:id/convert', authenticateToken, requireAdmin, ah(async (req, res) => {
  const { numero_contrat, date_effet, date_fin, products } = req.body;
  if (!numero_contrat || !date_effet || !date_fin)
    return res.status(400).json({ error: 'N° contrat, date d\'effet et date de fin requis' });

  const prospect = await get('SELECT * FROM prospects WHERE id = ?', [req.params.id]);
  if (!prospect) return res.status(404).json({ error: 'Prospect non trouvé' });

  const pp = await all(
    `SELECT pp.*, p.nom as product_nom, p.taux_commission as product_taux
     FROM prospect_products pp
     LEFT JOIN products p ON p.id = pp.product_id
     WHERE pp.prospect_id = ?`,
    [req.params.id]
  );

  let prime_totale = 0, commission_totale = 0;
  const items = pp.map(item => {
    const inp = (products || []).find(x => x.product_id === item.product_id);
    const prime_payee = inp ? Number(inp.prime_payee) || 0 : 0;
    const commission = prime_payee * Number(item.product_taux || 0) / 100;
    prime_totale += prime_payee;
    commission_totale += commission;
    return { product_id: item.product_id, product_nom: item.product_nom, nb_beneficiaires: item.nb_beneficiaires, prime_payee, commission };
  });

  const taux_eff = prime_totale > 0 ? (commission_totale / prime_totale * 100) : 0;
  const clientId = uuidv4();

  await run(
    `INSERT INTO clients (id, numero, agent_id, type, nom, prenom, nom_contact, prenom_contact,
      telephone, email, secteur_activite,
      lieu_residence_commune, lieu_residence_quartier, lieu_activite_commune, lieu_activite_quartier,
      siege_social_commune, siege_social_quartier, profession, sexe,
      numero_contrat, date_effet, date_fin,
      prime_totale, commission_totale, taux_commission, date_prospection)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [clientId, prospect.numero, prospect.agent_id,
     prospect.type, prospect.nom, prospect.prenom || null,
     prospect.nom_contact || null, prospect.prenom_contact || null,
     prospect.telephone || null, prospect.email || null,
     prospect.secteur_activite || null,
     prospect.lieu_residence_commune || null, prospect.lieu_residence_quartier || null,
     prospect.lieu_activite_commune || null, prospect.lieu_activite_quartier || null,
     prospect.siege_social_commune || null, prospect.siege_social_quartier || null,
     prospect.profession || null, prospect.sexe || null,
     numero_contrat, date_effet, date_fin,
     prime_totale, commission_totale, taux_eff, prospect.date_prospection]
  );

  for (const item of items) {
    await run(
      `INSERT INTO client_products (id, client_id, product_id, product_nom, nb_beneficiaires, prime_payee, commission)
       VALUES (?,?,?,?,?,?,?)`,
      [uuidv4(), clientId, item.product_id, item.product_nom, item.nb_beneficiaires, item.prime_payee, item.commission]
    );
  }

  // Commission directe pour l'agent
  if (commission_totale > 0) {
    await run(
      `INSERT INTO commissions (id, agent_id, client_id, type, montant_du) VALUES (?,?,?,'direct',?)`,
      [uuidv4(), prospect.agent_id, clientId, commission_totale]
    );
  }

  // Commission parent si l'agent est un sous-agent
  const agentInfo = await get('SELECT parent_agent_id, taux_commission_parent FROM users WHERE id = ?', [prospect.agent_id]);
  if (agentInfo && agentInfo.parent_agent_id && Number(agentInfo.taux_commission_parent) > 0 && prime_totale > 0) {
    const parentComm = prime_totale * Number(agentInfo.taux_commission_parent) / 100;
    await run(
      `INSERT INTO commissions (id, agent_id, client_id, type, source_agent_id, montant_du) VALUES (?,?,?,'parent',?,?)`,
      [uuidv4(), agentInfo.parent_agent_id, clientId, prospect.agent_id, parentComm]
    );
  }

  await run('DELETE FROM prospect_products WHERE prospect_id = ?', [req.params.id]);
  await run('DELETE FROM prospects WHERE id = ?', [req.params.id]);

  res.json({ message: 'Prospect converti en client avec succès', client_id: clientId });
}));

router.delete('/:id', authenticateToken, requireAdmin, ah(async (req, res) => {
  await run("DELETE FROM prospect_products WHERE prospect_id=?", [req.params.id]);
  const r = await run('DELETE FROM prospects WHERE id = ?', [req.params.id]);
  if (r.rowsAffected === 0) return res.status(404).json({ error: 'Prospect non trouvé' });
  res.json({ message: 'Prospect supprimé' });
}));

module.exports = router;
