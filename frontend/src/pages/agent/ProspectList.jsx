import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../../api'
import toast from 'react-hot-toast'
import { Plus, Search, Filter, Edit, Trash2, ChevronDown, X, ChevronLeft, ChevronRight } from 'lucide-react'

const PAGE_SIZE = 10

const STATUTS   = { prospect: 'Prospect', client: 'Client' }
const TYPES     = { physique: 'Particulier', morale: 'Entreprise' }
const NIVEAUX   = { Faible: 'text-gray-500 bg-gray-100', Moyen: 'text-amber-700 bg-amber-100', Élevé: 'text-emerald-700 bg-emerald-100' }
const fmt       = n => new Intl.NumberFormat('fr-FR').format(Math.round(n || 0))
const fmtDate   = d => d ? new Date(d).toLocaleDateString('fr-FR') : '—'
const fmtTel    = t => t ? String(t).replace(/\s+/g, '').replace(/(\d{3})(?=\d)/g, '$1 ') : '—'

function statutBadge(s) {
  const cls = s === 'client'
    ? 'bg-emerald-100 text-emerald-700'
    : 'bg-blue-100 text-blue-700'
  return <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{STATUTS[s] ?? s}</span>
}

function lieu(p) {
  if (p.type === 'physique') return p.lieu_residence_quartier || p.lieu_residence_commune || '—'
  return p.siege_social_quartier || p.siege_social_commune || '—'
}

export default function ProspectList() {
  const navigate = useNavigate()
  const [prospects, setProspects] = useState([])
  const [loading, setLoading] = useState(true)
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState({ search: '', type: '', statut: '', date_debut: '', date_fin: '' })
  const [page, setPage] = useState(1)

  const load = () => {
    setLoading(true)
    const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v))
    api.get('/prospects', { params }).then(r => setProspects(r.data)).finally(() => setLoading(false))
  }

  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t) }, [filters])
  const setF = (k, v) => { setFilters(p => ({ ...p, [k]: v })); setPage(1) }

  const handleDelete = async id => {
    if (!confirm('Supprimer ce prospect ?')) return
    try {
      await api.delete(`/prospects/${id}`)
      toast.success('Prospect supprimé')
      load()
    } catch { toast.error('Erreur lors de la suppression') }
  }

  const totalPrime = prospects.reduce((s, p) => s + (p.montant_potentiel || 0), 0)
  const totalComm  = prospects.reduce((s, p) => s + (p.montant_potentiel || 0) * (p.taux_commission || 0) / 100, 0)
  const hasActiveFilters = Object.values(filters).some(Boolean)

  const totalPages = Math.ceil(prospects.length / PAGE_SIZE)
  const paginated  = prospects.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Mes prospects</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {prospects.length} résultat(s)
            {totalPrime > 0 && <> · Primes : <span className="font-medium">{fmt(totalPrime)} GNF</span></>}
            {totalComm  > 0 && <> · Commissions : <span className="font-medium">{fmt(totalComm)} GNF</span></>}
          </p>
        </div>
        <Link to="/agent/prospects/create" className="btn btn-primary">
          <Plus size={16} />Nouveau
        </Link>
      </div>

      {/* Barre de recherche + filtres */}
      <div className="card mb-5 space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              className="input pl-9"
              placeholder="Nom, téléphone..."
              value={filters.search}
              onChange={e => setF('search', e.target.value)}
            />
          </div>
          <button
            onClick={() => setShowFilters(v => !v)}
            className={`btn btn-secondary gap-2 ${hasActiveFilters ? 'ring-2 ring-blue-300' : ''}`}
          >
            <Filter size={15} /><span className="hidden sm:inline">Filtres</span>
            {hasActiveFilters && <span className="w-2 h-2 bg-blue-500 rounded-full" />}
            <ChevronDown size={14} className={`transition-transform ${showFilters ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {showFilters && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-3 border-t border-gray-100">
            <div>
              <label className="label">Type</label>
              <select className="input" value={filters.type} onChange={e => setF('type', e.target.value)}>
                <option value="">Tous</option>
                <option value="physique">Particulier</option>
                <option value="morale">Entreprise</option>
              </select>
            </div>
            <div>
              <label className="label">Statut</label>
              <select className="input" value={filters.statut} onChange={e => setF('statut', e.target.value)}>
                <option value="">Tous</option>
                <option value="prospect">Prospect</option>
                <option value="client">Client</option>
              </select>
            </div>
            <div>
              <label className="label">Du</label>
              <input className="input" type="date" value={filters.date_debut} onChange={e => setF('date_debut', e.target.value)} />
            </div>
            <div>
              <label className="label">Au</label>
              <input className="input" type="date" value={filters.date_fin} onChange={e => setF('date_fin', e.target.value)} />
            </div>
            {hasActiveFilters && (
              <button
                onClick={() => setFilters({ search: '', type: '', statut: '', date_debut: '', date_fin: '' })}
                className="col-span-2 md:col-span-4 btn btn-secondary btn-sm justify-center"
              >
                <X size={13} />Effacer les filtres
              </button>
            )}
          </div>
        )}
      </div>

      {/* Tableau */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : prospects.length === 0 ? (
        <div className="card text-center py-14">
          <Search size={40} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">
            {hasActiveFilters ? 'Aucun résultat pour ces filtres' : 'Aucun prospect enregistré'}
          </p>
          {!hasActiveFilters && (
            <Link to="/agent/prospects/create" className="btn btn-primary mt-4 inline-flex">
              <Plus size={16} />Créer le premier prospect
            </Link>
          )}
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs text-gray-500 uppercase tracking-wide">
                <th className="pb-3 font-medium">Nom</th>
                <th className="pb-3 font-medium">Type</th>
                <th className="pb-3 font-medium">Téléphone</th>
                <th className="pb-3 font-medium">Localisation</th>
                <th className="pb-3 font-medium text-center">Intérêt</th>
                <th className="pb-3 font-medium text-center">Statut</th>
                <th className="pb-3 font-medium text-right">Prime prév.</th>
                <th className="pb-3 font-medium text-right">Commission</th>
                <th className="pb-3 font-medium text-right">Date</th>
                <th className="pb-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {paginated.map(p => (
                <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                  <td className="py-3 font-medium text-gray-900">
                    {p.type === 'physique'
                      ? `${p.prenom || ''} ${p.nom}`.trim()
                      : p.nom}
                  </td>
                  <td className="py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium
                      ${p.type === 'physique' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'}`}>
                      {TYPES[p.type]}
                    </span>
                  </td>
                  <td className="py-3 text-gray-600">{fmtTel(p.telephone)}</td>
                  <td className="py-3 text-gray-500 max-w-[160px] truncate" title={lieu(p)}>{lieu(p)}</td>
                  <td className="py-3 text-center">
                    {p.niveau_interet ? (
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${NIVEAUX[p.niveau_interet] || 'bg-gray-100 text-gray-500'}`}>
                        {p.niveau_interet}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="py-3 text-center">{statutBadge(p.statut)}</td>
                  <td className="py-3 text-right font-medium text-blue-700">
                    {p.montant_potentiel > 0 ? fmt(p.montant_potentiel) : '—'}
                  </td>
                  <td className="py-3 text-right font-medium text-emerald-700">
                    {p.montant_potentiel > 0 && p.taux_commission > 0
                      ? fmt(p.montant_potentiel * p.taux_commission / 100)
                      : '—'}
                  </td>
                  <td className="py-3 text-right text-gray-500 text-xs">{fmtDate(p.date_prospection)}</td>
                  <td className="py-3 text-right">
                    <div className="flex items-center gap-1.5 justify-end">
                      <button
                        onClick={() => navigate(`/agent/prospects/${p.id}/edit`)}
                        className="btn btn-secondary btn-sm" title="Modifier"
                      >
                        <Edit size={13} />
                      </button>
                      <button
                        onClick={() => handleDelete(p.id)}
                        className="btn btn-danger btn-sm" title="Supprimer"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4 border-t border-gray-100 mt-2">
              <span className="text-xs text-gray-500">
                Page {page} / {totalPages} · {prospects.length} résultat(s)
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(1)}
                  disabled={page === 1}
                  className="btn btn-secondary btn-sm disabled:opacity-40"
                  title="Première page"
                >«</button>
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="btn btn-secondary btn-sm disabled:opacity-40"
                  title="Page précédente"
                ><ChevronLeft size={14} /></button>

                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(n => n === 1 || n === totalPages || Math.abs(n - page) <= 1)
                  .reduce((acc, n, idx, arr) => {
                    if (idx > 0 && n - arr[idx - 1] > 1) acc.push('…')
                    acc.push(n)
                    return acc
                  }, [])
                  .map((n, i) =>
                    n === '…'
                      ? <span key={`e${i}`} className="px-1 text-gray-400 text-xs">…</span>
                      : <button
                          key={n}
                          onClick={() => setPage(n)}
                          className={`btn btn-sm min-w-[32px] ${n === page ? 'btn-primary' : 'btn-secondary'}`}
                        >{n}</button>
                  )}

                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="btn btn-secondary btn-sm disabled:opacity-40"
                  title="Page suivante"
                ><ChevronRight size={14} /></button>
                <button
                  onClick={() => setPage(totalPages)}
                  disabled={page === totalPages}
                  className="btn btn-secondary btn-sm disabled:opacity-40"
                  title="Dernière page"
                >»</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
