import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../../api'
import toast from 'react-hot-toast'
import { Save, ArrowLeft, User, Building2 } from 'lucide-react'

const SECTEURS = [
  'Immobilier','Assurance','Finance / Banque','Santé','Commerce de détail',
  'Industrie','Services aux entreprises','Transport / Logistique',
  'Restauration / Hôtellerie','Agriculture','Informatique / Tech',
  'Éducation / Formation','BTP / Construction','Énergie','Télécommunications','Autre'
]

const EMPTY = {
  type: 'physique', nom: '', prenom: '', siret: '',
  nom_contact: '', prenom_contact: '',
  telephone: '', email: '', adresse: '', ville: '', code_postal: '',
  secteur_activite: '', notes: '', statut: 'prospect',
  montant_potentiel: '', taux_commission: '',
  date_prospection: new Date().toISOString().split('T')[0]
}

function Field({ label, children, required }) {
  return (
    <div>
      <label className="label">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</label>
      {children}
    </div>
  )
}

export default function ProspectForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEdit = !!id

  const [form, setForm] = useState(EMPTY)
  const [loading, setLoading] = useState(false)
  const [initLoading, setInitLoading] = useState(isEdit)

  useEffect(() => {
    if (isEdit) {
      api.get(`/prospects/${id}`)
        .then(r => {
          const p = r.data
          setForm({ ...EMPTY, ...p, montant_potentiel: String(p.montant_potentiel || ''), taux_commission: String(p.taux_commission || '') })
        })
        .catch(() => { toast.error('Prospect introuvable'); navigate('/agent/prospects') })
        .finally(() => setInitLoading(false))
    } else {
      api.get('/auth/me').then(r => setForm(f => ({ ...f, taux_commission: String(r.data.taux_commission || 5) }))).catch(() => {})
    }
  }, [id, isEdit])

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const handleSubmit = async e => {
    e.preventDefault()
    setLoading(true)
    try {
      const payload = {
        ...form,
        montant_potentiel: Number(form.montant_potentiel) || 0,
        taux_commission: Number(form.taux_commission) || 5
      }
      if (isEdit) {
        await api.put(`/prospects/${id}`, payload)
        toast.success('Prospect mis à jour')
      } else {
        await api.post('/prospects', payload)
        toast.success('Prospect créé avec succès !')
      }
      navigate('/agent/prospects')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erreur lors de l\'enregistrement')
    } finally {
      setLoading(false)
    }
  }

  if (initLoading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>

  const isPhysique = form.type === 'physique'

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(-1)} className="btn btn-secondary btn-sm">
          <ArrowLeft size={15} />Retour
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-900">{isEdit ? 'Modifier le prospect' : 'Nouveau prospect'}</h1>
          <p className="text-sm text-gray-500">{isEdit ? 'Modifier les informations' : 'Saisir les informations du prospect'}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Type selection */}
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Type de prospect</h2>
          <div className="grid grid-cols-2 gap-3">
            <button type="button"
              onClick={() => f('type', 'physique')}
              className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all ${form.type === 'physique' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${form.type === 'physique' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>
                <User size={20} />
              </div>
              <div className="text-left">
                <p className={`text-sm font-semibold ${form.type === 'physique' ? 'text-blue-700' : 'text-gray-700'}`}>Personne physique</p>
                <p className="text-xs text-gray-400">Particulier</p>
              </div>
            </button>
            <button type="button"
              onClick={() => f('type', 'morale')}
              className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all ${form.type === 'morale' ? 'border-purple-500 bg-purple-50' : 'border-gray-200 hover:border-gray-300'}`}>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${form.type === 'morale' ? 'bg-purple-100 text-purple-600' : 'bg-gray-100 text-gray-500'}`}>
                <Building2 size={20} />
              </div>
              <div className="text-left">
                <p className={`text-sm font-semibold ${form.type === 'morale' ? 'text-purple-700' : 'text-gray-700'}`}>Personne morale</p>
                <p className="text-xs text-gray-400">Entreprise</p>
              </div>
            </button>
          </div>
        </div>

        {/* Identity */}
        <div className="card space-y-4">
          <h2 className="text-sm font-semibold text-gray-700">{isPhysique ? 'Identité' : 'Entreprise'}</h2>

          {isPhysique ? (
            <div className="grid grid-cols-2 gap-4">
              <Field label="Prénom" required>
                <input className="input" type="text" value={form.prenom} onChange={e => f('prenom', e.target.value)} required placeholder="Jean" />
              </Field>
              <Field label="Nom" required>
                <input className="input" type="text" value={form.nom} onChange={e => f('nom', e.target.value)} required placeholder="DUPONT" />
              </Field>
            </div>
          ) : (
            <>
              <Field label="Raison sociale" required>
                <input className="input" type="text" value={form.nom} onChange={e => f('nom', e.target.value)} required placeholder="Entreprise SARL" />
              </Field>
              <Field label="SIRET">
                <input className="input" type="text" value={form.siret} onChange={e => f('siret', e.target.value)} placeholder="123 456 789 00000" />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Prénom du contact">
                  <input className="input" type="text" value={form.prenom_contact} onChange={e => f('prenom_contact', e.target.value)} placeholder="Marie" />
                </Field>
                <Field label="Nom du contact">
                  <input className="input" type="text" value={form.nom_contact} onChange={e => f('nom_contact', e.target.value)} placeholder="MARTIN" />
                </Field>
              </div>
            </>
          )}
        </div>

        {/* Contact */}
        <div className="card space-y-4">
          <h2 className="text-sm font-semibold text-gray-700">Coordonnées</h2>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Téléphone">
              <input className="input" type="tel" value={form.telephone} onChange={e => f('telephone', e.target.value)} placeholder="+225 07 XX XX XX XX" />
            </Field>
            <Field label="Email">
              <input className="input" type="email" value={form.email} onChange={e => f('email', e.target.value)} placeholder="contact@email.com" />
            </Field>
          </div>
          <Field label="Adresse">
            <input className="input" type="text" value={form.adresse} onChange={e => f('adresse', e.target.value)} placeholder="Rue, Quartier" />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Ville">
              <input className="input" type="text" value={form.ville} onChange={e => f('ville', e.target.value)} placeholder="Abidjan" />
            </Field>
            <Field label="Code postal">
              <input className="input" type="text" value={form.code_postal} onChange={e => f('code_postal', e.target.value)} placeholder="00225" />
            </Field>
          </div>
          <Field label="Secteur d'activité">
            <select className="input" value={form.secteur_activite} onChange={e => f('secteur_activite', e.target.value)}>
              <option value="">Sélectionner...</option>
              {SECTEURS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
        </div>

        {/* Commercial */}
        <div className="card space-y-4">
          <h2 className="text-sm font-semibold text-gray-700">Informations commerciales</h2>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Statut">
              <select className="input" value={form.statut} onChange={e => f('statut', e.target.value)}>
                <option value="prospect">Prospect</option>
                <option value="en_cours">En cours</option>
                <option value="client">Client</option>
                <option value="perdu">Perdu</option>
              </select>
            </Field>
            <Field label="Date de prospection">
              <input className="input" type="date" value={form.date_prospection} onChange={e => f('date_prospection', e.target.value)} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Montant potentiel (FCFA)">
              <input className="input" type="number" min="0" value={form.montant_potentiel} onChange={e => f('montant_potentiel', e.target.value)} placeholder="0" />
            </Field>
            <Field label="Taux de commission (%)">
              <input className="input" type="number" min="0" max="100" step="0.1" value={form.taux_commission} onChange={e => f('taux_commission', e.target.value)} placeholder="5" />
            </Field>
          </div>
          {form.montant_potentiel && form.taux_commission && (
            <div className="bg-blue-50 rounded-lg p-3 text-sm">
              <span className="text-blue-700 font-medium">Commission prévisionnelle : </span>
              <span className="text-blue-900 font-bold">
                {new Intl.NumberFormat('fr-FR').format(Math.round(Number(form.montant_potentiel) * Number(form.taux_commission) / 100))} FCFA
              </span>
            </div>
          )}
          <Field label="Notes">
            <textarea className="input resize-none" rows={3} value={form.notes} onChange={e => f('notes', e.target.value)} placeholder="Observations, remarques..." />
          </Field>
        </div>

        <div className="flex gap-3 pb-6">
          <button type="button" onClick={() => navigate(-1)} className="btn btn-secondary flex-1 justify-center">
            Annuler
          </button>
          <button type="submit" disabled={loading} className="btn btn-primary flex-1 justify-center">
            {loading ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Save size={16} />}
            {loading ? 'En cours...' : (isEdit ? 'Enregistrer' : 'Créer le prospect')}
          </button>
        </div>
      </form>
    </div>
  )
}
