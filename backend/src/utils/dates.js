// Utilitaires de dates sur des chaînes 'YYYY-MM-DD' (sans fuseau horaire)
const pad = n => String(n).padStart(2, '0');

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parse(s) {
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
  return { y, m, d };
}

function format(y, m, d) {
  return `${y}-${pad(m)}-${pad(d)}`;
}

function daysInMonth(y, m) {
  return new Date(y, m, 0).getDate();
}

// Ajoute n mois (n peut être négatif) en bornant le jour au dernier jour du mois
function addMonths(s, n) {
  const { y, m, d } = parse(s);
  const total = y * 12 + (m - 1) + Number(n);
  const ny = Math.floor(total / 12), nm = (total % 12) + 1;
  return format(ny, nm, Math.min(d, daysInMonth(ny, nm)));
}

function addDays(s, n) {
  const { y, m, d } = parse(s);
  const dt = new Date(Date.UTC(y, m - 1, d + Number(n)));
  return format(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

function diffDays(a, b) {
  const pa = parse(a), pb = parse(b);
  return Math.round((Date.UTC(pa.y, pa.m - 1, pa.d) - Date.UTC(pb.y, pb.m - 1, pb.d)) / 86400000);
}

function monthOf(s) {
  return String(s).slice(0, 7);
}

function nextMonth(mois) {
  return addMonths(`${mois}-01`, 1).slice(0, 7);
}

function isDate(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

// Nombre de mois couverts par un intervalle inclusif : exact pour des mois calendaires entiers, fractionnaire sinon
function monthsBetween(debut, fin) {
  const a = parse(debut), b = parse(fin);
  if (a.d === 1 && b.d === daysInMonth(b.y, b.m)) return (b.y * 12 + b.m) - (a.y * 12 + a.m) + 1;
  return (diffDays(fin, debut) + 1) / 30.4375;
}

module.exports = { today, addMonths, addDays, diffDays, monthOf, nextMonth, isDate, monthsBetween };
