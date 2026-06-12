import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/auth.store'
import {
  LayoutDashboard, ShoppingCart, Package, Truck, Users, BarChart3,
  Settings, LogOut, ChevronLeft, ChevronRight, AlertTriangle,
  Utensils, ClipboardList, ArrowLeftRight, Percent, TrendingDown,
  Boxes
} from 'lucide-react'

interface NavItem {
  label: string
  to: string
  icon: React.ReactNode
  permission?: string
  license?: 'grande_surface' | 'restaurant'
}

const navItems: NavItem[] = [
  { label: 'Tableau de bord', to: '/', icon: <LayoutDashboard size={18} /> },
  { label: 'Caisse (POS)', to: '/pos', icon: <ShoppingCart size={18} />, permission: 'create_sales' },
  { label: 'Catalogue', to: '/products', icon: <Package size={18} />, permission: 'manage_products' },
  { label: 'Stocks', to: '/stock', icon: <Boxes size={18} />, permission: 'view_stock' },
  { label: 'Inventaire', to: '/inventory', icon: <ClipboardList size={18} />, permission: 'manage_inventory' },
  { label: 'Fournisseurs', to: '/suppliers', icon: <Truck size={18} />, permission: 'manage_suppliers' },
  { label: 'Achats', to: '/purchases', icon: <ArrowLeftRight size={18} />, permission: 'create_purchase_orders' },
  { label: 'Clients', to: '/clients', icon: <Users size={18} />, permission: 'manage_clients' },
  { label: 'Promotions', to: '/promotions', icon: <Percent size={18} />, permission: 'manage_promotions' },
  { label: 'Pertes', to: '/losses', icon: <TrendingDown size={18} />, permission: 'manage_losses' },
  { label: 'Restaurant', to: '/restaurant', icon: <Utensils size={18} />, license: 'restaurant' },
  { label: 'Rapports', to: '/reports', icon: <BarChart3 size={18} />, permission: 'view_reports' },
  { label: 'Paramètres', to: '/settings', icon: <Settings size={18} /> },
]

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(false)
  const { user, clearAuth, can, hasLicense } = useAuthStore()
  const navigate = useNavigate()

  const visibleNav = navItems.filter(item => {
    if (item.permission && !can(item.permission)) return false
    if (item.license && !hasLicense(item.license)) return false
    return true
  })

  const handleLogout = async () => {
    clearAuth()
    navigate('/login')
  }

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
                <p className="text-xs font-bold text-white tracking-wider">SMARTCOMMERCE</p>
                <p className="text-xs text-brand-300 truncate">{user?.store?.name ?? 'Suite'}</p>
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
            <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">
              {user?.name?.charAt(0)?.toUpperCase()}
            </div>
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-white truncate">{user?.name}</p>
                <p className="text-xs text-brand-300 capitalize">{user?.roles?.[0]?.replace('_', ' ')}</p>
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
