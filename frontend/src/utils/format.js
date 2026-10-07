// Formats d'affichage communs à tous les écrans, factures, reçus, PDF et exports.
// Montants : séparateur de milliers = espace insécable, suivi de la devise (ex. 1 250 000 GNF).
export const NBSP = '\u00A0'
export const DEVISE = 'GNF'

export function fmtNum(n) {
  const v = Math.round(Number(n) || 0)
  const s = String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP)
  return v < 0 ? `-${s}` : s
}

export const fmtMoney = n => `${fmtNum(n)}${NBSP}${DEVISE}`

export const fmtPct = (n, digits = 1) =>
  n === null || n === undefined || Number.isNaN(Number(n)) ? '—' : `${Number(n).toFixed(digits).replace('.', ',')}${NBSP}%`

export const fmtRate = n => `${String(Number(n) || 0).replace('.', ',')}${NBSP}%`

export function fmtDate(d) {
  if (!d) return '—'
  const s = String(d)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s.split('-').reverse().join('/')
  const dt = new Date(s)
  return Number.isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString('fr-FR')
}

export function fmtDateTime(d) {
  if (!d) return '—'
  const dt = new Date(d)
  return Number.isNaN(dt.getTime()) ? '—' : `${dt.toLocaleDateString('fr-FR')} ${dt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
}

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
export const fmtMois = m => {
  if (!m) return '—'
  const [y, mm] = String(m).split('-')
  return `${MOIS[Number(mm) - 1]} ${y}`
}
export const fmtMoisCourt = m => {
  const [y, mm] = String(m).split('-')
  return `${MOIS[Number(mm) - 1].slice(0, 4)}. ${y.slice(2)}`
}

export const fmtTel = t => (t ? String(t).replace(/\s+/g, '').replace(/(\d{3})(?=\d)/g, `$1${NBSP}`) : '—')

// Nom d'une personne (agent ou client) ; prefix permet de lire « agent_nom », « client_nom », etc.
export function personName(p, prefix = '') {
  if (!p) return '—'
  const type = p[`${prefix}type_agent`] || p[`${prefix}type`]
  const nom = p[`${prefix}nom`] || ''
  const prenom = p[`${prefix}prenom`] || ''
  if (type === 'morale') return p[`${prefix}raison_sociale`] || nom || '—'
  return `${prenom} ${nom}`.trim() || '—'
}

// Variation en % entre deux valeurs (null si la référence est nulle)
export const variation = (cur, ref) => (Number(ref) ? ((Number(cur) - Number(ref)) / Math.abs(Number(ref))) * 100 : null)

export const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const MODES_PAIEMENT = { especes: 'Espèces', virement: 'Virement', mobile_money: 'Mobile money', cheque: 'Chèque', reprise: 'Reprise historique' }

export const STATUTS_AGENT = {
  actif: { label: 'Actif', cls: 'bg-emerald-100 text-emerald-700' },
  inactif: { label: 'Inactif', cls: 'bg-amber-100 text-amber-700' },
  suspendu: { label: 'Suspendu', cls: 'bg-red-100 text-red-700' },
  supprime: { label: 'Supprimé', cls: 'bg-gray-200 text-gray-600' },
}

export const STATUTS_PRODUIT = {
  actif: { label: 'Actif', cls: 'bg-emerald-100 text-emerald-700' },
  suspendu: { label: 'Suspendu', cls: 'bg-amber-100 text-amber-700' },
}

export const STATUTS_CONTRAT = {
  en_cours: { label: 'En cours', cls: 'bg-blue-100 text-blue-700' },
  a_echeance: { label: 'À échéance', cls: 'bg-amber-100 text-amber-700' },
  renouvele: { label: 'Renouvelé', cls: 'bg-emerald-100 text-emerald-700' },
  expire: { label: 'Expiré', cls: 'bg-gray-200 text-gray-600' },
  resilie: { label: 'Résilié', cls: 'bg-red-100 text-red-700' },
}

export const STATUTS_FACTURE = {
  brouillon: { label: 'Brouillon', cls: 'bg-gray-100 text-gray-700' },
  validee: { label: 'Validée', cls: 'bg-blue-100 text-blue-700' },
  partiel: { label: 'Partiellement payée', cls: 'bg-amber-100 text-amber-700' },
  payee: { label: 'Payée', cls: 'bg-emerald-100 text-emerald-700' },
}

export const STATUTS_PROSPECT = {
  prospect: { label: 'Prospect', cls: 'bg-blue-100 text-blue-700' },
  en_cours: { label: 'En cours', cls: 'bg-amber-100 text-amber-700' },
  perdu: { label: 'Perdu', cls: 'bg-red-100 text-red-600' },
  converti: { label: 'Converti', cls: 'bg-emerald-100 text-emerald-700' },
  client: { label: 'Converti', cls: 'bg-emerald-100 text-emerald-700' },
}

export const NATURES_LIGNE = {
  commission: 'Commission',
  performance: 'Prime de performance',
  retrocession: 'Rétrocession',
  ajustement: 'Ajustement',
}

export const ROLES_LIGNE = { direct: 'Vente directe', junior: 'Part Junior', senior: 'Part Sénior' }
