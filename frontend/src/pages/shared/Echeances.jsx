import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarClock, MessageCircle } from 'lucide-react'
import { api } from '../../api'
import { useAuth, useBase } from '../../context/AuthContext'
import RelanceModal from '../../components/RelanceModal'
import { Spinner, PageHeader, Empty, ExportButtons } from '../../components/ui'
import { exportExcel, exportPdf } from '../../utils/export'
import { personName, fmtMoney, fmtDate, fmtTel } from '../../utils/format'

const TRANCHES = [
  { key: 'echu', label: 'Échus non renouvelés', test: j => j < 0, cls: 'bg-red-100 text-red-700' },
  { key: 'j30', label: 'J-30', test: j => j >= 0 && j <= 30, cls: 'bg-red-50 text-red-700' },
  { key: 'j45', label: 'J-45', test: j => j > 30 && j <= 45, cls: 'bg-amber-50 text-amber-700' },
  { key: 'j60', label: 'J-60', test: j => j > 45 && j <= 60, cls: 'bg-yellow-50 text-yellow-700' },
  { key: 'j90', label: 'J-90', test: j => j > 60 && j <= 90, cls: 'bg-blue-50 text-blue-700' },
]
const tranche = j => TRANCHES.find(t => t.test(j))

const COLUMNS = [
  { label: 'Échéance', value: 'date_echeance', type: 'date' },
  { label: 'Jours restants', value: 'jours_restants', type: 'number' },
  { label: 'Contrat', value: 'numero_contrat' },
  { label: 'Client', value: c => personName(c, 'client_') },
  { label: 'Téléphone', value: 'client_telephone' },
  { label: 'Produits', value: 'produits' },
  { label: 'Agent', value: c => personName(c, 'agent_') },
  { label: 'Prime TTC', value: 'prime_ttc', type: 'money' },
]

export default function Echeances() {
  const navigate = useNavigate()
  const base = useBase()
  const { user } = useAuth()
  const [rows, setRows] = useState(null)
  const [filtre, setFiltre] = useState('')
  const [relance, setRelance] = useState(null)
  useEffect(() => { api.get('/contrats/echeances', { params: { jours: 90 } }).then(r => setRows(r.data)) }, [])

  const list = (rows || []).filter(r => !filtre || tranche(r.jours_restants)?.key === filtre)
  const title = user.role === 'admin' ? 'Échéances à venir' : 'Mes échéances à venir'

  return (
    <div>
      {relance && <RelanceModal contratId={relance} onClose={() => setRelance(null)} />}
      <PageHeader title={title} subtitle="Contrats arrivant à échéance dans les 90 jours. Un renouvellement payé au plus tard à J-30 ouvre droit à la prime de performance.">
        <ExportButtons disabled={!list.length}
          onExcel={() => exportExcel({ filename: 'echeancier', columns: COLUMNS, rows: list })}
          onPdf={() => exportPdf({ filename: 'echeancier', title: 'Échéancier', subtitle: 'Contrats arrivant à échéance sous 90 jours', columns: COLUMNS, rows: list })} />
      </PageHeader>
      {rows && (
        <div className="flex flex-wrap gap-2 mb-5">
          <button onClick={() => setFiltre('')} className={`btn btn-sm ${!filtre ? 'btn-primary' : 'btn-secondary'}`}>Tous ({rows.length})</button>
          {TRANCHES.map(t => {
            const n = rows.filter(r => t.test(r.jours_restants)).length
            return <button key={t.key} onClick={() => setFiltre(t.key)} className={`btn btn-sm ${filtre === t.key ? 'btn-primary' : 'btn-secondary'}`}>{t.label} ({n})</button>
          })}
        </div>
      )}
      {!rows ? <Spinner /> : list.length === 0 ? <Empty icon={CalendarClock} text="Aucune échéance sur cette période" /> : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-100 text-left text-xs text-gray-500 uppercase tracking-wide">
              <th className="pb-3 font-medium">Échéance</th><th className="pb-3 font-medium">Contrat</th><th className="pb-3 font-medium">Client</th>
              <th className="pb-3 font-medium hidden md:table-cell">Produits</th><th className="pb-3 font-medium hidden lg:table-cell">Agent</th>
              <th className="pb-3 font-medium text-right">Prime TTC</th><th className="pb-3 font-medium text-right">Actions</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {list.map(c => {
                const t = tranche(c.jours_restants)
                return (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="py-3">
                      <p className="font-medium">{fmtDate(c.date_echeance)}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${t?.cls}`}>{c.jours_restants < 0 ? `échu depuis ${-c.jours_restants} j` : `J-${c.jours_restants}`}</span>
                    </td>
                    <td className="py-3"><button onClick={() => navigate(`${base}/contrats/${c.id}`)} className="font-medium text-blue-700 hover:underline">{c.numero_contrat}</button>
                      {c.renouvellement_en_attente && <span className="block text-xs text-amber-600">Renouvellement à solder</span>}</td>
                    <td className="py-3">{personName(c, 'client_')}<span className="block text-xs text-gray-400">{fmtTel(c.client_telephone)}</span></td>
                    <td className="py-3 text-gray-600 hidden md:table-cell">{c.produits}</td>
                    <td className="py-3 text-xs text-gray-600 hidden lg:table-cell">{personName(c, 'agent_')}</td>
                    <td className="py-3 text-right tabular-nums">{fmtMoney(c.prime_ttc)}</td>
                    <td className="py-3 text-right"><button onClick={() => setRelance(c.id)} className="btn btn-secondary btn-sm" title="Relancer le client"><MessageCircle size={13} /></button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
