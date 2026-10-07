import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Save } from 'lucide-react'
import { api } from '../../api'
import { Spinner, PageHeader, Field, errMsg } from '../../components/ui'
import { personName } from '../../utils/format'

const GROUPES = [
  ['Inactivité des agents', ['inactivite_jours', 'inactivite_alerte_jours', 'interim_defaut_id']],
  ['Contrats et échéances', ['duree_contrat_mois', 'echeance_seuil_jours', 'alertes_echeance_jours', 'delai_anticipation_mois']],
  ['Saisie', ['similarite_correction']],
  ['Relance client', ['message_relance']],
]

export default function Parametres() {
  const [rows, setRows] = useState(null)
  const [values, setValues] = useState({})
  const [agents, setAgents] = useState([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get('/parametres').then(r => { setRows(r.data); setValues(Object.fromEntries(r.data.map(p => [p.cle, p.valeur ?? '']))) })
    api.get('/agents/selectable').then(r => setAgents(r.data)).catch(() => {})
  }, [])

  const save = async e => {
    e.preventDefault()
    setSaving(true)
    try { await api.put('/parametres', values); toast.success('Paramètres enregistrés') } catch (err) { toast.error(errMsg(err)) } finally { setSaving(false) }
  }
  if (!rows) return <Spinner />
  const byKey = Object.fromEntries(rows.map(r => [r.cle, r]))

  const input = p => {
    const set = v => setValues(s => ({ ...s, [p.cle]: v }))
    if (p.type === 'agent') return (
      <select className="input" value={values[p.cle]} onChange={e => set(e.target.value)}>
        <option value="">Aucun</option>
        {agents.filter(a => !a.parent_agent_id).map(a => <option key={a.id} value={a.id}>{personName(a)}</option>)}
      </select>
    )
    if (p.type === 'textarea') return <textarea className="input" rows={4} value={values[p.cle]} onChange={e => set(e.target.value)} />
    return <input className="input" type={p.type === 'text' ? 'text' : 'number'} step={p.type === 'float' ? '0.01' : '1'} value={values[p.cle]} onChange={e => set(e.target.value)} />
  }

  return (
    <form onSubmit={save} className="max-w-3xl mx-auto">
      <PageHeader title="Paramètres" subtitle="Délais et seuils modifiables sans intervention du développeur. Les taux de commission et de taxe se règlent sur les produits et les branches.">
        <button disabled={saving} className="btn btn-primary"><Save size={16} />{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
      </PageHeader>
      <div className="space-y-5">
        {GROUPES.map(([titre, cles]) => (
          <div key={titre} className="card space-y-4">
            <h2 className="text-sm font-semibold text-gray-700">{titre}</h2>
            {cles.filter(k => byKey[k]).map(k => (
              <Field key={k} label={byKey[k].libelle} hint={k === 'message_relance' ? 'Variables : {client}, {contrat}, {echeance}, {date_limite}, {agent}' : undefined}>{input(byKey[k])}</Field>
            ))}
          </div>
        ))}
      </div>
    </form>
  )
}
