import { useState, useEffect } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/auth.store'
import { useActiveStoreStore } from '../../store/active-store.store'
import { useQuery } from '@tanstack/react-query'
import api from '../../lib/api'
import {
  LayoutDashboard, ShoppingCart, Package, Truck, Users, BarChart3,
  Settings, LogOut, ChevronLeft, ChevronRight, AlertTriangle,
  Utensils, ClipboardList, ArrowLeftRight, Percent, TrendingDown,
  Boxes, BookOpen, FileText, Store, ChevronDown, Check, Receipt,
  UtensilsCrossed,
} from 'lucide-react'

type BusinessType = 'grande_surface' | 'restaurant' | 'depot' | 'mixte'

interface NavItem {
  label: string
  to: string
  icon: React.ReactNode
  permission?: string
  license?: 'grande_surface' | 'restaurant'
  /** Si défini, n'afficher que pour ces business_types. Undefined = tous. */
  onlyFor?: BusinessType[]
  /** Si défini, masquer pour ces business_types. */
  hideFor?: BusinessType[]
}

const navItems: NavItem[] = [
  { label: 'Tableau de bord', to: '/',          icon: <LayoutDashboard size={18} /> },
  { label: 'Caisse (POS)',    to: '/pos',        icon: <ShoppingCart size={18} />,      permission: 'create_sales',          hideFor: ['depot'] },
  { label: 'Vente Comptoir',  to: '/sales',      icon: <FileText size={18} />,          permission: 'create_sales',          hideFor: ['depot'] },
  { label: 'Catalogue',       to: '/products',   icon: <Package size={18} />,           permission: 'manage_products',       hideFor: ['restaurant'] },
  { label: 'Menu Restaurant', to: '/restaurant-menu', icon: <UtensilsCrossed size={18} />, permission: 'manage_products',   onlyFor: ['restaurant', 'mixte'] },
  { label: 'Stocks',          to: '/stock',      icon: <Boxes size={18} />,             permission: 'view_stock' },
  { label: 'Inventaire',      to: '/inventory',  icon: <ClipboardList size={18} />,     permission: 'manage_inventory' },
  { label: 'Fournisseurs',    to: '/suppliers',  icon: <Truck size={18} />,             permission: 'manage_suppliers' },
  { label: 'Achats',          to: '/purchases',  icon: <ArrowLeftRight size={18} />,    permission: 'create_purchase_orders' },
  { label: 'Clients',         to: '/clients',    icon: <Users size={18} />,             permission: 'manage_clients',        hideFor: ['depot'] },
  { label: 'Promotions',      to: '/promotions', icon: <Percent size={18} />,           permission: 'manage_promotions',     hideFor: ['depot'] },
  { label: 'Pertes',          to: '/losses',     icon: <TrendingDown size={18} />,      permission: 'manage_losses' },
  { label: 'Dépenses',        to: '/expenses',   icon: <Receipt size={18} />,           permission: 'view_accounting' },
  { label: 'Transferts',      to: '/transfers',  icon: <ArrowLeftRight size={18} />,    permission: 'manage_transfers' },
  { label: 'Magasins',        to: '/stores',     icon: <Store size={18} />,             permission: 'manage_stores' },
  { label: 'Restaurant',      to: '/restaurant', icon: <Utensils size={18} />,          license: 'restaurant' },
  { label: 'Rapports',        to: '/reports',    icon: <BarChart3 size={18} />,         permission: 'view_reports' },
  { label: 'Comptabilité',    to: '/accounting', icon: <BookOpen size={18} />,          permission: 'view_accounting' },
  { label: 'Paramètres',      to: '/settings',   icon: <Settings size={18} /> },
]

// ── Store Switcher (super-admin only) ────────────────────────────────────────

interface StoreEntry { id: number; name: string; code: string; business_type: BusinessType; is_central: boolean; is_active: boolean }

function StoreSwitcher({ collapsed }: { collapsed: boolean }) {
  const { activeStore, setActiveStore } = useActiveStoreStore()
  const [open, setOpen] = useState(false)

  const { data: stores = [] } = useQuery<StoreEntry[]>({
    queryKey: ['stores-list'],
    queryFn: () => api.get('/stores').then(r => r.data),
    staleTime: 60_000,
  })

  const active = stores.find(s => s.id === activeStore?.id) ?? null

  return (
    <div className="relative px-2 pb-2">
      <button
        onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl border transition-all text-xs font-semibold ${
          active
            ? 'bg-primary/20 border-primary/40 text-white'
            : 'bg-yellow-500/20 border-yellow-500/40 text-yellow-300 animate-pulse'
        }`}
        title="Changer de magasin"
      >
        <Store size={13} className="flex-shrink-0" />
        {!collapsed && (
          <>
            <span className="flex-1 text-left truncate">
              {active ? active.name : 'Sélectionner un magasin'}
            </span>
            <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
          </>
        )}
      </button>

      {open && !collapsed && (
        <div className="absolute bottom-full left-2 right-2 mb-1 bg-brand-800 border border-brand-600 rounded-xl shadow-2xl py-1 z-50 max-h-64 overflow-y-auto">
          {stores.filter(s => s.is_active).map(s => (
            <button
              key={s.id}
              onClick={() => { setActiveStore(s); setOpen(false) }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-brand-700 transition-colors ${
                active?.id === s.id ? 'text-primary font-semibold' : 'text-brand-200'
              }`}
            >
              {active?.id === s.id && <Check size={11} className="flex-shrink-0" />}
              {active?.id !== s.id && <span className="w-[11px]" />}
              <span className="truncate">{s.name}</span>
              {s.is_central && (
                <span className="ml-auto text-[9px] bg-primary/30 text-primary px-1.5 py-0.5 rounded-full">
                  Central
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main Layout ───────────────────────────────────────────────────────────────

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(false)
  const { user, clearAuth, can, hasLicense } = useAuthStore()
  const { activeStore } = useActiveStoreStore()
  const navigate = useNavigate()

  const isSuperAdmin = user?.roles?.includes('super_admin') && !user?.store_id

  // business_type du magasin connecté (ou magasin actif pour super admin)
  const storeBusinessType: BusinessType =
    (isSuperAdmin ? (activeStore as any)?.business_type : user?.store?.business_type) ?? 'grande_surface'

  const visibleNav = navItems.filter(item => {
    if (item.permission && !can(item.permission)) return false
    if (item.license && !hasLicense(item.license)) return false
    if (item.onlyFor && !item.onlyFor.includes(storeBusinessType)) return false
    if (item.hideFor && item.hideFor.includes(storeBusinessType)) return false
    return true
  })

  const handleLogout = async () => {
    clearAuth()
    navigate('/login')
  }

  // Current store display name
  const storeName = isSuperAdmin
    ? activeStore?.name ?? '—'
    : user?.store?.name ?? 'Suite'

  return (
    <div className="flex h-screen overflow-hidden bg-gray-100">
      {/* Sidebar */}
      <aside className={`${collapsed ? 'w-16' : 'w-64'} bg-brand text-white flex flex-col transition-all duration-200 ease-in-out flex-shrink-0`}>
        {/* Logo */}
        <div className="flex items-center justify-between p-4 border-b border-brand-700">
          {!collapsed && (
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-primary rounded-lg flex items-center justify-center flex-shrink-0">
                <ShoppingCart size={14} className="text-white" />
              </div>
              <div>
                <p className="text-xs font-bold text-white tracking-wider">BAOBAB</p>
                <p className="text-xs text-brand-300 truncate">{storeName}</p>
              </div>
            </div>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="text-brand-300 hover:text-white p-1 rounded transition-colors ml-auto"
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>

        {/* Super-admin store switcher */}
        {isSuperAdmin && !collapsed && (
          <div className="border-b border-brand-700 pt-2">
            <StoreSwitcher collapsed={collapsed} />
          </div>
        )}

        {/* Super-admin warning if no store selected */}
        {isSuperAdmin && !activeStore && !collapsed && (
          <div className="mx-2 mb-2 flex items-center gap-1.5 px-3 py-1.5 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
            <AlertTriangle size={11} className="text-yellow-400 flex-shrink-0" />
            <p className="text-[10px] text-yellow-300">Sélectionnez un magasin</p>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4 space-y-0.5 px-2">
          {visibleNav.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                  isActive
                    ? 'bg-primary text-white'
                    : 'text-brand-200 hover:bg-brand-700 hover:text-white'
                }`
              }
              title={collapsed ? item.label : undefined}
            >
              <span className="flex-shrink-0">{item.icon}</span>
              {!collapsed && <span className="truncate">{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* User info */}
        <div className="border-t border-brand-700 p-3">
          <div className={`flex items-center gap-3 ${collapsed ? 'justify-center' : ''}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${isSuperAdmin ? 'bg-yellow-500' : 'bg-primary'}`}>
              {user?.name?.charAt(0)?.toUpperCase()}
            </div>
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-white truncate">{user?.name}</p>
                <p className="text-xs text-brand-300 capitalize">
                  {isSuperAdmin ? 'Super Admin' : user?.roles?.[0]?.replace('_', ' ')}
                </p>
              </div>
            )}
            {!collapsed && (
              <button
                onClick={handleLogout}
                className="text-brand-300 hover:text-white transition-colors"
                title="Déconnexion"
              >
                <LogOut size={16} />
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}
