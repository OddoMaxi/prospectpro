// Indicateurs des tableaux de bord (administrateur et commerciaux).
// Règles :
//  - les totaux historiques (production, encaissements, commissions) comptent toutes les opérations réellement réalisées ;
//  - les classements et les taux d'atteinte d'objectifs n'incluent que les agents et produits actifs.
const express = require('express');
const { get, all } = require('../database');
const { authenticateToken } = require('../middleware/auth');
const { ah, HttpError } = require('../utils/http');
const { scopeIds } = require('../utils/scope');
const D = require('../utils/dates');

const router = express.Router();

const MONTHS = { mois: 1, trimestre: 3, semestre: 6, annee: 12 };

function previousRange({ debut, fin, type }) {
  if (MONTHS[type]) {
    const d = D.addMonths(debut, -MONTHS[type]);
    return { debut: d, fin: D.addDays(debut, -1) };
  }
  const len = D.diffDays(fin, debut);
  const f = D.addDays(debut, -1);
  return { debut: D.addDays(f, -len), fin: f };
}

function lastYearRange({ debut, fin }) {
  return { debut: D.addMonths(debut, -12), fin: D.addMonths(fin, -12) };
}

// Construit les filtres « agent / branche / produit » d'une requête
function cond(f, { agentCol, productCol, brancheCol }) {
  const parts = [], args = [];
  if (f.agentIds && agentCol) {
    if (!f.agentIds.length) parts.push('1=0');
    else { parts.push(`${agentCol} IN (${f.agentIds.map(() => '?').join(',')})`); args.push(...f.agentIds); }
  }
  if (f.productId && productCol) { parts.push(`${productCol} = ?`); args.push(f.productId); }
  if (f.brancheId && brancheCol) { parts.push(`${brancheCol} = ?`); args.push(f.brancheId); }
  return { sql: parts.length ? ' AND ' + parts.join(' AND ') : '', args };
}

const LIGNES = `FROM contrat_periodes p
  JOIN periode_lignes l ON l.periode_id = p.id
  JOIN products pr ON pr.id = l.product_id`;
const LCOLS = { agentCol: 'p.agent_id', productCol: 'l.product_id', brancheCol: 'pr.branche_id' };

async function metrics(r, f) {
  const c = cond(f, LCOLS);
  const [prod, renouv, echus, enc, comm, payees, crees, convertis] = await Promise.all([
    get(`SELECT COUNT(DISTINCT p.contrat_id) nb, COALESCE(SUM(l.prime_ttc),0) prime_ttc, COALESCE(SUM(l.prime_pure),0) prime_pure
         ${LIGNES} WHERE p.statut = 'active' AND p.type = 'souscription' AND p.date_debut BETWEEN ? AND ? ${c.sql}`,
      [r.debut, r.fin, ...c.args]),
    get(`SELECT COUNT(DISTINCT p.id) nb, COUNT(DISTINCT CASE WHEN p.anticipe = 1 THEN p.id END) anticipes,
           COALESCE(SUM(l.prime_ttc),0) prime_ttc, COALESCE(SUM(l.prime_pure),0) prime_pure
         ${LIGNES} WHERE p.statut = 'active' AND p.type = 'renouvellement'
           AND p.date_paiement_integral BETWEEN ? AND ? ${c.sql}`, [r.debut, r.fin, ...c.args]),
    // Taux de renouvellement : parmi les périodes arrivées à échéance, celles dont la suivante est payée
    get(`SELECT COUNT(DISTINCT p.id) echus,
           COUNT(DISTINCT CASE WHEN EXISTS (
             SELECT 1 FROM contrat_periodes n WHERE n.contrat_id = p.contrat_id AND n.numero = p.numero + 1
               AND n.statut = 'active' AND n.date_paiement_integral IS NOT NULL) THEN p.id END) renouveles
         ${LIGNES} WHERE p.statut = 'active' AND p.date_echeance BETWEEN ? AND ? ${c.sql}`, [r.debut, r.fin, ...c.args]),
    get(`SELECT COALESCE(SUM(e.montant * l.prime_ttc / NULLIF(p.prime_ttc, 0)),0) v
         FROM encaissements e ${LIGNES.replace('FROM contrat_periodes p', 'JOIN contrat_periodes p ON p.id = e.periode_id')}
         WHERE e.annule = 0 AND e.date_paiement BETWEEN ? AND ? ${c.sql}`, [r.debut, r.fin, ...c.args]),
    (() => {
      const cc = cond(f, { agentCol: 'cl.agent_id', productCol: 'cl.product_id', brancheCol: 'pr.branche_id' });
      return get(`SELECT COALESCE(SUM(cl.montant),0) dues,
             COALESCE(SUM(CASE WHEN cl.nature = 'commission' THEN cl.montant END),0) commission,
             COALESCE(SUM(CASE WHEN cl.nature = 'performance' THEN cl.montant END),0) performance,
             COALESCE(SUM(CASE WHEN cl.nature = 'retrocession' THEN cl.montant END),0) retrocession
           FROM commission_lignes cl LEFT JOIN products pr ON pr.id = cl.product_id
           WHERE cl.date_acquisition BETWEEN ? AND ? ${cc.sql}`, [r.debut, r.fin, ...cc.args]);
    })(),
    (() => {
      const cc = cond(f, { agentCol: 'fa.agent_id' });
      return get(`SELECT COALESCE(SUM(fp.montant),0) v FROM facture_paiements fp JOIN factures fa ON fa.id = fp.facture_id
                  WHERE fp.date_paiement BETWEEN ? AND ? ${cc.sql}`, [r.debut, r.fin, ...cc.args]);
    })(),
    (() => {
      const cc = cond(f, { agentCol: 'pp.agent_id' });
      const prod = f.productId || f.brancheId
        ? ` AND EXISTS (SELECT 1 FROM prospect_products x JOIN products pr ON pr.id = x.product_id WHERE x.prospect_id = pp.id
            ${f.productId ? 'AND x.product_id = ?' : ''} ${f.brancheId ? 'AND pr.branche_id = ?' : ''})` : '';
      const pargs = [f.productId, f.brancheId].filter(Boolean);
      return get(`SELECT COUNT(*) v FROM prospects pp WHERE pp.date_prospection BETWEEN ? AND ?
                  AND (pp.deleted_at IS NULL OR pp.statut IN ('converti','client')) ${cc.sql}${prod}`,
        [r.debut, r.fin, ...cc.args, ...pargs]);
    })(),
    (() => {
      const cc = cond(f, { agentCol: 'pp.agent_id' });
      return get(`SELECT COUNT(*) v FROM prospects pp WHERE pp.converted_at::date BETWEEN ? AND ? ${cc.sql}
                  ${f.productId || f.brancheId ? `AND EXISTS (SELECT 1 FROM contrats k JOIN contrat_produits cp ON cp.contrat_id = k.id
                    JOIN products pr ON pr.id = cp.product_id WHERE k.client_id = pp.client_id
                    ${f.productId ? 'AND cp.product_id = ?' : ''} ${f.brancheId ? 'AND pr.branche_id = ?' : ''})` : ''}`,
        [r.debut, r.fin, ...cc.args, ...[f.productId, f.brancheId].filter(Boolean)]);
    })(),
  ]);

  return {
    periode: r,
    production: { nb: prod.nb, prime_ttc: prod.prime_ttc, prime_pure: prod.prime_pure },
    renouvellements: {
      nb: renouv.nb, anticipes: renouv.anticipes, prime_ttc: renouv.prime_ttc, prime_pure: renouv.prime_pure,
      echus: echus.echus, renouveles: echus.renouveles,
      taux: echus.echus ? Math.round(echus.renouveles / echus.echus * 1000) / 10 : null,
    },
    encaissements: Math.round(enc.v),
    commissions: { dues: comm.dues, commission: comm.commission, performance: comm.performance, retrocession: comm.retrocession, payees: payees.v },
    pipeline: { crees: crees.v, convertis: convertis.v, taux: crees.v ? Math.round(convertis.v / crees.v * 1000) / 10 : null },
  };
}

// Réalisé / objectif par agent actif (produits actifs uniquement)
async function objectifs(r, f) {
  const months = D.monthsBetween(r.debut, r.fin);
  const agentsC = cond(f, { agentCol: 'u.id' });
  const agents = await all(
    `SELECT u.id, u.nom, u.prenom, u.raison_sociale, u.type_agent, u.parent_agent_id,
            pa.nom AS parent_nom, pa.prenom AS parent_prenom, pa.raison_sociale AS parent_raison_sociale, pa.type_agent AS parent_type_agent
     FROM users u LEFT JOIN users pa ON pa.id = u.parent_agent_id
     WHERE u.role = 'agent' AND u.statut = 'actif' ${agentsC.sql} ORDER BY u.nom`, agentsC.args);
  if (!agents.length) return { agents: [], global: null };
  const ids = agents.map(a => a.id);
  const inIds = `(${ids.map(() => '?').join(',')})`;
  const pc = cond({ productId: f.productId, brancheId: f.brancheId }, { productCol: 'pr.id', brancheCol: 'pr.branche_id' });

  const [objs, real] = await Promise.all([
    all(`SELECT apo.agent_id, SUM(apo.objectif_mensuel) nb, SUM(apo.objectif_mensuel * pr.prime_pure) montant
         FROM agent_product_objectives apo JOIN products pr ON pr.id = apo.product_id AND pr.statut = 'actif'
         WHERE apo.agent_id IN ${inIds} ${pc.sql} GROUP BY apo.agent_id`, [...ids, ...pc.args]),
    all(`SELECT p.agent_id, COUNT(l.id) nb, COALESCE(SUM(l.prime_pure),0) montant, COALESCE(SUM(l.prime_ttc),0) prime_ttc
         ${LIGNES} WHERE p.statut = 'active' AND p.type = 'souscription' AND pr.statut = 'actif'
           AND p.date_debut BETWEEN ? AND ? AND p.agent_id IN ${inIds} ${pc.sql} GROUP BY p.agent_id`,
      [r.debut, r.fin, ...ids, ...pc.args]),
  ]);
  const pct = (a, b) => (b > 0 ? Math.round(a / b * 1000) / 10 : null);
  const rows = agents.map(a => {
    const o = objs.find(x => x.agent_id === a.id) || {};
    const re = real.find(x => x.agent_id === a.id) || {};
    const obj_nb = Math.round((o.nb || 0) * months), obj_montant = Math.round((o.montant || 0) * months);
    return {
      ...a, objectif_nb: obj_nb, objectif_montant: obj_montant,
      realise_nb: re.nb || 0, realise_montant: re.montant || 0, prime_ttc: re.prime_ttc || 0,
      atteinte_nb: pct(re.nb || 0, obj_nb), atteinte_montant: pct(re.montant || 0, obj_montant),
    };
  }).sort((x, y) => y.realise_montant - x.realise_montant);
  const sum = k => rows.reduce((s, x) => s + x[k], 0);
  return {
    agents: rows,
    global: {
      objectif_nb: sum('objectif_nb'), objectif_montant: sum('objectif_montant'),
      realise_nb: sum('realise_nb'), realise_montant: sum('realise_montant'),
      atteinte_nb: pct(sum('realise_nb'), sum('objectif_nb')), atteinte_montant: pct(sum('realise_montant'), sum('objectif_montant')),
    },
  };
}

async function echeances(f) {
  const c = cond(f, { agentCol: 'v.agent_id' });
  const prod = f.productId || f.brancheId
    ? ` AND EXISTS (SELECT 1 FROM contrat_produits cp JOIN products pr ON pr.id = cp.product_id WHERE cp.contrat_id = v.id
        ${f.productId ? 'AND cp.product_id = ?' : ''} ${f.brancheId ? 'AND pr.branche_id = ?' : ''})` : '';
  return get(
    `SELECT COUNT(CASE WHEN jours_restants BETWEEN 0 AND 30 THEN 1 END) j30,
            COUNT(CASE WHEN jours_restants BETWEEN 31 AND 60 THEN 1 END) j60,
            COUNT(CASE WHEN jours_restants BETWEEN 61 AND 90 THEN 1 END) j90,
            COALESCE(SUM(CASE WHEN jours_restants BETWEEN 0 AND 90 THEN prime_ttc END),0) prime_ttc_90
     FROM v_contrats v WHERE v.statut = 'actif' AND v.client_statut = 'actif' ${c.sql}${prod}`,
    [...c.args, ...[f.productId, f.brancheId].filter(Boolean)]);
}

async function repartition(r, f, groupCol, labelCol, joinBranche) {
  const c = cond(f, LCOLS);
  const rows = await all(
    `SELECT ${groupCol} AS id, ${labelCol} AS nom,
       COUNT(DISTINCT CASE WHEN p.type = 'souscription' AND p.date_debut BETWEEN ? AND ? THEN p.contrat_id END) nb_souscriptions,
       COALESCE(SUM(CASE WHEN p.type = 'souscription' AND p.date_debut BETWEEN ? AND ? THEN l.prime_ttc END),0) prime_souscriptions,
       COUNT(DISTINCT CASE WHEN p.type = 'renouvellement' AND p.date_paiement_integral BETWEEN ? AND ? THEN p.id END) nb_renouvellements,
       COALESCE(SUM(CASE WHEN p.type = 'renouvellement' AND p.date_paiement_integral BETWEEN ? AND ? THEN l.prime_ttc END),0) prime_renouvellements
     ${LIGNES} ${joinBranche ? 'LEFT JOIN branches b ON b.id = pr.branche_id' : ''}
     WHERE p.statut = 'active' AND pr.statut = 'actif' ${c.sql}
     GROUP BY ${groupCol}, ${labelCol}
     HAVING COUNT(DISTINCT CASE WHEN (p.type = 'souscription' AND p.date_debut BETWEEN ? AND ?)
                                  OR (p.type = 'renouvellement' AND p.date_paiement_integral BETWEEN ? AND ?) THEN p.id END) > 0`,
    [r.debut, r.fin, r.debut, r.fin, r.debut, r.fin, r.debut, r.fin, ...c.args, r.debut, r.fin, r.debut, r.fin]);
  const total = x => x.prime_souscriptions + x.prime_renouvellements;
  return rows.sort((a, b) => total(b) - total(a));
}

async function tendance(r, f) {
  const c = cond(f, LCOLS);
  const rows = await all(
    `SELECT to_char(p.date_debut, 'YYYY-MM') AS "mois", COALESCE(SUM(l.prime_ttc),0) prime_ttc, COUNT(DISTINCT p.contrat_id) nb
     ${LIGNES} WHERE p.statut = 'active' AND p.type = 'souscription' AND p.date_debut BETWEEN ? AND ? ${c.sql}
     GROUP BY to_char(p.date_debut, 'YYYY-MM')`, [D.addMonths(r.debut, -12), r.fin, ...c.args]);
  const out = [];
  for (let m = D.monthOf(r.debut); m <= D.monthOf(r.fin); m = D.nextMonth(m)) {
    const prev = D.addMonths(`${m}-01`, -12).slice(0, 7);
    const cur = rows.find(x => x.mois === m), old = rows.find(x => x.mois === prev);
    out.push({ mois: m, prime_ttc: cur ? cur.prime_ttc : 0, nb: cur ? cur.nb : 0, prime_ttc_n1: old ? old.prime_ttc : 0, nb_n1: old ? old.nb : 0 });
  }
  return out;
}

// Filtres autorisés selon le rôle (un agent reste dans son périmètre)
async function readFilters(req) {
  const scope = await scopeIds(req.user);
  const { agent_id, equipe_id, branche_id, product_id, vue } = req.query;
  let agentIds = scope;
  if (equipe_id) {
    const juniors = await all("SELECT id FROM users WHERE parent_agent_id = ? AND role = 'agent'", [equipe_id]);
    agentIds = [equipe_id, ...juniors.map(j => j.id)];
  }
  if (agent_id) agentIds = [agent_id];
  if (!agent_id && !equipe_id && scope && vue !== 'equipe') agentIds = [req.user.id];
  if (scope) agentIds = (agentIds || scope).filter(id => scope.includes(id));
  return { agentIds, brancheId: branche_id || null, productId: product_id || null };
}

function readRange(req) {
  const y = new Date().getFullYear();
  const debut = req.query.date_debut || `${y}-01-01`;
  const fin = req.query.date_fin || `${y}-12-31`;
  if (!D.isDate(debut) || !D.isDate(fin) || fin < debut) throw new HttpError(400, 'Période invalide');
  return { debut, fin, type: req.query.periode_type || 'personnalise' };
}

router.get('/dashboard', authenticateToken, ah(async (req, res) => {
  const r = readRange(req);
  const f = await readFilters(req);
  const prev = previousRange(r), n1 = lastYearRange(r);
  const moisCourant = D.monthOf(D.today());
  const ac = cond(f, { agentCol: 'agent_id' });

  const [courant, precedente, nMoins1, obj, ech, parProduit, parBranche, trend, resteRow, moisRow] = await Promise.all([
    metrics(r, f), metrics(prev, f), metrics(n1, f), objectifs(r, f), echeances(f),
    repartition(r, f, 'pr.id', 'pr.nom', false),
    repartition(r, f, 'b.id', "COALESCE(b.nom, 'Sans branche')", true),
    tendance(r, f),
    get(`SELECT COALESCE(SUM(total - total_paye),0) v FROM factures WHERE 1=1 ${ac.sql}`, ac.args),
    get(`SELECT COALESCE(SUM(montant),0) v FROM commission_lignes WHERE mois = ? ${ac.sql}`, [moisCourant, ...ac.args]),
  ]);

  res.json({
    courant, precedente: precedente, n_moins_1: nMoins1,
    objectifs: obj, echeances: ech, par_produit: parProduit, par_branche: parBranche, tendance: trend,
    commissions_reste_a_payer: resteRow.v, commissions_mois_courant: moisRow.v, mois_courant: moisCourant,
  });
}));

module.exports = router;
