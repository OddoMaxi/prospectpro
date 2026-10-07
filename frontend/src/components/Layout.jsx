// Structure commune des espaces administrateur et commercial
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { LogOut, X, User } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { personName } from '../utils/format'
import TopBar from './TopBar'

const APP = 'ProspectPro'

function SideNav({ sections, onClick }) {
  return (
    <nav className="flex flex-col gap-0.5 p-3 flex-1 overflow-y-auto">
      {sections.map((s, i) => (
        <div key={i} className={i ? 'mt-3' : ''}>
          {s.title && <p className="px-3 mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">{s.title}</p>}
          {s.items.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} onClick={onClick}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors
                ${isActive ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`}>
              <Icon size={17} />{label}
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
  )
}

export default function Layout({ sections, subtitle }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const handleLogout = () => { logout(); navigate('/login') }

  const footer = (
    <div className="p-4 border-t border-gray-200">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center shrink-0">
          <User size={16} className="text-blue-600" />
        </div>
        <div className="min-w-0">
          <div className="text-xs font-semibold text-gray-700 truncate">{personName(user)}</div>
          <div className="text-xs text-gray-400 truncate">@{user?.username}</div>
        </div>
      </div>
      <button onClick={handleLogout} className="btn btn-secondary w-full justify-center text-xs">
        <LogOut size={14} />Déconnexion
      </button>
    </div>
  )

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <aside className="hidden md:flex flex-col w-60 bg-white border-r border-gray-200 shrink-0">
        <div className="p-4 border-b border-gray-200">
          <h1 className="font-bold text-blue-600 text-lg">{APP}</h1>
          <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>
        </div>
        <SideNav sections={sections} />
        {footer}
      </aside>

      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-64 bg-white flex flex-col z-50 shadow-xl">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h1 className="font-bold text-blue-600 text-lg">{APP}</h1>
                <p className="text-xs text-gray-400">{subtitle}</p>
              </div>
              <button onClick={() => setOpen(false)} aria-label="Fermer"><X size={20} /></button>
            </div>
            <SideNav sections={sections} onClick={() => setOpen(false)} />
            {footer}
          </aside>
        </div>
      )}

      <div className="flex flex-col flex-1 overflow-hidden">
        <TopBar onMenu={() => setOpen(true)} title={APP} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
