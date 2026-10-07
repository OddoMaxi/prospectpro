import { useParams } from 'react-router-dom'
import AgentForm from '../../components/AgentForm'

// Un Sénior crée ses Juniors (rattachés automatiquement) et fixe leurs objectifs
export default function SousAgentCreate() {
  const { id } = useParams()
  return <AgentForm key={id || 'new'} id={id} mode="senior" backPath="/agent/juniors" />
}
