// Tableau de bord unique du commercial : performances, objectifs, échéances et commissions.
// Un Sénior bascule entre sa vue personnelle et la vue consolidée de son équipe.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Target, FileText, Users, RefreshCw, Wallet, CalendarClock, Plus } from 'lucide-react'
import { api } from '../../api'
import { useAuth } from '../../context/AuthContext'
import { useExercice } from '../../context/ExerciceContext'
import { usePeriod, PeriodSelector, Kpi, ObjectifsTable, Progress } from '../../components/dashboard'
import { Spinner } from '../../components/ui'
import { fmtMoney, fmtNum, fmtPct, fmtDate, fmtMois, personName } from '../../utils/format'

export default function AgentDashboard() {
  const { user } = useAuth()
  const { annee } = useExercice()
  const isSenior = !user.parent_agent_id
  const period = usePeriod(annee, 'mois')
  const [vue, setVue] = useState('moi')
  const [d, setD] = useState(null)
  const [ech, setEch] = useState(null)

  useEffect(() => {
    setD(null)
    api.get('/stats/dashboard', { params: { ...period.params, vue } }).then(r => setD(r.data))
  }, [period.debut, period.fin, period.type, vue])
  useEffect(() => { api.get('/contrats/echeances', { params: { jours: 60 } }).then(r => setEch(r.data)) }, [])

  const c = d?.courant, p = d?.precedente
  const me = d?.objectifs.agents.find(a => a.id === user.id)
  const obj = vue === 'equipe' ? d?.objectifs.global : me
  const mesEch = (ech || []).filter(e => vue === 'equipe' || e.agent_id === user.id).filter(e => e.jours_restants >= 0)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Bonjour {personName(user)}</h1>
          <p className="text-sm text-gray-500">{period.label} · comparaison avec la période précédente</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isSenior && (
            <div className="inline-flex rounded-lg bg-gray-100 p-0.5">
              {[['moi', 'Mes résultats'], ['equipe', 'Mon équipe']].map(([v, l]) => (
                <button key={v} onClick={() => setVue(v)} className={`px-3 py-1.5 text-xs font-medium rounded-md ${vue === v ? 'bg-white shadow text-blue-700' : 'text-gray-600'}`}>{l}</button>
              ))}
            </div>
          )}
          <PeriodSelector period={period} types={['mois', 'trimestre', 'annee']} />
        </div>
      </div>

      {!d ? <Spinner /> : (
        <>
          <div className="card">
            <h2 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2"><Target size={16} className="text-blue-600" />Atteinte des objectifs {vue === 'equipe' ? "de l'équipe" : ''}</h2>
            {!obj || (!obj.objectif_nb && !obj.objectif_montant) ? (
              <p className="text-sm text-gray-400">Aucun objectif fixé sur les produits actifs.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <div className="flex justify-between text-sm mb-1"><span>Contrats souscrits</span><span className="font-semibold">{fmtNum(obj.realise_nb)} / {fmtNum(obj.objectif_nb)}</span></div>
                  <Progress value={obj.atteinte_nb} /><p className="text-xs text-gray-500 mt-1">{fmtPct(obj.atteinte_nb)} atteint</p>
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1"><span>Prime pure</span><span className="font-semibold">{fmtMoney(obj.realise_montant)} / {fmtMoney(obj.objectif_montant)}</span></div>
                  <Progress value={obj.atteinte_montant} /><p className="text-xs text-gray-500 mt-1">{fmtPct(obj.atteinte_montant)} atteint</p>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Kpi title="Production" icon={FileText} value={fmtMoney(c.production.prime_ttc)} sub={`${fmtNum(c.production.nb)} contrat(s)`} cur={c.production.prime_ttc} prev={p.production.prime_ttc} />
            <Kpi title="Prospects / conversions" icon={Users} tone="purple" value={`${fmtNum(c.pipeline.crees)} / ${fmtNum(c.pipeline.convertis)}`} sub={`Taux de conversion ${fmtPct(c.pipeline.taux)}`} cur={c.pipeline.convertis} prev={p.pipeline.convertis} />
            <Kpi title="Renouvellements" icon={RefreshCw} tone="green" value={fmtNum(c.renouvellements.nb)} sub={`dont ${c.renouvellements.anticipes} anticipé(s)`} cur={c.renouvellements.nb} prev={p.renouvellements.nb} />
            <Kpi title={`Commissions de ${fmtMois(d.mois_courant)}`} icon={Wallet} tone="orange" value={fmtMoney(d.commissions_mois_courant)}
              sub={<>Reste à percevoir : <Link to="/agent/commissions" className="text-blue-600 hover:underline">{fmtMoney(d.commissions_reste_a_payer)}</Link></>} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="card">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2"><CalendarClock size={15} />Échéances à venir (60 jours)</h2>
                <Link to="/agent/echeances" className="text-xs text-blue-600 hover:underline">Échéancier</Link>
              </div>
              <div className="flex gap-2 mb-3 text-xs">
                {[[30, 'J-30', 'bg-red-50 text-red-700'], [45, 'J-45', 'bg-amber-50 text-amber-700'], [60, 'J-60', 'bg-yellow-50 text-yellow-700']].map(([j, l, cls], i, arr) => (
                  <span key={l} className={`px-2.5 py-1 rounded-full font-medium ${cls}`}>{l} : {mesEch.filter(e => e.jours_restants <= j && (i === 0 || e.jours_restants > arr[i - 1][0])).length}</span>
                ))}
              </div>
              {!ech ? <Spinner className="py-6" /> : mesEch.length === 0 ? <p className="text-sm text-gray-400">Aucune échéance dans les 60 jours.</p> : (
                <div className="divide-y divide-gray-50 max-h-72 overflow-y-auto">
                  {mesEch.slice(0, 15).map(e => (
                    <Link key={e.id} to={`/agent/contrats/${e.id}`} className="flex items-center justify-between py-2 hover:bg-gray-50 px-1 rounded">
                      <div><p className="text-sm font-medium">{personName(e, 'client_')}</p><p className="text-xs text-gray-400">{e.numero_contrat} · {fmtDate(e.date_echeance)}</p></div>
                      <span className={`text-xs font-semibold ${e.jours_restants <= 30 ? 'text-red-600' : 'text-amber-600'}`}>J-{e.jours_restants}</span>
                    </Link>
                  ))}
                </div>
              )}
              <p className="text-[11px] text-gray-400 mt-2">Un renouvellement payé au plus tard à J-30 ouvre droit à la prime de performance.</p>
            </div>

            {isSenior && vue === 'equipe' ? (
              <div className="card">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold text-gray-700">Mon équipe</h2>
                  <Link to="/agent/juniors/create" className="btn btn-secondary btn-sm"><Plus size={13} />Nouveau Junior</Link>
                </div>
                <ObjectifsTable data={d.objectifs} showTeam={false} />
              </div>
            ) : (
              <div className="card">
                <h2 className="text-sm font-semibold text-gray-700 mb-3">Mes commissions sur la période</h2>
                {[['Commissions classiques', c.commissions.commission], ['Primes de performance', c.commissions.performance], ['Rétrocessions', c.commissions.retrocession], ['Total acquis', c.commissions.dues], ['Payé sur la période', c.commissions.payees]].map(([l, v], i) => (
                  <div key={l} className={`flex justify-between py-2 text-sm ${i === 3 ? 'border-t border-gray-100 font-semibold' : ''}`}><span className="text-gray-600">{l}</span><span className={`tabular-nums ${v < 0 ? 'text-red-600' : ''}`}>{fmtMoney(v)}</span></div>
                ))}
                {isSenior && <p className="text-xs text-gray-400 mt-2">Inclut vos parts Sénior sur les ventes de vos Juniors.</p>}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
