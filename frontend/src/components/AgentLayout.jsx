import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { LayoutDashboard, List, PlusCircle, LogOut, Menu, X, User, Users } from 'lucide-react'
import { useState } from 'react'

export default function AgentLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  const handleLogout = () => { logout(); navigate('/login') }

  // Les sous-agents ne peuvent pas créer de sous-agents
  const isSousAgent = !!user?.parent_agent_id

  const nav = [
    { to: '/agent', label: 'Tableau de bord', icon: LayoutDashboard, end: true },
    { to: '/agent/prospects', label: 'Mes prospects', icon: List },
    { to: '/agent/prospects/create', label: 'Nouveau prospect', icon: PlusCircle },
    ...(!isSousAgent ? [{ to: '/agent/sous-agents', label: 'Mes sous-agents', icon: Users }] : []),
  ]

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
      <aside className="hidden md:flex flex-col w-60 bg-white border-r border-gray-200 shrink-0">
        <div className="p-4 border-b border-gray-200">
          <h1 className="font-bold text-blue-600 text-lg">ProspectPro</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {isSousAgent ? 'Sous-agent commercial' : 'Espace Commercial'}
          </p>
        </div>
        <SideNav />
        <div className="p-4 border-t border-gray-200">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
              <User size={16} className="text-blue-600" />
            </div>
            <div>
              <div className="text-xs font-semibold text-gray-700 truncate">{user?.prenom} {user?.nom}</div>
              <div className="text-xs text-gray-400">@{user?.username}</div>
            </div>
          </div>
          <button onClick={handleLogout} className="btn btn-secondary w-full justify-center text-xs">
            <LogOut size={14} />Déconnexion
          </button>
        </div>
      </aside>

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
        <header className="md:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200">
          <button onClick={() => setOpen(true)}><Menu size={22} /></button>
          <span className="font-bold text-blue-600">ProspectPro</span>
          <NavLink to="/agent/prospects/create" className="ml-auto btn btn-primary btn-sm">
            <PlusCircle size={14} />Nouveau
          </NavLink>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>

        {/* Mobile bottom navigation */}
        <nav className="md:hidden flex bg-white border-t border-gray-200">
          {nav.filter(n => n.to !== '/agent/prospects/create').map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end}
              className={({ isActive }) =>
                `flex-1 flex flex-col items-center gap-1 py-2.5 text-xs font-medium transition-colors
                ${isActive ? 'text-blue-600' : 'text-gray-400'}`
              }>
              <Icon size={20} />{label}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  )
}
