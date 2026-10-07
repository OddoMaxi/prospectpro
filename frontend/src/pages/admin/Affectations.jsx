// Historique des transferts : qui suivait quel client / prospect, quand et pourquoi
import { useEffect, useState } from 'react'
import { api } from '../../api'
import { Spinner, PageHeader, ExportButtons } from '../../components/ui'
import Pagination from '../../components/Pagination'
import { exportExcel, exportPdf } from '../../utils/export'
import { personName, fmtDateTime } from '../../utils/format'

const MOTIFS = { inactivite: 'Inactivité', suppression: "Suppression de l'agent", manuel: 'Réaffectation manuelle', restitution: 'Restitution' }
const PAGE_SIZE = 20
const elt = a => `${a.entity_type === 'client' ? 'Client' : 'Prospect'} #${a.entity_numero} ${personName({ nom: a.entity_nom, prenom: a.entity_prenom, type: a.entity_kind })}`
const COLUMNS = [
  { label: 'Élément', value: elt },
  { label: "Agent d'origine", value: a => personName(a, 'origine_') },
  { label: 'Agent destinataire', value: a => personName(a, 'dest_') },
  { label: 'Début', value: a => fmtDateTime(a.date_debut) },
  { label: 'Fin', value: a => (a.date_fin ? fmtDateTime(a.date_fin) : 'en cours') },
  { label: 'Type', value: a => (a.type === 'temporaire' ? 'Temporaire' : 'Définitif') },
  { label: 'Motif', value: a => MOTIFS[a.motif] || a.motif },
  { label: 'Auteur', value: a => (a.auteur_nom ? `${a.auteur_prenom} ${a.auteur_nom}` : 'Système') },
]

export default function Affectations() {
  const [rows, setRows] = useState(null)
  const [agents, setAgents] = useState([])
  const [filters, setFilters] = useState({ agent_id: '', type: '', motif: '', en_cours: '' })
  const [page, setPage] = useState(1)
  useEffect(() => { api.get('/agents', { params: { inclure_supprimes: 1 } }).then(r => setAgents(r.data)) }, [])
  useEffect(() => { api.get('/affectations', { params: Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) }).then(r => setRows(r.data)) }, [filters])
  const setF = (k, v) => { setFilters(p => ({ ...p, [k]: v })); setPage(1) }
  const list = rows || []

  return (
    <div>
      <PageHeader title="Historique des affectations" subtitle="Le rattachement client → agent n'est jamais écrasé : chaque transfert est conservé.">
        <ExportButtons disabled={!list.length}
          onExcel={() => exportExcel({ filename: 'affectations', columns: COLUMNS, rows: list })}
          onPdf={() => exportPdf({ filename: 'affectations', title: 'Historique des affectations', columns: COLUMNS, rows: list })} />
      </PageHeader>
      <div className="card mb-5 grid grid-cols-2 lg:grid-cols-4 gap-3">
        <select className="input" value={filters.agent_id} onChange={e => setF('agent_id', e.target.value)}>
          <option value="">Tous les agents</option>
          {agents.map(a => <option key={a.id} value={a.id}>{personName(a)}</option>)}
        </select>
        <select className="input" value={filters.type} onChange={e => setF('type', e.target.value)}>
          <option value="">Tous les types</option><option value="temporaire">Temporaire</option><option value="definitif">Définitif</option>
        </select>
        <select className="input" value={filters.motif} onChange={e => setF('motif', e.target.value)}>
          <option value="">Tous les motifs</option>
          {Object.entries(MOTIFS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!filters.en_cours} onChange={e => setF('en_cours', e.target.checked ? '1' : '')} />En cours uniquement</label>
      </div>
      {!rows ? <Spinner /> : (
        <div className="card overflow-x-auto">
          {list.length === 0 ? <p className="text-sm text-gray-400 text-center py-8">Aucun transfert</p> : (
            <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-100 text-left text-xs text-gray-500 uppercase">
                {COLUMNS.map(c => <th key={c.label} className="pb-2 font-medium">{c.label}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-gray-50">
                {list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(a => (
                  <tr key={a.id}>{COLUMNS.map(c => <td key={c.label} className="py-2 pr-3 text-xs">{c.value(a)}</td>)}</tr>
                ))}
              </tbody>
            </table>
          )}
          <Pagination page={page} totalPages={Math.ceil(list.length / PAGE_SIZE)} total={list.length} onPageChange={setPage} />
        </div>
      )}
    </div>
  )
}
