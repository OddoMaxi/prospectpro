// Liste des prospects, partagée par l'administrateur (tous) et les commerciaux (leur périmètre).
// La création ne se fait que depuis le menu « Nouveau prospect ».
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Search, Edit, Trash2, UserCheck } from 'lucide-react'
import { api } from '../../api'
import { useAuth } from '../../context/AuthContext'
import { useExercice } from '../../context/ExerciceContext'
import Pagination from '../../components/Pagination'
import ContratForm from '../../components/ContratForm'
import { Spinner, PageHeader, Empty, Badge, ExportButtons, errMsg } from '../../components/ui'
import { exportExcel, exportPdf } from '../../utils/export'
import { personName, fmtMoney, fmtDate, fmtTel, STATUTS_PROSPECT } from '../../utils/format'

const PAGE_SIZE = 15
const TYPES = { physique: 'Particulier', morale: 'Entreprise' }
const NIVEAUX = { Faible: 'text-gray-500 bg-gray-100', Moyen: 'text-amber-700 bg-amber-100', Élevé: 'text-emerald-700 bg-emerald-100' }
const MODIFIABLES = ['prospect', 'en_cours', 'perdu']
const lieu = p => (p.type === 'physique' ? p.lieu_residence_quartier || p.lieu_residence_commune : p.siege_social_quartier || p.siege_social_commune) || '—'

const COLUMNS = [
  { label: 'N°', value: 'numero' },
  { label: 'Nom', value: p => personName(p) },
  { label: 'Type', value: p => TYPES[p.type] },
  { label: 'Téléphone', value: 'telephone' },
  { label: 'Profession / Secteur', value: p => p.profession || p.secteur_activite },
  { label: 'Localisation', value: lieu },
  { label: 'Intérêt', value: 'niveau_interet' },
  { label: 'Statut', value: p => STATUTS_PROSPECT[p.statut]?.label },
  { label: 'Prime pure prév.', value: 'montant_potentiel', type: 'money' },
  { label: 'Date', value: 'date_prospection', type: 'date' },
  { label: 'Agent', value: p => personName(p, 'agent_') },
]

export default function ProspectList({ admin = false }) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { annee } = useExercice()
  const [prospects, setProspects] = useState(null)
  const [agents, setAgents] = useState([])
  const [filters, setFilters] = useState({ search: '', type: '', statut: '', niveau_interet: '', agent_id: '' })
  const [page, setPage] = useState(1)
  const [convertId, setConvertId] = useState(null)

  useEffect(() => {
    if (admin) api.get('/agents').then(r => setAgents(r.data)).catch(() => {})
    else if (!user?.parent_agent_id) api.get('/agents/sous-agents').then(r => setAgents(r.data)).catch(() => {})
  }, [admin, user])

  const load = () => {
    const params = { ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)), annee }
    api.get('/prospects', { params }).then(r => setProspects(r.data))
  }
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t) }, [filters, annee])
  const setF = (k, v) => { setFilters(p => ({ ...p, [k]: v })); setPage(1) }

  const canEdit = p => !admin && p.agent_id === user?.id && MODIFIABLES.includes(p.statut)
  const canAct = p => (admin || p.agent_id === user?.id) && MODIFIABLES.includes(p.statut)

  const handleDelete = async p => {
    if (!confirm(`Supprimer le prospect ${personName(p)} ?`)) return
    try { await api.delete(`/prospects/${p.id}`); toast.success('Prospect supprimé'); load() } catch (err) { toast.error(errMsg(err)) }
  }
  const handleStatus = async (p, statut) => {
    try { await api.patch(`/prospects/${p.id}/statut`, { statut }); setProspects(prev => prev.map(x => (x.id === p.id ? { ...x, statut } : x))) } catch (err) { toast.error(errMsg(err)) }
  }

  const rows = prospects || []
  const paginated = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const showAgent = admin || agents.length > 0
  const title = admin ? 'Prospects' : 'Mes prospects'

  return (
    <div>
      {convertId && <ContratForm prospectId={convertId} onClose={() => setConvertId(null)} onDone={() => { setConvertId(null); load() }} />}

      <PageHeader title={title} subtitle={`Exercice ${annee} · ${rows.length} prospect(s)`}>
        <ExportButtons disabled={!rows.length}
          onExcel={() => exportExcel({ filename: 'prospects', columns: COLUMNS, rows })}
          onPdf={() => exportPdf({ filename: 'prospects', title, subtitle: `Exercice ${annee}`, columns: COLUMNS, rows })} />
      </PageHeader>

      <div className="card mb-5 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="relative col-span-2 md:col-span-3 lg:col-span-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="input pl-9" placeholder="Nom, téléphone, n°…" value={filters.search} onChange={e => setF('search', e.target.value)} />
        </div>
        <select className="input" value={filters.type} onChange={e => setF('type', e.target.value)}>
          <option value="">Tous les types</option>
          <option value="physique">Particuliers</option>
          <option value="morale">Entreprises</option>
        </select>
        <select className="input" value={filters.statut} onChange={e => setF('statut', e.target.value)}>
          <option value="">Tous les statuts</option>
          {['prospect', 'en_cours', 'perdu', 'converti'].map(k => <option key={k} value={k}>{STATUTS_PROSPECT[k].label}</option>)}
        </select>
        <select className="input" value={filters.niveau_interet} onChange={e => setF('niveau_interet', e.target.value)}>
          <option value="">Tout intérêt</option>
          {Object.keys(NIVEAUX).map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        {showAgent && (
          <select className="input" value={filters.agent_id} onChange={e => setF('agent_id', e.target.value)}>
            <option value="">Tous les agents</option>
            {!admin && <option value={user.id}>Moi uniquement</option>}
            {agents.map(a => <option key={a.id} value={a.id}>{personName(a)}</option>)}
          </select>
        )}
      </div>

      {!prospects ? <Spinner /> : rows.length === 0 ? (
        <Empty icon={Search} text={`Aucun prospect pour l'exercice ${annee}`} />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs text-gray-500 uppercase tracking-wide">
                <th className="pb-3 font-medium">N°</th>
                <th className="pb-3 font-medium">Nom</th>
                <th className="pb-3 font-medium hidden sm:table-cell">Téléphone</th>
                <th className="pb-3 font-medium hidden lg:table-cell">Localisation</th>
                {showAgent && <th className="pb-3 font-medium hidden md:table-cell">Agent</th>}
                <th className="pb-3 font-medium text-center">Intérêt</th>
                <th className="pb-3 font-medium text-center">Statut</th>
                <th className="pb-3 font-medium text-right hidden sm:table-cell">Prime pure prév.</th>
                <th className="pb-3 font-medium text-right hidden md:table-cell">Date</th>
                <th className="pb-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {paginated.map(p => (
                <tr key={p.id} className={`hover:bg-gray-50 ${p.statut === 'perdu' ? 'opacity-60' : ''}`}>
                  <td className="py-3 pr-2"><span className="font-mono text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">#{p.numero}</span></td>
                  <td className="py-3">
                    <p className="font-medium text-gray-900">{personName(p)}</p>
                    <p className="text-xs text-gray-400">{TYPES[p.type]}{p.profession || p.secteur_activite ? ` · ${p.profession || p.secteur_activite}` : ''}</p>
                  </td>
                  <td className="py-3 text-gray-600 hidden sm:table-cell">{fmtTel(p.telephone)}</td>
                  <td className="py-3 text-gray-500 max-w-[140px] truncate hidden lg:table-cell">{lieu(p)}</td>
                  {showAgent && <td className="py-3 hidden md:table-cell text-xs text-gray-600">{personName(p, 'agent_')}</td>}
                  <td className="py-3 text-center">
                    {p.niveau_interet ? <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${NIVEAUX[p.niveau_interet]}`}>{p.niveau_interet}</span> : '—'}
                  </td>
                  <td className="py-3 text-center">
                    {canEdit(p) ? (
                      <select className="text-xs rounded-full px-2 py-0.5 border-0 bg-gray-100" value={p.statut} onChange={e => handleStatus(p, e.target.value)}>
                        {MODIFIABLES.map(s => <option key={s} value={s}>{STATUTS_PROSPECT[s].label}</option>)}
                      </select>
                    ) : <Badge def={STATUTS_PROSPECT} value={p.statut} />}
                  </td>
                  <td className="py-3 text-right tabular-nums hidden sm:table-cell">{p.montant_potentiel > 0 ? fmtMoney(p.montant_potentiel) : '—'}</td>
                  <td className="py-3 text-right text-xs text-gray-500 hidden md:table-cell">{fmtDate(p.date_prospection)}</td>
                  <td className="py-3 text-right">
                    <div className="flex items-center gap-1.5 justify-end">
                      {canEdit(p) && <button onClick={() => navigate(`/agent/prospects/${p.id}/edit`)} className="btn btn-secondary btn-sm" title="Modifier"><Edit size={13} /></button>}
                      {canAct(p) && p.statut !== 'perdu' && (
                        <button onClick={() => setConvertId(p.id)} className="btn btn-success btn-sm" title="Convertir en client"><UserCheck size={13} /></button>
                      )}
                      {canAct(p) && <button onClick={() => handleDelete(p)} className="btn btn-danger btn-sm" title="Supprimer"><Trash2 size={13} /></button>}
                      {!canAct(p) && p.client_id && <button onClick={() => navigate(`${admin ? '/admin' : '/agent'}/clients/${p.client_id}`)} className="text-xs text-blue-600 hover:underline">Voir le client</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={page} totalPages={Math.ceil(rows.length / PAGE_SIZE)} total={rows.length} onPageChange={setPage} />
        </div>
      )}
    </div>
  )
}
