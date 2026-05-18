import { useEffect, useState } from 'react'
import { api } from '../../api'
import StatCard from '../../components/StatCard'
import { Users, UserCheck, TrendingUp, DollarSign, BarChart2, Target } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'

const PIE_COLORS = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6']
const fmt = n => new Intl.NumberFormat('fr-FR').format(Math.round(n || 0))
const fmtCur = n => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'GNF', minimumFractionDigits: 0 }).format(Math.round(n || 0))

function ProgressBar({ label, value, max, color = 'bg-blue-500' }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-600">{label}</span>
        <span className="font-semibold">{fmt(value)}/{fmt(max)}</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-right text-xs text-gray-400 mt-0.5">{pct.toFixed(0)}%</p>
    </div>
  )
}

export default function AdminDashboard() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/stats/admin').then(r => setStats(r.data)).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>
  if (!stats) return null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Tableau de bord</h1>
        <p className="text-gray-500 text-sm mt-0.5">Vue globale de l'activité commerciale</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard title="Agents actifs"       value={stats.total_agents}       icon={Users}      color="blue" />
        <StatCard title="Total prospects"     value={fmt(stats.total_prospects)} icon={BarChart2} color="purple" />
        <StatCard title="Ce mois"             value={fmt(stats.monthly_prospects)} icon={TrendingUp} color="orange" />
        <StatCard title="Clients"             value={fmt(stats.total_clients)}  icon={UserCheck}  color="green" />
        <StatCard title="Taux conversion"     value={`${stats.global_conversion_rate}%`} icon={Target} color="yellow" />
        <StatCard title="Commission totale"   value={fmtCur(stats.commission_total)} icon={DollarSign} color="green" />
      </div>

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
                <Pie data={stats.by_sector} dataKey="count" nameKey="secteur_activite" cx="50%" cy="50%" outerRadius={70} label={({ name, percent }) => `${name} ${(percent*100).toFixed(0)}%`} labelLine={false} fontSize={10}>
                  {stats.by_sector.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : <p className="text-sm text-gray-400 text-center py-10">Aucune donnée</p>}
        </div>
      </div>

      <div className="card">
        <h2 className="font-semibold text-gray-800 mb-4">Performance des agents</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-gray-500 text-xs uppercase tracking-wide">
                <th className="pb-3 font-medium">Agent</th>
                <th className="pb-3 font-medium text-right">Total</th>
                <th className="pb-3 font-medium text-right">Ce mois</th>
                <th className="pb-3 font-medium text-right">Clients</th>
                <th className="pb-3 font-medium text-right">Commission</th>
                <th className="pb-3 font-medium">Objectif mensuel</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {stats.agent_stats.map(a => {
                const pct = a.objectif_mensuel > 0 ? Math.min((a.monthly_prospects / a.objectif_mensuel) * 100, 100) : 0
                return (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="py-3 font-medium">{a.prenom} {a.nom}</td>
                    <td className="py-3 text-right">{fmt(a.total_prospects)}</td>
                    <td className="py-3 text-right">{fmt(a.monthly_prospects)}</td>
                    <td className="py-3 text-right text-emerald-600 font-medium">{fmt(a.total_clients)}</td>
                    <td className="py-3 text-right text-blue-600">{fmtCur(a.commission_total)}</td>
                    <td className="py-3 pl-4 w-32">
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
              {stats.agent_stats.length === 0 && (
                <tr><td colSpan={6} className="py-8 text-center text-gray-400">Aucun agent enregistré</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
