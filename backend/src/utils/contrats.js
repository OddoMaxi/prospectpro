const { v4: uuidv4 } = require('uuid');
const D = require('./dates');
const { tarifLigne, round } = require('./tarif');
const { HttpError } = require('./http');
const { genererCommissionsPeriode, retroceder } = require('./commissions');

const MODES_PAIEMENT = ['especes', 'virement', 'mobile_money', 'cheque'];

// Crée une période (souscription ou renouvellement) au tarif actuel des produits du contrat
async function creerPeriode(q, contrat, { numero, type, dateDebut, agentId, userId }) {
  const items = await q.all(
    `SELECT cp.nb_beneficiaires, pr.*, b.taux_taxe AS branche_taux_taxe
     FROM contrat_produits cp
     JOIN products pr ON pr.id = cp.product_id
     LEFT JOIN branches b ON b.id = pr.branche_id
     WHERE cp.contrat_id = ?`, [contrat.id]);
  if (!items.length) throw new HttpError(400, 'Le contrat ne comporte aucun produit');

  const id = uuidv4();
  const lignes = items.map(it => ({ it, t: tarifLigne(it, { taux_taxe: it.branche_taux_taxe }, it.nb_beneficiaires) }));
  const sum = k => lignes.reduce((s, l) => s + l.t[k], 0);

  await q.run(
    `INSERT INTO contrat_periodes (id, contrat_id, numero, type, date_debut, date_echeance,
       prime_pure, prime_commerciale, prime_ttc, agent_id, created_by)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [id, contrat.id, numero, type, dateDebut, D.addMonths(dateDebut, contrat.duree_mois),
     sum('prime_pure'), sum('prime_commerciale'), sum('prime_ttc'), agentId, userId]
  );
  for (const { it, t } of lignes) {
    await q.run(
      `INSERT INTO periode_lignes (id, periode_id, product_id, product_nom, nb_beneficiaires, prime_pure,
         cout_police, accessoires, prime_commerciale, taux_taxe, taxes, prime_ttc)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [uuidv4(), id, it.id, it.nom, t.nb_beneficiaires, t.prime_pure, t.cout_police, t.accessoires,
       t.prime_commerciale, t.taux_taxe, t.taxes, t.prime_ttc]
    );
  }
  return id;
}

function checkPaiement({ montant, date_paiement, mode }) {
  if (!(Number(montant) > 0)) throw new HttpError(400, 'Le montant doit être supérieur à 0');
  if (!D.isDate(date_paiement)) throw new HttpError(400, 'Date de paiement invalide');
  if (date_paiement > D.today()) throw new HttpError(400, 'La date de paiement ne peut pas être dans le futur');
  if (mode && !MODES_PAIEMENT.includes(mode)) throw new HttpError(400, 'Mode de paiement invalide');
}

// Enregistre un encaissement client. Quand la prime est intégralement payée, la période est
// considérée comme souscrite/renouvelée à cette date et les commissions sont générées.
async function encaisser(q, periodeId, paiement, userId) {
  checkPaiement(paiement);
  const p = await q.get(
    `SELECT p.*, c.statut AS contrat_statut, c.client_id FROM contrat_periodes p
     JOIN contrats c ON c.id = p.contrat_id WHERE p.id = ?`, [periodeId]);
  if (!p || p.statut !== 'active') throw new HttpError(404, 'Période introuvable');
  if (p.contrat_statut === 'resilie') throw new HttpError(400, 'Contrat résilié');

  const reste = round(p.prime_ttc - p.montant_paye);
  const montant = round(paiement.montant);
  if (reste <= 0) throw new HttpError(400, 'La prime de cette période est déjà intégralement payée');
  if (montant > reste) throw new HttpError(400, `Le montant dépasse le reste à payer (${reste})`);

  await q.run(
    `INSERT INTO encaissements (id, periode_id, date_paiement, montant, mode, reference, created_by)
     VALUES (?,?,?,?,?,?,?)`,
    [uuidv4(), periodeId, paiement.date_paiement, montant, paiement.mode || null, paiement.reference || null, userId]
  );
  const paye = round(p.montant_paye + montant);
  await q.run('UPDATE contrat_periodes SET montant_paye = ? WHERE id = ?', [paye, periodeId]);

  if (paye >= round(p.prime_ttc)) {
    // L'agent crédité est celui qui suit le client à la date du paiement intégral
    const client = await q.get('SELECT agent_id FROM clients WHERE id = ?', [p.client_id]);
    const anticipe = p.type === 'renouvellement' && paiement.date_paiement <= D.addMonths(p.date_debut, -1) ? 1 : 0;
    await q.run(
      'UPDATE contrat_periodes SET date_paiement_integral = ?, agent_id = ?, anticipe = ? WHERE id = ?',
      [paiement.date_paiement, client.agent_id, anticipe, periodeId]
    );
    await genererCommissionsPeriode(q, periodeId, userId);
    return { integral: true };
  }
  return { integral: false };
}

// Annule un encaissement ; si la période n'est plus soldée, ses commissions sont rétrocédées
async function annulerEncaissement(q, encaissementId, motif, userId) {
  const e = await q.get('SELECT * FROM encaissements WHERE id = ?', [encaissementId]);
  if (!e || e.annule) throw new HttpError(404, 'Encaissement introuvable ou déjà annulé');
  await q.run(
    'UPDATE encaissements SET annule = 1, annule_le = NOW(), annule_par = ?, motif_annulation = ? WHERE id = ?',
    [userId, motif || null, encaissementId]
  );
  const s = await q.get('SELECT COALESCE(SUM(montant),0) v FROM encaissements WHERE periode_id = ? AND annule = 0', [e.periode_id]);
  const p = await q.get('SELECT * FROM contrat_periodes WHERE id = ?', [e.periode_id]);
  await q.run('UPDATE contrat_periodes SET montant_paye = ? WHERE id = ?', [round(s.v), e.periode_id]);
  let retro = 0;
  if (p.date_paiement_integral && round(s.v) < round(p.prime_ttc)) {
    await q.run('UPDATE contrat_periodes SET date_paiement_integral = NULL, anticipe = 0 WHERE id = ?', [e.periode_id]);
    retro = await retroceder(q, e.periode_id, 'paiement annulé', userId);
  }
  return { periode_id: e.periode_id, retrocessions: retro };
}

module.exports = { creerPeriode, encaisser, annulerEncaissement, checkPaiement, MODES_PAIEMENT };
