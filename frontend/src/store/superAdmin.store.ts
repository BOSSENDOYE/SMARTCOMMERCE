import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface SuperAdmin {
  id: number
  name: string
  email: string
  role: 'super_admin' | 'support' | 'billing'
}

interface SuperAdminState {
  admin: SuperAdmin | null
  token: string | null
  isAuthenticated: boolean
  setAuth: (admin: SuperAdmin, token: string) => void
  clearAuth: () => void
}

export const useSuperAdminStore = create<SuperAdminState>()(
  persist(
    (set) => ({
      admin: null,
      token: null,
      isAuthenticated: false,

      setAuth: (admin, token) => {
        localStorage.setItem('sc_superadmin_token', token)
        set({ admin, token, isAuthenticated: true })
      },

      clearAuth: () => {
        localStorage.removeItem('sc_superadmin_token')
        set({ admin: null, token: null, isAuthenticated: false })
      },
    }),
    {
      name: 'sc-superadmin',
      partialize: (state) => ({
        admin: state.admin,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
)
