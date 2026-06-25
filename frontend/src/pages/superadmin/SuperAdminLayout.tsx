import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useSuperAdminStore } from '../../store/superAdmin.store'
import {
  LayoutDashboard, ClipboardList, Building2, CreditCard, Package,
  LogOut, ShieldCheck, ChevronLeft, ChevronRight, Bell,
  BarChart3, FileText, Settings, Users, AlertTriangle
} from 'lucide-react'
import toast from 'react-hot-toast'

const navItems = [
  { to: '/superadmin', label: 'Tableau de bord', icon: <LayoutDashboard size={18} />, end: true },
  { to: '/superadmin/requests', label: 'Demandes', icon: <ClipboardList size={18} /> },
  { to: '/superadmin/tenants', label: 'Organisations', icon: <Building2 size={18} /> },
  { to: '/superadmin/plans', label: 'Plans & Tarifs', icon: <Package size={18} /> },
  { to: '/superadmin/licences', label: 'Licences', icon: <CreditCard size={18} /> },
  { to: '/superadmin/invoices', label: 'Facturation', icon: <FileText size={18} /> },
  { to: '/superadmin/admins', label: 'Administrateurs', icon: <Users size={18} /> },
  { to: '/superadmin/audit', label: 'Audit Log', icon: <AlertTriangle size={18} /> },
]

export default function SuperAdminLayout() {
  const navigate = useNavigate()
  const { admin, clearAuth } = useSuperAdminStore()
  const [collapsed, setCollapsed] = useState(false)

  const handleLogout = () => {
    clearAuth()
    navigate('/superadmin/login')
    toast.success('Déconnecté')
  }

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Sidebar */}
      <aside className={`${collapsed ? 'w-16' : 'w-60'} bg-brand text-white flex flex-col transition-all duration-300 flex-shrink-0`}>
        {/* Logo */}
        <div className={`flex items-center ${collapsed ? 'justify-center' : 'gap-3 px-4'} h-16 border-b border-brand-700`}>
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center flex-shrink-0">
            <ShieldCheck size={16} className="text-white" />
          </div>
          {!collapsed && (
            <div className="overflow-hidden">
              <div className="font-bold text-sm leading-none">SuperAdmin</div>
              <div className="text-brand-400 text-[10px] leading-none mt-0.5">Baobab Platform</div>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 overflow-y-auto">
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              title={collapsed ? item.label : undefined}
              className={({ isActive }) =>
                `flex items-center ${collapsed ? 'justify-center px-0' : 'gap-3 px-4'} py-2.5 mx-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-primary text-white'
                    : 'text-brand-300 hover:text-white hover:bg-brand-700'
                }`
              }
            >
              <span className="flex-shrink-0">{item.icon}</span>
              {!collapsed && <span className="truncate">{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="border-t border-brand-700 p-3">
          {!collapsed && admin && (
            <div className="px-1 mb-3">
              <div className="text-xs font-semibold text-white truncate">{admin.name}</div>
              <div className="text-[10px] text-brand-400 capitalize">{admin.role.replace('_', ' ')}</div>
            </div>
          )}
          <button
            onClick={handleLogout}
            title="Déconnexion"
            className={`flex items-center ${collapsed ? 'justify-center w-full' : 'gap-2 px-2'} py-2 text-brand-300 hover:text-red-400 text-sm rounded-lg hover:bg-brand-700 transition-colors w-full`}
          >
            <LogOut size={16} />
            {!collapsed && <span>Déconnexion</span>}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Topbar */}
        <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6 flex-shrink-0">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>

          <div className="flex items-center gap-3">
            <button className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors relative">
              <Bell size={18} />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
            </button>
            <div className="w-8 h-8 bg-brand rounded-lg flex items-center justify-center text-white text-sm font-bold">
              {admin?.name?.[0]?.toUpperCase() ?? 'A'}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
