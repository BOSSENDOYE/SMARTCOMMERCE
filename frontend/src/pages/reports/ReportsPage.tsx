import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../../lib/api'
import { formatCurrency, formatNumber, downloadPdf } from '../../lib/format'
import { BarChart3, FileDown, Calendar, Loader2 } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import toast from 'react-hot-toast'
import { useActiveStoreStore } from '../../store/active-store.store'
import { useAuthStore } from '../../store/auth.store'

type ReportTab =
  | 'sales-by-product'
  | 'sales-by-cashier'
  | 'sales-by-category'
  | 'payment-methods'
  | 'stock-valuation'
  | 'supplier-balances'
  | 'client-credit'

const TABS: { id: ReportTab; label: string; pdfPath: string; pdfName: string }[] = [
  { id: 'sales-by-product',  label: 'Ventes / Produit',    pdfPath: '/reports/sales-by-product',  pdfName: 'rapport-ventes-produits.pdf'    },
  { id: 'sales-by-cashier',  label: 'Ventes / Caissier',   pdfPath: '/reports/sales-by-cashier',  pdfName: 'rapport-ventes-caissiers.pdf'   },
  { id: 'sales-by-category', label: 'Ventes / Catégorie',  pdfPath: '/reports/sales-by-category', pdfName: 'rapport-ventes-categories.pdf'  },
  { id: 'payment-methods',   label: 'Modes de paiement',   pdfPath: '',                           pdfName: ''                               },
  { id: 'stock-valuation',   label: 'Valorisation stock',  pdfPath: '/reports/stock-valuation',   pdfName: 'rapport-stock.pdf'              },
  { id: 'supplier-balances', label: 'Soldes fournisseurs', pdfPath: '/reports/supplier-balances', pdfName: 'rapport-soldes-fournisseurs.pdf'},
  { id: 'client-credit',     label: 'Crédit clients',      pdfPath: '/reports/client-credit',     pdfName: 'rapport-credit-clients.pdf'     },
]

const METHOD_LABELS: Record<string, string> = {
  cash: 'Espèces', card: 'Carte', mobile_money: 'Mobile Money',
  bank_transfer: 'Virement', check: 'Chèque', credit: 'Crédit', other: 'Autre',
}

export default function ReportsPage() {
  const { activeStore } = useActiveStoreStore()
  const { user } = useAuthStore()
  const storeId = activeStore?.id ?? user?.store_id

  const [tab, setTab] = useState<ReportTab>('sales-by-product')
  const [dateFrom, setDateFrom] = useState(new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10))
  const [dateTo, setDateTo]     = useState(new Date().toISOString().slice(0, 10))
  const [pdfLoading, setPdfLoading] = useState(false)

  const params = { date_from: dateFrom, date_to: dateTo, ...(storeId ? { store_id: String(storeId) } : {}) }

  const { data: salesByProduct } = useQuery({
    queryKey: ['report-sales-product', dateFrom, dateTo, storeId],
    queryFn: () => api.get('/reports/sales-by-product', { params }).then(r => r.data.data ?? []),
    enabled: tab === 'sales-by-product',
  })

  const { data: salesByCashier } = useQuery({
    queryKey: ['report-sales-cashier', dateFrom, dateTo, storeId],
    queryFn: () => api.get('/reports/sales-by-cashier', { params }).then(r => r.data.data ?? []),
    enabled: tab === 'sales-by-cashier',
  })

  const { data: salesByCategory } = useQuery({
    queryKey: ['report-sales-category', dateFrom, dateTo, storeId],
    queryFn: () => api.get('/reports/sales-by-category', { params }).then(r => r.data.data ?? []),
    enabled: tab === 'sales-by-category',
  })

  const { data: paymentMethods } = useQuery({
    queryKey: ['report-payments', dateFrom, dateTo, storeId],
    queryFn: () => api.get('/reports/payment-methods', { params }).then(r => r.data.data ?? []),
    enabled: tab === 'payment-methods',
  })

  const { data: stockValuation } = useQuery({
    queryKey: ['report-stock', storeId],
    queryFn: () => api.get('/reports/stock-valuation', { params: storeId ? { store_id: String(storeId) } : {} }).then(r => r.data),
    enabled: tab === 'stock-valuation',
  })

  const { data: supplierBalances } = useQuery({
    queryKey: ['report-suppliers', storeId],
    queryFn: () => api.get('/reports/supplier-balances', { params: storeId ? { store_id: String(storeId) } : {} }).then(r => r.data.data ?? []),
    enabled: tab === 'supplier-balances',
  })

  const { data: clientCredit } = useQuery({
    queryKey: ['report-clients', storeId],
    queryFn: () => api.get('/reports/client-credit', { params: storeId ? { store_id: String(storeId) } : {} }).then(r => r.data.data ?? []),
    enabled: tab === 'client-credit',
  })

  const currentTab = TABS.find(t => t.id === tab)!

  const handlePdf = async () => {
    if (!currentTab.pdfPath) return
    setPdfLoading(true)
    try {
      const pdfParams: Record<string, string> = { date_from: dateFrom, date_to: dateTo }
      if (storeId) pdfParams.store_id = String(storeId)
      await downloadPdf(`/pdf${currentTab.pdfPath}`, currentTab.pdfName, pdfParams)
    } catch {
      toast.error('Erreur lors de la génération du PDF')
    } finally {
      setPdfLoading(false)
    }
  }

  const needsDates = ['sales-by-product', 'sales-by-cashier', 'sales-by-category', 'payment-methods'].includes(tab)

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <BarChart3 size={24} /> Rapports & Statistiques
        </h1>
        {currentTab.pdfPath && (
          <button
            onClick={handlePdf}
            disabled={pdfLoading}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary-600 disabled:opacity-50 transition-colors"
          >
            {pdfLoading
              ? <><Loader2 size={15} className="animate-spin" /> Génération...</>
              : <><FileDown size={15} /> Télécharger PDF</>
            }
          </button>
        )}
      </div>

      {/* Date filter */}
      {needsDates && (
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
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 border-b">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-3 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === t.id ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Ventes par produit ──────────────────────────────────────────────── */}
      {tab === 'sales-by-product' && (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['Code', 'Produit', 'Qté vendue', 'CA TTC', 'Marge'].map(h => (
                  <th key={h} className={`px-4 py-3 font-medium text-gray-600 ${['Code','Produit'].includes(h) ? 'text-left' : 'text-right'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {(salesByProduct ?? []).map((r: any, i: number) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-xs text-gray-400 font-mono">{r.internal_code ?? '—'}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{r.name}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{formatNumber(r.total_qty, 0)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-primary">{formatCurrency(r.total_ttc)}</td>
                  <td className="px-4 py-3 text-right text-green-600">{formatCurrency(r.total_margin)}</td>
                </tr>
              ))}
              {!(salesByProduct ?? []).length && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">Aucune donnée pour la période</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Ventes par caissier ─────────────────────────────────────────────── */}
      {tab === 'sales-by-cashier' && (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['Caissier', 'Nb ventes', 'CA TTC', 'Panier moyen'].map(h => (
                  <th key={h} className={`px-4 py-3 font-medium text-gray-600 ${h === 'Caissier' ? 'text-left' : 'text-right'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {(salesByCashier ?? []).map((r: any, i: number) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{r.name}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{formatNumber(r.nb_sales, 0)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-primary">{formatCurrency(r.total_ttc)}</td>
                  <td className="px-4 py-3 text-right text-gray-500">{formatCurrency(r.avg_basket)}</td>
                </tr>
              ))}
              {!(salesByCashier ?? []).length && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">Aucune donnée pour la période</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Ventes par catégorie ────────────────────────────────────────────── */}
      {tab === 'sales-by-category' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="card">
            <h3 className="font-semibold text-gray-900 mb-4">Répartition par catégorie</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={salesByCategory ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="category_name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v) => [formatCurrency(v as number), 'CA TTC']} />
                <Bar dataKey="total_ttc" fill="var(--color-primary, #ff7631)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="card p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Catégorie</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Qté</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">CA TTC</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {(salesByCategory ?? []).map((r: any, i: number) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{r.category_name}</td>
                    <td className="px-4 py-3 text-right text-gray-500">{formatNumber(r.total_qty, 0)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-primary">{formatCurrency(r.total_ttc)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Modes de paiement ───────────────────────────────────────────────── */}
      {tab === 'payment-methods' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="card">
            <h3 className="font-semibold text-gray-900 mb-4">Répartition des paiements</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={paymentMethods ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="method" tickFormatter={m => METHOD_LABELS[m] ?? m} tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v) => [formatCurrency(v as number), 'Montant']} labelFormatter={m => METHOD_LABELS[m] ?? m} />
                <Bar dataKey="total" fill="var(--color-primary, #ff7631)" radius={[4, 4, 0, 0]} />
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
                {(paymentMethods ?? []).map((r: any, i: number) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{METHOD_LABELS[r.method] ?? r.method}</td>
                    <td className="px-4 py-3 text-right text-gray-500">{formatNumber(r.nb_transactions, 0)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-primary">{formatCurrency(r.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Valorisation stock ──────────────────────────────────────────────── */}
      {tab === 'stock-valuation' && (
        <div className="space-y-3">
          {stockValuation?.total_value !== undefined && (
            <div className="card p-4 bg-primary/5 border-primary/20">
              <span className="text-sm text-gray-600">Valeur totale du stock :</span>
              <span className="ml-2 font-bold text-primary text-lg">{formatCurrency(stockValuation.total_value)}</span>
            </div>
          )}
          <div className="card p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  {['Code', 'Produit', 'Catégorie', 'Stock', 'Coût moy.', 'Valeur'].map(h => (
                    <th key={h} className={`px-4 py-3 font-medium text-gray-600 ${['Code','Produit','Catégorie'].includes(h) ? 'text-left' : 'text-right'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {(stockValuation?.data ?? []).map((r: any, i: number) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-xs text-gray-400 font-mono">{r.internal_code ?? '—'}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{r.name}</td>
                    <td className="px-4 py-3 text-gray-500">{r.category_name}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{formatNumber(r.qty_on_hand, 2)}</td>
                    <td className="px-4 py-3 text-right text-gray-500">{formatCurrency(r.avg_cost)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-primary">{formatCurrency(r.total_value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Soldes fournisseurs ─────────────────────────────────────────────── */}
      {tab === 'supplier-balances' && (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Fournisseur</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Téléphone</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Solde dû</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {(supplierBalances ?? []).map((r: any, i: number) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{r.company_name}</td>
                  <td className="px-4 py-3 text-gray-500">{r.phone ?? '—'}</td>
                  <td className="px-4 py-3 text-right font-semibold text-red-600">{formatCurrency(r.total_balance)}</td>
                </tr>
              ))}
              {!(supplierBalances ?? []).length && (
                <tr><td colSpan={3} className="px-4 py-8 text-center text-gray-400">Aucun solde fournisseur</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Crédit clients ──────────────────────────────────────────────────── */}
      {tab === 'client-credit' && (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Client</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Téléphone</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Crédit</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Limite</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Points fidél.</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {(clientCredit ?? []).map((r: any, i: number) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{r.name}</td>
                  <td className="px-4 py-3 text-gray-500">{r.phone ?? '—'}</td>
                  <td className="px-4 py-3 text-right font-semibold text-orange-600">{formatCurrency(r.credit_balance)}</td>
                  <td className="px-4 py-3 text-right text-gray-500">{r.credit_limit ? formatCurrency(r.credit_limit) : '—'}</td>
                  <td className="px-4 py-3 text-right text-blue-600">{formatNumber(r.loyalty_points, 0)} pts</td>
                </tr>
              ))}
              {!(clientCredit ?? []).length && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">Aucun crédit client</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
