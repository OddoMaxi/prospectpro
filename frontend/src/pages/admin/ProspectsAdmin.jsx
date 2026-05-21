import { useEffect, useState } from 'react'
import { api } from '../../api'
import toast from 'react-hot-toast'
import { Search, Filter, Trash2, Eye, ChevronDown, UserCheck, X } from 'lucide-react'
import Pagination from '../../components/Pagination'

const PAGE_SIZE = 10

const STATUTS = { prospect: 'Prospect', en_cours: 'En cours', client: 'Client', perdu: 'Perdu' }
const TYPES   = { physique: 'Particulier', morale: 'Entreprise' }
const fmt = n => new Intl.NumberFormat('fr-FR').format(Math.round(n || 0))
const fmtDate = d => d ? new Date(d).toLocaleDateString('fr-FR') : '-'
const fmtCur = n => `${fmt(n)} GNF`

function ProspectModal({ prospect, onClose }) {
  if (!prospect) return null
  const comm = (prospect.montant_potentiel * prospect.taux_commission / 100)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg my-4">
        <div className="p-5 border-b border-gray-100 flex items-start justify-between">
          <div>
            {prospect.numero && (
              <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full mb-1 inline-block">
                #{prospect.numero}
              </span>
            )}
            <h3 className="font-bold text-gray-900">{prospect.nom}{prospect.prenom ? ` ${prospect.prenom}` : ''}</h3>
            <p className="text-sm text-gray-500 mt-0.5">Agent : {prospect.agent_prenom} {prospect.agent_nom}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl font-bold leading-none">×</button>
        </div>
        <div className="p-5 space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            {[
              ['Type', TYPES[prospect.type]],
              ['Statut', STATUTS[prospect.statut]],
              ['Téléphone', prospect.telephone || '-'],
              ['Email', prospect.email || '-'],
              ['Secteur', prospect.secteur_activite || '-'],
              ['Date prospection', fmtDate(prospect.date_prospection)],
              ['Montant potentiel', fmtCur(prospect.montant_potentiel)],
              ['Commission prév.', fmtCur(comm)],
            ].map(([k, v]) => (
              <div key={k}><p className="text-xs text-gray-400">{k}</p><p className="font-medium text-gray-800">{v}</p></div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function ConvertModal({ prospectId, onClose, onDone }) {
  const [data, setData] = useState(null)
  const [form, setForm] = useState({ numero_contrat: '', date_effet: '', date_fin: '' })
  const [primes, setPrimes] = useState({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get(`/prospects/${prospectId}`).then(r => {
      setData(r.data)
      const init = {}
      ;(r.data.prospect_products || []).forEach(p => {
        init[p.product_id] = String(p.nb_beneficiaires * (p.prime_annuelle || 0))
      })
      setPrimes(init)
    })
  }, [prospectId])

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const primeTotale = Object.values(primes).reduce((s, v) => s + (Number(v) || 0), 0)
  const commTotale  = data?.prospect_products?.reduce((s, p) => {
    const pp = Number(primes[p.product_id]) || 0
    return s + pp * (p.product_taux || 0) / 100
  }, 0) || 0

  const handleSubmit = async e => {
    e.preventDefault()
    if (!form.numero_contrat || !form.date_effet || !form.date_fin) {
      toast.error('Veuillez remplir tous les champs du contrat')
      return
    }
    setSaving(true)
    try {
      const products = (data?.prospect_products || []).map(p => ({
        product_id: p.product_id,
        prime_payee: Number(primes[p.product_id]) || 0,
      }))
      await api.post(`/prospects/${prospectId}/convert`, { ...form, products })
      toast.success('Prospect converti en client !')
      onDone()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erreur lors de la conversion')
    } finally {
      setSaving(false)
    }
  }

  if (!data) return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl p-8"><div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl my-4">
        <div className="p-5 border-b border-gray-100 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <UserCheck size={18} className="text-emerald-600" />
              <span className="font-bold text-gray-900">Convertir en client</span>
            </div>
            <p className="text-sm text-gray-500">
              {data.numero && <span className="font-mono text-blue-600 mr-2">#{data.numero}</span>}
              {data.type === 'physique' ? `${data.prenom || ''} ${data.nom}`.trim() : data.nom}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl font-bold leading-none">×</button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-5">
          {/* Infos contrat */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Informations du contrat</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-3">
                <label className="label">N° du contrat d'assurance *</label>
                <input className="input" placeholder="ex: C-2024-001" value={form.numero_contrat}
                  onChange={e => setF('numero_contrat', e.target.value)} required />
              </div>
              <div>
                <label className="label">Date d'effet *</label>
                <input className="input" type="date" value={form.date_effet}
                  onChange={e => setF('date_effet', e.target.value)} required />
              </div>
              <div>
                <label className="label">Date de fin *</label>
                <input className="input" type="date" value={form.date_fin}
                  onChange={e => setF('date_fin', e.target.value)} required />
              </div>
            </div>
          </div>

          {/* Primes par produit */}
          {data.prospect_products?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Primes payées par produit</p>
              <div className="space-y-3">
                {data.prospect_products.map(p => {
                  const prime = Number(primes[p.product_id]) || 0
                  const comm  = prime * (p.product_taux || 0) / 100
                  return (
                    <div key={p.product_id} className="bg-gray-50 rounded-xl p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-gray-800 text-sm">{p.product_nom}</span>
                        <span className="text-xs text-gray-400">{p.nb_beneficiaires} bénéf. · taux {p.product_taux}%</span>
                      </div>
                      <div className="flex gap-3 items-center">
                        <div className="flex-1">
                          <label className="label text-xs">Prime payée (GNF)</label>
                          <input
                            className="input"
                            type="number"
                            min="0"
                            value={primes[p.product_id] ?? ''}
                            onChange={e => setPrimes(pr => ({ ...pr, [p.product_id]: e.target.value }))}
                          />
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs text-gray-400">Commission</p>
                          <p className="font-bold text-emerald-600">{fmtCur(comm)}</p>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Totaux */}
              <div className="mt-3 bg-blue-50 rounded-xl p-3 flex justify-between items-center">
                <div>
                  <p className="text-xs text-blue-600 font-medium">Prime totale</p>
                  <p className="font-bold text-blue-900">{fmtCur(primeTotale)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-emerald-600 font-medium">Commission totale</p>
                  <p className="font-bold text-emerald-700">{fmtCur(commTotale)}</p>
                </div>
              </div>
            </div>
          )}

          {data.prospect_products?.length === 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-700">
              Ce prospect n'a pas de produits associés. La prime et la commission seront à zéro.
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn btn-secondary flex-1">Annuler</button>
            <button type="submit" disabled={saving} className="btn btn-primary flex-1">
              {saving ? 'Conversion...' : 'Confirmer la conversion'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function ProspectsAdmin() {
  const [prospects, setProspects] = useState([])
  const [agents, setAgents] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [converting, setConverting] = useState(null)
  const [filters, setFilters] = useState({ search: '', type: '', statut: '', agent_id: '', date_debut: '', date_fin: '' })
  const [showFilters, setShowFilters] = useState(false)
  const [page, setPage] = useState(1)

  const load = () => {
    setLoading(true)
    const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v))
    api.get('/prospects', { params }).then(r => setProspects(r.data)).finally(() => setLoading(false))
  }

  useEffect(() => { api.get('/agents').then(r => setAgents(r.data)) }, [])
  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t) }, [filters])

  const setF = (k, v) => { setFilters(p => ({ ...p, [k]: v })); setPage(1) }

  const handleDelete = async id => {
    if (!confirm('Supprimer ce prospect définitivement ?')) return
    try {
      await api.delete(`/prospects/${id}`)
      toast.success('Prospect supprimé')
      load()
    } catch { toast.error('Erreur lors de la suppression') }
  }

  const totalCommission = prospects.reduce((s, p) => s + (p.montant_potentiel * p.taux_commission / 100), 0)

  return (
    <div>
      {selected && <ProspectModal prospect={selected} onClose={() => setSelected(null)} />}
      {converting && (
        <ConvertModal
          prospectId={converting}
          onClose={() => setConverting(null)}
          onDone={() => { setConverting(null); load() }}
        />
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Tous les prospects</h1>
          <p className="text-gray-500 text-sm mt-0.5">{prospects.length} prospect(s) — Commission prévisionnelle : {fmt(totalCommission)} GNF</p>
        </div>
      </div>

      <div className="card mb-5 space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className="input pl-9" placeholder="Rechercher un prospect..." value={filters.search} onChange={e => setF('search', e.target.value)} />
          </div>
          <button onClick={() => setShowFilters(v => !v)} className="btn btn-secondary gap-2">
            <Filter size={15} />Filtres
            <ChevronDown size={14} className={`transition-transform ${showFilters ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {showFilters && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 pt-2 border-t border-gray-100">
            <div>
              <label className="label">Agent</label>
              <select className="input" value={filters.agent_id} onChange={e => setF('agent_id', e.target.value)}>
                <option value="">Tous les agents</option>
                {agents.map(a => <option key={a.id} value={a.id}>{a.prenom} {a.nom}</option>)}
              </select>
            </div>
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
              <label className="label">Du</label>
              <input className="input" type="date" value={filters.date_debut} onChange={e => setF('date_debut', e.target.value)} />
            </div>
            <div>
              <label className="label">Au</label>
              <input className="input" type="date" value={filters.date_fin} onChange={e => setF('date_fin', e.target.value)} />
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {['N°','Nom / Raison sociale','Type','Statut','Agent','Montant potentiel','Commission','Date','Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {prospects.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(p => (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      {p.numero
                        ? <span className="font-mono text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">#{p.numero}</span>
                        : <span className="text-gray-300 text-xs">—</span>
                      }
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {p.nom}{p.prenom ? ` ${p.prenom}` : ''}
                      {p.nom_contact && <span className="block text-xs text-gray-400">{p.prenom_contact} {p.nom_contact}</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${p.type === 'physique' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'}`}>
                        {TYPES[p.type]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`badge-${p.statut}`}>{STATUTS[p.statut]}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{p.agent_prenom} {p.agent_nom}</td>
                    <td className="px-4 py-3 text-right font-medium">{fmt(p.montant_potentiel)}</td>
                    <td className="px-4 py-3 text-right text-blue-600 font-medium">{fmt(p.montant_potentiel * p.taux_commission / 100)}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmtDate(p.date_prospection)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => setSelected(p)} className="p-1.5 hover:bg-blue-50 rounded-lg text-blue-500 transition-colors" title="Voir">
                          <Eye size={15} />
                        </button>
                        <button
                          onClick={() => setConverting(p.id)}
                          className="p-1.5 hover:bg-emerald-50 rounded-lg text-emerald-600 transition-colors"
                          title="Convertir en client"
                        >
                          <UserCheck size={15} />
                        </button>
                        <button onClick={() => handleDelete(p.id)} className="p-1.5 hover:bg-red-50 rounded-lg text-red-500 transition-colors" title="Supprimer">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {prospects.length === 0 && (
                  <tr><td colSpan={9} className="px-4 py-10 text-center text-gray-400">Aucun prospect trouvé</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="px-4 pb-4">
            <Pagination page={page} totalPages={Math.ceil(prospects.length / PAGE_SIZE)} total={prospects.length} onPageChange={setPage} />
          </div>
        </div>
      )}
    </div>
  )
}
