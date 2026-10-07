const { v4: uuidv4 } = require('uuid');
const D = require('./dates');
const { round } = require('./tarif');

// Facture brouillon de l'agent pour le mois donné ; si ce mois est déjà validé,
// la ligne est reportée sur le premier mois suivant encore en brouillon.
async function factureBrouillon(q, agentId, mois) {
  let m = mois;
  for (let i = 0; i < 240; i++) {
    const f = await q.get('SELECT id, statut FROM factures WHERE agent_id = ? AND mois = ?', [agentId, m]);
    if (!f) {
      const n = await q.get('SELECT COUNT(*) c FROM factures WHERE mois = ?', [m]);
      const id = uuidv4();
      const numero = `FC-${m.replace('-', '')}-${String(Number(n.c) + 1).padStart(4, '0')}`;
      await q.run('INSERT INTO factures (id, numero, agent_id, mois) VALUES (?,?,?,?)', [id, numero, agentId, m]);
      return { id, mois: m };
    }
    if (f.statut === 'brouillon') return { id: f.id, mois: m };
    m = D.nextMonth(m);
  }
  throw new Error('Aucune facture brouillon disponible');
}

async function recalcFacture(q, factureId) {
  const t = await q.get('SELECT COALESCE(SUM(montant),0) v FROM commission_lignes WHERE facture_id = ?', [factureId]);
  const p = await q.get('SELECT COALESCE(SUM(montant),0) v FROM facture_paiements WHERE facture_id = ?', [factureId]);
  const f = await q.get('SELECT statut FROM factures WHERE id = ?', [factureId]);
  const total = round(t.v), paye = round(p.v);
  let statut = f.statut;
  if (statut !== 'brouillon') {
    statut = total <= 0 ? 'payee' : paye <= 0 ? 'validee' : paye >= total ? 'payee' : 'partiel';
  }
  await q.run('UPDATE factures SET total = ?, total_paye = ?, statut = ?, updated_at = NOW() WHERE id = ?',
    [total, paye, statut, factureId]);
}

async function addLigne(q, l) {
  const f = await factureBrouillon(q, l.agent_id, l.mois);
  await q.run(
    `INSERT INTO commission_lignes (id, agent_id, facture_id, mois, contrat_id, periode_id, client_id,
       product_id, product_nom, operation, nature, role, source_agent_id, base, taux, montant,
       date_acquisition, reverse_of, libelle, created_by)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [uuidv4(), l.agent_id, f.id, f.mois, l.contrat_id || null, l.periode_id || null, l.client_id || null,
     l.product_id || null, l.product_nom || null, l.operation || null, l.nature, l.role || null,
     l.source_agent_id || null, round(l.base), Number(l.taux) || 0, round(l.montant),
     l.date_acquisition, l.reverse_of || null, l.libelle || null, l.created_by || null]
  );
  await recalcFacture(q, f.id);
}

// Lignes positives d'une période qui n'ont pas encore été rétrocédées
async function lignesActives(q, periodeId) {
  return q.all(
    `SELECT * FROM commission_lignes l
     WHERE l.periode_id = ? AND l.montant > 0 AND l.nature IN ('commission','performance')
       AND NOT EXISTS (SELECT 1 FROM commission_lignes r WHERE r.reverse_of = l.id)`,
    [periodeId]
  );
}

// Génère la commission classique (et la prime de performance si le renouvellement est anticipé)
// d'une période dont la prime vient d'être intégralement payée.
async function genererCommissionsPeriode(q, periodeId, userId = null) {
  if ((await lignesActives(q, periodeId)).length) return;

  const p = await q.get(
    `SELECT p.*, c.numero_contrat, c.client_id FROM contrat_periodes p
     JOIN contrats c ON c.id = p.contrat_id WHERE p.id = ?`, [periodeId]);
  if (!p || !p.date_paiement_integral) return;

  const vendeur = await q.get('SELECT id, parent_agent_id FROM users WHERE id = ?', [p.agent_id]);
  const parentId = vendeur && vendeur.parent_agent_id;
  const lignes = await q.all(
    `SELECT l.*, pr.taux_commission, pr.taux_commission_sous_agent, pr.taux_renouvellement,
            pr.taux_renouvellement_junior, pr.performance_active, pr.taux_performance,
            pr.taux_performance_junior, pr.delai_anticipation_mois
     FROM periode_lignes l JOIN products pr ON pr.id = l.product_id WHERE l.periode_id = ?`, [periodeId]);

  const isRenouv = p.type === 'renouvellement';
  const mois = D.monthOf(p.date_paiement_integral);
  const opLabel = isRenouv ? 'Renouvellement' : 'Souscription';

  for (const l of lignes) {
    const base = Number(l.prime_pure);
    const common = {
      mois, contrat_id: p.contrat_id, periode_id: p.id, client_id: p.client_id,
      product_id: l.product_id, product_nom: l.product_nom, operation: p.type,
      source_agent_id: p.agent_id, base, date_acquisition: p.date_paiement_integral, created_by: userId,
    };
    // Sénior vendeur : taux total. Junior vendeur : taux Junior, son Sénior touche la différence.
    const emit = async (nature, tauxTotal, tauxJunior, libelle) => {
      tauxTotal = Number(tauxTotal) || 0;
      tauxJunior = Math.min(Number(tauxJunior) || 0, tauxTotal);
      const parts = parentId
        ? [[p.agent_id, 'junior', tauxJunior], [parentId, 'senior', tauxTotal - tauxJunior]]
        : [[p.agent_id, 'direct', tauxTotal]];
      for (const [agentId, role, taux] of parts) {
        const montant = round(base * taux / 100);
        if (montant <= 0) continue;
        await addLigne(q, { ...common, agent_id: agentId, nature, role, taux, montant, libelle });
      }
    };

    await emit('commission',
      isRenouv ? l.taux_renouvellement : l.taux_commission,
      isRenouv ? l.taux_renouvellement_junior : l.taux_commission_sous_agent,
      `${opLabel} ${p.numero_contrat} – ${l.product_nom}`);

    if (isRenouv && Number(l.performance_active) === 1) {
      const limite = D.addMonths(p.date_debut, -(Number(l.delai_anticipation_mois) || 1));
      if (p.date_paiement_integral <= limite) {
        await emit('performance', l.taux_performance, l.taux_performance_junior,
          `Prime de performance ${p.numero_contrat} – ${l.product_nom}`);
      }
    }
  }
}

// Déduit les commissions d'une période sur la facture du mois suivant (lignes négatives)
async function retroceder(q, periodeId, motif, userId = null) {
  const lignes = await lignesActives(q, periodeId);
  const mois = D.nextMonth(D.monthOf(D.today()));
  for (const l of lignes) {
    await addLigne(q, {
      agent_id: l.agent_id, mois, contrat_id: l.contrat_id, periode_id: l.periode_id, client_id: l.client_id,
      product_id: l.product_id, product_nom: l.product_nom, operation: l.operation, nature: 'retrocession',
      role: l.role, source_agent_id: l.source_agent_id, base: l.base, taux: l.taux, montant: -Number(l.montant),
      date_acquisition: D.today(), reverse_of: l.id, created_by: userId,
      libelle: `Rétrocession (${motif}) – ${l.libelle || ''}`.trim(),
    });
  }
  return lignes.length;
}

module.exports = { factureBrouillon, recalcFacture, addLigne, genererCommissionsPeriode, retroceder };
