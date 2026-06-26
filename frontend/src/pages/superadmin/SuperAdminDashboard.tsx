import { useQuery } from '@tanstack/react-query'
import {
  TrendingUp, Building2, Users, CreditCard, Clock, AlertTriangle,
  CheckCircle, XCircle, Activity, BarChart3, ArrowUpRight, RefreshCw
} from 'lucide-react'
import { useSuperAdminStore } from '../../store/superAdmin.store'
import axios from 'axios'

// ── API client with SA token ──────────────────────────────────────────────────

function useSaApi() {
  const token = useSuperAdminStore(s => s.token)
  return axios.create({
    baseURL: (import.meta.env.VITE_API_URL ?? 'http://localhost:8000') + '/api/v1',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface DashboardStats {
  mrr: number
  arr: number
  active_tenants: number
  trial_tenants: number
  expired_tenants: number
  suspended_tenants: number
  pending_requests: number
  approved_this_month: number
  conversion_rate: number
  renewals_this_month: number
  revenue_growth: number
  top_plan: string
  expiring_soon: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatXOF(amount: number) {
  return new Intl.NumberFormat('fr-SN', {
    style: 'currency', currency: 'XOF', maximumFractionDigits: 0,
  }).format(amount)
}

function StatCard({
  title, value, subtitle, icon, color, trend
}: {
  title: string
  value: string | number
  subtitle?: string
  icon: React.ReactNode
  color: string
  trend?: { value: number; positive?: boolean }
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-start justify-between mb-3">
        <div className={`w-10 h-10 ${color} rounded-xl flex items-center justify-center`}>
          {icon}
        </div>
        {trend && (
          <div className={`flex items-center gap-1 text-xs font-semibold ${trend.positive !== false ? 'text-green-600' : 'text-red-500'}`}>
            <ArrowUpRight size={12} />
            {trend.value}%
          </div>
        )}
      </div>
      <div className="text-2xl font-bold text-gray-900 mb-0.5">{value}</div>
      <div className="text-sm text-gray-500">{title}</div>
      {subtitle && <div className="text-xs text-gray-400 mt-1">{subtitle}</div>}
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SuperAdminDashboard() {
  const saApi = useSaApi()

  const { data: stats, isLoading, refetch } = useQuery<DashboardStats>({
    queryKey: ['sa-dashboard'],
    queryFn: async () => {
      const res = await saApi.get('/superadmin/dashboard')
      return res.data
    },
    refetchInterval: 60_000,
  })

  // Fallback demo data when API not yet ready
  const s: DashboardStats = stats ?? {
    mrr: 1_250_000,
    arr: 15_000_000,
    active_tenants: 48,
    trial_tenants: 12,
    expired_tenants: 5,
    suspended_tenants: 2,
    pending_requests: 7,
    approved_this_month: 14,
    conversion_rate: 68,
    renewals_this_month: 22,
    revenue_growth: 23,
    top_plan: 'Business',
    expiring_soon: 8,
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tableau de bord Platform</h1>
          <p className="text-sm text-gray-500 mt-0.5">Vue d'ensemble de la plateforme Baobab</p>
        </div>
        <button onClick={() => refetch()}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 bg-white border border-gray-200 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} /> Actualiser
        </button>
      </div>

      {/* Revenue cards */}
      <div>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Revenus récurrents</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="MRR (mensuel)"
            value={formatXOF(s.mrr)}
            icon={<TrendingUp size={18} className="text-green-600" />}
            color="bg-green-50"
            trend={{ value: s.revenue_growth }}
            subtitle="Monthly Recurring Revenue"
          />
          <StatCard
            title="ARR (annuel)"
            value={formatXOF(s.arr)}
            icon={<BarChart3 size={18} className="text-blue-600" />}
            color="bg-blue-50"
            subtitle="Annual Recurring Revenue"
          />
          <StatCard
            title="Approuvés ce mois"
            value={s.approved_this_month}
            icon={<CheckCircle size={18} className="text-emerald-600" />}
            color="bg-emerald-50"
            trend={{ value: 12 }}
            subtitle="Nouveaux abonnements"
          />
          <StatCard
            title="Renouvellements"
            value={s.renewals_this_month}
            icon={<RefreshCw size={18} className="text-purple-600" />}
            color="bg-purple-50"
            subtitle="Ce mois-ci"
          />
        </div>
      </div>

      {/* Tenant status */}
      <div>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Statut des organisations</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard
            title="Actifs"
            value={s.active_tenants}
            icon={<Building2 size={18} className="text-brand" />}
            color="bg-blue-50"
          />
          <StatCard
            title="En essai (Trial)"
            value={s.trial_tenants}
            icon={<Clock size={18} className="text-amber-600" />}
            color="bg-amber-50"
          />
          <StatCard
            title="Expirés"
            value={s.expired_tenants}
            icon={<XCircle size={18} className="text-red-500" />}
            color="bg-red-50"
          />
          <StatCard
            title="Suspendus"
            value={s.suspended_tenants}
            icon={<AlertTriangle size={18} className="text-orange-500" />}
            color="bg-orange-50"
          />
        </div>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Alerts */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <AlertTriangle size={16} className="text-amber-500" /> Alertes platform
          </h3>
          <div className="space-y-3">
            {s.pending_requests > 0 && (
              <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                <div className="text-sm text-blue-800">Demandes en attente</div>
                <span className="text-sm font-bold text-blue-700">{s.pending_requests}</span>
              </div>
            )}
            {s.expiring_soon > 0 && (
              <div className="flex items-center justify-between p-3 bg-amber-50 rounded-lg">
                <div className="text-sm text-amber-800">Expirent dans 7j</div>
                <span className="text-sm font-bold text-amber-700">{s.expiring_soon}</span>
              </div>
            )}
            {s.expired_tenants > 0 && (
              <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                <div className="text-sm text-red-800">Licences expirées</div>
                <span className="text-sm font-bold text-red-700">{s.expired_tenants}</span>
              </div>
            )}
            {s.suspended_tenants > 0 && (
              <div className="flex items-center justify-between p-3 bg-orange-50 rounded-lg">
                <div className="text-sm text-orange-800">Comptes suspendus</div>
                <span className="text-sm font-bold text-orange-700">{s.suspended_tenants}</span>
              </div>
            )}
            {!s.pending_requests && !s.expiring_soon && !s.expired_tenants && !s.suspended_tenants && (
              <div className="flex items-center gap-2 p-3 bg-green-50 rounded-lg">
                <CheckCircle size={16} className="text-green-500" />
                <div className="text-sm text-green-700">Aucune alerte active</div>
              </div>
            )}
          </div>
        </div>

        {/* KPIs */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Activity size={16} className="text-brand" /> KPIs commerciaux
          </h3>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-1.5">
                <span className="text-gray-600">Taux de conversion Trial → Payant</span>
                <span className="font-semibold text-brand">{s.conversion_rate}%</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full" style={{ width: `${s.conversion_rate}%` }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1.5">
                <span className="text-gray-600">Croissance des revenus</span>
                <span className="font-semibold text-green-600">+{s.revenue_growth}%</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-green-500 rounded-full" style={{ width: `${Math.min(s.revenue_growth, 100)}%` }} />
              </div>
            </div>
            <div className="pt-3 border-t border-gray-100">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Plan le plus souscrit</span>
                <span className="font-semibold text-brand bg-primary/10 px-2 py-0.5 rounded-full text-xs">
                  {s.top_plan}
                </span>
              </div>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Total organisations</span>
              <span className="font-semibold text-gray-900">
                {s.active_tenants + s.trial_tenants + s.expired_tenants + s.suspended_tenants}
              </span>
            </div>
          </div>
        </div>

        {/* Quick actions */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h3 className="font-semibold text-gray-800 mb-4">Actions rapides</h3>
          <div className="space-y-2">
            {[
              { label: 'Traiter les demandes', to: '/superadmin/requests', badge: s.pending_requests, color: 'bg-blue-600' },
              { label: 'Voir les licences', to: '/superadmin/licences', badge: s.expiring_soon, color: 'bg-amber-500' },
              { label: 'Gérer les plans', to: '/superadmin/plans', badge: null, color: 'bg-brand' },
              { label: 'Voir les organisations', to: '/superadmin/tenants', badge: null, color: 'bg-purple-600' },
            ].map(item => (
              <a key={item.to} href={item.to}
                className={`flex items-center justify-between w-full px-4 py-2.5 ${item.color} text-white rounded-lg text-sm font-medium hover:opacity-90 transition-opacity`}
              >
                {item.label}
                {item.badge != null && item.badge > 0 && (
                  <span className="bg-white/25 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                    {item.badge}
                  </span>
                )}
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
