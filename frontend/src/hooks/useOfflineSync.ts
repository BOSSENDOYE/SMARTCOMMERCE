import { useEffect, useCallback } from 'react'
import { getPendingSales, markSaleSynced, db } from '../lib/offline-db'
import api from '../lib/api'
import toast from 'react-hot-toast'
import { useAuthStore } from '../store/auth.store'

export function useOfflineSync() {
  const { isAuthenticated } = useAuthStore()

  const syncPendingSales = useCallback(async () => {
    if (!isAuthenticated) return
    const pending = await getPendingSales()
    if (pending.length === 0) return

    toast.loading(`Synchronisation de ${pending.length} vente(s) hors-ligne...`, { id: 'sync' })
    let synced = 0
    let failed = 0

    for (const sale of pending) {
      try {
        // Mark as syncing
        await db.offlineSales.where('offline_id').equals(sale.offline_id).modify({ status: 'syncing' })

        const payload = {
          store_id: sale.store_id,
          user_id: sale.user_id,
          cash_session_id: sale.cash_session_id,
          client_id: sale.client_id,
          offline_id: sale.offline_id,
          channel: 'pos',
          items: sale.items.map(i => ({
            product_id: i.product_id,
            qty: i.qty,
            unit_price_ttc: i.unit_price_ttc,
            discount_pct: i.discount_pct,
          })),
          payments: sale.payments,
        }

        await api.post('/sales', payload)
        await markSaleSynced(sale.offline_id)
        synced++
      } catch (err: any) {
        const errMsg = err?.response?.data?.message ?? 'Erreur réseau'
        await db.offlineSales.where('offline_id').equals(sale.offline_id).modify({
          status: 'failed',
          error: errMsg,
        })
        failed++
      }
    }

    if (failed === 0) {
      toast.success(`${synced} vente(s) synchronisée(s) avec succès`, { id: 'sync', duration: 4000 })
    } else {
      toast.error(`${synced} synchronisée(s), ${failed} échouée(s)`, { id: 'sync', duration: 5000 })
    }
  }, [isAuthenticated])

  useEffect(() => {
    const handleOnline = () => {
      setTimeout(syncPendingSales, 1500) // small delay to let connection stabilize
    }
    window.addEventListener('online', handleOnline)
    // Also sync on mount if already online and authenticated
    if (navigator.onLine && isAuthenticated) {
      syncPendingSales()
    }
    return () => window.removeEventListener('online', handleOnline)
  }, [syncPendingSales, isAuthenticated])

  return { syncPendingSales }
}
