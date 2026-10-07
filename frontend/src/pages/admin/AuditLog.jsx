import { Fragment, useEffect, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { api } from '../../api'
import { Spinner, PageHeader, ExportButtons } from '../../components/ui'
import Pagination from '../../components/Pagination'
import { exportExcel, exportPdf } from '../../utils/export'
import { fmtDateTime } from '../../utils/format'

const PAGE_SIZE = 25
const label = a => a.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase())
const COLUMNS = [
  { label: 'Date', value: r => fmtDateTime(r.created_at) },
  { label: 'Utilisateur', value: 'user_label' },
  { label: 'Action', value: r => label(r.action) },
  { label: 'Élément', value: r => [r.entity_type, r.entity_label].filter(Boolean).join(' · ') },
  { label: 'Avant', value: r => (r.avant ? JSON.stringify(r.avant) : '') },
  { label: 'Après', value: r => (r.apres ? JSON.stringify(r.apres) : '') },
]

function Diff({ avant, apres }) {
  const keys = [...new Set([...Object.keys(avant || {}), ...Object.keys(apres || {})])]
  const v = x => (x === null || x === undefined ? '—' : typeof x === 'object' ? JSON.stringify(x) : String(x))
  return (
    <table className="text-xs w-full">
      <thead><tr className="text-gray-400"><th className="text-left font-medium pr-3">Champ</th><th className="text-left font-medium pr-3">Avant</th><th className="text-left font-medium">Après</th></tr></thead>
      <tbody>{keys.map(k => (
        <tr key={k} className={v(avant?.[k]) !== v(apres?.[k]) ? 'text-gray-900' : 'text-gray-400'}>
          <td className="pr-3 py-0.5 font-mono">{k}</td><td className="pr-3 py-0.5 break-all">{avant ? v(avant[k]) : ''}</td><td className="py-0.5 break-all">{apres ? v(apres[k]) : ''}</td>
        </tr>
      ))}</tbody>
    </table>
  )
}

export default function AuditLog() {
  const [rows, setRows] = useState(null)
  const [opts, setOpts] = useState({ actions: [], users: [], types: [] })
  const [filters, setFilters] = useState({ user_id: '', action: '', entity_type: '', date_debut: '', date_fin: '', search: '' })
  const [open, setOpen] = useState(null)
  const [page, setPage] = useState(1)

  useEffect(() => { api.get('/audit/filtres').then(r => setOpts(r.data)) }, [])
  useEffect(() => {
    const t = setTimeout(() => api.get('/audit', { params: Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) }).then(r => setRows(r.data)), 250)
    return () => clearTimeout(t)
  }, [filters])
  const setF = (k, v) => { setFilters(p => ({ ...p, [k]: v })); setPage(1) }
  const list = rows || []

  return (
    <div>
      <PageHeader title="Journal d'audit" subtitle="Créations, suspensions, suppressions, transferts, paiements et modifications sensibles.">
        <ExportButtons disabled={!list.length}
          onExcel={() => exportExcel({ filename: 'journal_audit', columns: COLUMNS, rows: list })}
          onPdf={() => exportPdf({ filename: 'journal_audit', title: "Journal d'audit", columns: COLUMNS.slice(0, 4), rows: list })} />
      </PageHeader>
      <div className="card mb-5 grid grid-cols-2 lg:grid-cols-6 gap-3">
        <input className="input col-span-2" placeholder="Rechercher un élément ou un utilisateur…" value={filters.search} onChange={e => setF('search', e.target.value)} />
        <select className="input" value={filters.user_id} onChange={e => setF('user_id', e.target.value)}>
          <option value="">Tous les utilisateurs</option>
          {opts.users.map(u => <option key={u.user_id} value={u.user_id}>{u.user_label}</option>)}
        </select>
        <select className="input" value={filters.action} onChange={e => setF('action', e.target.value)}>
          <option value="">Toutes les actions</option>
          {opts.actions.map(a => <option key={a} value={a}>{label(a)}</option>)}
        </select>
        <input type="date" className="input" value={filters.date_debut} onChange={e => setF('date_debut', e.target.value)} title="Du" />
        <input type="date" className="input" value={filters.date_fin} onChange={e => setF('date_fin', e.target.value)} title="Au" />
      </div>
      {!rows ? <Spinner /> : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-100 text-left text-xs text-gray-500 uppercase">
              <th className="pb-2 font-medium">Date</th><th className="pb-2 font-medium">Utilisateur</th><th className="pb-2 font-medium">Action</th><th className="pb-2 font-medium">Élément</th><th />
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(r => (
                <Fragment key={r.id}>
                  <tr className="hover:bg-gray-50 cursor-pointer" onClick={() => setOpen(open === r.id ? null : r.id)}>
                    <td className="py-2 text-xs whitespace-nowrap">{fmtDateTime(r.created_at)}</td>
                    <td className="py-2">{r.user_label}</td>
                    <td className="py-2 font-medium">{label(r.action)}</td>
                    <td className="py-2 text-gray-600">{[r.entity_type, r.entity_label].filter(Boolean).join(' · ')}</td>
                    <td className="py-2 text-right">{(r.avant || r.apres) && <ChevronDown size={14} className={`inline transition-transform ${open === r.id ? 'rotate-180' : ''}`} />}</td>
                  </tr>
                  {open === r.id && (r.avant || r.apres) && <tr><td colSpan={5} className="bg-gray-50 px-3 py-2"><Diff avant={r.avant} apres={r.apres} /></td></tr>}
                </Fragment>
              ))}
            </tbody>
          </table>
          <Pagination page={page} totalPages={Math.ceil(list.length / PAGE_SIZE)} total={list.length} onPageChange={setPage} />
        </div>
      )}
    </div>
  )
}
