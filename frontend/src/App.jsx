import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ExerciceProvider } from './context/ExerciceContext'
import { Spinner } from './components/ui'
import Login from './pages/Login'
import ChangePassword from './pages/ChangePassword'
import AdminLayout from './components/AdminLayout'
import AgentLayout from './components/AgentLayout'
import AdminDashboard from './pages/admin/AdminDashboard'
import AgentList from './pages/admin/AgentList'
import AgentCreate from './pages/admin/AgentCreate'
import BranchList from './pages/admin/BranchList'
import ProductList from './pages/admin/ProductList'
import ProductForm from './pages/admin/ProductForm'
import ProspectsAdmin from './pages/admin/ProspectsAdmin'
import Referentiels from './pages/admin/Referentiels'
import Parametres from './pages/admin/Parametres'
import Affectations from './pages/admin/Affectations'
import AuditLog from './pages/admin/AuditLog'
import AgentDashboard from './pages/agent/AgentDashboard'
import ProspectList from './pages/agent/ProspectList'
import ProspectForm from './pages/agent/ProspectForm'
import SousAgentList from './pages/agent/SousAgentList'
import SousAgentCreate from './pages/agent/SousAgentCreate'
import ClientList from './pages/shared/ClientList'
import ClientDetail from './pages/shared/ClientDetail'
import ContratList from './pages/shared/ContratList'
import ContratDetail from './pages/shared/ContratDetail'
import Echeances from './pages/shared/Echeances'
import FactureList from './pages/shared/FactureList'
import FactureDetail from './pages/shared/FactureDetail'

// Écrans partagés entre l'administrateur et les commerciaux (le périmètre est appliqué par l'API)
const shared = [
  ['clients', <ClientList />], ['clients/:id', <ClientDetail />],
  ['contrats', <ContratList />], ['contrats/:id', <ContratDetail />],
  ['echeances', <Echeances />],
]

function AppRoutes() {
  const { user, loading } = useAuth()
  if (loading) return <Spinner className="min-h-screen items-center" />

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
        <Route path="branches" element={<BranchList />} />
        <Route path="products" element={<ProductList />} />
        <Route path="products/create" element={<ProductForm />} />
        <Route path="products/:id/edit" element={<ProductForm />} />
        <Route path="prospects" element={<ProspectsAdmin />} />
        {shared.map(([path, el]) => <Route key={path} path={path} element={el} />)}
        <Route path="factures" element={<FactureList />} />
        <Route path="factures/:id" element={<FactureDetail />} />
        <Route path="referentiels" element={<Referentiels />} />
        <Route path="parametres" element={<Parametres />} />
        <Route path="affectations" element={<Affectations />} />
        <Route path="audit" element={<AuditLog />} />
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
        {shared.map(([path, el]) => <Route key={path} path={path} element={el} />)}
        <Route path="commissions" element={<FactureList />} />
        <Route path="commissions/:id" element={<FactureDetail />} />
        {!user.parent_agent_id && <>
          <Route path="juniors" element={<SousAgentList />} />
          <Route path="juniors/create" element={<SousAgentCreate />} />
          <Route path="juniors/:id/edit" element={<SousAgentCreate />} />
        </>}
      </Route>
      <Route path="*" element={<Navigate to="/agent" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <ExerciceProvider>
        <AppRoutes />
      </ExerciceProvider>
    </AuthProvider>
  )
}
