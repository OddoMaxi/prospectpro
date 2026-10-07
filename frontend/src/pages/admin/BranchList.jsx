import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Plus, Edit, Trash2, Layers } from 'lucide-react'
import { api } from '../../api'
import { Spinner, Modal, Field, PageHeader, Empty, RateInput, errMsg } from '../../components/ui'
import { fmtRate } from '../../utils/format'

function BranchModal({ branche, onClose, onSaved }) {
  const [form, setForm] = useState({ nom: branche?.nom || '', description: branche?.description || '', taux_taxe: branche?.taux_taxe ?? '' })
  const [saving, setSaving] = useState(false)
  const submit = async e => {
    e.preventDefault()
    setSaving(true)
    try {
      if (branche) await api.put(`/branches/${branche.id}`, form)
      else await api.post('/branches', form)
      toast.success(branche ? 'Branche mise à jour' : 'Branche créée')
      onSaved()
    } catch (err) { toast.error(errMsg(err)) } finally { setSaving(false) }
  }
  return (
    <Modal title={branche ? 'Modifier la branche' : 'Nouvelle branche'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Nom" required>
          <input className="input" value={form.nom} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))} placeholder="Vie, Santé, Automobile…" required />
        </Field>
        <Field label="Taux de taxe de la branche" required hint="Appliqué aux produits de la branche qui n'ont pas leur propre taux.">
          <RateInput value={form.taux_taxe} onChange={v => setForm(f => ({ ...f, taux_taxe: v }))} required />
        </Field>
        <Field label="Description">
          <textarea className="input" rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
        </Field>
        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose} className="btn btn-secondary flex-1 justify-center">Annuler</button>
          <button disabled={saving} className="btn btn-primary flex-1 justify-center">{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
        </div>
      </form>
    </Modal>
  )
}

export default function BranchList() {
  const [rows, setRows] = useState(null)
  const [edit, setEdit] = useState(undefined)
  const load = () => api.get('/branches').then(r => setRows(r.data))
  useEffect(() => { load() }, [])

  const remove = async b => {
    if (!confirm(`Supprimer la branche « ${b.nom} » ?`)) return
    try { await api.delete(`/branches/${b.id}`); toast.success('Branche supprimée'); load() } catch (err) { toast.error(errMsg(err)) }
  }

  return (
    <div>
      {edit !== undefined && <BranchModal branche={edit} onClose={() => setEdit(undefined)} onSaved={() => { setEdit(undefined); load() }} />}
      <PageHeader title="Branches d'assurance" subtitle="Les produits sont créés dans une branche ; les rapports peuvent être filtrés par branche.">
        <button onClick={() => setEdit(null)} className="btn btn-primary"><Plus size={16} />Nouvelle branche</button>
      </PageHeader>
      {!rows ? <Spinner /> : rows.length === 0 ? (
        <Empty icon={Layers} text="Aucune branche. Commencez par créer une branche, puis ses produits." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs text-gray-500 uppercase tracking-wide">
                <th className="pb-3 font-medium">Branche</th>
                <th className="pb-3 font-medium text-right">Taux de taxe</th>
                <th className="pb-3 font-medium text-right">Produits</th>
                <th className="pb-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map(b => (
                <tr key={b.id} className="hover:bg-gray-50">
                  <td className="py-3">
                    <p className="font-medium text-gray-900">{b.nom}</p>
                    {b.description && <p className="text-xs text-gray-400">{b.description}</p>}
                  </td>
                  <td className="py-3 text-right">{fmtRate(b.taux_taxe)}</td>
                  <td className="py-3 text-right">{b.nb_produits}</td>
                  <td className="py-3 text-right">
                    <div className="flex justify-end gap-1.5">
                      <button onClick={() => setEdit(b)} className="btn btn-secondary btn-sm" title="Modifier"><Edit size={13} /></button>
                      <button onClick={() => remove(b)} className="btn btn-danger btn-sm" title="Supprimer"><Trash2 size={13} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
