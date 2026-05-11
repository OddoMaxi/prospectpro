import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { LayoutDashboard, Users, UserSearch, LogOut, Menu, X } from 'lucide-react'
import { useState } from 'react'

const nav = [
  { to: '/admin', label: 'Tableau de bord', icon: LayoutDashboard, end: true },
  { to: '/admin/agents', label: 'Agents', icon: Users },
  { to: '/admin/prospects', label: 'Tous les prospects', icon: UserSearch },
]

export default function AdminLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  const handleLogout = () => { logout(); navigate('/login') }

  const SideNav = ({ onClick }) => (
    <nav className="flex flex-col gap-1 p-3 flex-1">
      {nav.map(({ to, label, icon: Icon, end }) => (
        <NavLink key={to} to={to} end={end} onClick={onClick}
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
            ${isActive ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`
          }>
          <Icon size={18} />{label}
        </NavLink>
      ))}
    </nav>
  )

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-60 bg-white border-r border-gray-200 shrink-0">
        <div className="p-4 border-b border-gray-200">
          <h1 className="font-bold text-blue-600 text-lg">ProspectPro</h1>
          <p className="text-xs text-gray-400 mt-0.5">Administration</p>
        </div>
        <SideNav />
        <div className="p-4 border-t border-gray-200">
          <div className="text-xs text-gray-500 mb-2 font-medium truncate">{user?.prenom} {user?.nom}</div>
          <button onClick={handleLogout} className="btn btn-secondary w-full justify-center text-xs">
            <LogOut size={14} />Déconnexion
          </button>
        </div>
      </aside>

      {/* Mobile overlay */}
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-64 bg-white flex flex-col z-50 shadow-xl">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h1 className="font-bold text-blue-600 text-lg">ProspectPro</h1>
              <button onClick={() => setOpen(false)}><X size={20} /></button>
            </div>
            <SideNav onClick={() => setOpen(false)} />
            <div className="p-4 border-t border-gray-200">
              <button onClick={handleLogout} className="btn btn-secondary w-full justify-center text-xs">
                <LogOut size={14} />Déconnexion
              </button>
            </div>
          </aside>
        </div>
      )}

      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Mobile topbar */}
        <header className="md:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200">
          <button onClick={() => setOpen(true)}><Menu size={22} /></button>
          <span className="font-bold text-blue-600">ProspectPro</span>
          <span className="ml-auto text-xs text-gray-500">{user?.prenom} {user?.nom}</span>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
