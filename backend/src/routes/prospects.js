const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { get, all, run, tx } = require('../database');
const { authenticateToken, requireAgent } = require('../middleware/auth');
const { ah, HttpError } = require('../utils/http');
const { audit } = require('../utils/audit');
const { scopeIds, scopeClause } = require('../utils/scope');
const { normalize } = require('../utils/text');
const { personName } = require('../utils/names');
const { resoudre } = require('../utils/referentiels');
const { enregistrerCreation } = require('../utils/affectations');
const { tarifLigne } = require('../utils/tarif');
const { creerContrat } = require('./contrats');
const D = require('../utils/dates');

const router = express.Router();

const STATUTS_MODIFIABLES = ['prospect', 'en_cours', 'perdu'];
const FIELDS = ['type', 'nom', 'prenom', 'nom_contact', 'prenom_contact', 'telephone', 'email', 'secteur_activite',
  'lieu_residence_commune', 'lieu_residence_quartier', 'lieu_activite_commune', 'lieu_activite_quartier',
  'siege_social_commune', 'siege_social_quartier', 'niveau_interet', 'profession', 'sexe', 'date_naissance'];

const telKey = t => String(t || '').replace(/\D/g, '').slice(-9);

// Numéro unique partagé par les prospects et les clients
async function nextNumero(q) {
  const r = await q.get("SELECT nextval('numero_seq') AS v");
  return String(r.v).padStart(7, '0');
}

// Doublons potentiels parmi les prospects et clients de toute l'entreprise
async function chercherDoublons({ type, telephone, nom, prenom, date_naissance, exclude_id }) {
  const out = [];
  const tk = telKey(telephone);
  const cand = await all(
    `SELECT 'prospect' AS source, p.id, p.numero, p.type, p.nom, p.prenom, p.telephone, p.date_naissance,
            u.nom AS agent_nom, u.prenom AS agent_prenom, u.raison_sociale AS agent_raison_sociale, u.type_agent AS agent_type_agent
     FROM prospects p JOIN users u ON u.id = p.agent_id
     WHERE p.deleted_at IS NULL AND p.statut NOT IN ('converti','client') AND p.id <> ?
     UNION ALL
     SELECT 'client', c.id, c.numero, c.type, c.nom, c.prenom, c.telephone, c.date_naissance,
            u.nom, u.prenom, u.raison_sociale, u.type_agent
     FROM clients c JOIN users u ON u.id = c.agent_id
     WHERE c.statut = 'actif'`, [exclude_id || '']);
  const nNom = normalize(nom), nPrenom = normalize(prenom);
  for (const c of cand) {
    const raisons = [];
    if (tk.length >= 8 && telKey(c.telephone) === tk) raisons.push('même téléphone');
    if (type === 'morale' && c.type === 'morale' && nNom && normalize(c.nom) === nNom) raisons.push('même raison sociale');
    if (type === 'physique' && c.type === 'physique' && date_naissance && c.date_naissance === date_naissance
        && normalize(c.nom) === nNom && normalize(c.prenom) === nPrenom) raisons.push('même nom et date de naissance');
    if (raisons.length) {
      out.push({
        source: c.source, id: c.id, numero: c.numero, nom: personName(c), telephone: c.telephone,
        agent: personName(c, 'agent_'), raisons,
      });
    }
  }
  return out;
}

async function readProspect(req) {
  const b = req.body;
  if (!['physique', 'morale'].includes(b.type)) throw new HttpError(400, 'Type invalide');
  if (!b.nom || !String(b.nom).trim()) throw new HttpError(400, b.type === 'morale' ? 'Raison sociale requise' : 'Nom requis');
  if (b.type === 'physique' && !String(b.prenom || '').trim()) throw new HttpError(400, 'Prénom requis');
  if (!String(b.telephone || '').trim()) throw new HttpError(400, 'Téléphone requis');
  if (b.date_naissance && !D.isDate(b.date_naissance)) throw new HttpError(400, 'Date de naissance invalide');
  const p = {};
  for (const f of FIELDS) p[f] = b[f] === '' || b[f] === undefined ? null : (typeof b[f] === 'string' ? b[f].trim() : b[f]);
  p.nom = p.nom.trim();
  return p;
}

// Produits d'intérêt du prospect (simulateur) : seuls les produits actifs sont acceptés
async function saveProspectProducts(q, prospectId, items) {
  await q.run('DELETE FROM prospect_products WHERE prospect_id = ?', [prospectId]);
  let total = 0, commission = 0;
  for (const item of (items || [])) {
    if (!item.product_id) continue;
    const pr = await q.get(
      `SELECT p.*, b.taux_taxe AS branche_taux_taxe FROM products p LEFT JOIN branches b ON b.id = p.branche_id
       WHERE p.id = ? AND p.statut = 'actif'`, [item.product_id]);
    if (!pr) throw new HttpError(400, 'Produit inexistant ou suspendu');
    const nb = Math.max(1, parseInt(item.nb_beneficiaires, 10) || 1);
    const t = tarifLigne(pr, { taux_taxe: pr.branche_taux_taxe }, nb);
    total += t.prime_pure;
    commission += t.prime_pure * Number(pr.taux_commission) / 100;
    await q.run('INSERT INTO prospect_products (id, prospect_id, product_id, nb_beneficiaires) VALUES (?,?,?,?)',
      [uuidv4(), prospectId, item.product_id, nb]);
  }
  // montant_potentiel = prime pure totale ; taux_commission = taux effectif
  await q.run('UPDATE prospects SET montant_potentiel = ?, taux_commission = ? WHERE id = ?',
    [total, total > 0 ? commission / total * 100 : 0, prospectId]);
}

async function resoudreReferentiels(q, p, userId) {
  const corrections = {};
  if (p.type === 'physique' && p.profession) {
    const r = await resoudre(q, 'profession', p.profession, userId);
    if (r.corrige) corrections.profession = r.valeur;
    p.profession = r.valeur;
  }
  if (p.type === 'morale' && p.secteur_activite) {
    const r = await resoudre(q, 'secteur', p.secteur_activite, userId);
    if (r.corrige) corrections.secteur_activite = r.valeur;
    p.secteur_activite = r.valeur;
  }
  if (p.type === 'physique') p.secteur_activite = null; else p.profession = null;
  return corrections;
}

router.post('/doublons', authenticateToken, ah(async (req, res) => {
  res.json(await chercherDoublons(req.body));
}));

// Création réservée aux commerciaux, depuis « Nouveau prospect »
router.post('/', authenticateToken, requireAgent, ah(async (req, res) => {
  const p = await readProspect(req);
  if (!req.body.forcer_doublon) {
    const doublons = await chercherDoublons(p);
    if (doublons.length) throw new HttpError(409, 'Ce prospect semble déjà exister', { doublons });
  }
  const id = uuidv4();
  const corrections = await tx(async q => {
    const corr = await resoudreReferentiels(q, p, req.user.id);
    const numero = await nextNumero(q);
    await q.run(
      `INSERT INTO prospects (id, agent_id, created_by, numero, statut, date_prospection, ${FIELDS.join(', ')})
       VALUES (?,?,?,?,?,?, ${FIELDS.map(() => '?').join(', ')})`,
      [id, req.user.id, req.user.id, numero, 'prospect', D.today(), ...FIELDS.map(f => p[f])]);
    await saveProspectProducts(q, id, req.body.prospect_products);
    await enregistrerCreation(q, 'prospect', id, req.user.id, req.user.id);
    await audit(req, 'creation_prospect', { type: 'prospect', id, label: `${numero} ${personName(p)}`, apres: p }, q);
    return corr;
  });
  res.status(201).json({ message: 'Prospect créé avec succès', id, corrections });
}));

router.get('/', authenticateToken, ah(async (req, res) => {
  const { type, statut, niveau_interet, date_debut, date_fin, agent_id, search, annee } = req.query;
  const args = [];
  let sql = `SELECT p.*, u.nom AS agent_nom, u.prenom AS agent_prenom, u.raison_sociale AS agent_raison_sociale,
      u.type_agent AS agent_type_agent
    FROM prospects p JOIN users u ON u.id = p.agent_id WHERE p.deleted_at IS NULL`;
  const ids = await scopeIds(req.user);
  sql += scopeClause(ids, 'p.agent_id', args);
  if (agent_id) { sql += ' AND p.agent_id = ?'; args.push(agent_id); }
  if (type) { sql += ' AND p.type = ?'; args.push(type); }
  if (statut) {
    if (statut === 'converti') sql += " AND p.statut IN ('converti','client')";
    else { sql += ' AND p.statut = ?'; args.push(statut); }
  }
  if (niveau_interet) { sql += ' AND p.niveau_interet = ?'; args.push(niveau_interet); }
  if (annee) { sql += ' AND EXTRACT(YEAR FROM p.date_prospection) = ?'; args.push(Number(annee)); }
  if (date_debut) { sql += ' AND p.date_prospection >= ?'; args.push(date_debut); }
  if (date_fin) { sql += ' AND p.date_prospection <= ?'; args.push(date_fin); }
  if (search) {
    sql += ' AND (p.nom ILIKE ? OR p.prenom ILIKE ? OR p.telephone ILIKE ? OR p.numero ILIKE ? OR p.lieu_residence_commune ILIKE ?)';
    const s = `%${search}%`;
    args.push(s, s, s, s, s);
  }
  sql += ' ORDER BY p.created_at DESC';
  res.json(await all(sql, args));
}));

async function loadProspect(req, { ownOnly = false } = {}) {
  const args = [req.params.id];
  let sql = `SELECT p.*, u.nom AS agent_nom, u.prenom AS agent_prenom, u.parent_agent_id AS agent_parent_id
    FROM prospects p JOIN users u ON u.id = p.agent_id WHERE p.id = ? AND p.deleted_at IS NULL`;
  if (ownOnly && req.user.role !== 'admin') { sql += ' AND p.agent_id = ?'; args.push(req.user.id); }
  else sql += scopeClause(await scopeIds(req.user), 'p.agent_id', args);
  const p = await get(sql, args);
  if (!p) throw new HttpError(404, 'Prospect non trouvé');
  return p;
}

router.get('/:id', authenticateToken, ah(async (req, res) => {
  const p = await loadProspect(req);
  const pp = await all(
    `SELECT pp.product_id, pp.nb_beneficiaires, pr.nom AS product_nom, pr.prime_pure, pr.cout_police, pr.accessoires,
            pr.taux_taxe, b.taux_taxe AS branche_taux_taxe, pr.statut AS product_statut,
            pr.taux_commission AS product_taux, pr.taux_commission_sous_agent AS product_taux_sa
     FROM prospect_products pp JOIN products pr ON pr.id = pp.product_id LEFT JOIN branches b ON b.id = pr.branche_id
     WHERE pp.prospect_id = ?`, [p.id]);
  const prospect_products = pp.map(x => ({ ...x, ...tarifLigne(x, { taux_taxe: x.branche_taux_taxe }, x.nb_beneficiaires) }));
  res.json({ ...p, is_sous_agent: !!p.agent_parent_id, prospect_products });
}));

router.put('/:id', authenticateToken, ah(async (req, res) => {
  const before = await loadProspect(req, { ownOnly: true });
  if (!STATUTS_MODIFIABLES.includes(before.statut)) throw new HttpError(400, 'Un prospect converti ne peut plus être modifié');
  const p = await readProspect(req);
  if (!req.body.forcer_doublon) {
    const doublons = await chercherDoublons({ ...p, exclude_id: before.id });
    if (doublons.length) throw new HttpError(409, 'Ce prospect semble déjà exister', { doublons });
  }
  const statut = STATUTS_MODIFIABLES.includes(req.body.statut) ? req.body.statut : before.statut;
  const corrections = await tx(async q => {
    const corr = await resoudreReferentiels(q, p, req.user.id);
    await q.run(`UPDATE prospects SET ${FIELDS.map(f => `${f} = ?`).join(', ')}, statut = ?, updated_at = NOW() WHERE id = ?`,
      [...FIELDS.map(f => p[f]), statut, before.id]);
    await saveProspectProducts(q, before.id, req.body.prospect_products);
    return corr;
  });
  res.json({ message: 'Prospect mis à jour avec succès', corrections });
}));

router.patch('/:id/statut', authenticateToken, ah(async (req, res) => {
  const { statut } = req.body;
  if (!STATUTS_MODIFIABLES.includes(statut)) throw new HttpError(400, 'Statut invalide');
  const p = await loadProspect(req, { ownOnly: true });
  if (!STATUTS_MODIFIABLES.includes(p.statut)) throw new HttpError(400, 'Un prospect converti ne peut plus changer de statut');
  await run('UPDATE prospects SET statut = ?, updated_at = NOW() WHERE id = ?', [statut, p.id]);
  res.json({ message: 'Statut mis à jour' });
}));

// Conversion : création du client, du contrat (période de souscription) et premier encaissement éventuel
router.post('/:id/convert', authenticateToken, ah(async (req, res) => {
  const p = await loadProspect(req, { ownOnly: true });
  if (!STATUTS_MODIFIABLES.includes(p.statut) || p.statut === 'perdu') {
    throw new HttpError(400, 'Ce prospect ne peut pas être converti (déjà converti ou perdu)');
  }
  const result = await tx(async q => {
    const clientId = uuidv4();
    const numero = await nextNumero(q);
    await q.run(
      `INSERT INTO clients (id, numero, agent_id, prospect_id, type, nom, prenom, nom_contact, prenom_contact,
         telephone, email, secteur_activite, lieu_residence_commune, lieu_residence_quartier,
         lieu_activite_commune, lieu_activite_quartier, siege_social_commune, siege_social_quartier,
         profession, sexe, date_naissance, date_prospection, statut)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'actif')`,
      [clientId, numero, p.agent_id, p.id, p.type, p.nom, p.prenom, p.nom_contact, p.prenom_contact,
       p.telephone, p.email, p.secteur_activite, p.lieu_residence_commune, p.lieu_residence_quartier,
       p.lieu_activite_commune, p.lieu_activite_quartier, p.siege_social_commune, p.siege_social_quartier,
       p.profession, p.sexe, p.date_naissance, p.date_prospection]);
    await enregistrerCreation(q, 'client', clientId, p.agent_id, req.user.id);
    const contrat = await creerContrat(q, req, { ...req.body, client_id: clientId, agent_id: p.agent_id });
    await q.run("UPDATE prospects SET statut = 'converti', client_id = ?, converted_at = NOW(), updated_at = NOW() WHERE id = ?",
      [clientId, p.id]);
    await audit(req, 'conversion_prospect', {
      type: 'prospect', id: p.id, label: `${p.numero} ${personName(p)}`,
      apres: { client_numero: numero, numero_contrat: contrat.numero_contrat },
    }, q);
    return { client_id: clientId, contrat_id: contrat.id };
  });
  res.json({ message: 'Prospect converti en client avec succès', ...result });
}));

// Suppression logique
router.delete('/:id', authenticateToken, ah(async (req, res) => {
  const p = await loadProspect(req, { ownOnly: true });
  if (!STATUTS_MODIFIABLES.includes(p.statut)) throw new HttpError(400, 'Un prospect converti ne peut pas être supprimé');
  await run('UPDATE prospects SET deleted_at = NOW(), deleted_by = ? WHERE id = ?', [req.user.id, p.id]);
  await audit(req, 'suppression_prospect', { type: 'prospect', id: p.id, label: `${p.numero} ${personName(p)}` });
  res.json({ message: 'Prospect supprimé' });
}));

module.exports = router;
