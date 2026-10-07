import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { ArrowLeft, CheckCircle, FileDown, Plus, Trash2, Wallet } from 'lucide-react'
import { api } from '../../api'
import { useAuth } from '../../context/AuthContext'
import { Spinner, Badge, Modal, Field, MoneyInput, errMsg } from '../../components/ui'
import { facturePdf, recuPdf } from '../../utils/pdfDocuments'
import {
  personName, fmtMoney, fmtDate, fmtMois, fmtRate, today, MODES_PAIEMENT, STATUTS_FACTURE, NATURES_LIGNE, ROLES_LIGNE,
} from '../../utils/format'

const MODES_FACTURE = { especes: 'Espèces', virement: 'Virement', mobile_money: 'Mobile money' }
const NATURE_CLS = { commission: 'text-gray-900', performance: 'text-emerald-700', retrocession: 'text-red-600', ajustement: 'text-purple-700' }

export default function FactureDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const isAdmin = user.role === 'admin'
  const [f, setF] = useState(null)
  const [modal, setModal] = useState(null)
  const [pay, setPay] = useState({ montant: '', date_paiement: today(), mode: 'virement', reference: '' })
  const [adj, setAdj] = useState({ montant: '', libelle: '', signe: '+' })
  const [saving, setSaving] = useState(false)

  const load = () => api.get(`/factures/${id}`).then(r => setF(r.data)).catch(() => navigate(-1))
  useEffect(() => { load() }, [id])
  if (!f) return <Spinner />

  const run = async fn => {
    setSaving(true)
    try { const r = await fn(); toast.success(r.data.message); setModal(null); load() } catch (err) { toast.error(errMsg(err)) } finally { setSaving(false) }
  }
  const recu = async p => {
    try { const r = await api.get(`/factures/paiements/${p.id}`); recuPdf(r.data) } catch (err) { toast.error(errMsg(err)) }
  }
  const valider = () => confirm(`Valider la facture de ${fmtMoney(f.total)} ? Elle ne sera plus modifiable.`) && run(() => api.post(`/factures/${f.id}/valider`))
  const st = f.sous_totaux

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      {modal === 'payer' && (
        <Modal title="Payer une tranche" subtitle={`Reste à payer : ${fmtMoney(f.reste)}`} onClose={() => setModal(null)}>
          <form onSubmit={e => { e.preventDefault(); run(() => api.post(`/factures/${f.id}/paiements`, pay)) }} className="space-y-4">
            <Field label="Montant" required hint="Un paiement qui dépasse le reste à payer est refusé."><MoneyInput value={pay.montant} onChange={v => setPay(p => ({ ...p, montant: v }))} required /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Date"><input type="date" className="input" value={pay.date_paiement} onChange={e => setPay(p => ({ ...p, date_paiement: e.target.value }))} /></Field>
              <Field label="Mode"><select className="input" value={pay.mode} onChange={e => setPay(p => ({ ...p, mode: e.target.value }))}>{Object.entries(MODES_FACTURE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
            </div>
            <Field label="Référence"><input className="input" value={pay.reference} onChange={e => setPay(p => ({ ...p, reference: e.target.value }))} placeholder="N° de virement, de transaction…" /></Field>
            <button disabled={saving || Number(pay.montant) > f.reste} className="btn btn-primary w-full justify-center">{Number(pay.montant) > f.reste ? 'Montant supérieur au reste à payer' : saving ? 'Enregistrement…' : 'Enregistrer la tranche'}</button>
          </form>
        </Modal>
      )}
      {modal === 'ajustement' && (
        <Modal title="Ajouter un ajustement" onClose={() => setModal(null)}>
          <form onSubmit={e => { e.preventDefault(); run(() => api.post(`/factures/${f.id}/ajustements`, { libelle: adj.libelle, montant: adj.signe === '-' ? -Number(adj.montant) : Number(adj.montant) })) }} className="space-y-4">
            <div className="flex gap-2">
              {[['+', 'Ajout'], ['-', 'Déduction']].map(([v, l]) => <button key={v} type="button" onClick={() => setAdj(a => ({ ...a, signe: v }))} className={`btn btn-sm ${adj.signe === v ? 'btn-primary' : 'btn-secondary'}`}>{l}</button>)}
            </div>
            <Field label="Montant" required><MoneyInput value={adj.montant} onChange={v => setAdj(a => ({ ...a, montant: v }))} required /></Field>
            <Field label="Libellé" required><input className="input" value={adj.libelle} onChange={e => setAdj(a => ({ ...a, libelle: e.target.value }))} required /></Field>
            <button disabled={saving} className="btn btn-primary w-full justify-center">Ajouter</button>
          </form>
        </Modal>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => navigate(-1)} className="btn btn-secondary btn-sm"><ArrowLeft size={15} />Retour</button>
        <div className="flex-1 min-w-[200px]">
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-3">Facture {f.numero} <Badge def={STATUTS_FACTURE} value={f.statut} /></h1>
          <p className="text-sm text-gray-500 capitalize">{fmtMois(f.mois)} · {personName(f, 'agent_')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => facturePdf(f)} className="btn btn-secondary"><FileDown size={15} />PDF</button>
          {isAdmin && f.statut === 'brouillon' && <button onClick={() => setModal('ajustement')} className="btn btn-secondary"><Plus size={15} />Ajustement</button>}
          {isAdmin && f.statut === 'brouillon' && <button onClick={valider} disabled={saving} className="btn btn-primary"><CheckCircle size={15} />Valider</button>}
          {isAdmin && ['validee', 'partiel'].includes(f.statut) && f.reste > 0 && (
            <button onClick={() => { setPay(p => ({ ...p, montant: f.reste })); setModal('payer') }} className="btn btn-success"><Wallet size={15} />Payer une tranche</button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {[
          ['Commissions', st.commission], ['Primes de performance', st.performance], ['Rétrocessions', st.retrocession], ['Ajustements', st.ajustement],
          ['Total', f.total], ['Payé', f.total_paye], ['Reste à payer', f.reste],
        ].map(([l, v], i) => (
          <div key={l} className={`card py-3 px-4 ${i === 6 ? 'bg-amber-50 border-amber-100' : ''}`}><p className="text-xs text-gray-500">{l}</p><p className={`font-bold tabular-nums ${v < 0 ? 'text-red-600' : ''}`}>{fmtMoney(v)}</p></div>
        ))}
      </div>
      {f.statut === 'brouillon' && <p className="text-xs text-gray-500">Facture en brouillon : elle se complète automatiquement au fil du mois. L'administrateur la valide avant paiement.</p>}

      <div className="card overflow-x-auto">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Détail</h2>
        <table className="w-full text-sm">
          <thead><tr className="border-b border-gray-100 text-left text-xs text-gray-500 uppercase">
            <th className="pb-2 font-medium">Date</th><th className="pb-2 font-medium">Contrat</th><th className="pb-2 font-medium hidden md:table-cell">Client</th>
            <th className="pb-2 font-medium">Type</th><th className="pb-2 font-medium">Nature</th><th className="pb-2 font-medium hidden md:table-cell">Part</th>
            <th className="pb-2 font-medium text-right">Prime de base</th><th className="pb-2 font-medium text-right">Taux</th><th className="pb-2 font-medium text-right">Montant</th><th />
          </tr></thead>
          <tbody className="divide-y divide-gray-50">
            {f.lignes.map(l => (
              <tr key={l.id}>
                <td className="py-2 text-xs">{fmtDate(l.date_acquisition)}</td>
                <td className="py-2">{l.numero_contrat || '—'}</td>
                <td className="py-2 hidden md:table-cell">{l.client_nom ? personName(l, 'client_') : <span className="text-gray-500 text-xs">{l.libelle}</span>}</td>
                <td className="py-2 text-xs">{l.operation === 'souscription' ? 'Souscription' : l.operation === 'renouvellement' ? 'Renouvellement' : '—'}</td>
                <td className={`py-2 text-xs font-medium ${NATURE_CLS[l.nature]}`}>{NATURES_LIGNE[l.nature]}</td>
                <td className="py-2 text-xs hidden md:table-cell">{ROLES_LIGNE[l.role] || '—'}{l.role === 'senior' && <span className="block text-gray-400">vente de {personName(l, 'source_')}</span>}</td>
                <td className="py-2 text-right tabular-nums">{l.base ? fmtMoney(l.base) : '—'}</td>
                <td className="py-2 text-right">{l.taux ? fmtRate(l.taux) : '—'}</td>
                <td className={`py-2 text-right tabular-nums font-medium ${l.montant < 0 ? 'text-red-600' : ''}`}>{fmtMoney(l.montant)}</td>
                <td className="py-2 text-right">
                  {isAdmin && f.statut === 'brouillon' && l.nature === 'ajustement' && (
                    <button onClick={() => run(() => api.delete(`/factures/${f.id}/ajustements/${l.id}`))} className="text-red-400 hover:text-red-600"><Trash2 size={13} /></button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card overflow-x-auto">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Paiements (tranches)</h2>
        {f.paiements.length === 0 ? <p className="text-sm text-gray-400">Aucun paiement</p> : (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-100 text-left text-xs text-gray-500 uppercase">
              <th className="pb-2 font-medium">Reçu</th><th className="pb-2 font-medium">Date</th><th className="pb-2 font-medium">Mode</th>
              <th className="pb-2 font-medium">Référence</th><th className="pb-2 font-medium hidden md:table-cell">Enregistré par</th>
              <th className="pb-2 font-medium text-right">Montant</th><th />
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {f.paiements.map(p => (
                <tr key={p.id}>
                  <td className="py-2 font-mono text-xs">{p.numero_recu}</td>
                  <td className="py-2">{fmtDate(p.date_paiement)}</td>
                  <td className="py-2">{MODES_PAIEMENT[p.mode] || p.mode}</td>
                  <td className="py-2 text-gray-600">{p.reference || '—'}</td>
                  <td className="py-2 text-xs hidden md:table-cell">{`${p.created_by_prenom || ''} ${p.created_by_nom || ''}`.trim()}</td>
                  <td className="py-2 text-right tabular-nums font-medium text-emerald-700">{fmtMoney(p.montant)}</td>
                  <td className="py-2 text-right"><button onClick={() => recu(p)} className="btn btn-secondary btn-sm"><FileDown size={13} />Reçu</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
