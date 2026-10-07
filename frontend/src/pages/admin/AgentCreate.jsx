import { useParams } from 'react-router-dom'
import AgentForm from '../../components/AgentForm'

// L'administrateur crée les Séniors et peut modifier tout agent
export default function AgentCreate() {
  const { id } = useParams()
  return <AgentForm key={id || 'new'} id={id} mode="admin" backPath="/admin/agents" />
}
