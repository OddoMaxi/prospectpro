import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../../api'
import toast from 'react-hot-toast'
import { Plus, Search, Filter, Edit, Trash2, Eye, ChevronDown, X } from 'lucide-react'

const STATUTS = { prospect: 'Prospect', en_cours: 'En cours', client: 'Client', perdu: 'Perdu' }
const TYPES   = { physique: 'Particulier', morale: 'Entreprise' }
const fmt = n => new Intl.NumberFormat('fr-FR').format(Math.round(n || 0))
const fmtDate = d => d ? new Date(d).toLocaleDateString('fr-FR') : '-'

function ProspectCard({ p, onEdit, onDelete, onView }) {
  const comm = p.montant_potentiel * p.taux_commission / 100
  return (
    <div className="card hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-gray-900 truncate">{p.nom}{p.prenom ? ` ${p.prenom}` : ''}</h3>
            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${p.type === 'physique' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'}`}>
              {TYPES[p.type]}
            </span>
          </div>
          {p.nom_contact && <p className="text-xs text-gray-400 mt-0.5">Contact : {p.prenom_contact} {p.nom_contact}</p>}
        </div>
        <span className={`badge-${p.statut} shrink-0 ml-2`}>{STATUTS[p.statut]}</span>
      </div>

      <div className="space-y-1 text-xs text-gray-500 mb-3">
        {p.telephone && <p>📞 {p.telephone}</p>}
        {p.email    && <p>✉ {p.email}</p>}
        {p.ville    && <p>📍 {p.ville}{p.secteur_activite ? ` · ${p.secteur_activite}` : ''}</p>}
        <p>📅 {fmtDate(p.date_prospection)}</p>
      </div>

      <div className="flex items-center justify-between mb-3 pt-2 border-t border-gray-50">
        <div>
          <p className="text-xs text-gray-400">Montant potentiel</p>
          <p className="text-sm font-bold text-gray-800">{fmt(p.montant_potentiel)} FCFA</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-400">Commission prév.</p>
          <p className="text-sm font-bold text-blue-600">{fmt(comm)} FCFA</p>
        </div>
      </div>

      <div className="flex gap-2">
        <button onClick={() => onView(p)} className="btn btn-secondary btn-sm flex-1 justify-center"><Eye size={13} />Voir</button>
        <button onClick={() => onEdit(p.id)} className="btn btn-secondary btn-sm flex-1 justify-center"><Edit size={13} />Modifier</button>
        <button onClick={() => onDelete(p.id)} className="btn btn-danger btn-sm" title="Supprimer"><Trash2 size={13} /></button>
      </div>
    </div>
  )
}

function ProspectModal({ prospect, onClose }) {
  const comm = (prospect.montant_potentiel * prospect.taux_commission / 100)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg my-4">
        <div className="p-5 border-b border-gray-100 flex items-start justify-between">
          <div>
            <h3 className="font-bold text-gray-900 text-lg">{prospect.nom}{prospect.prenom ? ` ${prospect.prenom}` : ''}</h3>
            <div className="flex items-center gap-2 mt-1">
              <span className={`badge-${prospect.statut}`}>{STATUTS[prospect.statut]}</span>
              <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${prospect.type === 'physique' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'}`}>
                {TYPES[prospect.type]}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-400">
            <X size={18} />
          </button>
        </div>
        <div className="p-5 text-sm space-y-4">
          {prospect.type === 'morale' && (
            <div>
              <p className="text-xs text-gray-400 mb-1">Contact principal</p>
              <p className="font-medium">{prospect.prenom_contact || ''} {prospect.nom_contact || '-'}</p>
              {prospect.siret && <p className="text-xs text-gray-500 mt-0.5">SIRET : {prospect.siret}</p>}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            {[
              ['Téléphone', prospect.telephone],
              ['Email', prospect.email],
              ['Ville', prospect.ville],
              ['Code postal', prospect.code_postal],
              ['Secteur', prospect.secteur_activite],
              ['Date prospection', fmtDate(prospect.date_prospection)],
              ['Montant potentiel', `${fmt(prospect.montant_potentiel)} FCFA`],
              ['Commission prévisionnelle', `${fmt(comm)} FCFA`],
            ].filter(([, v]) => v).map(([k, v]) => (
              <div key={k}><p className="text-xs text-gray-400">{k}</p><p className="font-medium text-gray-800">{v}</p></div>
            ))}
          </div>
          {prospect.notes && (
            <div>
              <p className="text-xs text-gray-400 mb-1">Notes</p>
              <p className="text-gray-700 bg-gray-50 rounded-lg p-3 text-sm">{prospect.notes}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function ProspectList() {
  const navigate = useNavigate()
  const [prospects, setProspects] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [showFilters, setShowFilters] = useState(false)
  const [view, setView] = useState('cards')
  const [filters, setFilters] = useState({ search: '', type: '', statut: '', date_debut: '', date_fin: '' })

  const load = () => {
    setLoading(true)
    const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v))
    api.get('/prospects', { params }).then(r => setProspects(r.data)).finally(() => setLoading(false))
  }

  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t) }, [filters])
  const setF = (k, v) => setFilters(p => ({ ...p, [k]: v }))

  const handleDelete = async id => {
    if (!confirm('Supprimer ce prospect ?')) return
    try {
      await api.delete(`/prospects/${id}`)
      toast.success('Prospect supprimé')
      load()
    } catch { toast.error('Erreur lors de la suppression') }
  }

  const totalMontant = prospects.reduce((s, p) => s + p.montant_potentiel, 0)
  const totalComm    = prospects.reduce((s, p) => s + p.montant_potentiel * p.taux_commission / 100, 0)
  const hasActiveFilters = Object.values(filters).some(Boolean)

  return (
    <div>
      {selected && <ProspectModal prospect={selected} onClose={() => setSelected(null)} />}

      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Mes prospects</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {prospects.length} résultat(s) · {fmt(totalMontant)} FCFA · Commission : {fmt(totalComm)} FCFA
          </p>
        </div>
        <Link to="/agent/prospects/create" className="btn btn-primary hidden sm:inline-flex">
          <Plus size={16} />Nouveau
        </Link>
      </div>

      <div className="card mb-5 space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className="input pl-9" placeholder="Nom, téléphone, email, ville..." value={filters.search} onChange={e => setF('search', e.target.value)} />
          </div>
          <button onClick={() => setShowFilters(v => !v)} className={`btn btn-secondary gap-2 ${hasActiveFilters ? 'ring-2 ring-blue-300' : ''}`}>
            <Filter size={15} /><span className="hidden sm:inline">Filtres</span>
            {hasActiveFilters && <span className="w-2 h-2 bg-blue-500 rounded-full" />}
            <ChevronDown size={14} className={`transition-transform ${showFilters ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {showFilters && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-3 border-t border-gray-100">
            <div>
              <label className="label">Type</label>
              <select className="input" value={filters.type} onChange={e => setF('type', e.target.value)}>
                <option value="">Tous</option>
                <option value="physique">Particulier</option>
                <option value="morale">Entreprise</option>
              </select>
            </div>
            <div>
              <label className="label">Statut</label>
              <select className="input" value={filters.statut} onChange={e => setF('statut', e.target.value)}>
                <option value="">Tous</option>
                {Object.entries(STATUTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Du</label>
              <input className="input" type="date" value={filters.date_debut} onChange={e => setF('date_debut', e.target.value)} />
            </div>
            <div>
              <label className="label">Au</label>
              <input className="input" type="date" value={filters.date_fin} onChange={e => setF('date_fin', e.target.value)} />
            </div>
            {hasActiveFilters && (
              <button onClick={() => setFilters({ search:'', type:'', statut:'', date_debut:'', date_fin:'' })}
                className="col-span-2 md:col-span-4 btn btn-secondary btn-sm justify-center">
                <X size={13} />Effacer les filtres
              </button>
            )}
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : prospects.length === 0 ? (
        <div className="card text-center py-14">
          <Search size={40} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">{hasActiveFilters ? 'Aucun résultat pour ces filtres' : 'Aucun prospect enregistré'}</p>
          {!hasActiveFilters && (
            <Link to="/agent/prospects/create" className="btn btn-primary mt-4 inline-flex">
              <Plus size={16} />Créer le premier prospect
            </Link>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {prospects.map(p => (
            <ProspectCard key={p.id} p={p}
              onEdit={pid => navigate(`/agent/prospects/${pid}/edit`)}
              onDelete={handleDelete}
              onView={setSelected} />
          ))}
        </div>
      )}
    </div>
  )
}
