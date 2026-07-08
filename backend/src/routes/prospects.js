const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { get, all, run } = require('../database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();
const ah = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Alimente automatiquement les listes profession/secteur d'activité avec toute
// valeur inédite saisie par l'agent, sans jamais créer de doublon (ON CONFLICT DO NOTHING)
async function ensureProfessionAndSecteur(profession, secteur_activite) {
  if (profession) {
    await run('INSERT INTO professions (id, nom) VALUES (?,?) ON CONFLICT DO NOTHING', [uuidv4(), profession.trim()]);
  }
  if (secteur_activite) {
    await run('INSERT INTO secteurs_activite (id, nom) VALUES (?,?) ON CONFLICT DO NOTHING', [uuidv4(), secteur_activite.trim()]);
  }
}

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
  let totalPrime = 0, totalCommission = 0, totalCoutPolice = 0, totalAccessoire = 0;
  for (const item of (items || [])) {
    if (!item.product_id) continue;
    const product = await get("SELECT prime_annuelle, taux_commission, cout_police, montant_accessoire FROM products WHERE id=?", [item.product_id]);
    if (product) {
      const nb = Number(item.nb_beneficiaires) || 1;
      const prime = nb * Number(product.prime_annuelle);
      totalPrime += prime;
      totalCommission += prime * Number(product.taux_commission) / 100;
      totalCoutPolice += nb * Number(product.cout_police || 0);
      totalAccessoire += nb * Number(product.montant_accessoire || 0);
    }
  }
  const effectiveTaux = totalPrime > 0 ? (totalCommission / totalPrime * 100) : 0;
  return {
    montant_potentiel: totalPrime, taux_commission: effectiveTaux,
    cout_police_potentiel: totalCoutPolice, accessoire_potentiel: totalAccessoire
  };
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

  const { montant_potentiel, taux_commission, cout_police_potentiel, accessoire_potentiel } = await computeTotalsFromProducts(prospect_products);
  const id = uuidv4();

  const [lastP, lastC] = await Promise.all([
    get("SELECT MAX(CAST(numero AS INTEGER)) v FROM prospects"),
    get("SELECT MAX(CAST(numero AS INTEGER)) v FROM clients"),
  ]);
  const numero = String(Math.max(Number(lastP?.v || 0), Number(lastC?.v || 0)) + 1).padStart(7, '0');

  await run(
    `INSERT INTO prospects (id, agent_id, type, nom, prenom, nom_contact, prenom_contact,
      telephone, email, secteur_activite, statut, montant_potentiel, taux_commission,
      cout_police_potentiel, accessoire_potentiel,
      lieu_residence_commune, lieu_residence_quartier, lieu_activite_commune, lieu_activite_quartier,
      siege_social_commune, siege_social_quartier, niveau_interet, profession, sexe,
      date_prospection, numero)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, req.user.id, type, nom, prenom||null, nom_contact||null, prenom_contact||null,
     telephone||null, email||null, secteur_activite||null, statut||'prospect',
     montant_potentiel, taux_commission, cout_police_potentiel, accessoire_potentiel,
     lieu_residence_commune||null, lieu_residence_quartier||null,
     lieu_activite_commune||null, lieu_activite_quartier||null,
     siege_social_commune||null, siege_social_quartier||null,
     niveau_interet||null, profession||null, sexe||null,
     date_prospection || new Date().toISOString().split('T')[0], numero]
  );

  await saveProspectProducts(id, prospect_products);
  await ensureProfessionAndSecteur(profession, secteur_activite);

  res.status(201).json({ message: 'Prospect créé avec succès', id });
}));

router.get('/', authenticateToken, ah(async (req, res) => {
  const { type, statut, niveau_interet, date_debut, date_fin, agent_id, search } = req.query;

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
  if (type)            { sql += ' AND p.type = ?';               args.push(type); }
  if (statut)          { sql += ' AND p.statut = ?';             args.push(statut); }
  if (niveau_interet)  { sql += ' AND p.niveau_interet = ?';     args.push(niveau_interet); }
  if (date_debut)      { sql += ' AND p.date_prospection >= ?';  args.push(date_debut); }
  if (date_fin)        { sql += ' AND p.date_prospection <= ?';  args.push(date_fin); }
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
            p.nom as product_nom, p.prime_annuelle,
            p.taux_commission as product_taux,
            p.taux_commission_sous_agent as product_taux_sa
     FROM prospect_products pp
     LEFT JOIN products p ON p.id = pp.product_id
     WHERE pp.prospect_id = ?`,
    [req.params.id]
  );

  const agentRow = await get('SELECT parent_agent_id FROM users WHERE id = ?', [prospect.agent_id]);
  const is_sous_agent = !!(agentRow && agentRow.parent_agent_id);

  res.json({ ...prospect, is_sous_agent, prospect_products: pp });
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

  const { montant_potentiel, taux_commission, cout_police_potentiel, accessoire_potentiel } = await computeTotalsFromProducts(prospect_products);

  await run(
    `UPDATE prospects SET type=?,nom=?,prenom=?,nom_contact=?,prenom_contact=?,
    telephone=?,email=?,secteur_activite=?,statut=?,montant_potentiel=?,taux_commission=?,
    cout_police_potentiel=?,accessoire_potentiel=?,
    lieu_residence_commune=?,lieu_residence_quartier=?,lieu_activite_commune=?,lieu_activite_quartier=?,
    siege_social_commune=?,siege_social_quartier=?,niveau_interet=?,profession=?,sexe=?,
    date_prospection=?,updated_at=NOW() WHERE id=?`,
    [type, nom, prenom||null, nom_contact||null, prenom_contact||null,
     telephone||null, email||null, secteur_activite||null, statut||'prospect',
     montant_potentiel, taux_commission, cout_police_potentiel, accessoire_potentiel,
     lieu_residence_commune||null, lieu_residence_quartier||null,
     lieu_activite_commune||null, lieu_activite_quartier||null,
     siege_social_commune||null, siege_social_quartier||null,
     niveau_interet||null, profession||null, sexe||null,
     date_prospection||new Date().toISOString().split('T')[0], req.params.id]
  );

  await saveProspectProducts(req.params.id, prospect_products);
  await ensureProfessionAndSecteur(profession, secteur_activite);

  res.json({ message: 'Prospect mis à jour avec succès' });
}));

router.patch('/:id/statut', authenticateToken, ah(async (req, res) => {
  const { statut } = req.body;
  if (!['prospect', 'en_cours', 'perdu'].includes(statut))
    return res.status(400).json({ error: 'Statut invalide' });

  let cq = 'SELECT id FROM prospects WHERE id = ?';
  const ca = [req.params.id];
  if (req.user.role !== 'admin') { cq += ' AND agent_id = ?'; ca.push(req.user.id); }
  if (!await get(cq, ca)) return res.status(404).json({ error: 'Prospect non trouvé' });

  await run("UPDATE prospects SET statut=?, updated_at=NOW() WHERE id=?", [statut, req.params.id]);
  res.json({ message: 'Statut mis à jour' });
}));

router.post('/:id/convert', authenticateToken, ah(async (req, res) => {
  const { numero_contrat, date_effet, duree, date_fin: date_fin_input, products } = req.body;
  if (!numero_contrat || !date_effet || (!duree && !date_fin_input))
    return res.status(400).json({ error: 'N° contrat, date d\'effet et durée (ou date de fin) requis' });

  // Calcul de date_fin à partir de la durée si fournie
  let date_fin = date_fin_input;
  if (duree && Number(duree) > 0) {
    const d = new Date(date_effet);
    d.setMonth(d.getMonth() + Number(duree));
    date_fin = d.toISOString().split('T')[0];
  }
  if (!date_fin) return res.status(400).json({ error: 'Date de fin invalide' });

  // Agents can only convert their own prospects
  let prospectQ = 'SELECT * FROM prospects WHERE id = ?';
  const prospectA = [req.params.id];
  if (req.user.role !== 'admin') { prospectQ += ' AND agent_id = ?'; prospectA.push(req.user.id); }
  const prospect = await get(prospectQ, prospectA);
  if (!prospect) return res.status(404).json({ error: 'Prospect non trouvé' });

  // Récupère les produits avec les deux taux (agent + sous-agent) + coût de police / accessoire fixes
  const pp = await all(
    `SELECT pp.*, p.nom as product_nom, p.taux_commission as taux_agent, p.taux_commission_sous_agent as taux_sous_agent,
            p.cout_police, p.montant_accessoire
     FROM prospect_products pp
     LEFT JOIN products p ON p.id = pp.product_id
     WHERE pp.prospect_id = ?`,
    [req.params.id]
  );

  // Détermine si l'agent est un sous-agent
  const agentInfo = await get('SELECT parent_agent_id FROM users WHERE id = ?', [prospect.agent_id]);
  const isSousAgent = !!(agentInfo && agentInfo.parent_agent_id);

  let prime_totale = 0;
  let commission_agent_total = 0;   // commission au taux agent (pour l'agent direct ou parent)
  let commission_sa_total = 0;      // commission au taux sous-agent (si sous-agent)
  let cout_police_total = 0;
  let accessoire_total = 0;

  const items = pp.map(item => {
    const inp = (products || []).find(x => x.product_id === item.product_id);
    const prime_payee = inp ? Number(inp.prime_payee) || 0 : 0;
    const tauxA = Number(item.taux_agent || 0);
    const tauxSA = Number(item.taux_sous_agent || 0);
    const nb = Number(item.nb_beneficiaires) || 1;
    const commAgent  = prime_payee * tauxA  / 100;
    const commSA     = prime_payee * tauxSA / 100;
    const coutPolice = nb * Number(item.cout_police || 0);
    const accessoire = nb * Number(item.montant_accessoire || 0);
    prime_totale += prime_payee;
    commission_agent_total += commAgent;
    commission_sa_total    += commSA;
    cout_police_total += coutPolice;
    accessoire_total  += accessoire;
    // commission stockée dans client_products = commission de l'acteur direct
    const commissionActeur = isSousAgent ? commSA : commAgent;
    return {
      product_id: item.product_id, product_nom: item.product_nom,
      nb_beneficiaires: item.nb_beneficiaires, prime_payee,
      commission: commissionActeur, taux_agent: tauxA, taux_sous_agent: tauxSA,
      cout_police: coutPolice, accessoire
    };
  });

  // Commission totale = ce que l'acteur direct reçoit
  const commission_totale = isSousAgent ? commission_sa_total : commission_agent_total;
  const taux_eff = prime_totale > 0 ? (commission_totale / prime_totale * 100) : 0;
  const clientId = uuidv4();

  // Génération d'un nouveau numéro unique à 7 chiffres pour le client
  const [lastP2, lastC2] = await Promise.all([
    get("SELECT MAX(CAST(numero AS INTEGER)) v FROM prospects"),
    get("SELECT MAX(CAST(numero AS INTEGER)) v FROM clients"),
  ]);
  const clientNumero = String(Math.max(Number(lastP2?.v || 0), Number(lastC2?.v || 0)) + 1).padStart(7, '0');

  await run(
    `INSERT INTO clients (id, numero, agent_id, type, nom, prenom, nom_contact, prenom_contact,
      telephone, email, secteur_activite,
      lieu_residence_commune, lieu_residence_quartier, lieu_activite_commune, lieu_activite_quartier,
      siege_social_commune, siege_social_quartier, profession, sexe,
      numero_contrat, date_effet, date_fin, duree_contrat,
      prime_totale, commission_totale, taux_commission, cout_police_total, accessoire_total, date_prospection)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [clientId, clientNumero, prospect.agent_id,
     prospect.type, prospect.nom, prospect.prenom || null,
     prospect.nom_contact || null, prospect.prenom_contact || null,
     prospect.telephone || null, prospect.email || null,
     prospect.secteur_activite || null,
     prospect.lieu_residence_commune || null, prospect.lieu_residence_quartier || null,
     prospect.lieu_activite_commune || null, prospect.lieu_activite_quartier || null,
     prospect.siege_social_commune || null, prospect.siege_social_quartier || null,
     prospect.profession || null, prospect.sexe || null,
     numero_contrat, date_effet, date_fin, duree ? Number(duree) : null,
     prime_totale, commission_totale, taux_eff, cout_police_total, accessoire_total, prospect.date_prospection]
  );

  for (const item of items) {
    await run(
      `INSERT INTO client_products (id, client_id, product_id, product_nom, nb_beneficiaires, prime_payee, commission, cout_police, accessoire)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [uuidv4(), clientId, item.product_id, item.product_nom, item.nb_beneficiaires, item.prime_payee, item.commission, item.cout_police, item.accessoire]
    );
  }

  // Enregistrement des commissions selon le rôle
  if (!isSousAgent) {
    // Agent direct : reçoit le taux agent
    if (commission_agent_total > 0) {
      await run(
        `INSERT INTO commissions (id, agent_id, client_id, type, montant_du) VALUES (?,?,?,'direct',?)`,
        [uuidv4(), prospect.agent_id, clientId, commission_agent_total]
      );
    }
  } else {
    // Sous-agent : reçoit le taux sous-agent
    if (commission_sa_total > 0) {
      await run(
        `INSERT INTO commissions (id, agent_id, client_id, type, montant_du) VALUES (?,?,?,'direct',?)`,
        [uuidv4(), prospect.agent_id, clientId, commission_sa_total]
      );
    }
    // Agent parent : reçoit la différence (taux_agent - taux_sous_agent)
    const commParent = commission_agent_total - commission_sa_total;
    if (agentInfo.parent_agent_id && commParent > 0) {
      await run(
        `INSERT INTO commissions (id, agent_id, client_id, type, source_agent_id, montant_du) VALUES (?,?,?,'parent',?,?)`,
        [uuidv4(), agentInfo.parent_agent_id, clientId, prospect.agent_id, commParent]
      );
    }
  }

  await run('DELETE FROM prospect_products WHERE prospect_id = ?', [req.params.id]);
  await run('DELETE FROM prospects WHERE id = ?', [req.params.id]);

  res.json({ message: 'Prospect converti en client avec succès', client_id: clientId });
}));

router.delete('/:id', authenticateToken, ah(async (req, res) => {
  let cq = 'SELECT id FROM prospects WHERE id = ?';
  const ca = [req.params.id];
  if (req.user.role !== 'admin') { cq += ' AND agent_id = ?'; ca.push(req.user.id); }
  if (!await get(cq, ca)) return res.status(404).json({ error: 'Prospect non trouvé ou accès refusé' });
  await run("DELETE FROM prospect_products WHERE prospect_id=?", [req.params.id]);
  await run('DELETE FROM prospects WHERE id = ?', [req.params.id]);
  res.json({ message: 'Prospect supprimé' });
}));

module.exports = router;
