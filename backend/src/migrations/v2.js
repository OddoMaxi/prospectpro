// Migration des données de la version 1 vers le modèle « CRM Assurance » (cahier des charges d'octobre 2026).
// Exécutée une seule fois au démarrage, dans une transaction ; sans effet sur une base neuve.
//  - agents désactivés → statut « suspendu » ;
//  - produits : branche « Générale », prime pure = ancienne prime annuelle, taux de renouvellement = taux de souscription ;
//  - prospects convertis → statut « converti » ;
//  - historique des affectations initialisé (création) pour les prospects et clients existants ;
//  - contrat porté par la fiche client → contrat + période de souscription soldée (montants historiques conservés) ;
//  - anciennes commissions et leurs paiements → lignes de commission, factures mensuelles et tranches.
const { v4: uuidv4 } = require('uuid');
const D = require('../utils/dates');
const { recalcFacture } = require('../utils/commissions');

const NOM = 'v2_crm_assurance';

const isoDate = v => {
  if (!v) return null;
  if (v instanceof Date) return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
  const s = String(v).slice(0, 10);
  return D.isDate(s) ? s : null;
};

// Certaines colonnes/tables n'existent que sur les bases passées par les évolutions de juillet 2026
async function hasColumn(q, table, column) {
  return !!(await q.get('SELECT 1 FROM information_schema.columns WHERE table_name = ? AND column_name = ?', [table, column]));
}
async function hasTable(q, table) {
  return !!(await q.get('SELECT to_regclass(?) AS t', [`public.${table}`])).t;
}

async function migrer(q) {
  const log = [];
  const { normalize } = require('../utils/text');

  // Agents
  const susp = await q.run("UPDATE users SET statut = 'suspendu', statut_depuis = NOW() WHERE role = 'agent' AND is_active = 0 AND statut = 'actif'");
  if (susp.rowsAffected) log.push(`${susp.rowsAffected} agent(s) désactivé(s) → suspendu(s)`);

  // Produits
  const sansBranche = await q.all('SELECT id FROM products WHERE branche_id IS NULL');
  if (sansBranche.length) {
    const brancheId = uuidv4();
    await q.run("INSERT INTO branches (id, nom, description, taux_taxe) VALUES (?, 'Générale', 'Branche créée lors de la migration : à renommer ou à remplacer', 0)", [brancheId]);
    await q.run(
      `UPDATE products SET branche_id = ?,
         prime_pure = CASE WHEN COALESCE(prime_pure, 0) = 0 THEN prime_annuelle ELSE prime_pure END,
         taux_renouvellement = CASE WHEN COALESCE(taux_renouvellement, 0) = 0 THEN taux_commission ELSE taux_renouvellement END,
         taux_renouvellement_junior = CASE WHEN COALESCE(taux_renouvellement_junior, 0) = 0 THEN COALESCE(taux_commission_sous_agent, 0) ELSE taux_renouvellement_junior END,
         statut = CASE WHEN is_active = 1 THEN 'actif' ELSE 'suspendu' END
       WHERE branche_id IS NULL`, [brancheId]);
    log.push(`${sansBranche.length} produit(s) rattaché(s) à la branche « Générale »`);
  }
  if (await hasColumn(q, 'products', 'montant_accessoire')) {
    await q.run('UPDATE products SET accessoires = montant_accessoire WHERE COALESCE(accessoires, 0) = 0 AND COALESCE(montant_accessoire, 0) > 0');
  }

  // Professions et secteurs : listes saisies par les agents (juillet 2026) et valeurs utilisées sur les fiches
  const sources = [
    ['profession', (await hasTable(q, 'professions')) ? 'SELECT nom AS v FROM professions' : null, 'profession'],
    ['secteur', (await hasTable(q, 'secteurs_activite')) ? 'SELECT nom AS v FROM secteurs_activite' : null, 'secteur_activite'],
  ];
  for (const [type, tableSql, col] of sources) {
    const valeurs = [
      ...(tableSql ? await q.all(tableSql) : []),
      ...await q.all(`SELECT DISTINCT ${col} AS v FROM prospects WHERE ${col} IS NOT NULL AND ${col} <> ''
                      UNION SELECT DISTINCT ${col} FROM clients WHERE ${col} IS NOT NULL AND ${col} <> ''`),
    ];
    let n = 0;
    for (const { v } of valeurs) {
      const r = await q.run(
        `INSERT INTO referentiels (id, type, valeur, valeur_norm, statut) VALUES (?,?,?,?,'a_valider')
         ON CONFLICT (type, valeur_norm) DO NOTHING`, [uuidv4(), type, String(v).trim(), normalize(v)]);
      n += r.rowsAffected;
    }
    if (n) log.push(`${n} valeur(s) de ${type} ajoutée(s) au référentiel « à valider »`);
  }

  // Prospects
  const conv = await q.run("UPDATE prospects SET statut = 'converti' WHERE statut = 'client'");
  if (conv.rowsAffected) log.push(`${conv.rowsAffected} prospect(s) au statut client → converti`);
  await q.run('UPDATE prospects SET created_by = agent_id WHERE created_by IS NULL');

  // Affectations initiales
  for (const [type, table, dateCol] of [['prospect', 'prospects', 'created_at'], ['client', 'clients', 'converted_at']]) {
    const rows = await q.all(
      `SELECT t.id, t.agent_id, t.${dateCol} AS d FROM ${table} t
       WHERE NOT EXISTS (SELECT 1 FROM affectations a WHERE a.entity_type = ? AND a.entity_id = t.id)`, [type]);
    for (const r of rows) {
      await q.run(
        `INSERT INTO affectations (id, entity_type, entity_id, agent_destinataire_id, date_debut, type, motif)
         VALUES (?,?,?,?,COALESCE(?, NOW()),'definitif','creation')`, [uuidv4(), type, r.id, r.agent_id, r.d]);
    }
    if (rows.length) log.push(`${rows.length} affectation(s) initiale(s) (${table})`);
  }

  // Contrats portés par les fiches clients
  const clients = await q.all(
    `SELECT * FROM clients c WHERE c.numero_contrat IS NOT NULL AND c.numero_contrat <> ''
       AND NOT EXISTS (SELECT 1 FROM contrats k WHERE k.client_id = c.id)`);
  const periodeParClient = {};
  let nbContrats = 0;
  const avecFrais = await hasColumn(q, 'client_products', 'cout_police');
  const avecRenouv = await hasColumn(q, 'clients', 'statut_renouvellement');
  const aRegulariser = [];
  for (const c of clients) {
    const effet = isoDate(c.date_effet) || isoDate(c.converted_at) || D.today();
    const fin = isoDate(c.date_fin);
    let duree = Number(c.duree_contrat) || 0;
    if (!duree && fin) duree = Math.max(1, Math.round(D.diffDays(fin, effet) / 30.4375));
    if (!duree) duree = 12;
    const lignes = await q.all(
      `SELECT cp.*, p.nom AS nom_actuel FROM client_products cp JOIN products p ON p.id = cp.product_id
       WHERE cp.client_id = ?`, [c.id]);
    if (!lignes.length) { log.push(`Client ${c.numero} : contrat ${c.numero_contrat} sans produit existant, non repris`); continue; }

    let numero = c.numero_contrat;
    for (let i = 2; await q.get('SELECT id FROM contrats WHERE numero_contrat = ?', [numero]); i++) numero = `${c.numero_contrat}-${i}`;
    const contratId = uuidv4(), periodeId = uuidv4();
    await q.run(
      'INSERT INTO contrats (id, numero_contrat, client_id, duree_mois, date_effet, created_at) VALUES (?,?,?,?,?,COALESCE(?, NOW()))',
      [contratId, numero, c.id, duree, effet, c.converted_at]);
    // Montants historiques : la prime payée sert de prime pure (base des anciennes commissions),
    // le coût de police et les accessoires saisis s'y ajoutent ; pas de taxe dans l'ancienne version.
    let total = 0, totalCommerciale = 0;
    for (const l of lignes) {
      const prime = Math.round(Number(l.prime_payee) || 0);
      const police = avecFrais ? Math.round(Number(l.cout_police) || 0) : 0;
      const acc = avecFrais ? Math.round(Number(l.accessoire) || 0) : 0;
      total += prime;
      totalCommerciale += prime + police + acc;
      await q.run('INSERT INTO contrat_produits (id, contrat_id, product_id, nb_beneficiaires) VALUES (?,?,?,?)',
        [uuidv4(), contratId, l.product_id, Math.max(1, Number(l.nb_beneficiaires) || 1)]);
      await q.run(
        `INSERT INTO periode_lignes (id, periode_id, product_id, product_nom, nb_beneficiaires, prime_pure, cout_police,
           accessoires, prime_commerciale, prime_ttc)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [uuidv4(), periodeId, l.product_id, l.product_nom || l.nom_actuel, Math.max(1, Number(l.nb_beneficiaires) || 1),
         prime, police, acc, prime + police + acc, prime + police + acc]);
    }
    await q.run(
      `INSERT INTO contrat_periodes (id, contrat_id, numero, type, date_debut, date_echeance, prime_pure, prime_commerciale,
         prime_ttc, montant_paye, date_paiement_integral, agent_id)
       VALUES (?,?,1,'souscription',?,?,?,?,?,?,?,?)`,
      [periodeId, contratId, effet, D.addMonths(effet, duree), total, totalCommerciale, totalCommerciale, totalCommerciale, effet, c.agent_id]);
    if (totalCommerciale > 0) {
      await q.run(
        `INSERT INTO encaissements (id, periode_id, date_paiement, montant, mode, reference) VALUES (?,?,?,?,'reprise','Reprise de la version précédente')`,
        [uuidv4(), periodeId, effet, totalCommerciale]);
    }
    // Le statut de renouvellement manuel n'a ni date ni montant : à régulariser avec « Renouveler »
    if (avecRenouv && c.statut_renouvellement === 'renouvele') aRegulariser.push(numero);
    periodeParClient[c.id] = { contratId, periodeId, numero, total };
    nbContrats++;
  }
  if (nbContrats) log.push(`${nbContrats} contrat(s) repris`);
  if (aRegulariser.length) {
    log.push(`À régulariser (marqués « renouvelés » dans l'ancienne version, sans période ni paiement) : ${aRegulariser.join(', ')}`);
  }

  // Anciennes commissions → lignes, factures mensuelles et tranches
  const ancienne = await q.get("SELECT to_regclass('public.commissions') AS t");
  if (ancienne.t) {
    const comms = await q.all(
      `SELECT cm.*, u.parent_agent_id FROM commissions cm JOIN users u ON u.id = cm.agent_id
       WHERE NOT EXISTS (SELECT 1 FROM commission_lignes l WHERE l.id = cm.id)`);
    const moisCourant = D.monthOf(D.today());
    const factures = {};
    const facture = async (agentId, mois) => {
      const key = `${agentId}|${mois}`;
      if (factures[key]) return factures[key];
      let f = await q.get('SELECT id FROM factures WHERE agent_id = ? AND mois = ?', [agentId, mois]);
      if (!f) {
        const n = await q.get('SELECT COUNT(*) c FROM factures WHERE mois = ?', [mois]);
        f = { id: uuidv4() };
        await q.run(
          `INSERT INTO factures (id, numero, agent_id, mois, statut, validee_le) VALUES (?,?,?,?,?,?)`,
          [f.id, `FC-${mois.replace('-', '')}-${String(Number(n.c) + 1).padStart(4, '0')}`, agentId, mois,
           mois < moisCourant ? 'validee' : 'brouillon', mois < moisCourant ? new Date() : null]);
      }
      factures[key] = f.id;
      return f.id;
    };
    let nbPaiements = 0;
    for (const cm of comms) {
      const date = isoDate(cm.created_at) || D.today();
      const mois = D.monthOf(date);
      const factureId = await facture(cm.agent_id, mois);
      const p = periodeParClient[cm.client_id] || {};
      const base = p.total || 0;
      const montant = Math.round(Number(cm.montant_du) || 0);
      const role = cm.type === 'parent' ? 'senior' : cm.parent_agent_id ? 'junior' : 'direct';
      await q.run(
        `INSERT INTO commission_lignes (id, agent_id, facture_id, mois, contrat_id, periode_id, client_id, operation, nature,
           role, source_agent_id, base, taux, montant, date_acquisition, libelle, created_at)
         VALUES (?,?,?,?,?,?,?,'souscription','commission',?,?,?,?,?,?,?,?)`,
        [cm.id, cm.agent_id, factureId, mois, p.contratId || null, p.periodeId || null, cm.client_id, role,
         cm.source_agent_id || cm.agent_id, base, base ? Math.round(montant / base * 10000) / 100 : 0, montant, date,
         `Reprise – Souscription ${p.numero || ''}`.trim(), cm.created_at]);
      const pays = await q.all('SELECT * FROM commission_payments WHERE commission_id = ? ORDER BY date_paiement, created_at', [cm.id]);
      for (const pay of pays) {
        // Une tranche payée sur un mois en cours valide la facture
        await q.run("UPDATE factures SET statut = 'validee', validee_le = COALESCE(validee_le, NOW()) WHERE id = ? AND statut = 'brouillon'", [factureId]);
        const n = await q.get('SELECT COUNT(*) c FROM facture_paiements');
        await q.run(
          `INSERT INTO facture_paiements (id, facture_id, numero_recu, date_paiement, montant, mode, reference, created_at)
           VALUES (?,?,?,?,?,'reprise',?,?)`,
          [pay.id, factureId, `RC-REPRISE-${String(Number(n.c) + 1).padStart(5, '0')}`, isoDate(pay.date_paiement) || date,
           Math.round(Number(pay.montant) || 0), [pay.reference, pay.libelle].filter(Boolean).join(' – ') || null, pay.created_at]);
        nbPaiements++;
      }
    }
    for (const id of new Set(Object.values(factures))) await recalcFacture(q, id);
    if (comms.length) log.push(`${comms.length} commission(s) et ${nbPaiements} paiement(s) repris dans ${new Set(Object.values(factures)).size} facture(s)`);
  }
  return log;
}

async function migrationV2(tx) {
  return tx(async q => {
    await q.run('CREATE TABLE IF NOT EXISTS schema_migrations (nom TEXT PRIMARY KEY, appliquee_le TIMESTAMP DEFAULT NOW(), journal JSONB)');
    if (await q.get('SELECT nom FROM schema_migrations WHERE nom = ?', [NOM])) return null;
    const log = await migrer(q);
    await q.run('INSERT INTO schema_migrations (nom, journal) VALUES (?, ?)', [NOM, JSON.stringify(log)]);
    if (log.length) {
      await q.run(
        `INSERT INTO audit_log (id, user_label, action, entity_type, apres) VALUES (?, 'Système', 'migration_donnees', 'systeme', ?)`,
        [uuidv4(), JSON.stringify({ migration: NOM, journal: log })]);
    }
    return log;
  });
}

module.exports = { migrationV2 };
