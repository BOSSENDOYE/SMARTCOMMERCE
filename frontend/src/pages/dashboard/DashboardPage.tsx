import { useQuery } from '@tanstack/react-query'
import api from '../../lib/api'
import { formatCurrency, formatNumber } from '../../lib/format'
import {
  TrendingUp, TrendingDown, ShoppingCart, Package, AlertTriangle,
  Calendar, DollarSign, BarChart3, Users, RefreshCw
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Legend
} from 'recharts'

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4']

interface DashboardData {
  sales: {
    today: { count: number; total_ttc: number; avg_basket: number }
    yesterday: { count: number; total_ttc: number }
    month: { count: number; total_ttc: number }
  }
  alerts: { low_stock_count: number; expiring_soon_count: number }
  top_products: { id: number; name: string; total_revenue: number; total_qty: number }[]
  payment_breakdown: { method: string; total: number; count: number }[]
  hourly_sales: { hour: number; count: number; total: number }[]
  stock_value: number
}

function StatCard({
  title, value, sub, icon, trend, color = 'blue'
}: {
  title: string; value: string; sub?: string; icon: React.ReactNode;
  trend?: 'up' | 'down' | 'neutral'; color?: string
}) {
  return (
    <div className="card">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500">{title}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
          {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
        </div>
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center bg-${color}-100`}>
          <span className={`text-${color}-600`}>{icon}</span>
        </div>
      </div>
      {trend && (
        <div className="mt-3 flex items-center gap-1">
          {trend === 'up' ? (
            <TrendingUp size={14} className="text-green-500" />
          ) : (
            <TrendingDown size={14} className="text-red-500" />
          )}
        </div>
      )}
    </div>
  )
}

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

  return (
    <div className="p-3 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tableau de bord</h1>
          <p className="text-gray-500 text-sm">
            {new Date().toLocaleDateString('fr-SN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <button onClick={() => refetch()} className="btn-secondary flex items-center gap-2 text-sm">
          <RefreshCw size={14} />
          Actualiser
        </button>
      </div>

      {/* Alerts */}
      {((data?.alerts.low_stock_count ?? 0) > 0 || (data?.alerts.expiring_soon_count ?? 0) > 0) && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle className="text-amber-500 flex-shrink-0" size={20} />
          <div className="text-sm">
            {(data?.alerts.low_stock_count ?? 0) > 0 && (
              <span className="font-medium text-amber-800">
                {data?.alerts.low_stock_count} produit(s) en rupture / sous stock minimum.{' '}
              </span>
            )}
            {(data?.alerts.expiring_soon_count ?? 0) > 0 && (
              <span className="font-medium text-amber-800">
                {data?.alerts.expiring_soon_count} lot(s) expirent dans 30 jours.
              </span>
            )}
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="CA Aujourd'hui"
          value={formatCurrency(today?.total_ttc ?? 0)}
          sub={`${today?.count ?? 0} transactions`}
          icon={<DollarSign size={22} />}
          trend={dayChange >= 0 ? 'up' : 'down'}
          color="blue"
        />
        <StatCard
          title="Panier Moyen"
          value={formatCurrency(today?.avg_basket ?? 0)}
          sub="par transaction"
          icon={<ShoppingCart size={22} />}
          color="green"
        />
        <StatCard
          title="CA du Mois"
          value={formatCurrency(data?.sales.month.total_ttc ?? 0)}
          sub={`${data?.sales.month.count ?? 0} transactions`}
          icon={<Calendar size={22} />}
          color="purple"
        />
        <StatCard
          title="Valeur du Stock"
          value={formatCurrency(data?.stock_value ?? 0)}
          icon={<Package size={22} />}
          color="orange"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Hourly Sales */}
        <div className="card lg:col-span-2">
          <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <BarChart3 size={18} /> Ventes par heure (aujourd'hui)
          </h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data?.hourly_sales ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="hour" tickFormatter={h => `${h}h`} tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => formatCurrency(v).replace(' F CFA', 'k').replace(/\d+/, n => String(Math.round(parseInt(n) / 1000)))} />
              <Tooltip formatter={(v) => [formatCurrency(v as number), 'Ventes']} labelFormatter={(l) => `${l}h`} />
              <Bar dataKey="total" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Payment Methods */}
        <div className="card">
          <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <DollarSign size={18} /> Modes de paiement
          </h3>
          {paymentData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={paymentData} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="value">
                  {paymentData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => formatCurrency(v as number)} />
                <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-48 flex items-center justify-center text-gray-400 text-sm">
              Aucune vente aujourd'hui
            </div>
          )}
        </div>
      </div>

      {/* Top Products */}
      <div className="card">
        <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <TrendingUp size={18} /> Top 10 produits (aujourd'hui)
        </h3>
        {(data?.top_products ?? []).length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-3 font-medium">#</th>
                  <th className="pb-3 font-medium">Produit</th>
                  <th className="pb-3 font-medium text-right">Qté vendue</th>
                  <th className="pb-3 font-medium text-right">CA</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {(data?.top_products ?? []).map((p, i) => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="py-2 text-gray-400">{i + 1}</td>
                    <td className="py-2 font-medium text-gray-900">{p.name}</td>
                    <td className="py-2 text-right text-gray-600">{formatNumber(p.total_qty)}</td>
                    <td className="py-2 text-right font-semibold text-primary">{formatCurrency(p.total_revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-center text-gray-400 py-8 text-sm">Aucune vente aujourd'hui</p>
        )}
      </div>
    </div>
  )
}
