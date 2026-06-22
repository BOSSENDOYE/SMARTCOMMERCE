import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import { useState, useEffect } from 'react'
import { useAuthStore } from './store/auth.store'
import { ConfirmProvider } from './hooks/useConfirm'
import { usePreferencesStore } from './store/preferences.store'
import AppLayout from './components/layout/AppLayout'
import InstallPWABanner from './components/InstallPWABanner'
import LoginPage from './pages/LoginPage'
<<<<<<< HEAD
import api from './lib/api'
=======
import DashboardPage from './pages/dashboard/DashboardPage'
import PosPage from './pages/pos/PosPage'
import MobilePosPage from './pages/pos/MobilePosPage'
import ProductsPage from './pages/products/ProductsPage'
import StockPage from './pages/stock/StockPage'
>>>>>>> 9f1009b7f61ea61fefbd76485dd101f74ece90d9
import { lazy, Suspense } from 'react'

const DashboardPage = lazy(() => import('./pages/dashboard/DashboardPage'))
const PosPage       = lazy(() => import('./pages/pos/PosPage'))
const ProductsPage  = lazy(() => import('./pages/products/ProductsPage'))
const StockPage     = lazy(() => import('./pages/stock/StockPage'))

const SalesPage     = lazy(() => import('./pages/sales/SalesPage'))
const SuppliersPage = lazy(() => import('./pages/suppliers/SuppliersPage'))
const ClientsPage = lazy(() => import('./pages/clients/ClientsPage'))
const PurchasesPage = lazy(() => import('./pages/purchases/PurchasesPage'))
const InventoryPage   = lazy(() => import('./pages/inventory/InventoryPage'))
const MyInventoryPage = lazy(() => import('./pages/inventory/MyInventoryPage'))
const PromotionsPage = lazy(() => import('./pages/promotions/PromotionsPage'))
const LossesPage = lazy(() => import('./pages/losses/LossesPage'))
const ReportsPage = lazy(() => import('./pages/reports/ReportsPage'))
const RestaurantPage = lazy(() => import('./pages/restaurant/RestaurantPage'))
const SettingsPage = lazy(() => import('./pages/settings/SettingsPage'))
const AccountingPage = lazy(() => import('./pages/accounting/AccountingPage'))
const StoresPage = lazy(() => import('./pages/settings/StoresPage'))
const OrganizationsPage = lazy(() => import('./pages/settings/OrganizationsPage'))
const PrintTemplatesPage = lazy(() => import('./pages/settings/PrintTemplatesPage'))
const TransfersPage       = lazy(() => import('./pages/transfers/TransfersPage'))
const ExpensesPage        = lazy(() => import('./pages/expenses/ExpensesPage'))
const RestaurantMenuPage  = lazy(() => import('./pages/restaurant/RestaurantMenuPage'))
const UsersPage           = lazy(() => import('./pages/settings/UsersPage'))
const InvoicesPage                  = lazy(() => import('./pages/invoices/InvoicesPage'))
const InvoiceReminderSettingsPage   = lazy(() => import('./pages/invoices/InvoiceReminderSettingsPage'))
const CrmPage             = lazy(() => import('./pages/crm/CrmPage'))
const EncourPage          = lazy(() => import('./pages/encours/EncourPage'))
const ProfilePage         = lazy(() => import('./pages/settings/ProfilePage'))
const RolesPage           = lazy(() => import('./pages/settings/RolesPage'))
const PreferencesPage     = lazy(() => import('./pages/settings/PreferencesPage'))
const MenuSettingsPage        = lazy(() => import('./pages/settings/MenuSettingsPage'))
const ClientCategoriesPage    = lazy(() => import('./pages/settings/ClientCategoriesPage'))

const qc = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime:            5 * 60_000,  // 5 min — évite les refetch à chaque navigation
      gcTime:               20 * 60_000, // 20 min de cache mémoire
      refetchOnWindowFocus: false,        // pas de refetch au retour sur l'onglet
      refetchOnReconnect:   true,
      retry: (failureCount, error) => {
        if ((error as { response?: { status?: number } })?.response?.status === 401) return false
        return failureCount < 2
      },
    },
  },
})

function RequireAuth({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated)
  if (!isAuthenticated) return <Navigate to="/login" replace />
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

// Apply saved preferences (theme + primary color) immediately on first render
function PreferencesBootstrap() {
  const applyOnBoot = usePreferencesStore(s => s.applyOnBoot)
  // Run once synchronously via useState initializer (before paint)
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

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <ConfirmProvider>
      <PreferencesBootstrap />
      <InstallPWABanner />
      <BrowserRouter>
        <Toaster
          position="top-right"
          toastOptions={{ duration: 3000, style: { fontSize: '14px', maxWidth: '400px' } }}
        />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
<<<<<<< HEAD
          <Route path="/" element={<RequireAuth><InventoryGuard><AppLayout /></InventoryGuard></RequireAuth>}>
            <Route index element={<Suspense fallback={<PageLoader />}><DashboardPage /></Suspense>} />
            <Route path="pos" element={<Suspense fallback={<PageLoader />}><PosPage /></Suspense>} />
            <Route path="products" element={<Suspense fallback={<PageLoader />}><ProductsPage /></Suspense>} />
            <Route path="stock" element={<Suspense fallback={<PageLoader />}><StockPage /></Suspense>} />
=======
          <Route path="/m/pos" element={<RequireAuth><MobilePosPage /></RequireAuth>} />
          <Route path="/" element={<RequireAuth><AppLayout /></RequireAuth>}>
            <Route index element={<DashboardPage />} />
            <Route path="pos" element={<PosPage />} />
            <Route path="products" element={<ProductsPage />} />
            <Route path="stock" element={<StockPage />} />
>>>>>>> 9f1009b7f61ea61fefbd76485dd101f74ece90d9
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
            <Route path="crm" element={<Suspense fallback={<PageLoader />}><CrmPage /></Suspense>} />
            <Route path="encours" element={<Suspense fallback={<PageLoader />}><EncourPage /></Suspense>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
      </ConfirmProvider>
    </QueryClientProvider>
  )
}
