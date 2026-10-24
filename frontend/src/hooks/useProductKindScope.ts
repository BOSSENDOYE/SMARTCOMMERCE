import { useState } from 'react'
import { useAuthStore } from '../store/auth.store'
import { useActiveStoreStore } from '../store/active-store.store'

export type ProductKind = 'finished' | 'raw_material'

/** Commerces qui fabriquent : stock, achats et inventaire portent d'abord sur les matières premières */
const PRODUCTION_BUSINESS_TYPES = ['boulangerie']

/**
 * Périmètre produits d'un écran de gestion (stock, achats, inventaire).
 * Boulangerie : matières premières par défaut, bascule possible vers les produits finis.
 * Autres commerces : `kind` reste undefined → aucun filtre, comportement inchangé.
 */
export function useProductKindScope(defaultKind: ProductKind = 'raw_material') {
  const user = useAuthStore(s => s.user)
  const { activeStore } = useActiveStoreStore()
  const businessType = (user?.roles?.includes('super_admin')
    ? (activeStore as { business_type?: string } | null)?.business_type
    : user?.store?.business_type) ?? 'grande_surface'

  const enabled = PRODUCTION_BUSINESS_TYPES.includes(businessType)
  const [selected, setKind] = useState<ProductKind>(defaultKind)

  return { enabled, kind: enabled ? selected : undefined, setKind }
}
