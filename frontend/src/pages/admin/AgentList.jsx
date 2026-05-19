import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../api'
import toast from 'react-hot-toast'
import { Plus, Edit, Trash2, RefreshCw, UserX, ArrowRight, Copy, CheckCircle, AlertTriangle, ArrowLeftRight, ChevronUp, ChevronDown } from 'lucide-react'

const fmt = n => new Intl.NumberFormat('fr-FR').format(n || 0)
const fmtCur = n => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'GNF', minimumFractionDigits: 0 }).format(Math.round(n || 0))

// Modal suppression avec transfert ou suppression des prospects
function DeleteModal({ agent, agents, onConfirm, onClose }) {
  const [transferTo, setTransferTo] = useState('')
  const [mode, setMode] = useState('transfer')
  const others = agents.filter(a => a.id !== agent.id)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center shrink-0">
            <AlertTriangle size={20} className="text-red-600" />
          </div>
          <div>
            <h3 className="font-bold text-gray-900">Supprimer {agent.prenom} {agent.nom}</h3>
            <p className="text-sm text-gray-500 mt-0.5">Cet agent a <strong>{fmt(agent.total_prospects)}</strong> prospect(s)</p>
          </div>
        </div>

        {agent.total_prospects > 0 && (
          <div className="space-y-3 mb-5">
            <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg border-2 transition-colors"
              style={{ borderColor: mode === 'transfer' ? '#3b82f6' : '#e5e7eb' }}>
              <input type="radio" name="mode" value="transfer" checked={mode === 'transfer'} onChange={() => setMode('transfer')} className="mt-0.5" />
              <div>
                <p className="text-sm font-medium text-gray-800">Transférer les prospects</p>
                <p className="text-xs text-gray-500">Assigner les prospects à un autre agent</p>
              </div>
            </label>

            <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg border-2 transition-colors"
              style={{ borderColor: mode === 'delete' ? '#ef4444' : '#e5e7eb' }}>
              <input type="radio" name="mode" value="delete" checked={mode === 'delete'} onChange={() => setMode('delete')} className="mt-0.5" />
              <div>
                <p className="text-sm font-medium text-gray-800">Supprimer les prospects</p>
                <p className="text-xs text-red-500">Action irréversible — tous les prospects seront supprimés</p>
              </div>
            </label>

            {mode === 'transfer' && (
              <div>
                <label className="label">Transférer vers</label>
                <select className="input" value={transferTo} onChange={e => setTransferTo(e.target.value)}>
                  <option value="">Sélectionner un agent...</option>
                  {others.map(a => <option key={a.id} value={a.id}>{a.prenom} {a.nom}</option>)}
                </select>
              </div>
            )}
          </div>
        )}

        <div className="flex gap-3">
          <button onClick={onClose} className="btn btn-secondary flex-1 justify-center">Annuler</button>
          <button
            onClick={() => onConfirm(agent.id, mode === 'transfer' ? transferTo : null)}
            disabled={mode === 'transfer' && !transferTo && agent.total_prospects > 0}
            className="btn btn-danger flex-1 justify-center">
            <Trash2 size={15} />Supprimer
          </button>
        </div>
      </div>
    </div>
  )
}

// Modal transfert de portefeuille (sans suppression de l'agent)
function TransferModal({ agent, agents, onConfirm, onClose }) {
  const [transferTo, setTransferTo] = useState('')
  const others = agents.filter(a => a.id !== agent.id && a.is_active)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center shrink-0">
            <ArrowLeftRight size={20} className="text-blue-600" />
          </div>
          <div>
            <h3 className="font-bold text-gray-900">Transférer le portefeuille</h3>
            <p className="text-sm text-gray-500 mt-0.5">
              Transférer les <strong>{fmt(agent.total_prospects)}</strong> prospect(s) de{' '}
              <strong>{agent.prenom} {agent.nom}</strong> vers un autre agent.
              L'agent source sera conservé.
            </p>
          </div>
        </div>

        <div className="mb-5">
          <label className="label">Transférer vers</label>
          <select className="input" value={transferTo} onChange={e => setTransferTo(e.target.value)}>
            <option value="">Sélectionner un agent...</option>
            {others.map(a => (
              <option key={a.id} value={a.id}>
                {a.prenom} {a.nom} ({fmt(a.total_prospects)} prospects)
              </option>
            ))}
          </select>
          {others.length === 0 && (
            <p className="text-xs text-amber-600 mt-2">Aucun autre agent actif disponible.</p>
          )}
        </div>

        <div className="flex gap-3">
          <button onClick={onClose} className="btn btn-secondary flex-1 justify-center">Annuler</button>
          <button
            onClick={() => onConfirm(agent.id, transferTo)}
            disabled={!transferTo}
            className="btn btn-primary flex-1 justify-center">
            <ArrowRight size={15} />Transférer
          </button>
        </div>
      </div>
    </div>
  )
}

// Modal affichage des identifiants après reset
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
          Ce mot de passe sera affiché une seule fois. L'agent devra le changer à la prochaine connexion. Le portefeuille de l'agent n'est pas affecté.
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

const SORT_FIELDS = {
  nom: (a, b) => `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`),
  prenom: (a, b) => `${a.prenom} ${a.nom}`.localeCompare(`${b.prenom} ${b.nom}`),
  total_prospects: (a, b) => Number(b.total_prospects) - Number(a.total_prospects),
  total_clients: (a, b) => Number(b.total_clients) - Number(a.total_clients),
  taux_commission: (a, b) => Number(b.taux_commission) - Number(a.taux_commission),
}

function SortTh({ label, sortKey, current, dir, onSort, align = 'right' }) {
  const active = current === sortKey
  const Icon = active ? (dir === 'asc' ? ChevronUp : ChevronDown) : ChevronDown
  return (
    <th
      className={`pb-3 font-medium cursor-pointer select-none hover:text-gray-800 transition-colors text-${align}`}
      onClick={() => onSort(sortKey)}
    >
      <span className={`inline-flex items-center gap-1 ${align === 'right' ? 'justify-end' : 'justify-start'}`}>
        {label}
        <Icon size={12} className={active ? 'text-blue-500' : 'text-gray-300'} />
      </span>
    </th>
  )
}

export default function AgentList() {
  const navigate = useNavigate()
  const [agents, setAgents] = useState([])
  const [loading, setLoading] = useState(true)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [transferTarget, setTransferTarget] = useState(null)
  const [resetCreds, setResetCreds] = useState(null)
  const [resetAgentName, setResetAgentName] = useState('')
  const [sortKey, setSortKey] = useState('nom')
  const [sortDir, setSortDir] = useState('asc')

  const load = () => {
    setLoading(true)
    api.get('/agents').then(r => setAgents(r.data)).finally(() => setLoading(false))
  }
  useEffect(load, [])

  const handleSort = key => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const sortedAgents = [...agents].sort((a, b) => {
    const cmp = SORT_FIELDS[sortKey] ? SORT_FIELDS[sortKey](a, b) : 0
    return sortDir === 'asc' ? cmp : -cmp
  })

  const handleDelete = async (agentId, transferTo) => {
    try {
      await api.delete(`/agents/${agentId}`, { data: { transfer_to: transferTo || undefined } })
      toast.success('Agent supprimé')
      setDeleteTarget(null)
      load()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erreur lors de la suppression')
    }
  }

  const handleTransferPortfolio = async (agentId, transferTo) => {
    try {
      const r = await api.post(`/agents/${agentId}/transfer-portfolio`, { transfer_to: transferTo })
      toast.success(r.data.message)
      setTransferTarget(null)
      load()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erreur lors du transfert')
    }
  }

  const handleResetPassword = async agent => {
    try {
      const r = await api.post(`/agents/${agent.id}/reset-password`)
      setResetAgentName(`${agent.prenom} ${agent.nom}`)
      setResetCreds(r.data.credentials)
    } catch {
      toast.error('Erreur lors de la réinitialisation')
    }
  }

  return (
    <div>
      {deleteTarget && (
        <DeleteModal agent={deleteTarget} agents={agents} onConfirm={handleDelete} onClose={() => setDeleteTarget(null)} />
      )}
      {transferTarget && (
        <TransferModal agent={transferTarget} agents={agents} onConfirm={handleTransferPortfolio} onClose={() => setTransferTarget(null)} />
      )}
      {resetCreds && (
        <CredentialModal agentName={resetAgentName} creds={resetCreds} onClose={() => setResetCreds(null)} />
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Agents commerciaux</h1>
          <p className="text-gray-500 text-sm mt-0.5">{agents.length} agent(s) enregistré(s)</p>
        </div>
        <button onClick={() => navigate('/admin/agents/create')} className="btn btn-primary">
          <Plus size={16} />Nouvel agent
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : agents.length === 0 ? (
        <div className="card text-center py-14">
          <UserX size={40} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">Aucun agent enregistré</p>
          <button onClick={() => navigate('/admin/agents/create')} className="btn btn-primary mt-4">
            <Plus size={16} />Créer le premier agent
          </button>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-gray-500 text-xs uppercase tracking-wide">
                <SortTh label="Nom" sortKey="nom" current={sortKey} dir={sortDir} onSort={handleSort} align="left" />
                <SortTh label="Prénom" sortKey="prenom" current={sortKey} dir={sortDir} onSort={handleSort} align="left" />
                <th className="pb-3 font-medium text-left">Contact</th>
                <SortTh label="Prospects" sortKey="total_prospects" current={sortKey} dir={sortDir} onSort={handleSort} />
                <SortTh label="Clients" sortKey="total_clients" current={sortKey} dir={sortDir} onSort={handleSort} />
                <SortTh label="Commission" sortKey="taux_commission" current={sortKey} dir={sortDir} onSort={handleSort} />
                <th className="pb-3 font-medium text-center">Statut</th>
                <th className="pb-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {sortedAgents.map(agent => {
                const convRate = agent.total_prospects > 0
                  ? ((agent.total_clients / agent.total_prospects) * 100).toFixed(0)
                  : 0
                return (
                  <tr key={agent.id} className="hover:bg-gray-50">
                    <td className="py-3 font-semibold text-gray-900">{agent.nom}</td>
                    <td className="py-3 text-gray-700">{agent.prenom}</td>
                    <td className="py-3 text-gray-500">
                      <div className="text-xs space-y-0.5">
                        {agent.email && <p>{agent.email}</p>}
                        {agent.telephone && <p>{agent.telephone}</p>}
                        <p className="text-gray-400">@{agent.username}</p>
                      </div>
                    </td>
                    <td className="py-3 text-right">
                      <div>
                        <span className="font-medium text-gray-900">{fmt(agent.total_prospects)}</span>
                        <div className="text-xs text-gray-400">conv. {convRate}%</div>
                      </div>
                    </td>
                    <td className="py-3 text-right text-emerald-700 font-medium">{fmt(agent.total_clients)}</td>
                    <td className="py-3 text-right">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                        {agent.taux_commission}%
                      </span>
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
                          onClick={() => navigate(`/admin/agents/${agent.id}/edit`)}
                          className="btn btn-secondary btn-sm" title="Modifier"
                        >
                          <Edit size={13} />
                        </button>
                        <button
                          onClick={() => setTransferTarget(agent)}
                          className="btn btn-secondary btn-sm" title="Transférer le portefeuille"
                          disabled={agent.total_prospects === 0}
                        >
                          <ArrowLeftRight size={13} />
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
        </div>
      )}
    </div>
  )
}
