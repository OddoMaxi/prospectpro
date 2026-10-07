// Formulaire agent commun : l'administrateur crée/modifie les Séniors (et peut corriger un Junior),
// un Sénior crée/modifie ses Juniors. Les objectifs sont fixés par produit.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { ArrowLeft, Copy, CheckCircle, User, Building2, UserPlus, History } from 'lucide-react'
import { api } from '../api'
import { Spinner, Field, errMsg } from './ui'
import { fmtMoney, fmtNum, fmtDateTime, personName } from '../utils/format'

const HORIZONS = [
  { value: 'mensuel', label: 'Mois', mult: 1 },
  { value: 'trimestre', label: 'Trimestre', mult: 3 },
  { value: 'semestre', label: 'Semestre', mult: 6 },
  { value: 'annuel', label: 'Année', mult: 12 },
]
const mult = p => HORIZONS.find(h => h.value === p)?.mult ?? 12

function Credentials({ credentials, label, onDone }) {
  const [copied, setCopied] = useState(false)
  const copy = () => navigator.clipboard.writeText(`Identifiant : ${credentials.username}\nMot de passe temporaire : ${credentials.temp_password}`)
    .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  return (
    <div className="max-w-md mx-auto">
      <div className="card border-emerald-200 bg-emerald-50">
        <div className="flex items-center gap-3 mb-4">
          <CheckCircle size={26} className="text-emerald-600" />
          <div>
            <h2 className="font-bold text-emerald-800">{label} créé</h2>
            <p className="text-sm text-emerald-600">Communiquez ces identifiants à l'agent</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-emerald-200 p-4 mb-4 space-y-3">
          <div><p className="text-xs text-gray-500 uppercase">Identifiant</p><p className="text-lg font-mono font-bold">{credentials.username}</p></div>
          <div><p className="text-xs text-gray-500 uppercase">Mot de passe temporaire</p><p className="text-lg font-mono font-bold tracking-widest">{credentials.temp_password}</p></div>
        </div>
        <p className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 mb-4">Ces informations ne seront plus affichées. L'agent devra changer son mot de passe à la première connexion.</p>
        <div className="flex gap-3">
          <button onClick={copy} className="btn btn-secondary flex-1 justify-center">{copied ? <CheckCircle size={15} /> : <Copy size={15} />}{copied ? 'Copié' : 'Copier'}</button>
          <button onClick={onDone} className="btn btn-primary flex-1 justify-center">Terminer</button>
        </div>
      </div>
    </div>
  )
}

export default function AgentForm({ id, mode, backPath }) {
  const isEdit = !!id
  const navigate = useNavigate()
  const base = mode === 'admin' ? '/agents' : '/agents/sous-agents'
  const [typeAgent, setTypeAgent] = useState('physique')
  const [form, setForm] = useState({ nom: '', prenom: '', sexe: '', raison_sociale: '', representant_legal: '', email: '', telephone: '', interim_agent_id: '', parent_agent_id: '' })
  const [objectives, setObjectives] = useState(null)
  const [agent, setAgent] = useState(null)
  const [interims, setInterims] = useState([])
  const [saving, setSaving] = useState(false)
  const [credentials, setCredentials] = useState(null)
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  useEffect(() => {
    Promise.all([api.get('/products/active'), isEdit ? api.get(`${base}/${id}`) : Promise.resolve(null)])
      .then(([pr, ag]) => {
        const a = ag?.data
        setAgent(a)
        if (a) {
          setTypeAgent(a.type_agent || 'physique')
          setForm({
            nom: a.nom || '', prenom: a.prenom || '', sexe: a.sexe || '', raison_sociale: a.raison_sociale || a.nom || '',
            representant_legal: a.representant_legal || '', email: a.email || '', telephone: a.telephone || '',
            interim_agent_id: a.interim_agent_id || '', parent_agent_id: a.parent_agent_id || '',
          })
        }
        const existing = a?.product_objectives || []
        setObjectives(pr.data.map(p => {
          const ex = existing.find(o => o.product_id === p.id)
          return { product_id: p.id, product_nom: p.nom, prime_pure: p.prime_pure, objectif_mensuel: ex ? String(ex.objectif_mensuel) : '', periode: ex?.periode || 'annuel' }
        }))
      })
      .catch(() => { toast.error('Agent introuvable'); navigate(backPath) })
    if (mode === 'admin') api.get('/agents/selectable').then(r => setInterims(r.data.filter(a => a.id !== id))).catch(() => {})
  }, [id])

  const isJunior = mode === 'senior' || !!agent?.parent_agent_id
  const label = isJunior ? 'Agent Junior' : 'Agent Sénior'

  const submit = async e => {
    e.preventDefault()
    setSaving(true)
    try {
      const payload = {
        type_agent: typeAgent, ...form,
        product_objectives: objectives.filter(o => Number(o.objectif_mensuel) > 0)
          .map(o => ({ product_id: o.product_id, objectif_mensuel: Number(o.objectif_mensuel), periode: o.periode })),
      }
      if (isEdit) {
        await api.put(`${base}/${id}`, payload)
        toast.success(`${label} mis à jour`)
        navigate(backPath)
      } else {
        const r = await api.post(base, payload)
        toast.success(`${label} créé`)
        setCredentials(r.data.credentials)
      }
    } catch (err) { toast.error(errMsg(err)) } finally { setSaving(false) }
  }

  if (credentials) return <Credentials credentials={credentials} label={label} onDone={() => navigate(backPath)} />
  if (!objectives) return <Spinner />

  const totalPrime = objectives.reduce((s, o) => s + (Number(o.objectif_mensuel) || 0) * mult(o.periode) * (Number(o.prime_pure) || 0), 0)

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(backPath)} className="btn btn-secondary btn-sm"><ArrowLeft size={15} />Retour</button>
        <div>
          <h1 className="text-xl font-bold text-gray-900">{isEdit ? `Modifier : ${personName(agent)}` : `Nouvel ${label}`}</h1>
          <p className="text-sm text-gray-500">
            {isJunior && mode === 'admin' && agent ? `Junior de ${personName(agent, 'parent_')} — objectifs normalement fixés par son Sénior` : label}
          </p>
        </div>
      </div>

      <form onSubmit={submit} className="space-y-5">
        {!isEdit && (
          <div className="card grid grid-cols-2 gap-3">
            {[['physique', 'Personne physique', User], ['morale', 'Personne morale', Building2]].map(([v, l, Icon]) => (
              <button key={v} type="button" onClick={() => setTypeAgent(v)}
                className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all ${typeAgent === v ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
                <Icon size={20} className={typeAgent === v ? 'text-blue-600' : 'text-gray-400'} />
                <span className={`text-sm font-semibold ${typeAgent === v ? 'text-blue-700' : 'text-gray-700'}`}>{l}</span>
              </button>
            ))}
          </div>
        )}

        <div className="card space-y-4">
          <h2 className="text-sm font-semibold text-gray-700">Identité</h2>
          {typeAgent === 'physique' ? (
            <>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Prénom" required><input className="input" value={form.prenom} onChange={e => f('prenom', e.target.value)} required /></Field>
                <Field label="Nom" required><input className="input" value={form.nom} onChange={e => f('nom', e.target.value)} required /></Field>
              </div>
              <Field label="Sexe">
                <div className="flex gap-3">
                  {['Homme', 'Femme'].map(s => (
                    <label key={s} className={`px-4 py-2 rounded-xl border-2 cursor-pointer text-sm font-medium ${form.sexe === s ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600'}`}>
                      <input type="radio" className="sr-only" checked={form.sexe === s} onChange={() => f('sexe', s)} />{s}
                    </label>
                  ))}
                </div>
              </Field>
            </>
          ) : (
            <>
              <Field label="Raison sociale" required><input className="input" value={form.raison_sociale} onChange={e => f('raison_sociale', e.target.value)} required /></Field>
              <Field label="Représentant légal" required><input className="input" value={form.representant_legal} onChange={e => f('representant_legal', e.target.value)} required /></Field>
            </>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Téléphone" required><input className="input" type="tel" placeholder="6XX XX XX XX" value={form.telephone} onChange={e => f('telephone', e.target.value)} required /></Field>
            <Field label="Email"><input className="input" type="email" value={form.email} onChange={e => f('email', e.target.value)} /></Field>
          </div>
        </div>

        <div className="card">
          <h2 className="text-sm font-semibold text-gray-700">Objectifs commerciaux</h2>
          <p className="text-xs text-gray-400 mb-4">Nombre de contrats à souscrire par mois et par produit. Toute modification conserve les anciennes valeurs dans l'historique.</p>
          {objectives.length === 0 ? <p className="text-sm text-gray-400 py-4 text-center">Aucun produit actif.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-xs text-gray-500 uppercase tracking-wide">
                    <th className="pb-2 text-left font-medium">Produit</th>
                    <th className="pb-2 text-right font-medium w-28">Contrats / mois</th>
                    <th className="pb-2 text-right font-medium w-32">Affichage</th>
                    <th className="pb-2 text-right font-medium">Objectif (nb)</th>
                    <th className="pb-2 text-right font-medium">Objectif (prime pure)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {objectives.map((o, i) => {
                    const nb = (Number(o.objectif_mensuel) || 0) * mult(o.periode)
                    const set = (k, v) => setObjectives(prev => prev.map((x, j) => (j === i ? { ...x, [k]: v } : x)))
                    return (
                      <tr key={o.product_id}>
                        <td className="py-2 font-medium text-gray-800">{o.product_nom}</td>
                        <td className="py-2"><input type="number" min="0" className="input text-right w-24 ml-auto" value={o.objectif_mensuel} onChange={e => set('objectif_mensuel', e.target.value)} placeholder="0" /></td>
                        <td className="py-2"><select className="input" value={o.periode} onChange={e => set('periode', e.target.value)}>{HORIZONS.map(h => <option key={h.value} value={h.value}>{h.label}</option>)}</select></td>
                        <td className="py-2 text-right font-semibold text-blue-700">{nb ? fmtNum(nb) : '—'}</td>
                        <td className="py-2 text-right font-semibold text-emerald-700">{nb ? fmtMoney(nb * o.prime_pure) : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
                {totalPrime > 0 && (
                  <tfoot><tr className="border-t-2 border-gray-200 text-sm font-semibold"><td className="pt-2" colSpan={4}>Total</td><td className="pt-2 text-right text-emerald-700">{fmtMoney(totalPrime)}</td></tr></tfoot>
                )}
              </table>
            </div>
          )}
        </div>

        {mode === 'admin' && isJunior && (
          <div className="card">
            <h2 className="text-sm font-semibold text-gray-700 mb-1">Sénior de rattachement</h2>
            <p className="text-xs text-gray-400 mb-3">Le Sénior perçoit la différence de commission sur les ventes de ce Junior.</p>
            <select className="input" value={form.parent_agent_id} onChange={e => f('parent_agent_id', e.target.value)}>
              {interims.filter(a => !a.parent_agent_id || a.id === form.parent_agent_id).map(a => <option key={a.id} value={a.id}>{personName(a)}</option>)}
              {!interims.some(a => a.id === form.parent_agent_id) && <option value={form.parent_agent_id}>{personName(agent, 'parent_')} (non actif)</option>}
            </select>
          </div>
        )}

        {mode === 'admin' && !isJunior && (
          <div className="card">
            <h2 className="text-sm font-semibold text-gray-700 mb-1">Agent intérimaire</h2>
            <p className="text-xs text-gray-400 mb-3">Reçoit temporairement le portefeuille si l'agent est détecté inactif. À défaut, l'intérimaire par défaut des paramètres est utilisé.</p>
            <select className="input" value={form.interim_agent_id} onChange={e => f('interim_agent_id', e.target.value)}>
              <option value="">Intérimaire par défaut</option>
              {interims.map(a => <option key={a.id} value={a.id}>{personName(a)}{a.parent_agent_id ? ' (Junior)' : ''}</option>)}
            </select>
          </div>
        )}

        {agent?.historique_objectifs?.length > 0 && (
          <div className="card">
            <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2"><History size={15} />Historique des objectifs</h2>
            <div className="space-y-2">
              {agent.historique_objectifs.map(h => (
                <div key={h.id} className="text-xs bg-gray-50 rounded-lg p-3">
                  <p className="text-gray-500 mb-1">Valables jusqu'au {fmtDateTime(h.valid_to)} · modifiés par {`${h.modifie_par_prenom || ''} ${h.modifie_par_nom || ''}`.trim() || '—'}</p>
                  <p className="text-gray-700">{h.objectifs.map(o => `${o.product_nom} : ${o.objectif_mensuel}/mois`).join(' · ')}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-3 pb-6">
          <button type="button" onClick={() => navigate(backPath)} className="btn btn-secondary flex-1 justify-center">Annuler</button>
          <button disabled={saving} className="btn btn-primary flex-1 justify-center"><UserPlus size={16} />{saving ? 'Enregistrement…' : isEdit ? 'Enregistrer' : `Créer l'${label}`}</button>
        </div>
      </form>
    </div>
  )
}
