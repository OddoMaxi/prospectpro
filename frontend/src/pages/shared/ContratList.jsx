import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, FileText } from 'lucide-react'
import { api } from '../../api'
import { useAuth, useBase } from '../../context/AuthContext'
import { useExercice } from '../../context/ExerciceContext'
import Pagination from '../../components/Pagination'
import { Spinner, PageHeader, Empty, Badge, ExportButtons } from '../../components/ui'
import { exportExcel, exportPdf } from '../../utils/export'
import { personName, fmtMoney, fmtDate, STATUTS_CONTRAT } from '../../utils/format'

const PAGE_SIZE = 15
const COLUMNS = [
  { label: 'Contrat', value: 'numero_contrat' },
  { label: 'Client', value: c => personName(c, 'client_') },
  { label: 'Produits', value: 'produits' },
  { label: 'Agent', value: c => personName(c, 'agent_') },
  { label: 'Effet', value: 'date_effet', type: 'date' },
  { label: 'Échéance', value: 'date_echeance', type: 'date' },
  { label: 'Prime pure', value: 'prime_pure', type: 'money' },
  { label: 'Prime TTC', value: 'prime_ttc', type: 'money' },
  { label: 'Statut', value: c => STATUTS_CONTRAT[c.statut_calcule]?.label },
]

export default function ContratList() {
  const navigate = useNavigate()
  const base = useBase()
  const { user } = useAuth()
  const { annee } = useExercice()
  const isAdmin = user.role === 'admin'
  const [rows, setRows] = useState(null)
  const [agents, setAgents] = useState([])
  const [products, setProducts] = useState([])
  const [filters, setFilters] = useState({ search: '', statut: '', agent_id: '', product_id: '' })
  const [page, setPage] = useState(1)

  useEffect(() => {
    api.get('/products/active').then(r => setProducts(r.data)).catch(() => {})
    if (isAdmin) api.get('/agents').then(r => setAgents(r.data)).catch(() => {})
    else if (!user.parent_agent_id) api.get('/agents/sous-agents').then(r => setAgents(r.data)).catch(() => {})
  }, [])
  useEffect(() => {
    const t = setTimeout(() => api.get('/contrats', { params: { ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)), annee } }).then(r => setRows(r.data)), 250)
    return () => clearTimeout(t)
  }, [filters, annee])
  const setF = (k, v) => { setFilters(p => ({ ...p, [k]: v })); setPage(1) }
  const list = rows || []

  return (
    <div>
      <PageHeader title={isAdmin ? 'Contrats' : 'Mes contrats'} subtitle={`Contrats en vigueur pendant l'exercice ${annee} · ${list.length}`}>
        <ExportButtons disabled={!list.length}
          onExcel={() => exportExcel({ filename: 'contrats', columns: COLUMNS, rows: list })}
          onPdf={() => exportPdf({ filename: 'contrats', title: 'Contrats', subtitle: `Exercice ${annee}`, columns: COLUMNS, rows: list })} />
      </PageHeader>

      <div className="card mb-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="input pl-9" placeholder="N° contrat, client, téléphone…" value={filters.search} onChange={e => setF('search', e.target.value)} />
        </div>
        <select className="input" value={filters.statut} onChange={e => setF('statut', e.target.value)}>
          <option value="">Tous les statuts</option>
          {Object.entries(STATUTS_CONTRAT).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select className="input" value={filters.product_id} onChange={e => setF('product_id', e.target.value)}>
          <option value="">Tous les produits</option>
          {products.map(p => <option key={p.id} value={p.id}>{p.nom}</option>)}
        </select>
        {agents.length > 0 && (
          <select className="input" value={filters.agent_id} onChange={e => setF('agent_id', e.target.value)}>
            <option value="">Tous les agents</option>
            {!isAdmin && <option value={user.id}>Moi uniquement</option>}
            {agents.map(a => <option key={a.id} value={a.id}>{personName(a)}</option>)}
          </select>
        )}
      </div>

      {!rows ? <Spinner /> : list.length === 0 ? <Empty icon={FileText} text="Aucun contrat" /> : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-100 text-left text-xs text-gray-500 uppercase tracking-wide">
              <th className="pb-3 font-medium">Contrat</th><th className="pb-3 font-medium">Client</th>
              <th className="pb-3 font-medium hidden lg:table-cell">Produits</th><th className="pb-3 font-medium hidden md:table-cell">Agent</th>
              <th className="pb-3 font-medium">Échéance</th><th className="pb-3 font-medium text-right hidden sm:table-cell">Prime TTC</th>
              <th className="pb-3 font-medium text-center">Statut</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(c => (
                <tr key={c.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`${base}/contrats/${c.id}`)}>
                  <td className="py-3 font-medium text-blue-700">{c.numero_contrat}</td>
                  <td className="py-3">{personName(c, 'client_')}<span className="block text-xs text-gray-400">#{c.client_numero}</span></td>
                  <td className="py-3 text-gray-600 hidden lg:table-cell">{c.produits}</td>
                  <td className="py-3 text-xs text-gray-600 hidden md:table-cell">{personName(c, 'agent_')}</td>
                  <td className="py-3">{fmtDate(c.date_echeance)}{c.renouvellement_en_attente && <span className="block text-xs text-amber-600">Renouvellement en attente de paiement</span>}</td>
                  <td className="py-3 text-right tabular-nums hidden sm:table-cell">{fmtMoney(c.prime_ttc)}</td>
                  <td className="py-3 text-center"><Badge def={STATUTS_CONTRAT} value={c.statut_calcule} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={page} totalPages={Math.ceil(list.length / PAGE_SIZE)} total={list.length} onPageChange={setPage} />
        </div>
      )}
    </div>
  )
}
