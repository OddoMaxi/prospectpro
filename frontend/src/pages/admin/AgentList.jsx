import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Plus, Edit, Trash2, KeyRound, ArrowLeftRight, PauseCircle, PlayCircle, Search, Users } from 'lucide-react'
import { api } from '../../api'
import { Spinner, PageHeader, Empty, Badge, Modal, ExportButtons, errMsg } from '../../components/ui'
import TransferModal from '../../components/TransferModal'
import Pagination from '../../components/Pagination'
import { personName, fmtDate, fmtTel, STATUTS_AGENT } from '../../utils/format'
import { exportExcel, exportPdf } from '../../utils/export'

const PAGE_SIZE = 15

const COLUMNS = [
  { label: 'Agent', value: a => personName(a) },
  { label: 'Identifiant', value: 'username' },
  { label: 'Niveau', value: a => (a.parent_agent_id ? `Junior de ${personName(a, 'parent_')}` : 'Sénior') },
  { label: 'Téléphone', value: 'telephone' },
  { label: 'Statut', value: a => STATUTS_AGENT[a.statut]?.label },
  { label: 'Prospects', value: 'total_prospects', type: 'number' },
  { label: 'Clients', value: 'total_clients', type: 'number' },
  { label: 'Dernière activité', value: a => a.last_activity_at, type: 'date' },
]

function DeleteModal({ agent, onClose, onTransfer, onDone }) {
  const [saving, setSaving] = useState(false)
  const [blocked, setBlocked] = useState(null)
  const submit = async () => {
    setSaving(true)
    try {
      const r = await api.delete(`/agents/${agent.id}`)
      toast.success(r.data.message)
      onDone()
    } catch (err) {
      if (err.response?.status === 409) setBlocked(err.response.data)
      else toast.error(errMsg(err))
    } finally { setSaving(false) }
  }
  return (
    <Modal title={`Supprimer ${personName(agent)}`} onClose={onClose}>
      {blocked ? (
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
            <p className="font-semibold mb-1">{blocked.error}</p>
            <p>{blocked.clients} client(s), {blocked.prospects} prospect(s){blocked.juniors ? `, ${blocked.juniors} Junior(s) rattaché(s)` : ''}.</p>
            {blocked.juniors > 0 && <p className="mt-1">Rattachez d'abord ses Juniors à un autre Sénior ou supprimez-les.</p>}
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} className="btn btn-secondary flex-1 justify-center">Fermer</button>
            {(blocked.clients > 0 || blocked.prospects > 0) && <button onClick={onTransfer} className="btn btn-primary flex-1 justify-center"><ArrowLeftRight size={15} />Transférer le portefeuille</button>}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">L'agent passera au statut « Supprimé » : il ne pourra plus se connecter et ne sera plus proposé dans les listes. Son historique et ses commissions déjà acquises sont conservés et restent dus.</p>
          <div className="flex gap-3">
            <button onClick={onClose} className="btn btn-secondary flex-1 justify-center">Annuler</button>
            <button onClick={submit} disabled={saving} className="btn btn-danger flex-1 justify-center">{saving ? 'Vérification…' : 'Supprimer'}</button>
          </div>
        </div>
      )}
    </Modal>
  )
}

export default function AgentList() {
  const navigate = useNavigate()
  const [rows, setRows] = useState(null)
  const [filters, setFilters] = useState({ search: '', statut: '', niveau: '' })
  const [page, setPage] = useState(1)
  const [transfer, setTransfer] = useState(null)
  const [del, setDel] = useState(null)
  const [creds, setCreds] = useState(null)

  const load = () => api.get('/agents', { params: filters.statut === 'supprime' ? { inclure_supprimes: 1 } : {} }).then(r => setRows(r.data))
  useEffect(() => { load() }, [filters.statut === 'supprime'])
  const setF = (k, v) => { setFilters(p => ({ ...p, [k]: v })); setPage(1) }

  const changeStatut = async (a, action) => {
    if (action === 'suspendre' && !confirm(`Suspendre ${personName(a)} ? Sa connexion sera bloquée immédiatement.`)) return
    try { const r = await api.patch(`/agents/${a.id}/statut`, { action }); toast.success(r.data.message); load() } catch (err) { toast.error(errMsg(err)) }
  }
  const resetPwd = async a => {
    if (!confirm(`Réinitialiser le mot de passe de ${personName(a)} ?`)) return
    try { const r = await api.post(`/agents/${a.id}/reset-password`); setCreds({ name: personName(a), ...r.data.credentials }) } catch (err) { toast.error(errMsg(err)) }
  }

  const s = filters.search.toLowerCase()
  const shown = (rows || []).filter(a =>
    (!filters.statut || a.statut === filters.statut) &&
    (!filters.niveau || (filters.niveau === 'junior') === !!a.parent_agent_id) &&
    (!s || `${personName(a)} ${a.username} ${a.telephone}`.toLowerCase().includes(s)))
  const paginated = shown.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div>
      {transfer && <TransferModal agent={transfer.agent} motif={transfer.motif} onClose={() => setTransfer(null)} onDone={() => { setTransfer(null); load() }} />}
      {del && <DeleteModal agent={del} onClose={() => setDel(null)} onDone={() => { setDel(null); load() }}
        onTransfer={() => { setTransfer({ agent: del, motif: 'suppression' }); setDel(null) }} />}
      {creds && (
        <Modal title="Mot de passe réinitialisé" subtitle={creds.name} onClose={() => setCreds(null)}>
          <p className="text-sm text-gray-500 mb-2">Mot de passe temporaire à communiquer :</p>
          <p className="text-2xl font-mono font-bold tracking-widest text-center bg-gray-50 rounded-xl py-4">{creds.temp_password}</p>
        </Modal>
      )}

      <PageHeader title="Agents commerciaux" subtitle="L'administrateur crée les Séniors ; chaque Sénior crée ses Juniors.">
        <ExportButtons disabled={!shown.length}
          onExcel={() => exportExcel({ filename: 'agents', columns: COLUMNS, rows: shown })}
          onPdf={() => exportPdf({ filename: 'agents', title: 'Agents commerciaux', columns: COLUMNS, rows: shown })} />
        <Link to="/admin/agents/create" className="btn btn-primary"><Plus size={16} />Nouvel agent Sénior</Link>
      </PageHeader>

      <div className="card mb-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="input pl-9" placeholder="Nom, identifiant, téléphone…" value={filters.search} onChange={e => setF('search', e.target.value)} />
        </div>
        <select className="input" value={filters.statut} onChange={e => setF('statut', e.target.value)}>
          <option value="">Tous les statuts (hors supprimés)</option>
          {Object.entries(STATUTS_AGENT).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select className="input" value={filters.niveau} onChange={e => setF('niveau', e.target.value)}>
          <option value="">Séniors et Juniors</option>
          <option value="senior">Séniors</option>
          <option value="junior">Juniors</option>
        </select>
      </div>

      {!rows ? <Spinner /> : shown.length === 0 ? <Empty icon={Users} text="Aucun agent" /> : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs text-gray-500 uppercase tracking-wide">
                <th className="pb-3 font-medium">Agent</th>
                <th className="pb-3 font-medium hidden md:table-cell">Niveau</th>
                <th className="pb-3 font-medium hidden lg:table-cell">Contact</th>
                <th className="pb-3 font-medium text-right">Prospects</th>
                <th className="pb-3 font-medium text-right">Clients</th>
                <th className="pb-3 font-medium hidden lg:table-cell">Dernière activité</th>
                <th className="pb-3 font-medium text-center">Statut</th>
                <th className="pb-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {paginated.map(a => (
                <tr key={a.id} className={`hover:bg-gray-50 ${a.statut === 'supprime' ? 'opacity-60' : ''}`}>
                  <td className="py-3">
                    <p className="font-medium text-gray-900">{personName(a)}</p>
                    <p className="text-xs text-gray-400">@{a.username}</p>
                  </td>
                  <td className="py-3 hidden md:table-cell text-xs">
                    {a.parent_agent_id
                      ? <><span className="px-2 py-0.5 rounded-full bg-orange-50 text-orange-700 font-medium">Junior</span><span className="block text-gray-400 mt-1">de {personName(a, 'parent_')}</span></>
                      : <><span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium">Sénior</span>{a.total_juniors > 0 && <span className="block text-gray-400 mt-1">{a.total_juniors} Junior(s)</span>}</>}
                  </td>
                  <td className="py-3 text-gray-600 hidden lg:table-cell">{fmtTel(a.telephone)}</td>
                  <td className="py-3 text-right">{a.total_prospects}</td>
                  <td className="py-3 text-right">{a.total_clients}</td>
                  <td className="py-3 text-xs text-gray-500 hidden lg:table-cell">{fmtDate(a.last_activity_at)}</td>
                  <td className="py-3 text-center"><Badge def={STATUTS_AGENT} value={a.statut} /></td>
                  <td className="py-3 text-right">
                    {a.statut !== 'supprime' && (
                      <div className="flex justify-end gap-1">
                        <button onClick={() => navigate(`/admin/agents/${a.id}/edit`)} className="btn btn-secondary btn-sm" title="Modifier / objectifs"><Edit size={13} /></button>
                        {a.statut === 'actif'
                          ? <button onClick={() => changeStatut(a, 'suspendre')} className="btn btn-secondary btn-sm" title="Suspendre"><PauseCircle size={13} /></button>
                          : <button onClick={() => changeStatut(a, 'reactiver')} className="btn btn-success btn-sm" title="Réactiver"><PlayCircle size={13} /></button>}
                        <button onClick={() => setTransfer({ agent: a, motif: 'manuel' })} className="btn btn-secondary btn-sm" title="Transférer le portefeuille"><ArrowLeftRight size={13} /></button>
                        <button onClick={() => resetPwd(a)} className="btn btn-secondary btn-sm" title="Réinitialiser le mot de passe"><KeyRound size={13} /></button>
                        <button onClick={() => setDel(a)} className="btn btn-danger btn-sm" title="Supprimer"><Trash2 size={13} /></button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={page} totalPages={Math.ceil(shown.length / PAGE_SIZE)} total={shown.length} onPageChange={setPage} />
        </div>
      )}
    </div>
  )
}
