import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../api'
import toast from 'react-hot-toast'
import { Plus, Edit, Trash2, Package, ToggleLeft, ToggleRight, AlertTriangle } from 'lucide-react'
import Pagination from '../../components/Pagination'

const PAGE_SIZE = 10

const fmt = n => new Intl.NumberFormat('fr-FR').format(Math.round(n || 0))
const fmtCur = n => fmt(n)

function DeleteModal({ product, onConfirm, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center shrink-0">
            <AlertTriangle size={20} className="text-red-600" />
          </div>
          <div>
            <h3 className="font-bold text-gray-900">Supprimer « {product.nom} »</h3>
            <p className="text-sm text-gray-500 mt-1">
              Les prospects liés à ce produit seront conservés mais le lien sera supprimé.
            </p>
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="btn btn-secondary flex-1 justify-center">Annuler</button>
          <button onClick={() => onConfirm(product.id)} className="btn btn-danger flex-1 justify-center">
            <Trash2 size={15} />Supprimer
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ProductList() {
  const navigate = useNavigate()
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [page, setPage] = useState(1)

  const load = () => {
    setLoading(true)
    api.get('/products').then(r => setProducts(r.data)).finally(() => setLoading(false))
  }
  useEffect(load, [])

  const handleDelete = async id => {
    try {
      await api.delete(`/products/${id}`)
      toast.success('Produit supprimé')
      setDeleteTarget(null)
      load()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erreur lors de la suppression')
    }
  }

  const handleToggle = async product => {
    try {
      await api.put(`/products/${product.id}`, { ...product, is_active: !product.is_active })
      toast.success(product.is_active ? 'Produit désactivé' : 'Produit activé')
      load()
    } catch {
      toast.error('Erreur lors de la mise à jour')
    }
  }

  return (
    <div>
      {deleteTarget && <DeleteModal product={deleteTarget} onConfirm={handleDelete} onClose={() => setDeleteTarget(null)} />}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Produits d'assurance</h1>
          <p className="text-gray-500 text-sm mt-0.5">{products.length} produit(s) enregistré(s)</p>
        </div>
        <button onClick={() => navigate('/admin/products/create')} className="btn btn-primary">
          <Plus size={16} />Nouveau produit
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : products.length === 0 ? (
        <div className="card text-center py-14">
          <Package size={40} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">Aucun produit d'assurance créé</p>
          <button onClick={() => navigate('/admin/products/create')} className="btn btn-primary mt-4">
            <Plus size={16} />Créer le premier produit
          </button>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-gray-500 text-xs uppercase tracking-wide">
                <th className="pb-3 font-medium">Produit</th>
                <th className="pb-3 font-medium">Description</th>
                <th className="pb-3 font-medium text-right">Prime annuelle</th>
                <th className="pb-3 font-medium text-right">Taux agent</th>
                <th className="pb-3 font-medium text-right">Taux Ag. Juniore</th>
                <th className="pb-3 font-medium text-center">Statut</th>
                <th className="pb-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {products.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(p => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="py-3 font-semibold text-gray-900">{p.nom}</td>
                  <td className="py-3 text-gray-500 max-w-xs truncate">{p.description || '—'}</td>
                  <td className="py-3 text-right font-medium text-blue-700">{fmtCur(p.prime_annuelle)}</td>
                  <td className="py-3 text-right">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                      {p.taux_commission}%
                    </span>
                  </td>
                  <td className="py-3 text-right">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                      {p.taux_commission_sous_agent ?? 0}%
                    </span>
                  </td>
                  <td className="py-3 text-center">
                    <button
                      onClick={() => handleToggle(p)}
                      className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full transition-colors ${
                        p.is_active ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      }`}
                    >
                      {p.is_active ? <ToggleRight size={13} /> : <ToggleLeft size={13} />}
                      {p.is_active ? 'Actif' : 'Inactif'}
                    </button>
                  </td>
                  <td className="py-3 text-right">
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        onClick={() => navigate(`/admin/products/${p.id}/edit`)}
                        className="btn btn-secondary btn-sm"
                        title="Modifier"
                      >
                        <Edit size={13} />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(p)}
                        className="btn btn-danger btn-sm"
                        title="Supprimer"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={page} totalPages={Math.ceil(products.length / PAGE_SIZE)} total={products.length} onPageChange={setPage} />
        </div>
      )}
    </div>
  )
}
