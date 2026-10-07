const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { get, all, run } = require('../database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { ah, HttpError } = require('../utils/http');
const { audit } = require('../utils/audit');
const { tarifLigne } = require('../utils/tarif');
const { getInt } = require('../utils/settings');

const router = express.Router();

const SELECT = `SELECT p.*, b.nom AS branche_nom, b.taux_taxe AS branche_taux_taxe
  FROM products p LEFT JOIN branches b ON b.id = p.branche_id`;

// Ajoute la prime commerciale et la prime TTC calculées (non saisissables)
const withTarif = p => {
  const t = tarifLigne(p, { taux_taxe: p.branche_taux_taxe }, 1);
  return { ...p, prime_commerciale: t.prime_commerciale, taux_taxe_effectif: t.taux_taxe, taxes: t.taxes, prime_ttc: t.prime_ttc };
};

// Produits ouverts à la souscription
router.get('/active', authenticateToken, ah(async (req, res) => {
  const rows = await all(`${SELECT} WHERE p.statut = 'actif' ORDER BY b.nom, p.nom`);
  res.json(rows.map(withTarif));
}));

router.get('/', authenticateToken, requireAdmin, ah(async (req, res) => {
  const rows = await all(
    `${SELECT.replace('FROM products p', `,
       (SELECT COUNT(DISTINCT k.id) FROM contrat_produits cp JOIN contrats k ON k.id = cp.contrat_id
        WHERE cp.product_id = p.id AND k.statut = 'actif') AS nb_contrats_actifs
     FROM products p`)}
     WHERE p.statut <> 'supprime' ORDER BY b.nom, p.nom`);
  res.json(rows.map(withTarif));
}));

router.get('/:id', authenticateToken, requireAdmin, ah(async (req, res) => {
  const p = await get(`${SELECT} WHERE p.id = ?`, [req.params.id]);
  if (!p) throw new HttpError(404, 'Produit non trouvé');
  res.json(withTarif(p));
}));

const pct = (v, label) => {
  const n = Number(v) || 0;
  if (n < 0 || n > 100) throw new HttpError(400, `${label} : taux invalide (0 à 100 %)`);
  return n;
};
const amount = (v, label) => {
  const n = Number(v) || 0;
  if (n < 0) throw new HttpError(400, `${label} : montant invalide`);
  return Math.round(n);
};

async function readProduct(body) {
  if (!body.nom || !String(body.nom).trim()) throw new HttpError(400, 'Nom du produit requis');
  if (!body.branche_id) throw new HttpError(400, 'Branche requise');
  const b = await get("SELECT id FROM branches WHERE id = ? AND statut <> 'supprime'", [body.branche_id]);
  if (!b) throw new HttpError(400, 'Branche introuvable');

  const p = {
    nom: String(body.nom).trim(),
    description: body.description || null,
    branche_id: body.branche_id,
    prime_pure: amount(body.prime_pure, 'Prime pure'),
    cout_police: amount(body.cout_police, 'Coût de police'),
    accessoires: amount(body.accessoires, 'Accessoires'),
    taux_taxe: body.taux_taxe === '' || body.taux_taxe === null || body.taux_taxe === undefined ? null : pct(body.taux_taxe, 'Taxe'),
    taux_commission: pct(body.taux_commission, 'Commission souscription'),
    taux_commission_sous_agent: pct(body.taux_commission_sous_agent, 'Commission souscription Junior'),
    taux_renouvellement: pct(body.taux_renouvellement, 'Commission renouvellement'),
    taux_renouvellement_junior: pct(body.taux_renouvellement_junior, 'Commission renouvellement Junior'),
    performance_active: body.performance_active ? 1 : 0,
    taux_performance: pct(body.taux_performance, 'Prime de performance'),
    taux_performance_junior: pct(body.taux_performance_junior, 'Prime de performance Junior'),
    delai_anticipation_mois: Math.max(1, parseInt(body.delai_anticipation_mois, 10) || await getInt('delai_anticipation_mois')),
  };
  if (p.prime_pure <= 0) throw new HttpError(400, 'La prime pure doit être supérieure à 0');
  if (p.taux_commission_sous_agent > p.taux_commission) throw new HttpError(400, 'La part Junior (souscription) dépasse le taux total');
  if (p.taux_renouvellement_junior > p.taux_renouvellement) throw new HttpError(400, 'La part Junior (renouvellement) dépasse le taux total');
  if (p.taux_performance_junior > p.taux_performance) throw new HttpError(400, 'La part Junior (performance) dépasse le taux total');
  if (!p.performance_active) { p.taux_performance = 0; p.taux_performance_junior = 0; }
  return p;
}

const COLS = ['nom', 'description', 'branche_id', 'prime_pure', 'cout_police', 'accessoires', 'taux_taxe',
  'taux_commission', 'taux_commission_sous_agent', 'taux_renouvellement', 'taux_renouvellement_junior',
  'performance_active', 'taux_performance', 'taux_performance_junior', 'delai_anticipation_mois'];

router.post('/', authenticateToken, requireAdmin, ah(async (req, res) => {
  const p = await readProduct(req.body);
  const id = uuidv4();
  await run(
    `INSERT INTO products (id, ${COLS.join(', ')}, prime_annuelle) VALUES (?, ${COLS.map(() => '?').join(', ')}, ?)`,
    [id, ...COLS.map(c => p[c]), p.prime_pure]);
  await audit(req, 'creation_produit', { type: 'produit', id, label: p.nom, apres: p });
  res.status(201).json({ message: 'Produit créé avec succès', id });
}));

router.put('/:id', authenticateToken, requireAdmin, ah(async (req, res) => {
  const before = await get("SELECT * FROM products WHERE id = ? AND statut <> 'supprime'", [req.params.id]);
  if (!before) throw new HttpError(404, 'Produit non trouvé');
  const p = await readProduct(req.body);
  await run(`UPDATE products SET ${COLS.map(c => `${c} = ?`).join(', ')}, prime_annuelle = ?, updated_at = NOW() WHERE id = ?`,
    [...COLS.map(c => p[c]), p.prime_pure, req.params.id]);
  await audit(req, 'modification_produit', {
    type: 'produit', id: req.params.id, label: p.nom,
    avant: Object.fromEntries(COLS.map(c => [c, before[c]])), apres: p,
  });
  res.json({ message: 'Produit mis à jour avec succès' });
}));

// Suspendre / réactiver : un produit suspendu n'accepte plus de souscription mais ses contrats vivent
router.patch('/:id/statut', authenticateToken, requireAdmin, ah(async (req, res) => {
  const p = await get("SELECT * FROM products WHERE id = ? AND statut <> 'supprime'", [req.params.id]);
  if (!p) throw new HttpError(404, 'Produit non trouvé');
  const statut = req.body.action === 'suspendre' ? 'suspendu' : req.body.action === 'reactiver' ? 'actif' : null;
  if (!statut) throw new HttpError(400, 'Action invalide');
  await run('UPDATE products SET statut = ?, is_active = ?, updated_at = NOW() WHERE id = ?', [statut, statut === 'actif' ? 1 : 0, p.id]);
  await audit(req, statut === 'actif' ? 'reactivation_produit' : 'suspension_produit',
    { type: 'produit', id: p.id, label: p.nom, avant: { statut: p.statut }, apres: { statut } });
  res.json({ message: statut === 'actif' ? 'Produit réactivé' : 'Produit suspendu' });
}));

// Suppression logique, refusée s'il reste un contrat actif
router.delete('/:id', authenticateToken, requireAdmin, ah(async (req, res) => {
  const p = await get("SELECT * FROM products WHERE id = ? AND statut <> 'supprime'", [req.params.id]);
  if (!p) throw new HttpError(404, 'Produit non trouvé');
  const n = await get(
    `SELECT COUNT(DISTINCT v.id) c FROM contrat_produits cp JOIN v_contrats v ON v.id = cp.contrat_id
     WHERE cp.product_id = ? AND v.statut_calcule NOT IN ('resilie','expire')`, [p.id]);
  if (n.c > 0) throw new HttpError(409, `Suppression impossible : ${n.c} contrat(s) actif(s) sur ce produit`);
  await run("UPDATE products SET statut='supprime', is_active=0, deleted_at=NOW(), deleted_by=? WHERE id=?", [req.user.id, p.id]);
  await run('DELETE FROM prospect_products WHERE product_id = ?', [p.id]);
  await audit(req, 'suppression_produit', { type: 'produit', id: p.id, label: p.nom, avant: { statut: p.statut } });
  res.json({ message: 'Produit supprimé' });
}));

module.exports = router;
