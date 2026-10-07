// Tâches automatiques : inactivité des agents et alertes d'échéance
const { get, all, tx } = require('./database');
const { getInt, getSetting } = require('./utils/settings');
const { notify } = require('./utils/notify');
const { audit } = require('./utils/audit');
const { personName } = require('./utils/names');
const { transfererPortefeuille } = require('./utils/affectations');
const D = require('./utils/dates');

const SYSTEM = { user: null };
const fr = d => String(d).slice(0, 10).split('-').reverse().join('/');

async function interimDe(agent) {
  const candidats = [agent.interim_agent_id, agent.parent_agent_id, await getSetting('interim_defaut_id')].filter(Boolean);
  for (const id of candidats) {
    if (id === agent.id) continue;
    const a = await get("SELECT * FROM users WHERE id = ? AND role = 'agent' AND statut = 'actif'", [id]);
    if (a) return a;
  }
  return null;
}

async function verifierInactivite() {
  const jours = await getInt('inactivite_jours');
  if (!jours) return;
  const alerte = Math.min(await getInt('inactivite_alerte_jours'), jours);

  // Alerte à l'administrateur quelques jours avant le seuil
  const proches = await all(
    `SELECT *, last_activity_at::date AS derniere FROM users
     WHERE role = 'agent' AND statut = 'actif'
       AND last_activity_at < NOW() - make_interval(days => ?::int)
       AND last_activity_at >= NOW() - make_interval(days => ?::int)`, [jours - alerte, jours]);
  for (const a of proches) {
    const interim = await interimDe(a);
    await notify({
      type: 'inactivite_alerte',
      titre: `${personName(a)} : inactif depuis le ${fr(a.derniere)}`,
      message: `Transfert temporaire du portefeuille prévu le ${fr(D.addDays(a.derniere, jours))}`
        + (interim ? ` vers ${personName(interim)}.` : '. Aucun intérimaire désigné : choisissez-en un dans la fiche de l\'agent.'),
      lien: `/admin/agents/${a.id}/edit`,
      dedupKey: `inactivite-alerte-${a.id}-${a.derniere}`,
    });
  }

  // Au seuil : statut « inactif » et transfert temporaire vers l'intérimaire
  const inactifs = await all(
    `SELECT *, last_activity_at::date AS derniere FROM users
     WHERE role = 'agent' AND statut = 'actif' AND last_activity_at < NOW() - make_interval(days => ?::int)`, [jours]);
  for (const a of inactifs) {
    const interim = await interimDe(a);
    const r = await tx(async q => {
      await q.run("UPDATE users SET statut = 'inactif', statut_depuis = NOW() WHERE id = ?", [a.id]);
      const out = interim
        ? await transfererPortefeuille(q, a.id, interim.id, { type: 'temporaire', motif: 'inactivite', auteurId: null })
        : null;
      await audit(SYSTEM, 'inactivite_detectee', {
        type: 'agent', id: a.id, label: personName(a),
        avant: { statut: 'actif', derniere_activite: a.derniere },
        apres: { statut: 'inactif', interimaire: interim ? personName(interim) : null, ...(out || {}) },
      }, q);
      return out;
    });
    await notify({
      type: 'inactivite',
      titre: `${personName(a)} est passé inactif`,
      message: interim
        ? `${r.clients} client(s) et ${r.prospects} prospect(s) transférés temporairement à ${personName(interim)}. Ils lui seront restitués à son retour.`
        : 'Aucun intérimaire disponible : transférez son portefeuille manuellement (type « temporaire »).',
      lien: '/admin/agents',
      dedupKey: `inactivite-${a.id}-${a.derniere}`,
    });
    if (interim && (r.clients || r.prospects)) {
      await notify({
        userId: interim.id, type: 'interim',
        titre: `Intérim : portefeuille de ${personName(a)}`,
        message: `${r.clients} client(s) et ${r.prospects} prospect(s) vous sont confiés temporairement.`,
        lien: '/agent/clients',
        dedupKey: `interim-${interim.id}-${a.id}-${a.derniere}`,
      });
    }
  }
}

async function verifierEcheances() {
  const seuils = String(await getSetting('alertes_echeance_jours'))
    .split(',').map(s => parseInt(s, 10)).filter(n => n > 0).sort((a, b) => a - b);
  if (!seuils.length) return;
  const max = seuils[seuils.length - 1];
  const contrats = await all(
    `SELECT * FROM v_contrats WHERE statut = 'actif' AND client_statut = 'actif'
       AND jours_restants BETWEEN 0 AND ?`, [max]);
  for (const c of contrats) {
    const seuil = seuils.find(s => s >= c.jours_restants);
    const dernier = seuil === seuils[0];
    await notify({
      userId: c.agent_id, type: 'echeance',
      titre: `Échéance J-${seuil} : contrat ${c.numero_contrat}`,
      message: `${personName(c, 'client_')} — échéance le ${fr(c.date_echeance)}.`
        + (dernier ? ' Dernier délai pour un renouvellement anticipé (prime de performance).' : ''),
      lien: `/agent/contrats/${c.id}`,
      dedupKey: `echeance-${c.periode_id}-${seuil}`,
    });
  }
}

async function runJobs() {
  for (const job of [verifierInactivite, verifierEcheances]) {
    try { await job(); } catch (e) { console.error(`Tâche ${job.name} en échec :`, e); }
  }
}

function startJobs() {
  runJobs();
  setInterval(runJobs, 60 * 60 * 1000);
}

module.exports = { startJobs, runJobs, verifierInactivite, verifierEcheances };
