import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { v4 as uuidv4 } from 'uuid'
import QRCode from 'react-qr-code'
import api from '../../lib/api'
import { usePosStore, type CartItem } from '../../store/pos.store'
import { useAuthStore } from '../../store/auth.store'
import { db, findProductByBarcode, searchProductsOffline, savePendingSale, cacheProducts, type CachedProduct } from '../../lib/offline-db'
import { formatCurrency, formatNumber, imageUrl, openPdf } from '../../lib/format'
import toast from 'react-hot-toast'
import {
  Search, Scan, Trash2, Plus, Minus, Percent, CreditCard, Banknote,
  Smartphone, ShoppingBag, PauseCircle, PlayCircle, UserPlus, X, Check,
  Wifi, WifiOff, Receipt, ChevronRight, Lock, Unlock, ArrowLeft,
  DollarSign, Tag, Users, Printer, Clock, Ban, RotateCcw, Edit2, Eye,
  History, TrendingUp, Calendar, User, AlertTriangle, CheckCircle2, Loader2,
  FileText,
} from 'lucide-react'
import PaymentPanel, { type PaymentEntry } from '../../components/PaymentPanel'
import { useThermalPrinter } from '../../hooks/useThermalPrinter'
import { useConfirm } from '../../hooks/useConfirm'

// ─── Types ────────────────────────────────────────────────────────────────────

interface PosItem {
  id: number
  name: string
  short_name?: string
  sale_price_ttc: number
  vat_rate: number
  is_weight_based: boolean
  stock_qty: number
  category_name?: string
  image?: string | null
  source: 'product' | 'restaurant_item'
}

function getPosPrice(p: { sale_price_ttc: number; price_tiers?: { price: number; clientCategory?: { is_pos_default: boolean } }[] }): number {
  const defaultTier = p.price_tiers?.find(t => t.clientCategory?.is_pos_default)
  return defaultTier?.price ?? p.sale_price_ttc
}


const COURSES = [
  { value: 'starter', label: 'Entrées' },
  { value: 'main',    label: 'Plats' },
  { value: 'dessert', label: 'Desserts' },
  { value: 'drink',   label: 'Boissons' },
  { value: 'other',   label: 'Autres' },
]

interface CashSession {
  id: number
  opening_balance: number
  opened_at: string
  status: string
  user?: { name: string }
}

interface Client {
  id: number
  name: string
  phone?: string
  credit_balance?: number
  account_balance?: number
}

interface Category {
  id: number
  name: string
  type?: string
}

// ─── Receipt types ────────────────────────────────────────────────────────────

interface SaleStore {
  name: string; address?: string; phone?: string; ninea?: string; receipt_footer?: string
}
interface SaleUser   { id: number; name: string }
interface SaleClientDetail { id: number; name: string; phone?: string }
interface SaleItemDetail {
  product?: { name: string; short_name?: string } | null
  restaurantItem?: { name: string } | null
  qty: number; unit_price_ttc: number; discount_pct: number
  discount_amount: number; total_ttc: number; total_ht: number
}
interface SalePaymentDetail  { payment_method: string; amount: number }
interface SaleTicketDetail   { number: string; qr_code: string }

interface SaleReceipt {
  id: number; reference: string
  total_ttc: number; subtotal_ht: number; vat_amount: number
  discount_amount: number; paid_amount: number; change_amount: number
  loyalty_points_earned: number; created_at: string
  items: SaleItemDetail[]
  payments: SalePaymentDetail[]
  ticket?: SaleTicketDetail
  client?: SaleClientDetail
  user?: SaleUser
  store?: SaleStore
}

// ─── Open Session Modal ───────────────────────────────────────────────────────

function OpenSessionModal({ onOpened }: { onOpened: (session: CashSession) => void }) {
  const [amount, setAmount] = useState('0')

  const mutation = useMutation({
    mutationFn: () => api.post('/cash-sessions/open', { opening_balance: Number(amount) }),
    onSuccess: (res) => onOpened(res.data),
    onError: () => toast.error('Impossible d\'ouvrir la session'),
  })

  return (
    <div className="fixed inset-0 bg-gray-900 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="p-8 text-center space-y-6">
          <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto">
            <Lock size={28} className="text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Ouvrir la caisse</h2>
            <p className="text-gray-500 text-sm mt-1">Saisissez le fond de caisse de départ</p>
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700 text-left">Montant initial (FCFA)</label>
            <input
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className="input text-center text-2xl font-bold"
              min={0}
              step={1000}
              autoFocus
            />
          </div>
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="w-full py-4 bg-primary hover:bg-primary-600 text-white font-bold rounded-xl text-lg transition-colors flex items-center justify-center gap-2">
            <Unlock size={20} />
            {mutation.isPending ? 'Ouverture...' : 'Ouvrir la caisse'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Sessions History Modal ───────────────────────────────────────────────────

interface CashSessionRow {
  id: number
  status: 'open' | 'closed'
  opening_balance: number
  closing_balance_expected?: number
  closing_balance_actual?: number
  closing_balance_variance?: number
  opened_at: string
  closed_at?: string
  user?: { id: number; name: string }
  closedByUser?: { id: number; name: string }
  sales_count: number
  total_sales: number
}

interface CashSessionDetail {
  session: CashSessionRow
  sales: Array<{ id: number; reference: string; total_ttc: number; paid_amount: number; created_at: string; channel: string }>
  payment_breakdown: Record<string, number>
  movements: Array<{ id: number; type: string; amount: number; motive: string; created_at: string }>
  stats: { total_sales: number; total_ttc: number; cash_expected: number; cash_actual: number; cash_variance: number }
}

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Espèces', card: 'Carte', wave: 'Wave', orange_money: 'Orange Money',
  free_money: 'Free Money', credit: 'Crédit client', account: 'Compte client',
  account_deposit: 'Dépôt compte', check: 'Chèque', voucher: 'Bon d\'achat',
  loyalty_points: 'Points fidélité',
}

const CHANNEL_LABELS: Record<string, string> = {
  pos: 'Caisse', takeaway: 'Emporter', delivery: 'Livraison', online: 'En ligne',
}

function SessionsHistoryModal({ onClose }: { onClose: () => void }) {
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [detailTab, setDetailTab] = useState<'sales' | 'payments' | 'movements'>('sales')

  const { data: sessionsData, isLoading } = useQuery({
    queryKey: ['cash-sessions-history'],
    queryFn: () => api.get('/cash-sessions').then(r => r.data),
    staleTime: 30_000,
  })

  const { data: detail, isLoading: loadingDetail } = useQuery<CashSessionDetail>({
    queryKey: ['cash-session-detail', selectedId],
    queryFn: () => api.get(`/cash-sessions/${selectedId}`).then(r => r.data),
    enabled: !!selectedId,
    staleTime: 30_000,
  })

  const sessions: CashSessionRow[] = sessionsData?.data ?? []

  const formatDuration = (opened: string, closed?: string) => {
    const start = new Date(opened)
    const end = closed ? new Date(closed) : new Date()
    const diff = Math.floor((end.getTime() - start.getTime()) / 60000)
    if (diff < 60) return `${diff} min`
    return `${Math.floor(diff / 60)}h${String(diff % 60).padStart(2, '0')}`
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-4xl shadow-2xl flex flex-col" style={{ maxHeight: '92vh' }}>

        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b bg-gray-50 flex-shrink-0">
          {selectedId && (
            <button onClick={() => { setSelectedId(null); setDetailTab('sales') }}
              className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-500">
              <ArrowLeft size={15} />
            </button>
          )}
          <History size={18} className="text-primary" />
          <h2 className="font-bold text-gray-900 flex-1">
            {selectedId && detail ? `Session du ${new Date(detail.session.opened_at).toLocaleDateString('fr-FR')}` : 'Historique des sessions'}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-400">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">

          {/* ── Session list ── */}
          {!selectedId && (
            isLoading ? (
              <div className="flex items-center justify-center h-48">
                <Loader2 size={24} className="animate-spin text-primary" />
              </div>
            ) : sessions.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-gray-400">
                <History size={40} className="mb-3" />
                <p>Aucune session enregistrée</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      <th className="text-left px-4 py-3">Caissier</th>
                      <th className="text-left px-4 py-3">Ouverture</th>
                      <th className="text-left px-4 py-3">Durée</th>
                      <th className="text-right px-4 py-3">Fond caisse</th>
                      <th className="text-right px-4 py-3">Ventes</th>
                      <th className="text-right px-4 py-3">CA total</th>
                      <th className="text-right px-4 py-3">Écart caisse</th>
                      <th className="text-center px-4 py-3">Statut</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {sessions.map((s: CashSessionRow) => (
                      <tr key={s.id} className="hover:bg-primary-50/30 transition-colors group">
                        <td className="px-4 py-3">
                          <p className="font-semibold text-gray-900">{s.user?.name ?? '—'}</p>
                          {s.status === 'closed' && s.closedByUser && s.closedByUser.id !== s.user?.id && (
                            <p className="text-xs text-gray-400">Clôturé par {s.closedByUser.name}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs">
                          {new Date(s.opened_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500">
                          {formatDuration(s.opened_at, s.closed_at)}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-700 font-mono text-xs">
                          {formatCurrency(s.opening_balance)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="font-semibold text-gray-900">{s.sales_count}</span>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-emerald-600">
                          {formatCurrency(s.total_sales)}
                        </td>
                        <td className="px-4 py-3 text-right text-xs font-semibold">
                          {s.closing_balance_variance != null ? (
                            <span className={Math.abs(s.closing_balance_variance) > 0 ? 'text-red-600' : 'text-emerald-600'}>
                              {s.closing_balance_variance >= 0 ? '+' : ''}{formatCurrency(s.closing_balance_variance)}
                            </span>
                          ) : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {s.status === 'open' ? (
                            <span className="badge-success text-xs">En cours</span>
                          ) : (
                            <span className="badge-gray text-xs">Clôturée</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button onClick={() => setSelectedId(s.id)}
                            className="text-xs text-primary font-semibold hover:underline opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 ml-auto">
                            Détails <ChevronRight size={12} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}

          {/* ── Session detail ── */}
          {selectedId && (
            loadingDetail ? (
              <div className="flex items-center justify-center h-48">
                <Loader2 size={24} className="animate-spin text-primary" />
              </div>
            ) : detail ? (
              <div className="p-5 space-y-5">

                {/* Stats cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-gray-50 rounded-xl p-3 text-center">
                    <p className="text-xs text-gray-400 uppercase tracking-wide">Fond initial</p>
                    <p className="text-lg font-bold text-gray-900 mt-0.5">{formatCurrency(detail.session.opening_balance)}</p>
                  </div>
                  <div className="bg-emerald-50 rounded-xl p-3 text-center">
                    <p className="text-xs text-emerald-600 uppercase tracking-wide">CA total</p>
                    <p className="text-lg font-bold text-emerald-700 mt-0.5">{formatCurrency(detail.stats.total_ttc)}</p>
                    <p className="text-xs text-emerald-500">{detail.stats.total_sales} vente(s)</p>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-3 text-center">
                    <p className="text-xs text-gray-400 uppercase tracking-wide">Espèces attendues</p>
                    <p className="text-lg font-bold text-gray-900 mt-0.5">{formatCurrency(detail.stats.cash_expected)}</p>
                  </div>
                  <div className={`rounded-xl p-3 text-center ${Math.abs(detail.stats.cash_variance) > 0 ? 'bg-red-50' : 'bg-emerald-50'}`}>
                    <p className={`text-xs uppercase tracking-wide ${Math.abs(detail.stats.cash_variance) > 0 ? 'text-red-600' : 'text-emerald-600'}`}>Écart caisse</p>
                    <p className={`text-lg font-bold mt-0.5 ${Math.abs(detail.stats.cash_variance) > 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                      {detail.stats.cash_variance >= 0 ? '+' : ''}{formatCurrency(detail.stats.cash_variance)}
                    </p>
                  </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
                  {(['sales', 'payments', 'movements'] as const).map(tab => (
                    <button key={tab} onClick={() => setDetailTab(tab)}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${detailTab === tab ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
                      {tab === 'sales' ? `Ventes (${detail.sales.length})` : tab === 'payments' ? 'Paiements' : `Mouvements (${detail.movements.length})`}
                    </button>
                  ))}
                </div>

                {/* Sales tab */}
                {detailTab === 'sales' && (
                  detail.sales.length === 0 ? (
                    <div className="py-10 text-center text-sm text-gray-400">Aucune vente dans cette session</div>
                  ) : (
                    <div className="border rounded-xl overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-50 border-b text-xs font-semibold text-gray-500 uppercase">
                            <th className="text-left px-4 py-2.5">Référence</th>
                            <th className="text-left px-4 py-2.5">Canal</th>
                            <th className="text-left px-4 py-2.5">Heure</th>
                            <th className="text-right px-4 py-2.5">Montant TTC</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {detail.sales.map(sale => (
                            <tr key={sale.id} className="hover:bg-gray-50 transition-colors">
                              <td className="px-4 py-2.5 font-mono text-xs font-semibold text-primary-600">{sale.reference}</td>
                              <td className="px-4 py-2.5 text-xs text-gray-500">{CHANNEL_LABELS[sale.channel] ?? sale.channel}</td>
                              <td className="px-4 py-2.5 text-xs text-gray-400">
                                {new Date(sale.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                              </td>
                              <td className="px-4 py-2.5 text-right font-semibold text-gray-900">{formatCurrency(sale.total_ttc)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="bg-gray-50 border-t text-xs font-bold">
                            <td colSpan={3} className="px-4 py-2.5 text-gray-600">Total</td>
                            <td className="px-4 py-2.5 text-right text-emerald-700">{formatCurrency(detail.stats.total_ttc)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )
                )}

                {/* Payments tab */}
                {detailTab === 'payments' && (
                  Object.keys(detail.payment_breakdown).length === 0 ? (
                    <div className="py-10 text-center text-sm text-gray-400">Aucun paiement enregistré</div>
                  ) : (
                    <div className="border rounded-xl overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-50 border-b text-xs font-semibold text-gray-500 uppercase">
                            <th className="text-left px-4 py-2.5">Mode de paiement</th>
                            <th className="text-right px-4 py-2.5">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {Object.entries(detail.payment_breakdown).map(([method, total]) => (
                            <tr key={method} className="hover:bg-gray-50">
                              <td className="px-4 py-3 font-medium text-gray-800">
                                {PAYMENT_LABELS[method] ?? method}
                              </td>
                              <td className="px-4 py-3 text-right font-bold text-gray-900">{formatCurrency(total as number)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="bg-gray-50 border-t text-xs font-bold">
                            <td className="px-4 py-2.5 text-gray-600">Total encaissé</td>
                            <td className="px-4 py-2.5 text-right text-emerald-700">
                              {formatCurrency(Object.values(detail.payment_breakdown).reduce((s, v) => s + (v as number), 0))}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )
                )}

                {/* Movements tab */}
                {detailTab === 'movements' && (
                  detail.movements.length === 0 ? (
                    <div className="py-10 text-center text-sm text-gray-400">Aucun mouvement de caisse</div>
                  ) : (
                    <div className="border rounded-xl overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-50 border-b text-xs font-semibold text-gray-500 uppercase">
                            <th className="text-left px-4 py-2.5">Type</th>
                            <th className="text-left px-4 py-2.5">Motif</th>
                            <th className="text-left px-4 py-2.5">Heure</th>
                            <th className="text-right px-4 py-2.5">Montant</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {detail.movements.map(m => (
                            <tr key={m.id} className="hover:bg-gray-50">
                              <td className="px-4 py-2.5">
                                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                                  m.type === 'deposit' ? 'bg-emerald-100 text-emerald-700' :
                                  m.type === 'withdrawal' ? 'bg-amber-100 text-amber-700' :
                                  'bg-red-100 text-red-700'
                                }`}>
                                  {m.type === 'deposit' ? 'Dépôt' : m.type === 'withdrawal' ? 'Retrait' : 'Dépense'}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 text-gray-700 text-sm">{m.motive}</td>
                              <td className="px-4 py-2.5 text-xs text-gray-400">
                                {new Date(m.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                              </td>
                              <td className={`px-4 py-2.5 text-right font-semibold ${m.type === 'deposit' ? 'text-emerald-600' : 'text-red-600'}`}>
                                {m.type === 'deposit' ? '+' : '−'}{formatCurrency(m.amount)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )
                )}
              </div>
            ) : null
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Close Session Modal ──────────────────────────────────────────────────────

function CloseSessionModal({ session, onClose }: { session: CashSession; onClose: () => void }) {
  const [amount, setAmount] = useState('')
  const [report, setReport] = useState<Record<string, unknown> | null>(null)
  const { setCashSession } = usePosStore()

  const mutation = useMutation({
    mutationFn: () => api.post(`/cash-sessions/${session.id}/close`, {
      closing_balance_actual: Number(amount),
    }),
    onSuccess: (res) => {
      setReport(res.data)
      setCashSession(null)
      toast.success('Session clôturée avec succès')
    },
    onError: (err: any) => toast.error(err?.response?.data?.message ?? 'Erreur lors de la clôture'),
  })

  const zr = report ? (report.z_report as {
    transaction_count: number
    total_ttc: number
    total_discounts: number
    cash_expected: number
    cash_actual: number
    cash_variance: number
    payment_breakdown: Record<string, number>
  }) : null

  if (report && zr) {
    return (
      <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
          <div className="p-6 border-b">
            <h2 className="text-xl font-bold">Rapport Z — Clôture</h2>
          </div>
          <div className="p-6 space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">Transactions</span><span className="font-bold">{zr.transaction_count}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">CA Total TTC</span><span className="font-bold text-green-600">{formatCurrency(zr.total_ttc)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Remises accordées</span><span className="text-amber-600">{formatCurrency(zr.total_discounts)}</span></div>
            <hr />
            <p className="font-semibold text-gray-700">Ventilation paiements</p>
            {Object.entries(zr.payment_breakdown ?? {}).map(([m, t]) => {
              const label = ({ cash: 'Espèces', wave: 'Wave', orange_money: 'Orange Money', free_money: 'Free Money', card: 'Carte', credit: 'Crédit client', account: 'Compte client', account_deposit: 'Dépôt compte' } as Record<string, string>)[m] ?? m
              return <div key={m} className="flex justify-between"><span className="text-gray-500">{label}</span><span>{formatCurrency(t as number)}</span></div>
            })}
            <hr />
            <div className="flex justify-between"><span className="text-gray-500">Espèces attendues</span><span>{formatCurrency(zr.cash_expected)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Espèces comptées</span><span>{formatCurrency(zr.cash_actual)}</span></div>
            <div className={`flex justify-between font-semibold ${Math.abs(zr.cash_variance) > 0 ? 'text-red-600' : 'text-green-600'}`}>
              <span>Écart</span><span>{zr.cash_variance >= 0 ? '+' : ''}{formatCurrency(zr.cash_variance)}</span>
            </div>
          </div>
          <div className="p-6 border-t">
            <button onClick={onClose} className="w-full btn-primary py-3">Fermer</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="p-6 border-b flex items-center justify-between">
          <h2 className="text-xl font-bold">Clôturer la caisse</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="bg-gray-50 rounded-xl p-4 text-sm space-y-1">
            <div className="flex justify-between"><span className="text-gray-500">Ouverture</span><span>{formatCurrency(session.opening_balance)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Ouvert par</span><span>{session.user?.name ?? '—'}</span></div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Espèces comptées (FCFA)</label>
            <input
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className="input text-center text-xl font-bold"
              min={0}
              autoFocus
            />
          </div>
        </div>
        <div className="p-6 border-t flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1">Annuler</button>
          <button
            onClick={() => mutation.mutate()}
            disabled={!amount || mutation.isPending}
            className="btn-primary flex-1 disabled:opacity-50">
            {mutation.isPending ? 'Clôture...' : 'Clôturer'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Client Search Modal ──────────────────────────────────────────────────────

function ClientSearchModal({ onSelect, onClose }: {
  onSelect: (client: Client) => void
  onClose: () => void
}) {
  const [q, setQ]             = useState('')
  const [results, setResults]   = useState<Client[]>([])
  const [loading, setLoading]   = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName]   = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (q.length < 1) { setResults([]); setLoading(false); return }
    setLoading(true)
    const t = setTimeout(() => {
      api.get('/clients/search', { params: { q } })
        .then(r => {
          const data = Array.isArray(r.data) ? r.data : (r.data?.data ?? [])
          setResults(data)
        })
        .catch(() => setResults([]))
        .finally(() => setLoading(false))
    }, 250)
    return () => clearTimeout(t)
  }, [q])

  const handleCreate = async () => {
    if (!newName.trim()) return
    setCreating(true)
    try {
      const res = await api.post('/clients', { name: newName.trim(), phone: newPhone.trim() || undefined })
      const created: Client = res.data
      onSelect(created)
    } catch {
      toast.error('Impossible de créer le client')
    } finally {
      setCreating(false)
    }
  }

  if (showCreate) {
    return (
      <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
          <div className="p-5 border-b flex items-center justify-between">
            <h2 className="text-base font-bold flex items-center gap-2 text-gray-800">
              <UserPlus size={17} className="text-primary" /> Nouveau client
            </h2>
            <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
          </div>
          <div className="p-5 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">
                Nom <span className="text-red-500">*</span>
              </label>
              <input
                autoFocus
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
                placeholder="Nom du client"
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Téléphone</label>
              <input
                value={newPhone}
                onChange={e => setNewPhone(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
                placeholder="Numéro de téléphone (optionnel)"
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>
          <div className="p-4 border-t flex gap-2">
            <button onClick={() => setShowCreate(false)}
              className="flex-1 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-colors">
              Retour
            </button>
            <button
              onClick={handleCreate}
              disabled={!newName.trim() || creating}
              className="flex-1 py-2 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary-600 disabled:opacity-40 transition-colors">
              {creating ? 'Création...' : 'Créer et sélectionner'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        <div className="p-5 border-b flex items-center justify-between">
          <h2 className="text-base font-bold flex items-center gap-2 text-gray-800">
            <Users size={17} className="text-primary" /> Rechercher un client
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={15} />
            <input
              autoFocus
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Nom ou numéro de téléphone…"
              className="w-full border border-gray-200 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            {loading && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            )}
          </div>
        </div>
        <div className="max-h-64 overflow-y-auto divide-y">
          {q.length >= 1 && !loading && results.length === 0 && (
            <div className="px-4 py-6 text-center">
              <p className="text-gray-400 text-sm mb-3">Aucun client trouvé pour «{q}»</p>
              <button
                onClick={() => { setNewName(q); setShowCreate(true) }}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-xl text-xs font-semibold hover:bg-primary-600 transition-colors"
              >
                <UserPlus size={13} /> Créer «{q}» comme nouveau client
              </button>
            </div>
          )}
          {q.length < 2 && (
            <p className="px-4 py-4 text-center text-gray-400 text-xs">Saisissez au moins 2 caractères</p>
          )}
          {results.map(c => (
            <button key={c.id} onClick={() => onSelect(c)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-primary-50 text-left transition-colors">
              <div>
                <p className="text-sm font-semibold text-gray-900">{c.name}</p>
                {c.phone && <p className="text-xs text-gray-400">{c.phone}</p>}
              </div>
              <div className="flex flex-col items-end gap-1">
                {c.credit_balance != null && c.credit_balance > 0 && (
                  <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                    Doit : {formatCurrency(c.credit_balance)}
                  </span>
                )}
                {c.account_balance != null && (
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                    (c.account_balance ?? 0) >= 0
                      ? 'text-indigo-700 bg-indigo-50 border-indigo-200'
                      : 'text-red-600 bg-red-50 border-red-200'
                  }`}>
                    Compte : {(c.account_balance ?? 0) >= 0 ? '+' : ''}{formatCurrency(c.account_balance ?? 0)}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
        <div className="p-4 border-t flex gap-2">
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-4 py-2 border border-primary text-primary rounded-xl text-xs font-semibold hover:bg-primary-50 transition-colors">
            <UserPlus size={13} /> Nouveau client
          </button>
          <button onClick={onClose}
            className="flex-1 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-colors">
            Continuer sans client
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── On-hold carts panel ──────────────────────────────────────────────────────

function HoldCartsModal({ carts, onRecall, onClose }: {
  carts: { id: string; items: CartItem[]; client_id: number | null; held_at: string }[]
  onRecall: (id: string) => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        <div className="p-6 border-b flex items-center justify-between">
          <h2 className="text-lg font-bold flex items-center gap-2"><PauseCircle size={18} /> Ventes en attente</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <div className="divide-y max-h-96 overflow-y-auto">
          {carts.length === 0 && <p className="px-4 py-6 text-center text-gray-400 text-sm">Aucune vente en attente</p>}
          {carts.map(c => {
            const total = c.items.reduce((s, i) => s + i.total_ttc, 0)
            const heldAt = new Date(c.held_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
            return (
              <button key={c.id} onClick={() => { onRecall(c.id); onClose() }}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-primary-50 text-left">
                <div>
                  <p className="text-sm font-mono font-bold text-gray-700"># {c.id}</p>
                  <p className="text-xs text-gray-400">{c.items.length} article{c.items.length > 1 ? 's' : ''} · Mis en attente à {heldAt}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-primary">{formatCurrency(total)}</p>
                  <div className="flex items-center gap-1 text-xs text-primary justify-end">
                    <PlayCircle size={12} /> Reprendre
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Payment Modal ────────────────────────────────────────────────────────────

function PaymentModal({ total, cartDiscountAmount = 0, clientAccountBalance, clientName, clientId, onClose, onConfirm, processing, onNeedClient, initialPayments, onNeedClientForDeposit }: {
  total: number
  cartDiscountAmount?: number
  clientAccountBalance?: number
  clientName?: string
  clientId?: number | null
  onClose: () => void
  onConfirm: (payments: { payment_method: string; amount: number }[]) => void
  processing: boolean
  onNeedClient?: () => void
  initialPayments?: PaymentEntry[]
  onNeedClientForDeposit?: (payments: PaymentEntry[]) => void
}) {
  const [payments, setPayments] = useState<PaymentEntry[]>(
    initialPayments ?? [{ method: 'cash', amount: 0 }]
  )

  const hasClient  = clientAccountBalance !== undefined
  const hasCredit  = payments.some(p => p.method === 'credit')
  const totalPaid  = payments
    .filter(p => p.method !== 'account_deposit')
    .reduce((s, p) => s + (p.amount || 0), 0)
  const ready = (totalPaid >= total || hasCredit) && !(hasCredit && !hasClient)

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-lg shadow-2xl overflow-hidden">

        {/* Header with gradient */}
        <div className="bg-gradient-to-br from-gray-900 to-gray-800 px-6 py-5 flex items-center justify-between">
          <div>
            <p className="text-gray-400 text-xs font-medium uppercase tracking-widest mb-1">Encaissement</p>
            <p className="text-white text-3xl font-bold font-mono">{formatCurrency(total)}</p>
            {cartDiscountAmount > 0 && (
              <p className="text-orange-300 text-xs mt-0.5 flex items-center gap-1">
                <Tag size={10} /> Remise globale : -{formatCurrency(cartDiscountAmount)}
              </p>
            )}
            {clientName ? (
              <p className="text-indigo-300 text-xs mt-1 flex items-center gap-1">
                <UserPlus size={10} /> {clientName}
                {clientAccountBalance !== undefined && clientAccountBalance !== 0 && (
                  <span className={`ml-1 ${clientAccountBalance > 0 ? 'text-teal-300' : 'text-amber-300'}`}>
                    (compte : {clientAccountBalance > 0 ? '+' : ''}{formatCurrency(clientAccountBalance)})
                  </span>
                )}
              </p>
            ) : (
              <button
                type="button"
                onClick={onNeedClient}
                className="text-gray-400 hover:text-white text-xs mt-1 flex items-center gap-1 transition-colors underline underline-offset-2"
              >
                <UserPlus size={10} /> Associer un client
              </button>
            )}
          </div>
          <button onClick={onClose}
            className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 max-h-[60vh] overflow-y-auto">
          <PaymentPanel
            total={total}
            clientAccountBalance={clientAccountBalance}
            clientName={clientName}
            value={payments}
            onChange={setPayments}
            compact={false}
            onCreditWithoutClient={onNeedClient}
            onDepositWithoutClient={onNeedClientForDeposit ? () => onNeedClientForDeposit(payments) : undefined}
          />
        </div>

        <div className="p-4 border-t bg-gray-50 flex gap-3">
          <button onClick={onClose}
            className="flex-1 py-3 rounded-2xl border-2 border-gray-200 text-gray-600 text-sm font-semibold hover:bg-gray-100 transition-colors">
            Annuler
          </button>
          <button
            onClick={() => onConfirm(payments.map(p => ({
              payment_method: p.method,
              amount: p.method === 'credit'
                ? total - payments.filter(x => x.method !== 'credit' && x.method !== 'account_deposit').reduce((s, x) => s + x.amount, 0)
                : p.amount,
            })))}
            disabled={!ready || processing}
            className="flex-1 py-3 rounded-2xl bg-gradient-to-r from-primary to-blue-600 text-white text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-40 flex items-center justify-center gap-2 shadow-lg shadow-primary/20">
            <Check size={18} />
            {processing ? 'Traitement...' : 'Valider la vente'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Receipt Modal ────────────────────────────────────────────────────────────

const PAY_LABELS: Record<string, string> = {
  cash: 'Espèces', wave: 'Wave', orange_money: 'Orange Money',
  free_money: 'Free Money', card: 'Carte', credit: 'Crédit client',
  voucher: 'Bon', loyalty_points: 'Points fidélité',
}

function ReceiptModal({ sale, onNewSale }: { sale: SaleReceipt; onNewSale: () => void }) {
  const dt      = new Date(sale.created_at)
  const dateStr = dt.toLocaleDateString('fr-SN', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const timeStr = dt.toLocaleTimeString('fr-SN', { hour: '2-digit', minute: '2-digit' })
  const qrValue = sale.ticket ? `SC:${sale.reference}:${sale.ticket.qr_code}` : sale.reference

  const { status: thermalStatus, printReceipt } = useThermalPrinter()
  const thermalReady = thermalStatus === 'connected' || thermalStatus === 'printing'

  const handleThermalPrint = () => {
    printReceipt({
      reference:    sale.reference,
      created_at:   sale.created_at,
      store:        sale.store,
      user:         sale.user,
      client:       sale.client,
      items:        (sale.items ?? []).map(i => ({
        description: i.product?.name ?? i.restaurantItem?.name ?? '—',
        qty:         i.qty,
        unit_price_ttc: i.unit_price_ttc,
        discount_pct:   i.discount_pct,
      })),
      payments:     (sale.payments ?? []).map(p => ({
        payment_method: p.payment_method,
        amount: p.amount,
      })),
      subtotal_ht:  sale.subtotal_ht,
      vat_amount:   sale.vat_amount,
      discount_amount: sale.discount_amount,
      total_ttc:    sale.total_ttc,
      paid_amount:  sale.paid_amount,
      change_amount: sale.change_amount,
      loyalty_points_earned: sale.loyalty_points_earned,
    })
  }

  const handlePrint = () => window.print()

  const handleA4Print = () =>
    openPdf(`/pdf/sales/${sale.id}`)
      .catch(() => {})

  const sep = <div style={{ borderTop: '1px dashed #666', margin: '7px 0' }} />

  // Receipt body — shared by screen preview and print div
  const receiptBody = (
    <div style={{ fontFamily: "'Courier New', Courier, monospace", fontSize: 11, lineHeight: 1.5, color: '#000' }}>
      {/* Store header */}
      <div style={{ textAlign: 'center', marginBottom: 6 }}>
        <div style={{ fontWeight: 'bold', fontSize: 14, letterSpacing: 1 }}>
          {sale.store?.name?.toUpperCase() ?? 'BAOBAB'}
        </div>
        {sale.store?.address && <div style={{ fontSize: 10 }}>{sale.store.address}</div>}
        {sale.store?.phone   && <div style={{ fontSize: 10 }}>Tél: {sale.store.phone}</div>}
        {sale.store?.ninea   && <div style={{ fontSize: 10 }}>NINEA: {sale.store.ninea}</div>}
      </div>
      {sep}

      {/* Sale meta */}
      <div>
        {([
          ['N° Ticket',  sale.ticket?.number ?? '—'],
          ['Référence',  sale.reference],
          ['Date',       `${dateStr}  ${timeStr}`],
          sale.user?.name   ? ['Caissier', sale.user.name]   : null,
          sale.client?.name ? ['Client',   sale.client.name]  : null,
        ] as ([string, string] | null)[]).filter((x): x is [string, string] => x !== null).map(([k, v]) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 4 }}>
            <span style={{ color: '#555' }}>{k}</span>
            <span style={{ fontWeight: 'bold', textAlign: 'right' }}>{v}</span>
          </div>
        ))}
      </div>
      {sep}

      {/* Items */}
      <div>
        {sale.items.map((item, i) => (
          <div key={i} style={{ marginBottom: 5 }}>
            <div style={{ fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {item.product?.short_name ?? item.product?.name ?? item.restaurantItem?.name ?? '—'}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#444' }}>
                {formatNumber(item.qty, item.qty % 1 === 0 ? 0 : 3)} × {formatCurrency(item.unit_price_ttc)}
                {item.discount_pct > 0 ? ` (-${item.discount_pct}%)` : ''}
              </span>
              <span style={{ fontWeight: 'bold' }}>{formatCurrency(item.total_ttc)}</span>
            </div>
          </div>
        ))}
      </div>
      {sep}

      {/* Totals */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Sous-total HT</span><span>{formatCurrency(sale.subtotal_ht)}</span>
        </div>
        {sale.vat_amount > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>TVA</span><span>{formatCurrency(sale.vat_amount)}</span>
          </div>
        )}
        {sale.discount_amount > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#16a34a' }}>
            <span>Remise totale</span><span>-{formatCurrency(sale.discount_amount)}</span>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: 14, borderTop: '1px solid #333', marginTop: 4, paddingTop: 4 }}>
          <span>TOTAL TTC</span><span>{formatCurrency(sale.total_ttc)}</span>
        </div>
      </div>
      {sep}

      {/* Payments */}
      <div>
        {sale.payments.map((p, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>{PAY_LABELS[p.payment_method] ?? p.payment_method}</span>
            <span>{formatCurrency(p.amount)}</span>
          </div>
        ))}
        {(sale.change_amount ?? 0) > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
            <span>RENDU MONNAIE</span><span>{formatCurrency(sale.change_amount)}</span>
          </div>
        )}
      </div>

      {/* Loyalty */}
      {(sale.loyalty_points_earned ?? 0) > 0 && (
        <>
          {sep}
          <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: 10 }}>
            ★  {sale.loyalty_points_earned} points de fidélité gagnés
          </div>
        </>
      )}

      {/* QR Code */}
      <div style={{ textAlign: 'center', margin: '12px 0 8px' }}>
        <div style={{ display: 'inline-block', background: 'white', padding: 4, border: '1px solid #eee' }}>
          <QRCode value={qrValue} size={96} level="M" />
        </div>
        <div style={{ fontSize: 9, marginTop: 4, color: '#666' }}>
          {sale.ticket?.number ?? sale.reference}
        </div>
      </div>
      {sep}

      {/* Footer */}
      <div style={{ textAlign: 'center', fontSize: 10, whiteSpace: 'pre-line' }}>
        {sale.store?.receipt_footer ?? 'Merci de votre confiance !'}
      </div>
    </div>
  )

  return (
    <>
      {/* ── Screen modal ───────────────────────────────────── */}
      <div className="fixed inset-0 bg-black/60 z-50 flex flex-col items-center justify-start overflow-y-auto py-6">
        {/* Green success header */}
        <div className="w-full max-w-sm bg-green-500 text-white rounded-t-2xl px-5 py-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
              <Check size={22} />
            </div>
            <div>
              <p className="font-bold text-lg">Vente confirmée !</p>
              <p className="text-sm text-green-100">{formatCurrency(sale.total_ttc)}</p>
            </div>
          </div>
          <div className="text-right text-xs text-green-100 font-mono">
            <p className="font-semibold">{sale.reference}</p>
            <p>{timeStr}</p>
          </div>
        </div>

        {/* Receipt preview */}
        <div className="w-full max-w-sm bg-white shadow-2xl px-5 py-4 overflow-y-auto">
          {receiptBody}
        </div>

        {/* Action buttons */}
        <div className="w-full max-w-sm bg-white rounded-b-2xl border-t px-4 pb-5 pt-3 flex gap-2 flex-shrink-0 shadow-2xl flex-wrap">
          {/* Ticket thermique ou PDF 80mm */}
          {thermalReady ? (
            <button
              onClick={handleThermalPrint}
              disabled={thermalStatus === 'printing'}
              className="flex-1 flex items-center justify-center gap-1.5 py-3 border-2 text-sm font-semibold rounded-xl transition-colors border-orange-500 text-orange-600 hover:bg-orange-50 disabled:opacity-50"
            >
              <Printer size={16} />
              {thermalStatus === 'printing' ? 'Impression...' : 'Ticket ESC/POS'}
            </button>
          ) : (
            <button
              onClick={handlePrint}
              className="flex-1 flex items-center justify-center gap-1.5 py-3 border-2 text-sm font-semibold rounded-xl transition-colors"
              style={{ borderColor: 'var(--color-primary)', color: 'var(--color-primary)' }}
            >
              <Printer size={16} /> Ticket 80mm
            </button>
          )}
          {/* Reçu format A4 */}
          <button
            onClick={handleA4Print}
            className="flex-1 flex items-center justify-center gap-1.5 py-3 border-2 border-gray-300 text-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-50 transition-colors"
          >
            <FileText size={16} /> Format A4
          </button>
          <button
            onClick={onNewSale}
            className="w-full py-3 btn-primary text-sm font-semibold rounded-xl flex items-center justify-center gap-2"
          >
            <Receipt size={17} /> Nouvelle vente
          </button>
        </div>
      </div>

      {/* ── Print-only receipt (hidden on screen, shown on print via CSS) ── */}
      <div id="receipt-print-root">
        {receiptBody}
      </div>
    </>
  )
}

// ─── Cart Item Row ────────────────────────────────────────────────────────────

function CartItemRow({ item, onQtyChange, onDiscountChange, onRemove }: {
  item: CartItem
  onQtyChange: (id: number, qty: number) => void
  onDiscountChange: (id: number, pct: number) => void
  onRemove: (id: number) => void
}) {
  const [editingDiscount, setEditingDiscount] = useState(false)
  const [discountInput, setDiscountInput] = useState(item.discount_pct.toString())

  const applyDiscount = () => {
    const pct = Math.min(100, Math.max(0, parseFloat(discountInput) || 0))
    onDiscountChange(item.product_id, pct)
    setEditingDiscount(false)
  }

  return (
    <div className="py-2 border-b border-gray-100 last:border-0">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{item.product_name}</p>
          <p className="text-xs text-gray-500">{formatCurrency(item.unit_price_ttc)} × {formatNumber(item.qty, 2)}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-sm font-semibold text-gray-900">{formatCurrency(item.total_ttc)}</p>
          {item.discount_pct > 0 && (
            <p className="text-xs text-green-600">-{item.discount_pct}%</p>
          )}
        </div>
        <button onClick={() => onRemove(item.product_id)} className="text-gray-300 hover:text-red-500 transition-colors ml-1">
          <X size={14} />
        </button>
      </div>

      <div className="flex items-center gap-2 mt-1.5">
        {/* Qty controls */}
        <button onClick={() => onQtyChange(item.product_id, item.qty - (item.is_weight_based ? 0.1 : 1))}
          className="w-6 h-6 rounded bg-gray-100 hover:bg-gray-200 flex items-center justify-center flex-shrink-0">
          <Minus size={11} />
        </button>
        <input
          type="number"
          value={item.qty}
          onChange={e => onQtyChange(item.product_id, parseFloat(e.target.value) || 0)}
          className="w-14 text-center text-sm border rounded px-1 py-0.5 focus:ring-1 focus:ring-primary focus:outline-none"
          min={0}
          step={item.is_weight_based ? '0.001' : '1'}
        />
        <button onClick={() => onQtyChange(item.product_id, item.qty + (item.is_weight_based ? 0.1 : 1))}
          className="w-6 h-6 rounded bg-gray-100 hover:bg-gray-200 flex items-center justify-center flex-shrink-0">
          <Plus size={11} />
        </button>

        {/* Discount */}
        {editingDiscount ? (
          <div className="flex items-center gap-1 ml-auto">
            <input
              autoFocus
              type="number"
              value={discountInput}
              onChange={e => setDiscountInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') applyDiscount(); if (e.key === 'Escape') setEditingDiscount(false) }}
              className="w-14 text-center text-xs border rounded px-1 py-0.5 focus:ring-1 focus:ring-green-500 focus:outline-none"
              min={0} max={100}
            />
            <span className="text-xs text-gray-400">%</span>
            <button onClick={applyDiscount} className="text-green-500 hover:text-green-600"><Check size={14} /></button>
            <button onClick={() => setEditingDiscount(false)} className="text-gray-400 hover:text-red-500"><X size={12} /></button>
          </div>
        ) : (
          <button
            onClick={() => { setDiscountInput(item.discount_pct.toString()); setEditingDiscount(true) }}
            className={`ml-auto flex items-center gap-1 px-2 py-0.5 rounded text-xs border transition-colors ${
              item.discount_pct > 0 ? 'bg-green-50 text-green-600 border-green-200' : 'bg-gray-50 text-gray-400 border-gray-200 hover:border-green-300 hover:text-green-500'
            }`}>
            <Percent size={10} /> {item.discount_pct > 0 ? `${item.discount_pct}%` : 'Remise'}
          </button>
        )}
      </div>
    </div>
  )
}

// ─── POS : Annulation d'une vente (avec PIN superviseur) ─────────────────────

function PosCancelModal({
  sale,
  forModify,
  onClose,
  onSuccess,
}: {
  sale: Record<string, any>
  forModify: boolean
  onClose: () => void
  onSuccess: () => void
}) {
  const [reason, setReason] = useState('')
  const [pin, setPin] = useState('')
  const [refundMethod, setRefundMethod] = useState('cash')

  const mut = useMutation({
    mutationFn: () => api.post(`/sales/${sale.id}/cancel`, {
      reason,
      supervisor_pin: pin,
      refund_method: forModify ? 'none' : refundMethod,
      refund_amount: forModify ? 0 : parseFloat(sale.paid_amount ?? 0),
    }),
    onSuccess: () => { toast.success('Vente annulée'); onSuccess() },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Erreur'),
  })

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-red-100 rounded-xl flex items-center justify-center">
              {forModify ? <Edit2 size={15} className="text-amber-600" /> : <Ban size={15} className="text-red-600" />}
            </div>
            <div>
              <p className="font-bold text-gray-800 text-sm">
                {forModify ? 'Modifier la vente' : 'Annuler la vente'}
              </p>
              <p className="text-xs text-gray-400 font-mono">{sale.reference}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
        </div>

        <div className="p-5 space-y-4">
          {forModify && (
            <div className="px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700">
              La vente sera annulée et le stock restitué. Vous pourrez ensuite la corriger et la réenregistrer.
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              Motif <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={2}
              placeholder={forModify ? 'Erreur de saisie, correction...' : 'Raison de l\'annulation...'}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-400/30"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              PIN Superviseur <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              value={pin}
              onChange={e => setPin(e.target.value)}
              maxLength={8}
              placeholder="● ● ● ● ● ●"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-center tracking-widest font-mono focus:outline-none focus:ring-2 focus:ring-red-400/30"
            />
          </div>

          {!forModify && (
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-2">Remboursement</label>
              <div className="grid grid-cols-2 gap-1.5">
                {['cash', 'wave', 'orange_money', 'none'].map(m => (
                  <button key={m} onClick={() => setRefundMethod(m)}
                    className={`py-1.5 px-3 rounded-lg text-xs border transition-all ${
                      refundMethod === m ? 'bg-primary text-white border-primary' : 'bg-white text-gray-600 border-gray-200'
                    }`}>
                    {m === 'cash' ? 'Espèces' : m === 'wave' ? 'Wave' : m === 'orange_money' ? 'Orange Money' : 'Sans remboursement'}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2 px-5 pb-5">
          <button onClick={onClose}
            className="flex-1 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
            Annuler
          </button>
          <button
            onClick={() => mut.mutate()}
            disabled={!reason.trim() || !pin.trim() || mut.isPending}
            className={`flex-1 py-2 text-white rounded-lg text-sm font-semibold disabled:opacity-50 ${
              forModify ? 'bg-amber-500 hover:bg-amber-600' : 'bg-red-600 hover:bg-red-700'
            }`}>
            {mut.isPending ? '…' : forModify ? 'Confirmer & Modifier' : 'Confirmer l\'annulation'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── POS : Historique des ventes du jour ──────────────────────────────────────

function PosRecentSalesModal({ onClose }: { onClose: () => void }) {
  const { clearCart, addItem } = usePosStore()
  const qc = useQueryClient()
  const [cancelTarget, setCancelTarget] = useState<{ sale: Record<string, any>; modify: boolean } | null>(null)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['pos-recent-sales'],
    queryFn: () => api.get('/sales', {
      params: { per_page: 50, date_from: new Date().toISOString().slice(0, 10) }
    }).then(r => r.data.data as Record<string, any>[]),
    staleTime: 0,
  })

  const sales = data ?? []

  const loadSaleToCart = async (saleId: number) => {
    try {
      const res = await api.get(`/sales/${saleId}`)
      const sale = res.data
      clearCart()
      if (sale.client) {
        // can't set name without store re-fetch, just set client_id via store
      }
      for (const item of sale.items ?? []) {
        addItem({
          product_id:    item.product_id,
          product_name:  item.product?.name ?? '',
          qty:           parseFloat(item.qty),
          unit_price_ttc: parseFloat(item.unit_price_ttc),
          vat_rate:      parseFloat(item.vat_rate ?? 18),
          is_weight_based: false,
          discount_pct:  parseFloat(item.discount_pct ?? 0),
        })
      }
      toast.success('Articles rechargés dans le panier')
      onClose()
    } catch {
      toast.error('Impossible de charger les articles')
    }
  }

  const handleCancelSuccess = async (sale: Record<string, any>, modify: boolean) => {
    setCancelTarget(null)
    qc.invalidateQueries({ queryKey: ['pos-recent-sales'] })
    refetch()
    if (modify) {
      await loadSaleToCart(sale.id)
    }
  }

  const statusCls = (s: string) =>
    s === 'completed' ? 'bg-green-100 text-green-700' :
    s === 'cancelled' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
  const statusLabel = (s: string) =>
    s === 'completed' ? 'Confirmée' : s === 'cancelled' ? 'Annulée' : 'Brouillon'

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4">
        <div className="bg-white w-full sm:rounded-2xl sm:max-w-2xl sm:max-h-[85vh] flex flex-col shadow-2xl max-h-[90vh]">

          <div className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0">
            <div className="flex items-center gap-2">
              <Clock size={18} className="text-primary" />
              <h2 className="font-bold text-gray-800">Ventes du jour</h2>
              <span className="text-xs text-gray-400">({sales.length} ventes)</span>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {isLoading && (
              <div className="flex justify-center py-10">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            )}
            {!isLoading && sales.length === 0 && (
              <p className="text-center text-gray-400 py-10 text-sm">Aucune vente aujourd'hui</p>
            )}
            {sales.map(s => (
              <div key={s.id} className={`flex items-center gap-3 px-5 py-3 border-b border-gray-100 hover:bg-gray-50 ${
                s.status === 'cancelled' ? 'opacity-60' : ''
              }`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-gray-700">{s.reference}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${statusCls(s.status)}`}>
                      {statusLabel(s.status)}
                    </span>
                    {s.channel === 'pos' && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-violet-100 text-violet-700 rounded-full">POS</span>
                    )}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {new Date(s.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                    {s.client && ` — ${s.client.name}`}
                    {s.user && ` — ${s.user.name}`}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className={`text-sm font-bold ${s.status === 'cancelled' ? 'text-gray-400 line-through' : 'text-primary'}`}>
                    {Number(s.total_ttc).toLocaleString('fr-FR')} F
                  </p>
                </div>
                {s.status === 'completed' && (
                  <div className="flex gap-1 flex-shrink-0">
                    <button
                      onClick={() => setCancelTarget({ sale: s, modify: true })}
                      title="Modifier (annuler et recharger)"
                      className="flex items-center gap-1 px-2 py-1.5 text-xs bg-amber-50 text-amber-600 border border-amber-200 rounded-lg hover:bg-amber-100"
                    >
                      <Edit2 size={12} /> Modifier
                    </button>
                    <button
                      onClick={() => setCancelTarget({ sale: s, modify: false })}
                      title="Annuler la vente"
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg border border-gray-200"
                    >
                      <Ban size={14} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="px-5 py-3 border-t flex-shrink-0">
            <button onClick={onClose}
              className="w-full py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
              Fermer
            </button>
          </div>
        </div>
      </div>

      {cancelTarget && (
        <PosCancelModal
          sale={cancelTarget.sale}
          forModify={cancelTarget.modify}
          onClose={() => setCancelTarget(null)}
          onSuccess={() => handleCancelSuccess(cancelTarget.sale, cancelTarget.modify)}
        />
      )}
    </>
  )
}

// ─── Main POS Page ────────────────────────────────────────────────────────────

interface CategoryTree { id: number; name: string; type?: string; children?: CategoryTree[] }
interface ProductPageResult { items: PosItem[]; total: number; totalPages: number }

export default function PosPage() {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const confirm = useConfirm()
  const {
    items, addItem, updateQty, updateDiscount, removeItem, clearCart,
    client_id, client_name, client_account_balance, setClient, cash_session_id, setCashSession,
    holdCart, recallCart, on_hold_carts, is_offline, setOffline,
    cart_discount_amount, setCartDiscount,
  } = usePosStore()

  const storeBusinessType = user?.store?.business_type ?? 'grande_surface'
  const isRestaurant = storeBusinessType === 'restaurant' || storeBusinessType === 'mixte'

  // ── UI state ──────────────────────────────────────────────────────────────
  const [search, setSearch]                 = useState('')
  const [searchResults, setSearchResults]   = useState<PosItem[]>([])
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null)
  const [selectedCourse, setSelectedCourse] = useState<string | null>(null)
  const [page, setPage]                     = useState(1)
  const [activeProductTab, setActiveProductTab] = useState<'favorites' | 'recent' | 'catalog'>('catalog')
  const [showPayment, setShowPayment]       = useState(false)
  const [mobileCartOpen, setMobileCartOpen] = useState(false)
  const [processing, setProcessing]         = useState(false)
  const [showCloseSession, setShowCloseSession] = useState(false)
  const [showSessions, setShowSessions]         = useState(false)
  const [showClientSearch, setShowClientSearch] = useState(false)
  const [clientSearchFromPayment, setClientSearchFromPayment] = useState(false)
  const [savedPayments, setSavedPayments]   = useState<PaymentEntry[] | null>(null)
  const [pendingDeposit, setPendingDeposit] = useState(false)
  const [showHoldCarts, setShowHoldCarts]   = useState(false)
  const [showRecentSales, setShowRecentSales] = useState(false)
  const [session, setSession]               = useState<CashSession | null>(null)
  const [sessionLoading, setSessionLoading] = useState(true)
  const [saleReceipt, setSaleReceipt]       = useState<SaleReceipt | null>(null)

  // ── Favorites & recents tracking (session-scoped) ─────────────────────────
  const [sessionFavorites, setSessionFavorites] = useState<Map<number, { item: PosItem; count: number }>>(new Map())
  const [recentItems, setRecentItems]           = useState<PosItem[]>([])

  const topFavorites = useMemo(
    () => Array.from(sessionFavorites.values()).sort((a, b) => b.count - a.count).slice(0, 24),
    [sessionFavorites]
  )

  const searchRef = useRef<HTMLInputElement>(null)

  const itemsTotal    = items.reduce((s, i) => s + i.total_ttc, 0)
  const totalTtc      = Math.max(0, itemsTotal - cart_discount_amount)
  const totalDiscount = items.reduce((s, i) => s + i.discount_amount, 0) + cart_discount_amount

  // ── Online/offline ────────────────────────────────────────────────────────
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    update()
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update) }
  }, [setOffline])

  // ── Session ───────────────────────────────────────────────────────────────
  useEffect(() => {
    api.get('/cash-sessions/current')
      .then(res => { if (res.data) { setSession(res.data); setCashSession(res.data.id) } })
      .catch(() => {})
      .finally(() => setSessionLoading(false))
  }, [setCashSession])

  // ── Active inventory check (sales blocking) ───────────────────────────────
  const { data: activeInventory } = useQuery({
    queryKey: ['inventory-active-pos'],
    queryFn:  () => api.get('/inventory-sessions/active').then(r => r.data),
    refetchInterval: 120_000,
    staleTime: 60_000,
  })
  const salesBlocked = activeInventory?.active && activeInventory?.sales_blocked

  // ── Categories tree ───────────────────────────────────────────────────────
  const { data: categoryTree = [] } = useQuery<CategoryTree[]>({
    queryKey: ['categories-tree'],
    queryFn:  () => api.get('/categories').then(r => r.data),
  })

  // Reset page on category/course change
  useEffect(() => { setPage(1) }, [selectedCategoryId, selectedCourse])

  // ── Products — paginated 30/page ──────────────────────────────────────────
  const PER_PAGE = 30

  const {
    data: productPage = { items: [], total: 0, totalPages: 1 },
    isLoading: productsLoading,
    isError: productsError,
  } = useQuery<ProductPageResult>({
    queryKey: isRestaurant
      ? ['pos-restaurant-items', selectedCourse]
      : ['pos-products', selectedCategoryId, page],
    queryFn: isRestaurant
      ? () => api.get('/restaurant-items', {
          params: { course: selectedCourse ?? undefined, available: 1, active: 1 },
        }).then(res => ({
          items: (res.data as any[]).map(ri => ({
            id: ri.id, name: ri.name, short_name: ri.name,
            sale_price_ttc: parseFloat(ri.price_ttc),
            vat_rate: parseFloat(ri.vat_rate),
            is_weight_based: false, stock_qty: 999,
            category_name: COURSES.find(c => c.value === ri.course)?.label,
            image: ri.image ?? null,
            source: 'restaurant_item' as const,
          })),
          total: res.data.length,
          totalPages: 1,
        }))
      : () => api.get('/products', {
          params: { category_id: selectedCategoryId ?? undefined, per_page: PER_PAGE, page, is_active: true, has_stock: 1 },
        }).then(res => ({
          items: res.data.data.map((p: any) => ({
            id: p.id, name: p.name, short_name: p.short_name,
            sale_price_ttc: getPosPrice(p),
            vat_rate: p.vat_rate, is_weight_based: p.is_weight_based,
            stock_qty: p.stock_level?.qty_on_hand ?? 0,
            category_name: p.category?.name,
            image: p.image ?? null,
            source: 'product' as const,
          })),
          total: res.data.meta?.total ?? 0,
          totalPages: res.data.meta?.last_page ?? 1,
        })),
    enabled: !is_offline,
    keepPreviousData: true,
  } as any)

  // ── Cache to Dexie ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!is_offline && productPage.items.length > 0 && !isRestaurant) {
      cacheProducts(productPage.items.map(p => ({
        id: p.id, internal_code: p.id.toString(), name: p.name, short_name: p.short_name,
        sale_price_ttc: p.sale_price_ttc, vat_rate: p.vat_rate,
        is_weight_based: p.is_weight_based, category_name: p.category_name,
        stock_qty: p.stock_qty, barcodes: [], updated_at: new Date().toISOString(),
      })))
    }
  }, [productPage.items, is_offline, isRestaurant])

  // ── Offline fallback ──────────────────────────────────────────────────────
  const [offlineProducts, setOfflineProducts] = useState<PosItem[]>([])

  useEffect(() => {
    if (is_offline && !isRestaurant) {
      db.cachedProducts
        .filter(p => selectedCategoryId === null || p.category_id === selectedCategoryId)
        .toArray()
        .then(products => setOfflineProducts(products.map(p => ({
          id: p.id, name: p.name, short_name: p.short_name,
          sale_price_ttc: p.sale_price_ttc, vat_rate: p.vat_rate,
          is_weight_based: p.is_weight_based, stock_qty: p.stock_qty,
          category_name: p.category_name, source: 'product' as const,
        }))))
    } else { setOfflineProducts([]) }
  }, [is_offline, isRestaurant, selectedCategoryId])

  const displayProducts = is_offline ? offlineProducts : productPage.items
  const totalProducts   = is_offline ? offlineProducts.length : productPage.total
  const totalPages      = is_offline ? 1 : productPage.totalPages

  // ── Search ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!search || search.length < 2) { setSearchResults([]); return }
    const timer = setTimeout(async () => {
      if (isRestaurant) {
        try {
          const res = await api.get('/restaurant-items', { params: { search, available: 1, active: 1 } })
          setSearchResults((res.data as any[]).map(ri => ({
            id: ri.id, name: ri.name, short_name: ri.name,
            sale_price_ttc: parseFloat(ri.price_ttc), vat_rate: parseFloat(ri.vat_rate),
            is_weight_based: false, stock_qty: 999,
            category_name: COURSES.find(c => c.value === ri.course)?.label,
            image: ri.image ?? null, source: 'restaurant_item' as const,
          })))
        } catch { setSearchResults([]) }
      } else if (is_offline) {
        setSearchResults(await searchProductsOffline(search) as any)
      } else {
        // Detect price search: pure number >= 100 → filter by exact price
        const isPriceSearch = /^\d+$/.test(search.trim()) && parseInt(search) >= 100
        try {
          const params = isPriceSearch
            ? { price_exact: search.trim(), per_page: 30, is_active: true }
            : { search, per_page: 15, is_active: true }
          const res = await api.get('/products', { params })
          setSearchResults(res.data.data.map((p: any) => ({
            id: p.id, name: p.name, short_name: p.short_name,
            sale_price_ttc: getPosPrice(p), vat_rate: p.vat_rate,
            is_weight_based: p.is_weight_based,
            stock_qty: p.stock_level?.qty_on_hand ?? 0,
            category_name: p.category?.name, image: p.image ?? null,
            source: 'product' as const,
          })))
        } catch { setSearchResults(await searchProductsOffline(search) as any) }
      }
    }, 200)
    return () => clearTimeout(timer)
  }, [search, is_offline, isRestaurant])

  // ── Barcode scan / add to cart ────────────────────────────────────────────
  const handleScanOrSearch = async (value: string) => {
    if (!value.trim()) return
    if (!isRestaurant && /^\d{8,14}$/.test(value.trim())) {
      let product: CachedProduct | undefined
      if (is_offline) {
        product = await findProductByBarcode(value.trim())
      } else {
        try {
          const res = await api.get('/products/barcode', { params: { barcode: value.trim() } })
          product = res.data
        } catch { product = await findProductByBarcode(value.trim()) }
      }
      if (product) { addProductToCart(product as unknown as PosItem); setSearch(''); return }
      toast.error(`Produit non trouvé : ${value}`)
      return
    }
    setSearch(value)
  }

  const addProductToCart = useCallback((item: PosItem) => {
    if (item.source !== 'restaurant_item' && item.stock_qty <= 0) {
      toast.error(`${item.short_name ?? item.name} — Rupture de stock`, { duration: 2000 })
      return
    }
    addItem({
      product_id: item.id,
      restaurant_item_id: item.source === 'restaurant_item' ? item.id : undefined,
      product_name: item.name,
      qty: 1,
      unit_price_ttc: item.sale_price_ttc,
      vat_rate: item.vat_rate,
      is_weight_based: item.is_weight_based,
      discount_pct: 0,
    })
    // Track favorites & recents
    setSessionFavorites(prev => {
      const next = new Map(prev)
      const existing = next.get(item.id)
      next.set(item.id, { item, count: (existing?.count ?? 0) + 1 })
      return next
    })
    setRecentItems(prev => [item, ...prev.filter(p => p.id !== item.id)].slice(0, 24))
    setSearch('')
    setSearchResults([])
    searchRef.current?.focus()
    toast.success(`${item.short_name ?? item.name} ajouté`, { duration: 700 })
  }, [addItem])

  // ── Sale confirm ──────────────────────────────────────────────────────────
  const handleSaleConfirm = async (payments: { payment_method: string; amount: number }[]) => {
    if (items.length === 0) return
    setProcessing(true)
    const offline_id = `OFL-${Date.now()}-${uuidv4().slice(0, 8)}`
    const salePayload = {
      store_id: user!.store_id, user_id: user!.id, cash_session_id, client_id,
      items: items.map(i => ({
        ...(i.restaurant_item_id
          ? { restaurant_item_id: i.restaurant_item_id }
          : { product_id: i.product_id, lot_id: i.lot_id }),
        qty: i.qty, unit_price_ttc: i.unit_price_ttc, discount_pct: i.discount_pct,
      })),
      global_discount_amount: cart_discount_amount > 0 ? cart_discount_amount : undefined,
      payments, offline_id, channel: 'pos',
    }
    if (is_offline) {
      await savePendingSale({
        offline_id, store_id: user!.store_id!, user_id: user!.id,
        cash_session_id: cash_session_id ?? undefined, client_id: client_id ?? undefined,
        items: items.map(i => ({
          product_id: i.product_id, product_name: i.product_name, qty: i.qty,
          unit_price_ttc: i.unit_price_ttc, discount_pct: i.discount_pct,
          discount_amount: i.discount_amount, total_ttc: i.total_ttc,
          vat_rate: i.vat_rate, is_weight_based: i.is_weight_based,
        })),
        payments, total_ttc: totalTtc, status: 'pending', created_at: new Date().toISOString(),
      })
      toast.success("Vente enregistrée hors-ligne — sera synchronisée dès le retour d'Internet")
      clearCart(); setShowPayment(false); setProcessing(false); return
    }
    try {
      const res = await api.post('/sales', salePayload)
      // Build receipt from local cart state (faster than server loadMissing)
      const cartSnapshot = [...items]
      const receipt: SaleReceipt = {
        ...res.data,
        items: (res.data.items ?? []).map((si: any) => {
          const ci = cartSnapshot.find(c =>
            (si.product_id && c.product_id === si.product_id) ||
            (si.restaurant_item_id && c.restaurant_item_id === si.restaurant_item_id)
          )
          return {
            ...si,
            product:         si.product_id        ? { name: ci?.product_name ?? '—', short_name: ci?.product_name } : null,
            restaurantItem:  si.restaurant_item_id ? { name: ci?.product_name ?? '—' } : null,
          }
        }),
        user:  user ? { id: user.id, name: user.name } : undefined,
        store: user?.store ? {
          name:           user.store.name,
          address:        user.store.address  ?? undefined,
          phone:          user.store.phone    ?? undefined,
          ninea:          user.store.ninea    ?? undefined,
          receipt_footer: user.store.receipt_footer ?? undefined,
        } : undefined,
      }
      clearCart(); setShowPayment(false); setSaleReceipt(receipt)
      queryClient.invalidateQueries({ queryKey: ['pos-products'] })
      queryClient.invalidateQueries({ queryKey: ['sales'] })
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Erreur lors de l'enregistrement"
      toast.error(message)
    } finally { setProcessing(false) }
  }

  // ── Product card (reusable) ───────────────────────────────────────────────
  const ProductCard = useCallback(({ p, badge }: { p: PosItem; badge?: string }) => {
    const thumb      = imageUrl(p.image)
    const outOfStock = p.source !== 'restaurant_item' && p.stock_qty <= 0
    const lowStock   = p.source !== 'restaurant_item' && p.stock_qty > 0 && p.stock_qty <= 5
    return (
      <button
        onClick={() => addProductToCart(p)}
        disabled={outOfStock}
        className={`bg-white rounded-xl border text-left hover:border-primary-400 hover:shadow-md transition-all group overflow-hidden flex flex-col ${outOfStock ? 'opacity-50 cursor-not-allowed' : ''} ${lowStock ? 'border-amber-200' : 'border-gray-100'}`}
      >
        <div className="relative w-full aspect-square bg-gray-100 overflow-hidden">
          {thumb ? (
            <img src={thumb} alt={p.short_name ?? p.name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
              loading="lazy"
              onError={e => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
                (e.currentTarget.nextElementSibling as HTMLElement)?.classList.remove('hidden')
              }}
            />
          ) : null}
          <div className={`absolute inset-0 flex items-center justify-center bg-primary-50 ${thumb ? 'hidden' : ''}`}>
            <ShoppingBag size={24} className="text-primary opacity-30" />
          </div>
          {outOfStock && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
              <span className="text-white text-xs font-bold bg-red-500 px-1.5 py-0.5 rounded">Rupture</span>
            </div>
          )}
          {lowStock && !outOfStock && (
            <div className="absolute top-1 right-1 bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
              {formatNumber(p.stock_qty, 0)}
            </div>
          )}
          {badge && (
            <div className="absolute top-1 left-1 bg-primary text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
              {badge}
            </div>
          )}
        </div>
        <div className="p-2 flex-1 flex flex-col">
          <p className="text-xs font-semibold text-gray-900 line-clamp-2 leading-tight mb-0.5 flex-1">
            {p.short_name ?? p.name}
          </p>
          <p className="text-sm font-bold text-primary">{formatCurrency(p.sale_price_ttc)}</p>
        </div>
      </button>
    )
  }, [addProductToCart])

  // ── Guards ────────────────────────────────────────────────────────────────
  if (sessionLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-100">
        <p className="text-gray-500">Vérification de la session...</p>
      </div>
    )
  }
  if (!session) {
    return <OpenSessionModal onOpened={(s) => { setSession(s); setCashSession(s.id) }} />
  }

  // ── Render ────────────────────────────────────────────────────────────────
  // NOTE: ActiveInventoryBanner is rendered inside the main layout below
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-gray-100">

      {/* ═══ TOP BAR ═══════════════════════════════════════════════════════ */}
      <div className="bg-white border-b px-3 py-2 flex items-center gap-2 flex-shrink-0 shadow-sm">
        {/* Online indicator */}
        <div className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full flex-shrink-0 ${is_offline ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
          {is_offline ? <WifiOff size={11} /> : <Wifi size={11} />}
          <span className="hidden sm:inline">{is_offline ? 'HORS-LIGNE' : 'En ligne'}</span>
        </div>

        {/* Search / barcode — takes most space */}
        <div className="relative flex-1 max-w-lg">
          <input
            ref={searchRef}
            type="text"
            value={search}
            onChange={e => handleScanOrSearch(e.target.value)}
            placeholder="🔍 Scanner ou rechercher un article... (F2)"
            className="w-full border border-gray-200 rounded-xl pl-4 pr-9 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-gray-50"
            autoFocus
          />
          {search && (
            <button onClick={() => { setSearch(''); setSearchResults([]) }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X size={14} />
            </button>
          )}
        </div>

        {/* Client */}
        <button
          onClick={() => setShowClientSearch(true)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border transition-colors flex-shrink-0 ${client_name ? 'bg-primary-50 text-primary-600 border-primary-200 font-medium' : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'}`}>
          <UserPlus size={13} />
          <span className="max-w-[90px] truncate">{client_name ?? 'Client'}</span>
          {client_name && (
            <span onClick={e => { e.stopPropagation(); setClient(null, null) }}
              className="text-primary-400 hover:text-red-500 ml-0.5">
              <X size={11} />
            </span>
          )}
        </button>

        {/* On-hold badge */}
        {on_hold_carts.length > 0 && (
          <button onClick={() => setShowHoldCarts(true)}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-amber-100 text-amber-700 rounded-lg text-xs border border-amber-200 flex-shrink-0">
            <PauseCircle size={13} /> {on_hold_carts.length}
          </button>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Session info */}
        <div className="hidden md:flex items-center gap-1 text-xs text-gray-400 border-l pl-2">
          <DollarSign size={12} />
          <span>Ouverture {formatCurrency(session.opening_balance)}</span>
        </div>
        <button onClick={() => setShowSessions(true)}
          className="flex items-center gap-1 text-xs text-gray-600 border border-gray-200 px-2 py-1.5 rounded-lg hover:bg-gray-100 flex-shrink-0">
          <History size={12} /> <span className="hidden sm:inline">Sessions</span>
        </button>
        <button onClick={() => setShowRecentSales(true)}
          className="flex items-center gap-1 text-xs text-indigo-600 border border-indigo-200 px-2 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 flex-shrink-0">
          <Clock size={12} /> <span className="hidden sm:inline">Ventes</span>
        </button>
        <button onClick={() => setShowCloseSession(true)}
          className="flex items-center gap-1 text-xs text-red-500 border border-red-200 px-2 py-1.5 rounded-lg hover:bg-red-50 flex-shrink-0">
          <Lock size={12} /> <span className="hidden sm:inline">Clôturer</span>
        </button>
      </div>

      {/* ═══ SEARCH RESULTS DROPDOWN ════════════════════════════════════════ */}
      {search.length >= 2 && (
        <div className="bg-white border-b shadow-xl z-20 flex-shrink-0 max-h-64 overflow-y-auto">
          {searchResults.length === 0 ? (
            <p className="px-4 py-3 text-sm text-gray-400">Aucun résultat pour «{search}»</p>
          ) : searchResults.map(p => {
            const thumb      = imageUrl(p.image)
            const outOfStock = p.source !== 'restaurant_item' && p.stock_qty <= 0
            return (
              <button key={p.id} onClick={() => addProductToCart(p)} disabled={outOfStock}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left border-b last:border-0 ${outOfStock ? 'opacity-40 cursor-not-allowed' : 'hover:bg-primary-50'}`}>
                <div className="w-9 h-9 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0 flex items-center justify-center">
                  {thumb ? <img src={thumb} alt={p.name} className="w-full h-full object-cover" loading="lazy" />
                         : <ShoppingBag size={14} className="text-gray-300" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{p.name}</p>
                  <p className="text-xs text-gray-400">{p.category_name}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-bold text-primary">{formatCurrency(p.sale_price_ttc)}</p>
                  {p.source !== 'restaurant_item' && (
                    <p className={`text-xs ${p.stock_qty > 0 ? 'text-green-600' : 'text-red-500'}`}>
                      {p.stock_qty <= 0 ? 'Rupture' : `Qté: ${formatNumber(p.stock_qty, 0)}`}
                    </p>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* ── MOBILE CATEGORY STRIP ── */}
      <div className="lg:hidden flex overflow-x-auto gap-1.5 px-2 py-1.5 bg-white border-b flex-shrink-0 scrollbar-hide">
        {isRestaurant ? (
          <>
            <MobileCatBtn label="Tout" active={selectedCourse === null} onClick={() => setSelectedCourse(null)} />
            {COURSES.map(c => (
              <MobileCatBtn key={c.value} label={c.label} active={selectedCourse === c.value} onClick={() => setSelectedCourse(c.value)} />
            ))}
          </>
        ) : (
          <>
            <MobileCatBtn label="Tous" active={selectedCategoryId === null} onClick={() => { setSelectedCategoryId(null); setPage(1) }} />
            {categoryTree.map(parent => (
              <MobileCatBtn key={parent.id} label={parent.name} active={selectedCategoryId === parent.id} onClick={() => { setSelectedCategoryId(parent.id); setPage(1) }} />
            ))}
          </>
        )}
      </div>

      {/* ═══ MAIN AREA ══════════════════════════════════════════════════════ */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── CATEGORY SIDEBAR (desktop only) ──────────────────────────── */}
        <div className="hidden lg:flex w-44 bg-white border-r flex-col flex-shrink-0 shadow-sm">
          <div className="px-3 py-2.5 border-b bg-gray-50">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Catégories</p>
          </div>
          <div className="flex-1 overflow-y-auto py-1.5 px-1.5 space-y-0.5">
            {isRestaurant ? (
              <>
                <SidebarBtn label="Tout le menu" active={selectedCourse === null}
                  onClick={() => setSelectedCourse(null)} />
                {COURSES.map(c => (
                  <SidebarBtn key={c.value} label={c.label} active={selectedCourse === c.value}
                    onClick={() => setSelectedCourse(c.value)} />
                ))}
              </>
            ) : (
              <>
                <SidebarBtn label="Tous les articles" active={selectedCategoryId === null}
                  onClick={() => { setSelectedCategoryId(null); setPage(1) }} count={totalProducts > 0 && selectedCategoryId === null ? totalProducts : undefined} />
                {categoryTree.map(parent => (
                  <div key={parent.id}>
                    <SidebarBtn label={parent.name} active={selectedCategoryId === parent.id}
                      onClick={() => { setSelectedCategoryId(parent.id); setPage(1) }} />
                    {(parent.children ?? []).map(child => (
                      <SidebarBtn key={child.id} label={child.name} indent active={selectedCategoryId === child.id}
                        onClick={() => { setSelectedCategoryId(child.id); setPage(1) }} />
                    ))}
                  </div>
                ))}
              </>
            )}
          </div>
        </div>

        {/* ── PRODUCT AREA ─────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Tab bar — Favoris / Récents / Catalogue */}
          {!isRestaurant && (
            <div className="bg-white border-b px-3 py-1.5 flex items-center gap-1 flex-shrink-0">
              <TabBtn label="Favoris" icon={<Tag size={12} />}
                active={activeProductTab === 'favorites'}
                badge={topFavorites.length > 0 ? topFavorites.length : undefined}
                onClick={() => setActiveProductTab('favorites')} />
              <TabBtn label="Récents" icon={<Clock size={12} />}
                active={activeProductTab === 'recent'}
                badge={recentItems.length > 0 ? recentItems.length : undefined}
                onClick={() => setActiveProductTab('recent')} />
              <TabBtn label="Catalogue" icon={<ShoppingBag size={12} />}
                active={activeProductTab === 'catalog'}
                badge={activeProductTab === 'catalog' && totalProducts > 0 ? totalProducts : undefined}
                onClick={() => setActiveProductTab('catalog')} />
              {/* Quick counts */}
              <div className="flex-1" />
              {activeProductTab === 'catalog' && !productsLoading && totalProducts > 0 && (
                <p className="text-xs text-gray-400 pr-1">
                  {(page - 1) * PER_PAGE + 1}–{Math.min(page * PER_PAGE, totalProducts)} / {totalProducts}
                </p>
              )}
            </div>
          )}

          {/* Product grid area */}
          <div className="flex-1 p-3 overflow-y-auto">

            {/* ── FAVORIS tab ── */}
            {!isRestaurant && activeProductTab === 'favorites' && (
              topFavorites.length === 0
                ? <EmptyState icon={<Tag size={48} className="mx-auto mb-3 text-gray-200" />}
                    title="Aucun favori encore"
                    sub="Les articles que vous ajoutez au panier apparaissent ici, triés par fréquence." />
                : <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-2">
                    {topFavorites.map(({ item, count }) => (
                      <ProductCard key={item.id} p={item} badge={count > 1 ? `×${count}` : undefined} />
                    ))}
                  </div>
            )}

            {/* ── RECENTS tab ── */}
            {!isRestaurant && activeProductTab === 'recent' && (
              recentItems.length === 0
                ? <EmptyState icon={<Clock size={48} className="mx-auto mb-3 text-gray-200" />}
                    title="Aucun article récent"
                    sub="Les 24 derniers articles ajoutés dans cette session apparaissent ici." />
                : <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-2">
                    {recentItems.map(p => <ProductCard key={p.id} p={p} />)}
                  </div>
            )}

            {/* ── CATALOGUE tab (ou restaurant) ── */}
            {(activeProductTab === 'catalog' || isRestaurant) && (
              <>
                {productsLoading && (
                  <div className="flex flex-col items-center justify-center h-full text-gray-400">
                    <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mb-3" />
                    <p className="text-sm">Chargement...</p>
                  </div>
                )}
                {productsError && (
                  <EmptyState icon={<Scan size={48} className="mx-auto mb-3 text-red-200" />}
                    title="Erreur de chargement" sub="Vérifiez la connexion au serveur." />
                )}
                {!productsLoading && !productsError && displayProducts.length === 0 && (
                  <EmptyState icon={<Scan size={48} className="mx-auto mb-3 text-gray-200" />}
                    title="Aucun article disponible" sub="Tous les articles sont en rupture de stock." />
                )}
                {!productsLoading && displayProducts.length > 0 && (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-2">
                      {displayProducts.map(p => <ProductCard key={p.id} p={p} />)}
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                      <div className="mt-4 mb-2 flex items-center justify-center gap-2">
                        <button
                          onClick={() => setPage(p => Math.max(1, p - 1))}
                          disabled={page === 1}
                          className="px-3 py-1.5 rounded-lg border text-sm font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                          ← Préc.
                        </button>
                        <div className="flex items-center gap-1">
                          {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                            let p = i + 1
                            if (totalPages > 7) {
                              if (page <= 4) p = i + 1
                              else if (page >= totalPages - 3) p = totalPages - 6 + i
                              else p = page - 3 + i
                            }
                            return (
                              <button key={p} onClick={() => setPage(p)}
                                className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors ${page === p ? 'bg-primary text-white' : 'border text-gray-600 hover:bg-gray-100'}`}>
                                {p}
                              </button>
                            )
                          })}
                        </div>
                        <button
                          onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                          disabled={page === totalPages}
                          className="px-3 py-1.5 rounded-lg border text-sm font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                          Suiv. →
                        </button>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </div>

        {/* ══ PANIER ══════════════════════════════════════════════════════ */}
        {/* Mobile backdrop */}
        {mobileCartOpen && (
          <div className="fixed inset-0 bg-black/40 z-40 lg:hidden" onClick={() => setMobileCartOpen(false)} />
        )}
        <div className={`
          fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl max-h-[88vh]
          lg:static lg:w-80 lg:rounded-none lg:max-h-none lg:z-auto
          bg-white border-l flex flex-col shadow-xl flex-shrink-0
          transition-transform duration-300 ease-in-out
          ${mobileCartOpen ? 'translate-y-0' : 'translate-y-full lg:translate-y-0'}
        `}>

          {/* Cart header */}
          <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between flex-shrink-0">
            <h2 className="font-bold text-gray-800 flex items-center gap-2 text-sm">
              <ShoppingBag size={16} className="text-primary" /> Panier
              {items.length > 0 && (
                <span className="bg-primary text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                  {items.length}
                </span>
              )}
            </h2>
            <div className="flex items-center gap-2">
              {client_name && (
                <span className="text-xs bg-primary-50 text-primary px-2 py-0.5 rounded-lg font-medium truncate max-w-[100px]">
                  {client_name}
                </span>
              )}
              <button onClick={() => setMobileCartOpen(false)} className="lg:hidden text-gray-400 hover:text-gray-600 p-1">
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Items */}
          <div className="flex-1 overflow-y-auto px-3 py-1.5">
            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-300 pb-6">
                <ShoppingBag size={40} className="mb-2 opacity-50" />
                <p className="text-sm">Panier vide</p>
                <p className="text-xs text-gray-400 mt-1">Scannez ou cliquez sur un article</p>
              </div>
            ) : (
              items.map(item => (
                <CartItemRow
                  key={item.product_id}
                  item={item}
                  onQtyChange={updateQty}
                  onDiscountChange={updateDiscount}
                  onRemove={removeItem}
                />
              ))
            )}
          </div>

          {/* Footer */}
          <div className="border-t p-3 space-y-2.5 flex-shrink-0 bg-gray-50">
            {/* Per-item discounts line */}
            {items.reduce((s, i) => s + i.discount_amount, 0) > 0 && (
              <div className="flex justify-between text-xs text-green-600 font-medium">
                <span>Remises articles</span>
                <span>-{formatCurrency(items.reduce((s, i) => s + i.discount_amount, 0))}</span>
              </div>
            )}

            {/* Cart-level discount input */}
            {items.length > 0 && (
              <div className="flex items-center gap-1.5">
                <Tag size={11} className="text-orange-400 flex-shrink-0" />
                <span className="text-xs text-gray-500 flex-shrink-0">Remise globale</span>
                <input
                  type="number"
                  min={0}
                  max={itemsTotal}
                  value={cart_discount_amount || ''}
                  onChange={e => {
                    const v = parseFloat(e.target.value) || 0
                    setCartDiscount(Math.min(itemsTotal, v))
                  }}
                  placeholder="0"
                  className="flex-1 min-w-0 w-0 text-right text-xs border border-orange-200 rounded-lg px-2 py-1 bg-orange-50/60 text-orange-700 focus:outline-none focus:ring-1 focus:ring-orange-300 font-mono"
                />
                <span className="text-xs text-gray-400 flex-shrink-0">FCFA</span>
                {cart_discount_amount > 0 && (
                  <button type="button" onClick={() => setCartDiscount(0)} className="text-gray-300 hover:text-red-400 transition-colors flex-shrink-0">
                    <X size={11} />
                  </button>
                )}
              </div>
            )}

            {/* Total */}
            <div className="flex justify-between items-center">
              <span className="text-sm font-bold text-gray-700">TOTAL TTC</span>
              <span className="text-2xl font-black text-primary tracking-tight">{formatCurrency(totalTtc)}</span>
            </div>

            {/* Hold / Suspend */}
            <div className="grid grid-cols-2 gap-1.5">
              <button
                onClick={() => { if (on_hold_carts.length > 0) setShowHoldCarts(true) }}
                onDoubleClick={() => items.length > 0 && holdCart()}
                title="Double-clic pour mettre en attente"
                disabled={items.length === 0 && on_hold_carts.length === 0}
                className="flex items-center justify-center gap-1 py-2 border border-amber-300 text-amber-600 rounded-lg text-xs hover:bg-amber-50 disabled:opacity-30 font-medium">
                <PauseCircle size={13} />
                {on_hold_carts.length > 0 ? `Attente (${on_hold_carts.length})` : 'En attente'}
              </button>
              <button
                onClick={() => items.length > 0 && holdCart()}
                disabled={items.length === 0}
                className="flex items-center justify-center gap-1 py-2 border border-gray-200 text-gray-500 rounded-lg text-xs hover:bg-gray-100 disabled:opacity-30 font-medium">
                <PauseCircle size={13} /> Suspendre
              </button>
            </div>

            {/* Inventory block banner */}
            {salesBlocked && (
              <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-semibold">
                <AlertTriangle size={13} className="flex-shrink-0" />
                Ventes bloquées — inventaire en cours
              </div>
            )}

            {/* Pay button */}
            <button
              onClick={() => {
                if (salesBlocked) {
                  toast.error('Les ventes sont bloquées pendant l\'inventaire en cours.')
                  return
                }
                setShowPayment(true)
              }}
              disabled={items.length === 0 || processing}
              className={`w-full py-3.5 text-white text-base font-bold rounded-xl transition-colors flex items-center justify-center gap-2 shadow-lg ${
                salesBlocked
                  ? 'bg-red-400 hover:bg-red-500 shadow-red-200/50'
                  : 'bg-primary hover:bg-primary-600 disabled:bg-primary/30 shadow-primary/20'
              }`}>
              {salesBlocked ? <AlertTriangle size={20} /> : <Receipt size={20} />}
              {salesBlocked ? 'Ventes bloquées' : 'Encaisser'}
            </button>

            {/* Clear cart */}
            <button
              onClick={async () => { if (await confirm('Vider le panier ?', { danger: true })) clearCart() }}
              disabled={items.length === 0}
              className="w-full py-1.5 text-xs text-red-400 hover:text-red-600 disabled:opacity-30 flex items-center justify-center gap-1 transition-colors">
              <Trash2 size={12} /> Vider le panier
            </button>
          </div>
        </div>
      </div>

      {/* ── MOBILE CART FAB ──────────────────────────────────────────────── */}
      {!mobileCartOpen && (
        <button
          onClick={() => setMobileCartOpen(true)}
          className="lg:hidden fixed bottom-5 right-5 z-30 w-14 h-14 bg-primary text-white rounded-full shadow-lg flex items-center justify-center"
        >
          <ShoppingBag size={22} />
          {items.length > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center font-bold">
              {items.length > 9 ? '9+' : items.length}
            </span>
          )}
        </button>
      )}

      {/* ═══ MODALS ══════════════════════════════════════════════════════════ */}
      {showPayment && (
        <PaymentModal
          total={totalTtc}
          cartDiscountAmount={cart_discount_amount}
          clientAccountBalance={client_name != null ? (client_account_balance ?? 0) : undefined}
          clientName={client_name ?? undefined}
          clientId={client_id}
          onClose={() => {
            setShowPayment(false)
            setSavedPayments(null)
            setPendingDeposit(false)
          }}
          onConfirm={handleSaleConfirm}
          processing={processing}
          initialPayments={savedPayments ?? undefined}
          onNeedClient={() => {
            setShowPayment(false)
            setClientSearchFromPayment(true)
            setShowClientSearch(true)
          }}
          onNeedClientForDeposit={(pmts) => {
            setSavedPayments(pmts)
            setPendingDeposit(true)
            setShowPayment(false)
            setClientSearchFromPayment(true)
            setShowClientSearch(true)
          }}
        />
      )}
      {showClientSearch && (
        <ClientSearchModal
          onSelect={(c) => {
            setClient(c.id, c.name, c.account_balance ?? 0)
            setShowClientSearch(false)
            if (clientSearchFromPayment) {
              setClientSearchFromPayment(false)
              if (pendingDeposit && savedPayments) {
                // Calculer la monnaie sur la base des paiements sauvegardés
                const paidSoFar = savedPayments
                  .filter(p => p.method !== 'account_deposit')
                  .reduce((s, p) => s + p.amount, 0)
                const change = Math.max(0, paidSoFar - totalTtc)
                if (change > 0) {
                  // Réduire les espèces du montant de la monnaie et ajouter le dépôt
                  const withDeposit: PaymentEntry[] = [
                    ...savedPayments
                      .map(p => p.method === 'cash' ? { ...p, amount: Math.max(0, p.amount - change) } : p)
                      .filter(p => p.method !== 'account_deposit'),
                    { method: 'account_deposit', amount: change },
                  ]
                  setSavedPayments(withDeposit)
                }
              }
              setPendingDeposit(false)
              setShowPayment(true)
            }
          }}
          onClose={() => {
            setShowClientSearch(false)
            setClientSearchFromPayment(false)
            setPendingDeposit(false)
            setSavedPayments(null)
          }}
        />
      )}
      {showHoldCarts && (
        <HoldCartsModal
          carts={on_hold_carts}
          onRecall={recallCart}
          onClose={() => setShowHoldCarts(false)}
        />
      )}
      {showSessions && (
        <SessionsHistoryModal onClose={() => setShowSessions(false)} />
      )}
      {showCloseSession && (
        <CloseSessionModal
          session={session}
          onClose={() => { setShowCloseSession(false); if (!cash_session_id) setSession(null) }}
        />
      )}
      {saleReceipt && (
        <ReceiptModal sale={saleReceipt} onNewSale={() => setSaleReceipt(null)} />
      )}
      {showRecentSales && (
        <PosRecentSalesModal onClose={() => setShowRecentSales(false)} />
      )}
    </div>
  )
}

// ─── Small helper components (defined after PosPage to access closures) ────────

function MobileCatBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${
        active ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
      }`}
    >
      {label}
    </button>
  )
}

function SidebarBtn({
  label, active, onClick, indent = false, count,
}: { label: string; active: boolean; onClick: () => void; indent?: boolean; count?: number }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-lg transition-colors flex items-center justify-between gap-1 ${indent ? 'pl-5 pr-2 py-1 text-[11px]' : 'px-2.5 py-2 text-xs font-medium'} ${
        active
          ? indent ? 'bg-primary-100 text-primary font-semibold' : 'bg-primary text-white'
          : indent ? 'text-gray-500 hover:bg-gray-50' : 'text-gray-700 hover:bg-gray-100'
      }`}>
      <span className="truncate">{label}</span>
      {count !== undefined && (
        <span className={`text-[9px] px-1 rounded-full flex-shrink-0 ${active && !indent ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-400'}`}>
          {count}
        </span>
      )}
    </button>
  )
}

function TabBtn({
  label, icon, active, badge, onClick,
}: { label: string; icon: React.ReactNode; active: boolean; badge?: number; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
        active ? 'bg-primary text-white shadow-sm' : 'text-gray-500 hover:bg-gray-100'
      }`}>
      {icon}
      {label}
      {badge !== undefined && (
        <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${active ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-500'}`}>
          {badge}
        </span>
      )}
    </button>
  )
}

function EmptyState({ icon, title, sub }: { icon: React.ReactNode; title: string; sub: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full py-16 text-center px-4">
      {icon}
      <p className="text-sm font-medium text-gray-500 mb-1">{title}</p>
      <p className="text-xs text-gray-400">{sub}</p>
    </div>
  )
}
