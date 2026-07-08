import { useEffect, useState } from 'react'
import { api } from '../api'
import Pagination from './Pagination'
import { Users, UserCheck, BarChart2, Target, Banknote, Award, Package, RefreshCw } from 'lucide-react'

const PAGE_SIZE = 10
const fmt = n => new Intl.NumberFormat('fr-FR').format(Math.round(n || 0))

const COLORS = {
  blue:   'bg-blue-50 text-blue-600',
  green:  'bg-emerald-50 text-emerald-600',
  purple: 'bg-purple-50 text-purple-600',
  orange: 'bg-orange-50 text-orange-600',
  red:    'bg-red-50 text-red-600',
  yellow: 'bg-yellow-50 text-yellow-600',
}

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

function RealisationBar({ taux }) {
  const pct = Math.min(Number(taux) || 0, 100)
  const barColor = pct >= 100 ? 'bg-emerald-500' : pct >= 70 ? 'bg-orange-400' : 'bg-blue-400'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-semibold text-gray-600 shrink-0">{(Number(taux) || 0).toFixed(1)}%</span>
    </div>
  )
}

function TypeSplitCard({ title, icon: Icon, color, total, physique, morale, isPercent }) {
  const val = isPercent ? `${total}%` : fmt(total)
  return (
    <div className="card">
      <div className="flex items-center gap-3 mb-2">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${COLORS[color]}`}>
          <Icon size={20} />
        </div>
        <div className="min-w-0">
          <p className="text-2xl font-bold text-gray-900">{val}</p>
          <p className="text-xs text-gray-500 truncate">{title}</p>
        </div>
      </div>
      <div className="flex gap-3 text-xs text-gray-500">
        <span>Particuliers : <span className="font-medium text-gray-700">{isPercent ? `${physique}%` : fmt(physique)}</span></span>
        <span>Entreprises : <span className="font-medium text-gray-700">{isPercent ? `${morale}%` : fmt(morale)}</span></span>
      </div>
    </div>
  )
}

function AgentBreakdownCard({ agents }) {
  return (
    <div className="card">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-blue-50 text-blue-600">
          <Users size={20} />
        </div>
        <div>
          <p className="text-2xl font-bold text-gray-900">{fmt(agents.total)}</p>
          <p className="text-xs text-gray-500">Agents commerciaux actifs</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="bg-gray-50 rounded-lg p-2">
          <p className="text-gray-400 mb-0.5">Séniores</p>
          <p className="font-bold text-gray-800">{fmt(agents.seniors.total)}</p>
          <p className="text-gray-400">{fmt(agents.seniors.physique)} phys. · {fmt(agents.seniors.morale)} mor.</p>
        </div>
        <div className="bg-gray-50 rounded-lg p-2">
          <p className="text-gray-400 mb-0.5">Juniores</p>
          <p className="font-bold text-gray-800">{fmt(agents.juniors.total)}</p>
          <p className="text-gray-400">{fmt(agents.juniors.physique)} phys. · {fmt(agents.juniors.morale)} mor.</p>
        </div>
      </div>
    </div>
  )
}

function FinanceBlock({ title, icon: Icon, color, previsionnel, percu, percuLabel, taux }) {
  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-3">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${COLORS[color]}`}>
          <Icon size={18} />
        </div>
        <h3 className="font-semibold text-gray-800 text-sm">{title}</h3>
      </div>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <p className="text-xs text-gray-400">Prévisionnel</p>
          <p className="font-bold text-gray-700">{fmt(previsionnel)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400">{percuLabel}</p>
          <p className="font-bold text-emerald-700">{fmt(percu)}</p>
        </div>
      </div>
      <p className="text-xs text-gray-400 mb-1">Taux de réalisation</p>
      <RealisationBar taux={taux} />
    </div>
  )
}

// Tableau de bord global de l'entreprise — identique pour l'administrateur et pour
// chaque commercial (sénior ou juniore), consommant /api/stats/admin.
export default function GlobalStatsDashboard({ title = 'Tableau de bord', subtitle = "Vue globale de l'activité commerciale" }) {
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

  const totalPrimes  = sortedAgents.reduce((s, a) => s + Number(a.prime_total   || 0), 0)
  const totalClients = sortedAgents.reduce((s, a) => s + Number(a.total_clients || 0), 0)
  const totalPages       = Math.ceil(sortedAgents.length / PAGE_SIZE)
  const paginatedAgents  = sortedAgents.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">{title}</h1>
        <p className="text-gray-500 text-sm mt-0.5">{subtitle}</p>
      </div>

      {/* Agents / Prospects / Clients / Conversion */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <AgentBreakdownCard agents={stats.agents} />
        <TypeSplitCard title="Total prospects" icon={BarChart2} color="purple"
          total={stats.prospects.total} physique={stats.prospects.physique} morale={stats.prospects.morale} />
        <TypeSplitCard title="Total clients" icon={UserCheck} color="green"
          total={stats.clients.total} physique={stats.clients.physique} morale={stats.clients.morale} />
        <TypeSplitCard title="Taux de conversion" icon={Target} color="yellow" isPercent
          total={stats.conversion.total} physique={stats.conversion.physique} morale={stats.conversion.morale} />
      </div>

      {/* Blocs financiers : prévisionnel vs perçu/payé + taux de réalisation */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FinanceBlock title="Prime commerciale" icon={Banknote} color="blue" percuLabel="Perçu"
          previsionnel={stats.prime.previsionnel} percu={stats.prime.percu} taux={stats.prime.taux_realisation} />
        <FinanceBlock title="Commissions" icon={Award} color="green" percuLabel="Payé"
          previsionnel={stats.commission.previsionnel} percu={stats.commission.paye} taux={stats.commission.taux_realisation} />
      </div>

      {/* Renouvellement des contrats */}
      <div className="card">
        <div className="flex items-center gap-2 mb-3">
          <RefreshCw size={18} className="text-blue-600" />
          <h2 className="font-semibold text-gray-800">Taux de renouvellement des contrats</h2>
        </div>
        <div className="flex flex-wrap items-center gap-6">
          <div>
            <p className="text-3xl font-bold text-gray-900">{stats.renouvellement.taux}%</p>
            <p className="text-xs text-gray-400 mt-0.5">Sur les contrats arrivés à échéance</p>
          </div>
          <div className="flex gap-4 text-sm">
            <div><span className="font-semibold text-emerald-600">{fmt(stats.renouvellement.renouveles)}</span> <span className="text-gray-400">renouvelés</span></div>
            <div><span className="font-semibold text-red-500">{fmt(stats.renouvellement.non_renouveles)}</span> <span className="text-gray-400">non renouvelés</span></div>
            <div><span className="font-semibold text-gray-500">{fmt(stats.renouvellement.en_attente)}</span> <span className="text-gray-400">en attente</span></div>
          </div>
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
                  <th className="pb-3 font-medium text-right">Prospects</th>
                  <th className="pb-3 font-medium text-right">Clients</th>
                  <th className="pb-3 font-medium text-right">Bénéficiaires</th>
                  <th className="pb-3 font-medium text-right">Primes perçues</th>
                  <th className="pb-3 font-medium text-right">Commissions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {stats.by_product.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="py-3 font-medium text-gray-800">{p.nom}</td>
                    <td className="py-3 text-right">{fmt(p.total_prospects)}</td>
                    <td className="py-3 text-right text-emerald-600 font-medium">{fmt(p.total_clients)}</td>
                    <td className="py-3 text-right text-blue-700 font-medium">{fmt(p.total_beneficiaires)}</td>
                    <td className="py-3 text-right text-blue-700 font-medium">{fmt(p.total_primes)}</td>
                    <td className="py-3 text-right text-purple-700">{fmt(p.total_commissions)}</td>
                  </tr>
                ))}
              </tbody>
              {stats.by_product.length > 1 && (
                <tfoot>
                  <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold text-gray-800 text-sm">
                    <td className="py-3 text-xs uppercase tracking-wide text-gray-500">Totaux</td>
                    <td className="py-3 text-right">{fmt(stats.by_product.reduce((s,p) => s + Number(p.total_prospects||0), 0))}</td>
                    <td className="py-3 text-right text-emerald-700">{fmt(stats.by_product.reduce((s,p) => s + Number(p.total_clients||0), 0))}</td>
                    <td className="py-3 text-right text-blue-700">{fmt(stats.by_product.reduce((s,p) => s + Number(p.total_beneficiaires||0), 0))}</td>
                    <td className="py-3 text-right text-blue-700">{fmt(stats.by_product.reduce((s,p) => s + Number(p.total_primes||0), 0))}</td>
                    <td className="py-3 text-right text-purple-700">{fmt(stats.by_product.reduce((s,p) => s + Number(p.total_commissions||0), 0))}</td>
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
          <h2 className="font-semibold text-gray-800">Performance des agents commerciaux</h2>
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
                      <div className="flex items-center gap-2">
                        <span>{a.type_agent === 'morale' ? (a.raison_sociale || a.nom) : `${a.prenom} ${a.nom}`}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${
                          a.hierarchie === 'seniore' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'
                        }`}>
                          {a.hierarchie === 'seniore' ? 'Séniore' : 'Juniore'}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 text-right">{fmt(a.total_prospects)}</td>
                    <td className="py-3 text-right font-medium text-blue-700">{fmt(a.period_prospects)}</td>
                    <td className="py-3 text-right text-emerald-600 font-medium">{fmt(a.total_clients)}</td>
                    <td className="py-3 text-right">
                      <div>
                        <span className="text-blue-700 font-medium">{fmt(a.prime_total)}</span>
                        {Number(a.prime_clients) > 0 && (
                          <div className="text-xs text-emerald-600">{fmt(a.prime_clients)} clients</div>
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
                    <td className="py-3 text-right text-emerald-700">{fmt(totalClients)}</td>
                    <td className="py-3 text-right text-blue-700">{fmt(totalPrimes)}</td>
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
