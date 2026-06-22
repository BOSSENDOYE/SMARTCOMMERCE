import { useQuery } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import api from '../../lib/api'
import { formatCurrency, formatNumber } from '../../lib/format'
import {
  TrendingUp, Package, AlertTriangle, DollarSign,
  RefreshCw, ShoppingCart, ArrowUp, ArrowDown,
  Boxes, Clock, Zap, ReceiptText, X,
} from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Cell,
} from 'recharts'

// ─── Types ────────────────────────────────────────────────────────────────────

interface DashboardData {
  sales: {
    today:     { count: number; total_ttc: number; avg_basket: number }
    yesterday: { count: number; total_ttc: number }
    month:     { count: number; total_ttc: number }
  }
  alerts:            { low_stock_count: number; expiring_soon_count: number }
  top_products:      { id: number; name: string; total_revenue: number; total_qty: number }[]
  payment_breakdown: { method: string; total: number; count: number }[]
  hourly_sales:      { hour: number; count: number; total: number }[]
  week_sales:        { day: string; total: number; count: number }[]
  stock_value:       number
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PAYMENT_META: Record<string, { label: string; color: string }> = {
  cash:         { label: 'Espèces',      color: '#10b981' },
  card:         { label: 'Carte',        color: '#3b82f6' },
  wave:         { label: 'Wave',         color: '#8b5cf6' },
  orange_money: { label: 'Orange Money', color: '#f97316' },
  free_money:   { label: 'Free Money',   color: '#fb923c' },
  check:        { label: 'Chèque',       color: '#64748b' },
  credit:       { label: 'Crédit',       color: '#ef4444' },
  voucher:      { label: 'Avoir',        color: '#06b6d4' },
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Sk({ className = '' }: { className?: string }) {
  return (
    <div className={`rounded-xl bg-gradient-to-r from-gray-100 via-gray-200 to-gray-100 animate-pulse ${className}`} />
  )
}

function DashboardSkeleton() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2"><Sk className="h-7 w-52" /><Sk className="h-4 w-40" /></div>
        <Sk className="h-9 w-32" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => <Sk key={i} className="h-36" />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Sk className="h-64 lg:col-span-2" />
        <Sk className="h-64" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Sk className="h-72" />
        <Sk className="h-72" />
      </div>
    </div>
  )
}

<<<<<<< HEAD
// ─── KPI Card ─────────────────────────────────────────────────────────────────
=======
const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Espèces',
  card: 'Carte',
  wave: 'Wave',
  orange_money: 'Orange Money',
  free_money: 'Free Money',
  check: 'Chèque',
  credit: 'Crédit',
  voucher: 'Avoir',
}

export default function DashboardPage() {
  const { data, isLoading, refetch } = useQuery<DashboardData>({
    queryKey: ['dashboard'],
    queryFn: () => api.get('/dashboard').then(r => r.data),
    refetchInterval: 60_000,
  })

  if (isLoading) {
    return (
      <div className="p-3 sm:p-6 space-y-6 animate-pulse">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-32 bg-gray-200 rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  const today = data?.sales.today
  const yesterday = data?.sales.yesterday
  const dayChange = yesterday?.total_ttc && yesterday.total_ttc > 0
    ? ((today?.total_ttc ?? 0) - yesterday.total_ttc) / yesterday.total_ttc * 100
    : 0

  const paymentData = (data?.payment_breakdown ?? []).map(p => ({
    name: PAYMENT_LABELS[p.method] || p.method,
    value: p.total,
  }))
>>>>>>> 9f1009b7f61ea61fefbd76485dd101f74ece90d9

function KpiCard({
  label, value, sub, icon, iconClass, accentClass,
  trend, trendPct, trendLabel,
}: {
  label: string; value: string; sub?: string
  icon: React.ReactNode; iconClass: string; accentClass: string
  trend?: 'up' | 'down' | 'flat'; trendPct?: string; trendLabel?: string
}) {
  return (
<<<<<<< HEAD
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
      <div className={`h-1 w-full ${accentClass}`} />
      <div className="p-5 flex flex-col gap-3 flex-1">
        <div className="flex items-start justify-between">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{label}</p>
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${iconClass}`}>
            {icon}
          </div>
        </div>
=======
    <div className="p-3 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
>>>>>>> 9f1009b7f61ea61fefbd76485dd101f74ece90d9
        <div>
          <p className="text-2xl font-bold text-gray-900 leading-tight">{value}</p>
          {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
        </div>
        {trend && trendPct && (
          <div className={`flex items-center gap-1.5 text-xs font-semibold mt-auto ${
            trend === 'up' ? 'text-emerald-600' : trend === 'down' ? 'text-red-500' : 'text-gray-400'
          }`}>
            <span className={`flex items-center justify-center w-5 h-5 rounded-full ${
              trend === 'up' ? 'bg-emerald-100' : trend === 'down' ? 'bg-red-100' : 'bg-gray-100'
            }`}>
              {trend === 'up' ? <ArrowUp size={10} /> : trend === 'down' ? <ArrowDown size={10} /> : null}
            </span>
            {trendPct}
            {trendLabel && <span className="font-normal text-gray-400">{trendLabel}</span>}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label, labelFormat }: {
  active?: boolean; payload?: { value: number; name: string }[]
  label?: string | number; labelFormat?: (v: string | number) => string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-gray-900 text-white text-xs rounded-xl px-3 py-2 shadow-xl">
      <p className="font-medium mb-1 text-gray-300">{labelFormat ? labelFormat(label ?? '') : label}</p>
      {payload.map((p, i) => (
        <p key={i} className="font-bold">{formatCurrency(p.value)}</p>
      ))}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [tick, setTick] = useState(0)

  const { data, isLoading, isFetching, refetch, dataUpdatedAt } = useQuery<DashboardData>({
    queryKey: ['dashboard'],
    queryFn: () => api.get('/dashboard').then(r => r.data),
    refetchInterval: 30_000,
    staleTime: 25_000, // synced avec le cache backend de 30s
  })

  useEffect(() => {
    if (dataUpdatedAt) setLastUpdated(new Date(dataUpdatedAt))
  }, [dataUpdatedAt])

  // Compteur "il y a X secondes"
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 10_000)
    return () => clearInterval(id)
  }, [])

  const lastUpdatedLabel = (() => {
    if (!lastUpdated) return null
    const sec = Math.floor((Date.now() - lastUpdated.getTime()) / 1000)
    if (sec < 10) return 'à l\'instant'
    if (sec < 60) return `il y a ${sec}s`
    return `à ${lastUpdated.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
  })()

  if (isLoading) return <DashboardSkeleton />

  const today     = data!.sales.today
  const yesterday = data!.sales.yesterday
  const month     = data!.sales.month

  const dayChangePct = yesterday.total_ttc > 0
    ? ((today.total_ttc - yesterday.total_ttc) / yesterday.total_ttc * 100)
    : null

  const maxRevenue = Math.max(...(data!.top_products.map(p => p.total_revenue)), 1)
  const totalPayments = data!.payment_breakdown.reduce((s, p) => s + p.total, 0)

  const hasAlerts = data!.alerts.low_stock_count > 0 || data!.alerts.expiring_soon_count > 0

  return (
    <div className="p-5 space-y-5 min-h-full bg-gray-50/60">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Tableau de bord</h1>
          <p className="text-xs text-gray-400 mt-0.5 capitalize">
            {new Date().toLocaleDateString('fr-SN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {lastUpdatedLabel && (
            <span className="hidden sm:flex items-center gap-1.5 text-xs text-gray-400 bg-white border border-gray-100 rounded-lg px-3 py-1.5">
              <Clock size={11} className="text-gray-300" />
              {lastUpdatedLabel}
            </span>
          )}
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-60">
            <RefreshCw size={12} className={isFetching ? 'animate-spin' : ''} />
            Actualiser
          </button>
        </div>
      </div>

      {/* ── Alertes ────────────────────────────────────────────────────────── */}
      {hasAlerts && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-sm">
          <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
            <AlertTriangle size={16} className="text-amber-600" />
          </div>
          <div className="flex-1 text-amber-800">
            {data!.alerts.low_stock_count > 0 && (
              <span className="font-semibold">{data!.alerts.low_stock_count} produit(s) en stock critique.{' '}</span>
            )}
            {data!.alerts.expiring_soon_count > 0 && (
              <span className="font-semibold">{data!.alerts.expiring_soon_count} lot(s) expirent dans 30 jours.</span>
            )}
          </div>
        </div>
      )}

      {/* ── KPI Cards ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="CA Aujourd'hui"
          value={formatCurrency(today.total_ttc)}
          sub={`${formatNumber(today.count)} transaction(s)`}
          icon={<Zap size={16} className="text-orange-600" />}
          iconClass="bg-orange-100"
          accentClass="bg-gradient-to-r from-orange-400 to-orange-500"
          trend={dayChangePct !== null ? (dayChangePct >= 0 ? 'up' : 'down') : undefined}
          trendPct={dayChangePct !== null ? `${Math.abs(dayChangePct).toFixed(1)}%` : undefined}
          trendLabel=" vs hier"
        />
        <KpiCard
          label="Panier moyen"
          value={formatCurrency(today.avg_basket)}
          sub="par transaction"
          icon={<ShoppingCart size={16} className="text-emerald-600" />}
          iconClass="bg-emerald-100"
          accentClass="bg-gradient-to-r from-emerald-400 to-emerald-500"
        />
        <KpiCard
          label="CA du Mois"
          value={formatCurrency(month.total_ttc)}
          sub={`${formatNumber(month.count)} transactions`}
          icon={<ReceiptText size={16} className="text-violet-600" />}
          iconClass="bg-violet-100"
          accentClass="bg-gradient-to-r from-violet-400 to-violet-500"
        />
        <KpiCard
          label="Valeur du Stock"
          value={formatCurrency(data!.stock_value)}
          sub="valorisation PUMP"
          icon={<Boxes size={16} className="text-blue-600" />}
          iconClass="bg-blue-100"
          accentClass="bg-gradient-to-r from-blue-400 to-blue-500"
        />
      </div>

      {/* ── Graphiques ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Ventes par heure */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-800 flex items-center gap-2 text-sm">
              <TrendingUp size={16} className="text-orange-500" /> Ventes par heure — aujourd'hui
            </h3>
            <span className="text-xs font-semibold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">
              {formatCurrency(today.total_ttc)}
            </span>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={data!.hourly_sales} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <defs>
                <linearGradient id="gradOrange" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#f97316" stopOpacity={0.18} />
                  <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
              <XAxis dataKey="hour" tick={{ fontSize: 10, fill: '#9ca3af' }}
                tickFormatter={h => `${h}h`} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false}
                tickFormatter={v => v >= 1000 ? `${Math.round(v / 1000)}k` : String(v)} />
              <Tooltip content={<ChartTooltip labelFormat={h => `${h}h00`} />} />
              <Area
                type="monotone" dataKey="total" stroke="#f97316" strokeWidth={2.5}
                fill="url(#gradOrange)" dot={false} activeDot={{ r: 4, fill: '#f97316' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Modes de paiement */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="font-semibold text-gray-800 flex items-center gap-2 text-sm mb-4">
            <DollarSign size={16} className="text-blue-500" /> Modes de paiement
          </h3>
          {data!.payment_breakdown.length === 0 ? (
            <div className="h-48 flex flex-col items-center justify-center text-gray-300 text-xs gap-2">
              <ShoppingCart size={28} />
              Aucune vente aujourd'hui
            </div>
          ) : (
            <div className="space-y-3">
              {data!.payment_breakdown
                .sort((a, b) => b.total - a.total)
                .map(p => {
                  const meta = PAYMENT_META[p.method] ?? { label: p.method, color: '#94a3b8' }
                  const pct = totalPayments > 0 ? (p.total / totalPayments * 100) : 0
                  return (
                    <div key={p.method}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-gray-700 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full inline-block" style={{ background: meta.color }} />
                          {meta.label}
                        </span>
                        <span className="text-xs font-semibold text-gray-700">{formatCurrency(p.total)}</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{ width: `${pct}%`, background: meta.color }}
                        />
                      </div>
                    </div>
                  )
                })}
            </div>
          )}
        </div>
      </div>

      {/* ── Bas de page : Top produits + Semaine ───────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Top produits */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="font-semibold text-gray-800 flex items-center gap-2 text-sm mb-4">
            <TrendingUp size={16} className="text-violet-500" /> Top produits — aujourd'hui
          </h3>
          {data!.top_products.length === 0 ? (
            <div className="h-48 flex flex-col items-center justify-center text-gray-300 text-xs gap-2">
              <Package size={28} />
              Aucune vente aujourd'hui
            </div>
          ) : (
            <div className="space-y-3">
              {data!.top_products.map((p, i) => {
                const pct = (p.total_revenue / maxRevenue) * 100
                const rankColors = ['text-yellow-500', 'text-gray-400', 'text-amber-600']
                return (
                  <div key={p.id} className="flex items-center gap-3">
                    <span className={`text-xs font-black w-5 text-center flex-shrink-0 ${rankColors[i] ?? 'text-gray-300'}`}>
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs font-medium text-gray-800 truncate pr-2">{p.name}</p>
                        <p className="text-xs font-bold text-gray-700 flex-shrink-0">{formatCurrency(p.total_revenue)}</p>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-violet-400 to-violet-600 transition-all duration-700"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <p className="text-[10px] text-gray-400 mt-0.5">{formatNumber(p.total_qty)} unité(s) vendue(s)</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* 7 derniers jours */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-800 flex items-center gap-2 text-sm">
              <TrendingUp size={16} className="text-emerald-500" /> 7 derniers jours
            </h3>
            <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
              {formatCurrency(month.total_ttc)} ce mois
            </span>
          </div>
          {(data!.week_sales ?? []).length === 0 ? (
            <div className="h-48 flex flex-col items-center justify-center text-gray-300 text-xs gap-2">
              <TrendingUp size={28} />
              Pas de données
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={210}>
              <BarChart data={data!.week_sales} margin={{ top: 4, right: 4, bottom: 0, left: -20 }} barSize={22}>
                <defs>
                  <linearGradient id="gradGreen" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor="#10b981" />
                    <stop offset="100%" stopColor="#34d399" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false}
                  tickFormatter={v => v >= 1000 ? `${Math.round(v / 1000)}k` : String(v)} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="total" fill="url(#gradGreen)" radius={[5, 5, 0, 0]}>
                  {(data!.week_sales ?? []).map((_, idx) => (
                    <Cell
                      key={idx}
                      fill={idx === (data!.week_sales.length - 1) ? '#f97316' : 'url(#gradGreen)'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
          <p className="text-[10px] text-gray-400 text-center mt-1">
            La barre orange = aujourd'hui
          </p>
        </div>

      </div>
    </div>
  )
}
