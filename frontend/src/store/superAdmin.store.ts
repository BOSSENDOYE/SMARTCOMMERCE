import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface SuperAdminUser {
  id: number
  name: string
  email: string
  role: 'super_admin' | 'support' | 'billing'
  last_login_at: string | null
}

interface SuperAdminState {
  admin: SuperAdminUser | null
  token: string | null
  isAuthenticated: boolean
  setAuth: (admin: SuperAdminUser, token: string) => void
  clearAuth: () => void
}

export const useSuperAdminStore = create<SuperAdminState>()(
  persist(
    (set) => ({
      admin: null,
      token: null,
      isAuthenticated: false,
      setAuth: (admin, token) => set({ admin, token, isAuthenticated: true }),
      clearAuth: () => set({ admin: null, token: null, isAuthenticated: false }),
    }),
    { name: 'sc-superadmin-auth' }
  )
)
