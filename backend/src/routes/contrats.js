const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { get, all, tx } = require('../database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { ah, HttpError } = require('../utils/http');
const { audit } = require('../utils/audit');
const { scopeIds, scopeClause } = require('../utils/scope');
const { personName } = require('../utils/names');
const { creerPeriode, encaisser, annulerEncaissement, checkPaiement } = require('../utils/contrats');
const { retroceder } = require('../utils/commissions');
const { getInt, getSetting } = require('../utils/settings');
const D = require('../utils/dates');

const router = express.Router();

// Création d'un contrat avec sa période de souscription (utilisé aussi par la conversion d'un prospect)
async function creerContrat(q, req, body) {
  const numero = String(body.numero_contrat || '').trim();
  if (!numero) throw new HttpError(400, 'N° de contrat requis');
  if (!D.isDate(body.date_effet)) throw new HttpError(400, "Date d'effet invalide");
  const duree = parseInt(body.duree_mois, 10) || await getInt('duree_contrat_mois');
  if (duree < 1 || duree > 120) throw new HttpError(400, 'Durée invalide (1 à 120 mois)');
  if (await q.get('SELECT id FROM contrats WHERE numero_contrat = ?', [numero])) throw new HttpError(400, 'Ce numéro de contrat existe déjà');

  const produits = (body.produits || []).filter(p => p.product_id);
  if (!produits.length) throw new HttpError(400, 'Au moins un produit est requis');
  const vus = new Set();
  for (const p of produits) {
    if (vus.has(p.product_id)) throw new HttpError(400, 'Un produit est présent deux fois');
    vus.add(p.product_id);
    const pr = await q.get("SELECT id FROM products WHERE id = ? AND statut = 'actif'", [p.product_id]);
    if (!pr) throw new HttpError(400, 'Produit inexistant ou suspendu : souscription impossible');
  }
  const paiement = body.paiement && Number(body.paiement.montant) > 0 ? body.paiement : null;
  if (paiement) checkPaiement(paiement);

  const contrat = { id: uuidv4(), numero_contrat: numero, duree_mois: duree };
  await q.run(
    'INSERT INTO contrats (id, numero_contrat, client_id, duree_mois, date_effet, created_by) VALUES (?,?,?,?,?,?)',
    [contrat.id, numero, body.client_id, duree, body.date_effet, req.user.id]);
  for (const p of produits) {
    await q.run('INSERT INTO contrat_produits (id, contrat_id, product_id, nb_beneficiaires) VALUES (?,?,?,?)',
      [uuidv4(), contrat.id, p.product_id, Math.max(1, parseInt(p.nb_beneficiaires, 10) || 1)]);
  }
  const periodeId = await creerPeriode(q, contrat, {
    numero: 1, type: 'souscription', dateDebut: body.date_effet, agentId: body.agent_id, userId: req.user.id,
  });
  if (paiement) await encaisser(q, periodeId, paiement, req.user.id);
  await audit(req, 'creation_contrat', { type: 'contrat', id: contrat.id, label: numero, apres: { duree, date_effet: body.date_effet, produits } }, q);
  return contrat;
}

// Contrat visible par l'utilisateur (périmètre Junior / Sénior / admin)
async function loadContrat(req, id) {
  const args = [id];
  const sql = 'SELECT * FROM v_contrats WHERE id = ?' + scopeClause(await scopeIds(req.user), 'agent_id', args);
  const c = await get(sql, args);
  if (!c) throw new HttpError(404, 'Contrat introuvable');
  return c;
}

router.get('/', authenticateToken, ah(async (req, res) => {
  const { statut, agent_id, search, annee, client_id, product_id } = req.query;
  const args = [];
  let sql = `SELECT v.*, u.nom AS agent_nom, u.prenom AS agent_prenom, u.raison_sociale AS agent_raison_sociale,
      u.type_agent AS agent_type_agent,
      (SELECT string_agg(pr.nom, ', ' ORDER BY pr.nom) FROM contrat_produits cp JOIN products pr ON pr.id = cp.product_id
       WHERE cp.contrat_id = v.id) AS produits
    FROM v_contrats v JOIN users u ON u.id = v.agent_id WHERE v.client_statut = 'actif'`;
  sql += scopeClause(await scopeIds(req.user), 'v.agent_id', args);
  if (agent_id) { sql += ' AND v.agent_id = ?'; args.push(agent_id); }
  if (client_id) { sql += ' AND v.client_id = ?'; args.push(client_id); }
  if (statut) { sql += ' AND v.statut_calcule = ?'; args.push(statut); }
  if (product_id) { sql += ' AND EXISTS (SELECT 1 FROM contrat_produits cp WHERE cp.contrat_id = v.id AND cp.product_id = ?)'; args.push(product_id); }
  if (annee) {
    // Contrats en vigueur pendant l'exercice
    sql += ' AND v.date_effet <= ? AND (v.date_echeance >= ? OR v.periode_paiement_integral IS NULL)';
    args.push(`${annee}-12-31`, `${annee}-01-01`);
  }
  if (search) {
    sql += ' AND (v.numero_contrat ILIKE ? OR v.client_nom ILIKE ? OR v.client_prenom ILIKE ? OR v.client_numero ILIKE ? OR v.client_telephone ILIKE ?)';
    const s = `%${search}%`;
    args.push(s, s, s, s, s);
  }
  sql += ' ORDER BY v.date_echeance ASC';
  res.json(await all(sql, args));
}));

// Échéancier : contrats arrivant à échéance dans les N jours (et échus non renouvelés depuis moins de 30 jours)
router.get('/echeances', authenticateToken, ah(async (req, res) => {
  const jours = Math.min(365, parseInt(req.query.jours, 10) || 90);
  const args = [jours];
  let sql = `SELECT v.*, u.nom AS agent_nom, u.prenom AS agent_prenom, u.raison_sociale AS agent_raison_sociale,
      u.type_agent AS agent_type_agent,
      (SELECT string_agg(pr.nom, ', ') FROM contrat_produits cp JOIN products pr ON pr.id = cp.product_id
       WHERE cp.contrat_id = v.id) AS produits
    FROM v_contrats v JOIN users u ON u.id = v.agent_id
    WHERE v.statut = 'actif' AND v.client_statut = 'actif' AND v.jours_restants <= ? AND v.jours_restants >= -30`;
  sql += scopeClause(await scopeIds(req.user), 'v.agent_id', args);
  if (req.query.agent_id) { sql += ' AND v.agent_id = ?'; args.push(req.query.agent_id); }
  sql += ' ORDER BY v.date_echeance ASC';
  res.json(await all(sql, args));
}));

router.get('/:id', authenticateToken, ah(async (req, res) => {
  const c = await loadContrat(req, req.params.id);
  const [client, produits, periodes, lignes, encaissements, commissions] = await Promise.all([
    get(`SELECT cl.*, u.nom AS agent_nom, u.prenom AS agent_prenom, u.raison_sociale AS agent_raison_sociale, u.type_agent AS agent_type_agent
         FROM clients cl JOIN users u ON u.id = cl.agent_id WHERE cl.id = ?`, [c.client_id]),
    all(`SELECT cp.*, pr.nom AS product_nom, pr.statut AS product_statut, b.nom AS branche_nom
         FROM contrat_produits cp JOIN products pr ON pr.id = cp.product_id LEFT JOIN branches b ON b.id = pr.branche_id
         WHERE cp.contrat_id = ?`, [c.id]),
    all(`SELECT p.*, u.nom AS agent_nom, u.prenom AS agent_prenom, u.raison_sociale AS agent_raison_sociale, u.type_agent AS agent_type_agent
         FROM contrat_periodes p JOIN users u ON u.id = p.agent_id WHERE p.contrat_id = ? ORDER BY p.numero`, [c.id]),
    all(`SELECT l.* FROM periode_lignes l JOIN contrat_periodes p ON p.id = l.periode_id WHERE p.contrat_id = ?`, [c.id]),
    all(`SELECT e.*, u.nom AS created_by_nom, u.prenom AS created_by_prenom FROM encaissements e
         JOIN contrat_periodes p ON p.id = e.periode_id LEFT JOIN users u ON u.id = e.created_by
         WHERE p.contrat_id = ? ORDER BY e.date_paiement, e.created_at`, [c.id]),
    all(`SELECT l.*, u.nom AS agent_nom, u.prenom AS agent_prenom, u.raison_sociale AS agent_raison_sociale,
           u.type_agent AS agent_type_agent, f.numero AS facture_numero, f.statut AS facture_statut
         FROM commission_lignes l JOIN users u ON u.id = l.agent_id LEFT JOIN factures f ON f.id = l.facture_id
         WHERE l.contrat_id = ? ORDER BY l.created_at`, [c.id]),
  ]);
  const ids = await scopeIds(req.user);
  res.json({
    ...c, client, produits,
    periodes: periodes.map(p => ({
      ...p,
      lignes: lignes.filter(l => l.periode_id === p.id),
      encaissements: encaissements.filter(e => e.periode_id === p.id),
    })),
    // Un agent ne voit que ses propres lignes de commission (et celles de ses Juniors pour un Sénior)
    commissions: ids ? commissions.filter(l => ids.includes(l.agent_id)) : commissions,
  });
}));

// Nouveau contrat pour un client existant
router.post('/', authenticateToken, ah(async (req, res) => {
  const args = [req.body.client_id];
  const client = await get("SELECT * FROM clients WHERE id = ? AND statut = 'actif'" + scopeClause(await scopeIds(req.user), 'agent_id', args), args);
  if (!client) throw new HttpError(404, 'Client introuvable');
  const contrat = await tx(q => creerContrat(q, req, { ...req.body, client_id: client.id, agent_id: client.agent_id }));
  res.status(201).json({ message: 'Contrat créé', id: contrat.id });
}));

// Renouvellement : crée la période suivante au tarif actuel. Le renouvellement est acquis
// quand sa prime est intégralement payée (encaissement immédiat possible).
router.post('/:id/renouveler', authenticateToken, ah(async (req, res) => {
  const c = await loadContrat(req, req.params.id);
  if (c.statut === 'resilie') throw new HttpError(400, 'Contrat résilié');
  const paiement = req.body.paiement && Number(req.body.paiement.montant) > 0 ? req.body.paiement : null;
  const r = await tx(async q => {
    const der = await q.get("SELECT * FROM contrat_periodes WHERE contrat_id = ? AND statut = 'active' ORDER BY numero DESC LIMIT 1", [c.id]);
    if (!der.date_paiement_integral) {
      throw new HttpError(400, der.numero === 1
        ? "La prime de souscription n'est pas encore soldée"
        : 'Un renouvellement est déjà en attente de paiement');
    }
    const client = await q.get('SELECT agent_id FROM clients WHERE id = ?', [c.client_id]);
    const periodeId = await creerPeriode(q, c, {
      numero: der.numero + 1, type: 'renouvellement', dateDebut: der.date_echeance, agentId: client.agent_id, userId: req.user.id,
    });
    const enc = paiement ? await encaisser(q, periodeId, paiement, req.user.id) : { integral: false };
    await audit(req, 'renouvellement_contrat', { type: 'contrat', id: c.id, label: c.numero_contrat, apres: { periode: der.numero + 1, paiement } }, q);
    return { periode_id: periodeId, integral: enc.integral };
  });
  res.json({
    message: r.integral ? 'Contrat renouvelé : prime intégralement payée, commissions générées' : 'Période de renouvellement créée, en attente du paiement intégral',
    ...r,
  });
}));

router.post('/periodes/:pid/encaissements', authenticateToken, ah(async (req, res) => {
  const p = await get('SELECT contrat_id FROM contrat_periodes WHERE id = ?', [req.params.pid]);
  if (!p) throw new HttpError(404, 'Période introuvable');
  const c = await loadContrat(req, p.contrat_id);
  const r = await tx(async q => {
    const out = await encaisser(q, req.params.pid, req.body, req.user.id);
    await audit(req, 'encaissement', { type: 'contrat', id: c.id, label: c.numero_contrat, apres: { montant: req.body.montant, date: req.body.date_paiement, mode: req.body.mode, reference: req.body.reference } }, q);
    return out;
  });
  res.json({ message: r.integral ? 'Prime intégralement payée : commissions générées' : 'Encaissement enregistré', ...r });
}));

router.post('/encaissements/:eid/annuler', authenticateToken, requireAdmin, ah(async (req, res) => {
  const r = await tx(async q => {
    const e = await q.get('SELECT e.*, k.numero_contrat, k.id AS contrat_id FROM encaissements e JOIN contrat_periodes p ON p.id = e.periode_id JOIN contrats k ON k.id = p.contrat_id WHERE e.id = ?', [req.params.eid]);
    if (!e) throw new HttpError(404, 'Encaissement introuvable');
    const out = await annulerEncaissement(q, e.id, req.body.motif, req.user.id);
    await audit(req, 'annulation_encaissement', { type: 'contrat', id: e.contrat_id, label: e.numero_contrat, avant: { montant: e.montant, date: e.date_paiement }, apres: { motif: req.body.motif, retrocessions: out.retrocessions } }, q);
    return out;
  });
  res.json({ message: r.retrocessions ? `Encaissement annulé : ${r.retrocessions} ligne(s) de commission rétrocédée(s) le mois prochain` : 'Encaissement annulé', ...r });
}));

router.post('/:id/resilier', authenticateToken, requireAdmin, ah(async (req, res) => {
  const c = await loadContrat(req, req.params.id);
  if (c.statut === 'resilie') throw new HttpError(400, 'Contrat déjà résilié');
  const date = req.body.date || D.today();
  if (!D.isDate(date)) throw new HttpError(400, 'Date de résiliation invalide');
  const motif = String(req.body.motif || '').trim();
  if (!motif) throw new HttpError(400, 'Motif de résiliation requis');
  const n = await tx(async q => {
    await q.run("UPDATE contrats SET statut = 'resilie', resilie_le = ?, resilie_motif = ?, resilie_par = ? WHERE id = ?",
      [date, motif, req.user.id, c.id]);
    let count = 0;
    if (req.body.retroceder !== false) count = await retroceder(q, c.periode_id, 'résiliation', req.user.id);
    await audit(req, 'resiliation_contrat', { type: 'contrat', id: c.id, label: c.numero_contrat, avant: { statut: c.statut_calcule }, apres: { statut: 'resilie', date, motif, lignes_retrocedees: count } }, q);
    return count;
  });
  res.json({ message: n ? `Contrat résilié : ${n} ligne(s) de commission rétrocédée(s) sur la facture du mois prochain` : 'Contrat résilié' });
}));

// Message de relance prêt à envoyer par SMS / WhatsApp
router.get('/:id/relance', authenticateToken, ah(async (req, res) => {
  const c = await loadContrat(req, req.params.id);
  const agent = await get('SELECT nom, prenom, raison_sociale, type_agent, telephone FROM users WHERE id = ?', [c.agent_id]);
  const fr = d => d.split('-').reverse().join('/');
  const modele = await getSetting('message_relance');
  const message = modele
    .replace(/\{client\}/g, personName(c, 'client_'))
    .replace(/\{contrat\}/g, c.numero_contrat)
    .replace(/\{echeance\}/g, fr(c.date_echeance))
    .replace(/\{date_limite\}/g, fr(D.addMonths(c.date_echeance, -1)))
    .replace(/\{agent\}/g, `${personName(agent)}${agent.telephone ? ` (${agent.telephone})` : ''}`);
  res.json({ telephone: c.client_telephone, message });
}));

module.exports = router;
module.exports.creerContrat = creerContrat;
