import { LayoutDashboard, List, PlusCircle, Users, UserCheck, FileText, CalendarClock, Receipt } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import Layout from './Layout'

export default function AgentLayout() {
  const { user } = useAuth()
  const isSenior = !user?.parent_agent_id

  // « Nouveau prospect » n'existe qu'ici : c'est le seul point de création d'un prospect
  const sections = [
    { items: [{ to: '/agent', label: 'Tableau de bord', icon: LayoutDashboard, end: true }] },
    {
      title: 'Prospection',
      items: [
        { to: '/agent/prospects/create', label: 'Nouveau prospect', icon: PlusCircle },
        { to: '/agent/prospects', label: 'Mes prospects', icon: List, end: true },
      ],
    },
    {
      title: 'Portefeuille',
      items: [
        { to: '/agent/clients', label: 'Mes clients', icon: UserCheck },
        { to: '/agent/contrats', label: 'Mes contrats', icon: FileText },
        { to: '/agent/echeances', label: 'Échéances à venir', icon: CalendarClock },
        { to: '/agent/commissions', label: 'Mes commissions', icon: Receipt },
      ],
    },
    ...(isSenior ? [{ title: 'Équipe', items: [{ to: '/agent/juniors', label: 'Mes agents Juniors', icon: Users }] }] : []),
  ]

  return <Layout sections={sections} subtitle={isSenior ? 'Agent Sénior' : 'Agent Junior'} />
}
