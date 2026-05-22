import { useEffect, useState, useCallback } from 'react'
import { api } from '../../api'
import toast from 'react-hot-toast'
import {
  Search, Filter, ChevronDown, X, CreditCard, CheckCircle,
  Clock, AlertCircle, History, TrendingDown
} from 'lucide-react'
import Pagination from '../../components/Pagination'

const PAGE_SIZE = 10
const fmt = n => new Intl.NumberFormat('fr-FR').format(Math.round(n || 0))
const fmtDate = d => d ? new Date(d).toLocaleDateString('fr-FR') : '—'

const STATUTS = {
  non_paye: { label: 'Non payé',  cls: 'bg-red-100 text-red-700',         icon: AlertCircle },
  partiel:  { label: 'Partiel',   cls: 'bg-amber-100 text-amber-700',     icon: Clock },
  paye:     { label: 'Payé',      cls: 'bg-emerald-100 text-emerald-700', icon: CheckCircle },
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
    montant: String(Math.round(Math.max(0, reste))),
    date_paiement: new Date().toISOString().split('T')[0],
    reference: '',
    libelle: '',
  })
  const [payments, setPayments] = useState([])
  const [loadingPayments, setLoadingPayments] = useState(true)
  const [saving, setSaving] = useState(false)
  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => {
    api.get(`/commissions/${commission.id}/payments`)
      .then(r => setPayments(r.data))
      .catch(() => {})
      .finally(() => setLoadingPayments(false))
  }, [commission.id])

  const handleSubmit = async e => {
    e.preventDefault()
    setSaving(true)
    try {
      await api.patch(`/commissions/${commission.id}/pay`, {
        ...form,
        montant: Number(form.montant),
      })
      toast.success('Paiement enregistré')
      onDone()
    } catch (err) {
      toast.error(err.response?.data?.error || "Erreur lors de l'enregistrement")
    } finally { setSaving(false) }
  }

  const clientNom = commission.client_type === 'physique'
    ? `${commission.client_prenom || ''} ${commission.client_nom}`.trim()
    : commission.client_nom

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-5 border-b border-gray-100 flex items-start justify-between sticky top-0 bg-white z-10">
          <div>
            <h3 className="font-bold text-gray-900 flex items-center gap-2">
              <CreditCard size={18} className="text-blue-600" />
              Paiement de commission
            </h3>
            <p className="text-sm text-gray-500 mt-0.5">
              {commission.agent_prenom} {commission.agent_nom}
              {commission.type === 'parent' && (
                <span className="ml-1 text-xs text-purple-500">(commission parent)</span>
              )}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl font-bold leading-none">×</button>
        </div>

        <div className="p-5 space-y-4">
          {/* Résumé */}
          <div className="bg-gray-50 rounded-xl p-3 grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-xs text-gray-400">Client</p>
              <p className="font-semibold text-gray-800 text-sm truncate" title={clientNom}>
                {commission.client_numero && (
                  <span className="text-blue-600 text-xs mr-1">#{commission.client_numero}</span>
                )}
                {clientNom}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Total dû</p>
              <p className="font-bold text-gray-900 text-sm">{fmt(commission.montant_du)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Reste</p>
              <p className={`font-bold text-sm ${reste > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                {fmt(reste)}
              </p>
            </div>
          </div>

          {/* Historique des paiements */}
          {!loadingPayments && payments.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <History size={13} />
                Historique ({payments.length} paiement{payments.length > 1 ? 's' : ''})
              </p>
              <div className="overflow-x-auto rounded-xl border border-gray-100">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-gray-500">Date</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-500">Référence</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-500">Libellé</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-500">Montant</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {payments.map(p => (
                      <tr key={p.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{fmtDate(p.date_paiement)}</td>
                        <td className="px-3 py-2 text-gray-500">{p.reference || '—'}</td>
                        <td className="px-3 py-2 text-gray-600">{p.libelle || '—'}</td>
                        <td className="px-3 py-2 text-right font-semibold text-emerald-700">{fmt(p.montant)}</td>
                      </tr>
                    ))}
                    <tr className="bg-gray-50 font-semibold border-t border-gray-200">
                      <td colSpan={3} className="px-3 py-2 text-xs text-gray-500">Total payé</td>
                      <td className="px-3 py-2 text-right text-emerald-700">{fmt(commission.montant_paye)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Formulaire nouveau paiement ou message soldé */}
          {reste > 0 ? (
            <form onSubmit={handleSubmit} className="space-y-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Nouveau paiement</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Date *</label>
                  <input className="input" type="date" value={form.date_paiement}
                    onChange={e => setF('date_paiement', e.target.value)} required />
                </div>
                <div>
                  <label className="label">Montant *</label>
                  <input className="input" type="number" min="0.01" step="any" value={form.montant}
                    onChange={e => setF('montant', e.target.value)} required />
                </div>
              </div>
              <div>
                <label className="label">Référence</label>
                <input className="input" placeholder="N° virement, chèque…" value={form.reference}
                  onChange={e => setF('reference', e.target.value)} />
              </div>
              <div>
                <label className="label">Libellé</label>
                <input className="input" placeholder="Description du paiement…" value={form.libelle}
                  onChange={e => setF('libelle', e.target.value)} />
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={onClose} className="btn btn-secondary flex-1">Annuler</button>
                <button type="submit" disabled={saving} className="btn btn-primary flex-1">
                  {saving ? 'Enregistrement…' : 'Enregistrer'}
                </button>
              </div>
            </form>
          ) : (
            <div className="text-center py-4">
              <CheckCircle size={24} className="text-emerald-500 mx-auto mb-2" />
              <p className="text-sm font-medium text-emerald-700">Commission intégralement payée</p>
              <button onClick={onClose} className="btn btn-secondary mt-3">Fermer</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function CommissionList() {
  const [view, setView] = useState('commissions')
  const [commissions, setCommissions] = useState([])
  const [stats, setStats] = useState(null)
  const [agents, setAgents] = useState([])
  const [loading, setLoading] = useState(true)
  const [paying, setPaying] = useState(null)
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState({ search: '', statut: '', agent_id: '', date_debut: '', date_fin: '' })
  const [page, setPage] = useState(1)

  // Situation périodique
  const [sitFilters, setSitFilters] = useState({ agent_id: '', date_debut: '', date_fin: '' })
  const [situation, setSituation] = useState(null)
  const [sitLoading, setSitLoading] = useState(false)

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
  useEffect(() => {
    if (view === 'commissions') { const t = setTimeout(load, 300); return () => clearTimeout(t) }
  }, [load, view])

  const setF  = (k, v) => { setFilters(p => ({ ...p, [k]: v })); setPage(1) }
  const setSF = (k, v) => setSitFilters(p => ({ ...p, [k]: v }))
  const hasActiveFilters = Object.values(filters).some(Boolean)

  const loadSituation = () => {
    setSitLoading(true)
    const params = Object.fromEntries(Object.entries(sitFilters).filter(([, v]) => v))
    api.get('/commissions/situation', { params })
      .then(r => setSituation(r.data))
      .catch(() => toast.error('Erreur de chargement'))
      .finally(() => setSitLoading(false))
  }

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

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Gestion des commissions</h1>
          <p className="text-sm text-gray-500 mt-0.5">Suivi des paiements aux agents</p>
        </div>
        <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
          <button
            onClick={() => setView('commissions')}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              view === 'commissions' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Commissions
          </button>
          <button
            onClick={() => setView('situation')}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              view === 'situation' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Situation périodique
          </button>
        </div>
      </div>

      {/* Statistiques globales */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="card flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center shrink-0 text-gray-500">
              <CreditCard size={18} />
            </div>
            <div>
              <p className="text-xs text-gray-500">Total dû</p>
              <p className="font-bold text-gray-900">{fmt(stats.total_du)}</p>
              <p className="text-xs text-gray-400 mt-0.5">{stats.nb_total} commission(s)</p>
            </div>
          </div>
          <div className="card flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0 text-emerald-600">
              <CheckCircle size={18} />
            </div>
            <div>
              <p className="text-xs text-gray-500">Payé</p>
              <p className="font-bold text-emerald-700">{fmt(stats.total_paye)}</p>
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
              <p className="font-bold text-red-600">{fmt(stats.total_reste)}</p>
              <p className="text-xs text-gray-400 mt-0.5">{stats.nb_non_paye} non réglée(s)</p>
            </div>
          </div>
        </div>
      )}

      {/* ===== VUE : COMMISSIONS ===== */}
      {view === 'commissions' && (
        <>
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
                  <button
                    onClick={() => { setFilters({ search: '', statut: '', agent_id: '', date_debut: '', date_fin: '' }); setPage(1) }}
                    className="col-span-2 md:col-span-4 btn btn-secondary btn-sm justify-center">
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
                      {['Agent','Type','Client','Dû','Payé','Solde','Statut','Dernier paiem.','Référence','Action'].map(h => (
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
                          <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">
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
                          <td className="px-4 py-3 text-right font-medium text-gray-900 whitespace-nowrap">{fmt(c.montant_du)}</td>
                          <td className="px-4 py-3 text-right font-medium text-emerald-700 whitespace-nowrap">{fmt(c.montant_paye)}</td>
                          <td className="px-4 py-3 text-right font-medium text-red-600 whitespace-nowrap">{solde > 0 ? fmt(solde) : '—'}</td>
                          <td className="px-4 py-3"><StatutBadge statut={c.statut} /></td>
                          <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{fmtDate(c.date_paiement)}</td>
                          <td className="px-4 py-3 text-gray-500 text-xs max-w-[120px] truncate" title={c.reference_paiement}>
                            {c.reference_paiement || '—'}
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => setPaying(c)}
                              className="btn btn-primary btn-sm whitespace-nowrap"
                            >
                              <CreditCard size={13} />
                              {c.statut === 'paye' ? 'Détails' : 'Payer'}
                            </button>
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
        </>
      )}

      {/* ===== VUE : SITUATION PÉRIODIQUE ===== */}
      {view === 'situation' && (
        <div className="space-y-4">
          <div className="card space-y-4">
            <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <TrendingDown size={16} className="text-blue-600" />
              Situation périodique des paiements par agent
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
              <div>
                <label className="label">Agent</label>
                <select className="input" value={sitFilters.agent_id} onChange={e => setSF('agent_id', e.target.value)}>
                  <option value="">Tous les agents</option>
                  {agents.map(a => <option key={a.id} value={a.id}>{a.prenom} {a.nom}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Du</label>
                <input className="input" type="date" value={sitFilters.date_debut} onChange={e => setSF('date_debut', e.target.value)} />
              </div>
              <div>
                <label className="label">Au</label>
                <input className="input" type="date" value={sitFilters.date_fin} onChange={e => setSF('date_fin', e.target.value)} />
              </div>
              <button
                onClick={loadSituation}
                disabled={sitLoading}
                className="btn btn-primary justify-center"
              >
                {sitLoading ? 'Chargement…' : 'Afficher'}
              </button>
            </div>
          </div>

          {!situation && (
            <div className="card text-center py-12 text-gray-400">
              <TrendingDown size={36} className="mx-auto mb-3 text-gray-200" />
              <p className="text-sm">Sélectionnez un agent et/ou une période puis cliquez sur Afficher</p>
            </div>
          )}

          {situation && situation.payments.length === 0 && (
            <div className="card text-center py-12">
              <TrendingDown size={36} className="text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">Aucun paiement pour cette période</p>
            </div>
          )}

          {situation && situation.payments.length > 0 && (
            <div className="card overflow-hidden p-0">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
                <p className="text-sm font-semibold text-gray-700">
                  {situation.payments[0]?.agent_prenom} {situation.payments[0]?.agent_nom}
                  <span className="ml-2 text-xs font-normal text-gray-400">
                    {situation.payments.length} paiement{situation.payments.length > 1 ? 's' : ''}
                  </span>
                </p>
                <span className="text-xs text-gray-500">
                  Solde d'ouverture :{' '}
                  <span className="font-semibold text-gray-900">{fmt(situation.initial_solde)}</span>
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      {['Date','Client','Référence','Libellé','Montant','Solde'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {situation.payments.map(p => {
                      const clientNom = p.client_type === 'physique'
                        ? `${p.client_prenom || ''} ${p.client_nom}`.trim()
                        : p.client_nom
                      return (
                        <tr key={p.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmtDate(p.date_paiement)}</td>
                          <td className="px-4 py-3">
                            {p.client_numero && (
                              <span className="font-mono text-xs text-blue-600 mr-1">#{p.client_numero}</span>
                            )}
                            <span className="text-gray-800">{clientNom}</span>
                          </td>
                          <td className="px-4 py-3 text-gray-500 text-xs">{p.reference || '—'}</td>
                          <td className="px-4 py-3 text-gray-600 text-xs">{p.libelle || '—'}</td>
                          <td className="px-4 py-3 text-right font-semibold text-emerald-700 whitespace-nowrap">{fmt(p.montant)}</td>
                          <td className="px-4 py-3 text-right font-semibold whitespace-nowrap">
                            <span className={p.solde > 0 ? 'text-red-600' : 'text-emerald-600'}>
                              {fmt(p.solde)}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
                      <td colSpan={4} className="px-4 py-3 text-xs text-gray-500 uppercase">
                        Total ({situation.payments.length} ligne{situation.payments.length > 1 ? 's' : ''})
                      </td>
                      <td className="px-4 py-3 text-right text-emerald-700 whitespace-nowrap">
                        {fmt(situation.payments.reduce((s, p) => s + Number(p.montant), 0))}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <span className={situation.payments.at(-1)?.solde > 0 ? 'text-red-600' : 'text-emerald-600'}>
                          {fmt(situation.payments.at(-1)?.solde ?? 0)}
                        </span>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
