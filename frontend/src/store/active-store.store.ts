import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface StoreOption {
  id: number
  name: string
  code: string
  is_central: boolean
  is_active: boolean
}

interface ActiveStoreState {
  activeStore: StoreOption | null
  setActiveStore: (store: StoreOption | null) => void
  clearActiveStore: () => void
}

/**
 * Used by super-admin to track which store they're currently managing.
 * Regular users always use their own store_id from the JWT token.
 * For super-admin requests, the api.ts interceptor reads activeStore
 * and sends the X-Store-Id header.
 */
export const useActiveStoreStore = create<ActiveStoreState>()(
  persist(
    (set) => ({
      activeStore: null,
      setActiveStore: (store) => set({ activeStore: store }),
      clearActiveStore: () => set({ activeStore: null }),
    }),
    {
      name: 'sc-active-store',
    }
  )
)
