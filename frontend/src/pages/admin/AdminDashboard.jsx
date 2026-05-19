import { useEffect, useState } from 'react'
import { api } from '../../api'
import StatCard from '../../components/StatCard'
import { Users, UserCheck, TrendingUp, DollarSign, BarChart2, Target, Banknote, Award } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'

const PIE_COLORS = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6']
const fmt = n => new Intl.NumberFormat('fr-FR').format(Math.round(n || 0))
const fmtCur = n => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'GNF', minimumFractionDigits: 0 }).format(Math.round(n || 0))

const SORT_KEYS = {
  nom: (a, b) => `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`),
  total_prospects: (a, b) => Number(b.total_prospects) - Number(a.total_prospects),
  monthly_prospects: (a, b) => Number(b.monthly_prospects) - Number(a.monthly_prospects),
  total_clients: (a, b) => Number(b.total_clients) - Number(a.total_clients),
  prime_total: (a, b) => Number(b.prime_total) - Number(a.prime_total),
  commission_total: (a, b) => Number(b.commission_total) - Number(a.commission_total),
}

function SortTh({ label, sortKey, current, dir, onSort }) {
  const active = current === sortKey
  return (
    <th
      className="pb-3 font-medium cursor-pointer select-none hover:text-gray-800 transition-colors"
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

export default function AdminDashboard() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [sortKey, setSortKey] = useState('total_prospects')
  const [sortDir, setSortDir] = useState('desc')

  useEffect(() => {
    api.get('/stats/admin').then(r => setStats(r.data)).finally(() => setLoading(false))
  }, [])

  const handleSort = key => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )
  if (!stats) return null

  const sortedAgents = [...(stats.agent_stats || [])].sort((a, b) => {
    const cmp = SORT_KEYS[sortKey] ? SORT_KEYS[sortKey](a, b) : 0
    return sortDir === 'asc' ? -cmp : cmp
  })

  const totalPrimes = sortedAgents.reduce((s, a) => s + Number(a.prime_total || 0), 0)
  const totalCommissions = sortedAgents.reduce((s, a) => s + Number(a.commission_total || 0), 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Tableau de bord</h1>
        <p className="text-gray-500 text-sm mt-0.5">Vue globale de l'activité commerciale</p>
      </div>

      {/* Métriques globales */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard title="Agents actifs"       value={stats.total_agents}             icon={Users}      color="blue" />
        <StatCard title="Total prospects"     value={fmt(stats.total_prospects)}     icon={BarChart2}  color="purple" />
        <StatCard title="Ce mois"             value={fmt(stats.monthly_prospects)}   icon={TrendingUp} color="orange" />
        <StatCard title="Clients"             value={fmt(stats.total_clients)}       icon={UserCheck}  color="green" />
        <StatCard title="Taux conversion"     value={`${stats.global_conversion_rate}%`} icon={Target} color="yellow" />
        <StatCard title="Commission totale"   value={fmtCur(stats.commission_total)} icon={DollarSign} color="green" />
      </div>

      {/* Primes et commissions à payer aux agents */}
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

      {/* Performance des agents */}
      <div className="card">
        <h2 className="font-semibold text-gray-800 mb-4">Performance des agents</h2>
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
                <SortTh label="Total" sortKey="total_prospects" current={sortKey} dir={sortDir} onSort={handleSort} />
                <SortTh label="Ce mois" sortKey="monthly_prospects" current={sortKey} dir={sortDir} onSort={handleSort} />
                <SortTh label="Clients" sortKey="total_clients" current={sortKey} dir={sortDir} onSort={handleSort} />
                <SortTh label="Primes" sortKey="prime_total" current={sortKey} dir={sortDir} onSort={handleSort} />
                <SortTh label="Commission" sortKey="commission_total" current={sortKey} dir={sortDir} onSort={handleSort} />
                <th className="pb-3 font-medium">Objectif mensuel</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {sortedAgents.map(a => {
                const pct = a.objectif_mensuel > 0 ? Math.min((a.monthly_prospects / a.objectif_mensuel) * 100, 100) : 0
                return (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="py-3 font-medium">{a.prenom} {a.nom}</td>
                    <td className="py-3 text-right">{fmt(a.total_prospects)}</td>
                    <td className="py-3 text-right">{fmt(a.monthly_prospects)}</td>
                    <td className="py-3 text-right text-emerald-600 font-medium">{fmt(a.total_clients)}</td>
                    <td className="py-3 text-right">
                      <div>
                        <span className="text-blue-700 font-medium">{fmtCur(a.prime_total)}</span>
                        {Number(a.prime_clients) > 0 && (
                          <div className="text-xs text-emerald-600">{fmtCur(a.prime_clients)} clients</div>
                        )}
                      </div>
                    </td>
                    <td className="py-3 text-right">
                      <div>
                        <span className="text-purple-700 font-medium">{fmtCur(a.commission_total)}</span>
                        {Number(a.commission_clients) > 0 && (
                          <div className="text-xs text-emerald-600">{fmtCur(a.commission_clients)} clients</div>
                        )}
                      </div>
                    </td>
                    <td className="py-3 pl-4 w-36">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs text-gray-500 shrink-0">{pct.toFixed(0)}%</span>
                      </div>
                    </td>
                  </tr>
                )
              })}

              {/* Ligne de totaux */}
              {sortedAgents.length > 0 && (
                <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold text-gray-800">
                  <td className="py-3 text-xs uppercase tracking-wide text-gray-500">Totaux</td>
                  <td className="py-3 text-right">{fmt(sortedAgents.reduce((s, a) => s + Number(a.total_prospects || 0), 0))}</td>
                  <td className="py-3 text-right">{fmt(sortedAgents.reduce((s, a) => s + Number(a.monthly_prospects || 0), 0))}</td>
                  <td className="py-3 text-right text-emerald-700">{fmt(sortedAgents.reduce((s, a) => s + Number(a.total_clients || 0), 0))}</td>
                  <td className="py-3 text-right text-blue-700">{fmtCur(totalPrimes)}</td>
                  <td className="py-3 text-right text-purple-700">{fmtCur(totalCommissions)}</td>
                  <td className="py-3"></td>
                </tr>
              )}

              {sortedAgents.length === 0 && (
                <tr><td colSpan={7} className="py-8 text-center text-gray-400">Aucun agent enregistré</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
