import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../api'
import toast from 'react-hot-toast'
import { KeyRound, Eye, EyeOff, CheckCircle } from 'lucide-react'

export default function ChangePassword() {
  const { user, setUser, updateToken } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ current_password: '', new_password: '', confirm: '' })
  const [loading, setLoading] = useState(false)
  const [show, setShow] = useState({ cur: false, new: false, conf: false })

  const handleSubmit = async e => {
    e.preventDefault()
    if (form.new_password !== form.confirm) return toast.error('Les mots de passe ne correspondent pas')
    if (form.new_password.length < 8) return toast.error('Minimum 8 caractères requis')
    setLoading(true)
    try {
      const r = await api.post('/auth/change-password', {
        current_password: form.current_password,
        new_password: form.new_password
      })
      updateToken(r.data.token)
      setUser(u => ({ ...u, must_change_password: false }))
      toast.success('Mot de passe modifié avec succès !')
      navigate(user?.role === 'admin' ? '/admin' : '/agent')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erreur lors du changement')
    } finally {
      setLoading(false)
    }
  }

  const EyeToggle = ({ field, visible, onToggle }) => (
    <button type="button" onClick={onToggle} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
      {visible ? <EyeOff size={18} /> : <Eye size={18} />}
    </button>
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <KeyRound size={28} className="text-blue-600" />
          </div>
          <h1 className="text-xl font-bold text-white">Changement de mot de passe</h1>
          <p className="text-blue-200 text-sm mt-1">Créez votre mot de passe personnel</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-6">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-5 text-sm text-amber-800">
            Pour des raisons de sécurité, vous devez changer votre mot de passe temporaire avant de continuer.
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Mot de passe temporaire</label>
              <div className="relative">
                <input className="input pr-10" type={show.cur ? 'text' : 'password'}
                  value={form.current_password} onChange={e => setForm(f => ({ ...f, current_password: e.target.value }))}
                  required placeholder="Mot de passe reçu" />
                <EyeToggle visible={show.cur} onToggle={() => setShow(s => ({ ...s, cur: !s.cur }))} />
              </div>
            </div>
            <div>
              <label className="label">Nouveau mot de passe</label>
              <div className="relative">
                <input className="input pr-10" type={show.new ? 'text' : 'password'}
                  value={form.new_password} onChange={e => setForm(f => ({ ...f, new_password: e.target.value }))}
                  required placeholder="Minimum 8 caractères" />
                <EyeToggle visible={show.new} onToggle={() => setShow(s => ({ ...s, new: !s.new }))} />
              </div>
            </div>
            <div>
              <label className="label">Confirmer le mot de passe</label>
              <div className="relative">
                <input className="input pr-10" type={show.conf ? 'text' : 'password'}
                  value={form.confirm} onChange={e => setForm(f => ({ ...f, confirm: e.target.value }))}
                  required placeholder="Répétez le nouveau mot de passe" />
                <EyeToggle visible={show.conf} onToggle={() => setShow(s => ({ ...s, conf: !s.conf }))} />
              </div>
              {form.confirm && form.new_password !== form.confirm && (
                <p className="text-xs text-red-500 mt-1">Les mots de passe ne correspondent pas</p>
              )}
              {form.confirm && form.confirm.length >= 8 && form.new_password === form.confirm && (
                <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1"><CheckCircle size={12} />Mots de passe identiques</p>
              )}
            </div>
            <button type="submit" disabled={loading} className="btn btn-primary w-full justify-center mt-2">
              {loading ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : null}
              {loading ? 'Changement en cours...' : 'Valider'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
