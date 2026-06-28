import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface AuthUser {
  id: number
  name: string
  email: string
  store_id: number | null
  store?: {
    id: number
    name: string
    logo: string | null
    currency: string
    business_type: 'grande_surface' | 'restaurant' | 'depot' | 'mixte'
    license_grande_surface: boolean
    license_restaurant: boolean
  }
  stores?: { id: number; name: string; code: string }[]
  roles: string[]
  permissions: string[]
}

interface AuthState {
  user: AuthUser | null
  token: string | null
  isAuthenticated: boolean
  setAuth: (user: AuthUser, token: string) => void
  setUser: (user: AuthUser) => void
  clearAuth: () => void
  can: (permission: string) => boolean
  hasRole: (role: string) => boolean
  hasLicense: (type: 'grande_surface' | 'restaurant') => boolean
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,

      setAuth: (user, token) => {
        localStorage.setItem('sc_token', token)
        set({ user, token, isAuthenticated: true })
      },

      setUser: (user) => set({ user }),

      clearAuth: () => {
        localStorage.removeItem('sc_token')
        set({ user: null, token: null, isAuthenticated: false })
      },

      can: (permission) => {
        const { user } = get()
        if (!user) return false
        if (user.roles.includes('super_admin')) return true
        return user.permissions.includes(permission)
      },

      hasRole: (role) => {
        return get().user?.roles.includes(role) ?? false
      },

      hasLicense: (type) => {
        const store = get().user?.store
        if (!store) return false
        return type === 'grande_surface'
          ? store.license_grande_surface
          : store.license_restaurant
      },
    }),
    {
      name: 'sc-auth',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
)
