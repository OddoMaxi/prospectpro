import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../../api'
import toast from 'react-hot-toast'
import { Save, ArrowLeft, User, Building2, Plus, Trash2 } from 'lucide-react'
import { COMMUNES, VILLES, getCommunes, getQuartiers, getVilleFromCommune, PROFESSIONS, SECTEURS_MORALE } from '../../data/guinea'

const fmt = n => new Intl.NumberFormat('fr-FR').format(Math.round(n || 0))
const NIVEAUX_INTERET = ['Faible', 'Moyen', 'Élevé']

const EMPTY = {
  type: 'physique',
  nom: '', prenom: '',
  sexe: '',
  nom_contact: '', prenom_contact: '',
  telephone: '', email: '',
  lieu_residence_commune: '', lieu_residence_quartier: '',
  lieu_activite_commune: '', lieu_activite_quartier: '',
  siege_social_commune: '', siege_social_quartier: '',
  profession: '',
  secteur_activite: '',
  niveau_interet: '',
  statut: 'prospect',
  date_prospection: new Date().toISOString().split('T')[0],
}

function Field({ label, children, required }) {
  return (
    <div>
      <label className="label">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

function LocationSelect({ communeValue, quartierValue, onCommuneChange, onQuartierChange, labelCommune, labelQuartier }) {
  const quartiers = getQuartiers(communeValue)
  return (
    <div className="grid grid-cols-2 gap-4">
      <Field label={labelCommune}>
        <select
          className="input"
          value={communeValue}
          onChange={e => { onCommuneChange(e.target.value); onQuartierChange('') }}
        >
          <option value="">Commune...</option>
          {COMMUNES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </Field>
      <Field label={labelQuartier}>
        <select
          className="input"
          value={quartierValue}
          onChange={e => onQuartierChange(e.target.value)}
          disabled={!communeValue}
        >
          <option value="">Quartier...</option>
          {quartiers.map(q => <option key={q} value={q}>{q}</option>)}
        </select>
      </Field>
    </div>
  )
}

function LocationSelect3({ villeValue, communeValue, quartierValue, onVilleChange, onCommuneChange, onQuartierChange }) {
  const communes = villeValue ? getCommunes(villeValue) : []
  const quartiers = communeValue ? getQuartiers(communeValue) : []
  return (
    <div className="grid grid-cols-3 gap-3">
      <Field label="Ville">
        <select
          className="input"
          value={villeValue}
          onChange={e => { onVilleChange(e.target.value); onCommuneChange(''); onQuartierChange('') }}
        >
          <option value="">Ville...</option>
          {VILLES.map(v => <option key={v} value={v}>{v}</option>)}
        </select>
      </Field>
      <Field label="Commune">
        <select
          className="input"
          value={communeValue}
          onChange={e => { onCommuneChange(e.target.value); onQuartierChange('') }}
          disabled={!villeValue}
        >
          <option value="">Commune...</option>
          {communes.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </Field>
      <Field label="Quartier">
        <select
          className="input"
          value={quartierValue}
          onChange={e => onQuartierChange(e.target.value)}
          disabled={!communeValue}
        >
          <option value="">Quartier...</option>
          {quartiers.map(q => <option key={q} value={q}>{q}</option>)}
        </select>
      </Field>
    </div>
  )
}

export default function ProspectForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEdit = !!id

  const [form, setForm] = useState(EMPTY)
  const [lieuResidenceVille, setLieuResidenceVille] = useState('')
  const [loading, setLoading] = useState(false)
  const [initLoading, setInitLoading] = useState(isEdit)
  const [availableProducts, setAvailableProducts] = useState([])
  const [selectedProducts, setSelectedProducts] = useState([])

  useEffect(() => {
    api.get('/products/active').then(r => setAvailableProducts(r.data)).catch(() => {})
  }, [])

  useEffect(() => {
    if (isEdit) {
      api.get(`/prospects/${id}`)
        .then(r => {
          const p = r.data
          setForm({
            type: p.type || 'physique',
            nom: p.nom || '',
            prenom: p.prenom || '',
            sexe: p.sexe || '',
            nom_contact: p.nom_contact || '',
            prenom_contact: p.prenom_contact || '',
            telephone: p.telephone || '',
            email: p.email || '',
            lieu_residence_commune: p.lieu_residence_commune || '',
            lieu_residence_quartier: p.lieu_residence_quartier || '',
            lieu_activite_commune: p.lieu_activite_commune || '',
            lieu_activite_quartier: p.lieu_activite_quartier || '',
            siege_social_commune: p.siege_social_commune || '',
            siege_social_quartier: p.siege_social_quartier || '',
            profession: p.profession || '',
            secteur_activite: p.secteur_activite || '',
            niveau_interet: p.niveau_interet || '',
            statut: p.statut || 'prospect',
            date_prospection: p.date_prospection || new Date().toISOString().split('T')[0],
          })
          if (p.lieu_residence_commune) {
            setLieuResidenceVille(getVilleFromCommune(p.lieu_residence_commune))
          }
          if (p.prospect_products?.length > 0) {
            setSelectedProducts(p.prospect_products.map(pp => ({
              product_id: pp.product_id,
              product_nom: pp.product_nom,
              prime_annuelle: Number(pp.prime_annuelle) || 0,
              taux_commission: Number(pp.product_taux) || 0,
              nb_beneficiaires: String(pp.nb_beneficiaires || 1),
            })))
          }
        })
        .catch(() => { toast.error('Prospect introuvable'); navigate('/agent/prospects') })
        .finally(() => setInitLoading(false))
    }
  }, [id, isEdit])

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const addProduct = () => {
    setSelectedProducts(prev => [...prev, {
      product_id: '', product_nom: '', prime_annuelle: 0, taux_commission: 0, nb_beneficiaires: '1'
    }])
  }

  const removeProduct = idx => setSelectedProducts(prev => prev.filter((_, i) => i !== idx))

  const updateProduct = (idx, key, value) => {
    setSelectedProducts(prev => prev.map((sp, i) => {
      if (i !== idx) return sp
      if (key === 'product_id') {
        const p = availableProducts.find(p => p.id === value)
        return p
          ? { ...sp, product_id: value, product_nom: p.nom, prime_annuelle: Number(p.prime_annuelle), taux_commission: Number(p.taux_commission) }
          : { ...sp, product_id: '', product_nom: '', prime_annuelle: 0, taux_commission: 0 }
      }
      return { ...sp, [key]: value }
    }))
  }

  const getPrimePrev = sp => (Number(sp.prime_annuelle) || 0) * (Number(sp.nb_beneficiaires) || 1)
  const getCommPrev  = sp => getPrimePrev(sp) * (Number(sp.taux_commission) || 0) / 100

  const totalPrime = selectedProducts.reduce((s, sp) => s + getPrimePrev(sp), 0)
  const totalComm  = selectedProducts.reduce((s, sp) => s + getCommPrev(sp), 0)

  const handleSubmit = async e => {
    e.preventDefault()
    if (isPhysique && (!form.nom.trim() || !form.prenom.trim())) {
      return toast.error('Prénom et nom obligatoires')
    }
    if (!isPhysique && !form.nom.trim()) {
      return toast.error('Raison sociale obligatoire')
    }
    setLoading(true)
    try {
      const payload = {
        ...form,
        prospect_products: selectedProducts
          .filter(sp => sp.product_id)
          .map(sp => ({ product_id: sp.product_id, nb_beneficiaires: Number(sp.nb_beneficiaires) || 1 })),
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

  if (initLoading) return (
    <div className="flex justify-center py-20">
      <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const isPhysique = form.type === 'physique'

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(-1)} className="btn btn-secondary btn-sm">
          <ArrowLeft size={15} />Retour
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            {isEdit ? 'Modifier le prospect' : 'Nouveau prospect'}
          </h1>
          <p className="text-sm text-gray-500">
            {isEdit ? 'Modifier les informations' : 'Saisir les informations du prospect'}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">

        {/* Sélecteur de type */}
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Type de prospect</h2>
          <div className="grid grid-cols-2 gap-3">
            <button type="button"
              onClick={() => f('type', 'physique')}
              className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all
                ${isPhysique ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center
                ${isPhysique ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>
                <User size={20} />
              </div>
              <div className="text-left">
                <p className={`text-sm font-semibold ${isPhysique ? 'text-blue-700' : 'text-gray-700'}`}>Personne physique</p>
                <p className="text-xs text-gray-400">Particulier</p>
              </div>
            </button>
            <button type="button"
              onClick={() => f('type', 'morale')}
              className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all
                ${!isPhysique ? 'border-purple-500 bg-purple-50' : 'border-gray-200 hover:border-gray-300'}`}>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center
                ${!isPhysique ? 'bg-purple-100 text-purple-600' : 'bg-gray-100 text-gray-500'}`}>
                <Building2 size={20} />
              </div>
              <div className="text-left">
                <p className={`text-sm font-semibold ${!isPhysique ? 'text-purple-700' : 'text-gray-700'}`}>Personne morale</p>
                <p className="text-xs text-gray-400">Entreprise</p>
              </div>
            </button>
          </div>
        </div>

        {/* ── PHYSIQUE : Identité ─────────────────────────────────────────── */}
        {isPhysique && (
          <div className="card space-y-4">
            <h2 className="text-sm font-semibold text-gray-700">Identité</h2>

            <div>
              <label className="label">Sexe</label>
              <div className="flex gap-4">
                {['Homme', 'Femme'].map(s => (
                  <label key={s} className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl border-2 cursor-pointer transition-all flex-1 justify-center
                    ${form.sexe === s
                      ? s === 'Homme' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-pink-500 bg-pink-50 text-pink-700'
                      : 'border-gray-200 hover:border-gray-300 text-gray-600'}`}>
                    <input type="radio" name="sexe" value={s} checked={form.sexe === s}
                      onChange={() => f('sexe', s)} className="sr-only" />
                    <span className="text-sm font-semibold">{s}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Prénom" required>
                <input className="input" type="text" value={form.prenom}
                  onChange={e => f('prenom', e.target.value)} required placeholder="Mamadou" />
              </Field>
              <Field label="Nom" required>
                <input className="input" type="text" value={form.nom}
                  onChange={e => f('nom', e.target.value)} required placeholder="DIALLO" />
              </Field>
            </div>
          </div>
        )}

        {/* ── MORALE : Entreprise ─────────────────────────────────────────── */}
        {!isPhysique && (
          <div className="card space-y-4">
            <h2 className="text-sm font-semibold text-gray-700">Entreprise</h2>
            <Field label="Raison sociale" required>
              <input className="input" type="text" value={form.nom}
                onChange={e => f('nom', e.target.value)} required placeholder="Entreprise SARL" />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Prénom du contact">
                <input className="input" type="text" value={form.prenom_contact}
                  onChange={e => f('prenom_contact', e.target.value)} placeholder="Mariama" />
              </Field>
              <Field label="Nom du contact">
                <input className="input" type="text" value={form.nom_contact}
                  onChange={e => f('nom_contact', e.target.value)} placeholder="CAMARA" />
              </Field>
            </div>
            <LocationSelect
              communeValue={form.siege_social_commune}
              quartierValue={form.siege_social_quartier}
              onCommuneChange={v => f('siege_social_commune', v)}
              onQuartierChange={v => f('siege_social_quartier', v)}
              labelCommune="Siège social – Commune"
              labelQuartier="Siège social – Quartier"
            />
            <Field label="Secteur d'activité">
              <select className="input" value={form.secteur_activite}
                onChange={e => f('secteur_activite', e.target.value)}>
                <option value="">Sélectionner...</option>
                {SECTEURS_MORALE.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
          </div>
        )}

        {/* ── Coordonnées ─────────────────────────────────────────────────── */}
        <div className="card space-y-4">
          <h2 className="text-sm font-semibold text-gray-700">Coordonnées</h2>
          <Field label="Téléphone" required>
            <input className="input" type="tel" value={form.telephone} required
              onChange={e => f('telephone', e.target.value)} placeholder="+224 6XX XX XX XX" />
          </Field>

          {!isPhysique && (
            <Field label="Email">
              <input className="input" type="email" value={form.email}
                onChange={e => f('email', e.target.value)} placeholder="contact@entreprise.com" />
            </Field>
          )}

          {isPhysique && (
            <>
              <div>
                <label className="label">Lieu de résidence</label>
                <LocationSelect3
                  villeValue={lieuResidenceVille}
                  communeValue={form.lieu_residence_commune}
                  quartierValue={form.lieu_residence_quartier}
                  onVilleChange={setLieuResidenceVille}
                  onCommuneChange={v => f('lieu_residence_commune', v)}
                  onQuartierChange={v => f('lieu_residence_quartier', v)}
                />
              </div>
              <LocationSelect
                communeValue={form.lieu_activite_commune}
                quartierValue={form.lieu_activite_quartier}
                onCommuneChange={v => f('lieu_activite_commune', v)}
                onQuartierChange={v => f('lieu_activite_quartier', v)}
                labelCommune="Lieu d'activité – Commune"
                labelQuartier="Lieu d'activité – Quartier"
              />
              <Field label="Profession">
                <select className="input" value={form.profession}
                  onChange={e => f('profession', e.target.value)}>
                  <option value="">Sélectionner...</option>
                  {PROFESSIONS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </Field>
            </>
          )}
        </div>

        {/* ── Informations commerciales ────────────────────────────────────── */}
        <div className="card space-y-4">
          <h2 className="text-sm font-semibold text-gray-700">Informations commerciales</h2>

          <Field label="Statut commercial">
            {isEdit ? (
              <select className="input" value={form.statut} onChange={e => f('statut', e.target.value)}>
                <option value="prospect">Prospect</option>
                <option value="client">Client</option>
              </select>
            ) : (
              <div className="input bg-gray-50 text-gray-500 cursor-default select-none">Prospect</div>
            )}
          </Field>

          <Field label="Niveau d'intérêt">
            <select className="input" value={form.niveau_interet} onChange={e => f('niveau_interet', e.target.value)}>
              <option value="">Sélectionner...</option>
              {NIVEAUX_INTERET.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </Field>

          {isEdit && (
            <Field label="Date de prospection">
              <input className="input bg-gray-50 text-gray-500 cursor-default" type="date"
                value={form.date_prospection} readOnly />
            </Field>
          )}

          {/* Table des produits */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label mb-0">Produits d'assurance</label>
              <button type="button" onClick={addProduct}
                className="btn btn-secondary btn-sm"
                disabled={availableProducts.length === 0}>
                <Plus size={13} />Ajouter
              </button>
            </div>

            {availableProducts.length === 0 && (
              <p className="text-xs text-gray-400 py-2">Aucun produit actif. L'administrateur doit en créer.</p>
            )}

            {selectedProducts.length > 0 && (
              <div className="overflow-x-auto border border-gray-100 rounded-xl">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr className="text-xs text-gray-500 uppercase tracking-wide">
                      <th className="px-3 py-2 text-left font-medium">Produit</th>
                      <th className="px-3 py-2 text-right font-medium w-24">Bénéficiaires</th>
                      <th className="px-3 py-2 text-right font-medium">Prime prév.</th>
                      <th className="px-3 py-2 text-right font-medium">Commission prév.</th>
                      <th className="px-3 py-2 w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {selectedProducts.map((sp, idx) => {
                      const primePrev = getPrimePrev(sp)
                      const commPrev  = getCommPrev(sp)
                      return (
                        <tr key={idx} className="hover:bg-gray-50">
                          <td className="px-3 py-2">
                            <select
                              className="input text-sm"
                              value={sp.product_id}
                              onChange={e => updateProduct(idx, 'product_id', e.target.value)}
                            >
                              <option value="">Choisir un produit...</option>
                              {availableProducts.map(p => (
                                <option key={p.id} value={p.id}>{p.nom}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-3 py-2">
                            <input
                              className="input text-right w-20 ml-auto"
                              type="number" min="1" step="1"
                              value={sp.nb_beneficiaires}
                              onChange={e => updateProduct(idx, 'nb_beneficiaires', e.target.value)}
                              placeholder="1"
                            />
                          </td>
                          <td className="px-3 py-2 text-right font-medium text-blue-700">
                            {sp.product_id ? fmt(primePrev) : '—'}
                          </td>
                          <td className="px-3 py-2 text-right font-medium text-purple-700">
                            {sp.product_id ? fmt(commPrev) : '—'}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <button type="button" onClick={() => removeProduct(idx)}
                              className="text-red-400 hover:text-red-600 transition-colors">
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  {selectedProducts.some(sp => sp.product_id) && (
                    <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                      <tr className="text-sm font-bold">
                        <td className="px-3 py-2 text-gray-600 text-xs uppercase tracking-wide" colSpan={2}>Total</td>
                        <td className="px-3 py-2 text-right text-blue-800">{fmt(totalPrime)}</td>
                        <td className="px-3 py-2 text-right text-purple-800">{fmt(totalComm)}</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-3 pb-6">
          <button type="button" onClick={() => navigate(-1)} className="btn btn-secondary flex-1 justify-center">
            Annuler
          </button>
          <button type="submit" disabled={loading} className="btn btn-primary flex-1 justify-center">
            {loading
              ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <Save size={16} />}
            {loading ? 'En cours...' : (isEdit ? 'Enregistrer' : 'Créer le prospect')}
          </button>
        </div>
      </form>
    </div>
  )
}
