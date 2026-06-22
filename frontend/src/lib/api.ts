import axios from 'axios'

// Si VITE_API_URL est vide, on utilise un chemin relatif → passe par le proxy Vite
// → fonctionne depuis n'importe quel appareil sur le réseau local (POS Android, etc.)
const API_URL = import.meta.env.VITE_API_URL || ''

const api = axios.create({
  baseURL: API_URL ? `${API_URL}/api/v1` : '/api/v1',
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
  withCredentials: true,
})

// Request interceptor — attach token + store context
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('sc_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }

  const workstation = localStorage.getItem('sc_workstation')
  if (workstation) {
    config.headers['X-Workstation'] = workstation
  }

  // Super-admin store context: inject X-Store-Id if a store is selected
  try {
    const scAuth = localStorage.getItem('sc-auth')
    if (scAuth) {
      const { state: authState } = JSON.parse(scAuth)
      const isSuperAdmin = authState?.user?.roles?.includes('super_admin')
      const hasOwnStore = authState?.user?.store_id !== null && authState?.user?.store_id !== undefined

      if (isSuperAdmin && !hasOwnStore) {
        const scActiveStore = localStorage.getItem('sc-active-store')
        if (scActiveStore) {
          const { state: storeState } = JSON.parse(scActiveStore)
          if (storeState?.activeStore?.id) {
            config.headers['X-Store-Id'] = String(storeState.activeStore.id)
          }
        }
      }
    }
  } catch {
    // ignore JSON parse errors
  }

  return config
})

// Response interceptor — handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('sc_token')
      localStorage.removeItem('sc_user')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export default api
