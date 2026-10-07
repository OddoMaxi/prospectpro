import { useEffect, useState } from 'react'
import { api } from '../api'
import toast from 'react-hot-toast'
import { UserCheck } from 'lucide-react'

const fmt = n => new Intl.NumberFormat('fr-FR').format(Math.round(n || 0))

function addMonths(dateStr, months) {
  if (!dateStr || !months) return ''
  const d = new Date(dateStr)
  d.setMonth(d.getMonth() + Number(months))
  return d.toISOString().split('T')[0]
}

// Modale de conversion prospect → client, partagée entre l'espace agent et l'espace admin.
export default function ConvertModal({ prospectId, onClose, onDone }) {
  const [data, setData] = useState(null)
  const [form, setForm] = useState({ numero_contrat: '', date_effet: '', duree: '' })
  const [primes, setPrimes] = useState({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get(`/prospects/${prospectId}`).then(r => {
      setData(r.data)
      const init = {}
      ;(r.data.prospect_products || []).forEach(p => {
        init[p.product_id] = String(p.nb_beneficiaires * (p.prime_annuelle || 0))
      })
      setPrimes(init)
    })
  }, [prospectId])

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const dateFin = addMonths(form.date_effet, form.duree)
  const primeTotale = Object.values(primes).reduce((s, v) => s + (Number(v) || 0), 0)
  const isSousAgent = data?.is_sous_agent

  const commJunior = data?.prospect_products?.reduce((s, p) => {
    return s + (Number(primes[p.product_id]) || 0) * (p.product_taux_sa || 0) / 100
  }, 0) || 0
  const commAgentTaux = data?.prospect_products?.reduce((s, p) => {
    return s + (Number(primes[p.product_id]) || 0) * (p.product_taux || 0) / 100
  }, 0) || 0
  const commSenior = isSousAgent ? commAgentTaux - commJunior : commAgentTaux
  const commTotale = commAgentTaux

  const handleSubmit = async e => {
    e.preventDefault()
    if (!form.numero_contrat || !form.date_effet || !form.duree) {
      return toast.error('Veuillez remplir tous les champs du contrat')
    }
    if (!dateFin) return toast.error('Date d\'effet ou durée invalide')
    setSaving(true)
    try {
      const products = (data?.prospect_products || []).map(p => ({
        product_id: p.product_id,
        prime_payee: Number(primes[p.product_id]) || 0,
      }))
      await api.post(`/prospects/${prospectId}/convert`, {
        numero_contrat: form.numero_contrat,
        date_effet: form.date_effet,
        duree: form.duree,
        date_fin: dateFin,
        products,
      })
      toast.success('Prospect converti en client !')
      onDone()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erreur lors de la conversion')
    } finally {
      setSaving(false)
    }
  }

  if (!data) return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl p-8">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl my-4">
        <div className="p-5 border-b border-gray-100 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <UserCheck size={18} className="text-emerald-600" />
              <span className="font-bold text-gray-900">Convertir en client</span>
            </div>
            <p className="text-sm text-gray-500">
              {data.numero && <span className="font-mono text-blue-600 mr-2">#{data.numero}</span>}
              {data.type === 'physique' ? `${data.prenom || ''} ${data.nom}`.trim() : data.nom}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl font-bold leading-none">×</button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-5">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Informations du contrat</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="label">N° du contrat d'assurance *</label>
                <input className="input" placeholder="ex: C-2024-001" value={form.numero_contrat}
                  onChange={e => setF('numero_contrat', e.target.value)} required />
              </div>
              <div>
                <label className="label">Date d'effet *</label>
                <input className="input" type="date" value={form.date_effet}
                  onChange={e => setF('date_effet', e.target.value)} required />
              </div>
              <div>
                <label className="label">Durée du contrat (mois) *</label>
                <input className="input" type="number" min="1" max="120" placeholder="ex: 12"
                  value={form.duree} onChange={e => setF('duree', e.target.value)} required />
              </div>
              <div className="sm:col-span-2">
                <label className="label">Date de fin (calculée automatiquement)</label>
                <div className={`input bg-gray-50 text-gray-600 ${dateFin ? 'text-gray-900 font-medium' : 'text-gray-400 italic'}`}>
                  {dateFin ? new Date(dateFin).toLocaleDateString('fr-FR') : 'Renseignez la date d\'effet et la durée'}
                </div>
              </div>
            </div>
          </div>

          {data.prospect_products?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Primes payées par produit</p>
              <div className="space-y-3">
                {data.prospect_products.map(p => {
                  const prime = Number(primes[p.product_id]) || 0
                  const tauxShow = isSousAgent ? (p.product_taux_sa || 0) : (p.product_taux || 0)
                  const comm = prime * tauxShow / 100
                  return (
                    <div key={p.product_id} className="bg-gray-50 rounded-xl p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-gray-800 text-sm">{p.product_nom}</span>
                        <span className="text-xs text-gray-400">
                          {p.nb_beneficiaires} bénéf.
                          {isSousAgent
                            ? ` · Ag. Juniore ${p.product_taux_sa}% / Ag. Séniore ${p.product_taux - p.product_taux_sa}%`
                            : ` · taux ${p.product_taux}%`}
                        </span>
                      </div>
                      <div className="flex gap-3 items-center">
                        <div className="flex-1">
                          <label className="label text-xs">Prime payée (GNF)</label>
                          <input className="input" type="number" min="0"
                            value={primes[p.product_id] ?? ''}
                            onChange={e => setPrimes(pr => ({ ...pr, [p.product_id]: e.target.value }))} />
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs text-gray-400">Commission</p>
                          <p className="font-bold text-emerald-600">{fmt(comm)}</p>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="mt-3 rounded-xl overflow-hidden border border-blue-100">
                <div className="bg-blue-50 p-3 flex justify-between items-center">
                  <div>
                    <p className="text-xs text-blue-600 font-medium">Prime totale</p>
                    <p className="font-bold text-blue-900">{fmt(primeTotale)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-emerald-600 font-medium">Commission totale</p>
                    <p className="font-bold text-emerald-700">{fmt(commTotale)}</p>
                  </div>
                </div>
                {isSousAgent && (
                  <div className="bg-white p-3 grid grid-cols-2 gap-3 border-t border-blue-100">
                    <div className="bg-orange-50 rounded-lg p-2.5">
                      <p className="text-xs text-orange-600 font-medium mb-0.5">Agent Commercial Juniore</p>
                      <p className="font-bold text-orange-800">{fmt(commJunior)}</p>
                    </div>
                    <div className="bg-blue-50 rounded-lg p-2.5">
                      <p className="text-xs text-blue-600 font-medium mb-0.5">Agent Commercial Séniore</p>
                      <p className="font-bold text-blue-800">{fmt(commSenior)}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {data.prospect_products?.length === 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-700">
              Ce prospect n'a pas de produits associés. La prime et la commission seront à zéro.
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn btn-secondary flex-1">Annuler</button>
            <button type="submit" disabled={saving || !dateFin} className="btn btn-primary flex-1">
              {saving ? 'Conversion...' : 'Confirmer la conversion'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
