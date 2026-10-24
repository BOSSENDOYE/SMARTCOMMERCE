import type { MenuNode } from '../store/menu.store'

/**
 * Menus par défaut, adaptés à chaque type de commerce.
 * Utilisés tant que le magasin n'a pas personnalisé son menu (Paramètres → Menu),
 * et comme base du bouton « Menu par défaut ».
 *
 * Un item listé dans `hidden` est présent mais masqué (réactivable dans Paramètres → Menu).
 * Un item absent de la spec est ajouté masqué à la fin : il n'apparaît jamais « en vrac ».
 * Les droits (permissions, licences, onlyFor/hideFor) restent appliqués par AppLayout ;
 * un groupe dont aucun item n'est autorisé disparaît.
 */

interface GroupSpec { group: string; items: string[]; hidden?: string[] }
type MenuSpec = (string | GroupSpec)[]

const GESTION: GroupSpec = {
  group: 'Gestion',
  items: ['expenses', 'reports', 'accounting', 'budget', 'reconciliation', 'fixed-assets'],
}

const ADMINISTRATION: GroupSpec = {
  group: 'Administration',
  items: ['users', 'stores', 'settings', 'support'],
}

const RETAIL: MenuSpec = [
  'dashboard',
  { group: 'Vente', items: ['pos', 'sales', 'clients', 'encours', 'invoices', 'deliveries', 'promotions', 'crm'] },
  { group: 'Catalogue & stock', items: ['products', 'stock', 'inventory', 'losses', 'transfers'] },
  { group: 'Achats', items: ['purchases', 'suppliers'] },
  GESTION,
  ADMINISTRATION,
]

const RESTAURANT: MenuSpec = [
  'dashboard',
  { group: 'Salle & cuisine', items: ['restaurant', 'restaurant-menu'] },
  { group: 'Vente', items: ['pos', 'sales', 'clients', 'encours', 'invoices', 'promotions'], hidden: ['crm', 'deliveries'] },
  { group: 'Stock & achats', items: ['stock', 'inventory', 'losses', 'purchases', 'suppliers', 'transfers'] },
  GESTION,
  ADMINISTRATION,
]

const MENUS: Record<string, MenuSpec> = {
  boulangerie: [
    'dashboard',
    { group: 'Vente', items: ['pos', 'customer-orders', 'sales', 'clients', 'encours', 'invoices', 'promotions'], hidden: ['crm', 'deliveries'] },
    { group: 'Production', items: ['production', 'production-orders', 'production-recipes', 'production-unsold'] },
    { group: 'Distribution', items: ['distribution', 'courier-rounds', 'couriers'] },
    { group: 'Stock & achats', items: ['products', 'stock', 'inventory', 'losses', 'purchases', 'suppliers', 'transfers'] },
    GESTION,
    ADMINISTRATION,
  ],

  restaurant: RESTAURANT,
  cafe_snack: RESTAURANT,

  mixte: [
    'dashboard',
    { group: 'Vente', items: ['pos', 'customer-orders', 'sales', 'clients', 'encours', 'invoices', 'deliveries', 'promotions', 'crm'] },
    { group: 'Salle & cuisine', items: ['restaurant', 'restaurant-menu'] },
    { group: 'Production', items: ['production', 'production-orders', 'production-recipes', 'production-unsold'] },
    { group: 'Distribution', items: ['distribution', 'courier-rounds', 'couriers'] },
    { group: 'Catalogue & stock', items: ['products', 'stock', 'inventory', 'losses', 'transfers'] },
    { group: 'Achats', items: ['purchases', 'suppliers'] },
    GESTION,
    ADMINISTRATION,
  ],

  depot: [
    'dashboard',
    { group: 'Stock & logistique', items: ['stock', 'inventory', 'transfers', 'deliveries', 'losses', 'products'] },
    { group: 'Achats', items: ['purchases', 'suppliers'] },
    GESTION,
    ADMINISTRATION,
  ],

  grande_surface: RETAIL,
  superette: RETAIL,
  boutique: RETAIL,
  pharmacie: RETAIL,
}

const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-')

/**
 * @param businessType type de commerce du magasin
 * @param defs         catalogue des items (id + libellé par défaut)
 */
export function buildDefaultMenu(businessType: string, defs: { id: string; label: string }[]): MenuNode[] {
  const labels = new Map(defs.map(d => [d.id, d.label]))
  const used = new Set<string>()

  const builtin = (id: string, visible = true): MenuNode | null => {
    if (!labels.has(id) || used.has(id)) return null
    used.add(id)
    const label = labels.get(id)!
    return { id, type: 'builtin', label, defaultLabel: label, visible, builtinId: id }
  }

  const nodes: MenuNode[] = []
  for (const entry of MENUS[businessType] ?? RETAIL) {
    if (typeof entry === 'string') {
      const node = builtin(entry)
      if (node) nodes.push(node)
      continue
    }
    const children = [
      ...entry.items.map(id => builtin(id)),
      ...(entry.hidden ?? []).map(id => builtin(id, false)),
    ].filter((n): n is MenuNode => n !== null)
    if (children.length) {
      nodes.push({ id: `group-${slug(entry.group)}`, type: 'group', label: entry.group, visible: true, children })
    }
  }

  // Items non prévus pour ce type : présents mais masqués
  for (const d of defs) {
    const node = builtin(d.id, false)
    if (node) nodes.push(node)
  }

  return nodes
}
