import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { v4 as uuidv4 } from 'uuid'
import QRCode from 'react-qr-code'
import api from '../../lib/api'
import { usePosStore, type CartItem } from '../../store/pos.store'
import { useAuthStore } from '../../store/auth.store'
import {
  db, findProductByBarcode, searchProductsOffline,
  savePendingSale, cacheProducts, type CachedProduct,
} from '../../lib/offline-db'
import { formatCurrency, formatNumber, imageUrl } from '../../lib/format'
import toast from 'react-hot-toast'
import {
  Search, ShoppingBag, Plus, Minus, X, Check, Wifi, WifiOff,
  Lock, Unlock, Percent, Printer, ArrowLeft, Receipt as ReceiptIcon,
  ChevronUp, Trash2, Tag,
} from 'lucide-react'
import PaymentPanel, { type PaymentEntry } from '../../components/PaymentPanel'

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
}

interface CashSession {
  id: number
  opening_balance: number
  opened_at: string
  status: string
  user?: { name: string }
}

interface CategoryNode { id: number; name: string; children?: CategoryNode[] }

interface SaleReceipt {
  id: number
  reference: string
  total_ttc: number
  subtotal_ht: number
  vat_amount: number
  discount_amount: number
  paid_amount: number
  change_amount: number
  loyalty_points_earned: number
  created_at: string
  items: {
    product?: { name: string; short_name?: string } | null
    qty: number
    unit_price_ttc: number
    discount_pct: number
    total_ttc: number
  }[]
  payments: { payment_method: string; amount: number }[]
  ticket?: { number: string; qr_code: string }
  client?: { id: number; name: string }
  user?: { id: number; name: string }
  store?: { name: string; address?: string; phone?: string; ninea?: string; receipt_footer?: string }
}

type View = 'pos' | 'cart' | 'checkout' | 'receipt'

const PAY_LABELS: Record<string, string> = {
  cash: 'Espèces', wave: 'Wave', orange_money: 'Orange Money',
  free_money: 'Free Money', card: 'Carte', credit: 'Crédit client',
}

// ─── Open Session ─────────────────────────────────────────────────────────────

function OpenSessionScreen({ onOpened }: { onOpened: (s: CashSession) => void }) {
  const [amount, setAmount] = useState('0')
  const mut = useMutation({
    mutationFn: () => api.post('/cash-sessions/open', { opening_balance: Number(amount) }),
    onSuccess: r => onOpened(r.data),
    onError: () => toast.error("Impossible d'ouvrir la session"),
  })

  return (
    <div className="fixed inset-0 bg-gray-900 flex flex-col items-center justify-center p-6">
      <div className="bg-white rounded-3xl w-full max-w-sm p-8 space-y-6">
        <div className="text-center space-y-2">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
            <Lock size={28} className="text-primary" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900">Ouvrir la caisse</h2>
          <p className="text-gray-500 text-sm">Saisissez le fond de caisse de départ</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Fond de caisse (FCFA)</label>
          <input
            type="number"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            className="w-full border-2 border-gray-200 rounded-2xl px-4 py-4 text-2xl font-bold text-center focus:outline-none focus:border-primary"
            min={0}
            autoFocus
          />
        </div>
        <button
          onClick={() => mut.mutate()}
          disabled={mut.isPending}
          className="w-full py-4 bg-primary text-white font-bold rounded-2xl text-lg flex items-center justify-center gap-2 active:opacity-90"
        >
          <Unlock size={20} />
          {mut.isPending ? 'Ouverture...' : 'Ouvrir la caisse'}
        </button>
      </div>
    </div>
  )
}

// ─── Cart Item ────────────────────────────────────────────────────────────────

function MobileCartItem({
  item,
  onQtyChange,
  onRemove,
  onDiscountChange,
}: {
  item: CartItem
  onQtyChange: (id: number, qty: number) => void
  onRemove: (id: number) => void
  onDiscountChange: (id: number, pct: number) => void
}) {
  const [editDiscount, setEditDiscount] = useState(false)
  const [discInput, setDiscInput] = useState(item.discount_pct.toString())

  const applyDiscount = () => {
    onDiscountChange(item.product_id, Math.min(100, Math.max(0, parseFloat(discInput) || 0)))
    setEditDiscount(false)
  }

  return (
    <div className="py-3 border-b border-gray-100 last:border-0">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 text-sm leading-tight">{item.product_name}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {formatCurrency(item.unit_price_ttc)} × {formatNumber(item.qty, item.is_weight_based ? 3 : 0)}
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="font-bold text-primary">{formatCurrency(item.total_ttc)}</p>
          {item.discount_pct > 0 && <p className="text-xs text-green-600">-{item.discount_pct}%</p>}
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2 mt-2.5">
        <button
          onClick={() => onQtyChange(item.product_id, item.qty - (item.is_weight_based ? 0.1 : 1))}
          className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center active:bg-gray-200 flex-shrink-0"
        >
          <Minus size={15} />
        </button>
        <span className="w-10 text-center font-bold text-sm">
          {formatNumber(item.qty, item.is_weight_based ? 2 : 0)}
        </span>
        <button
          onClick={() => onQtyChange(item.product_id, item.qty + (item.is_weight_based ? 0.1 : 1))}
          className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center active:bg-gray-200 flex-shrink-0"
        >
          <Plus size={15} />
        </button>

        {/* Discount */}
        {!editDiscount ? (
          <button
            onClick={() => { setDiscInput(item.discount_pct.toString()); setEditDiscount(true) }}
            className={`ml-1 flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs border font-medium transition-colors ${
              item.discount_pct > 0
                ? 'bg-green-50 text-green-600 border-green-200'
                : 'bg-gray-50 text-gray-400 border-gray-200'
            }`}
          >
            <Percent size={10} />
            {item.discount_pct > 0 ? `${item.discount_pct}%` : 'Remise'}
          </button>
        ) : (
          <div className="ml-1 flex items-center gap-1">
            <input
              autoFocus
              type="number"
              value={discInput}
              onChange={e => setDiscInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') applyDiscount(); if (e.key === 'Escape') setEditDiscount(false) }}
              className="w-14 border-2 border-primary rounded-xl px-2 py-1 text-xs text-center focus:outline-none"
              min={0}
              max={100}
            />
            <span className="text-xs text-gray-400">%</span>
            <button onClick={applyDiscount} className="text-green-500 active:opacity-70"><Check size={16} /></button>
            <button onClick={() => setEditDiscount(false)} className="text-gray-400"><X size={14} /></button>
          </div>
        )}

        {/* Remove */}
        <button
          onClick={() => onRemove(item.product_id)}
          className="ml-auto w-8 h-8 flex items-center justify-center text-gray-300 active:text-red-500 rounded-lg"
        >
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  )
}

// ─── Receipt ──────────────────────────────────────────────────────────────────

function ReceiptScreen({ sale, onNewSale }: { sale: SaleReceipt; onNewSale: () => void }) {
  const dt      = new Date(sale.created_at)
  const dateStr = dt.toLocaleDateString('fr-SN', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const timeStr = dt.toLocaleTimeString('fr-SN', { hour: '2-digit', minute: '2-digit' })
  const qrValue = sale.ticket ? `SC:${sale.reference}:${sale.ticket.qr_code}` : sale.reference

  const sep = <div style={{ borderTop: '1px dashed #999', margin: '6px 0' }} />

  const receiptBody = (
    <div style={{ fontFamily: "'Courier New', Courier, monospace", fontSize: 12, lineHeight: 1.55, color: '#000' }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 6 }}>
        <div style={{ fontWeight: 'bold', fontSize: 15, letterSpacing: 1 }}>
          {sale.store?.name?.toUpperCase() ?? 'BOUTIQUE'}
        </div>
        {sale.store?.address && <div style={{ fontSize: 10 }}>{sale.store.address}</div>}
        {sale.store?.phone   && <div style={{ fontSize: 10 }}>Tél : {sale.store.phone}</div>}
        {sale.store?.ninea   && <div style={{ fontSize: 10 }}>NINEA : {sale.store.ninea}</div>}
      </div>
      {sep}

      {/* Meta */}
      <div>
        {([
          ['Référence', sale.reference],
          ['Date',      `${dateStr}  ${timeStr}`],
          sale.user?.name   ? ['Caissier', sale.user.name]  : null,
          sale.client?.name ? ['Client',   sale.client.name] : null,
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
            <div style={{ fontWeight: 'bold' }}>
              {item.product?.short_name ?? item.product?.name ?? '—'}
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
            <span>Remise</span><span>-{formatCurrency(sale.discount_amount)}</span>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: 14, borderTop: '2px solid #000', marginTop: 4, paddingTop: 4 }}>
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
            ★ {sale.loyalty_points_earned} points de fidélité gagnés
          </div>
        </>
      )}

      {/* QR */}
      <div style={{ textAlign: 'center', margin: '10px 0 6px' }}>
        <div style={{ display: 'inline-block', background: 'white', padding: 3, border: '1px solid #ddd' }}>
          <QRCode value={qrValue} size={88} level="M" />
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
      {/* Screen */}
      <div className="fixed inset-0 bg-gray-50 z-50 flex flex-col">
        {/* Success banner */}
        <div
          className="bg-green-500 px-5 flex items-center gap-4 flex-shrink-0"
          style={{ paddingTop: 'max(16px, env(safe-area-inset-top))', paddingBottom: 16 }}
        >
          <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">
            <Check size={24} className="text-white" />
          </div>
          <div>
            <p className="text-white font-bold text-xl">Vente validée !</p>
            <p className="text-green-100 text-sm">{formatCurrency(sale.total_ttc)} — {sale.reference}</p>
          </div>
        </div>

        {/* Receipt preview */}
        <div className="flex-1 overflow-y-auto bg-white px-5 py-4">
          {receiptBody}
        </div>

        {/* Actions */}
        <div
          className="bg-white border-t px-4 py-3 flex gap-3 flex-shrink-0"
          style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
        >
          <button
            onClick={() => window.print()}
            className="flex-1 flex items-center justify-center gap-2 py-4 border-2 border-gray-200 rounded-2xl text-gray-700 font-semibold text-sm active:bg-gray-50"
          >
            <Printer size={18} /> Imprimer
          </button>
          <button
            onClick={onNewSale}
            className="flex-[2] py-4 bg-primary text-white font-bold rounded-2xl flex items-center justify-center gap-2 text-sm active:opacity-90"
          >
            <ReceiptIcon size={18} /> Nouvelle vente
          </button>
        </div>
      </div>

      {/* Print-only receipt */}
      <div id="receipt-print-root">{receiptBody}</div>
    </>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MobilePosPage() {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()

  const {
    items, addItem, updateQty, updateDiscount, removeItem, clearCart,
    cash_session_id, setCashSession, is_offline, setOffline,
    cart_discount_amount, setCartDiscount,
  } = usePosStore()

  const [view, setView] = useState<View>('pos')
  const [session, setSession] = useState<CashSession | null>(null)
  const [sessionLoading, setSessionLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState<PosItem[]>([])
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null)
  const [page, setPage] = useState(1)
  const [saleReceipt, setSaleReceipt] = useState<SaleReceipt | null>(null)
  const [processing, setProcessing] = useState(false)
  const [payments, setPayments] = useState<PaymentEntry[]>([])

  const searchRef = useRef<HTMLInputElement>(null)
  const itemsTotal = items.reduce((s, i) => s + i.total_ttc, 0)
  const totalTtc   = Math.max(0, itemsTotal - cart_discount_amount)
  const totalQty   = items.reduce((s, i) => s + i.qty, 0)

  // ── Online/offline ──────────────────────────────────────────────────────────
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    update()
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update) }
  }, [setOffline])

  // ── Session ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    api.get('/cash-sessions/current')
      .then(r => { if (r.data) { setSession(r.data); setCashSession(r.data.id) } })
      .catch(() => {})
      .finally(() => setSessionLoading(false))
  }, [setCashSession])

  // ── Categories ──────────────────────────────────────────────────────────────
  const { data: categoryTree = [] } = useQuery<CategoryNode[]>({
    queryKey: ['categories-tree'],
    queryFn:  () => api.get('/categories').then(r => r.data),
  })

  useEffect(() => { setPage(1) }, [selectedCategoryId])

  // ── Products ────────────────────────────────────────────────────────────────
  const PER_PAGE = 20

  interface ProductPage { items: PosItem[]; total: number; totalPages: number }
  const EMPTY_PAGE: ProductPage = { items: [], total: 0, totalPages: 1 }

  const { data: _productPage, isLoading: productsLoading } = useQuery<ProductPage>({
    queryKey: ['mobile-pos-products', selectedCategoryId, page],
    queryFn:  () => api.get('/products', {
      params: { category_id: selectedCategoryId ?? undefined, per_page: PER_PAGE, page, is_active: true, has_stock: 1 },
    }).then(r => ({
      items: r.data.data.map((p: any) => ({
        id: p.id, name: p.name, short_name: p.short_name,
        sale_price_ttc: p.sale_price_ttc, vat_rate: p.vat_rate,
        is_weight_based: p.is_weight_based,
        stock_qty: p.stock_level?.qty_on_hand ?? 0,
        category_name: p.category?.name, image: p.image ?? null,
      })) as PosItem[],
      total: r.data.meta?.total ?? 0,
      totalPages: r.data.meta?.last_page ?? 1,
    })),
    enabled: !is_offline,
    placeholderData: (prev: ProductPage | undefined) => prev,
  })
  const productPage: ProductPage = _productPage ?? EMPTY_PAGE

  // ── Cache to Dexie ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!is_offline && productPage.items.length > 0) {
      cacheProducts(productPage.items.map((p: PosItem) => ({
        id: p.id, internal_code: p.id.toString(), name: p.name, short_name: p.short_name,
        sale_price_ttc: p.sale_price_ttc, vat_rate: p.vat_rate,
        is_weight_based: p.is_weight_based, category_name: p.category_name,
        stock_qty: p.stock_qty, barcodes: [], updated_at: new Date().toISOString(),
      })))
    }
  }, [productPage.items, is_offline])

  // ── Offline fallback ────────────────────────────────────────────────────────
  const [offlineProducts, setOfflineProducts] = useState<PosItem[]>([])
  useEffect(() => {
    if (is_offline) {
      db.cachedProducts
        .filter(p => selectedCategoryId === null || p.category_id === selectedCategoryId)
        .toArray()
        .then(prods => setOfflineProducts(prods.map(p => ({
          id: p.id, name: p.name, short_name: p.short_name,
          sale_price_ttc: p.sale_price_ttc, vat_rate: p.vat_rate,
          is_weight_based: p.is_weight_based, stock_qty: p.stock_qty,
          category_name: p.category_name,
        }))))
    } else { setOfflineProducts([]) }
  }, [is_offline, selectedCategoryId])

  const displayProducts = is_offline ? offlineProducts : productPage.items
  const totalPages      = is_offline ? 1 : productPage.totalPages

  // ── Search ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!search || search.length < 2) { setSearchResults([]); return }
    const timer = setTimeout(async () => {
      if (is_offline) {
        setSearchResults(await searchProductsOffline(search) as any)
      } else {
        try {
          const r = await api.get('/products', { params: { search, per_page: 12, is_active: true } })
          setSearchResults(r.data.data.map((p: any) => ({
            id: p.id, name: p.name, short_name: p.short_name,
            sale_price_ttc: p.sale_price_ttc, vat_rate: p.vat_rate,
            is_weight_based: p.is_weight_based,
            stock_qty: p.stock_level?.qty_on_hand ?? 0,
            category_name: p.category?.name, image: p.image ?? null,
          })))
        } catch { setSearchResults(await searchProductsOffline(search) as any) }
      }
    }, 250)
    return () => clearTimeout(timer)
  }, [search, is_offline])

  // ── Add to cart ──────────────────────────────────────────────────────────────
  const addProductToCart = useCallback((item: PosItem) => {
    if (item.stock_qty <= 0) {
      toast.error(`Rupture de stock — ${item.short_name ?? item.name}`, { duration: 1500 })
      return
    }
    addItem({
      product_id:     item.id,
      product_name:   item.name,
      qty:            1,
      unit_price_ttc: item.sale_price_ttc,
      vat_rate:       item.vat_rate,
      is_weight_based: item.is_weight_based,
      discount_pct:   0,
    })
    setSearch('')
    setSearchResults([])
    toast.success(`${item.short_name ?? item.name} ajouté`, { duration: 600, icon: '✓' })
  }, [addItem])

  // ── Barcode / search handler ─────────────────────────────────────────────────
  const handleInput = async (value: string) => {
    if (!value.trim()) { setSearch(''); setSearchResults([]); return }
    if (/^\d{8,14}$/.test(value.trim())) {
      let product: CachedProduct | undefined
      if (is_offline) {
        product = await findProductByBarcode(value.trim())
      } else {
        try {
          const r = await api.get('/products/barcode', { params: { barcode: value.trim() } })
          product = r.data
        } catch { product = await findProductByBarcode(value.trim()) }
      }
      if (product) { addProductToCart(product as unknown as PosItem); setSearch(''); return }
      toast.error(`Code-barres non trouvé : ${value}`)
      return
    }
    setSearch(value)
  }

  // ── Confirm sale ─────────────────────────────────────────────────────────────
  const handleSaleConfirm = async (pms: PaymentEntry[]) => {
    if (items.length === 0) return
    setProcessing(true)
    const offline_id = `OFL-${Date.now()}-${uuidv4().slice(0, 8)}`
    const paymentList = pms.map(p => ({
      payment_method: p.method,
      amount: p.method === 'credit'
        ? totalTtc - pms.filter(x => x.method !== 'credit').reduce((s, x) => s + x.amount, 0)
        : p.amount,
    }))
    const salePayload = {
      store_id: user!.store_id, user_id: user!.id, cash_session_id,
      items: items.map(i => ({
        product_id: i.product_id,
        qty: i.qty, unit_price_ttc: i.unit_price_ttc, discount_pct: i.discount_pct,
      })),
      global_discount_amount: cart_discount_amount > 0 ? cart_discount_amount : undefined,
      payments: paymentList,
      offline_id, channel: 'pos',
    }
    if (is_offline) {
      await savePendingSale({
        offline_id, store_id: user!.store_id!, user_id: user!.id,
        cash_session_id: cash_session_id ?? undefined,
        items: items.map(i => ({
          product_id: i.product_id, product_name: i.product_name, qty: i.qty,
          unit_price_ttc: i.unit_price_ttc, discount_pct: i.discount_pct,
          discount_amount: i.discount_amount, total_ttc: i.total_ttc,
          vat_rate: i.vat_rate, is_weight_based: i.is_weight_based,
        })),
        payments: paymentList, total_ttc: totalTtc,
        status: 'pending', created_at: new Date().toISOString(),
      })
      toast.success('Vente enregistrée hors-ligne')
      clearCart(); setView('pos'); setProcessing(false)
      return
    }
    try {
      const r = await api.post('/sales', salePayload)
      clearCart()
      setSaleReceipt(r.data)
      setView('receipt')
      queryClient.invalidateQueries({ queryKey: ['mobile-pos-products'] })
      queryClient.invalidateQueries({ queryKey: ['sales'] })
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? "Erreur lors de l'enregistrement")
    } finally { setProcessing(false) }
  }

  // ── Product card ─────────────────────────────────────────────────────────────
  const ProductCard = useCallback(({ p }: { p: PosItem }) => {
    const thumb      = imageUrl(p.image)
    const outOfStock = p.stock_qty <= 0
    const lowStock   = p.stock_qty > 0 && p.stock_qty <= 5
    const cartItem   = items.find(i => i.product_id === p.id)
    const inCart     = Boolean(cartItem)

    return (
      <button
        onClick={() => addProductToCart(p)}
        disabled={outOfStock}
        className={`relative bg-white rounded-2xl text-left overflow-hidden flex flex-col transition-all duration-150 active:scale-95 ${
          outOfStock
            ? 'opacity-50 cursor-not-allowed shadow-sm border border-gray-100'
            : inCart
              ? 'ring-2 ring-primary shadow-md shadow-primary/20'
              : 'shadow-sm border border-gray-100 active:border-primary/50'
        }`}
      >
        {/* Image */}
        <div className="relative w-full aspect-square bg-gray-100 overflow-hidden">
          {thumb ? (
            <img
              src={thumb}
              alt={p.short_name ?? p.name}
              className="w-full h-full object-cover"
              loading="lazy"
              onError={e => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
                (e.currentTarget.nextElementSibling as HTMLElement)?.classList.remove('hidden')
              }}
            />
          ) : null}
          <div className={`absolute inset-0 flex items-center justify-center bg-gray-50 ${thumb ? 'hidden' : ''}`}>
            <ShoppingBag size={32} className="text-gray-200" />
          </div>

          {/* Rupture overlay */}
          {outOfStock && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
              <span className="text-white text-xs font-bold bg-red-500 px-2 py-0.5 rounded-full">Rupture</span>
            </div>
          )}

          {/* Stock faible */}
          {lowStock && !outOfStock && (
            <div className="absolute top-1.5 right-1.5 bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-tight">
              {p.stock_qty}
            </div>
          )}

          {/* Qty in cart badge */}
          {inCart && cartItem && (
            <div className="absolute top-1.5 left-1.5 min-w-[22px] h-[22px] bg-primary text-white text-xs font-bold rounded-full flex items-center justify-center px-1">
              {formatNumber(cartItem.qty, cartItem.is_weight_based ? 1 : 0)}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="p-2 flex flex-col flex-1">
          <p className="text-xs font-semibold text-gray-900 line-clamp-2 leading-tight mb-1 flex-1">
            {p.short_name ?? p.name}
          </p>
          <p className="text-sm font-bold text-primary">{formatCurrency(p.sale_price_ttc)}</p>
        </div>
      </button>
    )
  }, [addProductToCart, items])

  // ── Guards ───────────────────────────────────────────────────────────────────
  if (sessionLoading) {
    return (
      <div className="fixed inset-0 bg-gray-900 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }
  if (!session) {
    return <OpenSessionScreen onOpened={s => { setSession(s); setCashSession(s.id) }} />
  }
  if (view === 'receipt' && saleReceipt) {
    return (
      <ReceiptScreen
        sale={saleReceipt}
        onNewSale={() => { setSaleReceipt(null); setView('pos') }}
      />
    )
  }

  const paymentReady = payments.reduce((s, p) => s + p.amount, 0) >= totalTtc
    || payments.some(p => p.method === 'credit')

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div
      className="flex flex-col bg-gray-50 overflow-hidden"
      style={{ height: '100dvh' }}
    >
      {/* ═══ TOP BAR ════════════════════════════════════════════════════════ */}
      <div
        className="bg-white border-b px-3 flex items-center gap-2 flex-shrink-0 shadow-sm"
        style={{ paddingTop: 'max(10px, env(safe-area-inset-top))', paddingBottom: 10 }}
      >
        {/* Wifi badge */}
        <div className={`flex items-center justify-center w-8 h-8 rounded-xl flex-shrink-0 ${
          is_offline ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'
        }`}>
          {is_offline ? <WifiOff size={14} /> : <Wifi size={14} />}
        </div>

        {/* Search */}
        <div className="relative flex-1">
          <input
            ref={searchRef}
            type="search"
            inputMode="search"
            value={search}
            onChange={e => handleInput(e.target.value)}
            placeholder="Rechercher ou scanner..."
            className="w-full bg-gray-100 rounded-xl pl-9 pr-8 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:bg-white transition-colors"
          />
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          {search && (
            <button
              onClick={() => { setSearch(''); setSearchResults([]) }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Close session */}
        <button
          onClick={() => {
            if (window.confirm('Clôturer la session de caisse ?')) {
              api.post(`/cash-sessions/${session.id}/close`, { closing_balance_actual: 0 })
                .then(() => { setSession(null); setCashSession(null); toast.success('Session clôturée') })
                .catch(() => toast.error('Erreur lors de la clôture'))
            }
          }}
          className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-xl bg-gray-100 text-gray-500 active:bg-red-50 active:text-red-500 transition-colors"
        >
          <Lock size={16} />
        </button>
      </div>

      {/* ═══ SEARCH DROPDOWN ════════════════════════════════════════════════ */}
      {search.length >= 2 && (
        <div className="bg-white border-b shadow-lg z-20 flex-shrink-0 max-h-64 overflow-y-auto">
          {searchResults.length === 0 ? (
            <p className="px-4 py-5 text-sm text-gray-400 text-center">Aucun résultat pour « {search} »</p>
          ) : searchResults.map(p => {
            const thumb      = imageUrl(p.image)
            const outOfStock = p.stock_qty <= 0
            return (
              <button
                key={p.id}
                onClick={() => addProductToCart(p)}
                disabled={outOfStock}
                className={`w-full flex items-center gap-3 px-4 py-3 border-b last:border-0 text-left ${
                  outOfStock ? 'opacity-40 cursor-not-allowed' : 'active:bg-gray-50'
                }`}
              >
                <div className="w-10 h-10 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0 flex items-center justify-center">
                  {thumb
                    ? <img src={thumb} alt={p.name} className="w-full h-full object-cover" loading="lazy" />
                    : <ShoppingBag size={16} className="text-gray-300" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{p.name}</p>
                  <p className="text-xs text-gray-400">{p.category_name}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-bold text-primary">{formatCurrency(p.sale_price_ttc)}</p>
                  <p className={`text-xs ${outOfStock ? 'text-red-500' : 'text-green-600'}`}>
                    {outOfStock ? 'Rupture' : `Qté ${p.stock_qty}`}
                  </p>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* ═══ CATEGORY CHIPS ═════════════════════════════════════════════════ */}
      <div className="flex overflow-x-auto gap-2 px-3 py-2 bg-white border-b flex-shrink-0 scrollbar-hide">
        <button
          onClick={() => { setSelectedCategoryId(null); setPage(1) }}
          className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-semibold transition-colors ${
            selectedCategoryId === null ? 'bg-primary text-white shadow-sm' : 'bg-gray-100 text-gray-600'
          }`}
        >
          Tous
        </button>
        {categoryTree.map(cat => (
          <button
            key={cat.id}
            onClick={() => { setSelectedCategoryId(cat.id); setPage(1) }}
            className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-semibold transition-colors whitespace-nowrap ${
              selectedCategoryId === cat.id ? 'bg-primary text-white shadow-sm' : 'bg-gray-100 text-gray-600'
            }`}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {/* ═══ PRODUCT GRID ═══════════════════════════════════════════════════ */}
      <div className="flex-1 overflow-y-auto p-2">
        {productsLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : displayProducts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <ShoppingBag size={40} className="mb-2 opacity-30" />
            <p className="text-sm">Aucun produit disponible</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {displayProducts.map(p => <ProductCard key={p.id} p={p} />)}
          </div>
        )}

        {/* Pagination */}
        {!is_offline && totalPages > 1 && (
          <div className="flex items-center justify-center gap-4 mt-4 pb-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-5 py-2.5 bg-white rounded-xl border text-sm font-medium disabled:opacity-40 shadow-sm"
            >
              ← Précédent
            </button>
            <span className="text-sm text-gray-400 font-medium">{page} / {totalPages}</span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-5 py-2.5 bg-white rounded-xl border text-sm font-medium disabled:opacity-40 shadow-sm"
            >
              Suivant →
            </button>
          </div>
        )}
      </div>

      {/* ═══ BOTTOM CART BAR ════════════════════════════════════════════════ */}
      {items.length > 0 && view === 'pos' && (
        <div
          className="bg-white border-t px-3 flex items-center gap-3 flex-shrink-0 shadow-[0_-4px_12px_rgba(0,0,0,0.06)]"
          style={{ paddingTop: 10, paddingBottom: 'max(10px, env(safe-area-inset-bottom))' }}
        >
          {/* Cart summary (tap = open cart) */}
          <button
            onClick={() => setView('cart')}
            className="flex items-center gap-2.5 flex-1 min-w-0 py-1"
          >
            <div className="relative flex-shrink-0">
              <ShoppingBag size={24} className="text-gray-700" />
              <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] bg-primary text-white text-[10px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none">
                {items.length}
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-xs text-gray-500 leading-none mb-0.5">
                {Math.round(totalQty)} article{totalQty > 1 ? 's' : ''}
              </p>
              <p className="font-bold text-gray-900 text-base leading-none">{formatCurrency(totalTtc)}</p>
            </div>
            <ChevronUp size={16} className="text-gray-400 flex-shrink-0 ml-1" />
          </button>

          {/* Checkout button */}
          <button
            onClick={() => { setPayments([{ method: 'cash', amount: totalTtc }]); setView('checkout') }}
            className="flex-shrink-0 px-6 py-3.5 bg-primary text-white font-bold rounded-2xl text-sm shadow-lg shadow-primary/25 active:opacity-90"
          >
            Encaisser
          </button>
        </div>
      )}

      {/* ═══ CART VIEW ══════════════════════════════════════════════════════ */}
      {view === 'cart' && (
        <div
          className="fixed inset-0 bg-white z-50 flex flex-col"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <div
            className="flex items-center gap-3 px-4 border-b flex-shrink-0 bg-white shadow-sm"
            style={{ paddingTop: 'max(12px, env(safe-area-inset-top))', paddingBottom: 12 }}
          >
            <button
              onClick={() => setView('pos')}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-gray-100 flex-shrink-0"
            >
              <ArrowLeft size={18} />
            </button>
            <h2 className="font-bold text-gray-900 flex-1 text-base">
              Panier — {items.length} article{items.length > 1 ? 's' : ''}
            </h2>
            <button
              onClick={() => { clearCart(); setView('pos') }}
              className="flex items-center gap-1 text-xs text-red-500 font-medium px-3 py-1.5 border border-red-200 rounded-xl active:bg-red-50"
            >
              <Trash2 size={12} /> Vider
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4">
            {items.map(item => (
              <MobileCartItem
                key={item.product_id}
                item={item}
                onQtyChange={(id, qty) => { if (qty <= 0) removeItem(id); else updateQty(id, qty) }}
                onRemove={removeItem}
                onDiscountChange={updateDiscount}
              />
            ))}
          </div>

          <div className="border-t px-4 py-3 bg-white flex-shrink-0 space-y-3">
            {/* Remise globale en montant */}
            <div className="flex items-center gap-2">
              <Tag size={13} className="text-orange-400 flex-shrink-0" />
              <span className="text-sm text-gray-500 flex-shrink-0">Remise</span>
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
                className="flex-1 min-w-0 text-right text-sm border border-orange-200 rounded-xl px-3 py-2 bg-orange-50/60 text-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-300 font-mono"
              />
              <span className="text-sm text-gray-400 flex-shrink-0">FCFA</span>
              {cart_discount_amount > 0 && (
                <button type="button" onClick={() => setCartDiscount(0)} className="text-gray-300 active:text-red-400 flex-shrink-0">
                  <X size={14} />
                </button>
              )}
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-500 text-sm">Total</span>
              <span className="text-xl font-bold text-primary">{formatCurrency(totalTtc)}</span>
            </div>
            <button
              onClick={() => { setPayments([{ method: 'cash', amount: totalTtc }]); setView('checkout') }}
              className="w-full py-4 bg-primary text-white font-bold rounded-2xl text-base shadow-lg shadow-primary/25 active:opacity-90"
            >
              Encaisser {formatCurrency(totalTtc)}
            </button>
          </div>
        </div>
      )}

      {/* ═══ CHECKOUT VIEW ══════════════════════════════════════════════════ */}
      {view === 'checkout' && (
        <div
          className="fixed inset-0 bg-white z-50 flex flex-col"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          {/* Header */}
          <div
            className="bg-gray-900 px-5 flex items-center gap-3 flex-shrink-0"
            style={{ paddingTop: 'max(14px, env(safe-area-inset-top))', paddingBottom: 14 }}
          >
            <button
              onClick={() => setView('cart')}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/10 text-white flex-shrink-0"
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <p className="text-gray-400 text-xs uppercase tracking-widest font-medium">Encaissement</p>
              <p className="text-white text-2xl font-bold font-mono">{formatCurrency(totalTtc)}</p>
            </div>
          </div>

          {/* Payment panel */}
          <div className="flex-1 overflow-y-auto p-4">
            <PaymentPanel
              total={totalTtc}
              value={payments}
              onChange={setPayments}
              compact={false}
            />
          </div>

          {/* Footer actions */}
          <div className="border-t px-4 py-3 bg-white flex gap-3 flex-shrink-0">
            <button
              onClick={() => setView('cart')}
              className="flex-1 py-4 border-2 border-gray-200 text-gray-600 font-semibold rounded-2xl text-sm active:bg-gray-50"
            >
              Retour
            </button>
            <button
              onClick={() => handleSaleConfirm(payments)}
              disabled={!paymentReady || processing}
              className="flex-[2] py-4 bg-primary text-white font-bold rounded-2xl text-sm shadow-lg shadow-primary/25 disabled:opacity-40 flex items-center justify-center gap-2 active:opacity-90"
            >
              <Check size={18} />
              {processing ? 'Traitement...' : 'Valider la vente'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
