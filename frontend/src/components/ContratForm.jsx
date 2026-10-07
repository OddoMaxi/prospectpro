// Souscription d'un contrat : conversion d'un prospect ou nouveau contrat pour un client existant.
// Les commissions ne sont générées qu'une fois la prime intégralement payée.
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Plus, Trash2 } from 'lucide-react'
import { api } from '../api'
import { Modal, Field, MoneyInput, Spinner, errMsg } from './ui'
import { fmtMoney, fmtRate, personName, today, MODES_PAIEMENT } from '../utils/format'
import { tarif } from '../utils/tarif'

const addMonths = (s, n) => {
  if (!s || !n) return ''
  const [y, m, d] = s.split('-').map(Number)
  const t = new Date(y, m - 1 + Number(n), 1)
  const last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate()
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`
}

export default function ContratForm({ prospectId, client, onClose, onDone }) {
  const [prospect, setProspect] = useState(null)
  const [products, setProducts] = useState(null)
  const [lines, setLines] = useState([])
  const [form, setForm] = useState({ numero_contrat: '', date_effet: today(), duree_mois: 12 })
  const [pay, setPay] = useState({ montant: '', date_paiement: today(), mode: 'especes', reference: '' })
  const [saving, setSaving] = useState(false)
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  useEffect(() => {
    api.get('/products/active').then(r => setProducts(r.data))
    api.get('/parametres').then(r => {
      const d = r.data.find(p => p.cle === 'duree_contrat_mois')
      if (d) f('duree_mois', Number(d.valeur) || 12)
    }).catch(() => {})
    if (prospectId) {
      api.get(`/prospects/${prospectId}`).then(r => {
        setProspect(r.data)
        const interets = r.data.prospect_products.filter(p => p.product_statut === 'actif')
          .map(p => ({ product_id: p.product_id, nb_beneficiaires: p.nb_beneficiaires }))
        setLines(interets.length ? interets : [{ product_id: '', nb_beneficiaires: 1 }])
      })
    } else setLines([{ product_id: '', nb_beneficiaires: 1 }])
  }, [prospectId])

  const subject = prospect || client
  const isJunior = prospect ? prospect.is_sous_agent : false
  const rows = lines.map(l => {
    const p = products?.find(x => x.id === l.product_id)
    return { ...l, p, t: p ? tarif(p, l.nb_beneficiaires) : null }
  })
  const total = k => rows.reduce((s, r) => s + (r.t ? r.t[k] : 0), 0)
  const ttc = total('prime_ttc')
  const setLine = (i, k, v) => setLines(prev => prev.map((l, j) => (j === i ? { ...l, [k]: v } : l)))

  const submit = async e => {
    e.preventDefault()
    const produits = lines.filter(l => l.product_id)
    if (!produits.length) return toast.error('Ajoutez au moins un produit')
    if (pay.montant && Number(pay.montant) > ttc) return toast.error('Le paiement dépasse la prime TTC')
    setSaving(true)
    try {
      const body = { ...form, produits, paiement: pay.montant ? pay : null }
      if (prospectId) await api.post(`/prospects/${prospectId}/convert`, body)
      else await api.post('/contrats', { ...body, client_id: client.id })
      toast.success(prospectId ? 'Prospect converti : client et contrat créés' : 'Contrat créé')
      onDone()
    } catch (err) { toast.error(errMsg(err)) } finally { setSaving(false) }
  }

  return (
    <Modal title={prospectId ? 'Convertir en client' : 'Nouveau contrat'} subtitle={subject ? `${subject.numero ? `#${subject.numero} ` : ''}${personName(subject)}` : ''} onClose={onClose} size="max-w-3xl">
      {!products || (prospectId && !prospect) ? <Spinner className="py-8" /> : (
        <form onSubmit={submit} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="sm:col-span-2"><Field label="N° de contrat" required><input className="input" value={form.numero_contrat} onChange={e => f('numero_contrat', e.target.value)} required /></Field></div>
            <Field label="Date d'effet" required><input type="date" className="input" value={form.date_effet} onChange={e => f('date_effet', e.target.value)} required /></Field>
            <Field label="Durée (mois)" required hint={form.date_effet ? `Échéance : ${addMonths(form.date_effet, form.duree_mois).split('-').reverse().join('/')}` : ''}>
              <input type="number" min="1" max="120" className="input" value={form.duree_mois} onChange={e => f('duree_mois', e.target.value)} required />
            </Field>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Produits souscrits</p>
              <button type="button" onClick={() => setLines(l => [...l, { product_id: '', nb_beneficiaires: 1 }])} className="btn btn-secondary btn-sm"><Plus size={13} />Ajouter</button>
            </div>
            <div className="overflow-x-auto border border-gray-100 rounded-xl">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Produit</th>
                    <th className="px-3 py-2 text-right font-medium w-24">Bénéf.</th>
                    <th className="px-3 py-2 text-right font-medium">Prime pure</th>
                    <th className="px-3 py-2 text-right font-medium">Prime TTC</th>
                    <th className="px-3 py-2 text-right font-medium">Commission</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {rows.map((r, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2">
                        <select className="input" value={r.product_id} onChange={e => setLine(i, 'product_id', e.target.value)}>
                          <option value="">Choisir…</option>
                          {products.map(p => <option key={p.id} value={p.id}>{p.nom} ({p.branche_nom})</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2"><input type="number" min="1" className="input text-right w-20 ml-auto" value={r.nb_beneficiaires} onChange={e => setLine(i, 'nb_beneficiaires', e.target.value)} /></td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.t ? fmtMoney(r.t.prime_pure) : '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium text-blue-700">{r.t ? fmtMoney(r.t.prime_ttc) : '—'}</td>
                      <td className="px-3 py-2 text-right text-xs">
                        {r.t ? (isJunior
                          ? <>Junior {fmtMoney(r.t.prime_pure * r.p.taux_commission_sous_agent / 100)}<span className="block text-gray-400">Sénior {fmtMoney(r.t.prime_pure * (r.p.taux_commission - r.p.taux_commission_sous_agent) / 100)}</span></>
                          : <>{fmtMoney(r.t.prime_pure * r.p.taux_commission / 100)}<span className="block text-gray-400">{fmtRate(r.p.taux_commission)}</span></>) : '—'}
                      </td>
                      <td className="px-2"><button type="button" onClick={() => setLines(l => l.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600"><Trash2 size={14} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="grid grid-cols-3 gap-3 mt-3 text-sm">
              <div className="bg-gray-50 rounded-lg p-2.5"><p className="text-xs text-gray-500">Prime pure</p><p className="font-bold">{fmtMoney(total('prime_pure'))}</p></div>
              <div className="bg-gray-50 rounded-lg p-2.5"><p className="text-xs text-gray-500">Prime commerciale</p><p className="font-bold">{fmtMoney(total('prime_commerciale'))}</p></div>
              <div className="bg-blue-50 rounded-lg p-2.5"><p className="text-xs text-blue-600">À payer par le client (TTC)</p><p className="font-bold text-blue-800">{fmtMoney(ttc)}</p></div>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Premier encaissement (facultatif)</p>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <Field label="Montant"><MoneyInput value={pay.montant} onChange={v => setPay(p => ({ ...p, montant: v }))} /></Field>
              <Field label="Date"><input type="date" className="input" value={pay.date_paiement} max={today()} onChange={e => setPay(p => ({ ...p, date_paiement: e.target.value }))} /></Field>
              <Field label="Mode"><select className="input" value={pay.mode} onChange={e => setPay(p => ({ ...p, mode: e.target.value }))}>{Object.entries(MODES_PAIEMENT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
              <Field label="Référence"><input className="input" value={pay.reference} onChange={e => setPay(p => ({ ...p, reference: e.target.value }))} /></Field>
            </div>
            <div className="flex items-center justify-between mt-2">
              <p className="text-xs text-gray-400">Les commissions sont générées quand la prime TTC est intégralement payée.</p>
              {ttc > 0 && <button type="button" onClick={() => setPay(p => ({ ...p, montant: ttc }))} className="text-xs text-blue-600 hover:underline">Paiement intégral ({fmtMoney(ttc)})</button>}
            </div>
          </div>

          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="btn btn-secondary flex-1 justify-center">Annuler</button>
            <button disabled={saving} className="btn btn-primary flex-1 justify-center">{saving ? 'Enregistrement…' : prospectId ? 'Confirmer la conversion' : 'Créer le contrat'}</button>
          </div>
        </form>
      )}
    </Modal>
  )
}
