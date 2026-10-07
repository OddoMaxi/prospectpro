import {
  LayoutDashboard, Users, UserSearch, Package, UserCheck, FileText, CalendarClock, Receipt,
  Layers, ListChecks, ArrowLeftRight, ScrollText, Settings,
} from 'lucide-react'
import Layout from './Layout'

const sections = [
  { items: [{ to: '/admin', label: 'Tableau de bord', icon: LayoutDashboard, end: true }] },
  {
    title: 'Commercial',
    items: [
      { to: '/admin/agents', label: 'Agents', icon: Users },
      { to: '/admin/prospects', label: 'Prospects', icon: UserSearch },
      { to: '/admin/clients', label: 'Clients', icon: UserCheck },
      { to: '/admin/contrats', label: 'Contrats', icon: FileText },
      { to: '/admin/echeances', label: 'Échéances à venir', icon: CalendarClock },
      { to: '/admin/factures', label: 'Factures de commissions', icon: Receipt },
    ],
  },
  {
    title: 'Paramétrage',
    items: [
      { to: '/admin/branches', label: 'Branches', icon: Layers },
      { to: '/admin/products', label: 'Produits', icon: Package },
      { to: '/admin/referentiels', label: 'Profession / Secteur', icon: ListChecks },
      { to: '/admin/parametres', label: 'Paramètres', icon: Settings },
    ],
  },
  {
    title: 'Contrôle',
    items: [
      { to: '/admin/affectations', label: 'Affectations', icon: ArrowLeftRight },
      { to: '/admin/audit', label: "Journal d'audit", icon: ScrollText },
    ],
  },
]

export default function AdminLayout() {
  return <Layout sections={sections} subtitle="Administration" />
}
