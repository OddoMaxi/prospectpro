// Validation, correction et fusion des valeurs Profession / Secteur saisies par les agents
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Check, Edit, GitMerge } from 'lucide-react'
import { api } from '../../api'
import { Spinner, PageHeader, Modal, Field, errMsg } from '../../components/ui'
import { fmtDate } from '../../utils/format'

const TYPES = { profession: 'Professions', secteur: "Secteurs d'activité" }

export default function Referentiels() {
  const [type, setType] = useState('profession')
  const [rows, setRows] = useState(null)
  const [filtre, setFiltre] = useState('a_valider')
  const [modal, setModal] = useState(null)
  const [valeur, setValeur] = useState('')
  const [cible, setCible] = useState('')

  const load = () => api.get(`/referentiels/${type}`).then(r => setRows(r.data))
  useEffect(() => { setRows(null); load() }, [type])

  const act = async (r, body) => {
    try { const res = await api.post(`/referentiels/${type}/${r.id}`, body); toast.success(`${res.data.message}${res.data.fiches ? ` · ${res.data.fiches} fiche(s) mise(s) à jour` : ''}`); setModal(null); load() } catch (err) { toast.error(errMsg(err)) }
  }

  const list = (rows || []).filter(r => !filtre || r.statut === filtre)
  const nbAValider = (rows || []).filter(r => r.statut === 'a_valider').length
  const valides = (rows || []).filter(r => r.statut === 'valide')

  return (
    <div>
      {modal?.kind === 'corriger' && (
        <Modal title="Corriger et valider" subtitle={`Valeur saisie : ${modal.r.valeur}`} onClose={() => setModal(null)}>
          <form onSubmit={e => { e.preventDefault(); act(modal.r, { action: 'corriger', valeur }) }} className="space-y-4">
            <Field label="Libellé normalisé" hint="Les fiches qui utilisent l'ancienne valeur sont mises à jour."><input className="input" value={valeur} onChange={e => setValeur(e.target.value)} required /></Field>
            <button className="btn btn-primary w-full justify-center">Valider</button>
          </form>
        </Modal>
      )}
      {modal?.kind === 'fusionner' && (
        <Modal title="Fusionner dans une valeur existante" subtitle={`« ${modal.r.valeur} » sera remplacée partout`} onClose={() => setModal(null)}>
          <form onSubmit={e => { e.preventDefault(); act(modal.r, { action: 'fusionner', cible_id: cible }) }} className="space-y-4">
            <Field label="Valeur cible"><select className="input" value={cible} onChange={e => setCible(e.target.value)} required>
              <option value="">Choisir…</option>
              {valides.map(v => <option key={v.id} value={v.id}>{v.valeur}</option>)}
            </select></Field>
            <button className="btn btn-primary w-full justify-center">Fusionner</button>
          </form>
        </Modal>
      )}

      <PageHeader title="Référentiels Profession et Secteur" subtitle="Les valeurs nouvelles saisies par les agents arrivent ici « à valider ».">
        {Object.entries(TYPES).map(([k, l]) => <button key={k} onClick={() => setType(k)} className={`btn btn-sm ${type === k ? 'btn-primary' : 'btn-secondary'}`}>{l}</button>)}
      </PageHeader>
      <div className="flex gap-2 mb-4">
        <button onClick={() => setFiltre('a_valider')} className={`btn btn-sm ${filtre === 'a_valider' ? 'btn-primary' : 'btn-secondary'}`}>À valider ({nbAValider})</button>
        <button onClick={() => setFiltre('valide')} className={`btn btn-sm ${filtre === 'valide' ? 'btn-primary' : 'btn-secondary'}`}>Validées ({valides.length})</button>
        <button onClick={() => setFiltre('')} className={`btn btn-sm ${!filtre ? 'btn-primary' : 'btn-secondary'}`}>Toutes</button>
      </div>
      {!rows ? <Spinner /> : (
        <div className="card overflow-x-auto">
          {list.length === 0 ? <p className="text-sm text-gray-400 text-center py-8">Aucune valeur</p> : (
            <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-100 text-left text-xs text-gray-500 uppercase">
                <th className="pb-2 font-medium">Valeur</th><th className="pb-2 font-medium text-right">Fiches</th>
                <th className="pb-2 font-medium hidden md:table-cell">Ajoutée par</th><th className="pb-2 font-medium text-right">Actions</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-50">
                {list.map(r => (
                  <tr key={r.id}>
                    <td className="py-2.5 font-medium">{r.valeur}{r.statut === 'a_valider' && <span className="ml-2 text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">à valider</span>}</td>
                    <td className="py-2.5 text-right">{r.nb_fiches}</td>
                    <td className="py-2.5 text-xs text-gray-500 hidden md:table-cell">{r.created_by_nom ? `${r.created_by_prenom} ${r.created_by_nom} · ${fmtDate(r.created_at)}` : 'Liste initiale'}</td>
                    <td className="py-2.5 text-right">
                      <div className="flex justify-end gap-1.5">
                        {r.statut === 'a_valider' && <button onClick={() => act(r, { action: 'valider' })} className="btn btn-success btn-sm" title="Valider tel quel"><Check size={13} /></button>}
                        <button onClick={() => { setValeur(r.valeur); setModal({ kind: 'corriger', r }) }} className="btn btn-secondary btn-sm" title="Corriger le libellé"><Edit size={13} /></button>
                        <button onClick={() => { setCible(''); setModal({ kind: 'fusionner', r }) }} className="btn btn-secondary btn-sm" title="Fusionner"><GitMerge size={13} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
