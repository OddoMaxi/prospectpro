import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../../api'
import toast from 'react-hot-toast'
import { UserPlus, ArrowLeft, Copy, CheckCircle } from 'lucide-react'

export default function AgentCreate() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEdit = !!id

  const [form, setForm] = useState({
    nom: '', prenom: '', email: '', telephone: '',
    objectif_mensuel: '', objectif_annuel: '', taux_commission: '5'
  })
  const [loading, setLoading] = useState(false)
  const [credentials, setCredentials] = useState(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (isEdit) {
      api.get(`/agents/${id}`).then(r => {
        const a = r.data
        setForm({
          nom: a.nom, prenom: a.prenom, email: a.email || '',
          telephone: a.telephone || '',
          objectif_mensuel: String(a.objectif_mensuel),
          objectif_annuel: String(a.objectif_annuel),
          taux_commission: String(a.taux_commission)
        })
      }).catch(() => toast.error('Agent introuvable'))
    }
  }, [id, isEdit])

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const handleSubmit = async e => {
    e.preventDefault()
    setLoading(true)
    try {
      const payload = {
        ...form,
        objectif_mensuel: Number(form.objectif_mensuel) || 0,
        objectif_annuel:  Number(form.objectif_annuel)  || 0,
        taux_commission:  Number(form.taux_commission)  || 5
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

          <div className="bg-white rounded-xl border border-emerald-200 p-4 mb-4">
            <div className="space-y-3">
              <div>
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Identifiant</p>
                <p className="text-lg font-mono font-bold text-gray-900 mt-0.5">{credentials.username}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Mot de passe temporaire</p>
                <p className="text-lg font-mono font-bold text-gray-900 mt-0.5 tracking-widest">{credentials.temp_password}</p>
              </div>
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

  return (
    <div className="max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/admin/agents')} className="btn btn-secondary btn-sm">
          <ArrowLeft size={15} />Retour
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-900">{isEdit ? 'Modifier l\'agent' : 'Créer un agent'}</h1>
          <p className="text-sm text-gray-500">{isEdit ? 'Modifier les informations' : 'Nouvel agent commercial'}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="card space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Prénom <span className="text-red-500">*</span></label>
            <input className="input" type="text" value={form.prenom} onChange={e => f('prenom', e.target.value)} required placeholder="Jean" />
          </div>
          <div>
            <label className="label">Nom <span className="text-red-500">*</span></label>
            <input className="input" type="text" value={form.nom} onChange={e => f('nom', e.target.value)} required placeholder="DUPONT" />
          </div>
        </div>

        <div>
          <label className="label">Email</label>
          <input className="input" type="email" value={form.email} onChange={e => f('email', e.target.value)} placeholder="jean.dupont@email.com" />
        </div>

        <div>
          <label className="label">Téléphone</label>
          <input className="input" type="tel" value={form.telephone} onChange={e => f('telephone', e.target.value)} placeholder="+225 07 XX XX XX XX" />
        </div>

        <div className="border-t border-gray-100 pt-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Objectifs et commission</h3>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="label">Objectif/mois</label>
              <input className="input" type="number" min="0" value={form.objectif_mensuel} onChange={e => f('objectif_mensuel', e.target.value)} placeholder="0" />
            </div>
            <div>
              <label className="label">Objectif/an</label>
              <input className="input" type="number" min="0" value={form.objectif_annuel} onChange={e => f('objectif_annuel', e.target.value)} placeholder="0" />
            </div>
            <div>
              <label className="label">Commission (%)</label>
              <input className="input" type="number" min="0" max="100" step="0.1" value={form.taux_commission} onChange={e => f('taux_commission', e.target.value)} placeholder="5" />
            </div>
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={() => navigate('/admin/agents')} className="btn btn-secondary flex-1 justify-center">
            Annuler
          </button>
          <button type="submit" disabled={loading} className="btn btn-primary flex-1 justify-center">
            {loading ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <UserPlus size={16} />}
            {loading ? 'En cours...' : (isEdit ? 'Enregistrer' : 'Créer l\'agent')}
          </button>
        </div>
      </form>
    </div>
  )
}
