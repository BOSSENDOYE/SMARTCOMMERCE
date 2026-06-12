import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../../lib/api'
import { formatCurrency, formatDate, formatNumber } from '../../lib/format'
import { BarChart3, Download, Calendar } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts'

type ReportTab = 'sales-by-product' | 'sales-by-cashier' | 'payment-methods'

export default function ReportsPage() {
  const [tab, setTab] = useState<ReportTab>('sales-by-product')
  const [dateFrom, setDateFrom] = useState(new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10))
  const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10))

  const { data: salesByProduct } = useQuery({
    queryKey: ['report-sales-product', dateFrom, dateTo],
    queryFn: () => api.get('/reports/sales-by-product', { params: { date_from: dateFrom, date_to: dateTo } }).then(r => r.data.data ?? []),
    enabled: tab === 'sales-by-product',
  })

  const { data: salesByCashier } = useQuery({
    queryKey: ['report-sales-cashier', dateFrom, dateTo],
    queryFn: () => api.get('/reports/sales-by-cashier', { params: { date_from: dateFrom, date_to: dateTo } }).then(r => r.data.data ?? []),
    enabled: tab === 'sales-by-cashier',
  })

  const { data: paymentMethods } = useQuery({
    queryKey: ['report-payments', dateFrom, dateTo],
    queryFn: () => api.get('/reports/payment-methods', { params: { date_from: dateFrom, date_to: dateTo } }).then(r => r.data.data ?? []),
    enabled: tab === 'payment-methods',
  })

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><BarChart3 size={24} /> Rapports & Statistiques</h1>
        <button className="btn-secondary flex items-center gap-2"><Download size={16} /> Exporter Excel</button>
      </div>

      {/* Date filter */}
      <div className="card p-4 flex items-center gap-4">
        <Calendar size={18} className="text-gray-400" />
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">Du</label>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="input w-40" />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">au</label>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="input w-40" />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        {[
          { id: 'sales-by-product', label: 'Ventes par produit' },
          { id: 'sales-by-cashier', label: 'Ventes par caissier' },
          { id: 'payment-methods', label: 'Modes de paiement' },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id as ReportTab)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === t.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'sales-by-product' && (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['Produit', 'Qté vendue', 'CA HT', 'CA TTC', 'Transactions'].map(h => (
                  <th key={h} className={`px-4 py-3 font-medium text-gray-600 ${h === 'Produit' ? 'text-left' : 'text-right'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {(salesByProduct ?? []).map((r: { product_id: number; product_name: string; total_qty: number; total_ht: number; total_ttc: number; sale_count: number }) => (
                <tr key={r.product_id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{r.product_name}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{formatNumber(r.total_qty, 2)}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{formatCurrency(r.total_ht)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-blue-600">{formatCurrency(r.total_ttc)}</td>
                  <td className="px-4 py-3 text-right text-gray-500">{r.sale_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'sales-by-cashier' && (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['Caissier', 'Transactions', 'CA TTC', 'Panier moyen'].map(h => (
                  <th key={h} className={`px-4 py-3 font-medium text-gray-600 ${h === 'Caissier' ? 'text-left' : 'text-right'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {(salesByCashier ?? []).map((r: { user_name: string; count: number; total_ttc: number; avg_basket: number }, i: number) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{r.user_name}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{r.count}</td>
                  <td className="px-4 py-3 text-right font-semibold text-blue-600">{formatCurrency(r.total_ttc)}</td>
                  <td className="px-4 py-3 text-right text-gray-500">{formatCurrency(r.avg_basket)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'payment-methods' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="card">
            <h3 className="font-semibold text-gray-900 mb-4">Répartition des paiements</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={paymentMethods ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="method" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => [formatCurrency(v as number), 'Montant']} />
                <Bar dataKey="total" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="card p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Mode</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Transactions</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {(paymentMethods ?? []).map((r: { method: string; count: number; total: number }, i: number) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900 capitalize">{r.method}</td>
                    <td className="px-4 py-3 text-right text-gray-500">{r.count}</td>
                    <td className="px-4 py-3 text-right font-semibold text-blue-600">{formatCurrency(r.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
