const { v4: uuidv4 } = require('uuid');
const { normalize, similarity } = require('./text');
const { getFloat } = require('./settings');

const TYPES = ['profession', 'secteur'];

async function suggestions(q, type, query, limit = 8) {
  const rows = await q.all('SELECT valeur, valeur_norm, statut FROM referentiels WHERE type = ?', [type]);
  const n = normalize(query);
  if (!n) return rows.filter(r => r.statut === 'valide').slice(0, limit).map(r => ({ valeur: r.valeur, statut: r.statut, score: 1 }));
  return rows
    .map(r => ({ valeur: r.valeur, statut: r.statut, score: similarity(n, r.valeur_norm) }))
    .filter(r => r.score >= 0.45)
    .sort((a, b) => (b.score - a.score) || (a.statut === 'valide' ? -1 : 1))
    .slice(0, limit);
}

// Rattache une saisie libre au référentiel :
//   - valeur existante (sans tenir compte des accents/majuscules) → valeur normalisée ;
//   - très proche d'une seule valeur validée → corrigée automatiquement ;
//   - sinon nouvelle valeur ajoutée « à valider » (sauf en simulation).
async function resoudre(q, type, saisie, userId, { simulation = false } = {}) {
  const brut = String(saisie || '').trim().replace(/\s+/g, ' ');
  if (!brut) return { valeur: null };
  const norm = normalize(brut);
  const exact = await q.get('SELECT valeur, statut FROM referentiels WHERE type = ? AND valeur_norm = ?', [type, norm]);
  if (exact) return { valeur: exact.valeur, corrige: exact.valeur !== brut, statut: exact.statut };

  const seuil = await getFloat('similarite_correction');
  const valides = await q.all("SELECT valeur, valeur_norm FROM referentiels WHERE type = ? AND statut = 'valide'", [type]);
  const scores = valides.map(v => ({ valeur: v.valeur, score: similarity(norm, v.valeur_norm) })).sort((a, b) => b.score - a.score);
  const [best, second] = scores;
  if (best && best.score >= seuil && (!second || best.score - second.score >= 0.03)) {
    return { valeur: best.valeur, corrige: true, statut: 'valide' };
  }

  if (!simulation) {
    await q.run(
      `INSERT INTO referentiels (id, type, valeur, valeur_norm, statut, created_by) VALUES (?,?,?,?,'a_valider',?)
       ON CONFLICT (type, valeur_norm) DO NOTHING`, [uuidv4(), type, brut, norm, userId]);
  }
  return { valeur: brut, nouveau: true, statut: 'a_valider' };
}

module.exports = { TYPES, suggestions, resoudre };
