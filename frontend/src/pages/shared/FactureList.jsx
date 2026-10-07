// Factures mensuelles de commissions : toutes pour l'administrateur, « Mes commissions » pour un agent
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Receipt } from 'lucide-react'
import { api } from '../../api'
import { useAuth } from '../../context/AuthContext'
import { useExercice } from '../../context/ExerciceContext'
import { Spinner, PageHeader, Empty, Badge, ExportButtons } from '../../components/ui'
import { exportExcel, exportPdf } from '../../utils/export'
import { personName, fmtMoney, fmtMois, STATUTS_FACTURE } from '../../utils/format'

const COLUMNS = [
  { label: 'Facture', value: 'numero' },
  { label: 'Mois', value: f => fmtMois(f.mois) },
  { label: 'Agent', value: f => personName(f, 'agent_') },
  { label: 'Statut', value: f => STATUTS_FACTURE[f.statut]?.label },
  { label: 'Total', value: 'total', type: 'money' },
  { label: 'Payé', value: 'total_paye', type: 'money' },
  { label: 'Reste', value: 'reste', type: 'money' },
]

export default function FactureList() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { annee } = useExercice()
  const isAdmin = user.role === 'admin'
  const [rows, setRows] = useState(null)
  const [resume, setResume] = useState(null)
  const [agents, setAgents] = useState([])
  const [filters, setFilters] = useState({ agent_id: '', statut: '' })

  useEffect(() => { if (isAdmin) api.get('/agents', { params: { inclure_supprimes: 1 } }).then(r => setAgents(r.data)).catch(() => {}) }, [])
  useEffect(() => {
    const params = { ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)), annee }
    api.get('/factures', { params }).then(r => setRows(r.data))
    api.get('/factures/resume', { params: { annee } }).then(r => setResume(r.data))
  }, [filters, annee])

  const list = rows || []
  const path = id => `${isAdmin ? '/admin/factures' : '/agent/commissions'}/${id}`
  const title = isAdmin ? 'Factures de commissions' : 'Mes commissions'

  return (
    <div>
      <PageHeader title={title} subtitle={`Exercice ${annee} · une facture par agent et par mois`}>
        <ExportButtons disabled={!list.length}
          onExcel={() => exportExcel({ filename: 'factures_commissions', columns: COLUMNS, rows: list })}
          onPdf={() => exportPdf({ filename: 'factures_commissions', title, subtitle: `Exercice ${annee}`, columns: COLUMNS, rows: list })} />
      </PageHeader>

      {resume && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
          {[
            ['Total des factures', resume.total, 'text-gray-900'],
            ['Déjà payé', resume.paye, 'text-emerald-700'],
            ['Reste à payer (validées)', resume.reste_valide, 'text-amber-700'],
            ['En brouillon', resume.brouillon, 'text-gray-500'],
          ].map(([l, v, cls]) => (
            <div key={l} className="card py-4"><p className="text-xs text-gray-500">{l}</p><p className={`text-lg font-bold ${cls}`}>{fmtMoney(v)}</p></div>
          ))}
        </div>
      )}

      {isAdmin && (
        <div className="card mb-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <select className="input" value={filters.agent_id} onChange={e => setFilters(f => ({ ...f, agent_id: e.target.value }))}>
            <option value="">Tous les agents</option>
            {agents.map(a => <option key={a.id} value={a.id}>{personName(a)}{a.statut === 'supprime' ? ' (supprimé)' : ''}</option>)}
          </select>
          <select className="input" value={filters.statut} onChange={e => setFilters(f => ({ ...f, statut: e.target.value }))}>
            <option value="">Tous les statuts</option>
            {Object.entries(STATUTS_FACTURE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
      )}

      {!rows ? <Spinner /> : list.length === 0 ? <Empty icon={Receipt} text={`Aucune facture pour ${annee}`} /> : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-100 text-left text-xs text-gray-500 uppercase tracking-wide">
              <th className="pb-3 font-medium">Mois</th><th className="pb-3 font-medium">Facture</th>
              {isAdmin && <th className="pb-3 font-medium">Agent</th>}
              <th className="pb-3 font-medium text-right">Total</th><th className="pb-3 font-medium text-right">Payé</th>
              <th className="pb-3 font-medium text-right">Reste</th><th className="pb-3 font-medium text-center">Statut</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {list.map(f => (
                <tr key={f.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => navigate(path(f.id))}>
                  <td className="py-3 font-medium capitalize">{fmtMois(f.mois)}</td>
                  <td className="py-3 font-mono text-xs text-blue-700">{f.numero}<span className="block text-gray-400 font-sans">{f.nb_lignes} ligne(s)</span></td>
                  {isAdmin && <td className="py-3">{personName(f, 'agent_')}{f.agent_statut === 'supprime' && <span className="text-xs text-gray-400"> (supprimé)</span>}</td>}
                  <td className={`py-3 text-right tabular-nums font-medium ${f.total < 0 ? 'text-red-600' : ''}`}>{fmtMoney(f.total)}</td>
                  <td className="py-3 text-right tabular-nums text-emerald-700">{fmtMoney(f.total_paye)}</td>
                  <td className="py-3 text-right tabular-nums text-amber-700">{fmtMoney(f.reste)}</td>
                  <td className="py-3 text-center"><Badge def={STATUTS_FACTURE} value={f.statut} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
