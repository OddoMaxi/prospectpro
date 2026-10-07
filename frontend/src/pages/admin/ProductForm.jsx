import { useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { ArrowLeft, Save } from 'lucide-react'
import { api } from '../../api'
import { Spinner, Field, MoneyInput, RateInput, errMsg } from '../../components/ui'
import { fmtMoney, fmtRate } from '../../utils/format'

const EMPTY = {
  nom: '', description: '', branche_id: '',
  prime_pure: '', cout_police: '', accessoires: '', taux_taxe: '',
  taux_commission: '', taux_commission_sous_agent: '',
  taux_renouvellement: '', taux_renouvellement_junior: '',
  performance_active: false, taux_performance: '', taux_performance_junior: '',
  delai_anticipation_mois: 1,
}

function SplitRow({ label, total, junior, onTotal, onJunior, base }) {
  const t = Number(total) || 0, j = Number(junior) || 0
  return (
    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
      <p className="text-sm font-medium text-gray-700 sm:pb-2">{label}</p>
      <Field label="Taux total"><RateInput value={total} onChange={onTotal} /></Field>
      <Field label="dont part Junior"><RateInput value={junior} onChange={onJunior} /></Field>
      <div className="text-xs text-gray-500 sm:pb-2">
        Part Sénior : <strong className="text-gray-700">{fmtRate(Math.max(0, t - j))}</strong>
        {base > 0 && <span className="block">soit {fmtMoney(base * t / 100)} au total</span>}
      </div>
    </div>
  )
}

export default function ProductForm() {
  const { id } = useParams()
  const isEdit = !!id
  const navigate = useNavigate()
  const [form, setForm] = useState(EMPTY)
  const [branches, setBranches] = useState(null)
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  useEffect(() => { api.get('/branches').then(r => setBranches(r.data)) }, [])
  useEffect(() => {
    if (!isEdit) {
      api.get('/parametres').then(r => {
        const d = r.data.find(p => p.cle === 'delai_anticipation_mois')
        if (d) f('delai_anticipation_mois', Number(d.valeur) || 1)
      }).catch(() => {})
      return
    }
    api.get(`/products/${id}`).then(r => {
      const p = r.data
      setForm(Object.fromEntries(Object.keys(EMPTY).map(k => [k, k === 'performance_active' ? !!p[k] : (p[k] ?? '')])))
    }).catch(() => { toast.error('Produit introuvable'); navigate('/admin/products') }).finally(() => setLoading(false))
  }, [id])

  const branche = branches?.find(b => b.id === form.branche_id)
  const tauxTaxe = form.taux_taxe !== '' ? Number(form.taux_taxe) : Number(branche?.taux_taxe || 0)
  const pure = Number(form.prime_pure) || 0
  const commerciale = pure + (Number(form.cout_police) || 0) + (Number(form.accessoires) || 0)
  const taxes = Math.round(commerciale * tauxTaxe / 100)

  const submit = async e => {
    e.preventDefault()
    setSaving(true)
    try {
      if (isEdit) await api.put(`/products/${id}`, form)
      else await api.post('/products', form)
      toast.success(isEdit ? 'Produit mis à jour' : 'Produit créé')
      navigate('/admin/products')
    } catch (err) { toast.error(errMsg(err)) } finally { setSaving(false) }
  }

  if (loading || !branches) return <Spinner />

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/admin/products')} className="btn btn-secondary btn-sm"><ArrowLeft size={15} />Retour</button>
        <h1 className="text-xl font-bold text-gray-900">{isEdit ? 'Modifier le produit' : 'Nouveau produit'}</h1>
      </div>

      {branches.length === 0 ? (
        <div className="card text-center py-10">
          <p className="text-gray-600 mb-3">Créez d'abord une branche : chaque produit appartient à une branche.</p>
          <Link to="/admin/branches" className="btn btn-primary inline-flex">Gérer les branches</Link>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-5">
          <div className="card space-y-4">
            <h2 className="text-sm font-semibold text-gray-700">Produit</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Branche" required>
                <select className="input" value={form.branche_id} onChange={e => f('branche_id', e.target.value)} required>
                  <option value="">Choisir…</option>
                  {branches.map(b => <option key={b.id} value={b.id}>{b.nom}</option>)}
                </select>
              </Field>
              <Field label="Nom du produit" required>
                <input className="input" value={form.nom} onChange={e => f('nom', e.target.value)} required />
              </Field>
            </div>
            <Field label="Description">
              <textarea className="input" rows={2} value={form.description} onChange={e => f('description', e.target.value)} />
            </Field>
          </div>

          <div className="card space-y-4">
            <h2 className="text-sm font-semibold text-gray-700">Tarification (par bénéficiaire)</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Prime pure" required hint="Base de calcul des commissions et de la prime de performance">
                <MoneyInput value={form.prime_pure} onChange={v => f('prime_pure', v)} required />
              </Field>
              <Field label="Coût de police"><MoneyInput value={form.cout_police} onChange={v => f('cout_police', v)} /></Field>
              <Field label="Accessoires"><MoneyInput value={form.accessoires} onChange={v => f('accessoires', v)} /></Field>
              <Field label="Taux de taxe du produit" hint={`Laisser vide pour appliquer le taux de la branche (${fmtRate(branche?.taux_taxe || 0)})`}>
                <RateInput value={form.taux_taxe} onChange={v => f('taux_taxe', v)} placeholder={String(branche?.taux_taxe ?? '')} />
              </Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-gray-50 rounded-xl p-4 text-sm">
              <div><p className="text-xs text-gray-500">Prime commerciale annuelle</p><p className="font-bold text-gray-900">{fmtMoney(commerciale)}</p><p className="text-[11px] text-gray-400">prime pure + coût de police + accessoires</p></div>
              <div><p className="text-xs text-gray-500">Taxes ({fmtRate(tauxTaxe)})</p><p className="font-bold text-gray-900">{fmtMoney(taxes)}</p></div>
              <div><p className="text-xs text-gray-500">Prime TTC</p><p className="font-bold text-blue-700">{fmtMoney(commerciale + taxes)}</p><p className="text-[11px] text-gray-400">calculée, non saisissable</p></div>
            </div>
          </div>

          <div className="card space-y-5">
            <div>
              <h2 className="text-sm font-semibold text-gray-700">Rémunération</h2>
              <p className="text-xs text-gray-400 mt-0.5">Un Sénior qui vend lui-même touche le taux total. Sur la vente d'un Junior, le Junior touche sa part et son Sénior la différence. Base : prime pure.</p>
            </div>
            <SplitRow label="Commission à la souscription" base={pure}
              total={form.taux_commission} junior={form.taux_commission_sous_agent}
              onTotal={v => f('taux_commission', v)} onJunior={v => f('taux_commission_sous_agent', v)} />
            <SplitRow label="Commission au renouvellement" base={pure}
              total={form.taux_renouvellement} junior={form.taux_renouvellement_junior}
              onTotal={v => f('taux_renouvellement', v)} onJunior={v => f('taux_renouvellement_junior', v)} />
            <div className="border-t border-gray-100 pt-4 space-y-4">
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" className="w-4 h-4" checked={form.performance_active} onChange={e => f('performance_active', e.target.checked)} />
                <span className="text-sm font-medium text-gray-700">Prime de performance pour les renouvellements anticipés</span>
              </label>
              {form.performance_active && (
                <>
                  <SplitRow label="Prime de performance" base={pure}
                    total={form.taux_performance} junior={form.taux_performance_junior}
                    onTotal={v => f('taux_performance', v)} onJunior={v => f('taux_performance_junior', v)} />
                  <Field label="Délai d'anticipation requis" hint="Le renouvellement doit être intégralement payé au moins ce nombre de mois avant l'échéance.">
                    <div className="flex items-center gap-2">
                      <input type="number" min="1" max="12" className="input w-24" value={form.delai_anticipation_mois} onChange={e => f('delai_anticipation_mois', e.target.value)} />
                      <span className="text-sm text-gray-500">mois avant l'échéance</span>
                    </div>
                  </Field>
                </>
              )}
            </div>
          </div>

          <div className="flex gap-3 pb-6">
            <button type="button" onClick={() => navigate('/admin/products')} className="btn btn-secondary flex-1 justify-center">Annuler</button>
            <button disabled={saving} className="btn btn-primary flex-1 justify-center"><Save size={16} />{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
          </div>
        </form>
      )}
    </div>
  )
}
