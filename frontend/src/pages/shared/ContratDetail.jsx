import { Fragment, useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { ArrowLeft, RefreshCw, Wallet, XCircle, MessageCircle, Undo2 } from 'lucide-react'
import { api } from '../../api'
import { useAuth, useBase } from '../../context/AuthContext'
import RelanceModal from '../../components/RelanceModal'
import { Spinner, Badge, Modal, Field, MoneyInput, errMsg } from '../../components/ui'
import {
  personName, fmtMoney, fmtDate, fmtRate, today, MODES_PAIEMENT, STATUTS_CONTRAT, NATURES_LIGNE, ROLES_LIGNE, STATUTS_FACTURE,
} from '../../utils/format'

function PaiementFields({ pay, setPay, max }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <Field label="Montant" hint={max !== undefined ? `Reste à payer : ${fmtMoney(max)}` : ''}>
        <MoneyInput value={pay.montant} onChange={v => setPay(p => ({ ...p, montant: v }))} />
      </Field>
      <Field label="Date du paiement"><input type="date" className="input" max={today()} value={pay.date_paiement} onChange={e => setPay(p => ({ ...p, date_paiement: e.target.value }))} /></Field>
      <Field label="Mode"><select className="input" value={pay.mode} onChange={e => setPay(p => ({ ...p, mode: e.target.value }))}>{Object.entries(MODES_PAIEMENT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
      <Field label="Référence"><input className="input" value={pay.reference} onChange={e => setPay(p => ({ ...p, reference: e.target.value }))} /></Field>
    </div>
  )
}

const emptyPay = montant => ({ montant, date_paiement: today(), mode: 'especes', reference: '' })

export default function ContratDetail() {
  const { id } = useParams()
  const base = useBase()
  const { user } = useAuth()
  const isAdmin = user.role === 'admin'
  const navigate = useNavigate()
  const [c, setC] = useState(null)
  const [modal, setModal] = useState(null)
  const [pay, setPay] = useState(emptyPay(''))
  const [resil, setResil] = useState({ date: today(), motif: '', retroceder: true })
  const [saving, setSaving] = useState(false)

  const load = () => api.get(`/contrats/${id}`).then(r => setC(r.data)).catch(() => navigate(`${base}/contrats`))
  useEffect(() => { load() }, [id])
  if (!c) return <Spinner />

  const derniere = c.periodes.filter(p => p.statut === 'active').slice(-1)[0]
  const actif = c.statut !== 'resilie'
  const peutRenouveler = actif && derniere?.date_paiement_integral
  const resteDerniere = derniere ? derniere.prime_ttc - derniere.montant_paye : 0

  const run = async (fn, after) => {
    setSaving(true)
    try { const r = await fn(); toast.success(r.data.message); setModal(null); after?.(); load() } catch (err) { toast.error(errMsg(err)) } finally { setSaving(false) }
  }
  const openEncaisser = p => { setPay(emptyPay(p.prime_ttc - p.montant_paye)); setModal({ type: 'encaisser', periode: p }) }
  const annuler = e => {
    const motif = prompt('Motif de l\'annulation de cet encaissement :')
    if (motif === null) return
    run(() => api.post(`/contrats/encaissements/${e.id}/annuler`, { motif }))
  }

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      {modal?.type === 'relance' && <RelanceModal contratId={c.id} onClose={() => setModal(null)} />}
      {modal?.type === 'encaisser' && (
        <Modal title="Enregistrer un encaissement" subtitle={`Période ${modal.periode.numero} · prime TTC ${fmtMoney(modal.periode.prime_ttc)}`} onClose={() => setModal(null)}>
          <form onSubmit={e => { e.preventDefault(); run(() => api.post(`/contrats/periodes/${modal.periode.id}/encaissements`, pay)) }} className="space-y-4">
            <PaiementFields pay={pay} setPay={setPay} max={modal.periode.prime_ttc - modal.periode.montant_paye} />
            <button disabled={saving} className="btn btn-primary w-full justify-center">{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
          </form>
        </Modal>
      )}
      {modal?.type === 'renouveler' && (
        <Modal title="Renouveler le contrat" subtitle={`Nouvelle période à partir du ${fmtDate(derniere.date_echeance)} au tarif actuel des produits`} onClose={() => setModal(null)}>
          <form onSubmit={e => { e.preventDefault(); run(() => api.post(`/contrats/${c.id}/renouveler`, { paiement: pay.montant ? pay : null })) }} className="space-y-4">
            <p className="text-sm text-gray-600">Le renouvellement est acquis quand la nouvelle prime est intégralement payée. Payé au plus tard le <strong>{fmtDate(addMonthsStr(derniere.date_echeance, -1))}</strong>, il ouvre droit à la prime de performance (produits concernés).</p>
            <PaiementFields pay={pay} setPay={setPay} />
            <button disabled={saving} className="btn btn-primary w-full justify-center">{saving ? 'Enregistrement…' : 'Créer la période de renouvellement'}</button>
          </form>
        </Modal>
      )}
      {modal?.type === 'resilier' && (
        <Modal title="Résilier le contrat" onClose={() => setModal(null)}>
          <form onSubmit={e => { e.preventDefault(); run(() => api.post(`/contrats/${c.id}/resilier`, resil)) }} className="space-y-4">
            <Field label="Date de résiliation"><input type="date" className="input" value={resil.date} onChange={e => setResil(r => ({ ...r, date: e.target.value }))} /></Field>
            <Field label="Motif" required><input className="input" value={resil.motif} onChange={e => setResil(r => ({ ...r, motif: e.target.value }))} placeholder="Demande du client, de l'assureur…" required /></Field>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={resil.retroceder} onChange={e => setResil(r => ({ ...r, retroceder: e.target.checked }))} />
              <span>Rétrocéder les commissions de la période en cours (lignes négatives sur la facture du mois prochain)</span>
            </label>
            <button disabled={saving} className="btn btn-danger w-full justify-center">{saving ? 'Résiliation…' : 'Résilier'}</button>
          </form>
        </Modal>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => navigate(-1)} className="btn btn-secondary btn-sm"><ArrowLeft size={15} />Retour</button>
        <div className="flex-1 min-w-[200px]">
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-3">Contrat {c.numero_contrat} <Badge def={STATUTS_CONTRAT} value={c.statut_calcule} /></h1>
          <p className="text-sm text-gray-500">
            <Link to={`${base}/clients/${c.client_id}`} className="text-blue-600 hover:underline">{personName(c.client)}</Link> · suivi par {personName(c.client, 'agent_')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {actif && <button onClick={() => setModal({ type: 'relance' })} className="btn btn-secondary"><MessageCircle size={15} />Relancer</button>}
          {peutRenouveler && <button onClick={() => { setPay(emptyPay('')); setModal({ type: 'renouveler' }) }} className="btn btn-primary"><RefreshCw size={15} />Renouveler</button>}
          {actif && derniere && resteDerniere > 0 && <button onClick={() => openEncaisser(derniere)} className="btn btn-success"><Wallet size={15} />Encaisser</button>}
          {isAdmin && actif && <button onClick={() => setModal({ type: 'resilier' })} className="btn btn-danger"><XCircle size={15} />Résilier</button>}
        </div>
      </div>

      <div className="card grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
        <div><p className="text-xs text-gray-500">Date d'effet</p><p className="font-medium">{fmtDate(c.date_effet)}</p></div>
        <div><p className="text-xs text-gray-500">Durée</p><p className="font-medium">{c.duree_mois} mois</p></div>
        <div><p className="text-xs text-gray-500">Échéance en cours</p><p className="font-medium">{fmtDate(c.date_echeance)}{actif && c.jours_restants >= 0 && <span className="text-gray-400"> (J-{c.jours_restants})</span>}</p></div>
        <div><p className="text-xs text-gray-500">Prime TTC en cours</p><p className="font-medium">{fmtMoney(c.prime_ttc)}</p></div>
        <div><p className="text-xs text-gray-500">Produits</p><p className="font-medium">{c.produits.map(p => `${p.product_nom} ×${p.nb_beneficiaires}`).join(', ')}</p></div>
        {c.statut === 'resilie' && <div className="col-span-2 md:col-span-5 text-red-700 bg-red-50 rounded-lg p-2">Résilié le {fmtDate(c.resilie_le)} — {c.resilie_motif}</div>}
      </div>

      <div className="card overflow-x-auto">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Périodes de couverture</h2>
        <table className="w-full text-sm [&_th]:px-2 [&_td]:px-2">
          <thead><tr className="border-b border-gray-100 text-left text-xs text-gray-500 uppercase">
            <th className="pb-2 font-medium">N°</th><th className="pb-2 font-medium">Type</th><th className="pb-2 font-medium">Période</th>
            <th className="pb-2 font-medium text-right">Prime pure</th><th className="pb-2 font-medium text-right hidden md:table-cell">Commerciale</th>
            <th className="pb-2 font-medium text-right">TTC</th><th className="pb-2 font-medium text-right">Payé</th>
            <th className="pb-2 font-medium">Paiement intégral</th><th className="pb-2 font-medium hidden md:table-cell">Agent</th>
          </tr></thead>
          <tbody className="divide-y divide-gray-50">
            {c.periodes.map(p => (
              <Fragment key={p.id}>
                <tr className={p.statut !== 'active' ? 'opacity-50' : ''}>
                  <td className="py-2.5 font-medium">{p.numero}</td>
                  <td className="py-2.5">{p.type === 'souscription' ? 'Souscription' : 'Renouvellement'}{p.anticipe ? <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Anticipé</span> : null}</td>
                  <td className="py-2.5 text-xs">{fmtDate(p.date_debut)} → {fmtDate(p.date_echeance)}</td>
                  <td className="py-2.5 text-right tabular-nums">{fmtMoney(p.prime_pure)}</td>
                  <td className="py-2.5 text-right tabular-nums hidden md:table-cell">{fmtMoney(p.prime_commerciale)}</td>
                  <td className="py-2.5 text-right tabular-nums font-medium">{fmtMoney(p.prime_ttc)}</td>
                  <td className="py-2.5 text-right tabular-nums">{fmtMoney(p.montant_paye)}</td>
                  <td className="py-2.5 text-xs">{p.date_paiement_integral ? <span className="text-emerald-700">{fmtDate(p.date_paiement_integral)}</span> : actif ? <button onClick={() => openEncaisser(p)} className="text-blue-600 hover:underline">Reste {fmtMoney(p.prime_ttc - p.montant_paye)}</button> : '—'}</td>
                  <td className="py-2.5 text-xs hidden md:table-cell">{personName(p, 'agent_')}</td>
                </tr>
                {p.encaissements.map(e => (
                  <tr key={e.id} className={`text-xs bg-gray-50/60 ${e.annule ? 'line-through text-gray-400' : 'text-gray-600'}`}>
                    <td /><td className="py-1.5" colSpan={2}>Encaissement du {fmtDate(e.date_paiement)} · {MODES_PAIEMENT[e.mode] || '—'}{e.reference ? ` · ${e.reference}` : ''}{e.annule ? ` (annulé : ${e.motif_annulation || '—'})` : ''}</td>
                    <td colSpan={3} /><td className="py-1.5 text-right tabular-nums">{fmtMoney(e.montant)}</td>
                    <td colSpan={2}>{isAdmin && !e.annule && <button onClick={() => annuler(e)} className="text-red-500 hover:underline inline-flex items-center gap-1"><Undo2 size={12} />Annuler</button>}</td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card overflow-x-auto">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Commissions {isAdmin ? '' : '(vos parts)'}</h2>
        {c.commissions.length === 0 ? <p className="text-sm text-gray-400">Aucune commission : elles sont générées quand une prime est intégralement payée.</p> : (
          <table className="w-full text-sm [&_th]:px-2 [&_td]:px-2">
            <thead><tr className="border-b border-gray-100 text-left text-xs text-gray-500 uppercase">
              <th className="pb-2 font-medium">Date</th><th className="pb-2 font-medium">Agent</th><th className="pb-2 font-medium">Nature</th>
              <th className="pb-2 font-medium">Part</th><th className="pb-2 font-medium text-right">Base</th><th className="pb-2 font-medium text-right">Taux</th>
              <th className="pb-2 font-medium text-right">Montant</th><th className="pb-2 font-medium">Facture</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {c.commissions.map(l => (
                <tr key={l.id}>
                  <td className="py-2">{fmtDate(l.date_acquisition)}</td>
                  <td className="py-2">{personName(l, 'agent_')}</td>
                  <td className="py-2">{NATURES_LIGNE[l.nature]}</td>
                  <td className="py-2 text-xs">{ROLES_LIGNE[l.role] || '—'}</td>
                  <td className="py-2 text-right tabular-nums">{fmtMoney(l.base)}</td>
                  <td className="py-2 text-right">{fmtRate(l.taux)}</td>
                  <td className={`py-2 text-right tabular-nums font-medium ${l.montant < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{fmtMoney(l.montant)}</td>
                  <td className="py-2 text-xs">{l.facture_numero} <Badge def={STATUTS_FACTURE} value={l.facture_statut} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function addMonthsStr(s, n) {
  const [y, m, d] = s.split('-').map(Number)
  const t = new Date(y, m - 1 + n, 1)
  const last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate()
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`
}
