import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../../api'
import toast from 'react-hot-toast'
import { UserPlus, ArrowLeft, Copy, CheckCircle, User, Building2 } from 'lucide-react'

const PERIODES = [
  { value: 'annuel',    label: 'Annuel',      multiplier: 12 },
  { value: 'semestre',  label: 'Semestriel',  multiplier: 6  },
  { value: 'trimestre', label: 'Trimestriel', multiplier: 3  },
  { value: 'mensuel',   label: 'Mensuel',     multiplier: 1  },
]

const multiplier = p => PERIODES.find(x => x.value === p)?.multiplier ?? 12
const fmtNum = n => new Intl.NumberFormat('fr-FR').format(Math.round(n || 0))
const fmtCur = n => fmtNum(n)

function Field({ label, children, required }) {
  return (
    <div>
      <label className="label">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</label>
      {children}
    </div>
  )
}

export default function AgentCreate() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEdit = !!id

  const [typeAgent, setTypeAgent] = useState('physique')
  const [form, setForm] = useState({
    nom: '', prenom: '', sexe: '',
    raison_sociale: '', representant_legal: '',
    email: '', telephone: '',
    is_active: true,
  })
  const [objectives, setObjectives] = useState([])
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(false)
  const [credentials, setCredentials] = useState(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    api.get('/products/active').then(r => {
      setProducts(r.data)
      if (!isEdit) {
        setObjectives(r.data.map(p => ({
          product_id: p.id,
          product_nom: p.nom,
          prime_annuelle: p.prime_annuelle,
          objectif_mensuel: '',
          periode: 'annuel',
        })))
      }
    }).catch(() => {})
  }, [isEdit])

  useEffect(() => {
    if (isEdit) {
      api.get(`/agents/${id}`).then(r => {
        const a = r.data
        setTypeAgent(a.type_agent || 'physique')
        setForm({
          nom: a.nom || '',
          prenom: a.prenom || '',
          sexe: a.sexe || '',
          raison_sociale: a.raison_sociale || a.nom || '',
          representant_legal: a.representant_legal || '',
          email: a.email || '',
          telephone: a.telephone || '',
          is_active: Boolean(a.is_active),
        })
        sessionStorage.setItem('_editObjectives', JSON.stringify(a.product_objectives || []))
      }).catch(() => toast.error('Agent introuvable'))
    }
  }, [id, isEdit])

  useEffect(() => {
    if (isEdit && products.length > 0) {
      const existing = JSON.parse(sessionStorage.getItem('_editObjectives') || '[]')
      setObjectives(products.map(p => {
        const ex = existing.find(o => o.product_id === p.id)
        return {
          product_id: p.id,
          product_nom: p.nom,
          prime_annuelle: p.prime_annuelle,
          objectif_mensuel: ex ? String(ex.objectif_mensuel) : '',
          periode: ex ? ex.periode : 'annuel',
        }
      }))
      sessionStorage.removeItem('_editObjectives')
    }
  }, [products, isEdit])

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const updateObjective = (productId, key, value) => {
    setObjectives(prev => prev.map(obj =>
      obj.product_id !== productId ? obj : { ...obj, [key]: value }
    ))
  }

  const getObjectifProspect = obj => (Number(obj.objectif_mensuel) || 0) * multiplier(obj.periode)
  const getObjectifPrime    = obj => getObjectifProspect(obj) * (Number(obj.prime_annuelle) || 0)

  const handleSubmit = async e => {
    e.preventDefault()

    if (typeAgent === 'morale') {
      if (!form.raison_sociale.trim())   return toast.error('La raison sociale est obligatoire')
      if (!form.representant_legal.trim()) return toast.error('Le représentant légal est obligatoire')
      if (!form.telephone.trim())        return toast.error('Le numéro de téléphone est obligatoire')
    } else {
      if (!form.nom.trim() || !form.prenom.trim()) return toast.error('Nom et prénom obligatoires')
      if (!form.telephone.trim())                  return toast.error('Le numéro de téléphone est obligatoire')
    }

    setLoading(true)
    try {
      const payload = {
        type_agent: typeAgent,
        nom: typeAgent === 'physique' ? form.nom.trim() : form.raison_sociale.trim(),
        prenom: typeAgent === 'physique' ? form.prenom.trim() : '',
        sexe: typeAgent === 'physique' ? (form.sexe || null) : null,
        raison_sociale: typeAgent === 'morale' ? form.raison_sociale.trim() : null,
        representant_legal: typeAgent === 'morale' ? form.representant_legal.trim() : null,
        email: typeAgent === 'morale' ? (form.email.trim() || null) : null,
        telephone: form.telephone.trim() || null,
        is_active: form.is_active,
        product_objectives: objectives
          .filter(o => Number(o.objectif_mensuel) > 0)
          .map(o => ({
            product_id: o.product_id,
            objectif_mensuel: Number(o.objectif_mensuel),
            periode: o.periode,
            objectif_annuel: getObjectifProspect(o),
          })),
      }

      if (isEdit) {
        await api.put(`/agents/${id}`, payload)
        toast.success('Agent mis à jour')
        navigate('/admin/agents')
      } else {
        const r = await api.post('/agents', payload)
        toast.success('Agent créé avec succès')
        setCredentials(r.data.credentials)
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erreur lors de l\'enregistrement')
    } finally {
      setLoading(false)
    }
  }

  const copyCredentials = () => {
    const text = `Identifiant: ${credentials.username}\nMot de passe temporaire: ${credentials.temp_password}`
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }

  if (credentials) {
    return (
      <div className="max-w-md mx-auto">
        <div className="card border-emerald-200 bg-emerald-50">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
              <CheckCircle size={22} className="text-emerald-600" />
            </div>
            <div>
              <h2 className="font-bold text-emerald-800">Agent créé avec succès</h2>
              <p className="text-sm text-emerald-600">Communiquez ces identifiants à l'agent</p>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-emerald-200 p-4 mb-4 space-y-3">
            <div>
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Identifiant</p>
              <p className="text-lg font-mono font-bold text-gray-900 mt-0.5">{credentials.username}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Mot de passe temporaire</p>
              <p className="text-lg font-mono font-bold text-gray-900 mt-0.5 tracking-widest">{credentials.temp_password}</p>
            </div>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 mb-4">
            Ces informations ne seront plus affichées. L'agent devra changer son mot de passe à la première connexion.
          </div>
          <div className="flex gap-3">
            <button onClick={copyCredentials} className="btn btn-secondary flex-1 justify-center">
              {copied ? <CheckCircle size={15} className="text-emerald-600" /> : <Copy size={15} />}
              {copied ? 'Copié !' : 'Copier'}
            </button>
            <button onClick={() => navigate('/admin/agents')} className="btn btn-primary flex-1 justify-center">
              Voir les agents
            </button>
          </div>
        </div>
      </div>
    )
  }

  const totalMensuel        = objectives.reduce((s, o) => s + (Number(o.objectif_mensuel) || 0), 0)
  const totalObjectifPrimes = objectives.reduce((s, o) => s + getObjectifPrime(o), 0)

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/admin/agents')} className="btn btn-secondary btn-sm">
          <ArrowLeft size={15} />Retour
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-900">{isEdit ? 'Modifier l\'agent' : 'Créer un Agent Commercial Séniore'}</h1>
          <p className="text-sm text-gray-500">{isEdit ? 'Modifier les informations' : 'Nouvel Agent Commercial Séniore'}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">

        {/* Sélecteur de type (uniquement à la création) */}
        {!isEdit && (
          <div className="card">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Type d'agent</h2>
            <div className="grid grid-cols-2 gap-3">
              <button type="button"
                onClick={() => setTypeAgent('physique')}
                className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all ${typeAgent === 'physique' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${typeAgent === 'physique' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>
                  <User size={20} />
                </div>
                <div className="text-left">
                  <p className={`text-sm font-semibold ${typeAgent === 'physique' ? 'text-blue-700' : 'text-gray-700'}`}>Personne physique</p>
                  <p className="text-xs text-gray-400">Particulier</p>
                </div>
              </button>
              <button type="button"
                onClick={() => setTypeAgent('morale')}
                className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all ${typeAgent === 'morale' ? 'border-purple-500 bg-purple-50' : 'border-gray-200 hover:border-gray-300'}`}>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${typeAgent === 'morale' ? 'bg-purple-100 text-purple-600' : 'bg-gray-100 text-gray-500'}`}>
                  <Building2 size={20} />
                </div>
                <div className="text-left">
                  <p className={`text-sm font-semibold ${typeAgent === 'morale' ? 'text-purple-700' : 'text-gray-700'}`}>Personne morale</p>
                  <p className="text-xs text-gray-400">Entreprise / Organisation</p>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* Identité */}
        <div className="card space-y-4">
          <h2 className="text-sm font-semibold text-gray-700">
            {typeAgent === 'morale' ? 'Informations de la structure' : 'Identité'}
          </h2>

          {typeAgent === 'physique' ? (
            <>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Prénom" required>
                  <input className="input" type="text" value={form.prenom}
                    onChange={e => f('prenom', e.target.value)} required placeholder="Jean" />
                </Field>
                <Field label="Nom" required>
                  <input className="input" type="text" value={form.nom}
                    onChange={e => f('nom', e.target.value)} required placeholder="DUPONT" />
                </Field>
              </div>
              <Field label="Sexe">
                <div className="flex gap-3 mt-1">
                  {['Homme', 'Femme'].map(s => (
                    <label key={s}
                      className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 cursor-pointer text-sm font-medium transition-all
                        ${form.sexe === s ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                      <input type="radio" name="sexe" value={s} checked={form.sexe === s}
                        onChange={() => f('sexe', s)} className="sr-only" />
                      {s}
                    </label>
                  ))}
                </div>
              </Field>
            </>
          ) : (
            <>
              <Field label="Raison sociale" required>
                <input className="input" type="text" value={form.raison_sociale}
                  onChange={e => f('raison_sociale', e.target.value)}
                  required placeholder="Entreprise SARL" />
              </Field>
              <Field label="Représentant légal" required>
                <input className="input" type="text" value={form.representant_legal}
                  onChange={e => f('representant_legal', e.target.value)}
                  required placeholder="Prénom NOM du représentant" />
              </Field>
              <Field label="Email">
                <input className="input" type="email" value={form.email}
                  onChange={e => f('email', e.target.value)}
                  placeholder="contact@entreprise.com" />
              </Field>
            </>
          )}

          <Field label="Téléphone" required>
            <input className="input" type="tel" value={form.telephone}
              onChange={e => f('telephone', e.target.value)}
              required placeholder="6XX XX XX XX" />
          </Field>
        </div>

        {/* Objectifs */}
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Objectifs</h2>

          {products.length === 0 ? (
            <div className="text-center py-6 text-gray-400">
              <p className="text-sm">Aucun produit d'assurance actif.</p>
              <p className="text-xs mt-1">Créez des produits dans <strong>Produits d'assurance</strong> pour définir des objectifs.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-xs text-gray-500 uppercase tracking-wide">
                    <th className="pb-2 text-left font-medium">Produit</th>
                    <th className="pb-2 text-right font-medium w-28">Obj. mensuel</th>
                    <th className="pb-2 text-right font-medium w-32">Période</th>
                    <th className="pb-2 text-right font-medium w-28">Obj. Prospect</th>
                    <th className="pb-2 text-right font-medium w-32">Obj. Prime</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {objectives.map(obj => {
                    const objProspect = getObjectifProspect(obj)
                    const objPrime    = getObjectifPrime(obj)
                    return (
                      <tr key={obj.product_id} className="hover:bg-gray-50">
                        <td className="py-2.5 font-medium text-gray-800">{obj.product_nom}</td>
                        <td className="py-2.5 text-right">
                          <input
                            className="input text-right w-24 ml-auto"
                            type="number" min="0" step="1"
                            value={obj.objectif_mensuel}
                            onChange={e => updateObjective(obj.product_id, 'objectif_mensuel', e.target.value)}
                            placeholder="0"
                          />
                        </td>
                        <td className="py-2.5 text-right">
                          <select
                            className="input w-full"
                            value={obj.periode}
                            onChange={e => updateObjective(obj.product_id, 'periode', e.target.value)}
                          >
                            {PERIODES.map(p => (
                              <option key={p.value} value={p.value}>{p.label}</option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2.5 text-right">
                          <span className={`font-bold tabular-nums ${objProspect > 0 ? 'text-blue-700' : 'text-gray-300'}`}>
                            {objProspect > 0 ? fmtNum(objProspect) : '—'}
                          </span>
                        </td>
                        <td className="py-2.5 text-right">
                          <span className={`font-bold tabular-nums ${objPrime > 0 ? 'text-emerald-700' : 'text-gray-300'}`}>
                            {objPrime > 0 ? fmtCur(objPrime) : '—'}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                {objectives.some(o => Number(o.objectif_mensuel) > 0) && (
                  <tfoot>
                    <tr className="border-t-2 border-gray-200 text-xs font-semibold text-gray-700">
                      <td className="pt-2 uppercase text-gray-500 tracking-wide">Total</td>
                      <td className="pt-2 text-right text-blue-700">{fmtNum(totalMensuel)}</td>
                      <td className="pt-2"></td>
                      <td className="pt-2 text-right text-blue-700">{fmtNum(objectives.reduce((s,o) => s + getObjectifProspect(o), 0))}</td>
                      <td className="pt-2 text-right text-emerald-700">{fmtCur(totalObjectifPrimes)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </div>

        {/* Statut (édition seulement) */}
        {isEdit && (
          <div className="card">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Statut du compte</h2>
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={form.is_active}
                onChange={e => f('is_active', e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <div>
                <p className="text-sm font-medium text-gray-700">Agent actif</p>
                <p className="text-xs text-gray-400">Un agent inactif ne peut plus se connecter</p>
              </div>
            </label>
          </div>
        )}

        <div className="flex gap-3 pb-6">
          <button type="button" onClick={() => navigate('/admin/agents')} className="btn btn-secondary flex-1 justify-center">
            Annuler
          </button>
          <button type="submit" disabled={loading} className="btn btn-primary flex-1 justify-center">
            {loading
              ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <UserPlus size={16} />
            }
            {loading ? 'En cours...' : (isEdit ? 'Enregistrer' : 'Créer l\'agent')}
          </button>
        </div>
      </form>
    </div>
  )
}
