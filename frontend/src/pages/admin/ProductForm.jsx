import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../../api'
import toast from 'react-hot-toast'
import { Save, ArrowLeft, Package } from 'lucide-react'

const fmtCur = n => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'GNF', minimumFractionDigits: 0 }).format(Math.round(n || 0))

const EMPTY = { nom: '', description: '', prime_annuelle: '', taux_commission: '5', is_active: true }

function Field({ label, children, required }) {
  return (
    <div>
      <label className="label">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</label>
      {children}
    </div>
  )
}

export default function ProductForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEdit = !!id

  const [form, setForm] = useState(EMPTY)
  const [loading, setLoading] = useState(false)
  const [initLoading, setInitLoading] = useState(isEdit)

  useEffect(() => {
    if (isEdit) {
      api.get(`/products`).then(r => {
        const p = r.data.find(x => x.id === id)
        if (!p) { toast.error('Produit introuvable'); navigate('/admin/products'); return }
        setForm({
          nom: p.nom, description: p.description || '',
          prime_annuelle: String(p.prime_annuelle || ''),
          taux_commission: String(p.taux_commission || '5'),
          is_active: Boolean(p.is_active)
        })
      }).catch(() => { toast.error('Erreur de chargement'); navigate('/admin/products') })
        .finally(() => setInitLoading(false))
    }
  }, [id, isEdit])

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const handleSubmit = async e => {
    e.preventDefault()
    if (!form.nom.trim()) return toast.error('Le nom du produit est obligatoire')
    setLoading(true)
    try {
      const payload = {
        nom: form.nom.trim(),
        description: form.description.trim() || null,
        prime_annuelle: Number(form.prime_annuelle) || 0,
        taux_commission: Number(form.taux_commission) || 5,
        is_active: form.is_active
      }
      if (isEdit) {
        await api.put(`/products/${id}`, payload)
        toast.success('Produit mis à jour')
      } else {
        await api.post('/products', payload)
        toast.success('Produit créé avec succès !')
      }
      navigate('/admin/products')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erreur lors de l\'enregistrement')
    } finally {
      setLoading(false)
    }
  }

  if (initLoading) return (
    <div className="flex justify-center py-20">
      <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const commission = form.prime_annuelle && form.taux_commission
    ? Number(form.prime_annuelle) * Number(form.taux_commission) / 100
    : 0

  return (
    <div className="max-w-xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(-1)} className="btn btn-secondary btn-sm">
          <ArrowLeft size={15} />Retour
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            {isEdit ? 'Modifier le produit' : 'Nouveau produit d\'assurance'}
          </h1>
          <p className="text-sm text-gray-500">
            {isEdit ? 'Modifier les informations du produit' : 'Définir un produit avec sa prime et sa commission'}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="card space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Package size={18} className="text-blue-600" />
            <h2 className="text-sm font-semibold text-gray-700">Informations du produit</h2>
          </div>

          <Field label="Nom du produit" required>
            <input
              className="input" type="text" value={form.nom}
              onChange={e => f('nom', e.target.value)}
              required placeholder="Ex: Assurance Vie Standard"
            />
          </Field>

          <Field label="Description">
            <textarea
              className="input resize-none" rows={3} value={form.description}
              onChange={e => f('description', e.target.value)}
              placeholder="Description du produit, couvertures incluses..."
            />
          </Field>
        </div>

        <div className="card space-y-4">
          <h2 className="text-sm font-semibold text-gray-700">Tarification</h2>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Prime annuelle (GNF)" required>
              <input
                className="input" type="number" min="0" step="1000"
                value={form.prime_annuelle}
                onChange={e => f('prime_annuelle', e.target.value)}
                required placeholder="0"
              />
            </Field>
            <Field label="Taux de commission (%)" required>
              <input
                className="input" type="number" min="0" max="100" step="0.1"
                value={form.taux_commission}
                onChange={e => f('taux_commission', e.target.value)}
                required placeholder="5"
              />
            </Field>
          </div>

          {form.prime_annuelle && form.taux_commission && (
            <div className="bg-blue-50 rounded-lg p-4 grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-blue-600 mb-0.5">Prime annuelle</p>
                <p className="text-base font-bold text-blue-900">{fmtCur(Number(form.prime_annuelle))}</p>
              </div>
              <div>
                <p className="text-xs text-blue-600 mb-0.5">Commission par contrat</p>
                <p className="text-base font-bold text-blue-900">{fmtCur(commission)}</p>
              </div>
            </div>
          )}
        </div>

        <div className="card">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Disponibilité</h2>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox" checked={form.is_active}
              onChange={e => f('is_active', e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <div>
              <p className="text-sm font-medium text-gray-700">Produit actif</p>
              <p className="text-xs text-gray-400">Visible par les agents lors de la création de prospects</p>
            </div>
          </label>
        </div>

        <div className="flex gap-3 pb-6">
          <button type="button" onClick={() => navigate(-1)} className="btn btn-secondary flex-1 justify-center">
            Annuler
          </button>
          <button type="submit" disabled={loading} className="btn btn-primary flex-1 justify-center">
            {loading
              ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <Save size={16} />
            }
            {loading ? 'En cours...' : (isEdit ? 'Enregistrer' : 'Créer le produit')}
          </button>
        </div>
      </form>
    </div>
  )
}
