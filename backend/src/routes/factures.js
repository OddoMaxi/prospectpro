const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { get, all, tx } = require('../database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { ah, HttpError } = require('../utils/http');
const { audit } = require('../utils/audit');
const { personName } = require('../utils/names');
const { addLigne, recalcFacture } = require('../utils/commissions');
const { round } = require('../utils/tarif');
const D = require('../utils/dates');

const router = express.Router();

const MODES = ['especes', 'virement', 'mobile_money'];

const AGENT_JOIN = `JOIN users u ON u.id = f.agent_id`;
const AGENT_COLS = `u.nom AS agent_nom, u.prenom AS agent_prenom, u.raison_sociale AS agent_raison_sociale,
  u.type_agent AS agent_type_agent, u.username AS agent_username, u.parent_agent_id AS agent_parent_id, u.statut AS agent_statut`;

// Un agent ne voit que ses propres factures
async function loadFacture(req, id) {
  const f = await get(`SELECT f.*, ${AGENT_COLS} FROM factures f ${AGENT_JOIN} WHERE f.id = ?`, [id]);
  if (!f || (req.user.role !== 'admin' && f.agent_id !== req.user.id)) throw new HttpError(404, 'Facture introuvable');
  return f;
}

router.get('/', authenticateToken, ah(async (req, res) => {
  const { agent_id, statut, annee, mois } = req.query;
  const args = [];
  let sql = `SELECT f.*, ${AGENT_COLS}, (f.total - f.total_paye) AS reste,
      (SELECT COUNT(*) FROM commission_lignes l WHERE l.facture_id = f.id) AS nb_lignes
    FROM factures f ${AGENT_JOIN} WHERE 1=1`;
  if (req.user.role !== 'admin') { sql += ' AND f.agent_id = ?'; args.push(req.user.id); }
  else if (agent_id) { sql += ' AND f.agent_id = ?'; args.push(agent_id); }
  if (statut) { sql += ' AND f.statut = ?'; args.push(statut); }
  if (annee) { sql += ' AND f.mois LIKE ?'; args.push(`${annee}-%`); }
  if (mois) { sql += ' AND f.mois = ?'; args.push(mois); }
  sql += ' ORDER BY f.mois DESC, u.nom';
  res.json(await all(sql, args));
}));

router.get('/resume', authenticateToken, ah(async (req, res) => {
  const args = [];
  let where = '1=1';
  if (req.user.role !== 'admin') { where += ' AND f.agent_id = ?'; args.push(req.user.id); }
  if (req.query.annee) { where += ' AND f.mois LIKE ?'; args.push(`${req.query.annee}-%`); }
  const r = await get(
    `SELECT COALESCE(SUM(total),0) total, COALESCE(SUM(total_paye),0) paye,
       COALESCE(SUM(CASE WHEN statut <> 'brouillon' THEN total - total_paye ELSE 0 END),0) reste_valide,
       COALESCE(SUM(CASE WHEN statut = 'brouillon' THEN total ELSE 0 END),0) brouillon,
       COUNT(*) nb FROM factures f WHERE ${where}`, args);
  res.json(r);
}));

router.get('/:id', authenticateToken, ah(async (req, res) => {
  const f = await loadFacture(req, req.params.id);
  const [lignes, paiements] = await Promise.all([
    all(`SELECT l.*, k.numero_contrat, c.numero AS client_numero, c.nom AS client_nom, c.prenom AS client_prenom, c.type AS client_type,
           s.nom AS source_nom, s.prenom AS source_prenom, s.raison_sociale AS source_raison_sociale, s.type_agent AS source_type_agent
         FROM commission_lignes l
         LEFT JOIN contrats k ON k.id = l.contrat_id
         LEFT JOIN clients c ON c.id = l.client_id
         LEFT JOIN users s ON s.id = l.source_agent_id
         WHERE l.facture_id = ? ORDER BY l.date_acquisition, l.created_at`, [f.id]),
    all(`SELECT p.*, u.nom AS created_by_nom, u.prenom AS created_by_prenom FROM facture_paiements p
         LEFT JOIN users u ON u.id = p.created_by WHERE p.facture_id = ? ORDER BY p.date_paiement, p.created_at`, [f.id]),
  ]);
  const sum = nature => lignes.filter(l => l.nature === nature).reduce((s, l) => s + Number(l.montant), 0);
  res.json({
    ...f, lignes, paiements, reste: round(f.total - f.total_paye),
    sous_totaux: { commission: sum('commission'), performance: sum('performance'), retrocession: sum('retrocession'), ajustement: sum('ajustement') },
  });
}));

// Validation par l'administrateur : la facture n'est plus modifiable
router.post('/:id/valider', authenticateToken, requireAdmin, ah(async (req, res) => {
  const f = await loadFacture(req, req.params.id);
  if (f.statut !== 'brouillon') throw new HttpError(400, 'Facture déjà validée');
  const report = await tx(async q => {
    // Solde négatif (rétrocessions supérieures aux commissions) : reporté en déduction sur le mois suivant
    let reporte = 0;
    if (f.total < 0) {
      reporte = -f.total;
      const suivant = D.nextMonth(f.mois);
      await addLigne(q, { agent_id: f.agent_id, mois: f.mois, nature: 'ajustement', montant: reporte, libelle: `Report du solde négatif sur ${suivant}`, date_acquisition: D.today(), created_by: req.user.id });
      await addLigne(q, { agent_id: f.agent_id, mois: suivant, nature: 'ajustement', montant: -reporte, libelle: `Solde négatif reporté de ${f.mois}`, date_acquisition: D.today(), created_by: req.user.id });
    }
    await q.run("UPDATE factures SET statut = 'validee', validee_le = NOW(), validee_par = ? WHERE id = ?", [req.user.id, f.id]);
    await recalcFacture(q, f.id);
    await audit(req, 'validation_facture', { type: 'facture', id: f.id, label: f.numero, apres: { total: f.total, solde_reporte: reporte || undefined } }, q);
    return reporte;
  });
  res.json({ message: report ? `Facture validée : solde négatif de ${report} reporté sur le mois suivant` : 'Facture validée' });
}));

// Ligne d'ajustement manuelle (facture brouillon uniquement)
router.post('/:id/ajustements', authenticateToken, requireAdmin, ah(async (req, res) => {
  const f = await loadFacture(req, req.params.id);
  if (f.statut !== 'brouillon') throw new HttpError(400, 'Seule une facture brouillon est modifiable');
  const montant = round(req.body.montant);
  const libelle = String(req.body.libelle || '').trim();
  if (!montant) throw new HttpError(400, 'Montant requis');
  if (!libelle) throw new HttpError(400, 'Libellé requis');
  await tx(async q => {
    await addLigne(q, { agent_id: f.agent_id, mois: f.mois, nature: 'ajustement', montant, libelle: `Ajustement – ${libelle}`, date_acquisition: D.today(), created_by: req.user.id });
    await audit(req, 'ajustement_facture', { type: 'facture', id: f.id, label: f.numero, apres: { montant, libelle } }, q);
  });
  res.json({ message: 'Ajustement ajouté' });
}));

router.delete('/:id/ajustements/:lid', authenticateToken, requireAdmin, ah(async (req, res) => {
  const f = await loadFacture(req, req.params.id);
  if (f.statut !== 'brouillon') throw new HttpError(400, 'Seule une facture brouillon est modifiable');
  await tx(async q => {
    const l = await q.get("SELECT * FROM commission_lignes WHERE id = ? AND facture_id = ? AND nature = 'ajustement'", [req.params.lid, f.id]);
    if (!l) throw new HttpError(404, 'Ajustement introuvable');
    await q.run('DELETE FROM commission_lignes WHERE id = ?', [l.id]);
    await recalcFacture(q, f.id);
    await audit(req, 'suppression_ajustement', { type: 'facture', id: f.id, label: f.numero, avant: { montant: l.montant, libelle: l.libelle } }, q);
  });
  res.json({ message: 'Ajustement supprimé' });
}));

// Paiement d'une tranche : refusé s'il fait dépasser le total de la facture
router.post('/:id/paiements', authenticateToken, requireAdmin, ah(async (req, res) => {
  const { date_paiement, mode, reference } = req.body;
  const montant = round(req.body.montant);
  if (!(montant > 0)) throw new HttpError(400, 'Le montant doit être supérieur à 0');
  if (!D.isDate(date_paiement)) throw new HttpError(400, 'Date de paiement invalide');
  if (!MODES.includes(mode)) throw new HttpError(400, 'Mode de paiement invalide');

  const r = await tx(async q => {
    const f = await q.get('SELECT * FROM factures WHERE id = ? FOR UPDATE', [req.params.id]);
    if (!f) throw new HttpError(404, 'Facture introuvable');
    if (f.statut === 'brouillon') throw new HttpError(400, 'La facture doit être validée avant paiement');
    const reste = round(f.total - f.total_paye);
    if (montant > reste) throw new HttpError(400, `Paiement refusé : le montant dépasse le reste à payer (${reste})`);
    const n = await q.get('SELECT COUNT(*) c FROM facture_paiements');
    const id = uuidv4();
    const numero_recu = `RC-${D.today().slice(0, 7).replace('-', '')}-${String(Number(n.c) + 1).padStart(5, '0')}`;
    await q.run(
      `INSERT INTO facture_paiements (id, facture_id, numero_recu, date_paiement, montant, mode, reference, created_by)
       VALUES (?,?,?,?,?,?,?,?)`, [id, f.id, numero_recu, date_paiement, montant, mode, reference || null, req.user.id]);
    await recalcFacture(q, f.id);
    await audit(req, 'paiement_commission', { type: 'facture', id: f.id, label: f.numero, apres: { numero_recu, montant, mode, reference, date_paiement } }, q);
    return { id, numero_recu, reste: reste - montant };
  });
  res.status(201).json({ message: `Tranche enregistrée (reçu ${r.numero_recu})`, ...r });
}));

router.get('/paiements/:pid', authenticateToken, ah(async (req, res) => {
  const p = await get(
    `SELECT p.*, u.nom AS created_by_nom, u.prenom AS created_by_prenom FROM facture_paiements p
     LEFT JOIN users u ON u.id = p.created_by WHERE p.id = ?`, [req.params.pid]);
  if (!p) throw new HttpError(404, 'Paiement introuvable');
  const f = await loadFacture(req, p.facture_id);
  // Cumul versé jusqu'à cette tranche incluse
  const avant = await get(
    `SELECT COALESCE(SUM(x.montant),0) v FROM facture_paiements x, facture_paiements p
     WHERE p.id = ? AND x.facture_id = p.facture_id
       AND (x.date_paiement < p.date_paiement OR (x.date_paiement = p.date_paiement AND x.created_at <= p.created_at))`,
    [p.id]);
  res.json({ ...p, facture: { ...f, agent_label: personName(f, 'agent_') }, cumul_paye: round(avant.v), reste_apres: round(f.total - avant.v) });
}));

module.exports = router;
