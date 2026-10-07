import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Plus, History } from 'lucide-react'
import { api } from '../../api'
import { useBase } from '../../context/AuthContext'
import ContratForm from '../../components/ContratForm'
import { Spinner, Badge } from '../../components/ui'
import { personName, fmtMoney, fmtDate, fmtDateTime, fmtTel, STATUTS_CONTRAT } from '../../utils/format'

const MOTIFS = { creation: 'Création', inactivite: 'Inactivité', suppression: "Suppression de l'agent", manuel: 'Réaffectation manuelle', restitution: 'Restitution' }

export default function ClientDetail() {
  const { id } = useParams()
  const base = useBase()
  const navigate = useNavigate()
  const [c, setC] = useState(null)
  const [newContrat, setNewContrat] = useState(false)
  const load = () => api.get(`/clients/${id}`).then(r => setC(r.data)).catch(() => navigate(`${base}/clients`))
  useEffect(() => { load() }, [id])
  if (!c) return <Spinner />

  const infos = [
    ['Téléphone', fmtTel(c.telephone)], ['Email', c.email || '—'],
    c.type === 'physique' ? ['Profession', c.profession || '—'] : ['Secteur', c.secteur_activite || '—'],
    c.type === 'physique' ? ['Date de naissance', fmtDate(c.date_naissance)] : ['Contact', `${c.prenom_contact || ''} ${c.nom_contact || ''}`.trim() || '—'],
    ['Localisation', [c.lieu_residence_quartier || c.siege_social_quartier, c.lieu_residence_commune || c.siege_social_commune].filter(Boolean).join(', ') || '—'],
    ['Agent en charge', personName(c, 'agent_')], ['Client depuis', fmtDate(c.converted_at)],
  ]

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      {newContrat && <ContratForm client={c} onClose={() => setNewContrat(false)} onDone={() => { setNewContrat(false); load() }} />}
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => navigate(-1)} className="btn btn-secondary btn-sm"><ArrowLeft size={15} />Retour</button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900">{personName(c)}</h1>
          <p className="text-sm text-gray-500">Client #{c.numero} · {c.type === 'physique' ? 'Particulier' : 'Entreprise'}</p>
        </div>
        <button onClick={() => setNewContrat(true)} className="btn btn-primary"><Plus size={16} />Nouveau contrat</button>
      </div>

      <div className="card grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        {infos.map(([l, v]) => <div key={l}><p className="text-xs text-gray-500">{l}</p><p className="font-medium text-gray-900">{v}</p></div>)}
      </div>

      <div className="card overflow-x-auto">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Contrats</h2>
        {c.contrats.length === 0 ? <p className="text-sm text-gray-400">Aucun contrat</p> : (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-100 text-left text-xs text-gray-500 uppercase">
              <th className="pb-2 font-medium">Contrat</th><th className="pb-2 font-medium">Produits</th><th className="pb-2 font-medium">Effet</th>
              <th className="pb-2 font-medium">Échéance</th><th className="pb-2 font-medium text-right">Prime TTC</th><th className="pb-2 font-medium text-center">Statut</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {c.contrats.map(k => (
                <tr key={k.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`${base}/contrats/${k.id}`)}>
                  <td className="py-2.5 font-medium text-blue-700">{k.numero_contrat}</td>
                  <td className="py-2.5 text-gray-600">{k.produits}</td>
                  <td className="py-2.5">{fmtDate(k.date_effet)}</td>
                  <td className="py-2.5">{fmtDate(k.date_echeance)}</td>
                  <td className="py-2.5 text-right tabular-nums">{fmtMoney(k.prime_ttc)}</td>
                  <td className="py-2.5 text-center"><Badge def={STATUTS_CONTRAT} value={k.statut_calcule} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2"><History size={15} />Historique des affectations</h2>
        <div className="space-y-2">
          {c.affectations.map(a => (
            <div key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm bg-gray-50 rounded-lg px-3 py-2">
              <span className="font-medium">{personName(a, 'dest_')}</span>
              <span className="text-xs text-gray-500">du {fmtDateTime(a.date_debut)} {a.date_fin ? `au ${fmtDateTime(a.date_fin)}` : '— en cours'}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${a.type === 'temporaire' ? 'bg-amber-100 text-amber-700' : 'bg-gray-200 text-gray-600'}`}>{a.type === 'temporaire' ? 'Temporaire' : 'Définitif'}</span>
              <span className="text-xs text-gray-500">{MOTIFS[a.motif] || a.motif}{a.agent_origine_id ? ` · depuis ${personName(a, 'origine_')}` : ''}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
