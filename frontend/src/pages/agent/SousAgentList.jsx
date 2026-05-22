import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../api'
import toast from 'react-hot-toast'
import {
  Plus, Edit, Trash2, RefreshCw, UserX, Copy, CheckCircle,
  AlertTriangle, Users, TrendingUp
} from 'lucide-react'
import Pagination from '../../components/Pagination'

const PAGE_SIZE = 10
const fmt = n => new Intl.NumberFormat('fr-FR').format(Math.round(n || 0))
const fmtCur = n => `${fmt(n)} GNF`

function DeleteModal({ agent, onConfirm, onClose, parentId }) {
  const [mode, setMode] = useState('delete')
  const [transferTo, setTransferTo] = useState('')
  // On peut transférer vers l'agent parent lui-même
  const transferOptions = [{ id: parentId, label: 'Me transférer (votre portefeuille)' }]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center shrink-0">
            <AlertTriangle size={20} className="text-red-600" />
          </div>
          <div>
            <h3 className="font-bold text-gray-900">Supprimer {agent.prenom} {agent.nom || agent.raison_sociale}</h3>
            <p className="text-sm text-gray-500 mt-0.5">Cet Agent Juniore a <strong>{fmt(agent.total_prospects)}</strong> prospect(s)</p>
          </div>
        </div>

        {Number(agent.total_prospects) > 0 && (
          <div className="space-y-3 mb-5">
            <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg border-2 transition-colors"
              style={{ borderColor: mode === 'transfer' ? '#3b82f6' : '#e5e7eb' }}>
              <input type="radio" name="mode" value="transfer" checked={mode === 'transfer'} onChange={() => setMode('transfer')} className="mt-0.5" />
              <div>
                <p className="text-sm font-medium text-gray-800">Me transférer les prospects</p>
                <p className="text-xs text-gray-500">Les prospects seront ajoutés à votre portefeuille</p>
              </div>
            </label>
            <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg border-2 transition-colors"
              style={{ borderColor: mode === 'delete' ? '#ef4444' : '#e5e7eb' }}>
              <input type="radio" name="mode" value="delete" checked={mode === 'delete'} onChange={() => setMode('delete')} className="mt-0.5" />
              <div>
                <p className="text-sm font-medium text-gray-800">Supprimer les prospects</p>
                <p className="text-xs text-red-500">Action irréversible</p>
              </div>
            </label>
          </div>
        )}

        <div className="flex gap-3">
          <button onClick={onClose} className="btn btn-secondary flex-1 justify-center">Annuler</button>
          <button
            onClick={() => onConfirm(agent.id, mode === 'transfer' ? parentId : null)}
            className="btn btn-danger flex-1 justify-center">
            <Trash2 size={15} />Supprimer
          </button>
        </div>
      </div>
    </div>
  )
}

function CredentialModal({ agentName, creds, onClose }) {
  const [copied, setCopied] = useState(false)
  const copyAll = () => {
    navigator.clipboard.writeText(`Identifiant: ${creds.username || ''}\nMot de passe temporaire: ${creds.temp_password}`)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <h3 className="font-bold text-gray-900 mb-1">Mot de passe réinitialisé</h3>
        <p className="text-sm text-gray-500 mb-4">
          Communiquez ce mot de passe temporaire à <strong>{agentName}</strong>
        </p>
        <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 mb-4">
          <p className="text-xs text-gray-500 mb-1">Mot de passe temporaire</p>
          <p className="text-xl font-mono font-bold tracking-widest text-gray-900">{creds.temp_password}</p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 mb-4">
          Ce mot de passe sera affiché une seule fois.
        </div>
        <div className="flex gap-3">
          <button onClick={copyAll} className="btn btn-secondary flex-1 justify-center">
            {copied ? <CheckCircle size={14} className="text-emerald-600" /> : <Copy size={14} />}
            {copied ? 'Copié !' : 'Copier'}
          </button>
          <button onClick={onClose} className="btn btn-primary flex-1 justify-center">Fermer</button>
        </div>
      </div>
    </div>
  )
}

export default function SousAgentList() {
  const navigate = useNavigate()
  const [agents, setAgents] = useState([])
  const [loading, setLoading] = useState(true)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [resetCreds, setResetCreds] = useState(null)
  const [resetAgentName, setResetAgentName] = useState('')
  const [page, setPage] = useState(1)
  // On récupère l'ID du parent depuis l'auth (l'utilisateur connecté)
  const [parentId, setParentId] = useState(null)

  const load = () => {
    setLoading(true)
    Promise.all([
      api.get('/agents/sous-agents'),
      api.get('/auth/me'),
    ]).then(([r, me]) => {
      setAgents(r.data)
      setParentId(me.data.id)
    }).catch(() => toast.error('Erreur de chargement'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const handleDelete = async (agentId, transferTo) => {
    try {
      await api.delete(`/agents/sous-agents/${agentId}`, { data: { transfer_to: transferTo || undefined } })
      toast.success('Sous-agent supprimé')
      setDeleteTarget(null)
      load()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erreur lors de la suppression')
    }
  }

  const handleResetPassword = async agent => {
    try {
      const r = await api.post(`/agents/sous-agents/${agent.id}/reset-password`)
      const name = agent.type_agent === 'morale'
        ? (agent.raison_sociale || agent.nom)
        : `${agent.prenom} ${agent.nom}`
      setResetAgentName(name)
      setResetCreds(r.data.credentials)
    } catch {
      toast.error('Erreur lors de la réinitialisation')
    }
  }

  const totalPages = Math.ceil(agents.length / PAGE_SIZE)
  const paginated  = agents.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  // Totaux
  const totalProspects = agents.reduce((s, a) => s + Number(a.total_prospects || 0), 0)
  const totalClients   = agents.reduce((s, a) => s + Number(a.total_clients || 0), 0)
  const totalCommissionParent = agents.reduce((s, a) => s + Number(a.prime_total || 0) * Number(a.taux_commission_parent || 0) / 100, 0)

  return (
    <div>
      {deleteTarget && (
        <DeleteModal
          agent={deleteTarget}
          parentId={parentId}
          onConfirm={handleDelete}
          onClose={() => setDeleteTarget(null)}
        />
      )}
      {resetCreds && (
        <CredentialModal agentName={resetAgentName} creds={resetCreds} onClose={() => setResetCreds(null)} />
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Mes Agents Commerciaux Juniors</h1>
          <p className="text-gray-500 text-sm mt-0.5">{agents.length} Agent(s) Commercial(aux) Juniore(s)</p>
        </div>
        <button onClick={() => navigate('/agent/sous-agents/create')} className="btn btn-primary">
          <Plus size={16} />Nouvel Agent Juniore
        </button>
      </div>

      {/* Synthèse */}
      {agents.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="card flex items-start gap-3">
            <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center shrink-0">
              <Users size={20} className="text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500 font-medium">Total prospects (équipe)</p>
              <p className="text-xl font-bold text-gray-900">{fmt(totalProspects)}</p>
              <p className="text-xs text-emerald-600">{fmt(totalClients)} clients</p>
            </div>
          </div>
          <div className="card flex items-start gap-3">
            <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center shrink-0">
              <TrendingUp size={20} className="text-green-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500 font-medium">Taux conversion (équipe)</p>
              <p className="text-xl font-bold text-gray-900">
                {totalProspects > 0 ? ((totalClients / totalProspects) * 100).toFixed(1) : 0}%
              </p>
            </div>
          </div>
          <div className="card flex items-start gap-3">
            <div className="w-10 h-10 bg-purple-50 rounded-xl flex items-center justify-center shrink-0">
              <span className="text-purple-600 text-sm font-bold">%</span>
            </div>
            <div>
              <p className="text-xs text-gray-500 font-medium">Ma commission sous-agents</p>
              <p className="text-xl font-bold text-gray-900">{fmtCur(totalCommissionParent)}</p>
              <p className="text-xs text-gray-400">Part agent parent (admin définit le taux)</p>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : agents.length === 0 ? (
        <div className="card text-center py-14">
          <UserX size={40} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">Aucun Agent Commercial Juniore enregistré</p>
          <p className="text-sm text-gray-400 mt-1 mb-4">Créez des Agents Juniors pour développer votre réseau commercial</p>
          <button onClick={() => navigate('/agent/sous-agents/create')} className="btn btn-primary">
            <Plus size={16} />Créer le premier Agent Juniore
          </button>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-gray-500 text-xs uppercase tracking-wide">
                <th className="pb-3 font-medium text-left">Agent Juniore</th>
                <th className="pb-3 font-medium text-left">Contact</th>
                <th className="pb-3 font-medium text-right">Prospects</th>
                <th className="pb-3 font-medium text-right">Clients</th>
                <th className="pb-3 font-medium text-right">Primes</th>
                <th className="pb-3 font-medium text-right">Comm. agent</th>
                <th className="pb-3 font-medium text-right">Ma part</th>
                <th className="pb-3 font-medium text-center">Statut</th>
                <th className="pb-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {paginated.map(agent => {
                const name = agent.type_agent === 'morale'
                  ? (agent.raison_sociale || agent.nom)
                  : `${agent.prenom} ${agent.nom}`
                const commAgent  = Number(agent.commission_agent || 0)
                const tauxParent = Number(agent.taux_commission_parent || 0)
                const maCommission = Number(agent.prime_total || 0) * tauxParent / 100
                const convRate = Number(agent.total_prospects) > 0
                  ? ((Number(agent.total_clients) / Number(agent.total_prospects)) * 100).toFixed(0)
                  : 0
                return (
                  <tr key={agent.id} className="hover:bg-gray-50">
                    <td className="py-3">
                      <div>
                        <p className="font-semibold text-gray-900">{name}</p>
                        <p className="text-xs text-gray-400">@{agent.username}</p>
                        {agent.type_agent === 'morale' && (
                          <span className="inline-flex px-1.5 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-700 mt-0.5">Morale</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 text-gray-500">
                      <div className="text-xs space-y-0.5">
                        {agent.email && <p>{agent.email}</p>}
                        {agent.telephone && <p>{agent.telephone}</p>}
                      </div>
                    </td>
                    <td className="py-3 text-right">
                      <span className="font-medium text-gray-900">{fmt(agent.total_prospects)}</span>
                      <div className="text-xs text-gray-400">conv. {convRate}%</div>
                    </td>
                    <td className="py-3 text-right text-emerald-700 font-medium">{fmt(agent.total_clients)}</td>
                    <td className="py-3 text-right text-gray-700 text-xs">{fmtCur(agent.prime_total)}</td>
                    <td className="py-3 text-right text-xs">
                      <span className="text-blue-700 font-medium">{fmtCur(commAgent)}</span>
                      <div className="text-gray-400">taux {agent.taux_commission}%</div>
                    </td>
                    <td className="py-3 text-right text-xs">
                      {tauxParent > 0 ? (
                        <>
                          <span className="text-purple-700 font-medium">{fmtCur(maCommission)}</span>
                          <div className="text-gray-400">taux {tauxParent}%</div>
                        </>
                      ) : (
                        <span className="text-gray-400 text-xs italic">Non défini<br/>(admin)</span>
                      )}
                    </td>
                    <td className="py-3 text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        agent.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {agent.is_active ? 'Actif' : 'Inactif'}
                      </span>
                    </td>
                    <td className="py-3 text-right">
                      <div className="flex items-center gap-1.5 justify-end">
                        <button
                          onClick={() => navigate(`/agent/sous-agents/${agent.id}/edit`)}
                          className="btn btn-secondary btn-sm" title="Modifier les objectifs"
                        >
                          <Edit size={13} />
                        </button>
                        <button
                          onClick={() => handleResetPassword(agent)}
                          className="btn btn-secondary btn-sm" title="Réinitialiser le mot de passe"
                        >
                          <RefreshCw size={13} />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(agent)}
                          className="btn btn-danger btn-sm" title="Supprimer"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <Pagination page={page} totalPages={totalPages} total={agents.length} onPageChange={setPage} />
        </div>
      )}
    </div>
  )
}
