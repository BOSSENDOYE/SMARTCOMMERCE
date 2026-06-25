import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import {
  ShieldCheck, LayoutDashboard, ClipboardList, PackageCheck,
  Building2, Key, FileText, Users, ScrollText, LogOut
} from 'lucide-react'
import { useSuperAdminStore } from '../../store/superAdmin.store'

const nav = [
  { to: '/superadmin',          label: 'Dashboard',    icon: LayoutDashboard, end: true },
  { to: '/superadmin/requests', label: 'Demandes',     icon: ClipboardList },
  { to: '/superadmin/plans',    label: 'Plans',        icon: PackageCheck },
  { to: '/superadmin/tenants',  label: 'Tenants',      icon: Building2 },
  { to: '/superadmin/licences', label: 'Licences',     icon: Key },
  { to: '/superadmin/invoices', label: 'Facturation',  icon: FileText },
  { to: '/superadmin/admins',   label: 'Admins',       icon: Users },
  { to: '/superadmin/audit',    label: 'Audit Log',    icon: ScrollText },
]

export default function SuperAdminLayout() {
  const navigate  = useNavigate()
  const clearAuth = useSuperAdminStore(s => s.clearAuth)
  const admin     = useSuperAdminStore(s => s.admin)

  function logout() {
    clearAuth()
    navigate('/superadmin/login', { replace: true })
  }

  return (
    <div className="flex h-screen bg-gray-950 text-white overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 flex flex-col bg-gray-900 border-r border-gray-800">
        {/* Brand */}
        <div className="flex items-center gap-2.5 px-4 py-5 border-b border-gray-800">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shrink-0">
            <ShieldCheck className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold leading-none">SuperAdmin</p>
            <p className="text-xs text-gray-400 truncate mt-0.5">Plateforme</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
          {nav.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition ${
                  isActive
                    ? 'bg-indigo-600 text-white font-medium'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`
              }
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="p-3 border-t border-gray-800">
          <div className="flex items-center gap-2 px-2 mb-2 min-w-0">
            <div className="w-7 h-7 bg-indigo-700 rounded-full flex items-center justify-center text-xs font-bold shrink-0">
              {admin?.name?.charAt(0).toUpperCase() ?? 'A'}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium truncate">{admin?.name}</p>
              <p className="text-xs text-gray-500 truncate">{admin?.role}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-red-600/20 transition"
          >
            <LogOut className="w-4 h-4" />
            Déconnexion
          </button>
        </div>
      </aside>

      {/* Content */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}
