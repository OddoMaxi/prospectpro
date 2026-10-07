import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FileText, RefreshCw, Zap, TrendingUp, Target, Wallet, Users, CalendarClock } from 'lucide-react'
import { api } from '../../api'
import { useExercice } from '../../context/ExerciceContext'
import { usePeriod, PeriodSelector, Kpi, ObjectifsTable, TrendChart } from '../../components/dashboard'
import { Spinner, ExportButtons } from '../../components/ui'
import { exportExcel, exportPdf } from '../../utils/export'
import { fmtMoney, fmtNum, fmtPct, personName, variation } from '../../utils/format'

const CLASSEMENT = [
  { label: 'Agent', value: a => personName(a) },
  { label: 'Équipe', value: a => (a.parent_agent_id ? `Junior de ${personName(a, 'parent_')}` : 'Sénior') },
  { label: 'Contrats', value: 'realise_nb', type: 'number' },
  { label: 'Objectif (nb)', value: 'objectif_nb', type: 'number' },
  { label: 'Atteinte nb', value: 'atteinte_nb', type: 'pct' },
  { label: 'Prime pure', value: 'realise_montant', type: 'money' },
  { label: 'Objectif (montant)', value: 'objectif_montant', type: 'money' },
  { label: 'Atteinte montant', value: 'atteinte_montant', type: 'pct' },
]

export default function AdminDashboard() {
  const { annee } = useExercice()
  const period = usePeriod(annee, 'annee')
  const [filters, setFilters] = useState({ agent_id: '', equipe_id: '', branche_id: '', product_id: '' })
  const [agents, setAgents] = useState([])
  const [branches, setBranches] = useState([])
  const [products, setProducts] = useState([])
  const [d, setD] = useState(null)

  useEffect(() => {
    api.get('/agents').then(r => setAgents(r.data))
    api.get('/branches').then(r => setBranches(r.data))
    api.get('/products').then(r => setProducts(r.data))
  }, [])
  useEffect(() => {
    setD(null)
    api.get('/stats/dashboard', { params: { ...period.params, ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) } }).then(r => setD(r.data))
  }, [period.debut, period.fin, period.type, filters])
  const setF = (k, v) => setFilters(p => ({ ...p, [k]: v, ...(k === 'agent_id' && v ? { equipe_id: '' } : {}), ...(k === 'equipe_id' && v ? { agent_id: '' } : {}) }))

  const seniors = agents.filter(a => !a.parent_agent_id)
  const c = d?.courant, p = d?.precedente, n1 = d?.n_moins_1

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Tableau de bord</h1>
          <p className="text-sm text-gray-500">{period.label} · comparaison avec la période précédente et la même période N-1</p>
        </div>
        <PeriodSelector period={period} />
      </div>

      <div className="card p-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
        <select className="input" value={filters.agent_id} onChange={e => setF('agent_id', e.target.value)}>
          <option value="">Tous les agents</option>
          {agents.map(a => <option key={a.id} value={a.id}>{personName(a)}</option>)}
        </select>
        <select className="input" value={filters.equipe_id} onChange={e => setF('equipe_id', e.target.value)}>
          <option value="">Toutes les équipes</option>
          {seniors.map(a => <option key={a.id} value={a.id}>Équipe {personName(a)}</option>)}
        </select>
        <select className="input" value={filters.branche_id} onChange={e => setF('branche_id', e.target.value)}>
          <option value="">Toutes les branches</option>
          {branches.map(b => <option key={b.id} value={b.id}>{b.nom}</option>)}
        </select>
        <select className="input" value={filters.product_id} onChange={e => setF('product_id', e.target.value)}>
          <option value="">Tous les produits</option>
          {products.filter(x => !filters.branche_id || x.branche_id === filters.branche_id).map(x => <option key={x.id} value={x.id}>{x.nom}</option>)}
        </select>
      </div>

      {!d ? <Spinner /> : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Kpi title="Production (souscriptions)" icon={FileText} value={fmtMoney(c.production.prime_ttc)} sub={`${fmtNum(c.production.nb)} contrat(s) souscrit(s)`}
              cur={c.production.prime_ttc} prev={p.production.prime_ttc} n1={n1.production.prime_ttc} />
            <Kpi title="Renouvellements" icon={RefreshCw} tone="green" value={fmtNum(c.renouvellements.nb)}
              sub={`Taux : ${fmtPct(c.renouvellements.taux)} (${c.renouvellements.renouveles}/${c.renouvellements.echus} échus)`}
              cur={c.renouvellements.nb} prev={p.renouvellements.nb} n1={n1.renouvellements.nb} />
            <Kpi title="Renouvellements anticipés" icon={Zap} tone="purple" value={fmtNum(c.renouvellements.anticipes)}
              sub="payés au moins un mois avant l'échéance" cur={c.renouvellements.anticipes} prev={p.renouvellements.anticipes} n1={n1.renouvellements.anticipes} />
            <Kpi title="Croissance de la production" icon={TrendingUp} tone="orange"
              value={fmtPct(variation(c.production.prime_ttc, p.production.prime_ttc))} sub={`vs N-1 : ${fmtPct(variation(c.production.prime_ttc, n1.production.prime_ttc))}`} />
            <Kpi title="Atteinte des objectifs" icon={Target} value={fmtPct(d.objectifs.global?.atteinte_montant)}
              sub={d.objectifs.global ? `${fmtMoney(d.objectifs.global.realise_montant)} / ${fmtMoney(d.objectifs.global.objectif_montant)} (prime pure)` : 'Aucun objectif'} />
            <Kpi title="Commissions dues" icon={Wallet} tone="green" value={fmtMoney(c.commissions.dues)}
              sub={`dont performance ${fmtMoney(c.commissions.performance)}${c.commissions.retrocession ? ` · rétrocessions ${fmtMoney(c.commissions.retrocession)}` : ''}`}
              cur={c.commissions.dues} prev={p.commissions.dues} n1={n1.commissions.dues} />
            <Kpi title="Commissions payées / reste" icon={Wallet} tone="orange" value={fmtMoney(c.commissions.payees)}
              sub={`Reste à payer (toutes factures) : ${fmtMoney(d.commissions_reste_a_payer)}`} cur={c.commissions.payees} prev={p.commissions.payees} n1={n1.commissions.payees} />
            <Kpi title="Pipeline" icon={Users} tone="purple" value={`${fmtNum(c.pipeline.convertis)} / ${fmtNum(c.pipeline.crees)}`}
              sub={`convertis / créés · taux ${fmtPct(c.pipeline.taux)}`} cur={c.pipeline.convertis} prev={p.pipeline.convertis} n1={n1.pipeline.convertis} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="card lg:col-span-2">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">Production mensuelle (prime TTC) — {annee} vs {annee - 1}</h2>
              <TrendChart data={d.tendance} annee={annee} />
            </div>
            <div className="card">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2"><CalendarClock size={15} />Échéances à venir</h2>
                <Link to="/admin/echeances" className="text-xs text-blue-600 hover:underline">Voir</Link>
              </div>
              {[['Sous 30 jours', d.echeances.j30, 'bg-red-50 text-red-700'], ['31 à 60 jours', d.echeances.j60, 'bg-amber-50 text-amber-700'], ['61 à 90 jours', d.echeances.j90, 'bg-blue-50 text-blue-700']].map(([l, n, cls]) => (
                <div key={l} className={`flex items-center justify-between rounded-lg px-3 py-2.5 mb-2 ${cls}`}><span className="text-sm">{l}</span><span className="text-lg font-bold">{n}</span></div>
              ))}
              <p className="text-xs text-gray-500 mt-2">Prime TTC à renouveler sous 90 jours : <strong>{fmtMoney(d.echeances.prime_ttc_90)}</strong></p>
              <p className="text-xs text-gray-500 mt-1">Encaissements de la période : <strong>{fmtMoney(c.encaissements)}</strong></p>
            </div>
          </div>

          <div className="card">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h2 className="text-sm font-semibold text-gray-700">Classement et atteinte des objectifs (agents et produits actifs)</h2>
              <ExportButtons disabled={!d.objectifs.agents.length}
                onExcel={() => exportExcel({ filename: 'classement_agents', columns: CLASSEMENT, rows: d.objectifs.agents })}
                onPdf={() => exportPdf({ filename: 'classement_agents', title: 'Classement des agents', subtitle: period.label, columns: CLASSEMENT, rows: d.objectifs.agents })} />
            </div>
            <ObjectifsTable data={d.objectifs} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {[['Par produit (actifs)', d.par_produit], ['Par branche', d.par_branche]].map(([title, rows]) => (
              <div key={title} className="card overflow-x-auto">
                <h2 className="text-sm font-semibold text-gray-700 mb-3">{title}</h2>
                {rows.length === 0 ? <p className="text-sm text-gray-400">Aucune opération sur la période</p> : (
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-gray-100 text-left text-xs text-gray-500 uppercase">
                      <th className="pb-2 font-medium" /><th className="pb-2 font-medium text-right">Souscriptions</th><th className="pb-2 font-medium text-right">Renouvellements</th>
                    </tr></thead>
                    <tbody className="divide-y divide-gray-50">
                      {rows.map(r => (
                        <tr key={r.id || r.nom}>
                          <td className="py-2 font-medium">{r.nom}</td>
                          <td className="py-2 text-right tabular-nums">{fmtMoney(r.prime_souscriptions)}<span className="block text-[11px] text-gray-400">{r.nb_souscriptions} contrat(s)</span></td>
                          <td className="py-2 text-right tabular-nums">{fmtMoney(r.prime_renouvellements)}<span className="block text-[11px] text-gray-400">{r.nb_renouvellements} renouv.</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
