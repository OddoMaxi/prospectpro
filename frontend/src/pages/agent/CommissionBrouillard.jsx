import { useEffect, useState, useCallback } from 'react'
import { api } from '../../api'
import toast from 'react-hot-toast'
import {
  Search, Filter, ChevronDown, X, CreditCard, CheckCircle,
  Clock, AlertCircle, FileText, TrendingDown, Download
} from 'lucide-react'
import Pagination from '../../components/Pagination'
import { exportCSV } from '../../utils/csv'

const PAGE_SIZE = 15
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

export default function CommissionBrouillard() {
  const [view, setView] = useState('brouillard')
  const [commissions, setCommissions] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState({ search: '', statut: '', date_debut: '', date_fin: '' })
  const [page, setPage] = useState(1)

  // Situation périodique
  const [sitFilters, setSitFilters] = useState({ date_debut: '', date_fin: '' })
  const [situation, setSituation] = useState(null)
  const [sitLoading, setSitLoading] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v))
    Promise.all([
      api.get('/commissions', { params }),
      api.get('/commissions/stats'),
    ]).then(([r, s]) => {
      setCommissions(r.data)
      setStats(s.data)
    }).finally(() => setLoading(false))
  }, [filters])

  useEffect(() => {
    if (view === 'brouillard') { const t = setTimeout(load, 300); return () => clearTimeout(t) }
  }, [load, view])

  const setF  = (k, v) => { setFilters(p => ({ ...p, [k]: v })); setPage(1) }
  const setSF = (k, v) => setSitFilters(p => ({ ...p, [k]: v }))
  const hasActiveFilters = Object.values(filters).some(Boolean)
  const paginated = commissions.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const handleExportBrouillard = () => {
    exportCSV(commissions, [
      { label: 'Date',           value: r => fmtDate(r.created_at) },
      { label: 'Client',         value: r => r.client_type === 'physique' ? `${r.client_prenom || ''} ${r.client_nom}`.trim() : r.client_nom },
      { label: 'N° Client',      value: 'client_numero' },
      { label: 'N° Contrat',     value: 'numero_contrat' },
      { label: 'Type',           value: r => r.type === 'parent' ? `Via ${r.source_prenom || ''} ${r.source_nom || ''}`.trim() : 'Directe' },
      { label: 'Commission due', value: r => Math.round(r.montant_du || 0) },
      { label: 'Montant reçu',   value: r => Math.round(r.montant_paye || 0) },
      { label: 'Solde',          value: r => Math.round(Math.max(0, Number(r.montant_du) - Number(r.montant_paye))) },
      { label: 'Statut',         value: r => STATUTS[r.statut]?.label || r.statut },
      { label: 'Date paiement',  value: r => fmtDate(r.date_paiement) },
      { label: 'Référence',      value: 'reference_paiement' },
    ], `commissions_${new Date().toISOString().split('T')[0]}.csv`)
  }

  const handleExportSituation = () => {
    if (!situation) return
    exportCSV(situation.payments, [
      { label: 'Date',      value: r => fmtDate(r.date_paiement) },
      { label: 'Client',    value: r => r.client_type === 'physique' ? `${r.client_prenom || ''} ${r.client_nom}`.trim() : r.client_nom },
      { label: 'N° Client', value: 'client_numero' },
      { label: 'Référence', value: 'reference' },
      { label: 'Libellé',   value: 'libelle' },
      { label: 'Montant',   value: r => Math.round(r.montant || 0) },
      { label: 'Solde',     value: r => Math.round(r.solde || 0) },
    ], `situation_${sitFilters.date_debut || 'debut'}_${sitFilters.date_fin || 'fin'}.csv`)
  }

  const loadSituation = () => {
    setSitLoading(true)
    const params = Object.fromEntries(Object.entries(sitFilters).filter(([, v]) => v))
    api.get('/commissions/situation', { params })
      .then(r => setSituation(r.data))
      .catch(() => toast.error('Erreur de chargement'))
      .finally(() => setSitLoading(false))
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <FileText size={22} className="text-blue-600" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">Mes commissions</h1>
            <p className="text-sm text-gray-500">État détaillé de vos commissions par client</p>
          </div>
        </div>
        <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
          <button
            onClick={() => setView('brouillard')}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              view === 'brouillard' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Brouillard
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

      {/* Statistiques */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="card p-4">
            <p className="text-xs text-gray-500 font-medium">Total dû</p>
            <p className="text-xl font-bold text-gray-900 mt-1">{fmt(stats.total_du)}</p>
            <p className="text-xs text-gray-400 mt-0.5">{stats.nb_total} entrée(s)</p>
          </div>
          <div className="card p-4">
            <p className="text-xs text-emerald-600 font-medium">Reçu</p>
            <p className="text-xl font-bold text-emerald-700 mt-1">{fmt(stats.total_paye)}</p>
            <p className="text-xs text-gray-400 mt-0.5">{stats.nb_paye} réglée(s)</p>
          </div>
          <div className="card p-4">
            <p className="text-xs text-amber-600 font-medium">En attente partiel</p>
            <p className="text-xl font-bold text-amber-600 mt-1">{stats.nb_partiel}</p>
            <p className="text-xs text-gray-400 mt-0.5">commission(s)</p>
          </div>
          <div className="card p-4 border border-red-100">
            <p className="text-xs text-red-600 font-medium">Reste à percevoir</p>
            <p className="text-xl font-bold text-red-600 mt-1">{fmt(stats.total_reste)}</p>
            <p className="text-xs text-gray-400 mt-0.5">{stats.nb_non_paye} non réglée(s)</p>
          </div>
        </div>
      )}

      {/* ===== VUE : BROUILLARD ===== */}
      {view === 'brouillard' && (
        <>
          <div className="card space-y-3">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input className="input pl-9" placeholder="Nom client, N° client…"
                  value={filters.search} onChange={e => setF('search', e.target.value)} />
              </div>
              <button onClick={() => setShowFilters(v => !v)}
                className={`btn btn-secondary gap-2 ${hasActiveFilters ? 'ring-2 ring-blue-300' : ''}`}>
                <Filter size={15} />Filtres
                <ChevronDown size={14} className={`transition-transform ${showFilters ? 'rotate-180' : ''}`} />
              </button>
              {commissions.length > 0 && (
                <button onClick={handleExportBrouillard} className="btn btn-secondary gap-2" title="Exporter en CSV">
                  <Download size={15} />
                </button>
              )}
            </div>

            {showFilters && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pt-3 border-t border-gray-100">
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
                    onClick={() => { setFilters({ search: '', statut: '', date_debut: '', date_fin: '' }); setPage(1) }}
                    className="col-span-2 md:col-span-3 btn btn-secondary btn-sm justify-center">
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
              <FileText size={40} className="text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">
                {hasActiveFilters ? 'Aucun résultat pour ces filtres' : 'Aucune commission enregistrée'}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Les commissions apparaissent automatiquement lors des conversions de prospects en clients.
              </p>
            </div>
          ) : (
            <div className="card overflow-hidden p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      {['Date','Client','Type','Contrat','Commission due','Montant reçu','Solde','Statut','Date paiem.','Référence'].map(h => (
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
                        <tr key={c.id} className={`transition-colors hover:bg-gray-50
                          ${c.statut === 'paye' ? 'bg-emerald-50/30' : ''}
                          ${c.statut === 'partiel' ? 'bg-amber-50/30' : ''}
                          ${c.type === 'parent' ? 'bg-purple-50/20' : ''}
                        `}>
                          <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{fmtDate(c.created_at)}</td>
                          <td className="px-4 py-3">
                            {c.client_numero && (
                              <span className="font-mono text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded mr-1.5">
                                #{c.client_numero}
                              </span>
                            )}
                            <span className="font-medium text-gray-900">{clientNom}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium
                              ${c.type === 'parent' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                              {c.type === 'parent'
                                ? `Via ${c.source_prenom || ''} ${c.source_nom || ''}`.trim()
                                : 'Directe'}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-gray-500">{c.numero_contrat || '—'}</td>
                          <td className="px-4 py-3 text-right font-bold text-gray-900 whitespace-nowrap">{fmt(c.montant_du)}</td>
                          <td className="px-4 py-3 text-right font-semibold text-emerald-700 whitespace-nowrap">{fmt(c.montant_paye)}</td>
                          <td className="px-4 py-3 text-right font-semibold whitespace-nowrap">
                            {solde > 0
                              ? <span className="text-red-600">{fmt(solde)}</span>
                              : <span className="text-emerald-600">—</span>}
                          </td>
                          <td className="px-4 py-3"><StatutBadge statut={c.statut} /></td>
                          <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{fmtDate(c.date_paiement)}</td>
                          <td className="px-4 py-3 text-gray-500 text-xs max-w-[120px] truncate" title={c.reference_paiement}>
                            {c.reference_paiement || '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
                      <td className="px-4 py-3 text-xs text-gray-500 uppercase" colSpan={4}>
                        Total ({commissions.length} entrée{commissions.length > 1 ? 's' : ''})
                      </td>
                      <td className="px-4 py-3 text-right text-gray-900 whitespace-nowrap">
                        {fmt(commissions.reduce((s, c) => s + Number(c.montant_du), 0))}
                      </td>
                      <td className="px-4 py-3 text-right text-emerald-700 whitespace-nowrap">
                        {fmt(commissions.reduce((s, c) => s + Number(c.montant_paye), 0))}
                      </td>
                      <td className="px-4 py-3 text-right text-red-600 whitespace-nowrap">
                        {fmt(commissions.reduce((s, c) => s + Math.max(0, Number(c.montant_du) - Number(c.montant_paye)), 0))}
                      </td>
                      <td colSpan={3} />
                    </tr>
                  </tfoot>
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
              Situation périodique de mes paiements
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
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
              <p className="text-sm">Sélectionnez une période puis cliquez sur Afficher</p>
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
                  {situation.payments.length} paiement{situation.payments.length > 1 ? 's' : ''}
                </p>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-500">
                    Solde d'ouverture :{' '}
                    <span className="font-semibold text-gray-900">{fmt(situation.initial_solde)}</span>
                  </span>
                  <button onClick={handleExportSituation} className="btn btn-secondary btn-sm gap-1.5" title="Exporter en CSV">
                    <Download size={13} />CSV
                  </button>
                </div>
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
                              <span className="font-mono text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded mr-1.5">
                                #{p.client_numero}
                              </span>
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
                        Total
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
