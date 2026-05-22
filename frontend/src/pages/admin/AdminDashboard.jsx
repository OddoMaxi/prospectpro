import { useEffect, useState } from 'react'
import { api } from '../../api'
import StatCard from '../../components/StatCard'
import { Users, UserCheck, TrendingUp, DollarSign, BarChart2, Target, Banknote, Award, Package } from 'lucide-react'
import Pagination from '../../components/Pagination'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'

const PAGE_SIZE = 10
const PIE_COLORS = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6']
const fmt = n => new Intl.NumberFormat('fr-FR').format(Math.round(n || 0))
const fmtCur = n => fmt(n)

const PERIODS = [
  { value: 'mois',      label: 'Mois',      short: 'Ce mois' },
  { value: 'trimestre', label: 'Trimestre', short: 'Ce trimestre' },
  { value: 'semestre',  label: 'Semestre',  short: 'Ce semestre' },
  { value: 'annee',     label: 'Année',     short: 'Cette année' },
]

const SORT_KEYS = {
  nom:               (a, b) => `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`),
  total_prospects:   (a, b) => Number(b.total_prospects)   - Number(a.total_prospects),
  period_prospects:  (a, b) => Number(b.period_prospects)  - Number(a.period_prospects),
  total_clients:     (a, b) => Number(b.total_clients)     - Number(a.total_clients),
  prime_total:       (a, b) => Number(b.prime_total)       - Number(a.prime_total),
  commission_total:  (a, b) => Number(b.commission_total)  - Number(a.commission_total),
}

function SortTh({ label, sortKey, current, dir, onSort, className = '' }) {
  const active = current === sortKey
  return (
    <th
      className={`pb-3 font-medium cursor-pointer select-none hover:text-gray-800 transition-colors ${className}`}
      onClick={() => onSort(sortKey)}
    >
      <span className="flex items-center gap-1 justify-end">
        {label}
        <span className={`text-xs ${active ? 'text-blue-500' : 'text-gray-300'}`}>
          {active ? (dir === 'asc' ? '↑' : '↓') : '↕'}
        </span>
      </span>
    </th>
  )
}

function AchievementBar({ value, target }) {
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

export default function AdminDashboard() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState('mois')
  const [sortKey, setSortKey] = useState('total_prospects')
  const [sortDir, setSortDir] = useState('desc')
  const [page, setPage] = useState(1)

  useEffect(() => {
    setLoading(true)
    api.get('/stats/admin', { params: { period } })
      .then(r => setStats(r.data))
      .finally(() => setLoading(false))
  }, [period])

  const handleSort = key => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
    setPage(1)
  }

  const handlePeriodChange = p => { setPeriod(p); setPage(1) }

  if (!stats) return (
    <div className="flex justify-center py-20">
      <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const currentPeriod = PERIODS.find(p => p.value === period) || PERIODS[0]

  const sortedAgents = [...(stats.agent_stats || [])].sort((a, b) => {
    const cmp = SORT_KEYS[sortKey] ? SORT_KEYS[sortKey](a, b) : 0
    return sortDir === 'asc' ? -cmp : cmp
  })

  const totalPrimes      = sortedAgents.reduce((s, a) => s + Number(a.prime_total      || 0), 0)
  const totalCommissions = sortedAgents.reduce((s, a) => s + Number(a.commission_total || 0), 0)
  const totalPages       = Math.ceil(sortedAgents.length / PAGE_SIZE)
  const paginatedAgents  = sortedAgents.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Tableau de bord</h1>
        <p className="text-gray-500 text-sm mt-0.5">Vue globale de l'activité commerciale</p>
      </div>

      {/* Métriques globales */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard title="Agents actifs"       value={stats.total_agents}                    icon={Users}      color="blue" />
        <StatCard title="Total prospects"     value={fmt(stats.total_prospects)}            icon={BarChart2}  color="purple" />
        <StatCard title="Ce mois"             value={fmt(stats.monthly_prospects)}          icon={TrendingUp} color="orange" />
        <StatCard title="Clients"             value={fmt(stats.total_clients)}              icon={UserCheck}  color="green" />
        <StatCard title="Taux conversion"     value={`${stats.global_conversion_rate}%`}   icon={Target}     color="yellow" />
        <StatCard title="Commission totale"   value={fmtCur(stats.commission_total)}        icon={DollarSign} color="green" />
      </div>

      {/* Primes et commissions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="card bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-blue-600 uppercase tracking-wide mb-1">Total primes (portefeuille clients)</p>
              <p className="text-2xl font-bold text-blue-900">{fmtCur(stats.primes_clients)}</p>
              <p className="text-xs text-blue-500 mt-1">Primes prévisionnelles : {fmtCur(stats.primes_total)}</p>
            </div>
            <div className="w-10 h-10 bg-blue-200 rounded-xl flex items-center justify-center shrink-0">
              <Banknote size={20} className="text-blue-700" />
            </div>
          </div>
        </div>
        <div className="card bg-gradient-to-br from-emerald-50 to-emerald-100 border border-emerald-200">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-emerald-600 uppercase tracking-wide mb-1">Commissions à payer aux agents (clients)</p>
              <p className="text-2xl font-bold text-emerald-900">{fmtCur(stats.commission_clients)}</p>
              <p className="text-xs text-emerald-500 mt-1">Commissions prévisionnelles : {fmtCur(stats.commission_total)}</p>
            </div>
            <div className="w-10 h-10 bg-emerald-200 rounded-xl flex items-center justify-center shrink-0">
              <Award size={20} className="text-emerald-700" />
            </div>
          </div>
        </div>
      </div>

      {/* Graphiques */}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="card">
          <h2 className="font-semibold text-gray-800 mb-4">Tendance mensuelle</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={stats.monthly_trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="count" fill="#3b82f6" radius={[4,4,0,0]} name="Prospects" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h2 className="font-semibold text-gray-800 mb-4">Top secteurs</h2>
          {stats.by_sector.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={stats.by_sector} dataKey="count" nameKey="secteur_activite"
                  cx="50%" cy="50%" outerRadius={70}
                  label={({ name, percent }) => `${name} ${(percent*100).toFixed(0)}%`}
                  labelLine={false} fontSize={10}
                >
                  {stats.by_sector.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : <p className="text-sm text-gray-400 text-center py-10">Aucune donnée</p>}
        </div>
      </div>

      {/* Statistiques par produit */}
      {stats.by_product && stats.by_product.length > 0 && (
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <Package size={18} className="text-purple-600" />
            <h2 className="font-semibold text-gray-800">Statistiques par produit</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-gray-500 text-xs uppercase tracking-wide">
                  <th className="pb-3 font-medium">Produit</th>
                  <th className="pb-3 font-medium text-right">Prime annuelle</th>
                  <th className="pb-3 font-medium text-right">Prospects</th>
                  <th className="pb-3 font-medium text-right">Bénéficiaires</th>
                  <th className="pb-3 font-medium text-right">Clients</th>
                  <th className="pb-3 font-medium text-right">Primes totales</th>
                  <th className="pb-3 font-medium text-right">Commissions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {stats.by_product.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="py-3 font-medium text-gray-800">{p.nom}</td>
                    <td className="py-3 text-right text-gray-500">{fmtCur(p.prime_annuelle)}</td>
                    <td className="py-3 text-right">{fmt(p.total_prospects)}</td>
                    <td className="py-3 text-right text-blue-700 font-medium">{fmt(p.total_beneficiaires)}</td>
                    <td className="py-3 text-right text-emerald-600 font-medium">{fmt(p.total_clients)}</td>
                    <td className="py-3 text-right text-blue-700 font-medium">{fmtCur(p.total_primes)}</td>
                    <td className="py-3 text-right text-purple-700">{fmtCur(p.total_commissions)}</td>
                  </tr>
                ))}
              </tbody>
              {stats.by_product.length > 1 && (
                <tfoot>
                  <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold text-gray-800 text-sm">
                    <td className="py-3 text-xs uppercase tracking-wide text-gray-500" colSpan={2}>Totaux</td>
                    <td className="py-3 text-right">{fmt(stats.by_product.reduce((s,p) => s + Number(p.total_prospects||0), 0))}</td>
                    <td className="py-3 text-right text-blue-700">{fmt(stats.by_product.reduce((s,p) => s + Number(p.total_beneficiaires||0), 0))}</td>
                    <td className="py-3 text-right text-emerald-700">{fmt(stats.by_product.reduce((s,p) => s + Number(p.total_clients||0), 0))}</td>
                    <td className="py-3 text-right text-blue-700">{fmtCur(stats.by_product.reduce((s,p) => s + Number(p.total_primes||0), 0))}</td>
                    <td className="py-3 text-right text-purple-700">{fmtCur(stats.by_product.reduce((s,p) => s + Number(p.total_commissions||0), 0))}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* Performance des agents */}
      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="font-semibold text-gray-800">Performance des agents</h2>
          {/* Sélecteur de période */}
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            {PERIODS.map(p => (
              <button
                key={p.value}
                onClick={() => handlePeriodChange(p.value)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  period === p.value ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {loading && (
          <div className="flex justify-center py-6">
            <div className="w-6 h-6 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!loading && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-gray-500 text-xs uppercase tracking-wide">
                  <th className="pb-3 font-medium cursor-pointer hover:text-gray-800" onClick={() => handleSort('nom')}>
                    <span className="flex items-center gap-1">
                      Agent
                      <span className={`text-xs ${sortKey === 'nom' ? 'text-blue-500' : 'text-gray-300'}`}>
                        {sortKey === 'nom' ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
                      </span>
                    </span>
                  </th>
                  <SortTh label="Total"                  sortKey="total_prospects"  current={sortKey} dir={sortDir} onSort={handleSort} />
                  <SortTh label={currentPeriod.short}    sortKey="period_prospects" current={sortKey} dir={sortDir} onSort={handleSort} />
                  <SortTh label="Clients"                sortKey="total_clients"    current={sortKey} dir={sortDir} onSort={handleSort} />
                  <SortTh label="Primes"                 sortKey="prime_total"      current={sortKey} dir={sortDir} onSort={handleSort} />
                  <th className="pb-3 font-medium text-right">Atteinte prospects</th>
                  <th className="pb-3 font-medium text-right">Atteinte primes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {paginatedAgents.map(a => (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="py-3 font-medium">
                      {a.type_agent === 'morale'
                        ? (a.raison_sociale || a.nom)
                        : `${a.prenom} ${a.nom}`}
                    </td>
                    <td className="py-3 text-right">{fmt(a.total_prospects)}</td>
                    <td className="py-3 text-right font-medium text-blue-700">{fmt(a.period_prospects)}</td>
                    <td className="py-3 text-right text-emerald-600 font-medium">{fmt(a.total_clients)}</td>
                    <td className="py-3 text-right">
                      <div>
                        <span className="text-blue-700 font-medium">{fmtCur(a.prime_total)}</span>
                        {Number(a.prime_clients) > 0 && (
                          <div className="text-xs text-emerald-600">{fmtCur(a.prime_clients)} clients</div>
                        )}
                      </div>
                    </td>
                    <td className="py-3 pl-2">
                      <AchievementBar
                        value={Number(a.period_prospects)}
                        target={Number(a.objectif_period_prospects)}
                      />
                    </td>
                    <td className="py-3 pl-2">
                      <AchievementBar
                        value={Number(a.period_prime_total)}
                        target={Number(a.objectif_period_primes)}
                      />
                    </td>
                  </tr>
                ))}

                {sortedAgents.length > 0 && (
                  <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold text-gray-800">
                    <td className="py-3 text-xs uppercase tracking-wide text-gray-500">Totaux</td>
                    <td className="py-3 text-right">{fmt(sortedAgents.reduce((s,a) => s + Number(a.total_prospects||0), 0))}</td>
                    <td className="py-3 text-right text-blue-700">{fmt(sortedAgents.reduce((s,a) => s + Number(a.period_prospects||0), 0))}</td>
                    <td className="py-3 text-right text-emerald-700">{fmt(sortedAgents.reduce((s,a) => s + Number(a.total_clients||0), 0))}</td>
                    <td className="py-3 text-right text-blue-700">{fmtCur(totalPrimes)}</td>
                    <td className="py-3"></td>
                    <td className="py-3"></td>
                  </tr>
                )}

                {sortedAgents.length === 0 && (
                  <tr><td colSpan={7} className="py-8 text-center text-gray-400">Aucun agent enregistré</td></tr>
                )}
              </tbody>
            </table>
            <Pagination page={page} totalPages={totalPages} total={sortedAgents.length} onPageChange={setPage} />
          </div>
        )}
      </div>
    </div>
  )
}
