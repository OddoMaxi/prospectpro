// Normalisation : sans accents, minuscules, ponctuation réduite à des espaces
function normalize(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

// Similarité entre 0 et 1 sur des chaînes déjà normalisées.
// Combine la distance d'édition globale et la meilleure correspondance de mot,
// pour que « medcin » ≈ « médecin » et « ingenieur info » ≈ « ingénieur informaticien-ne ».
function similarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const global = 1 - levenshtein(a, b) / Math.max(a.length, b.length);
  let prefix = 0;
  if (b.startsWith(a) && a.length >= 3) prefix = 0.75 + 0.25 * (a.length / b.length);
  const wa = a.split(' '), wb = b.split(' ');
  let words = 0;
  for (const x of wa) {
    let best = 0;
    for (const y of wb) {
      const s = y.startsWith(x) && x.length >= 3 ? 0.9 : 1 - levenshtein(x, y) / Math.max(x.length, y.length);
      if (s > best) best = s;
    }
    words += best;
  }
  words = (words / wa.length) * Math.min(1, wa.length / wb.length + 0.5);
  return Math.max(global, prefix, words * 0.95);
}

module.exports = { normalize, levenshtein, similarity };
