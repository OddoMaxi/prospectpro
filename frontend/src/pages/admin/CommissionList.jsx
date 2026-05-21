import { useEffect, useState, useCallback } from 'react'
import { api } from '../../api'
import toast from 'react-hot-toast'
import { Search, Filter, ChevronDown, X, CreditCard, CheckCircle, Clock, AlertCircle } from 'lucide-react'
import Pagination from '../../components/Pagination'

const PAGE_SIZE = 10
const fmt = n => new Intl.NumberFormat('fr-FR').format(Math.round(n || 0))
const fmtDate = d => d ? new Date(d).toLocaleDateString('fr-FR') : '—'
const fmtCur = n => `${fmt(n)} GNF`

const STATUTS = {
  non_paye: { label: 'Non payé',   cls: 'bg-red-100 text-red-700',    icon: AlertCircle },
  partiel:  { label: 'Partiel',    cls: 'bg-amber-100 text-amber-700', icon: Clock },
  paye:     { label: 'Payé',       cls: 'bg-emerald-100 text-emerald-700', icon: CheckCircle },
}

function StatutBadge({ statut }) {
  const s = STATUTS[statut] || STATUTS.non_paye
  const Icon = s.icon
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${s.cls}`}>
      <Icon size={11} />{s.label}
    </span>
  )
}

function PayModal({ commission, onClose, onDone }) {
  const reste = Number(commission.montant_du) - Number(commission.montant_paye)
  const [form, setForm] = useState({
    montant_paye: String(Math.round(reste)),
    date_paiement: new Date().toISOString().split('T')[0],
    reference_paiement: commission.reference_paiement || '',
    notes: commission.notes || '',
  })
  const [saving, setSaving] = useState(false)
  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async e => {
    e.preventDefault()
    setSaving(true)
    try {
      await api.patch(`/commissions/${commission.id}/pay`, {
        ...form,
        montant_paye: Number(form.montant_paye),
      })
      toast.success('Commission mise à jour')
      onDone()
    } catch { toast.error('Erreur lors de la mise à jour') }
    finally { setSaving(false) }
  }

  const clientNom = commission.client_type === 'physique'
    ? `${commission.client_prenom || ''} ${commission.client_nom}`.trim()
    : commission.client_nom

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="p-5 border-b border-gray-100 flex items-start justify-between">
          <div>
            <h3 className="font-bold text-gray-900 flex items-center gap-2">
              <CreditCard size={18} className="text-blue-600" />
              Enregistrer un paiement
            </h3>
            <p className="text-sm text-gray-500 mt-0.5">
              {commission.agent_prenom} {commission.agent_nom}
              {commission.type === 'parent' && <span className="ml-1 text-xs text-purple-500">(commission parent)</span>}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl font-bold">×</button>
        </div>

        <div className="p-5 space-y-4">
          {/* Résumé */}
          <div className="bg-gray-50 rounded-xl p-3 grid grid-cols-3 gap-2 text-center text-sm">
            <div>
              <p className="text-xs text-gray-400">Client</p>
              <p className="font-semibold text-gray-800 truncate" title={clientNom}>
                {commission.client_numero ? <span className="text-blue-600 mr-1">#{commission.client_numero}</span> : ''}
                {clientNom}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Dû</p>
              <p className="font-bold text-gray-900">{fmtCur(commission.montant_du)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Reste</p>
              <p className={`font-bold ${reste > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{fmtCur(reste)}</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="label">Montant payé (GNF) *</label>
              <input className="input" type="number" min="0" value={form.montant_paye}
                onChange={e => setF('montant_paye', e.target.value)} required />
            </div>
            <div>
              <label className="label">Date de paiement *</label>
              <input className="input" type="date" value={form.date_paiement}
                onChange={e => setF('date_paiement', e.target.value)} required />
            </div>
            <div>
              <label className="label">Référence / Mode de paiement</label>
              <input className="input" placeholder="Virement, chèque, espèces…" value={form.reference_paiement}
                onChange={e => setF('reference_paiement', e.target.value)} />
            </div>
            <div>
              <label className="label">Notes</label>
              <textarea className="input" rows={2} value={form.notes}
                onChange={e => setF('notes', e.target.value)} />
            </div>
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={onClose} className="btn btn-secondary flex-1">Annuler</button>
              <button type="submit" disabled={saving} className="btn btn-primary flex-1">
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

export default function CommissionList() {
  const [commissions, setCommissions] = useState([])
  const [stats, setStats] = useState(null)
  const [agents, setAgents] = useState([])
  const [loading, setLoading] = useState(true)
  const [paying, setPaying] = useState(null)
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState({ search: '', statut: '', agent_id: '', date_debut: '', date_fin: '' })
  const [page, setPage] = useState(1)

  const loadStats = useCallback(() => {
    api.get('/commissions/stats').then(r => setStats(r.data)).catch(() => {})
  }, [])

  const load = useCallback(() => {
    setLoading(true)
    const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v))
    api.get('/commissions', { params }).then(r => setCommissions(r.data)).finally(() => setLoading(false))
  }, [filters])

  useEffect(() => { api.get('/agents').then(r => setAgents(r.data)) }, [])
  useEffect(() => { loadStats() }, [loadStats])
  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t) }, [load])

  const setF = (k, v) => { setFilters(p => ({ ...p, [k]: v })); setPage(1) }
  const hasActiveFilters = Object.values(filters).some(Boolean)

  const paginated = commissions.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div className="space-y-5">
      {paying && (
        <PayModal
          commission={paying}
          onClose={() => setPaying(null)}
          onDone={() => { setPaying(null); load(); loadStats() }}
        />
      )}

      <div>
        <h1 className="text-xl font-bold text-gray-900">Gestion des commissions</h1>
        <p className="text-sm text-gray-500 mt-0.5">Suivi des paiements aux agents et sous-agents</p>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="card flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center shrink-0 text-gray-500">
              <CreditCard size={18} />
            </div>
            <div>
              <p className="text-xs text-gray-500">Total dû</p>
              <p className="font-bold text-gray-900">{fmtCur(stats.total_du)}</p>
              <p className="text-xs text-gray-400 mt-0.5">{stats.nb_total} commission(s)</p>
            </div>
          </div>
          <div className="card flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0 text-emerald-600">
              <CheckCircle size={18} />
            </div>
            <div>
              <p className="text-xs text-gray-500">Payé</p>
              <p className="font-bold text-emerald-700">{fmtCur(stats.total_paye)}</p>
              <p className="text-xs text-gray-400 mt-0.5">{stats.nb_paye} réglée(s)</p>
            </div>
          </div>
          <div className="card flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center shrink-0 text-amber-500">
              <Clock size={18} />
            </div>
            <div>
              <p className="text-xs text-gray-500">Partiel</p>
              <p className="font-bold text-amber-600">{stats.nb_partiel} en cours</p>
            </div>
          </div>
          <div className="card flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center shrink-0 text-red-500">
              <AlertCircle size={18} />
            </div>
            <div>
              <p className="text-xs text-gray-500">Reste à payer</p>
              <p className="font-bold text-red-600">{fmtCur(stats.total_reste)}</p>
              <p className="text-xs text-gray-400 mt-0.5">{stats.nb_non_paye} non réglée(s)</p>
            </div>
          </div>
        </div>
      )}

      {/* Filtres */}
      <div className="card space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className="input pl-9" placeholder="Nom client, N° client, référence…"
              value={filters.search} onChange={e => setF('search', e.target.value)} />
          </div>
          <button onClick={() => setShowFilters(v => !v)}
            className={`btn btn-secondary gap-2 ${hasActiveFilters ? 'ring-2 ring-blue-300' : ''}`}>
            <Filter size={15} />Filtres
            <ChevronDown size={14} className={`transition-transform ${showFilters ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {showFilters && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-3 border-t border-gray-100">
            <div>
              <label className="label">Agent</label>
              <select className="input" value={filters.agent_id} onChange={e => setF('agent_id', e.target.value)}>
                <option value="">Tous les agents</option>
                {agents.map(a => <option key={a.id} value={a.id}>{a.prenom} {a.nom}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Statut</label>
              <select className="input" value={filters.statut} onChange={e => setF('statut', e.target.value)}>
                <option value="">Tous</option>
                {Object.entries(STATUTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
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
              <button onClick={() => { setFilters({ search: '', statut: '', agent_id: '', date_debut: '', date_fin: '' }); setPage(1) }}
                className="col-span-2 md:col-span-4 btn btn-secondary btn-sm justify-center">
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
      ) : commissions.length === 0 ? (
        <div className="card text-center py-14">
          <CreditCard size={40} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">
            {hasActiveFilters ? 'Aucun résultat pour ces filtres' : 'Aucune commission enregistrée'}
          </p>
        </div>
      ) : (
        <div className="card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {['Agent','Type','Client','Dû','Payé','Solde','Statut','Date paiem.','Référence','Action'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {paginated.map(c => {
                  const solde = Number(c.montant_du) - Number(c.montant_paye)
                  const clientNom = c.client_type === 'physique'
                    ? `${c.client_prenom || ''} ${c.client_nom}`.trim()
                    : c.client_nom
                  return (
                    <tr key={c.id} className={`hover:bg-gray-50 transition-colors ${c.type === 'parent' ? 'bg-purple-50/20' : ''}`}>
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {c.agent_prenom} {c.agent_nom}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium
                          ${c.type === 'parent' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                          {c.type === 'parent' ? `Via ${c.source_prenom || ''} ${c.source_nom || ''}`.trim() : 'Direct'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {c.client_numero && (
                          <span className="font-mono text-xs text-blue-600 mr-1.5">#{c.client_numero}</span>
                        )}
                        <span className="text-gray-800">{clientNom}</span>
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900">{fmtCur(c.montant_du)}</td>
                      <td className="px-4 py-3 text-right font-medium text-emerald-700">{fmtCur(c.montant_paye)}</td>
                      <td className="px-4 py-3 text-right font-medium text-red-600">{solde > 0 ? fmtCur(solde) : '—'}</td>
                      <td className="px-4 py-3"><StatutBadge statut={c.statut} /></td>
                      <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{fmtDate(c.date_paiement)}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs max-w-[120px] truncate" title={c.reference_paiement}>
                        {c.reference_paiement || '—'}
                      </td>
                      <td className="px-4 py-3">
                        {c.statut !== 'paye' && (
                          <button
                            onClick={() => setPaying(c)}
                            className="btn btn-primary btn-sm whitespace-nowrap"
                          >
                            <CreditCard size={13} />Payer
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 pb-4">
            <Pagination page={page} totalPages={Math.ceil(commissions.length / PAGE_SIZE)} total={commissions.length} onPageChange={setPage} />
          </div>
        </div>
      )}
    </div>
  )
}
