import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Search, Eye, Trash2, UserCheck } from 'lucide-react'
import { api } from '../../api'
import { useAuth, useBase } from '../../context/AuthContext'
import { useExercice } from '../../context/ExerciceContext'
import Pagination from '../../components/Pagination'
import { Spinner, PageHeader, Empty, ExportButtons, errMsg } from '../../components/ui'
import { exportExcel, exportPdf } from '../../utils/export'
import { personName, fmtMoney, fmtDate, fmtTel } from '../../utils/format'

const PAGE_SIZE = 15
const TYPES = { physique: 'Particulier', morale: 'Entreprise' }
const COLUMNS = [
  { label: 'N°', value: 'numero' },
  { label: 'Client', value: c => personName(c) },
  { label: 'Type', value: c => TYPES[c.type] },
  { label: 'Téléphone', value: 'telephone' },
  { label: 'Agent', value: c => personName(c, 'agent_') },
  { label: 'Contrats en vigueur', value: 'nb_contrats_actifs', type: 'number' },
  { label: 'Prochaine échéance', value: 'prochaine_echeance', type: 'date' },
  { label: 'Prime TTC en cours', value: 'prime_ttc_en_cours', type: 'money' },
]

export default function ClientList() {
  const navigate = useNavigate()
  const base = useBase()
  const { user } = useAuth()
  const { annee } = useExercice()
  const isAdmin = user.role === 'admin'
  const [rows, setRows] = useState(null)
  const [agents, setAgents] = useState([])
  const [filters, setFilters] = useState({ search: '', agent_id: '', type: '' })
  const [page, setPage] = useState(1)

  useEffect(() => {
    if (isAdmin) api.get('/agents').then(r => setAgents(r.data)).catch(() => {})
    else if (!user.parent_agent_id) api.get('/agents/sous-agents').then(r => setAgents(r.data)).catch(() => {})
  }, [])
  const load = () => api.get('/clients', { params: { ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)), annee } }).then(r => setRows(r.data))
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t) }, [filters, annee])
  const setF = (k, v) => { setFilters(p => ({ ...p, [k]: v })); setPage(1) }

  const remove = async c => {
    if (!confirm(`Supprimer le client ${personName(c)} ? Son historique est conservé.`)) return
    try { await api.delete(`/clients/${c.id}`); toast.success('Client supprimé'); load() } catch (err) { toast.error(errMsg(err)) }
  }

  const list = rows || []
  const title = isAdmin ? 'Clients' : 'Mes clients'
  return (
    <div>
      <PageHeader title={title} subtitle={`Exercice ${annee} · ${list.length} client(s) acquis ou sous contrat sur l'exercice`}>
        <ExportButtons disabled={!list.length}
          onExcel={() => exportExcel({ filename: 'clients', columns: COLUMNS, rows: list })}
          onPdf={() => exportPdf({ filename: 'clients', title: 'Portefeuille clients', subtitle: `Exercice ${annee}`, columns: COLUMNS, rows: list })} />
      </PageHeader>

      <div className="card mb-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="input pl-9" placeholder="Nom, téléphone, n°…" value={filters.search} onChange={e => setF('search', e.target.value)} />
        </div>
        <select className="input" value={filters.type} onChange={e => setF('type', e.target.value)}>
          <option value="">Particuliers et entreprises</option>
          <option value="physique">Particuliers</option>
          <option value="morale">Entreprises</option>
        </select>
        {agents.length > 0 && (
          <select className="input" value={filters.agent_id} onChange={e => setF('agent_id', e.target.value)}>
            <option value="">Tous les agents</option>
            {!isAdmin && <option value={user.id}>Moi uniquement</option>}
            {agents.map(a => <option key={a.id} value={a.id}>{personName(a)}</option>)}
          </select>
        )}
      </div>

      {!rows ? <Spinner /> : list.length === 0 ? <Empty icon={UserCheck} text="Aucun client" /> : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs text-gray-500 uppercase tracking-wide">
                <th className="pb-3 font-medium">N°</th>
                <th className="pb-3 font-medium">Client</th>
                <th className="pb-3 font-medium hidden sm:table-cell">Téléphone</th>
                <th className="pb-3 font-medium hidden md:table-cell">Agent</th>
                <th className="pb-3 font-medium text-right">Contrats</th>
                <th className="pb-3 font-medium text-right hidden md:table-cell">Prochaine échéance</th>
                <th className="pb-3 font-medium text-right hidden lg:table-cell">Prime TTC en cours</th>
                <th className="pb-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(c => (
                <tr key={c.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`${base}/clients/${c.id}`)}>
                  <td className="py-3"><span className="font-mono text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">#{c.numero}</span></td>
                  <td className="py-3"><p className="font-medium text-gray-900">{personName(c)}</p><p className="text-xs text-gray-400">{TYPES[c.type]}</p></td>
                  <td className="py-3 text-gray-600 hidden sm:table-cell">{fmtTel(c.telephone)}</td>
                  <td className="py-3 text-xs text-gray-600 hidden md:table-cell">{personName(c, 'agent_')}</td>
                  <td className="py-3 text-right">{c.nb_contrats_actifs}<span className="text-gray-400"> / {c.nb_contrats}</span></td>
                  <td className="py-3 text-right text-xs hidden md:table-cell">{fmtDate(c.prochaine_echeance)}</td>
                  <td className="py-3 text-right tabular-nums hidden lg:table-cell">{fmtMoney(c.prime_ttc_en_cours)}</td>
                  <td className="py-3 text-right" onClick={e => e.stopPropagation()}>
                    <div className="flex justify-end gap-1.5">
                      <button onClick={() => navigate(`${base}/clients/${c.id}`)} className="btn btn-secondary btn-sm" title="Voir"><Eye size={13} /></button>
                      {isAdmin && <button onClick={() => remove(c)} className="btn btn-danger btn-sm" title="Supprimer"><Trash2 size={13} /></button>}
                    </div>
                  </td>
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
