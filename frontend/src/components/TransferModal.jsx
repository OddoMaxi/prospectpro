// Transfert de portefeuille (global ou élément par élément), définitif ou temporaire
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { api } from '../api'
import { Modal, Field, Spinner, errMsg } from './ui'
import { personName } from '../utils/format'

export default function TransferModal({ agent, motif = 'manuel', onClose, onDone }) {
  const [agents, setAgents] = useState([])
  const [pf, setPf] = useState(null)
  const [dest, setDest] = useState('')
  const [type, setType] = useState(motif === 'suppression' ? 'definitif' : 'definitif')
  const [mode, setMode] = useState('tout')
  const [sel, setSel] = useState({ clients: new Set(), prospects: new Set() })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get('/agents/selectable').then(r => setAgents(r.data.filter(a => a.id !== agent.id)))
    api.get(`/agents/${agent.id}/portefeuille`).then(r => setPf(r.data))
  }, [agent.id])

  const toggle = (kind, id) => setSel(s => {
    const n = new Set(s[kind])
    n.has(id) ? n.delete(id) : n.add(id)
    return { ...s, [kind]: n }
  })

  const submit = async e => {
    e.preventDefault()
    if (!dest) return toast.error('Choisissez l\'agent destinataire')
    if (mode === 'selection' && !sel.clients.size && !sel.prospects.size) return toast.error('Sélectionnez au moins un élément')
    setSaving(true)
    try {
      const r = await api.post(`/agents/${agent.id}/transferer`, {
        destinataire_id: dest, type, motif: type === 'temporaire' ? 'inactivite' : motif,
        ...(mode === 'selection' ? { client_ids: [...sel.clients], prospect_ids: [...sel.prospects] } : {}),
      })
      toast.success(r.data.message)
      onDone()
    } catch (err) { toast.error(errMsg(err)) } finally { setSaving(false) }
  }

  const empty = pf && !pf.clients.length && !pf.prospects.length

  return (
    <Modal title="Transférer le portefeuille" subtitle={`De ${personName(agent)}`} onClose={onClose} size="max-w-2xl">
      {!pf ? <Spinner className="py-8" /> : empty ? (
        <p className="text-sm text-gray-500 text-center py-6">Le portefeuille de cet agent est vide.</p>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <p className="text-sm text-gray-600">{pf.clients.length} client(s) et {pf.prospects.length} prospect(s) actifs.</p>
          <Field label="Agent destinataire" required>
            <select className="input" value={dest} onChange={e => setDest(e.target.value)} required>
              <option value="">Choisir…</option>
              {agents.map(a => <option key={a.id} value={a.id}>{personName(a)}{a.parent_agent_id ? ' (Junior)' : ' (Sénior)'}</option>)}
            </select>
          </Field>
          {motif !== 'suppression' && (
            <Field label="Type de transfert" hint={type === 'temporaire' ? 'Les éléments seront restitués automatiquement quand l\'agent reprendra son activité.' : 'Le rattachement change définitivement ; l\'historique est conservé.'}>
              <div className="flex gap-2">
                {[['definitif', 'Définitif'], ['temporaire', 'Temporaire (intérim)']].map(([v, l]) => (
                  <button key={v} type="button" onClick={() => setType(v)} className={`btn btn-sm ${type === v ? 'btn-primary' : 'btn-secondary'}`}>{l}</button>
                ))}
              </div>
            </Field>
          )}
          <Field label="Éléments transférés">
            <div className="flex gap-2">
              {[['tout', 'Tout le portefeuille'], ['selection', 'Client par client']].map(([v, l]) => (
                <button key={v} type="button" onClick={() => setMode(v)} className={`btn btn-sm ${mode === v ? 'btn-primary' : 'btn-secondary'}`}>{l}</button>
              ))}
            </div>
          </Field>
          {mode === 'selection' && (
            <div className="max-h-72 overflow-y-auto border border-gray-100 rounded-xl divide-y divide-gray-50">
              {[['clients', 'Client'], ['prospects', 'Prospect']].map(([kind, label]) => pf[kind].map(x => (
                <label key={x.id} className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer">
                  <input type="checkbox" checked={sel[kind].has(x.id)} onChange={() => toggle(kind, x.id)} />
                  <span className="text-xs text-gray-400 w-16">{label}</span>
                  <span className="font-mono text-xs text-blue-600">#{x.numero}</span>
                  <span className="flex-1">{personName(x)}</span>
                  {kind === 'clients' && <span className="text-xs text-gray-400">{x.nb_contrats} contrat(s)</span>}
                </label>
              )))}
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn btn-secondary flex-1 justify-center">Annuler</button>
            <button disabled={saving} className="btn btn-primary flex-1 justify-center">{saving ? 'Transfert…' : 'Transférer'}</button>
          </div>
        </form>
      )}
    </Modal>
  )
}
