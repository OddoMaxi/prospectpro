// Briques communes aux tableaux de bord administrateur et commercial
import { useEffect, useState } from 'react'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from 'recharts'
import { periodRange, currentIndex } from '../context/ExerciceContext'
import { fmtMoney, fmtNum, fmtPct, fmtMoisCourt, personName, variation } from '../utils/format'

const MOIS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']
const TYPES = { mois: 'Mois', trimestre: 'Trimestre', semestre: 'Semestre', annee: 'Année', personnalise: 'Dates' }

// Période dans l'exercice ; renvoie { debut, fin, type, label }
export function usePeriod(annee, defaultType = 'annee') {
  const [type, setType] = useState(defaultType)
  const [index, setIndex] = useState(() => currentIndex(defaultType, annee))
  const [custom, setCustom] = useState({ debut: `${annee}-01-01`, fin: `${annee}-12-31` })
  useEffect(() => {
    setIndex(currentIndex(type, annee))
    setCustom({ debut: `${annee}-01-01`, fin: `${annee}-12-31` })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [annee])
  const r = type === 'personnalise' ? custom : periodRange(type, annee, index)
  const label = type === 'mois' ? `${MOIS[index - 1]} ${annee}` : type === 'trimestre' ? `T${index} ${annee}` : type === 'semestre' ? `S${index} ${annee}` : type === 'annee' ? `Année ${annee}` : 'Période personnalisée'
  return {
    ...r, type, label, index, custom,
    setType: t => { setType(t); setIndex(currentIndex(t, annee)) },
    setIndex, setCustom,
    params: { date_debut: r.debut, date_fin: r.fin, periode_type: type },
  }
}

export function PeriodSelector({ period, types = Object.keys(TYPES) }) {
  const options = { mois: MOIS.map((m, i) => [i + 1, m]), trimestre: [1, 2, 3, 4].map(i => [i, `T${i}`]), semestre: [[1, 'S1'], [2, 'S2']] }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex rounded-lg bg-gray-100 p-0.5">
        {types.map(t => (
          <button key={t} onClick={() => period.setType(t)} className={`px-3 py-1.5 text-xs font-medium rounded-md ${period.type === t ? 'bg-white shadow text-blue-700' : 'text-gray-600'}`}>{TYPES[t]}</button>
        ))}
      </div>
      {options[period.type] && (
        <select className="input w-auto py-1.5" value={period.index} onChange={e => period.setIndex(Number(e.target.value))}>
          {options[period.type].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      )}
      {period.type === 'personnalise' && (
        <>
          <input type="date" className="input w-auto py-1.5" value={period.custom.debut} onChange={e => period.setCustom(c => ({ ...c, debut: e.target.value }))} />
          <input type="date" className="input w-auto py-1.5" value={period.custom.fin} onChange={e => period.setCustom(c => ({ ...c, fin: e.target.value }))} />
        </>
      )}
    </div>
  )
}

export function Delta({ cur, base, label }) {
  const v = variation(cur, base)
  if (v === null) return <span className="text-[11px] text-gray-400">{label} : —</span>
  const Icon = v > 0 ? TrendingUp : v < 0 ? TrendingDown : Minus
  const cls = v > 0 ? 'text-emerald-600' : v < 0 ? 'text-red-600' : 'text-gray-500'
  return <span className={`inline-flex items-center gap-0.5 text-[11px] font-medium ${cls}`}><Icon size={11} />{v > 0 ? '+' : ''}{fmtPct(v)} <span className="text-gray-400 font-normal ml-0.5">{label}</span></span>
}

// Carte indicateur avec comparaison à la période précédente et à N-1
export function Kpi({ title, value, sub, cur, prev, n1, icon: Icon, tone = 'blue' }) {
  const tones = { blue: 'bg-blue-50 text-blue-600', green: 'bg-emerald-50 text-emerald-600', purple: 'bg-purple-50 text-purple-600', orange: 'bg-orange-50 text-orange-600', red: 'bg-red-50 text-red-600' }
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-gray-500">{title}</p>
        {Icon && <span className={`w-8 h-8 rounded-lg flex items-center justify-center ${tones[tone]}`}><Icon size={16} /></span>}
      </div>
      <p className="text-xl font-bold text-gray-900 mt-1 tabular-nums">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
      {cur !== undefined && (
        <div className="flex flex-wrap gap-x-3 mt-2">
          {prev !== undefined && <Delta cur={cur} base={prev} label="vs préc." />}
          {n1 !== undefined && <Delta cur={cur} base={n1} label="vs N-1" />}
        </div>
      )}
    </div>
  )
}

export function Progress({ value }) {
  const v = Math.min(100, Math.max(0, Number(value) || 0))
  const cls = v >= 100 ? 'bg-emerald-500' : v >= 70 ? 'bg-blue-500' : v >= 40 ? 'bg-amber-500' : 'bg-red-500'
  return <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className={`h-full ${cls}`} style={{ width: `${v}%` }} /></div>
}

export function ObjectifsTable({ data, showTeam = true }) {
  if (!data?.agents?.length) return <p className="text-sm text-gray-400 py-6 text-center">Aucun agent actif sur ce périmètre</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="border-b border-gray-100 text-left text-xs text-gray-500 uppercase">
          <th className="pb-2 font-medium">#</th><th className="pb-2 font-medium">Agent</th>
          {showTeam && <th className="pb-2 font-medium hidden md:table-cell">Équipe</th>}
          <th className="pb-2 font-medium text-right">Contrats</th><th className="pb-2 font-medium w-32 hidden sm:table-cell">Atteinte (nb)</th>
          <th className="pb-2 font-medium text-right">Prime pure</th><th className="pb-2 font-medium w-32 hidden sm:table-cell">Atteinte (montant)</th>
        </tr></thead>
        <tbody className="divide-y divide-gray-50">
          {data.agents.map((a, i) => (
            <tr key={a.id}>
              <td className="py-2 text-gray-400">{i + 1}</td>
              <td className="py-2 font-medium">{personName(a)}</td>
              {showTeam && <td className="py-2 text-xs text-gray-500 hidden md:table-cell">{a.parent_agent_id ? `Junior de ${personName(a, 'parent_')}` : 'Sénior'}</td>}
              <td className="py-2 text-right tabular-nums">{fmtNum(a.realise_nb)}<span className="text-gray-400"> / {fmtNum(a.objectif_nb)}</span></td>
              <td className="py-2 hidden sm:table-cell"><div className="flex items-center gap-2"><div className="flex-1"><Progress value={a.atteinte_nb} /></div><span className="text-xs w-12 text-right">{fmtPct(a.atteinte_nb, 0)}</span></div></td>
              <td className="py-2 text-right tabular-nums">{fmtMoney(a.realise_montant)}<span className="block text-[11px] text-gray-400">obj. {fmtMoney(a.objectif_montant)}</span></td>
              <td className="py-2 hidden sm:table-cell"><div className="flex items-center gap-2"><div className="flex-1"><Progress value={a.atteinte_montant} /></div><span className="text-xs w-12 text-right">{fmtPct(a.atteinte_montant, 0)}</span></div></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const short = n => (Math.abs(n) >= 1e6 ? `${(n / 1e6).toFixed(1).replace('.', ',')} M` : Math.abs(n) >= 1e3 ? `${Math.round(n / 1e3)} k` : String(n))

export function TrendChart({ data, annee }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data.map(d => ({ ...d, label: fmtMoisCourt(d.mois) }))} margin={{ left: 0, right: 8 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
        <YAxis tickFormatter={short} tick={{ fontSize: 11 }} width={48} />
        <Tooltip formatter={v => fmtMoney(v)} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="prime_ttc_n1" name={`${annee - 1}`} fill="#cbd5e1" radius={[3, 3, 0, 0]} />
        <Bar dataKey="prime_ttc" name={`${annee}`} fill="#2563eb" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
