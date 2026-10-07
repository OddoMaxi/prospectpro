// Nom d'affichage d'un agent ou d'un client
function personName(p, prefix = '') {
  if (!p) return '';
  const type = p[`${prefix}type_agent`] || p[`${prefix}type`];
  const nom = p[`${prefix}nom`] || '';
  const prenom = p[`${prefix}prenom`] || '';
  const rs = p[`${prefix}raison_sociale`];
  if (type === 'morale') return rs || nom;
  return `${prenom} ${nom}`.trim();
}

module.exports = { personName };
