import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import { useAuthStore } from './store/auth.store'
import AppLayout from './components/layout/AppLayout'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/dashboard/DashboardPage'
import PosPage from './pages/pos/PosPage'
import ProductsPage from './pages/products/ProductsPage'
import StockPage from './pages/stock/StockPage'
import { lazy, Suspense } from 'react'

const SuppliersPage = lazy(() => import('./pages/suppliers/SuppliersPage'))
const ClientsPage = lazy(() => import('./pages/clients/ClientsPage'))
const PurchasesPage = lazy(() => import('./pages/purchases/PurchasesPage'))
const InventoryPage = lazy(() => import('./pages/inventory/InventoryPage'))
const PromotionsPage = lazy(() => import('./pages/promotions/PromotionsPage'))
const LossesPage = lazy(() => import('./pages/losses/LossesPage'))
const ReportsPage = lazy(() => import('./pages/reports/ReportsPage'))
const RestaurantPage = lazy(() => import('./pages/restaurant/RestaurantPage'))
const SettingsPage = lazy(() => import('./pages/settings/SettingsPage'))

const qc = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
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
      <BrowserRouter>
        <Toaster
          position="top-right"
          toastOptions={{ duration: 3000, style: { fontSize: '14px', maxWidth: '400px' } }}
        />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<RequireAuth><AppLayout /></RequireAuth>}>
            <Route index element={<DashboardPage />} />
            <Route path="pos" element={<PosPage />} />
            <Route path="products" element={<ProductsPage />} />
            <Route path="stock" element={<StockPage />} />
            <Route path="suppliers" element={<Suspense fallback={<PageLoader />}><SuppliersPage /></Suspense>} />
            <Route path="clients" element={<Suspense fallback={<PageLoader />}><ClientsPage /></Suspense>} />
            <Route path="purchases" element={<Suspense fallback={<PageLoader />}><PurchasesPage /></Suspense>} />
            <Route path="inventory" element={<Suspense fallback={<PageLoader />}><InventoryPage /></Suspense>} />
            <Route path="promotions" element={<Suspense fallback={<PageLoader />}><PromotionsPage /></Suspense>} />
            <Route path="losses" element={<Suspense fallback={<PageLoader />}><LossesPage /></Suspense>} />
            <Route path="reports" element={<Suspense fallback={<PageLoader />}><ReportsPage /></Suspense>} />
            <Route path="restaurant/*" element={<Suspense fallback={<PageLoader />}><RestaurantPage /></Suspense>} />
            <Route path="settings" element={<Suspense fallback={<PageLoader />}><SettingsPage /></Suspense>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
