// Recette automatisée de l'API (cahier des charges §9.2) sur une base VIDE.
// Usage : DATABASE_URL=... API_URL=http://localhost:3001/api node scripts/recette-api.js
// Le serveur doit tourner sur la même base. Ne jamais lancer sur la base de production.
require('dotenv').config();
const { Pool } = require('pg');

const API = process.env.API_URL || 'http://localhost:3001/api';
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

let ok = 0, ko = 0;
function check(label, cond, detail) {
  if (cond) { ok++; console.log(`  ✓ ${label}`); }
  else { ko++; console.log(`  ✗ ${label}${detail !== undefined ? ` → ${JSON.stringify(detail)}` : ''}`); }
}

async function call(token, method, path, body) {
  const r = await fetch(API + path, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await r.json(); } catch { /* vide */ }
  return { status: r.status, data };
}

async function login(username, password, newPassword) {
  const r = await call(null, 'POST', '/auth/login', { username, password });
  if (r.status !== 200) return r;
  if (r.data.user.must_change_password && newPassword) {
    const c = await call(r.data.token, 'POST', '/auth/change-password', { current_password: password, new_password: newPassword });
    return { status: 200, token: c.data.token, user: r.data.user };
  }
  return { status: 200, token: r.data.token, user: r.data.user };
}

const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
const addMonthsTo = (s, n) => { const [y, m, d] = s.split('-').map(Number); const t = new Date(y, m - 1 + n, d); return iso(t); };
const TODAY = iso(new Date());

(async () => {
  const n = await pool.query("SELECT COUNT(*) c FROM users WHERE role = 'agent'");
  if (Number(n.rows[0].c) > 0) {
    console.error('La base contient déjà des agents : la recette doit tourner sur une base vide.');
    process.exit(2);
  }
  const admin = (await login('admin', 'Admin@2024')).token;

  console.log('\n1. Branche, produit, prime commerciale et prime TTC');
  const br = await call(admin, 'POST', '/branches', { nom: 'Santé', taux_taxe: 10 });
  check('branche créée', br.status === 201, br.data);
  const prodBody = {
    nom: 'Santé Famille', branche_id: br.data.id, prime_pure: 100000, cout_police: 5000, accessoires: 2000,
    taux_commission: 10, taux_commission_sous_agent: 6, taux_renouvellement: 8, taux_renouvellement_junior: 5,
    performance_active: true, taux_performance: 4, taux_performance_junior: 2, delai_anticipation_mois: 1,
  };
  const pr = await call(admin, 'POST', '/products', prodBody);
  check('produit créé', pr.status === 201, pr.data);
  const prod = (await call(admin, 'GET', `/products/${pr.data.id}`)).data;
  check('prime commerciale = 100 000 + 5 000 + 2 000 = 107 000', prod.prime_commerciale === 107000, prod.prime_commerciale);
  check('prime TTC = 107 000 + 10 % = 117 700', prod.prime_ttc === 117700, prod.prime_ttc);
  const pr2 = await call(admin, 'POST', '/products', { ...prodBody, nom: 'Produit à suspendre', performance_active: false });
  check('part Junior > total refusée', (await call(admin, 'POST', '/products', { ...prodBody, nom: 'X', taux_commission_sous_agent: 12 })).status === 400);

  console.log('\n2. Hiérarchie : admin → Sénior → Junior');
  const s = await call(admin, 'POST', '/agents', {
    nom: 'DIALLO', prenom: 'Awa', telephone: '620000001',
    product_objectives: [{ product_id: pr.data.id, objectif_mensuel: 2, periode: 'annuel' }],
  });
  check('Sénior créé par l\'admin', s.status === 201, s.data);
  const senior = await login(s.data.credentials.username, s.data.credentials.temp_password, 'Senior@2026');
  const j = await call(senior.token, 'POST', '/agents/sous-agents', {
    nom: 'BAH', prenom: 'Ibrahima', telephone: '620000002',
    product_objectives: [{ product_id: pr.data.id, objectif_mensuel: 1, periode: 'mensuel' }],
  });
  check('Junior créé par le Sénior', j.status === 201, j.data);
  const junior = await login(j.data.credentials.username, j.data.credentials.temp_password, 'Junior@2026');
  check('un Junior ne peut pas créer de Junior', (await call(junior.token, 'POST', '/agents/sous-agents', { nom: 'X', prenom: 'Y', telephone: '1' })).status === 403);
  check('un Sénior ne peut pas créer de Sénior', (await call(senior.token, 'POST', '/agents', { nom: 'X', prenom: 'Y', telephone: '1' })).status === 403);
  const juniorDetail = (await call(admin, 'GET', `/agents/${j.data.agent.id}`)).data;
  check('Junior rattaché automatiquement à son Sénior', juniorDetail.parent_agent_id === s.data.agent.id);
  const upd = await call(senior.token, 'PUT', `/agents/sous-agents/${j.data.agent.id}`, {
    nom: 'BAH', prenom: 'Ibrahima', telephone: '620000002',
    product_objectives: [{ product_id: pr.data.id, objectif_mensuel: 3, periode: 'mensuel' }],
  });
  const hist = (await call(admin, 'GET', `/agents/${j.data.agent.id}`)).data.historique_objectifs;
  check('modification d\'objectifs historisée', upd.status === 200 && hist.length === 1 && hist[0].objectifs[0].objectif_mensuel === 1, hist);

  console.log('\n3. Prospect : correction de la profession, doublons');
  const p1 = await call(junior.token, 'POST', '/prospects', {
    type: 'physique', nom: 'CAMARA', prenom: 'Fanta', telephone: '+224 622 11 22 33', profession: 'medcin',
    date_naissance: '1990-05-12', prospect_products: [{ product_id: pr.data.id, nb_beneficiaires: 1 }],
  });
  check('prospect créé', p1.status === 201, p1.data);
  check('« medcin » corrigé en « Médecin »', p1.data.corrections?.profession === 'Médecin', p1.data.corrections);
  const p2 = await call(junior.token, 'POST', '/prospects', { type: 'physique', nom: 'SOW', prenom: 'Alpha', telephone: '622998877', profession: 'Boulanger patissier' });
  const refs = (await call(admin, 'GET', '/referentiels/profession')).data;
  check('valeur nouvelle ajoutée « à valider »', refs.some(r => r.valeur === 'Boulanger patissier' && r.statut === 'a_valider'));
  const dup = await call(senior.token, 'POST', '/prospects', { type: 'physique', nom: 'Autre', prenom: 'Nom', telephone: '622112233' });
  check('doublon détecté (même téléphone)', dup.status === 409 && dup.data.doublons?.length === 1, dup.data);
  const dup2 = await call(senior.token, 'POST', '/prospects', { type: 'physique', nom: 'camara', prenom: 'FANTA', telephone: '611000000', date_naissance: '1990-05-12' });
  check('doublon détecté (nom + date de naissance)', dup2.status === 409, dup2.data);
  check('l\'admin ne crée pas de prospect', (await call(admin, 'POST', '/prospects', { type: 'physique', nom: 'A', prenom: 'B', telephone: '600000009' })).status === 403);

  console.log('\n4. Conversion et souscription : commission répartie Junior / Sénior');
  const effet1 = addMonthsTo(TODAY, -10); // échéance dans ~2 mois → renouvellement anticipé possible
  const conv = await call(junior.token, 'POST', `/prospects/${p1.data.id}/convert`, {
    numero_contrat: 'C-001', date_effet: effet1, duree_mois: 12,
    produits: [{ product_id: pr.data.id, nb_beneficiaires: 1 }],
    paiement: { montant: 117700, date_paiement: effet1, mode: 'especes' },
  });
  check('prospect converti', conv.status === 200, conv.data);
  const c1 = (await call(junior.token, 'GET', `/contrats/${conv.data.contrat_id}`)).data;
  const jc = c1.commissions.filter(l => l.agent_id === j.data.agent.id);
  check('Junior : 6 % de 100 000 = 6 000', jc.length === 1 && jc[0].montant === 6000, jc);
  const sc = (await call(senior.token, 'GET', `/contrats/${conv.data.contrat_id}`)).data.commissions.filter(l => l.agent_id === s.data.agent.id);
  check('Sénior : 10 % − 6 % = 4 000', sc.length === 1 && sc[0].montant === 4000, sc);
  check('le Junior ne voit pas la part du Sénior', c1.commissions.every(l => l.agent_id === j.data.agent.id));

  console.log('\n5. Renouvellement plus d\'un mois avant l\'échéance');
  const ren = await call(junior.token, 'POST', `/contrats/${conv.data.contrat_id}/renouveler`, { paiement: { montant: 117700, date_paiement: TODAY, mode: 'mobile_money' } });
  check('renouvelé', ren.status === 200 && ren.data.integral, ren.data);
  const c1b = (await call(admin, 'GET', `/contrats/${conv.data.contrat_id}`)).data;
  const l2 = c1b.commissions.filter(l => l.periode_id === ren.data.periode_id);
  const val = (agent, nature) => l2.filter(l => l.agent_id === agent && l.nature === nature).reduce((x, l) => x + l.montant, 0);
  check('commission de renouvellement Junior 5 % = 5 000', val(j.data.agent.id, 'commission') === 5000, l2);
  check('commission de renouvellement Sénior 3 % = 3 000', val(s.data.agent.id, 'commission') === 3000);
  check('prime de performance Junior 2 % = 2 000', val(j.data.agent.id, 'performance') === 2000);
  check('prime de performance Sénior 2 % = 2 000', val(s.data.agent.id, 'performance') === 2000);
  check('statut du contrat : renouvelé', c1b.statut_calcule === 'renouvele', c1b.statut_calcule);

  console.log('\n6. Renouvellement moins d\'un mois avant l\'échéance');
  const p3 = await call(junior.token, 'POST', '/prospects', { type: 'morale', nom: 'SOGUI SARL', telephone: '655443322', secteur_activite: 'comerce' });
  check('secteur « comerce » corrigé', p3.data.corrections?.secteur_activite === 'COMMERCE', p3.data.corrections);
  const effet2 = addMonthsTo(addDays(20), -12); // échéance dans 20 jours
  const conv2 = await call(junior.token, 'POST', `/prospects/${p3.data.id}/convert`, {
    numero_contrat: 'C-002', date_effet: effet2, duree_mois: 12, produits: [{ product_id: pr.data.id, nb_beneficiaires: 2 }],
    paiement: { montant: 1000, date_paiement: effet2, mode: 'especes' },
  });
  check('contrat C-002 créé (paiement partiel)', conv2.status === 200, conv2.data);
  const c2 = (await call(admin, 'GET', `/contrats/${conv2.data.contrat_id}`)).data;
  check('pas de commission tant que la prime n\'est pas soldée', c2.commissions.length === 0);
  const per1 = c2.periodes[0];
  check('prime de 2 bénéficiaires : 200 000 + 7 000 + 10 % = 227 700', per1.prime_ttc === 227700, per1.prime_ttc);
  check('encaissement supérieur au reste refusé', (await call(junior.token, 'POST', `/contrats/periodes/${per1.id}/encaissements`, { montant: 300000, date_paiement: effet2, mode: 'especes' })).status === 400);
  await call(junior.token, 'POST', `/contrats/periodes/${per1.id}/encaissements`, { montant: 226700, date_paiement: effet2, mode: 'virement' });
  const ren2 = await call(junior.token, 'POST', `/contrats/${conv2.data.contrat_id}/renouveler`, { paiement: { montant: 227700, date_paiement: TODAY, mode: 'especes' } });
  const c2b = (await call(admin, 'GET', `/contrats/${conv2.data.contrat_id}`)).data;
  const l3 = c2b.commissions.filter(l => l.periode_id === ren2.data.periode_id);
  check('commission de renouvellement générée', l3.some(l => l.nature === 'commission'), l3);
  check('aucune prime de performance', !l3.some(l => l.nature === 'performance'), l3);

  console.log('\n7. Facture mensuelle : validation, deux tranches, dépassement refusé');
  const fj = (await call(junior.token, 'GET', '/factures')).data;
  const fSous = fj.find(f => f.mois === effet1.slice(0, 7));
  check('facture du mois de souscription générée en brouillon', fSous && fSous.statut === 'brouillon' && fSous.total === 6000, fj);
  check('paiement refusé sur un brouillon', (await call(admin, 'POST', `/factures/${fSous.id}/paiements`, { montant: 1000, date_paiement: TODAY, mode: 'especes' })).status === 400);
  await call(admin, 'POST', `/factures/${fSous.id}/valider`);
  check('dépassement refusé', (await call(admin, 'POST', `/factures/${fSous.id}/paiements`, { montant: 7000, date_paiement: TODAY, mode: 'especes' })).status === 400);
  const t1 = await call(admin, 'POST', `/factures/${fSous.id}/paiements`, { montant: 4000, date_paiement: TODAY, mode: 'mobile_money', reference: 'OM-1' });
  const st1 = (await call(junior.token, 'GET', `/factures/${fSous.id}`)).data;
  check('1re tranche : partiellement payée, reste 2 000', t1.status === 201 && st1.statut === 'partiel' && st1.reste === 2000, st1.statut);
  await call(admin, 'POST', `/factures/${fSous.id}/paiements`, { montant: 2000, date_paiement: TODAY, mode: 'virement' });
  const st2 = (await call(junior.token, 'GET', `/factures/${fSous.id}`)).data;
  check('2e tranche : payée', st2.statut === 'payee' && st2.reste === 0, st2.statut);
  check('tranche supplémentaire refusée', (await call(admin, 'POST', `/factures/${fSous.id}/paiements`, { montant: 1, date_paiement: TODAY, mode: 'especes' })).status === 400);
  const recu = await call(junior.token, 'GET', `/factures/paiements/${t1.data.id}`);
  check('reçu consultable par l\'agent', recu.status === 200 && recu.data.reste_apres === 2000, recu.data);
  const fMoisCourant = fj.find(f => f.mois === TODAY.slice(0, 7));
  // C-001 : 5 000 + 2 000 (performance) ; C-002 (2 bénéficiaires) : 200 000 × 5 % = 10 000
  check('facture du mois en cours : renouvellements + prime de performance = 17 000', fMoisCourant && fMoisCourant.total === 17000, fMoisCourant);

  console.log('\n8. Résiliation et rétrocession le mois suivant');
  const res = await call(admin, 'POST', `/contrats/${conv.data.contrat_id}/resilier`, { motif: 'Demande du client' });
  check('contrat résilié', res.status === 200, res.data);
  const moisSuivant = addMonthsTo(`${TODAY.slice(0, 7)}-01`, 1).slice(0, 7);
  const fNext = (await call(junior.token, 'GET', `/factures?mois=${moisSuivant}`)).data[0];
  const dNext = fNext && (await call(junior.token, 'GET', `/factures/${fNext.id}`)).data;
  check('lignes négatives sur la facture du mois suivant (−5 000 et −2 000)', dNext && dNext.lignes.filter(l => l.nature === 'retrocession').reduce((x, l) => x + l.montant, 0) === -7000, dNext && dNext.lignes);

  const val2 = await call(admin, 'POST', `/factures/${fNext.id}/valider`);
  const fNextB = (await call(junior.token, 'GET', `/factures/${fNext.id}`)).data;
  const fApres = (await call(junior.token, 'GET', `/factures?mois=${addMonthsTo(`${moisSuivant}-01`, 1).slice(0, 7)}`)).data[0];
  check('facture négative validée : soldée à 0, déficit reporté sur le mois d\'après',
    val2.status === 200 && fNextB.total === 0 && fNextB.statut === 'payee' && fApres?.total === -7000,
    { total: fNextB.total, statut: fNextB.statut, suivant: fApres?.total });

  console.log('\n9. Inactivité : transfert temporaire puis restitution');
  const s2 = await call(admin, 'POST', '/agents', { nom: 'KOUROUMA', prenom: 'Sekou', telephone: '620000003' });
  const senior2 = await login(s2.data.credentials.username, s2.data.credentials.temp_password, 'Senior2@2026');
  const p4 = await call(senior2.token, 'POST', '/prospects', { type: 'physique', nom: 'TOURE', prenom: 'Mariama', telephone: '664000111' });
  await call(admin, 'PUT', '/parametres', { interim_defaut_id: s.data.agent.id });
  await pool.query("UPDATE users SET last_activity_at = NOW() - INTERVAL '40 days' WHERE id = $1", [s2.data.agent.id]);
  await require('../src/jobs').verifierInactivite();
  const s2d = (await call(admin, 'GET', `/agents/${s2.data.agent.id}`)).data;
  check('agent passé « inactif »', s2d.statut === 'inactif', s2d.statut);
  const pf = (await call(admin, 'GET', `/agents/${s.data.agent.id}/portefeuille`)).data;
  check('prospect transféré temporairement à l\'intérimaire', pf.prospects.some(p => p.id === p4.data.id));
  const back = await login(s2.data.credentials.username, 'Senior2@2026');
  const pf2 = (await call(admin, 'GET', `/agents/${s2.data.agent.id}/portefeuille`)).data;
  check('au retour : statut actif et prospect restitué', back.status === 200 && pf2.prospects.some(p => p.id === p4.data.id));
  const aff = (await call(admin, 'GET', `/affectations?agent_id=${s2.data.agent.id}`)).data;
  check('historique : un transfert temporaire et une restitution', aff.some(a => a.type === 'temporaire' && a.date_fin) && aff.some(a => a.motif === 'restitution'), aff.map(a => [a.type, a.motif, !!a.date_fin]));

  console.log('\n10. Suppression d\'un agent bloquée tant que le portefeuille n\'est pas transféré');
  const del1 = await call(admin, 'DELETE', `/agents/${s2.data.agent.id}`);
  check('suppression refusée', del1.status === 409, del1.data);
  const tr = await call(admin, 'POST', `/agents/${s2.data.agent.id}/transferer`, { destinataire_id: s.data.agent.id, type: 'definitif', motif: 'suppression' });
  check('portefeuille transféré', tr.status === 200 && tr.data.prospects === 1, tr.data);
  const del2 = await call(admin, 'DELETE', `/agents/${s2.data.agent.id}`);
  check('suppression acceptée', del2.status === 200, del2.data);
  const sel = (await call(admin, 'GET', '/agents/selectable')).data;
  check('agent supprimé absent des listes de sélection', !sel.some(a => a.id === s2.data.agent.id));
  check('agent supprimé ne peut plus se connecter', (await login(s2.data.credentials.username, 'Senior2@2026')).status === 401);

  console.log('\n11. Suspension d\'un agent et d\'un produit');
  const before = (await call(admin, 'GET', '/stats/dashboard')).data;
  await call(admin, 'PATCH', `/agents/${j.data.agent.id}/statut`, { action: 'suspendre' });
  check('Junior suspendu : requêtes bloquées immédiatement', (await call(junior.token, 'GET', '/prospects')).status === 401);
  check('Junior suspendu : connexion refusée', (await login(j.data.credentials.username, 'Junior@2026')).status === 403);
  const after = (await call(admin, 'GET', '/stats/dashboard')).data;
  check('Junior retiré des classements et objectifs', before.objectifs.agents.some(a => a.id === j.data.agent.id) && !after.objectifs.agents.some(a => a.id === j.data.agent.id));
  check('production historique inchangée', before.courant.production.prime_ttc === after.courant.production.prime_ttc);
  await call(admin, 'PATCH', `/products/${pr2.data.id}/statut`, { action: 'suspendre' });
  check('produit suspendu absent des souscriptions', !(await call(senior.token, 'GET', '/products/active')).data.some(p => p.id === pr2.data.id));
  check('produit avec contrats actifs non supprimable', (await call(admin, 'DELETE', `/products/${pr.data.id}`)).status === 409);
  await call(admin, 'PATCH', `/agents/${j.data.agent.id}/statut`, { action: 'reactiver' });

  console.log('\n12. Tableau de bord, comparaison et droits d\'accès');
  const y = TODAY.slice(0, 4);
  const dash = (await call(admin, 'GET', `/stats/dashboard?date_debut=${y}-01-01&date_fin=${y}-12-31&periode_type=annee`)).data;
  check('comparaison N-1 disponible', dash.n_moins_1 && dash.n_moins_1.periode.debut === `${y - 1}-01-01`, dash.n_moins_1?.periode);
  check('renouvellements anticipés comptés', dash.courant.renouvellements.anticipes >= 1, dash.courant.renouvellements);
  const junior2 = await login(j.data.credentials.username, 'Junior@2026');
  check('le Junior n\'accède pas à la liste des agents', (await call(junior2.token, 'GET', '/agents')).status === 403);
  const sp = (await call(senior.token, 'GET', '/prospects')).data;
  check('le Sénior voit les prospects de son Junior', sp.some(p => p.agent_id === j.data.agent.id));
  const jp = (await call(junior2.token, 'GET', '/prospects')).data;
  check('le Junior ne voit que son portefeuille', jp.every(p => p.agent_id === j.data.agent.id));
  check('le Junior ne voit pas les factures du Sénior', (await call(junior2.token, 'GET', '/factures')).data.every(f => f.agent_id === j.data.agent.id));
  const audit = (await call(admin, 'GET', '/audit')).data;
  check('journal d\'audit alimenté', ['creation_senior', 'suspension_agent', 'resiliation_contrat', 'paiement_commission'].every(a => audit.some(x => x.action === a)));

  console.log(`\nRésultat : ${ok} vérification(s) réussie(s), ${ko} en échec`);
  await pool.end();
  process.exit(ko ? 1 : 0);
})().catch(async e => { console.error(e); await pool.end(); process.exit(1); });
