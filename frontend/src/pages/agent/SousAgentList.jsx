import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Plus, Edit, KeyRound, Users } from 'lucide-react'
import { api } from '../../api'
import { Spinner, PageHeader, Empty, Badge, Modal, errMsg } from '../../components/ui'
import { personName, fmtTel, fmtDate, STATUTS_AGENT } from '../../utils/format'

// Le Sénior crée ses Juniors et fixe leurs objectifs ; la suspension et la suppression relèvent de l'administrateur.
export default function SousAgentList() {
  const navigate = useNavigate()
  const [rows, setRows] = useState(null)
  const [creds, setCreds] = useState(null)
  useEffect(() => { api.get('/agents/sous-agents').then(r => setRows(r.data)) }, [])

  const resetPwd = async a => {
    if (!confirm(`Réinitialiser le mot de passe de ${personName(a)} ?`)) return
    try { const r = await api.post(`/agents/sous-agents/${a.id}/reset-password`); setCreds({ name: personName(a), ...r.data.credentials }) } catch (err) { toast.error(errMsg(err)) }
  }

  return (
    <div>
      {creds && (
        <Modal title="Mot de passe réinitialisé" subtitle={creds.name} onClose={() => setCreds(null)}>
          <p className="text-2xl font-mono font-bold tracking-widest text-center bg-gray-50 rounded-xl py-4">{creds.temp_password}</p>
        </Modal>
      )}
      <PageHeader title="Mes agents Juniors" subtitle="Leurs performances consolidées sont sur votre tableau de bord (vue « Mon équipe »).">
        <Link to="/agent/juniors/create" className="btn btn-primary"><Plus size={16} />Nouveau Junior</Link>
      </PageHeader>
      {!rows ? <Spinner /> : rows.length === 0 ? <Empty icon={Users} text="Aucun agent Junior" /> : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs text-gray-500 uppercase tracking-wide">
                <th className="pb-3 font-medium">Agent Junior</th>
                <th className="pb-3 font-medium hidden sm:table-cell">Téléphone</th>
                <th className="pb-3 font-medium text-right">Prospects</th>
                <th className="pb-3 font-medium text-right">Clients</th>
                <th className="pb-3 font-medium hidden md:table-cell">Dernière activité</th>
                <th className="pb-3 font-medium text-center">Statut</th>
                <th className="pb-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map(a => (
                <tr key={a.id} className="hover:bg-gray-50">
                  <td className="py-3"><p className="font-medium text-gray-900">{personName(a)}</p><p className="text-xs text-gray-400">@{a.username}</p></td>
                  <td className="py-3 text-gray-600 hidden sm:table-cell">{fmtTel(a.telephone)}</td>
                  <td className="py-3 text-right">{a.total_prospects}</td>
                  <td className="py-3 text-right">{a.total_clients}</td>
                  <td className="py-3 text-xs text-gray-500 hidden md:table-cell">{fmtDate(a.last_activity_at)}</td>
                  <td className="py-3 text-center"><Badge def={STATUTS_AGENT} value={a.statut} /></td>
                  <td className="py-3 text-right">
                    <div className="flex justify-end gap-1.5">
                      <button onClick={() => navigate(`/agent/juniors/${a.id}/edit`)} className="btn btn-secondary btn-sm" title="Modifier / objectifs"><Edit size={13} /></button>
                      <button onClick={() => resetPwd(a)} className="btn btn-secondary btn-sm" title="Réinitialiser le mot de passe"><KeyRound size={13} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
