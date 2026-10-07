const express = require('express');
const { get, all, tx } = require('../database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { ah, HttpError } = require('../utils/http');
const { audit } = require('../utils/audit');
const { normalize } = require('../utils/text');
const { TYPES, suggestions, resoudre } = require('../utils/referentiels');

const router = express.Router();

// Colonnes des fiches qui utilisent chaque référentiel
const USAGES = { profession: 'profession', secteur: 'secteur_activite' };

function checkType(type) {
  if (!TYPES.includes(type)) throw new HttpError(400, 'Référentiel inconnu');
  return type;
}

router.get('/:type/suggestions', authenticateToken, ah(async (req, res) => {
  const type = checkType(req.params.type);
  res.json(await suggestions({ all }, type, req.query.q || ''));
}));

// Aperçu de la correction qui sera appliquée à l'enregistrement (n'ajoute rien)
router.get('/:type/resoudre', authenticateToken, ah(async (req, res) => {
  const type = checkType(req.params.type);
  res.json(await resoudre({ get, all }, type, req.query.q || '', req.user.id, { simulation: true }));
}));

router.get('/:type', authenticateToken, requireAdmin, ah(async (req, res) => {
  const type = checkType(req.params.type);
  const col = USAGES[type];
  const rows = await all(
    `SELECT r.*, u.nom AS created_by_nom, u.prenom AS created_by_prenom,
       (SELECT COUNT(*) FROM prospects p WHERE p.${col} = r.valeur AND p.deleted_at IS NULL)
       + (SELECT COUNT(*) FROM clients c WHERE c.${col} = r.valeur) AS nb_fiches
     FROM referentiels r LEFT JOIN users u ON u.id = r.created_by
     WHERE r.type = ? ORDER BY (r.statut = 'a_valider') DESC, r.valeur`, [type]);
  res.json(rows);
}));

async function renommerFiches(q, type, ancien, nouveau) {
  const col = USAGES[type];
  const a = await q.run(`UPDATE prospects SET ${col} = ? WHERE ${col} = ?`, [nouveau, ancien]);
  const b = await q.run(`UPDATE clients SET ${col} = ? WHERE ${col} = ?`, [nouveau, ancien]);
  return a.rowsAffected + b.rowsAffected;
}

// Valider (éventuellement en corrigeant le libellé) ou fusionner dans une valeur existante
router.post('/:type/:id', authenticateToken, requireAdmin, ah(async (req, res) => {
  const type = checkType(req.params.type);
  const { action, valeur, cible_id } = req.body;
  const r = await get('SELECT * FROM referentiels WHERE id = ? AND type = ?', [req.params.id, type]);
  if (!r) throw new HttpError(404, 'Valeur introuvable');

  const result = await tx(async q => {
    if (action === 'valider' || action === 'corriger') {
      const libelle = String(valeur || r.valeur).trim();
      if (!libelle) throw new HttpError(400, 'Libellé requis');
      const norm = normalize(libelle);
      const doublon = await q.get('SELECT id FROM referentiels WHERE type = ? AND valeur_norm = ? AND id <> ?', [type, norm, r.id]);
      if (doublon) throw new HttpError(409, 'Cette valeur existe déjà : utilisez la fusion');
      await q.run("UPDATE referentiels SET valeur = ?, valeur_norm = ?, statut = 'valide' WHERE id = ?", [libelle, norm, r.id]);
      const n = libelle !== r.valeur ? await renommerFiches(q, type, r.valeur, libelle) : 0;
      await audit(req, 'validation_referentiel', { type, id: r.id, label: libelle, avant: { valeur: r.valeur, statut: r.statut }, apres: { valeur: libelle, statut: 'valide', fiches_mises_a_jour: n } }, q);
      return { message: 'Valeur validée', fiches: n };
    }
    if (action === 'fusionner') {
      const cible = await q.get('SELECT * FROM referentiels WHERE id = ? AND type = ?', [cible_id, type]);
      if (!cible || cible.id === r.id) throw new HttpError(400, 'Valeur cible invalide');
      const n = await renommerFiches(q, type, r.valeur, cible.valeur);
      await q.run('DELETE FROM referentiels WHERE id = ?', [r.id]);
      await audit(req, 'fusion_referentiel', { type, id: r.id, label: r.valeur, avant: { valeur: r.valeur }, apres: { fusionne_dans: cible.valeur, fiches_mises_a_jour: n } }, q);
      return { message: `Fusionné dans « ${cible.valeur} »`, fiches: n };
    }
    throw new HttpError(400, 'Action invalide');
  });
  res.json(result);
}));

module.exports = router;
