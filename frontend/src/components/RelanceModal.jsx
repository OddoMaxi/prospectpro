// Relance client par SMS ou WhatsApp à partir du modèle de message paramétré
import { useEffect, useState } from 'react'
import { MessageCircle, MessageSquare, Copy } from 'lucide-react'
import toast from 'react-hot-toast'
import { api } from '../api'
import { Modal, Spinner } from './ui'

export default function RelanceModal({ contratId, onClose }) {
  const [data, setData] = useState(null)
  useEffect(() => { api.get(`/contrats/${contratId}/relance`).then(r => setData(r.data)) }, [contratId])
  const tel = data ? String(data.telephone || '').replace(/\D/g, '') : ''
  const intl = tel.startsWith('224') ? tel : `224${tel}`
  return (
    <Modal title="Relancer le client" onClose={onClose}>
      {!data ? <Spinner className="py-6" /> : (
        <div className="space-y-4">
          <textarea className="input" rows={5} value={data.message} onChange={e => setData(d => ({ ...d, message: e.target.value }))} />
          {!tel && <p className="text-sm text-amber-600">Aucun numéro de téléphone pour ce client.</p>}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <a className={`btn btn-success justify-center ${tel ? '' : 'pointer-events-none opacity-50'}`} target="_blank" rel="noreferrer"
              href={`https://wa.me/${intl}?text=${encodeURIComponent(data.message)}`}><MessageCircle size={15} />WhatsApp</a>
            <a className={`btn btn-primary justify-center ${tel ? '' : 'pointer-events-none opacity-50'}`}
              href={`sms:+${intl}?body=${encodeURIComponent(data.message)}`}><MessageSquare size={15} />SMS</a>
            <button className="btn btn-secondary justify-center" onClick={() => navigator.clipboard.writeText(data.message).then(() => toast.success('Message copié'))}><Copy size={15} />Copier</button>
          </div>
          <p className="text-xs text-gray-400">Téléphone : {data.telephone || '—'}. Le message s'ouvre dans l'application choisie ; l'envoi reste à confirmer.</p>
        </div>
      )}
    </Modal>
  )
}
