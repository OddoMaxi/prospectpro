import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api'
import { useAuth } from '../../context/AuthContext'
import StatCard from '../../components/StatCard'
import GlobalStatsDashboard from '../../components/GlobalStatsDashboard'
import { Users, UserCheck, TrendingUp, DollarSign, Target, Calendar, PlusCircle, ArrowRight, Banknote, UsersRound, Package } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'

const JUNIOR_PERIODS = [
  { value: 'mois',      label: 'Mois',      short: 'Ce mois' },
  { value: 'trimestre', label: 'Trimestre', short: 'Ce trimestre' },
  { value: 'semestre',  label: 'Semestre',  short: 'Ce semestre' },
  { value: 'annee',     label: 'Année',     short: 'Cette année' },
]

function MiniAchievementBar({ value, target }) {
  if (!target || target === 0) return <span className="text-xs text-gray-300">—</span>
  const pct = Math.min((value / target) * 100, 100)
  const barColor = pct >= 100 ? 'bg-emerald-500' : pct >= 70 ? 'bg-orange-400' : 'bg-blue-400'
  const textColor = pct >= 100 ? 'text-emerald-600 font-semibold' : pct >= 70 ? 'text-orange-500' : 'text-gray-500'
  return (
    <div className="flex items-center gap-1.5 min-w-[90px]">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs shrink-0 ${textColor}`}>{pct.toFixed(0)}%</span>
    </div>
  )
}

function JuniorsPerformanceTable() {
  const [data, setData] = useState(null)
  const [period, setPeriod] = useState('mois')

  useEffect(() => {
    api.get('/stats/sous-agents', { params: { period } }).then(r => setData(r.data)).catch(() => setData(null))
  }, [period])

  const sousAgents = data?.sous_agents || []
  if (data && sousAgents.length === 0) return null
  const currentPeriod = JUNIOR_PERIODS.find(p => p.value === period) || JUNIOR_PERIODS[0]

  return (
    <div className="card">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="font-semibold text-gray-800 flex items-center gap-2">
          <UsersRound size={18} className="text-purple-500" />
          Performance de mes commerciaux juniores
        </h2>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {JUNIOR_PERIODS.map(p => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                period === p.value ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {!data ? (
        <div className="flex justify-center py-6">
          <div className="w-6 h-6 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-gray-500 text-xs uppercase tracking-wide">
                <th className="pb-3 font-medium">Junior</th>
                <th className="pb-3 font-medium text-right">Total</th>
                <th className="pb-3 font-medium text-right">{currentPeriod.short}</th>
                <th className="pb-3 font-medium text-right">Clients</th>
                <th className="pb-3 font-medium text-right">Primes</th>
                <th className="pb-3 font-medium text-right">Atteinte prospects</th>
                <th className="pb-3 font-medium text-right">Atteinte primes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {sousAgents.map(a => (
                <tr key={a.id} className="hover:bg-gray-50">
                  <td className="py-3 font-medium text-gray-800">
                    {a.type_agent === 'morale' ? (a.raison_sociale || a.nom) : `${a.prenom} ${a.nom}`}
                  </td>
                  <td className="py-3 text-right">{fmt(a.total_prospects)}</td>
                  <td className="py-3 text-right font-medium text-blue-700">{fmt(a.period_prospects)}</td>
                  <td className="py-3 text-right text-emerald-600 font-medium">{fmt(a.total_clients)}</td>
                  <td className="py-3 text-right">
                    <span className="text-blue-700 font-medium">{fmt(a.prime_total)}</span>
                    {Number(a.prime_clients) > 0 && (
                      <div className="text-xs text-emerald-600">{fmt(a.prime_clients)} clients</div>
                    )}
                  </td>
                  <td className="py-3 pl-2">
                    <MiniAchievementBar value={Number(a.period_prospects)} target={Number(a.objectif_period_prospects)} />
                  </td>
                  <td className="py-3 pl-2">
                    <MiniAchievementBar value={Number(a.period_prime_total)} target={Number(a.objectif_period_primes)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const STATUS_LABELS = { prospect: 'Prospect', en_cours: 'En cours', client: 'Client', perdu: 'Perdu' }
const STATUS_COLORS = { prospect: '#3b82f6', en_cours: '#f59e0b', client: '#10b981', perdu: '#ef4444' }
const fmt = n => new Intl.NumberFormat('fr-FR').format(Math.round(n || 0))
const fmtDate = d => d ? new Date(d).toLocaleDateString('fr-FR') : '-'

const PERIODS = [
  { value: 'semaine',   label: 'Semaine' },
  { value: 'mois',      label: 'Mois' },
  { value: 'trimestre', label: 'Trimestre' },
  { value: 'semestre',  label: 'Semestre' },
  { value: 'annee',     label: 'Année' },
]

function getLevel(pct) {
  if (pct >= 100) return { label: 'Objectif dépassé !', color: 'text-emerald-600', bg: 'bg-emerald-500' }
  if (pct >= 80)  return { label: 'Excellent',          color: 'text-blue-600',    bg: 'bg-blue-500' }
  if (pct >= 60)  return { label: 'En bonne voie',      color: 'text-amber-600',   bg: 'bg-amber-500' }
  if (pct >= 30)  return { label: 'À améliorer',        color: 'text-orange-600',  bg: 'bg-orange-500' }
  return                  { label: 'Insuffisant',        color: 'text-red-600',     bg: 'bg-red-500' }
}

function AchievementBar({ label, value, max, fmtFn = fmt }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0
  const over = max > 0 && value > max
  const level = getLevel(over ? 100 : pct)
  return (
    <div>
      <div className="flex justify-between items-center mb-1.5">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <span className="text-sm font-bold text-gray-900">
          {fmtFn(value)}<span className="text-gray-400 font-normal"> / {fmtFn(max)}</span>
        </span>
      </div>
      <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${level.bg}`} style={{ width: `${Math.min(over ? 100 : pct, 100)}%` }} />
      </div>
      <div className="flex justify-between mt-1">
        <span className={`text-xs font-semibold ${level.color}`}>{level.label}</span>
        <span className="text-xs text-gray-500">{over ? '≥ 100%' : `${pct.toFixed(0)}%`}</span>
      </div>
    </div>
  )
}

const fmtAxisDay   = d => { if (!d) return ''; const [,, day] = d.split('-'); return day }
const fmtAxisMonth = m => { if (!m) return ''; const [y, mo] = m.split('-'); return `${mo}/${String(y).slice(2)}` }

export default function AgentDashboard() {
  const { user } = useAuth()
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState('mois')

  useEffect(() => {
    setLoading(true)
    api.get('/stats/agent', { params: { period } })
      .then(r => setStats(r.data))
      .finally(() => setLoading(false))
  }, [period])

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>
  if (!stats) return null

  const pieData = stats.by_status.map(s => ({ name: STATUS_LABELS[s.statut] || s.statut, value: s.count, color: STATUS_COLORS[s.statut] || '#6b7280' }))

  const isDaily = period === 'semaine' || period === 'mois'
  const trendData = stats.period_trend || []

  const hasObjectives = stats.objectif_period_prospects > 0 || stats.objectif_period_primes > 0 || stats.objectif_period_commissions > 0

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Bonjour, {user?.prenom} !</h1>
          <p className="text-gray-500 text-sm mt-0.5">Voici votre tableau de bord commercial</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
            {PERIODS.map(p => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  period === p.value
                    ? 'bg-white text-blue-700 shadow-sm font-semibold'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <Link to="/agent/prospects/create" className="btn btn-primary hidden sm:inline-flex">
            <PlusCircle size={16} />Nouveau prospect
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        <StatCard title="Total prospects"  value={fmt(stats.total_prospects)}   icon={Users}      color="blue" />
        <StatCard title="Période en cours" value={fmt(stats.period_prospects)}  icon={Calendar}   color="orange" />
        <StatCard title="Clients"          value={fmt(stats.total_clients)}     icon={UserCheck}  color="green" />
        <StatCard title="Taux conversion"  value={`${stats.conversion_rate}%`}  icon={TrendingUp} color="purple" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="card flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 bg-blue-50 text-blue-600">
            <Banknote size={22} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-gray-500 font-medium">Primes prévisionnelles (période)</p>
            <p className="text-lg font-bold text-gray-900 mt-0.5">{fmt(stats.period_prime_total)}</p>
            <p className="text-xs text-emerald-600 mt-0.5">Clients (total) : {fmt(stats.prime_clients)}</p>
          </div>
        </div>
        <div className="card flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 bg-green-50 text-green-600">
            <DollarSign size={22} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-gray-500 font-medium">Commission prévisionnelle (période)</p>
            <p className="text-lg font-bold text-gray-900 mt-0.5">{fmt(stats.period_commission_total)}</p>
            <p className="text-xs text-emerald-600 mt-0.5">Clients (total) : {fmt(stats.commission_clients)}</p>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        {/* Objectifs */}
        <div className="card">
          <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Target size={18} className="text-blue-500" />
            Atteinte des objectifs — {PERIODS.find(p => p.value === period)?.label}
          </h2>
          {hasObjectives ? (
            <div className="space-y-5">
              <AchievementBar
                label="Prospects"
                value={stats.period_prospects}
                max={stats.objectif_period_prospects}
              />
              <AchievementBar
                label="Primes prévisionnelles"
                value={stats.period_prime_total}
                max={stats.objectif_period_primes}
                fmtFn={fmt}
              />
              <AchievementBar
                label="Commissions prévisionnelles"
                value={stats.period_commission_total}
                max={stats.objectif_period_commissions}
                fmtFn={fmt}
              />
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-6">
              Aucun objectif défini. Contactez l'administrateur.
            </p>
          )}
        </div>

        {/* Répartition par statut */}
        <div className="card">
          <h2 className="font-semibold text-gray-800 mb-4">Répartition par statut</h2>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={70}
                  label={({ name, value }) => `${name}: ${value}`} labelLine={false} fontSize={11}>
                  {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : <p className="text-sm text-gray-400 text-center py-10">Aucune donnée</p>}
        </div>
      </div>

      {/* Activité */}
      <div className="card">
        <h2 className="font-semibold text-gray-800 mb-4">
          Activité — {PERIODS.find(p => p.value === period)?.label}
        </h2>
        {trendData.length > 0 ? (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey={isDaily ? 'day' : 'month'}
                tick={{ fontSize: 11 }}
                tickFormatter={isDaily ? fmtAxisDay : fmtAxisMonth}
              />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip
                labelFormatter={v => isDaily
                  ? new Date(v).toLocaleDateString('fr-FR')
                  : fmtAxisMonth(v)
                }
              />
              <Bar dataKey="count" fill="#3b82f6" radius={[4,4,0,0]} name="Prospects" />
            </BarChart>
          </ResponsiveContainer>
        ) : <p className="text-sm text-gray-400 text-center py-10">Aucune activité sur cette période</p>}
      </div>

      {/* Statistiques par produit */}
      {stats.by_product?.length > 0 && (
        <div className="card">
          <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Package size={18} className="text-blue-500" />
            Statistiques par produit
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 pr-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Produit</th>
                  <th className="text-right py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Prospects</th>
                  <th className="text-right py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Clients</th>
                  <th className="text-right py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Prime totale</th>
                  <th className="text-right py-2 pl-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Commission</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {stats.by_product.map(p => (
                  <tr key={p.product_id} className="hover:bg-gray-50 transition-colors">
                    <td className="py-3 pr-4">
                      <span className="font-medium text-gray-900">{p.product_nom}</span>
                      <span className="ml-2 text-xs text-gray-400">{p.product_taux}%</span>
                    </td>
                    <td className="py-3 px-3 text-right font-medium text-gray-700">{fmt(p.total_prospects)}</td>
                    <td className="py-3 px-3 text-right">
                      <span className="font-medium text-emerald-600">{fmt(p.total_clients)}</span>
                    </td>
                    <td className="py-3 px-3 text-right font-medium text-gray-700">{fmt(p.prime_total)}</td>
                    <td className="py-3 pl-3 text-right font-semibold text-blue-600">{fmt(p.commission_total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200">
                  <td className="pt-3 pr-4 text-xs font-semibold text-gray-500 uppercase">Total</td>
                  <td className="pt-3 px-3 text-right font-bold text-gray-900">
                    {fmt(stats.by_product.reduce((s, p) => s + Number(p.total_prospects), 0))}
                  </td>
                  <td className="pt-3 px-3 text-right font-bold text-emerald-600">
                    {fmt(stats.by_product.reduce((s, p) => s + Number(p.total_clients), 0))}
                  </td>
                  <td className="pt-3 px-3 text-right font-bold text-gray-900">
                    {fmt(stats.by_product.reduce((s, p) => s + Number(p.prime_total), 0))}
                  </td>
                  <td className="pt-3 pl-3 text-right font-bold text-blue-600">
                    {fmt(stats.by_product.reduce((s, p) => s + Number(p.commission_total), 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Section sous-agents */}
      {stats.sous_agent_count > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-800 flex items-center gap-2">
              <UsersRound size={18} className="text-purple-500" />
              Mon équipe de sous-agents
            </h2>
            <Link to="/agent/sous-agents" className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1">
              Gérer <ArrowRight size={14} />
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-purple-50 rounded-xl p-4">
              <p className="text-xs text-purple-600 font-medium">Sous-agents actifs</p>
              <p className="text-2xl font-bold text-purple-900 mt-1">{fmt(stats.sous_agent_count)}</p>
            </div>
            <div className="bg-green-50 rounded-xl p-4">
              <p className="text-xs text-green-600 font-medium">Ma commission (tous)</p>
              <p className="text-xl font-bold text-green-900 mt-1">{fmt(stats.commission_sous_agents)}</p>
              <p className="text-xs text-green-600 mt-0.5">Clients : {fmt(stats.commission_sous_agents_clients)}</p>
            </div>
            <div className="bg-blue-50 rounded-xl p-4 flex flex-col justify-between">
              <p className="text-xs text-blue-600 font-medium">Taux de commission</p>
              <p className="text-xs text-blue-500 mt-1">Défini par l'administrateur pour chaque sous-agent</p>
              <Link to="/agent/sous-agents" className="mt-2 text-xs text-blue-600 font-medium hover:underline flex items-center gap-1">
                Voir le détail <ArrowRight size={12} />
              </Link>
            </div>
          </div>
        </div>
      )}

      {stats.sous_agent_count > 0 && <JuniorsPerformanceTable />}

      {stats.recents?.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-800">Derniers prospects</h2>
            <Link to="/agent/prospects" className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1">
              Voir tout <ArrowRight size={14} />
            </Link>
          </div>
          <div className="space-y-2">
            {stats.recents.map(p => (
              <div key={p.id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors">
                <div className={`w-2 h-2 rounded-full shrink-0 ${p.statut === 'client' ? 'bg-emerald-500' : p.statut === 'perdu' ? 'bg-red-400' : p.statut === 'en_cours' ? 'bg-yellow-400' : 'bg-blue-400'}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{p.nom}{p.prenom ? ` ${p.prenom}` : ''}</p>
                  <p className="text-xs text-gray-400">{fmtDate(p.date_prospection)}</p>
                </div>
                <span className="text-xs font-medium text-gray-500 shrink-0">{fmt(p.montant_potentiel)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tableau de bord de l'entreprise — mêmes indicateurs que l'administrateur */}
      <div className="pt-4 border-t border-gray-200">
        <GlobalStatsDashboard
          title="Tableau de bord de l'entreprise"
          subtitle="Vue globale de l'activité commerciale, identique à celle de l'administrateur"
        />
      </div>
    </div>
  )
}
