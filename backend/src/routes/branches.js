const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { get, all, run } = require('../database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { ah, HttpError } = require('../utils/http');
const { audit } = require('../utils/audit');

const router = express.Router();

router.get('/', authenticateToken, ah(async (req, res) => {
  res.json(await all(
    `SELECT b.*,
       (SELECT COUNT(*) FROM products p WHERE p.branche_id = b.id AND p.statut <> 'supprime') AS nb_produits
     FROM branches b WHERE b.statut <> 'supprime' ORDER BY b.nom`));
}));

function readBranche(body) {
  if (!body.nom || !String(body.nom).trim()) throw new HttpError(400, 'Nom de la branche requis');
  const taux = Number(body.taux_taxe);
  if (!(taux >= 0 && taux <= 100)) throw new HttpError(400, 'Taux de taxe invalide (0 à 100 %)');
  return { nom: String(body.nom).trim(), description: body.description || null, taux_taxe: taux };
}

router.post('/', authenticateToken, requireAdmin, ah(async (req, res) => {
  const b = readBranche(req.body);
  if (await get("SELECT id FROM branches WHERE LOWER(nom) = LOWER(?) AND statut <> 'supprime'", [b.nom])) {
    throw new HttpError(400, 'Une branche porte déjà ce nom');
  }
  const id = uuidv4();
  await run('INSERT INTO branches (id, nom, description, taux_taxe) VALUES (?,?,?,?)', [id, b.nom, b.description, b.taux_taxe]);
  await audit(req, 'creation_branche', { type: 'branche', id, label: b.nom, apres: b });
  res.status(201).json({ message: 'Branche créée', id });
}));

router.put('/:id', authenticateToken, requireAdmin, ah(async (req, res) => {
  const before = await get("SELECT * FROM branches WHERE id = ? AND statut <> 'supprime'", [req.params.id]);
  if (!before) throw new HttpError(404, 'Branche introuvable');
  const b = readBranche(req.body);
  await run('UPDATE branches SET nom=?, description=?, taux_taxe=?, updated_at=NOW() WHERE id=?',
    [b.nom, b.description, b.taux_taxe, req.params.id]);
  await audit(req, 'modification_branche', {
    type: 'branche', id: req.params.id, label: b.nom,
    avant: { nom: before.nom, description: before.description, taux_taxe: before.taux_taxe }, apres: b,
  });
  res.json({ message: 'Branche mise à jour' });
}));

router.delete('/:id', authenticateToken, requireAdmin, ah(async (req, res) => {
  const b = await get("SELECT * FROM branches WHERE id = ? AND statut <> 'supprime'", [req.params.id]);
  if (!b) throw new HttpError(404, 'Branche introuvable');
  const n = await get("SELECT COUNT(*) c FROM products WHERE branche_id = ? AND statut <> 'supprime'", [b.id]);
  if (n.c > 0) throw new HttpError(409, `Suppression impossible : ${n.c} produit(s) rattaché(s) à cette branche`);
  await run("UPDATE branches SET statut='supprime', deleted_at=NOW(), deleted_by=? WHERE id=?", [req.user.id, b.id]);
  await audit(req, 'suppression_branche', { type: 'branche', id: b.id, label: b.nom });
  res.json({ message: 'Branche supprimée' });
}));

module.exports = router;
