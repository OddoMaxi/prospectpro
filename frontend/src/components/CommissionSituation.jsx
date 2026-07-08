import { useState } from 'react'
import { api } from '../api'
import toast from 'react-hot-toast'
import { TrendingDown, Download } from 'lucide-react'
import { exportCSV } from '../utils/csv'

const fmt = n => new Intl.NumberFormat('fr-FR').format(Math.round(n || 0))
const fmtDate = d => d ? new Date(d).toLocaleDateString('fr-FR') : '—'

// "Situation périodique" des paiements de commission — partagée entre l'espace
// agent (sans sélecteur d'agent, ses propres paiements) et l'espace admin
// (avec sélecteur d'agent, tous agents confondus par défaut).
export default function CommissionSituation({ agents, title }) {
  const showAgentSelector = Array.isArray(agents)
  const [sitFilters, setSitFilters] = useState({ agent_id: '', date_debut: '', date_fin: '' })
  const [situation, setSituation] = useState(null)
  const [sitLoading, setSitLoading] = useState(false)

  const setSF = (k, v) => setSitFilters(p => ({ ...p, [k]: v }))

  const loadSituation = () => {
    setSitLoading(true)
    const params = Object.fromEntries(Object.entries(sitFilters).filter(([, v]) => v))
    api.get('/commissions/situation', { params })
      .then(r => setSituation(r.data))
      .catch(() => toast.error('Erreur de chargement'))
      .finally(() => setSitLoading(false))
  }

  const handleExport = () => {
    if (!situation) return
    exportCSV(situation.payments, [
      { label: 'Date',      value: r => fmtDate(r.date_paiement) },
      ...(showAgentSelector ? [{ label: 'Agent', value: r => `${r.agent_prenom || ''} ${r.agent_nom || ''}`.trim() }] : []),
      { label: 'Client',    value: r => r.client_type === 'physique' ? `${r.client_prenom || ''} ${r.client_nom}`.trim() : r.client_nom },
      { label: 'N° Client', value: 'client_numero' },
      { label: 'Référence', value: 'reference' },
      { label: 'Libellé',   value: 'libelle' },
      { label: 'Montant',   value: r => Math.round(r.montant || 0) },
      { label: 'Solde',     value: r => Math.round(r.solde || 0) },
    ], `situation_${sitFilters.date_debut || 'debut'}_${sitFilters.date_fin || 'fin'}.csv`)
  }

  return (
    <div className="space-y-4">
      <div className="card space-y-4">
        <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
          <TrendingDown size={16} className="text-blue-600" />
          {title}
        </h2>
        <div className={showAgentSelector ? 'grid grid-cols-1 md:grid-cols-4 gap-3 items-end' : 'grid grid-cols-1 md:grid-cols-3 gap-3 items-end'}>
          {showAgentSelector && (
            <div>
              <label className="label">Agent</label>
              <select className="input" value={sitFilters.agent_id} onChange={e => setSF('agent_id', e.target.value)}>
                <option value="">Tous les agents</option>
                {agents.map(a => <option key={a.id} value={a.id}>{a.prenom} {a.nom}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="label">Du</label>
            <input className="input" type="date" value={sitFilters.date_debut} onChange={e => setSF('date_debut', e.target.value)} />
          </div>
          <div>
            <label className="label">Au</label>
            <input className="input" type="date" value={sitFilters.date_fin} onChange={e => setSF('date_fin', e.target.value)} />
          </div>
          <button onClick={loadSituation} disabled={sitLoading} className="btn btn-primary justify-center">
            {sitLoading ? 'Chargement…' : 'Afficher'}
          </button>
        </div>
      </div>

      {!situation && (
        <div className="card text-center py-12 text-gray-400">
          <TrendingDown size={36} className="mx-auto mb-3 text-gray-200" />
          <p className="text-sm">
            {showAgentSelector
              ? 'Sélectionnez un agent et/ou une période puis cliquez sur Afficher'
              : 'Sélectionnez une période puis cliquez sur Afficher'}
          </p>
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
              {showAgentSelector && situation.payments[0] && (
                <>{situation.payments[0].agent_prenom} {situation.payments[0].agent_nom}{' '}</>
              )}
              <span className={showAgentSelector ? 'text-xs font-normal text-gray-400' : ''}>
                {situation.payments.length} paiement{situation.payments.length > 1 ? 's' : ''}
              </span>
            </p>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-500">
                Solde d'ouverture :{' '}
                <span className="font-semibold text-gray-900">{fmt(situation.initial_solde)}</span>
              </span>
              <button onClick={handleExport} className="btn btn-secondary btn-sm gap-1.5" title="Exporter en CSV">
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
  )
}
