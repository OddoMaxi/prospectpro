import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api'
import { useAuth } from '../../context/AuthContext'
import StatCard from '../../components/StatCard'
import { Users, UserCheck, TrendingUp, DollarSign, Target, Calendar, PlusCircle, ArrowRight, Banknote, UsersRound } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'

const STATUS_LABELS = { prospect: 'Prospect', en_cours: 'En cours', client: 'Client', perdu: 'Perdu' }
const STATUS_COLORS = { prospect: '#3b82f6', en_cours: '#f59e0b', client: '#10b981', perdu: '#ef4444' }
const fmt = n => new Intl.NumberFormat('fr-FR').format(Math.round(n || 0))
const fmtCur = n => `${fmt(n)} GNF`
const fmtDate = d => d ? new Date(d).toLocaleDateString('fr-FR') : '-'

function ProgressBar({ label, value, max, colorClass = 'bg-blue-500' }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0
  const over = max > 0 && value > max
  return (
    <div>
      <div className="flex justify-between items-center mb-1.5">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <span className={`text-sm font-bold ${over ? 'text-emerald-600' : 'text-gray-900'}`}>
          {fmt(value)}<span className="text-gray-400 font-normal"> / {fmt(max)}</span>
        </span>
      </div>
      <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${over ? 'bg-emerald-500' : colorClass}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-xs text-gray-400">Progression</span>
        <span className={`text-xs font-semibold ${over ? 'text-emerald-600' : pct >= 80 ? 'text-blue-600' : 'text-gray-600'}`}>
          {pct.toFixed(0)}% {over ? '— Objectif dépassé !' : ''}
        </span>
      </div>
    </div>
  )
}

export default function AgentDashboard() {
  const { user } = useAuth()
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/stats/agent').then(r => setStats(r.data)).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>
  if (!stats) return null

  const pieData = stats.by_status.map(s => ({ name: STATUS_LABELS[s.statut] || s.statut, value: s.count, color: STATUS_COLORS[s.statut] || '#6b7280' }))

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Bonjour, {user?.prenom} !</h1>
          <p className="text-gray-500 text-sm mt-0.5">Voici votre tableau de bord commercial</p>
        </div>
        <Link to="/agent/prospects/create" className="btn btn-primary hidden sm:inline-flex">
          <PlusCircle size={16} />Nouveau prospect
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        <StatCard title="Total prospects"   value={fmt(stats.total_prospects)}    icon={Users}      color="blue" />
        <StatCard title="Ce mois"           value={fmt(stats.monthly_prospects)}  icon={Calendar}   color="orange" />
        <StatCard title="Clients"           value={fmt(stats.total_clients)}      icon={UserCheck}  color="green" />
        <StatCard title="Taux conversion"   value={`${stats.conversion_rate}%`}   icon={TrendingUp} color="purple" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="card flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 bg-blue-50 text-blue-600">
            <Banknote size={22} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-gray-500 font-medium">Total primes prévisionnelles</p>
            <p className="text-lg font-bold text-gray-900 mt-0.5">{fmtCur(stats.prime_total)}</p>
            <p className="text-xs text-emerald-600 mt-0.5">Clients : {fmtCur(stats.prime_clients)}</p>
          </div>
        </div>
        <div className="card flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 bg-green-50 text-green-600">
            <DollarSign size={22} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-gray-500 font-medium">Commission prévisionnelle</p>
            <p className="text-lg font-bold text-gray-900 mt-0.5">{fmtCur(stats.commission_total)}</p>
            <p className="text-xs text-emerald-600 mt-0.5">Clients : {fmtCur(stats.commission_clients)}</p>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        <div className="card">
          <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2"><Target size={18} className="text-blue-500" />Objectifs</h2>
          <div className="space-y-5">
            <ProgressBar label="Objectif mensuel" value={stats.monthly_prospects} max={stats.objectif_mensuel} colorClass="bg-blue-500" />
            <ProgressBar label="Objectif annuel"  value={stats.annual_prospects}  max={stats.objectif_annuel}  colorClass="bg-purple-500" />
          </div>
        </div>

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

      <div className="card">
        <h2 className="font-semibold text-gray-800 mb-4">Activité des 6 derniers mois</h2>
        {stats.monthly_trend.length > 0 ? (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={stats.monthly_trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" fill="#3b82f6" radius={[4,4,0,0]} name="Prospects" />
            </BarChart>
          </ResponsiveContainer>
        ) : <p className="text-sm text-gray-400 text-center py-10">Aucune activité enregistrée</p>}
      </div>

      {/* Section sous-agents (uniquement si l'agent a des sous-agents) */}
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
              <p className="text-xl font-bold text-green-900 mt-1">{fmtCur(stats.commission_sous_agents)}</p>
              <p className="text-xs text-green-600 mt-0.5">Clients : {fmtCur(stats.commission_sous_agents_clients)}</p>
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
                  <p className="text-xs text-gray-400">{p.ville || 'Ville non renseignée'} • {fmtDate(p.date_prospection)}</p>
                </div>
                <span className="text-xs font-medium text-gray-500 shrink-0">{fmt(p.montant_potentiel)} GNF</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
