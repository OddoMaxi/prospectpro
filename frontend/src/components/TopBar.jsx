// Barre supérieure commune : sélecteur d'exercice et notifications
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, CalendarDays, Menu } from 'lucide-react'
import { api } from '../api'
import { useExercice } from '../context/ExerciceContext'
import { fmtDateTime } from '../utils/format'

export function ExerciceSelector() {
  const { annee, setAnnee, annees } = useExercice()
  return (
    <label className="flex items-center gap-2 text-sm text-gray-600">
      <CalendarDays size={16} className="text-blue-600" />
      <span className="hidden sm:inline">Exercice</span>
      <select className="input py-1.5 w-24 font-semibold" value={annee} onChange={e => setAnnee(Number(e.target.value))}>
        {annees.map(a => <option key={a} value={a}>{a}</option>)}
      </select>
    </label>
  )
}

function NotificationBell() {
  const [data, setData] = useState({ items: [], non_lues: 0 })
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const navigate = useNavigate()

  const load = () => api.get('/notifications').then(r => setData(r.data)).catch(() => {})
  useEffect(() => {
    load()
    const t = setInterval(load, 120000)
    return () => clearInterval(t)
  }, [])
  useEffect(() => {
    const close = e => ref.current && !ref.current.contains(e.target) && setOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const openItem = async n => {
    if (!n.lu_le) await api.post('/notifications/lire', { id: n.id }).catch(() => {})
    setOpen(false)
    load()
    if (n.lien) navigate(n.lien)
  }
  const readAll = async () => { await api.post('/notifications/lire', {}).catch(() => {}); load() }

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(o => !o)} className="relative p-2 rounded-lg hover:bg-gray-100 text-gray-600" aria-label="Notifications">
        <Bell size={19} />
        {data.non_lues > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center">
            {data.non_lues > 99 ? '99+' : data.non_lues}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] bg-white rounded-xl shadow-xl border border-gray-100 z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <span className="font-semibold text-sm">Notifications</span>
            {data.non_lues > 0 && <button onClick={readAll} className="text-xs text-blue-600 hover:underline">Tout marquer comme lu</button>}
          </div>
          <div className="max-h-96 overflow-y-auto divide-y divide-gray-50">
            {data.items.length === 0 && <p className="text-sm text-gray-400 text-center py-8">Aucune notification</p>}
            {data.items.map(n => (
              <button key={n.id} onClick={() => openItem(n)} className={`w-full text-left px-4 py-3 hover:bg-gray-50 ${n.lu_le ? '' : 'bg-blue-50/50'}`}>
                <p className={`text-sm ${n.lu_le ? 'text-gray-700' : 'font-semibold text-gray-900'}`}>{n.titre}</p>
                {n.message && <p className="text-xs text-gray-500 mt-0.5">{n.message}</p>}
                <p className="text-[11px] text-gray-400 mt-1">{fmtDateTime(n.created_at)}</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function TopBar({ onMenu, title }) {
  return (
    <header className="flex items-center gap-3 px-4 md:px-6 py-2.5 bg-white border-b border-gray-200">
      <button className="md:hidden" onClick={onMenu} aria-label="Menu"><Menu size={22} /></button>
      <span className="md:hidden font-bold text-blue-600">{title}</span>
      <div className="ml-auto flex items-center gap-2">
        <ExerciceSelector />
        <NotificationBell />
      </div>
    </header>
  )
}
