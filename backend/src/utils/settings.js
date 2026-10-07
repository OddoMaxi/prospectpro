const { all, get, DEFAULT_PARAMETRES } = require('../database');

const DEFAULTS = Object.fromEntries(DEFAULT_PARAMETRES.map(([k, v]) => [k, v]));

async function getSettings() {
  const rows = await all('SELECT cle, valeur FROM parametres');
  const out = { ...DEFAULTS };
  for (const r of rows) out[r.cle] = r.valeur;
  return out;
}

async function getSetting(cle) {
  const r = await get('SELECT valeur FROM parametres WHERE cle = ?', [cle]);
  return r ? r.valeur : DEFAULTS[cle];
}

async function getInt(cle) {
  const v = parseInt(await getSetting(cle), 10);
  return Number.isFinite(v) ? v : parseInt(DEFAULTS[cle], 10);
}

async function getFloat(cle) {
  const v = parseFloat(await getSetting(cle));
  return Number.isFinite(v) ? v : parseFloat(DEFAULTS[cle]);
}

module.exports = { getSettings, getSetting, getInt, getFloat };
