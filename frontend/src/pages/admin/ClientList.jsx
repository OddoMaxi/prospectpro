import { useEffect, useState } from 'react'
import { api } from '../../api'
import { useAuth } from '../../context/AuthContext'
import toast from 'react-hot-toast'
import { Search, Filter, Eye, Trash2, ChevronDown, X, UserCheck } from 'lucide-react'
import Pagination from '../../components/Pagination'

const PAGE_SIZE = 10
const TYPES = { physique: 'Particulier', morale: 'Entreprise' }
const fmt = n => new Intl.NumberFormat('fr-FR').format(Math.round(n || 0))
const fmtDate = d => d ? new Date(d).toLocaleDateString('fr-FR') : '—'
const fmtCur = n => `${fmt(n)} GNF`

function ClientModal({ client, onClose }) {
  if (!client) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl my-4">
        <div className="p-5 border-b border-gray-100 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                #{client.numero}
              </span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium
                ${client.type === 'physique' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'}`}>
                {TYPES[client.type]}
              </span>
            </div>
            <h3 className="font-bold text-gray-900 mt-1.5 text-lg">
              {client.type === 'physique'
                ? `${client.prenom || ''} ${client.nom}`.trim()
                : client.nom}
            </h3>
            <p className="text-sm text-gray-500">Agent : {client.agent_prenom} {client.agent_nom}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl font-bold leading-none ml-4">×</button>
        </div>

        <div className="p-5 space-y-5 text-sm">
          {/* Contrat */}
          <div className="bg-emerald-50 rounded-xl p-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <p className="text-xs text-emerald-600 font-medium">N° Contrat</p>
              <p className="font-bold text-emerald-900 mt-0.5">{client.numero_contrat || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-emerald-600 font-medium">Date d'effet</p>
              <p className="font-semibold text-emerald-900 mt-0.5">{fmtDate(client.date_effet)}</p>
            </div>
            <div>
              <p className="text-xs text-emerald-600 font-medium">Date de fin</p>
              <p className="font-semibold text-emerald-900 mt-0.5">{fmtDate(client.date_fin)}</p>
            </div>
          </div>

          {/* Financier */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-blue-50 rounded-xl p-4">
              <p className="text-xs text-blue-600 font-medium">Prime totale payée</p>
              <p className="text-xl font-bold text-blue-900 mt-0.5">{fmtCur(client.prime_totale)}</p>
            </div>
            <div className="bg-green-50 rounded-xl p-4">
              <p className="text-xs text-green-600 font-medium">Commission totale</p>
              <p className="text-xl font-bold text-green-900 mt-0.5">{fmtCur(client.commission_totale)}</p>
            </div>
          </div>

          {/* Produits */}
          {client.products?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Produits souscrits</p>
              <table className="w-full text-sm border border-gray-100 rounded-xl overflow-hidden">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Produit</th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-gray-500">Bénéficiaires</th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-gray-500">Prime payée</th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-gray-500">Commission</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {client.products.map((p, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2 font-medium text-gray-800">{p.product_nom || '—'}</td>
                      <td className="px-3 py-2 text-right text-gray-600">{p.nb_beneficiaires}</td>
                      <td className="px-3 py-2 text-right font-medium text-blue-700">{fmtCur(p.prime_payee)}</td>
                      <td className="px-3 py-2 text-right font-medium text-green-700">{fmtCur(p.commission)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Coordonnées */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            {client.telephone && <div><p className="text-xs text-gray-400">Téléphone</p><p className="font-medium">{client.telephone}</p></div>}
            {client.email && <div><p className="text-xs text-gray-400">Email</p><p className="font-medium">{client.email}</p></div>}
            {client.secteur_activite && <div><p className="text-xs text-gray-400">Secteur</p><p className="font-medium">{client.secteur_activite}</p></div>}
            <div><p className="text-xs text-gray-400">Date de prospection</p><p className="font-medium">{fmtDate(client.date_prospection)}</p></div>
            <div><p className="text-xs text-gray-400">Converti le</p><p className="font-medium">{fmtDate(client.converted_at)}</p></div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ClientList() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

  const [clients, setClients] = useState([])
  const [agents, setAgents] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState({ search: '', agent_id: '', date_debut: '', date_fin: '' })
  const [page, setPage] = useState(1)

  const load = () => {
    setLoading(true)
    const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v))
    api.get('/clients', { params }).then(r => setClients(r.data)).finally(() => setLoading(false))
  }

  useEffect(() => {
    if (isAdmin) api.get('/agents').then(r => setAgents(r.data)).catch(() => {})
  }, [isAdmin])

  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t) }, [filters])

  const setF = (k, v) => { setFilters(p => ({ ...p, [k]: v })); setPage(1) }

  const openDetail = async id => {
    try {
      const r = await api.get(`/clients/${id}`)
      setSelected(r.data)
    } catch { toast.error('Erreur lors du chargement') }
  }

  const handleDelete = async id => {
    if (!confirm('Supprimer ce client définitivement ?')) return
    try {
      await api.delete(`/clients/${id}`)
      toast.success('Client supprimé')
      setSelected(null)
      load()
    } catch { toast.error('Erreur lors de la suppression') }
  }

  const hasActiveFilters = Object.values(filters).some(Boolean)
  const primeTotale = clients.reduce((s, c) => s + Number(c.prime_totale || 0), 0)
  const commTotale  = clients.reduce((s, c) => s + Number(c.commission_totale || 0), 0)
  const paginated   = clients.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div>
      {selected && <ClientModal client={selected} onClose={() => setSelected(null)} />}

      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <UserCheck size={22} className="text-emerald-600" />
            Clients
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {clients.length} client(s)
            {primeTotale > 0 && <> · Primes : <span className="font-medium">{fmtCur(primeTotale)}</span></>}
            {commTotale  > 0 && <> · Commissions : <span className="font-medium">{fmtCur(commTotale)}</span></>}
          </p>
        </div>
      </div>

      <div className="card mb-5 space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              className="input pl-9"
              placeholder="Nom, N° contrat, téléphone..."
              value={filters.search}
              onChange={e => setF('search', e.target.value)}
            />
          </div>
          <button
            onClick={() => setShowFilters(v => !v)}
            className={`btn btn-secondary gap-2 ${hasActiveFilters ? 'ring-2 ring-blue-300' : ''}`}
          >
            <Filter size={15} />Filtres
            <ChevronDown size={14} className={`transition-transform ${showFilters ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {showFilters && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-3 border-t border-gray-100">
            {isAdmin && (
              <div>
                <label className="label">Agent</label>
                <select className="input" value={filters.agent_id} onChange={e => setF('agent_id', e.target.value)}>
                  <option value="">Tous les agents</option>
                  {agents.map(a => <option key={a.id} value={a.id}>{a.prenom} {a.nom}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="label">Converti depuis le</label>
              <input className="input" type="date" value={filters.date_debut} onChange={e => setF('date_debut', e.target.value)} />
            </div>
            <div>
              <label className="label">Jusqu'au</label>
              <input className="input" type="date" value={filters.date_fin} onChange={e => setF('date_fin', e.target.value)} />
            </div>
            {hasActiveFilters && (
              <button
                onClick={() => setFilters({ search: '', agent_id: '', date_debut: '', date_fin: '' })}
                className="col-span-2 md:col-span-4 btn btn-secondary btn-sm justify-center"
              >
                <X size={13} />Effacer les filtres
              </button>
            )}
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : clients.length === 0 ? (
        <div className="card text-center py-14">
          <UserCheck size={40} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">
            {hasActiveFilters ? 'Aucun résultat pour ces filtres' : 'Aucun client enregistré'}
          </p>
        </div>
      ) : (
        <div className="card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {['N°','Nom / Raison sociale','Type','Agent','N° Contrat','Prime payée','Commission','Date effet','Date fin','Actions']
                    .filter(h => isAdmin || h !== 'Agent')
                    .map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {paginated.map(c => (
                  <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                        #{c.numero}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {c.type === 'physique' ? `${c.prenom || ''} ${c.nom}`.trim() : c.nom}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium
                        ${c.type === 'physique' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'}`}>
                        {TYPES[c.type]}
                      </span>
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-3 text-gray-600">{c.agent_prenom} {c.agent_nom}</td>
                    )}
                    <td className="px-4 py-3 font-mono text-gray-700 text-xs">{c.numero_contrat || '—'}</td>
                    <td className="px-4 py-3 text-right font-medium text-blue-700">{fmtCur(c.prime_totale)}</td>
                    <td className="px-4 py-3 text-right font-medium text-emerald-700">{fmtCur(c.commission_totale)}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">{fmtDate(c.date_effet)}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">{fmtDate(c.date_fin)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => openDetail(c.id)}
                          className="p-1.5 hover:bg-blue-50 rounded-lg text-blue-500 transition-colors" title="Voir"
                        >
                          <Eye size={15} />
                        </button>
                        {isAdmin && (
                          <button
                            onClick={() => handleDelete(c.id)}
                            className="p-1.5 hover:bg-red-50 rounded-lg text-red-500 transition-colors" title="Supprimer"
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 pb-4">
            <Pagination page={page} totalPages={Math.ceil(clients.length / PAGE_SIZE)} total={clients.length} onPageChange={setPage} />
          </div>
        </div>
      )}
    </div>
  )
}
