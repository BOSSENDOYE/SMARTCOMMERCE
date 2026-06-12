import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { v4 as uuidv4 } from 'uuid'
import api from '../../lib/api'
import { usePosStore, type CartItem } from '../../store/pos.store'
import { useAuthStore } from '../../store/auth.store'
import { db, findProductByBarcode, searchProductsOffline, savePendingSale, type CachedProduct } from '../../lib/offline-db'
import { formatCurrency, formatNumber } from '../../lib/format'
import toast from 'react-hot-toast'
import {
  Search, Scan, Trash2, Plus, Minus, Percent, CreditCard, Banknote,
  Smartphone, ShoppingBag, PauseCircle, PlayCircle, UserPlus, X, Check,
  Wifi, WifiOff, Receipt, ChevronRight, Lock, Unlock, ArrowLeft,
  DollarSign, Tag, Users,
} from 'lucide-react'

// ─── Constants ────────────────────────────────────────────────────────────────

const PAYMENT_METHODS = [
  { key: 'cash', label: 'Espèces', icon: <Banknote size={18} />, color: 'green' },
  { key: 'wave', label: 'Wave', icon: <Smartphone size={18} />, color: 'blue' },
  { key: 'orange_money', label: 'Orange Money', icon: <Smartphone size={18} />, color: 'orange' },
  { key: 'free_money', label: 'Free Money', icon: <Smartphone size={18} />, color: 'red' },
  { key: 'card', label: 'Carte', icon: <CreditCard size={18} />, color: 'purple' },
  { key: 'credit', label: 'Crédit client', icon: <ShoppingBag size={18} />, color: 'yellow' },
]

// ─── Types ────────────────────────────────────────────────────────────────────

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
}

interface Category {
  id: number
  name: string
  type?: string
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
    onError: () => toast.error('Erreur lors de la clôture'),
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
              const label = PAYMENT_METHODS.find(p => p.key === m)?.label ?? m
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
  const [q, setQ] = useState('')
  const { data: results = [], isFetching } = useQuery<Client[]>({
    queryKey: ['clients-search', q],
    queryFn: () => q.length >= 2 ? api.get('/clients/search', { params: { q } }).then(r => r.data) : Promise.resolve([]),
    enabled: q.length >= 2,
  })

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        <div className="p-6 border-b flex items-center justify-between">
          <h2 className="text-lg font-bold flex items-center gap-2"><Users size={18} /> Rechercher un client</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <div className="p-4">
          <div className="relative">
            <input
              autoFocus
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Nom ou numéro de téléphone..."
              className="input pl-10"
            />
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          </div>
        </div>
        <div className="max-h-64 overflow-y-auto divide-y">
          {q.length >= 2 && !isFetching && results.length === 0 && (
            <p className="px-4 py-6 text-center text-gray-400 text-sm">Aucun client trouvé</p>
          )}
          {results.map(c => (
            <button key={c.id} onClick={() => onSelect(c)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-primary-50 text-left">
              <div>
                <p className="text-sm font-medium text-gray-900">{c.name}</p>
                {c.phone && <p className="text-xs text-gray-400">{c.phone}</p>}
              </div>
              {c.credit_balance != null && c.credit_balance > 0 && (
                <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                  Crédit {formatCurrency(c.credit_balance)}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="p-4 border-t">
          <button onClick={onClose} className="w-full btn-secondary text-sm">Continuer sans client</button>
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

function PaymentModal({ total, onClose, onConfirm, processing }: {
  total: number
  onClose: () => void
  onConfirm: (payments: { payment_method: string; amount: number }[]) => void
  processing: boolean
}) {
  const [payments, setPayments] = useState<{ method: string; amount: number }[]>([
    { method: 'cash', amount: total }
  ])

  const totalPaid = payments.reduce((s, p) => s + (p.amount || 0), 0)
  const change = totalPaid - total
  const ready = totalPaid >= total

  const addMethod = (method: string) => {
    if (!payments.find(p => p.method === method)) {
      const remaining = Math.max(0, total - payments.reduce((s, p) => s + p.amount, 0))
      setPayments([...payments, { method, amount: remaining }])
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl">
        <div className="p-6 border-b flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold">Encaissement</h2>
            <p className="text-3xl font-bold text-primary mt-1">{formatCurrency(total)}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <div className="p-6 space-y-4">
          {/* Mode picker */}
          <div className="flex flex-wrap gap-2">
            {PAYMENT_METHODS.map(m => (
              <button key={m.key} onClick={() => addMethod(m.key)}
                className={`flex items-center gap-1 px-3 py-2 rounded-lg text-sm border transition-colors ${
                  payments.find(p => p.method === m.key)
                    ? 'bg-primary text-white border-primary'
                    : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                }`}>
                {m.icon} {m.label}
              </button>
            ))}
          </div>

          {/* Amount inputs */}
          <div className="space-y-2">
            {payments.map((p, i) => {
              const method = PAYMENT_METHODS.find(m => m.key === p.method)
              return (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-sm font-medium w-32 flex-shrink-0 text-gray-700">{method?.label ?? p.method}</span>
                  <input
                    type="number"
                    value={p.amount}
                    onChange={e => {
                      const updated = [...payments]
                      updated[i] = { ...updated[i], amount: parseFloat(e.target.value) || 0 }
                      setPayments(updated)
                    }}
                    className="input flex-1"
                    min={0}
                    step={100}
                  />
                  {payments.length > 1 && (
                    <button onClick={() => setPayments(payments.filter((_, j) => j !== i))}
                      className="text-gray-400 hover:text-red-500">
                      <X size={16} />
                    </button>
                  )}
                </div>
              )
            })}
          </div>

          {/* Summary */}
          <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Total à payer</span>
              <span className="font-bold">{formatCurrency(total)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Reçu</span>
              <span className={`font-bold ${totalPaid >= total ? 'text-green-600' : 'text-red-500'}`}>
                {formatCurrency(totalPaid)}
              </span>
            </div>
            {change > 0 && (
              <div className="flex justify-between border-t pt-2">
                <span className="font-semibold">Rendu monnaie</span>
                <span className="font-bold text-green-600 text-lg">{formatCurrency(change)}</span>
              </div>
            )}
          </div>
        </div>
        <div className="p-6 flex gap-3 border-t">
          <button onClick={onClose} className="btn-secondary flex-1">Annuler</button>
          <button
            onClick={() => onConfirm(payments.map(p => ({ payment_method: p.method, amount: p.amount })))}
            disabled={!ready || processing}
            className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-50">
            <Check size={18} /> {processing ? 'Traitement...' : 'Valider la vente'}
          </button>
        </div>
      </div>
    </div>
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

// ─── Main POS Page ────────────────────────────────────────────────────────────

export default function PosPage() {
  const { user } = useAuthStore()
  const {
    items, addItem, updateQty, updateDiscount, removeItem, clearCart,
    client_id, client_name, setClient, cash_session_id, setCashSession,
    holdCart, recallCart, on_hold_carts, is_offline, setOffline,
  } = usePosStore()

  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState<CachedProduct[]>([])
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null)
  const [showPayment, setShowPayment] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [showCloseSession, setShowCloseSession] = useState(false)
  const [showClientSearch, setShowClientSearch] = useState(false)
  const [showHoldCarts, setShowHoldCarts] = useState(false)
  const [session, setSession] = useState<CashSession | null>(null)
  const [sessionLoading, setSessionLoading] = useState(true)

  const searchRef = useRef<HTMLInputElement>(null)

  const totalTtc = items.reduce((s, i) => s + i.total_ttc, 0)
  const totalDiscount = items.reduce((s, i) => s + i.discount_amount, 0)

  // Check online status
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    update()
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update) }
  }, [setOffline])

  // Load current session on mount
  useEffect(() => {
    api.get('/cash-sessions/current')
      .then(res => {
        if (res.data) {
          setSession(res.data)
          setCashSession(res.data.id)
        }
      })
      .catch(() => {})
      .finally(() => setSessionLoading(false))
  }, [setCashSession])

  // Fetch categories
  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['categories-flat'],
    queryFn: () => api.get('/categories').then(r =>
      r.data.flatMap((c: { id: number; name: string; children?: Category[] }) => [c, ...(c.children ?? [])])
    ),
  })

  // Fetch products for grid (by category)
  const { data: gridProducts = [] } = useQuery<CachedProduct[]>({
    queryKey: ['pos-products', selectedCategoryId],
    queryFn: () => api.get('/products', {
      params: { category_id: selectedCategoryId ?? undefined, per_page: 50, is_active: true }
    }).then(res => res.data.data.map((p: {
      id: number; internal_code: string; name: string; short_name: string
      sale_price_ttc: number; vat_rate: number; is_weight_based: boolean
      category?: { name: string }; stockLevel?: { qty_on_hand: number }
      barcodes: { barcode: string }[]
    }) => ({
      id: p.id,
      internal_code: p.internal_code,
      name: p.name,
      short_name: p.short_name,
      sale_price_ttc: p.sale_price_ttc,
      vat_rate: p.vat_rate,
      is_weight_based: p.is_weight_based,
      category_name: p.category?.name,
      stock_qty: p.stockLevel?.qty_on_hand ?? 0,
      barcodes: p.barcodes?.map(b => b.barcode) ?? [],
    }))),
    enabled: !is_offline,
  })

  // Search products
  useEffect(() => {
    if (!search || search.length < 2) { setSearchResults([]); return }
    const timer = setTimeout(async () => {
      if (is_offline) {
        setSearchResults(await searchProductsOffline(search))
      } else {
        try {
          const res = await api.get('/products', { params: { search, per_page: 10, is_active: true } })
          setSearchResults(res.data.data.map((p: {
            id: number; internal_code: string; name: string; short_name: string
            sale_price_ttc: number; vat_rate: number; is_weight_based: boolean
            category?: { name: string }; stockLevel?: { qty_on_hand: number }
            barcodes: { barcode: string }[]
          }) => ({
            id: p.id,
            internal_code: p.internal_code,
            name: p.name,
            short_name: p.short_name,
            sale_price_ttc: p.sale_price_ttc,
            vat_rate: p.vat_rate,
            is_weight_based: p.is_weight_based,
            category_name: p.category?.name,
            stock_qty: p.stockLevel?.qty_on_hand ?? 0,
            barcodes: p.barcodes?.map(b => b.barcode) ?? [],
          })))
        } catch {
          setSearchResults(await searchProductsOffline(search))
        }
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [search, is_offline])

  const handleScanOrSearch = async (value: string) => {
    if (!value.trim()) return
    if (/^\d{8,14}$/.test(value.trim())) {
      let product: CachedProduct | undefined
      if (is_offline) {
        product = await findProductByBarcode(value.trim())
      } else {
        try {
          const res = await api.get('/products/barcode', { params: { barcode: value.trim() } })
          product = res.data
        } catch {
          product = await findProductByBarcode(value.trim())
        }
      }
      if (product) { addProductToCart(product); setSearch(''); return }
      toast.error(`Produit non trouvé : ${value}`)
      return
    }
    setSearch(value)
  }

  const addProductToCart = useCallback((product: CachedProduct) => {
    addItem({
      product_id: product.id,
      product_name: product.name,
      qty: 1,
      unit_price_ttc: product.sale_price_ttc,
      vat_rate: product.vat_rate,
      is_weight_based: product.is_weight_based,
      discount_pct: 0,
    })
    setSearch('')
    setSearchResults([])
    searchRef.current?.focus()
    toast.success(`${product.short_name ?? product.name} ajouté`, { duration: 800 })
  }, [addItem])

  const handleSaleConfirm = async (payments: { payment_method: string; amount: number }[]) => {
    if (items.length === 0) return
    setProcessing(true)
    const offline_id = `OFL-${Date.now()}-${uuidv4().slice(0, 8)}`

    const salePayload = {
      store_id: user!.store_id,
      user_id: user!.id,
      cash_session_id,
      client_id,
      items: items.map(i => ({
        product_id: i.product_id,
        qty: i.qty,
        unit_price_ttc: i.unit_price_ttc,
        discount_pct: i.discount_pct,
        lot_id: i.lot_id,
      })),
      payments,
      offline_id,
      channel: 'pos',
    }

    if (is_offline) {
      await savePendingSale({
        offline_id,
        store_id: user!.store_id!,
        user_id: user!.id,
        cash_session_id: cash_session_id ?? undefined,
        client_id: client_id ?? undefined,
        items: items.map(i => ({
          product_id: i.product_id,
          product_name: i.product_name,
          qty: i.qty,
          unit_price_ttc: i.unit_price_ttc,
          discount_pct: i.discount_pct,
          discount_amount: i.discount_amount,
          total_ttc: i.total_ttc,
          vat_rate: i.vat_rate,
          is_weight_based: i.is_weight_based,
        })),
        payments,
        total_ttc: totalTtc,
        status: 'pending',
        created_at: new Date().toISOString(),
      })
      toast.success('Vente enregistrée hors-ligne — sera synchronisée dès le retour d\'Internet')
      clearCart()
      setShowPayment(false)
      setProcessing(false)
      return
    }

    try {
      await api.post('/sales', salePayload)
      toast.success('Vente enregistrée !')
      clearCart()
      setShowPayment(false)
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Erreur lors de l\'enregistrement'
      toast.error(message)
    } finally {
      setProcessing(false)
    }
  }

  // Show session loading screen
  if (sessionLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-100">
        <p className="text-gray-500">Vérification de la session...</p>
      </div>
    )
  }

  // Show open session gate
  if (!session) {
    return (
      <OpenSessionModal onOpened={(s) => { setSession(s); setCashSession(s.id) }} />
    )
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-100">

      {/* ── Left panel ── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Top bar */}
        <div className="bg-white border-b px-4 py-2.5 flex items-center gap-3">
          {/* Online indicator */}
          <div className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full flex-shrink-0 ${is_offline ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
            {is_offline ? <WifiOff size={11} /> : <Wifi size={11} />}
            {is_offline ? 'HORS-LIGNE' : 'En ligne'}
          </div>

          {/* Search / barcode */}
          <div className="relative flex-1">
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={e => handleScanOrSearch(e.target.value)}
              placeholder="Scanner code-barres ou chercher..."
              className="input pl-10 text-base"
              autoFocus
            />
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            {search && (
              <button onClick={() => { setSearch(''); setSearchResults([]) }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X size={16} />
              </button>
            )}
          </div>

          {/* Client button */}
          <button
            onClick={() => setShowClientSearch(true)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border transition-colors ${client_name ? 'bg-primary-50 text-primary-600 border-primary-200' : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'}`}>
            <UserPlus size={15} />
            {client_name ? client_name : 'Client'}
            {client_name && (
              <button onClick={(e) => { e.stopPropagation(); setClient(null, null) }}
                className="text-primary-400 hover:text-red-500 ml-1">
                <X size={12} />
              </button>
            )}
          </button>

          {/* On-hold pill */}
          {on_hold_carts.length > 0 && (
            <button onClick={() => setShowHoldCarts(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-100 text-amber-700 rounded-lg text-sm border border-amber-200">
              <PauseCircle size={15} /> {on_hold_carts.length}
            </button>
          )}

          {/* Session info + close button */}
          <div className="flex items-center gap-2 text-xs text-gray-500 border-l pl-3">
            <DollarSign size={13} />
            <span>Ouverture {formatCurrency(session.opening_balance)}</span>
          </div>
          <button
            onClick={() => setShowCloseSession(true)}
            className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 border border-red-200 hover:border-red-300 px-2 py-1 rounded-lg">
            <Lock size={12} /> Clôturer
          </button>
        </div>

        {/* Search results overlay */}
        {search.length >= 2 && searchResults.length > 0 && (
          <div className="bg-white border-b shadow-lg max-h-72 overflow-y-auto">
            {searchResults.map(p => (
              <button key={p.id} onClick={() => addProductToCart(p)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-primary-50 text-left border-b last:border-0">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">{p.name}</p>
                  <p className="text-xs text-gray-400">{p.internal_code} · {p.category_name}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-bold text-primary">{formatCurrency(p.sale_price_ttc)}</p>
                  <p className={`text-xs ${p.stock_qty > 0 ? 'text-green-600' : 'text-red-500'}`}>
                    Stock: {formatNumber(p.stock_qty, 0)}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
        {search.length >= 2 && searchResults.length === 0 && (
          <div className="bg-white border-b px-4 py-3 text-sm text-gray-400">Aucun produit trouvé pour «{search}»</div>
        )}

        {/* Category pills */}
        <div className="bg-white border-b px-4 py-2 flex gap-2 overflow-x-auto flex-shrink-0">
          <button
            onClick={() => setSelectedCategoryId(null)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap border transition-colors ${selectedCategoryId === null ? 'bg-primary text-white border-primary' : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-primary-300'}`}>
            Tous
          </button>
          {categories.map(c => (
            <button key={c.id}
              onClick={() => setSelectedCategoryId(c.id)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap border transition-colors ${selectedCategoryId === c.id ? 'bg-primary text-white border-primary' : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-primary-300'}`}>
              {c.name}
            </button>
          ))}
        </div>

        {/* Product grid */}
        <div className="flex-1 p-3 overflow-y-auto">
          {!search && gridProducts.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-gray-300">
              <Scan size={64} className="mb-4" />
              <p className="text-base font-medium">Scannez un code-barres</p>
              <p className="text-sm">ou sélectionnez une catégorie</p>
            </div>
          )}
          {!search && gridProducts.length > 0 && (
            <div className="grid grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-2">
              {gridProducts.map(p => (
                <button
                  key={p.id}
                  onClick={() => addProductToCart(p)}
                  className={`bg-white rounded-xl border p-3 text-left hover:border-primary-400 hover:shadow-sm transition-all group ${p.stock_qty <= 0 ? 'opacity-60' : ''}`}>
                  <div className="w-8 h-8 bg-primary-50 rounded-lg flex items-center justify-center mb-2 group-hover:bg-primary-100">
                    <ShoppingBag size={16} className="text-primary" />
                  </div>
                  <p className="text-xs font-semibold text-gray-900 line-clamp-2 leading-tight mb-1">
                    {p.short_name ?? p.name}
                  </p>
                  <p className="text-sm font-bold text-primary">{formatCurrency(p.sale_price_ttc)}</p>
                  <p className={`text-xs mt-0.5 ${p.stock_qty <= 0 ? 'text-red-500' : p.stock_qty <= 5 ? 'text-amber-500' : 'text-gray-400'}`}>
                    {p.stock_qty <= 0 ? 'Rupture' : `Stock: ${formatNumber(p.stock_qty, 0)}`}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Right panel: Cart ── */}
      <div className="w-96 bg-white border-l flex flex-col shadow-xl">
        {/* Cart header */}
        <div className="p-4 border-b bg-gray-50 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <ShoppingBag size={18} /> Panier
            {items.length > 0 && (
              <span className="bg-primary text-white text-xs px-2 py-0.5 rounded-full">{items.length}</span>
            )}
          </h2>
          {client_name && (
            <span className="text-xs bg-primary-50 text-primary px-2 py-1 rounded-lg">{client_name}</span>
          )}
        </div>

        {/* Items list */}
        <div className="flex-1 overflow-y-auto px-4 py-2">
          {items.length === 0 ? (
            <p className="text-center text-gray-300 py-10 text-sm">Panier vide</p>
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
        <div className="border-t p-4 space-y-3">
          {totalDiscount > 0 && (
            <div className="flex justify-between text-sm text-green-600">
              <span>Remises accordées</span>
              <span>-{formatCurrency(totalDiscount)}</span>
            </div>
          )}
          <div className="flex justify-between items-center">
            <span className="text-lg font-bold text-gray-900">TOTAL</span>
            <span className="text-2xl font-bold text-primary">{formatCurrency(totalTtc)}</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => { if (on_hold_carts.length > 0) setShowHoldCarts(true) }}
              onDoubleClick={() => items.length > 0 && holdCart()}
              title="Double-clic pour mettre en attente"
              disabled={items.length === 0}
              className="flex items-center justify-center gap-1 py-2 px-3 border border-amber-300 text-amber-600 rounded-lg text-sm hover:bg-amber-50 disabled:opacity-40">
              <PauseCircle size={15} />
              {on_hold_carts.length > 0 ? `En attente (${on_hold_carts.length})` : 'Mettre en attente'}
            </button>
            <button
              onClick={() => items.length > 0 && holdCart()}
              disabled={items.length === 0}
              className="flex items-center justify-center gap-1 py-2 px-3 border border-gray-200 text-gray-500 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-40">
              <PauseCircle size={15} /> Suspendre
            </button>
          </div>

          <button
            onClick={() => setShowPayment(true)}
            disabled={items.length === 0 || processing}
            className="w-full py-4 bg-primary hover:bg-primary-600 disabled:bg-blue-300 text-white text-lg font-bold rounded-xl transition-colors flex items-center justify-center gap-2">
            <Receipt size={22} /> Encaisser
          </button>

          <button
            onClick={() => { if (confirm('Vider le panier ?')) clearCart() }}
            disabled={items.length === 0}
            className="w-full py-2 text-sm text-red-400 hover:text-red-600 disabled:opacity-30 flex items-center justify-center gap-1">
            <Trash2 size={14} /> Vider le panier
          </button>
        </div>
      </div>

      {/* ── Modals ── */}
      {showPayment && (
        <PaymentModal
          total={totalTtc}
          onClose={() => setShowPayment(false)}
          onConfirm={handleSaleConfirm}
          processing={processing}
        />
      )}
      {showClientSearch && (
        <ClientSearchModal
          onSelect={(c) => { setClient(c.id, c.name); setShowClientSearch(false) }}
          onClose={() => setShowClientSearch(false)}
        />
      )}
      {showHoldCarts && (
        <HoldCartsModal
          carts={on_hold_carts}
          onRecall={recallCart}
          onClose={() => setShowHoldCarts(false)}
        />
      )}
      {showCloseSession && (
        <CloseSessionModal
          session={session}
          onClose={() => { setShowCloseSession(false); if (!cash_session_id) setSession(null) }}
        />
      )}
    </div>
  )
}
