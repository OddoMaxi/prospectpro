import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../../api'
import toast from 'react-hot-toast'
import { Save, ArrowLeft, User, Building2, Plus, Trash2, AlertTriangle } from 'lucide-react'
import { VILLES, getCommunes, getQuartiers, getVilleFromCommune } from '../../data/guinea'
import { Field, Modal, Spinner, errMsg } from '../../components/ui'
import ReferentielInput from '../../components/ReferentielInput'
import { fmtMoney, fmtRate } from '../../utils/format'
import { tarif } from '../../utils/tarif'

const NIVEAUX_INTERET = ['Faible', 'Moyen', 'Élevé']

const EMPTY = {
  type: 'physique', nom: '', prenom: '', sexe: '', date_naissance: '',
  nom_contact: '', prenom_contact: '', telephone: '', email: '',
  lieu_residence_commune: '', lieu_residence_quartier: '',
  lieu_activite_commune: '', lieu_activite_quartier: '',
  siege_social_commune: '', siege_social_quartier: '',
  profession: '', secteur_activite: '', niveau_interet: '', statut: 'prospect',
}

function LocationSelect3({ villeValue, communeValue, quartierValue, onVilleChange, onCommuneChange, onQuartierChange }) {
  const communes = villeValue ? getCommunes(villeValue) : []
  const quartiers = communeValue ? getQuartiers(communeValue) : []
  return (
    <div className="grid grid-cols-3 gap-3">
      <Field label="Ville">
        <select className="input" value={villeValue} onChange={e => { onVilleChange(e.target.value); onCommuneChange(''); onQuartierChange('') }}>
          <option value="">Ville...</option>
          {VILLES.map(v => <option key={v} value={v}>{v}</option>)}
        </select>
      </Field>
      <Field label="Commune">
        <select className="input" value={communeValue} disabled={!villeValue} onChange={e => { onCommuneChange(e.target.value); onQuartierChange('') }}>
          <option value="">Commune...</option>
          {communes.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </Field>
      <Field label="Quartier">
        <select className="input" value={quartierValue} disabled={!communeValue} onChange={e => onQuartierChange(e.target.value)}>
          <option value="">Quartier...</option>
          {quartiers.map(q => <option key={q} value={q}>{q}</option>)}
        </select>
      </Field>
    </div>
  )
}

// Doublons potentiels : l'agent peut annuler ou enregistrer quand même
function DoublonsModal({ doublons, onCancel, onForce }) {
  return (
    <Modal title="Ce prospect existe peut-être déjà" onClose={onCancel}>
      <div className="space-y-3">
        {doublons.map(d => (
          <div key={d.id} className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm">
            <AlertTriangle size={16} className="text-amber-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-gray-900">{d.source === 'client' ? 'Client' : 'Prospect'} #{d.numero} — {d.nom}</p>
              <p className="text-gray-600">Suivi par {d.agent} · {d.raisons.join(', ')}</p>
            </div>
          </div>
        ))}
        <div className="flex gap-3 pt-2">
          <button onClick={onCancel} className="btn btn-secondary flex-1 justify-center">Ne pas enregistrer</button>
          <button onClick={onForce} className="btn btn-primary flex-1 justify-center">Enregistrer quand même</button>
        </div>
      </div>
    </Modal>
  )
}

export default function ProspectForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEdit = !!id

  const [form, setForm] = useState(EMPTY)
  const [villes, setVilles] = useState({ residence: '', activite: '', siege: '' })
  const [loading, setLoading] = useState(false)
  const [initLoading, setInitLoading] = useState(isEdit)
  const [availableProducts, setAvailableProducts] = useState([])
  const [selectedProducts, setSelectedProducts] = useState([])
  const [doublons, setDoublons] = useState(null)

  useEffect(() => { api.get('/products/active').then(r => setAvailableProducts(r.data)).catch(() => {}) }, [])

  useEffect(() => {
    if (!isEdit) return
    api.get(`/prospects/${id}`)
      .then(r => {
        const p = r.data
        setForm(Object.fromEntries(Object.keys(EMPTY).map(k => [k, p[k] ?? EMPTY[k]])))
        setVilles({
          residence: p.lieu_residence_commune ? getVilleFromCommune(p.lieu_residence_commune) : '',
          activite: p.lieu_activite_commune ? getVilleFromCommune(p.lieu_activite_commune) : '',
          siege: p.siege_social_commune ? getVilleFromCommune(p.siege_social_commune) : '',
        })
        setSelectedProducts(p.prospect_products.map(pp => ({ product_id: pp.product_id, nb_beneficiaires: String(pp.nb_beneficiaires || 1) })))
      })
      .catch(() => { toast.error('Prospect introuvable'); navigate('/agent/prospects') })
      .finally(() => setInitLoading(false))
  }, [id, isEdit])

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const isPhysique = form.type === 'physique'

  const rows = selectedProducts.map(sp => {
    const p = availableProducts.find(x => x.id === sp.product_id)
    return { ...sp, p, t: p ? tarif(p, sp.nb_beneficiaires) : null }
  })
  const total = k => rows.reduce((s, r) => s + (r.t ? r.t[k] : 0), 0)
  const totalComm = rows.reduce((s, r) => s + (r.t ? r.t.prime_pure * r.p.taux_commission / 100 : 0), 0)
  const updateProduct = (idx, key, value) => setSelectedProducts(prev => prev.map((sp, i) => (i === idx ? { ...sp, [key]: value } : sp)))

  const save = async (forcer = false) => {
    setLoading(true)
    try {
      const payload = {
        ...form, forcer_doublon: forcer,
        prospect_products: selectedProducts.filter(sp => sp.product_id).map(sp => ({ product_id: sp.product_id, nb_beneficiaires: Number(sp.nb_beneficiaires) || 1 })),
      }
      const r = isEdit ? await api.put(`/prospects/${id}`, payload) : await api.post('/prospects', payload)
      const c = r.data.corrections || {}
      if (c.profession) toast(`Profession corrigée en : ${c.profession}`, { icon: '✏️' })
      if (c.secteur_activite) toast(`Secteur corrigé en : ${c.secteur_activite}`, { icon: '✏️' })
      toast.success(isEdit ? 'Prospect mis à jour' : 'Prospect créé')
      navigate('/agent/prospects')
    } catch (err) {
      if (err.response?.status === 409 && err.response.data?.doublons) setDoublons(err.response.data.doublons)
      else toast.error(errMsg(err, "Erreur lors de l'enregistrement"))
    } finally { setLoading(false) }
  }

  const handleSubmit = e => {
    e.preventDefault()
    if (isPhysique && (!form.nom.trim() || !form.prenom.trim())) return toast.error('Prénom et nom obligatoires')
    if (!isPhysique && !form.nom.trim()) return toast.error('Raison sociale obligatoire')
    save(false)
  }

  if (initLoading) return <Spinner className="py-20" />

  return (
    <div className="max-w-2xl mx-auto">
      {doublons && <DoublonsModal doublons={doublons} onCancel={() => setDoublons(null)} onForce={() => { setDoublons(null); save(true) }} />}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(-1)} className="btn btn-secondary btn-sm"><ArrowLeft size={15} />Retour</button>
        <div>
          <h1 className="text-xl font-bold text-gray-900">{isEdit ? 'Modifier le prospect' : 'Nouveau prospect'}</h1>
          <p className="text-sm text-gray-500">{isEdit ? 'Modifier les informations' : 'Les doublons (même téléphone, même nom et date de naissance, même raison sociale) sont signalés avant l\'enregistrement.'}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Type de prospect</h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              ['physique', 'Personne physique', 'Particulier', User, 'border-blue-500 bg-blue-50', 'text-blue-600'],
              ['morale', 'Personne morale', 'Entreprise', Building2, 'border-purple-500 bg-purple-50', 'text-purple-600'],
            ].map(([v, l, s, Icon, on, iconOn]) => (
              <button key={v} type="button" onClick={() => f('type', v)}
                className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all ${form.type === v ? on : 'border-gray-200 hover:border-gray-300'}`}>
                <Icon size={20} className={form.type === v ? iconOn : 'text-gray-400'} />
                <div className="text-left"><p className="text-sm font-semibold text-gray-700">{l}</p><p className="text-xs text-gray-400">{s}</p></div>
              </button>
            ))}
          </div>
        </div>

        {isPhysique ? (
          <div className="card space-y-4">
            <h2 className="text-sm font-semibold text-gray-700">Identité</h2>
            <div className="flex gap-4">
              {['Homme', 'Femme'].map(s => (
                <label key={s} className={`flex-1 text-center px-4 py-2.5 rounded-xl border-2 cursor-pointer text-sm font-semibold ${form.sexe === s ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600'}`}>
                  <input type="radio" className="sr-only" checked={form.sexe === s} onChange={() => f('sexe', s)} />{s}
                </label>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Prénom" required><input className="input" value={form.prenom} onChange={e => f('prenom', e.target.value)} required placeholder="Mamadou" /></Field>
              <Field label="Nom" required><input className="input" value={form.nom} onChange={e => f('nom', e.target.value)} required placeholder="DIALLO" /></Field>
            </div>
            <Field label="Date de naissance"><input type="date" className="input" value={form.date_naissance || ''} onChange={e => f('date_naissance', e.target.value)} /></Field>
          </div>
        ) : (
          <div className="card space-y-4">
            <h2 className="text-sm font-semibold text-gray-700">Entreprise</h2>
            <Field label="Raison sociale" required><input className="input" value={form.nom} onChange={e => f('nom', e.target.value)} required placeholder="Entreprise SARL" /></Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Prénom du contact"><input className="input" value={form.prenom_contact} onChange={e => f('prenom_contact', e.target.value)} /></Field>
              <Field label="Nom du contact"><input className="input" value={form.nom_contact} onChange={e => f('nom_contact', e.target.value)} /></Field>
            </div>
            <div>
              <label className="label">Siège social</label>
              <LocationSelect3 villeValue={villes.siege} communeValue={form.siege_social_commune} quartierValue={form.siege_social_quartier}
                onVilleChange={v => setVilles(p => ({ ...p, siege: v }))} onCommuneChange={v => f('siege_social_commune', v)} onQuartierChange={v => f('siege_social_quartier', v)} />
            </div>
            <Field label="Secteur d'activité">
              <ReferentielInput type="secteur" value={form.secteur_activite || ''} onChange={v => f('secteur_activite', v)} placeholder="Commencez à taper…" />
            </Field>
          </div>
        )}

        <div className="card space-y-4">
          <h2 className="text-sm font-semibold text-gray-700">Coordonnées</h2>
          <Field label="Téléphone" required><input className="input" type="tel" value={form.telephone} required onChange={e => f('telephone', e.target.value)} placeholder="+224 6XX XX XX XX" /></Field>
          {!isPhysique && <Field label="Email"><input className="input" type="email" value={form.email || ''} onChange={e => f('email', e.target.value)} /></Field>}
          {isPhysique && (
            <>
              <div>
                <label className="label">Lieu de résidence</label>
                <LocationSelect3 villeValue={villes.residence} communeValue={form.lieu_residence_commune} quartierValue={form.lieu_residence_quartier}
                  onVilleChange={v => setVilles(p => ({ ...p, residence: v }))} onCommuneChange={v => f('lieu_residence_commune', v)} onQuartierChange={v => f('lieu_residence_quartier', v)} />
              </div>
              <div>
                <label className="label">Lieu d'activité</label>
                <LocationSelect3 villeValue={villes.activite} communeValue={form.lieu_activite_commune} quartierValue={form.lieu_activite_quartier}
                  onVilleChange={v => setVilles(p => ({ ...p, activite: v }))} onCommuneChange={v => f('lieu_activite_commune', v)} onQuartierChange={v => f('lieu_activite_quartier', v)} />
              </div>
              <Field label="Profession">
                <ReferentielInput type="profession" value={form.profession || ''} onChange={v => f('profession', v)} placeholder="Commencez à taper…" />
              </Field>
            </>
          )}
        </div>

        <div className="card space-y-4">
          <h2 className="text-sm font-semibold text-gray-700">Informations commerciales</h2>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Statut commercial">
              <select className="input" value={form.statut} onChange={e => f('statut', e.target.value)}>
                <option value="prospect">Prospect</option>
                <option value="en_cours">En cours</option>
                {isEdit && <option value="perdu">Perdu</option>}
              </select>
            </Field>
            <Field label="Niveau d'intérêt">
              <select className="input" value={form.niveau_interet || ''} onChange={e => f('niveau_interet', e.target.value)}>
                <option value="">Sélectionner...</option>
                {NIVEAUX_INTERET.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </Field>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <div>
                <label className="label mb-0">Simulateur</label>
                <p className="text-xs text-gray-400">Calculs sur la prime pure ; la prime TTC est le montant à communiquer au client.</p>
              </div>
              <button type="button" onClick={() => setSelectedProducts(prev => [...prev, { product_id: '', nb_beneficiaires: '1' }])}
                className="btn btn-secondary btn-sm" disabled={!availableProducts.length}><Plus size={13} />Ajouter</button>
            </div>
            {!availableProducts.length && <p className="text-xs text-gray-400 py-2">Aucun produit actif.</p>}
            {rows.length > 0 && (
              <div className="overflow-x-auto border border-gray-100 rounded-xl">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Produit</th>
                      <th className="px-3 py-2 text-right font-medium w-20">Bénéf.</th>
                      <th className="px-3 py-2 text-right font-medium">Prime pure</th>
                      <th className="px-3 py-2 text-right font-medium hidden sm:table-cell">Commerciale</th>
                      <th className="px-3 py-2 text-right font-medium">TTC</th>
                      <th className="px-3 py-2 text-right font-medium">Commission</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {rows.map((r, idx) => (
                      <tr key={idx}>
                        <td className="px-3 py-2">
                          <select className="input text-sm" value={r.product_id} onChange={e => updateProduct(idx, 'product_id', e.target.value)}>
                            <option value="">Choisir...</option>
                            {availableProducts.map(p => <option key={p.id} value={p.id}>{p.nom}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-2"><input className="input text-right w-16 ml-auto" type="number" min="1" value={r.nb_beneficiaires} onChange={e => updateProduct(idx, 'nb_beneficiaires', e.target.value)} /></td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium">{r.t ? fmtMoney(r.t.prime_pure) : '—'}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-gray-500 hidden sm:table-cell">{r.t ? fmtMoney(r.t.prime_commerciale) : '—'}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-blue-700">{r.t ? fmtMoney(r.t.prime_ttc) : '—'}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-purple-700">{r.t ? <>{fmtMoney(r.t.prime_pure * r.p.taux_commission / 100)}<span className="block text-[11px] text-gray-400">{fmtRate(r.p.taux_commission)} total</span></> : '—'}</td>
                        <td className="px-2"><button type="button" onClick={() => setSelectedProducts(prev => prev.filter((_, i) => i !== idx))} className="text-red-400 hover:text-red-600"><Trash2 size={14} /></button></td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 border-t-2 border-gray-200 font-bold text-sm">
                    <tr>
                      <td className="px-3 py-2 text-xs uppercase text-gray-600" colSpan={2}>Total</td>
                      <td className="px-3 py-2 text-right">{fmtMoney(total('prime_pure'))}</td>
                      <td className="px-3 py-2 text-right text-gray-500 hidden sm:table-cell">{fmtMoney(total('prime_commerciale'))}</td>
                      <td className="px-3 py-2 text-right text-blue-800">{fmtMoney(total('prime_ttc'))}</td>
                      <td className="px-3 py-2 text-right text-purple-800">{fmtMoney(totalComm)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-3 pb-6">
          <button type="button" onClick={() => navigate(-1)} className="btn btn-secondary flex-1 justify-center">Annuler</button>
          <button type="submit" disabled={loading} className="btn btn-primary flex-1 justify-center">
            <Save size={16} />{loading ? 'En cours...' : isEdit ? 'Enregistrer' : 'Créer le prospect'}
          </button>
        </div>
      </form>
    </div>
  )
}
