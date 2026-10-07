import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import { api } from '../api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const logout = useCallback(() => {
    localStorage.removeItem('token')
    delete api.defaults.headers.common['Authorization']
    setUser(null)
  }, [])

  // Session expirée, compte suspendu ou supprimé : retour à l'écran de connexion
  useEffect(() => {
    const id = api.interceptors.response.use(r => r, err => {
      if (err.response?.status === 401 && !String(err.config?.url).includes('/auth/login') && localStorage.getItem('token')) {
        toast.error(err.response.data?.error || 'Session expirée')
        logout()
      }
      return Promise.reject(err)
    })
    return () => api.interceptors.response.eject(id)
  }, [logout])

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (token) {
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`
      api.get('/auth/me')
        .then(r => setUser(r.data))
        .catch(() => logout())
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [logout])

  const login = async (username, password) => {
    const r = await api.post('/auth/login', { username, password })
    localStorage.setItem('token', r.data.token)
    api.defaults.headers.common['Authorization'] = `Bearer ${r.data.token}`
    setUser(r.data.user)
    return r.data.user
  }

  const updateToken = (token) => {
    localStorage.setItem('token', token)
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`
  }

  return (
    <AuthContext.Provider value={{ user, setUser, loading, login, logout, updateToken }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)

// Préfixe des routes de l'espace courant (/admin ou /agent)
export const useBase = () => (useAuth().user?.role === 'admin' ? '/admin' : '/agent')
