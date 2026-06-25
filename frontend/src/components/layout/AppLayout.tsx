import { useState, useEffect, useRef } from 'react'
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../../store/auth.store'
import { useActiveStoreStore } from '../../store/active-store.store'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../lib/api'
import toast from 'react-hot-toast'
import {
  LayoutDashboard, ShoppingCart, Package, Truck, Users, BarChart3,
  Settings, LogOut, ChevronLeft, ChevronRight, AlertTriangle,
  Utensils, ClipboardList, ArrowLeftRight, Percent, TrendingDown,
  Boxes, BookOpen, FileText, Store, ChevronDown, Check, Receipt,
  UtensilsCrossed, UserCircle, Wifi, WifiOff, FilePlus2, Target, Palette, Sun, Moon,
  FolderOpen, MapPin, Banknote, Menu, Smartphone,
} from 'lucide-react'
import { usePreferencesStore } from '../../store/preferences.store'
import { useMenuStore, type MenuNode } from '../../store/menu.store'
import { useNetworkStatus } from '../../hooks/useNetworkStatus'
import { useOfflineSync } from '../../hooks/useOfflineSync'
import { getPendingSalesCount } from '../../lib/offline-db'
import NotificationBell from './NotificationBell'

type BusinessType = 'grande_surface' | 'restaurant' | 'depot' | 'mixte'

interface NavItem {
  id: string
  label: string
  to: string
  icon: React.ReactNode
  permission?: string
  license?: 'grande_surface' | 'restaurant'
  onlyFor?: BusinessType[]
  hideFor?: BusinessType[]
}

const navItems: NavItem[] = [
  { id: 'dashboard',       label: 'Tableau de bord', to: '/dashboard',      icon: <LayoutDashboard size={18} /> },
  { id: 'pos',             label: 'Caisse (POS)',    to: '/pos',            icon: <ShoppingCart size={18} />,      permission: 'create_sales',          hideFor: ['depot'] },
  { id: 'sales',           label: 'Vente Comptoir',  to: '/sales',          icon: <FileText size={18} />,          permission: 'create_sales',          hideFor: ['depot'] },
  { id: 'products',        label: 'Catalogue',       to: '/products',       icon: <Package size={18} />,           permission: 'manage_products',       hideFor: ['restaurant'] },
  { id: 'restaurant-menu', label: 'Menu Restaurant', to: '/restaurant-menu',icon: <UtensilsCrossed size={18} />,   permission: 'manage_products',       onlyFor: ['restaurant', 'mixte'] },
  { id: 'stock',           label: 'Stocks',          to: '/stock',          icon: <Boxes size={18} />,             permission: 'view_stock' },
  { id: 'inventory',       label: 'Inventaire',      to: '/inventory',      icon: <ClipboardList size={18} />,     permission: 'manage_inventory' },
  { id: 'suppliers',       label: 'Fournisseurs',    to: '/suppliers',      icon: <Truck size={18} />,             permission: 'manage_suppliers' },
  { id: 'purchases',       label: 'Achats',          to: '/purchases',      icon: <ArrowLeftRight size={18} />,    permission: 'create_purchase_orders' },
  { id: 'clients',         label: 'Clients',         to: '/clients',        icon: <Users size={18} />,             permission: 'manage_clients',        hideFor: ['depot'] },
  { id: 'encours',         label: 'Encaissements',   to: '/encours',        icon: <Banknote size={18} />,          permission: 'manage_clients',        hideFor: ['depot'] },
  { id: 'invoices',        label: 'Facturation',     to: '/invoices',       icon: <FilePlus2 size={18} />,         permission: 'manage_invoices',       hideFor: ['depot'] },
  { id: 'crm',             label: 'CRM / Leads',     to: '/crm',            icon: <Target size={18} />,            permission: 'manage_crm',            hideFor: ['depot'] },
  { id: 'users',           label: 'Utilisateurs',    to: '/users',          icon: <UserCircle size={18} />,        permission: 'manage_users' },
  { id: 'promotions',      label: 'Promotions',      to: '/promotions',     icon: <Percent size={18} />,           permission: 'manage_promotions',     hideFor: ['depot'] },
  { id: 'losses',          label: 'Pertes',          to: '/losses',         icon: <TrendingDown size={18} />,      permission: 'manage_losses' },
  { id: 'expenses',        label: 'Dépenses',        to: '/expenses',       icon: <Receipt size={18} />,           permission: 'manage_expenses' },
  { id: 'transfers',       label: 'Transferts',      to: '/transfers',      icon: <ArrowLeftRight size={18} />,    permission: 'manage_transfers' },
  { id: 'stores',          label: 'Magasins',        to: '/stores',         icon: <Store size={18} />,             permission: 'manage_stores' },
  { id: 'restaurant',      label: 'Restaurant',      to: '/restaurant',     icon: <Utensils size={18} />,          license: 'restaurant' },
  { id: 'reports',         label: 'Rapports',        to: '/reports',        icon: <BarChart3 size={18} />,         permission: 'view_reports' },
  { id: 'accounting',      label: 'Comptabilité',    to: '/accounting',     icon: <BookOpen size={18} />,          permission: 'view_accounting' },
  { id: 'settings',        label: 'Paramètres',      to: '/settings',       icon: <Settings size={18} /> },
]

// Map for fast lookup by id
const navCatalog = new Map(navItems.map(i => [i.id, i]))

// Collect all builtinIds present anywhere in the tree
function collectBuiltinIds(nodes: MenuNode[]): Set<string> {
  const ids = new Set<string>()
  const collect = (list: MenuNode[]) => {
    for (const n of list) {
      if (n.builtinId) ids.add(n.builtinId)
      if (n.children) collect(n.children)
    }
  }
  collect(nodes)
  return ids
}

// ── Group Section (collapsible in sidebar) ────────────────────────────────────

interface GroupSectionProps {
  group: MenuNode
  collapsed: boolean
  storeBusinessType: BusinessType
  depth?: number
}

function GroupSection({ group, collapsed, storeBusinessType, depth = 0 }: GroupSectionProps) {
  const [open, setOpen] = useState(true)
  const { can, hasLicense } = useAuthStore()
  const { getLabel } = useMenuStore()

  const visibleChildren = (group.children ?? []).filter(child => {
    if (!child.visible) return false
    if (child.type === 'group') return true
    const navItem = navCatalog.get(child.builtinId ?? '')
    if (!navItem) return false
    if (navItem.permission && !can(navItem.permission)) return false
    if (navItem.license && !hasLicense(navItem.license)) return false
    if (navItem.onlyFor && !navItem.onlyFor.includes(storeBusinessType)) return false
    if (navItem.hideFor && navItem.hideFor.includes(storeBusinessType)) return false
    return true
  })

  if (visibleChildren.length === 0) return null

  if (collapsed) {
    return (
      <>
        {visibleChildren.map(child => {
          if (child.type === 'group') {
            return <GroupSection key={child.id} group={child} collapsed={collapsed} storeBusinessType={storeBusinessType} depth={depth + 1} />
          }
          const navItem = navCatalog.get(child.builtinId ?? '')
          if (!navItem) return null
          return (
            <NavLink
              key={child.id}
              to={navItem.to}
              end={navItem.to === '/'}
              className={({ isActive }) =>
                `flex items-center justify-center px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                  isActive ? 'bg-primary text-white' : 'text-brand-200 hover:bg-brand-700 hover:text-white'
                }`
              }
              title={getLabel(child.builtinId!, navItem.label)}
            >
              <span className="flex-shrink-0">{navItem.icon}</span>
            </NavLink>
          )
        })}
      </>
    )
  }

  const indent = depth * 12

  return (
    <div className="space-y-0.5">
      <button
        onClick={() => setOpen(o => !o)}
        style={{ paddingLeft: `${12 + indent}px` }}
        className="w-full flex items-center gap-3 pr-3 py-2 rounded-lg text-sm font-medium text-brand-400 hover:bg-brand-700 hover:text-white transition-all duration-150"
      >
        <FolderOpen size={16} className="flex-shrink-0 opacity-70" />
        <span className="flex-1 text-left truncate text-xs font-semibold uppercase tracking-wider opacity-80">
          {group.label}
        </span>
        <ChevronDown size={13} className={`transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="space-y-0.5">
          {visibleChildren.map(child => {
            if (child.type === 'group') {
              return (
                <GroupSection
                  key={child.id}
                  group={child}
                  collapsed={collapsed}
                  storeBusinessType={storeBusinessType}
                  depth={depth + 1}
                />
              )
            }
            const navItem = navCatalog.get(child.builtinId ?? '')
            if (!navItem) return null
            return (
              <NavLink
                key={child.id}
                to={navItem.to}
                end={navItem.to === '/'}
                style={{ paddingLeft: `${24 + indent}px` }}
                className={({ isActive }) =>
                  `flex items-center gap-3 pr-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
                    isActive
                      ? 'bg-primary text-white'
                      : 'text-brand-200 hover:bg-brand-700 hover:text-white'
                  }`
                }
              >
                <span className="flex-shrink-0">{navItem.icon}</span>
                <span className="truncate">{getLabel(child.builtinId!, navItem.label)}</span>
              </NavLink>
            )
          })}
        </div>
      )}
    </div>
  )
}

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
  const [mobileOpen, setMobileOpen] = useState(false)
  const { user, clearAuth, can, hasLicense, setUser } = useAuthStore()
  const { activeStore } = useActiveStoreStore()
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [switchingStore, setSwitchingStore] = useState(false)
  const userBarRef = useRef<HTMLDivElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const { theme, setTheme } = usePreferencesStore()
  const { isOnline, wasOffline } = useNetworkStatus()
  useOfflineSync()
  const [pendingCount, setPendingCount] = useState(0)

  // Refresh user data on mount to get latest stores/permissions
  useEffect(() => {
    if (!user) return
    api.get('/auth/me').then(res => setUser(res.data)).catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Close popup on outside click
  useEffect(() => {
    if (!showUserMenu) return
    const handler = (e: MouseEvent) => {
      const t = e.target as Node
      if (!userBarRef.current?.contains(t) && !popupRef.current?.contains(t)) {
        setShowUserMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showUserMenu])

  useEffect(() => {
    getPendingSalesCount().then(setPendingCount)
    const interval = setInterval(() => getPendingSalesCount().then(setPendingCount), 10000)
    return () => clearInterval(interval)
  }, [])

  // Close mobile sidebar on route change
  useEffect(() => { setMobileOpen(false) }, [location.pathname])

  const isSuperAdmin = user?.roles?.includes('super_admin') ?? false

  const handleSwitchStore = async (storeId: number) => {
    if (storeId === user?.store_id || switchingStore) return
    setSwitchingStore(true)
    try {
      const res = await api.post('/auth/switch-store', { store_id: storeId })
      setUser(res.data)
      queryClient.clear()
      setShowUserMenu(false)
      navigate('/')
      toast.success('Emplacement changé')
    } catch {
      toast.error("Erreur lors du changement d'emplacement")
    } finally {
      setSwitchingStore(false)
    }
  }

  const { nodes, loaded: menuLoaded, fetchConfig, getLabel, isVisible } = useMenuStore()

  useEffect(() => {
    if (!menuLoaded) fetchConfig()
  }, [menuLoaded, fetchConfig])

  const storeBusinessType: BusinessType =
    (isSuperAdmin ? (activeStore as any)?.business_type : user?.store?.business_type) ?? 'grande_surface'

  // ── Nav rendering helpers ─────────────────────────────────────────────────

  const isItemAllowed = (item: NavItem) => {
    if (item.permission && !can(item.permission)) return false
    if (item.license && !hasLicense(item.license)) return false
    if (item.onlyFor && !item.onlyFor.includes(storeBusinessType)) return false
    if (item.hideFor && item.hideFor.includes(storeBusinessType)) return false
    return true
  }

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
      isActive ? 'bg-primary text-white' : 'text-brand-200 hover:bg-brand-700 hover:text-white'
    }`

  const treeBuiltinIds = collectBuiltinIds(nodes)

  const renderTreeNode = (node: MenuNode): React.ReactNode => {
    if (!node.visible) return null

    if (node.type === 'group') {
      return (
        <GroupSection
          key={node.id}
          group={node}
          collapsed={collapsed}
          storeBusinessType={storeBusinessType}
        />
      )
    }

    const navItem = navCatalog.get(node.builtinId ?? '')
    if (!navItem || !isItemAllowed(navItem)) return null

    return (
      <NavLink
        key={node.id}
        to={navItem.to}
        end={navItem.to === '/'}
        className={navLinkClass}
        title={collapsed ? getLabel(node.builtinId!, navItem.label) : undefined}
      >
        <span className="flex-shrink-0">{navItem.icon}</span>
        {!collapsed && <span className="truncate">{getLabel(node.builtinId!, navItem.label)}</span>}
      </NavLink>
    )
  }

  const flatVisibleNav = navItems.filter(item => isItemAllowed(item) && isVisible(item.id))

  const handleLogout = async () => {
    clearAuth()
    navigate('/login')
  }

  const storeName = user?.store?.name ?? 'BAOBAB'

  return (
    <div className="flex h-screen overflow-hidden bg-gray-100">
      {/* Mobile sidebar backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed lg:relative inset-y-0 left-0 z-50
        ${collapsed ? 'w-16' : 'w-64'}
        bg-brand text-white flex flex-col transition-all duration-200 ease-in-out flex-shrink-0
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
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

        {isSuperAdmin && !activeStore && !collapsed && (
          <div className="mx-2 mb-2 flex items-center gap-1.5 px-3 py-1.5 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
            <AlertTriangle size={11} className="text-yellow-400 flex-shrink-0" />
            <p className="text-[10px] text-yellow-300">Sélectionnez un magasin</p>
          </div>
        )}

        {/* Caisse Mobile — accès direct terminal Android */}
        <div className="px-2 pt-2 pb-1 border-b border-brand-700">
          <a
            href="/m/pos"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all duration-150 bg-green-600/20 text-green-300 hover:bg-green-600/40 hover:text-white border border-green-600/30"
            title={collapsed ? 'Caisse Mobile' : undefined}
          >
            <Smartphone size={18} className="flex-shrink-0" />
            {!collapsed && <span className="truncate">Caisse Mobile</span>}
          </a>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4 space-y-0.5 px-2">
          {nodes.length === 0 ? (
            flatVisibleNav.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={navLinkClass}
                title={collapsed ? item.label : undefined}
              >
                <span className="flex-shrink-0">{item.icon}</span>
                {!collapsed && <span className="truncate">{item.label}</span>}
              </NavLink>
            ))
          ) : (
            <>
              {nodes.map(renderTreeNode)}
              {navItems
                .filter(item => !treeBuiltinIds.has(item.id) && isItemAllowed(item))
                .map(item => (
                  <NavLink
                    key={item.id}
                    to={item.to}
                    end={item.to === '/'}
                    className={navLinkClass}
                    title={collapsed ? item.label : undefined}
                  >
                    <span className="flex-shrink-0">{item.icon}</span>
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </NavLink>
                ))}
            </>
          )}
        </nav>

        {/* User info */}
        <div ref={userBarRef} className="border-t border-brand-700 p-3 relative">
          <div className={`flex items-center gap-3 ${collapsed ? 'justify-center' : ''}`}>
            <button
              onClick={() => !collapsed && setShowUserMenu(m => !m)}
              className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-opacity hover:opacity-80 ${isSuperAdmin ? 'bg-yellow-500' : 'bg-primary'}`}
              title={collapsed ? user?.name : undefined}
            >
              {user?.name?.charAt(0)?.toUpperCase()}
            </button>
            {!collapsed && (
              <button
                onClick={() => setShowUserMenu(m => !m)}
                className="flex-1 min-w-0 text-left"
              >
                <p className="text-xs font-medium text-white truncate">{user?.name}</p>
                <p className="text-xs text-brand-300 capitalize">
                  {isSuperAdmin ? 'Super Admin' : user?.roles?.[0]?.replace('_', ' ')}
                </p>
              </button>
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

          {showUserMenu && !collapsed && (
            <div
              ref={popupRef}
              className="fixed bottom-4 left-[264px] w-60 bg-brand-800 border border-brand-600 rounded-xl shadow-2xl py-1 z-[200] max-h-[80vh] overflow-y-auto"
            >
              <button
                onClick={() => { navigate('/profile'); setShowUserMenu(false) }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-brand-200 hover:bg-brand-700 hover:text-white transition-colors"
              >
                <UserCircle size={13} /> Mon profil
              </button>
              <button
                onClick={() => { navigate('/preferences'); setShowUserMenu(false) }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-brand-200 hover:bg-brand-700 hover:text-white transition-colors"
              >
                <Palette size={13} /> Préférences
              </button>

              {/* Store switcher for users assigned to multiple stores */}
              {user?.stores && user.stores.length > 1 && (
                <>
                  <div className="border-t border-brand-700 my-1" />
                  <p className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-brand-400 font-semibold flex items-center gap-1.5">
                    <MapPin size={10} /> Emplacement
                  </p>
                  {user.stores.map(s => {
                    const isCurrent = s.id === user.store_id
                    return (
                      <button
                        key={s.id}
                        onClick={() => handleSwitchStore(s.id)}
                        disabled={switchingStore}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors disabled:opacity-50 ${
                          isCurrent
                            ? 'text-primary font-semibold bg-primary/10'
                            : 'text-brand-200 hover:bg-brand-700 hover:text-white'
                        }`}
                      >
                        {isCurrent
                          ? <Check size={11} className="flex-shrink-0 text-primary" />
                          : <Store size={11} className="flex-shrink-0 opacity-50" />}
                        <span className="flex-1 truncate text-left">{s.name}</span>
                        {isCurrent && (
                          <span className="text-[9px] text-primary/70 font-normal">actuel</span>
                        )}
                      </button>
                    )
                  })}
                </>
              )}

              <div className="border-t border-brand-700 my-1" />
              <button
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-brand-200 hover:bg-brand-700 hover:text-white transition-colors"
              >
                {theme === 'dark' ? <Sun size={13} /> : <Moon size={13} />}
                {theme === 'dark' ? 'Mode clair' : 'Mode sombre'}
              </button>

              <div className="border-t border-brand-700 my-1" />
              <button
                onClick={() => { handleLogout(); setShowUserMenu(false) }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-400 hover:bg-brand-700 hover:text-red-300 transition-colors"
              >
                <LogOut size={13} /> Déconnexion
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* Top bar */}
        <div className="flex-shrink-0 flex items-center gap-2 px-3 h-10 bg-white border-b border-gray-100 shadow-sm relative z-40">
          <button
            onClick={() => setMobileOpen(o => !o)}
            className="lg:hidden p-1.5 text-gray-500 hover:text-gray-800 rounded-lg hover:bg-gray-100 transition-colors"
            aria-label="Menu"
          >
            <Menu size={18} />
          </button>
          <div className="flex-1" />
          <NotificationBell />
        </div>

        {!isOnline && (
          <div className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white text-xs font-medium flex-shrink-0">
            <WifiOff size={13} />
            <span>Mode hors-ligne — les ventes seront synchronisées au retour d'Internet</span>
            {pendingCount > 0 && (
              <span className="ml-auto bg-white/20 px-2 py-0.5 rounded-full">
                {pendingCount} en attente
              </span>
            )}
          </div>
        )}
        {isOnline && wasOffline && (
          <div className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white text-xs font-medium flex-shrink-0">
            <Wifi size={13} />
            <span>Connexion rétablie — synchronisation en cours...</span>
          </div>
        )}
        <div className="flex-1 overflow-y-auto">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
