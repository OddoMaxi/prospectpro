import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../../api'
import { useAuth } from '../../context/AuthContext'
import toast from 'react-hot-toast'
import { Plus, Search, Filter, Edit, Trash2, ChevronDown, X, UserCheck, Download } from 'lucide-react'
import Pagination from '../../components/Pagination'
import ConvertModal from '../../components/ConvertModal'
import { exportCSV } from '../../utils/csv'

const PAGE_SIZE = 10

const STATUTS = { prospect: 'Prospect', en_cours: 'En cours', client: 'Client', perdu: 'Perdu' }
const TYPES   = { physique: 'Particulier', morale: 'Entreprise' }
const NIVEAUX = { Faible: 'text-gray-500 bg-gray-100', Moyen: 'text-amber-700 bg-amber-100', Élevé: 'text-emerald-700 bg-emerald-100' }
const fmt     = n => new Intl.NumberFormat('fr-FR').format(Math.round(n || 0))
const fmtDate = d => d ? new Date(d).toLocaleDateString('fr-FR') : '—'
const fmtTel  = t => t ? String(t).replace(/\s+/g, '').replace(/(\d{3})(?=\d)/g, '$1 ') : '—'

const STATUT_STYLES = {
  prospect: 'bg-blue-100 text-blue-700',
  en_cours: 'bg-amber-100 text-amber-700',
  client:   'bg-emerald-100 text-emerald-700',
  perdu:    'bg-red-100 text-red-600',
}

function lieu(p) {
  if (p.type === 'physique') return p.lieu_residence_quartier || p.lieu_residence_commune || '—'
  return p.siege_social_quartier || p.siege_social_commune || '—'
}

export default function ProspectList() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [prospects, setProspects] = useState([])
  const [sousAgents, setSousAgents] = useState([])
  const [loading, setLoading] = useState(true)
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState({
    search: '', type: '', statut: '', niveau_interet: '', date_debut: '', date_fin: '', agent_id: ''
  })
  const [page, setPage] = useState(1)
  const [convertId, setConvertId] = useState(null)

  useEffect(() => {
    if (!user?.parent_agent_id) {
      api.get('/agents/sous-agents').then(r => setSousAgents(r.data || [])).catch(() => {})
    }
  }, [user])

  const load = () => {
    setLoading(true)
    const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v))
    api.get('/prospects', { params }).then(r => setProspects(r.data)).finally(() => setLoading(false))
  }

  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t) }, [filters])
  const setF = (k, v) => { setFilters(p => ({ ...p, [k]: v })); setPage(1) }
  const hasSubAgents = sousAgents.length > 0
  const isOwnProspect = p => p.agent_id === user?.id

  const handleDelete = async id => {
    if (!confirm('Supprimer ce prospect ?')) return
    try {
      await api.delete(`/prospects/${id}`)
      toast.success('Prospect supprimé')
      load()
    } catch { toast.error('Erreur lors de la suppression') }
  }

  const handleStatusChange = async (id, statut) => {
    try {
      await api.patch(`/prospects/${id}/statut`, { statut })
      setProspects(prev => prev.map(p => p.id === id ? { ...p, statut } : p))
    } catch { toast.error('Erreur lors de la mise à jour') }
  }

  const handleExport = () => {
    exportCSV(prospects, [
      { label: 'N°',            value: 'numero' },
      { label: 'Nom',           value: p => p.type === 'physique' ? `${p.prenom || ''} ${p.nom}`.trim() : p.nom },
      { label: 'Type',          value: p => TYPES[p.type] },
      { label: 'Téléphone',     value: 'telephone' },
      { label: 'Localisation',  value: lieu },
      { label: 'Intérêt',       value: 'niveau_interet' },
      { label: 'Statut',        value: p => STATUTS[p.statut] },
      { label: 'Prime prév.',   value: p => Math.round(p.montant_potentiel || 0) },
      { label: 'Commission',    value: p => Math.round((p.montant_potentiel || 0) * (p.taux_commission || 0) / 100) },
      { label: 'Date',          value: p => fmtDate(p.date_prospection) },
      { label: 'Agent',         value: p => `${p.agent_prenom || ''} ${p.agent_nom || ''}`.trim() },
    ], `prospects_${new Date().toISOString().split('T')[0]}.csv`)
  }

  const totalPrime = prospects.reduce((s, p) => s + (p.montant_potentiel || 0), 0)
  const totalComm  = prospects.reduce((s, p) => s + (p.montant_potentiel || 0) * (p.taux_commission || 0) / 100, 0)
  const hasActiveFilters = Object.values(filters).some(Boolean)
  const totalPages = Math.ceil(prospects.length / PAGE_SIZE)
  const paginated  = prospects.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div>
      {convertId && (
        <ConvertModal
          prospectId={convertId}
          onClose={() => setConvertId(null)}
          onDone={() => { setConvertId(null); load() }}
        />
      )}

      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Mes prospects</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {prospects.length} résultat(s)
            {totalPrime > 0 && <> · Primes : <span className="font-medium">{fmt(totalPrime)}</span></>}
            {totalComm  > 0 && <> · Commissions : <span className="font-medium">{fmt(totalComm)}</span></>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {prospects.length > 0 && (
            <button onClick={handleExport} className="btn btn-secondary btn-sm gap-1.5" title="Exporter CSV">
              <Download size={14} />
              <span className="hidden sm:inline">CSV</span>
            </button>
          )}
          <Link to="/agent/prospects/create" className="btn btn-primary">
            <Plus size={16} />Nouveau
          </Link>
        </div>
      </div>

      {/* Filtres */}
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
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 pt-3 border-t border-gray-100">
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
                {Object.entries(STATUTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Niveau d'intérêt</label>
              <select className="input" value={filters.niveau_interet} onChange={e => setF('niveau_interet', e.target.value)}>
                <option value="">Tous</option>
                <option value="Faible">Faible</option>
                <option value="Moyen">Moyen</option>
                <option value="Élevé">Élevé</option>
              </select>
            </div>
            {hasSubAgents && (
              <div>
                <label className="label">Agent</label>
                <select className="input" value={filters.agent_id} onChange={e => setF('agent_id', e.target.value)}>
                  <option value="">Tous</option>
                  <option value={user?.id}>Moi uniquement</option>
                  {sousAgents.map(sa => (
                    <option key={sa.id} value={sa.id}>
                      {sa.prenom ? `${sa.prenom} ${sa.nom}` : sa.nom}
                    </option>
                  ))}
                </select>
              </div>
            )}
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
                onClick={() => { setFilters({ search: '', type: '', statut: '', niveau_interet: '', date_debut: '', date_fin: '', agent_id: '' }); setPage(1) }}
                className="col-span-2 md:col-span-3 lg:col-span-5 btn btn-secondary btn-sm justify-center"
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
                <th className="pb-3 font-medium">N°</th>
                <th className="pb-3 font-medium">Nom</th>
                <th className="pb-3 font-medium hidden md:table-cell">Type</th>
                <th className="pb-3 font-medium hidden sm:table-cell">Téléphone</th>
                <th className="pb-3 font-medium hidden lg:table-cell">Localisation</th>
                {hasSubAgents && <th className="pb-3 font-medium hidden md:table-cell">Agent</th>}
                <th className="pb-3 font-medium text-center">Intérêt</th>
                <th className="pb-3 font-medium text-center">Statut</th>
                <th className="pb-3 font-medium text-right hidden sm:table-cell">Prime prév.</th>
                <th className="pb-3 font-medium text-right hidden sm:table-cell">Commission</th>
                <th className="pb-3 font-medium text-right hidden md:table-cell">Date</th>
                <th className="pb-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {paginated.map(p => {
                const own = isOwnProspect(p)
                return (
                  <tr key={p.id} className={`transition-colors hover:bg-gray-50 ${p.statut === 'perdu' ? 'opacity-60' : ''}`}>
                    <td className="py-3 pr-3">
                      {p.numero
                        ? <span className="font-mono text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">#{p.numero}</span>
                        : <span className="text-gray-300 text-xs">—</span>
                      }
                    </td>
                    <td className="py-3 font-medium text-gray-900">
                      {p.type === 'physique' ? `${p.prenom || ''} ${p.nom}`.trim() : p.nom}
                      {p.telephone && <span className="block text-xs text-gray-400 sm:hidden">{fmtTel(p.telephone)}</span>}
                    </td>
                    <td className="py-3 hidden md:table-cell">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium
                        ${p.type === 'physique' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'}`}>
                        {TYPES[p.type]}
                      </span>
                    </td>
                    <td className="py-3 text-gray-600 hidden sm:table-cell">{fmtTel(p.telephone)}</td>
                    <td className="py-3 text-gray-500 max-w-[140px] truncate hidden lg:table-cell" title={lieu(p)}>{lieu(p)}</td>
                    {hasSubAgents && (
                      <td className="py-3 hidden md:table-cell">
                        {!own && (
                          <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-purple-50 text-purple-700">
                            {p.agent_prenom ? `${p.agent_prenom} ${p.agent_nom}` : p.agent_nom}
                          </span>
                        )}
                      </td>
                    )}
                    <td className="py-3 text-center">
                      {p.niveau_interet ? (
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${NIVEAUX[p.niveau_interet] || 'bg-gray-100 text-gray-500'}`}>
                          {p.niveau_interet}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="py-3 text-center">
                      {own && p.statut !== 'client' ? (
                        <select
                          className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border-0 cursor-pointer bg-transparent appearance-none text-center ${STATUT_STYLES[p.statut] || 'bg-blue-100 text-blue-700'}`}
                          value={p.statut}
                          onChange={e => handleStatusChange(p.id, e.target.value)}
                        >
                          <option value="prospect">Prospect</option>
                          <option value="en_cours">En cours</option>
                          <option value="perdu">Perdu</option>
                        </select>
                      ) : (
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUT_STYLES[p.statut] || 'bg-blue-100 text-blue-700'}`}>
                          {STATUTS[p.statut] ?? p.statut}
                        </span>
                      )}
                    </td>
                    <td className="py-3 text-right font-medium text-blue-700 hidden sm:table-cell">
                      {p.montant_potentiel > 0 ? fmt(p.montant_potentiel) : '—'}
                    </td>
                    <td className="py-3 text-right font-medium text-emerald-700 hidden sm:table-cell">
                      {p.montant_potentiel > 0 && p.taux_commission > 0
                        ? fmt(p.montant_potentiel * p.taux_commission / 100)
                        : '—'}
                    </td>
                    <td className="py-3 text-right text-gray-500 text-xs hidden md:table-cell">{fmtDate(p.date_prospection)}</td>
                    <td className="py-3 text-right">
                      {own ? (
                        <div className="flex items-center gap-1.5 justify-end">
                          <button
                            onClick={() => navigate(`/agent/prospects/${p.id}/edit`)}
                            className="btn btn-secondary btn-sm" title="Modifier"
                          >
                            <Edit size={13} />
                          </button>
                          {p.statut !== 'client' && p.statut !== 'perdu' && (
                            <button
                              onClick={() => setConvertId(p.id)}
                              className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors"
                              title="Convertir en client"
                            >
                              <UserCheck size={13} />
                            </button>
                          )}
                          <button
                            onClick={() => handleDelete(p.id)}
                            className="btn btn-danger btn-sm" title="Supprimer"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">Lecture seule</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <Pagination page={page} totalPages={totalPages} total={prospects.length} onPageChange={setPage} />
        </div>
      )}
    </div>
  )
}
