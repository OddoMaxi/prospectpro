const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { get, all, run } = require('../database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();
const ah = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Liste des produits actifs (tous les utilisateurs authentifiés — pour le formulaire prospect)
router.get('/active', authenticateToken, ah(async (req, res) => {
  const products = await all(
    "SELECT id, nom, prime_annuelle, taux_commission FROM products WHERE is_active=1 ORDER BY nom"
  );
  res.json(products);
}));

// Liste complète (admin)
router.get('/', authenticateToken, requireAdmin, ah(async (req, res) => {
  const products = await all("SELECT * FROM products ORDER BY nom");
  res.json(products);
}));

// Créer un produit (admin)
router.post('/', authenticateToken, requireAdmin, ah(async (req, res) => {
  const { nom, description, prime_annuelle, taux_commission } = req.body;
  if (!nom) return res.status(400).json({ error: 'Nom du produit requis' });

  const id = uuidv4();
  await run(
    "INSERT INTO products (id, nom, description, prime_annuelle, taux_commission) VALUES (?, ?, ?, ?, ?)",
    [id, nom.trim(), description || null, Number(prime_annuelle) || 0, Number(taux_commission) || 5.0]
  );
  const product = await get("SELECT * FROM products WHERE id=?", [id]);
  res.status(201).json({ message: 'Produit créé avec succès', product });
}));

// Modifier un produit (admin)
router.put('/:id', authenticateToken, requireAdmin, ah(async (req, res) => {
  const { nom, description, prime_annuelle, taux_commission, is_active } = req.body;
  const product = await get("SELECT id FROM products WHERE id=?", [req.params.id]);
  if (!product) return res.status(404).json({ error: 'Produit non trouvé' });

  await run(
    `UPDATE products SET nom=?,description=?,prime_annuelle=?,taux_commission=?,is_active=?,updated_at=datetime('now') WHERE id=?`,
    [
      nom.trim(), description || null, Number(prime_annuelle) || 0,
      Number(taux_commission) || 5.0,
      is_active !== undefined ? (is_active ? 1 : 0) : 1,
      req.params.id
    ]
  );
  res.json({ message: 'Produit mis à jour avec succès' });
}));

// Supprimer un produit (admin)
router.delete('/:id', authenticateToken, requireAdmin, ah(async (req, res) => {
  const product = await get("SELECT id FROM products WHERE id=?", [req.params.id]);
  if (!product) return res.status(404).json({ error: 'Produit non trouvé' });

  // Détache les prospects liés avant suppression
  await run("UPDATE prospects SET produit_id=NULL WHERE produit_id=?", [req.params.id]);
  await run("DELETE FROM products WHERE id=?", [req.params.id]);
  res.json({ message: 'Produit supprimé avec succès' });
}));

module.exports = router;
