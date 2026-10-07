import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Plus, Edit, Trash2, Package, PauseCircle, PlayCircle } from 'lucide-react'
import { api } from '../../api'
import { Spinner, PageHeader, Empty, Badge, ExportButtons, errMsg } from '../../components/ui'
import { fmtMoney, fmtRate, STATUTS_PRODUIT } from '../../utils/format'
import { exportExcel, exportPdf } from '../../utils/export'

const COLUMNS = [
  { label: 'Branche', value: 'branche_nom' },
  { label: 'Produit', value: 'nom' },
  { label: 'Prime pure', value: 'prime_pure', type: 'money' },
  { label: 'Prime commerciale', value: 'prime_commerciale', type: 'money' },
  { label: 'Prime TTC', value: 'prime_ttc', type: 'money' },
  { label: 'Comm. souscription %', value: 'taux_commission', type: 'number' },
  { label: 'Comm. renouvellement %', value: 'taux_renouvellement', type: 'number' },
  { label: 'Performance %', value: p => (p.performance_active ? p.taux_performance : null), type: 'number' },
  { label: 'Statut', value: p => STATUTS_PRODUIT[p.statut]?.label },
]

export default function ProductList() {
  const navigate = useNavigate()
  const [rows, setRows] = useState(null)
  const [branche, setBranche] = useState('')
  const load = () => api.get('/products').then(r => setRows(r.data))
  useEffect(() => { load() }, [])

  const toggle = async p => {
    const action = p.statut === 'actif' ? 'suspendre' : 'reactiver'
    if (action === 'suspendre' && !confirm(`Suspendre « ${p.nom} » ? Plus aucune souscription ne sera possible ; les contrats existants continuent.`)) return
    try { const r = await api.patch(`/products/${p.id}/statut`, { action }); toast.success(r.data.message); load() } catch (err) { toast.error(errMsg(err)) }
  }
  const remove = async p => {
    if (!confirm(`Supprimer « ${p.nom} » ? L'historique des ventes reste visible dans les statistiques.`)) return
    try { await api.delete(`/products/${p.id}`); toast.success('Produit supprimé'); load() } catch (err) { toast.error(errMsg(err)) }
  }

  const branches = rows ? [...new Map(rows.map(r => [r.branche_id, r.branche_nom || 'Sans branche'])).entries()] : []
  const shown = rows ? rows.filter(r => !branche || r.branche_id === branche) : []

  return (
    <div>
      <PageHeader title="Produits d'assurance" subtitle={rows ? `${shown.length} produit(s)` : ''}>
        <select className="input w-44" value={branche} onChange={e => setBranche(e.target.value)}>
          <option value="">Toutes les branches</option>
          {branches.map(([id, nom]) => <option key={id} value={id}>{nom}</option>)}
        </select>
        <ExportButtons disabled={!shown.length}
          onExcel={() => exportExcel({ filename: 'produits', columns: COLUMNS, rows: shown })}
          onPdf={() => exportPdf({ filename: 'produits', title: "Produits d'assurance", columns: COLUMNS, rows: shown })} />
        <Link to="/admin/products/create" className="btn btn-primary"><Plus size={16} />Nouveau produit</Link>
      </PageHeader>

      {!rows ? <Spinner /> : shown.length === 0 ? <Empty icon={Package} text="Aucun produit" /> : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs text-gray-500 uppercase tracking-wide">
                <th className="pb-3 font-medium">Produit</th>
                <th className="pb-3 font-medium text-right">Prime pure</th>
                <th className="pb-3 font-medium text-right hidden md:table-cell">Prime commerciale</th>
                <th className="pb-3 font-medium text-right">Prime TTC</th>
                <th className="pb-3 font-medium text-right hidden lg:table-cell">Commissions</th>
                <th className="pb-3 font-medium text-center hidden lg:table-cell">Performance</th>
                <th className="pb-3 font-medium text-right hidden md:table-cell">Contrats actifs</th>
                <th className="pb-3 font-medium text-center">Statut</th>
                <th className="pb-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {shown.map(p => (
                <tr key={p.id} className={`hover:bg-gray-50 ${p.statut !== 'actif' ? 'opacity-70' : ''}`}>
                  <td className="py-3">
                    <p className="font-medium text-gray-900">{p.nom}</p>
                    <p className="text-xs text-gray-400">{p.branche_nom || 'Sans branche'}</p>
                  </td>
                  <td className="py-3 text-right tabular-nums">{fmtMoney(p.prime_pure)}</td>
                  <td className="py-3 text-right tabular-nums hidden md:table-cell">{fmtMoney(p.prime_commerciale)}</td>
                  <td className="py-3 text-right tabular-nums font-medium text-blue-700">{fmtMoney(p.prime_ttc)}</td>
                  <td className="py-3 text-right text-xs hidden lg:table-cell">
                    <p>Souscr. {fmtRate(p.taux_commission)} <span className="text-gray-400">(J. {fmtRate(p.taux_commission_sous_agent)})</span></p>
                    <p>Renouv. {fmtRate(p.taux_renouvellement)} <span className="text-gray-400">(J. {fmtRate(p.taux_renouvellement_junior)})</span></p>
                  </td>
                  <td className="py-3 text-center text-xs hidden lg:table-cell">
                    {p.performance_active ? <>{fmtRate(p.taux_performance)}<span className="block text-gray-400">J-{p.delai_anticipation_mois} mois</span></> : <span className="text-gray-300">Non</span>}
                  </td>
                  <td className="py-3 text-right hidden md:table-cell">{p.nb_contrats_actifs}</td>
                  <td className="py-3 text-center"><Badge def={STATUTS_PRODUIT} value={p.statut} /></td>
                  <td className="py-3 text-right">
                    <div className="flex justify-end gap-1.5">
                      <button onClick={() => navigate(`/admin/products/${p.id}/edit`)} className="btn btn-secondary btn-sm" title="Modifier"><Edit size={13} /></button>
                      <button onClick={() => toggle(p)} className="btn btn-secondary btn-sm" title={p.statut === 'actif' ? 'Suspendre' : 'Réactiver'}>
                        {p.statut === 'actif' ? <PauseCircle size={13} /> : <PlayCircle size={13} />}
                      </button>
                      <button onClick={() => remove(p)} className="btn btn-danger btn-sm" title="Supprimer"><Trash2 size={13} /></button>
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
