import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import { useState, useEffect, lazy, Suspense } from 'react'
import { useAuthStore } from './store/auth.store'
import { useSuperAdminStore } from './store/superAdmin.store'
import { ConfirmProvider } from './hooks/useConfirm'
import { usePreferencesStore } from './store/preferences.store'
import AppLayout from './components/layout/AppLayout'
import InstallPWABanner from './components/InstallPWABanner'
import api from './lib/api'

// ── Eager imports (critical path) ─────────────────────────────────────────────
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'

// ── SuperAdmin pages ──────────────────────────────────────────────────────────
import SuperAdminLoginPage from './pages/superadmin/SuperAdminLoginPage'
import SuperAdminLayout from './pages/superadmin/SuperAdminLayout'
import SuperAdminDashboard from './pages/superadmin/SuperAdminDashboard'
import OnboardingRequestsPage from './pages/superadmin/OnboardingRequestsPage'
import PlansPage from './pages/superadmin/PlansPage'
import TenantsPage from './pages/superadmin/TenantsPage'
import LicencesPage from './pages/superadmin/LicencesPage'
import InvoicesAdminPage from './pages/superadmin/InvoicesAdminPage'
import AdminsPage from './pages/superadmin/AdminsPage'
import AuditLogPage from './pages/superadmin/AuditLogPage'
import TenantUsersPage from './pages/superadmin/TenantUsersPage'
import SupportAdminPage from './pages/superadmin/SupportAdminPage'
import SupportTicketAdminPage from './pages/superadmin/SupportTicketAdminPage'

// ── Lazy app pages ────────────────────────────────────────────────────────────
const DashboardPage               = lazy(() => import('./pages/dashboard/DashboardPage'))
const PosPage                     = lazy(() => import('./pages/pos/PosPage'))
const MobilePosPage               = lazy(() => import('./pages/pos/MobilePosPage'))
const ProductsPage                = lazy(() => import('./pages/products/ProductsPage'))
const StockPage                   = lazy(() => import('./pages/stock/StockPage'))
const SalesPage                   = lazy(() => import('./pages/sales/SalesPage'))
const SuppliersPage               = lazy(() => import('./pages/suppliers/SuppliersPage'))
const ClientsPage                 = lazy(() => import('./pages/clients/ClientsPage'))
const PurchasesPage               = lazy(() => import('./pages/purchases/PurchasesPage'))
const InventoryPage               = lazy(() => import('./pages/inventory/InventoryPage'))
const MyInventoryPage             = lazy(() => import('./pages/inventory/MyInventoryPage'))
const PromotionsPage              = lazy(() => import('./pages/promotions/PromotionsPage'))
const LossesPage                  = lazy(() => import('./pages/losses/LossesPage'))
const ReportsPage                 = lazy(() => import('./pages/reports/ReportsPage'))
const RestaurantPage              = lazy(() => import('./pages/restaurant/RestaurantPage'))
const SettingsPage                = lazy(() => import('./pages/settings/SettingsPage'))
const AccountingPage              = lazy(() => import('./pages/accounting/AccountingPage'))
const StoresPage                  = lazy(() => import('./pages/settings/StoresPage'))
const OrganizationsPage           = lazy(() => import('./pages/settings/OrganizationsPage'))
const PrintTemplatesPage          = lazy(() => import('./pages/settings/PrintTemplatesPage'))
const TransfersPage               = lazy(() => import('./pages/transfers/TransfersPage'))
const ExpensesPage                = lazy(() => import('./pages/expenses/ExpensesPage'))
const RestaurantMenuPage          = lazy(() => import('./pages/restaurant/RestaurantMenuPage'))
const UsersPage                   = lazy(() => import('./pages/settings/UsersPage'))
const InvoicesPage                = lazy(() => import('./pages/invoices/InvoicesPage'))
const InvoiceReminderSettingsPage = lazy(() => import('./pages/invoices/InvoiceReminderSettingsPage'))
const CrmPage                     = lazy(() => import('./pages/crm/CrmPage'))
const EncourPage                  = lazy(() => import('./pages/encours/EncourPage'))
const SupportPage                 = lazy(() => import('./pages/support/SupportPage'))
const SupportTicketPage           = lazy(() => import('./pages/support/SupportTicketPage'))
const ProfilePage                 = lazy(() => import('./pages/settings/ProfilePage'))
const RolesPage                   = lazy(() => import('./pages/settings/RolesPage'))
const PreferencesPage             = lazy(() => import('./pages/settings/PreferencesPage'))
const MenuSettingsPage            = lazy(() => import('./pages/settings/MenuSettingsPage'))
const ClientCategoriesPage        = lazy(() => import('./pages/settings/ClientCategoriesPage'))
const MailSettingsPage            = lazy(() => import('./pages/settings/MailSettingsPage'))

// ── Query client ──────────────────────────────────────────────────────────────

const qc = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime:            5 * 60_000,
      gcTime:               20 * 60_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect:   true,
      retry: (failureCount, error) => {
        if ((error as { response?: { status?: number } })?.response?.status === 401) return false
        return failureCount < 2
      },
    },
  },
})

// ── Guards ────────────────────────────────────────────────────────────────────

function RequireAuth({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated)
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <>{children}</>
}

function RequireSuperAdmin({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useSuperAdminStore(s => s.isAuthenticated)
  if (!isAuthenticated) return <Navigate to="/superadmin/login" replace />
  return <>{children}</>
}

/**
 * During an active inventory, non-admin users are redirected to /my-inventory.
 * Admin and super_admin can still access any page.
 */
function InventoryGuard({ children }: { children: React.ReactNode }) {
  const user     = useAuthStore(s => s.user)
  const navigate = useNavigate()
  const location = useLocation()

  const isAdmin  = user?.roles.some(r => ['admin', 'super_admin'].includes(r)) ?? false
  const excluded = ['/my-inventory', '/login']
  const skip     = isAdmin || excluded.some(p => location.pathname.startsWith(p))

  const { data } = useQuery({
    queryKey: ['inventory-active-guard'],
    queryFn: () => api.get('/inventory-sessions/active').then(r => r.data),
    enabled: !skip,
    refetchInterval: 60_000,
    staleTime: 30_000,
  })

  useEffect(() => {
    if (!skip && data?.active && data?.my_sheets?.length > 0) {
      navigate('/my-inventory', { replace: true })
    }
  }, [data, skip, navigate])

  return <>{children}</>
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

function PreferencesBootstrap() {
  const applyOnBoot = usePreferencesStore(s => s.applyOnBoot)
  const [_] = useState(() => { applyOnBoot(); return null })
  return null
}

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <ConfirmProvider>
        <PreferencesBootstrap />
        <BrowserRouter>
          <Toaster
            position="top-right"
            toastOptions={{ duration: 3000, style: { fontSize: '14px', maxWidth: '400px' } }}
          />
          {/* PWA install banner — affiché globalement sur toutes les pages */}
          <InstallPWABanner />
          <Routes>
            {/* ── Public ──────────────────────────────────────────────── */}
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage />} />

            {/* ── SuperAdmin ──────────────────────────────────────────── */}
            <Route path="/superadmin/login" element={<SuperAdminLoginPage />} />
            <Route path="/superadmin" element={<RequireSuperAdmin><SuperAdminLayout /></RequireSuperAdmin>}>
              <Route index element={<SuperAdminDashboard />} />
              <Route path="requests" element={<OnboardingRequestsPage />} />
              <Route path="plans" element={<PlansPage />} />
              <Route path="tenants" element={<TenantsPage />} />
              <Route path="licences" element={<LicencesPage />} />
              <Route path="invoices" element={<InvoicesAdminPage />} />
              <Route path="tenant-users" element={<TenantUsersPage />} />
              <Route path="admins" element={<AdminsPage />} />
              <Route path="audit" element={<AuditLogPage />} />
              <Route path="support" element={<SupportAdminPage />} />
              <Route path="support/:id" element={<SupportTicketAdminPage />} />
              <Route path="*" element={<Navigate to="/superadmin" replace />} />
            </Route>

            {/* ── Mobile POS (standalone) ─────────────────────────────── */}
            <Route path="/m/pos" element={<RequireAuth><Suspense fallback={<PageLoader />}><MobilePosPage /></Suspense></RequireAuth>} />

            {/* ── App (authenticated) ──────────────────────────────────── */}
            <Route path="/" element={<RequireAuth><InventoryGuard><AppLayout /></InventoryGuard></RequireAuth>}>
              <Route path="dashboard" element={<Suspense fallback={<PageLoader />}><DashboardPage /></Suspense>} />
              <Route path="pos" element={<Suspense fallback={<PageLoader />}><PosPage /></Suspense>} />
              <Route path="products" element={<Suspense fallback={<PageLoader />}><ProductsPage /></Suspense>} />
              <Route path="stock" element={<Suspense fallback={<PageLoader />}><StockPage /></Suspense>} />
              <Route path="sales" element={<Suspense fallback={<PageLoader />}><SalesPage /></Suspense>} />
              <Route path="suppliers" element={<Suspense fallback={<PageLoader />}><SuppliersPage /></Suspense>} />
              <Route path="clients" element={<Suspense fallback={<PageLoader />}><ClientsPage /></Suspense>} />
              <Route path="purchases" element={<Suspense fallback={<PageLoader />}><PurchasesPage /></Suspense>} />
              <Route path="inventory" element={<Suspense fallback={<PageLoader />}><InventoryPage /></Suspense>} />
              <Route path="my-inventory" element={<Suspense fallback={<PageLoader />}><MyInventoryPage /></Suspense>} />
              <Route path="promotions" element={<Suspense fallback={<PageLoader />}><PromotionsPage /></Suspense>} />
              <Route path="losses" element={<Suspense fallback={<PageLoader />}><LossesPage /></Suspense>} />
              <Route path="reports" element={<Suspense fallback={<PageLoader />}><ReportsPage /></Suspense>} />
              <Route path="restaurant/*" element={<Suspense fallback={<PageLoader />}><RestaurantPage /></Suspense>} />
              <Route path="accounting" element={<Suspense fallback={<PageLoader />}><AccountingPage /></Suspense>} />
              <Route path="settings" element={<Suspense fallback={<PageLoader />}><SettingsPage /></Suspense>} />
              <Route path="stores" element={<Suspense fallback={<PageLoader />}><StoresPage /></Suspense>} />
              <Route path="organizations" element={<Suspense fallback={<PageLoader />}><OrganizationsPage /></Suspense>} />
              <Route path="print-templates" element={<Suspense fallback={<PageLoader />}><PrintTemplatesPage /></Suspense>} />
              <Route path="transfers" element={<Suspense fallback={<PageLoader />}><TransfersPage /></Suspense>} />
              <Route path="expenses" element={<Suspense fallback={<PageLoader />}><ExpensesPage /></Suspense>} />
              <Route path="restaurant-menu" element={<Suspense fallback={<PageLoader />}><RestaurantMenuPage /></Suspense>} />
              <Route path="users" element={<Suspense fallback={<PageLoader />}><UsersPage /></Suspense>} />
              <Route path="roles" element={<Suspense fallback={<PageLoader />}><RolesPage /></Suspense>} />
              <Route path="profile" element={<Suspense fallback={<PageLoader />}><ProfilePage /></Suspense>} />
              <Route path="preferences" element={<Suspense fallback={<PageLoader />}><PreferencesPage /></Suspense>} />
              <Route path="menu-settings" element={<Suspense fallback={<PageLoader />}><MenuSettingsPage /></Suspense>} />
              <Route path="client-categories" element={<Suspense fallback={<PageLoader />}><ClientCategoriesPage /></Suspense>} />
              <Route path="invoices" element={<Suspense fallback={<PageLoader />}><InvoicesPage /></Suspense>} />
              <Route path="invoice-reminders" element={<Suspense fallback={<PageLoader />}><InvoiceReminderSettingsPage /></Suspense>} />
              <Route path="mail-settings" element={<Suspense fallback={<PageLoader />}><MailSettingsPage /></Suspense>} />
              <Route path="crm" element={<Suspense fallback={<PageLoader />}><CrmPage /></Suspense>} />
              <Route path="encours" element={<Suspense fallback={<PageLoader />}><EncourPage /></Suspense>} />
              <Route path="support" element={<Suspense fallback={<PageLoader />}><SupportPage /></Suspense>} />
              <Route path="support/:id" element={<Suspense fallback={<PageLoader />}><SupportTicketPage /></Suspense>} />
            </Route>

            {/* ── Catch-all ────────────────────────────────────────────── */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </ConfirmProvider>
    </QueryClientProvider>
  )
}
