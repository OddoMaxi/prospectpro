import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Login from './pages/Login'
import ChangePassword from './pages/ChangePassword'
import AdminLayout from './components/AdminLayout'
import AgentLayout from './components/AgentLayout'
import AdminDashboard from './pages/admin/AdminDashboard'
import AgentList from './pages/admin/AgentList'
import AgentCreate from './pages/admin/AgentCreate'
import ProspectsAdmin from './pages/admin/ProspectsAdmin'
import ProductList from './pages/admin/ProductList'
import ProductForm from './pages/admin/ProductForm'
import AgentDashboard from './pages/agent/AgentDashboard'
import ProspectList from './pages/agent/ProspectList'
import ProspectForm from './pages/agent/ProspectForm'
import SousAgentList from './pages/agent/SousAgentList'
import SousAgentCreate from './pages/agent/SousAgentCreate'

function Spinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

function AppRoutes() {
  const { user, loading } = useAuth()
  if (loading) return <Spinner />

  if (!user) return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )

  if (user.must_change_password) return (
    <Routes>
      <Route path="/change-password" element={<ChangePassword />} />
      <Route path="*" element={<Navigate to="/change-password" replace />} />
    </Routes>
  )

  if (user.role === 'admin') return (
    <Routes>
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<AdminDashboard />} />
        <Route path="agents" element={<AgentList />} />
        <Route path="agents/create" element={<AgentCreate />} />
        <Route path="agents/:id/edit" element={<AgentCreate />} />
        <Route path="products" element={<ProductList />} />
        <Route path="products/create" element={<ProductForm />} />
        <Route path="products/:id/edit" element={<ProductForm />} />
        <Route path="prospects" element={<ProspectsAdmin />} />
      </Route>
      <Route path="*" element={<Navigate to="/admin" replace />} />
    </Routes>
  )

  return (
    <Routes>
      <Route path="/agent" element={<AgentLayout />}>
        <Route index element={<AgentDashboard />} />
        <Route path="prospects" element={<ProspectList />} />
        <Route path="prospects/create" element={<ProspectForm />} />
        <Route path="prospects/:id/edit" element={<ProspectForm />} />
        <Route path="sous-agents" element={<SousAgentList />} />
        <Route path="sous-agents/create" element={<SousAgentCreate />} />
        <Route path="sous-agents/:id/edit" element={<SousAgentCreate />} />
      </Route>
      <Route path="*" element={<Navigate to="/agent" replace />} />
    </Routes>
  )
}

export default function App() {
  return <AuthProvider><AppRoutes /></AuthProvider>
}
