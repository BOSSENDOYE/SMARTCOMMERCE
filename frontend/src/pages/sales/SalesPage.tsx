import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { v4 as uuidv4 } from 'uuid'
import api from '../../lib/api'
import { useAuthStore } from '../../store/auth.store'
import { formatCurrency, downloadPdf } from '../../lib/format'
import toast from 'react-hot-toast'
import {
  Plus, Trash2, User, ArrowLeft, ChevronRight,
  Printer, X, FileText, Ban, RotateCcw, AlertTriangle,
  Eye, Edit2, ShoppingCart, Package, CreditCard,
} from 'lucide-react'
import PaymentPanel, { type PaymentEntry } from '../../components/PaymentPanel'

// ─── Channel helpers ──────────────────────────────────────────────────────────

const CHANNEL_DISPLAY: Record<string, { label: string; cls: string }> = {
  pos:       { label: 'Caisse POS',  cls: 'bg-violet-100 text-violet-700' },
  takeaway:  { label: 'Emporter',    cls: 'bg-orange-100 text-orange-600' },
  delivery:  { label: 'Livraison',   cls: 'bg-blue-100 text-blue-600'    },
  online:    { label: 'En ligne',    cls: 'bg-emerald-100 text-emerald-700' },
  counter:   { label: 'Comptoir',    cls: 'bg-gray-100 text-gray-600'    },
}
function ChannelBadge({ channel }: { channel: string }) {
  const d = CHANNEL_DISPLAY[channel] ?? { label: channel, cls: 'bg-gray-100 text-gray-500' }
  return <span className={`px-2 py-0.5 rounded text-xs font-medium ${d.cls}`}>{d.label}</span>
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CHANNELS = [
  { value: 'pos',       label: 'Comptoir' },
  { value: 'takeaway',  label: 'Emporter' },
  { value: 'delivery',  label: 'Livraison' },
  { value: 'online',    label: 'En ligne' },
]

// ─── Types ────────────────────────────────────────────────────────────────────

interface Container {
  id: number
  label?: string
  conversion_factor: number
  is_sale_unit: boolean
  price_a: number | null
  price_b: number | null
  price_c: number | null
  unit?: { name: string; symbol: string }
}

interface ProductSuggestion {
  id: number
  name: string
  short_name?: string
  internal_code: string
  sale_price_ttc: number
  vat_rate: number
  stock_level?: { qty_on_hand: number }
  unit?: { name: string; symbol: string }
  containers: Container[]
}

interface ClientSuggestion {
  id: number
  name: string
  phone?: string
  credit_balance?: number
}

interface SaleLine {
  _id: string
  product_id: number | null
  product_name: string
  search: string
  qty: number
  unit_price_ttc: number
  discount_pct: number
  vat_rate: number
  total_ttc: number
  total_ht: number
  containers: Container[]
  container_id: number | null
  stock_qty: number
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function r(n: number, d = 2) { return Math.round(n * 10 ** d) / 10 ** d }

function calcLine(l: SaleLine): SaleLine {
  const disc    = r(l.unit_price_ttc * l.qty * l.discount_pct / 100, 2)
  const total_ttc = r(l.unit_price_ttc * l.qty - disc, 2)
  const total_ht  = r(total_ttc / (1 + l.vat_rate / 100), 2)
  return { ...l, total_ttc, total_ht }
}

function emptyLine(): SaleLine {
  return {
    _id: uuidv4(), product_id: null, product_name: '', search: '',
    qty: 1, unit_price_ttc: 0, discount_pct: 0, vat_rate: 18,
    total_ttc: 0, total_ht: 0, containers: [], container_id: null, stock_qty: 0,
  }
}

function printReceipt(sale: Record<string, any>) {
  const w = window.open('', '_blank', 'width=420,height=650')
  if (!w) return
  const store = sale.store ?? {}
  const items = sale.items ?? []
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Reçu #${sale.reference}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: 'Courier New', monospace; font-size: 12px; width: 320px; margin: 0 auto; padding: 12px; }
    .center  { text-align: center; }
    .bold    { font-weight: bold; }
    .divider { border-top: 1px dashed #333; margin: 8px 0; }
    .row     { display: flex; justify-content: space-between; padding: 1px 0; }
    .indent  { padding-left: 12px; color: #555; }
    .big     { font-size: 15px; font-weight: bold; }
    .small   { font-size: 10px; color: #555; }
  </style></head><body>
  <div class="center bold" style="font-size:14px">${store.name ?? 'VENTE'}</div>
  ${store.address ? `<div class="center small">${store.address}</div>` : ''}
  ${store.phone ? `<div class="center small">Tél: ${store.phone}</div>` : ''}
  ${store.ninea ? `<div class="center small">NINEA: ${store.ninea}</div>` : ''}
  <div class="divider"></div>
  <div class="row"><span>Réf:</span><span class="bold">${sale.reference ?? '—'}</span></div>
  <div class="row"><span>Date:</span><span>${new Date(sale.created_at).toLocaleString('fr-FR')}</span></div>
  ${sale.user ? `<div class="row"><span>Vendeur:</span><span>${sale.user.name}</span></div>` : ''}
  ${sale.client ? `<div class="row"><span>Client:</span><span>${sale.client.name}</span></div>` : ''}
  <div class="divider"></div>
  ${items.map((i: Record<string, any>) => `
    <div class="row bold"><span>${i.product?.short_name ?? i.product?.name ?? '—'}</span><span></span></div>
    <div class="row indent">
      <span>${i.qty} × ${Number(i.unit_price_ttc).toLocaleString('fr-FR')} F</span>
      ${i.discount_pct > 0 ? `<span style="color:#c00">-${i.discount_pct}%</span>` : '<span></span>'}
      <span class="bold">${Number(i.total_ttc).toLocaleString('fr-FR')} F</span>
    </div>
  `).join('')}
  <div class="divider"></div>
  <div class="row"><span>Sous-total HT</span><span>${Number(sale.subtotal_ht).toLocaleString('fr-FR')} F</span></div>
  <div class="row"><span>TVA</span><span>${Number(sale.vat_amount).toLocaleString('fr-FR')} F</span></div>
  ${Number(sale.discount_amount) > 0 ? `<div class="row" style="color:#060"><span>Remise</span><span>- ${Number(sale.discount_amount).toLocaleString('fr-FR')} F</span></div>` : ''}
  <div class="divider"></div>
  <div class="row big"><span>TOTAL TTC</span><span>${Number(sale.total_ttc).toLocaleString('fr-FR')} F</span></div>
  <div class="row"><span>Payé</span><span>${Number(sale.paid_amount).toLocaleString('fr-FR')} F</span></div>
  ${Number(sale.change_amount) > 0 ? `<div class="row"><span>Monnaie rendue</span><span>${Number(sale.change_amount).toLocaleString('fr-FR')} F</span></div>` : ''}
  <div class="divider"></div>
  <div class="center small">${store.receipt_footer ?? 'Merci de votre visite !'}</div>
  </body></html>`)
  w.document.close()
  w.focus()
  setTimeout(() => { w.print() }, 500)
}

// ─── Sale Line Row ────────────────────────────────────────────────────────────

interface LineRowProps {
  line: SaleLine
  index: number
  onSearchProducts: (q: string) => Promise<ProductSuggestion[]>
  onSelectProduct: (p: ProductSuggestion) => void
  onChange: (patch: Partial<SaleLine>) => void
  onRemove: () => void
  canRemove: boolean
}

function SaleLineRow({ line, index, onSearchProducts, onSelectProduct, onChange, onRemove, canRemove }: LineRowProps) {
  const [suggestions, setSuggestions] = useState<ProductSuggestion[]>([])
  const [showSug, setShowSug]         = useState(false)
  const [dropPos, setDropPos]         = useState<{ top: number; left: number; width: number } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const updateDropPos = () => {
    if (inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect()
      setDropPos({ top: rect.bottom + 6, left: rect.left, width: Math.max(340, rect.width) })
    }
  }

  useEffect(() => {
    if (!showSug) return
    const close = () => setShowSug(false)
    window.addEventListener('scroll', close, true)
    return () => window.removeEventListener('scroll', close, true)
  }, [showSug])

  const handleInput = (val: string) => {
    onChange({ search: val, product_id: null, product_name: '' })
    updateDropPos()
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      const res = await onSearchProducts(val)
      setSuggestions(res)
      if (res.length > 0) { updateDropPos(); setShowSug(true) }
      else setShowSug(false)
    }, 300)
  }

  const handleFocus = () => {
    if (suggestions.length > 0) { updateDropPos(); setShowSug(true) }
  }

  const handleSelect = (p: ProductSuggestion) => {
    setSuggestions([])
    setShowSug(false)
    onSelectProduct(p)
  }

  const stockQty = line.stock_qty ?? 0
  const isLow    = line.product_id !== null && stockQty <= 0

  return (
    <>
      <tr className="border-b border-gray-100 hover:bg-orange-50/20 group transition-colors">
        {/* N° */}
        <td className="px-3 py-2.5 text-center w-10">
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-100 text-gray-500 text-xs font-semibold">{index + 1}</span>
        </td>

        {/* Produit */}
        <td className="px-3 py-2.5">
          <div className="relative">
            <Package size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={line.search}
              onChange={e => handleInput(e.target.value)}
              onFocus={handleFocus}
              onBlur={() => setTimeout(() => setShowSug(false), 200)}
              placeholder="Nom, code ou référence…"
              className={`w-full border rounded-lg pl-7 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/40 transition-all ${
                isLow ? 'border-red-300 bg-red-50' :
                line.product_id ? 'border-emerald-300 bg-emerald-50/30' :
                'border-gray-200 hover:border-gray-300'
              }`}
            />
            {line.product_id && (
              <button
                onMouseDown={() => onChange({ product_id: null, product_name: '', search: '', stock_qty: 0, containers: [], container_id: null })}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 hover:text-red-500 transition-colors"
              ><X size={13} /></button>
            )}
          </div>
          {line.product_id && (
            <span className={`text-[10px] mt-0.5 ml-1 font-medium inline-flex items-center gap-1 ${stockQty > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
              <span className={`w-1.5 h-1.5 rounded-full inline-block ${stockQty > 0 ? 'bg-emerald-500' : 'bg-red-500'}`} />
              Stock : {stockQty}
            </span>
          )}
        </td>

        {/* Quantité */}
        <td className="px-3 py-2.5 w-24">
          <input
            type="number" value={line.qty} min={0.001} step={0.001}
            onChange={e => onChange({ qty: parseFloat(e.target.value) || 1 })}
            className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-orange-400/40 font-mono"
          />
        </td>

        {/* Unité */}
        <td className="px-3 py-2.5 w-32">
          {line.containers.length > 0 ? (
            <select
              value={line.container_id ?? ''}
              onChange={e => {
                const c = line.containers.find(c => c.id === Number(e.target.value))
                if (c) onChange({ container_id: c.id, unit_price_ttc: c.price_a ?? line.unit_price_ttc })
              }}
              className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400/40"
            >
              {line.containers.map(c => (
                <option key={c.id} value={c.id}>{c.label || c.unit?.symbol || c.unit?.name || '—'}</option>
              ))}
            </select>
          ) : <span className="text-xs text-gray-400 px-2">—</span>}
        </td>

        {/* Prix unitaire TTC */}
        <td className="px-3 py-2.5 w-32">
          <input
            type="number" value={line.unit_price_ttc} min={0} step={1}
            onChange={e => onChange({ unit_price_ttc: parseFloat(e.target.value) || 0 })}
            className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-orange-400/40 font-mono"
          />
        </td>

        {/* Remise % */}
        <td className="px-3 py-2.5 w-20">
          <div className="relative">
            <input
              type="number" value={line.discount_pct} min={0} max={100} step={0.5}
              onChange={e => onChange({ discount_pct: parseFloat(e.target.value) || 0 })}
              className="w-full border border-gray-200 rounded-lg px-2 py-2 pr-5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-orange-400/40"
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">%</span>
          </div>
        </td>

        {/* Total TTC */}
        <td className="px-3 py-2.5 w-32 text-right">
          <span className="font-bold text-gray-800 font-mono text-sm">{formatCurrency(line.total_ttc)}</span>
          {line.discount_pct > 0 && (
            <div className="text-[10px] text-emerald-600 font-mono">
              −{formatCurrency(line.unit_price_ttc * line.qty * line.discount_pct / 100)}
            </div>
          )}
        </td>

        {/* Supprimer */}
        <td className="px-3 py-2.5 w-10 text-center">
          {canRemove && (
            <button onClick={onRemove} className="text-gray-200 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-50">
              <Trash2 size={13} />
            </button>
          )}
        </td>
      </tr>

      {/* Dropdown via portal — évite le clipping de overflow-x-auto */}
      {showSug && dropPos && createPortal(
        <div
          style={{ position: 'fixed', top: dropPos.top, left: dropPos.left, width: dropPos.width, zIndex: 9999, maxHeight: 300, overflowY: 'auto' }}
          className="bg-white border border-gray-200 rounded-xl shadow-2xl"
        >
          {suggestions.map(p => (
            <button
              key={p.id}
              onMouseDown={() => handleSelect(p)}
              className="w-full text-left px-4 py-3 hover:bg-orange-50 flex items-center justify-between gap-3 border-b border-gray-100 last:border-0 transition-colors"
            >
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-gray-800 truncate text-sm">{p.name}</div>
                <div className="text-xs text-gray-400 font-mono">{p.internal_code}</div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-sm font-bold text-orange-600">{formatCurrency(p.sale_price_ttc)}</div>
                <div className={`text-xs font-medium ${(p.stock_level?.qty_on_hand ?? 0) > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                  Stock : {p.stock_level?.qty_on_hand ?? 0}
                </div>
              </div>
            </button>
          ))}
        </div>,
        document.body
      )}
    </>
  )
}

// ─── Sale Form ────────────────────────────────────────────────────────────────

function SaleForm({ onSaved, onCancel, initialLines }: {
  onSaved: () => void
  onCancel: () => void
  initialLines?: SaleLine[]
}) {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()

  // Header
  const [saleDate,     setSaleDate]     = useState(new Date().toISOString().slice(0, 10))
  const [channel,      setChannel]      = useState('pos')
  const [clientId,     setClientId]     = useState<number | null>(null)
  const [clientName,   setClientName]   = useState('')
  const [clientSearch, setClientSearch] = useState('')
  const [clientSugs,   setClientSugs]   = useState<ClientSuggestion[]>([])
  const [showClientSug, setShowClientSug] = useState(false)
  const [clientAccountBalance, setClientAccountBalance] = useState<number | undefined>()
  const [note, setNote] = useState('')

  // Payment
  const [payments, setPayments]           = useState<PaymentEntry[]>([{ method: 'cash', amount: 0 }])
  const [showPaymentModal, setShowPaymentModal] = useState(false)

  // Lines
  const [lines, setLines] = useState<SaleLine[]>(
    initialLines && initialLines.length > 0 ? initialLines : [emptyLine()]
  )

  // Step flow
  const [step, setStep] = useState<'cart' | 'payment'>('cart')

  // Totals
  const subtotalHt    = lines.reduce((s, l) => s + l.total_ht, 0)
  const vatAmount     = lines.reduce((s, l) => s + (l.total_ttc - l.total_ht), 0)
  const discountTotal = lines.reduce((s, l) => s + r(l.unit_price_ttc * l.qty * l.discount_pct / 100), 0)
  const totalTtc      = lines.reduce((s, l) => s + l.total_ttc, 0)
  const totalPaid     = payments.reduce((s, p) => s + (p.amount || 0), 0)
  const validCartLines = lines.filter(l => l.product_id !== null && l.qty > 0)

  const proceedToPayment = () => {
    if (validCartLines.length === 0) { toast.error('Ajoutez au moins un produit.'); return }
    setStep('payment')
  }

  // Client search debounce
  useEffect(() => {
    if (clientSearch.length < 2) { setClientSugs([]); return }
    const t = setTimeout(() => {
      api.get('/clients/search', { params: { q: clientSearch } })
        .then(res => setClientSugs(res.data))
        .catch(() => {})
    }, 300)
    return () => clearTimeout(t)
  }, [clientSearch])

  // Product search function (passed to each row)
  const searchProducts = useCallback(async (q: string): Promise<ProductSuggestion[]> => {
    if (q.length < 2) return []
    const res = await api.get('/products', { params: { search: q, per_page: 8, is_active: true } })
    return res.data.data.map((p: Record<string, any>) => ({
      id:             p.id,
      name:           p.name,
      short_name:     p.short_name,
      internal_code:  p.internal_code,
      sale_price_ttc: parseFloat(p.sale_price_ttc),
      vat_rate:       parseFloat(p.vat_rate),
      stock_level:    p.stock_level,
      unit:           p.unit,
      containers:     p.containers ?? [],
    }))
  }, [])

  // Update a line
  const updateLine = (id: string, patch: Partial<SaleLine>) => {
    setLines(prev => prev.map(l => l._id !== id ? l : calcLine({ ...l, ...patch })))
  }

  // Select product → fill the line
  const selectProduct = (lineId: string, product: ProductSuggestion) => {
    const saleCont = product.containers.find(c => c.is_sale_unit) ?? product.containers[0] ?? null
    const price    = saleCont?.price_a ?? product.sale_price_ttc
    updateLine(lineId, {
      product_id:    product.id,
      product_name:  product.name,
      search:        product.name,
      unit_price_ttc: price,
      vat_rate:      product.vat_rate,
      containers:    product.containers,
      container_id:  saleCont?.id ?? null,
      stock_qty:     product.stock_level?.qty_on_hand ?? 0,
    })
  }

  const addLine    = () => setLines(prev => [...prev, emptyLine()])
  const removeLine = (id: string) => setLines(prev => prev.filter(l => l._id !== id))

  // Submit
  const mutation = useMutation({
    mutationFn: () => {
      const validLines = lines.filter(l => l.product_id !== null && l.qty > 0)
      if (validLines.length === 0) throw new Error('Ajoutez au moins un produit.')
      const hasCredit = payments.some(p => p.method === 'credit')
      if (hasCredit && !clientId) throw new Error('Sélectionnez un client pour utiliser le crédit.')
      if (!hasCredit && totalPaid < totalTtc) throw new Error('Le montant reçu est insuffisant.')
      if (payments.length === 0) throw new Error('Sélectionnez un mode de paiement.')

      return api.post('/sales', {
        store_id:   user!.store_id,
        user_id:    user!.id,
        client_id:  clientId,
        channel,
        notes:      note || undefined,
        items: validLines.map(l => ({
          product_id:    l.product_id,
          qty:           l.qty,
          unit_price_ttc: l.unit_price_ttc,
          discount_pct:  l.discount_pct,
        })),
        payments: payments.map(p => ({
          payment_method: p.method,
          amount: p.method === 'credit' ? totalTtc - payments.filter(x => x.method !== 'credit').reduce((s, x) => s + x.amount, 0) : p.amount,
        })),
      })
    },
    onSuccess: res => {
      toast.success('Vente confirmée')
      queryClient.invalidateQueries({ queryKey: ['sales'] })
      printReceipt(res.data)
      onSaved()
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message ?? err?.message ?? 'Erreur lors de l\'enregistrement')
    },
  })

  return (
    <div className="min-h-screen bg-gray-50/80">

      {/* ── Sticky top bar ── */}
      <div className="bg-white border-b border-gray-200 px-5 py-3 flex items-center gap-3 sticky top-0 z-20 shadow-sm">
        <button
          onClick={step === 'payment' ? () => setStep('cart') : onCancel}
          className="text-gray-500 hover:text-gray-800 transition-colors p-1.5 rounded-lg hover:bg-gray-100 flex-shrink-0"
        >
          <ArrowLeft size={18} />
        </button>

        {/* Title */}
        <div className="hidden sm:flex items-center gap-2">
          <FileText size={16} className="text-orange-500" />
          <span className="text-sm font-bold text-gray-700">Nouvelle vente</span>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 mx-2">
          <div className={`flex items-center gap-1.5 text-xs font-semibold ${step === 'cart' ? 'text-orange-600' : 'text-gray-400'}`}>
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
              step === 'payment' ? 'bg-emerald-500 text-white' : 'bg-orange-500 text-white shadow-md shadow-orange-200'
            }`}>
              {step === 'payment' ? '✓' : '1'}
            </div>
            <span className="hidden md:inline">Articles</span>
          </div>
          <div className="flex gap-0.5">
            {[0,1,2].map(i => (
              <div key={i} className={`w-3 h-0.5 rounded-full transition-colors ${step === 'payment' ? 'bg-emerald-400' : 'bg-gray-200'}`} />
            ))}
          </div>
          <div className={`flex items-center gap-1.5 text-xs font-semibold ${step === 'payment' ? 'text-orange-600' : 'text-gray-400'}`}>
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
              step === 'payment' ? 'bg-orange-500 text-white shadow-md shadow-orange-200' : 'bg-gray-200 text-gray-500'
            }`}>2</div>
            <span className="hidden md:inline">Paiement</span>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {step === 'cart' ? (
            <>
              <button onClick={onCancel}
                className="hidden sm:flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-gray-50 transition-colors">
                <X size={13} /> Annuler
              </button>
              <button
                onClick={proceedToPayment}
                className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-bold hover:bg-orange-600 transition-all shadow-md shadow-orange-200/50 hover:shadow-lg active:scale-95"
              >
                Valider les articles <ChevronRight size={15} />
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setStep('cart')}
                className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-gray-50 transition-colors">
                <ArrowLeft size={13} /> <span className="hidden sm:inline">Articles</span>
              </button>
              <button
                onClick={() => mutation.mutate()}
                disabled={mutation.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold hover:bg-emerald-700 transition-all disabled:opacity-60 shadow-md shadow-emerald-200/50 hover:shadow-lg active:scale-95"
              >
                <Printer size={14} />
                {mutation.isPending ? 'Enregistrement…' : 'Confirmer & Imprimer'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* ═══ ÉTAPE 1 : ARTICLES ═══ */}
      {step === 'cart' && (
        <div className="max-w-7xl mx-auto p-5 space-y-4">

          {/* En-tête de vente */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
              <div className="w-1.5 h-5 bg-orange-400 rounded-full" />
              <h2 className="text-sm font-bold text-gray-700">Informations de la vente</h2>
            </div>
            <div className="p-5 grid grid-cols-2 md:grid-cols-4 gap-4">

              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Date</label>
                <input type="date" value={saleDate} onChange={e => setSaleDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/30 hover:border-gray-300 transition-colors" />
              </div>

              <div className="relative">
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Client</label>
                <div className="relative">
                  <User size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  <input
                    type="text"
                    value={clientId ? clientName : clientSearch}
                    onChange={e => { setClientId(null); setClientName(''); setClientSearch(e.target.value); setShowClientSug(true) }}
                    onFocus={() => setShowClientSug(true)}
                    onBlur={() => setTimeout(() => setShowClientSug(false), 200)}
                    placeholder="Anonyme"
                    className="w-full border border-gray-200 rounded-xl pl-8 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/30 hover:border-gray-300 transition-colors"
                  />
                  {clientId && (
                    <button onClick={() => { setClientId(null); setClientName(''); setClientSearch('') }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-500 transition-colors">
                      <X size={13} />
                    </button>
                  )}
                </div>
                {showClientSug && clientSugs.length > 0 && (
                  <div className="absolute z-30 top-full mt-1 w-72 bg-white border border-gray-200 rounded-xl shadow-xl max-h-48 overflow-y-auto">
                    {clientSugs.map(c => (
                      <button key={c.id}
                        onMouseDown={() => {
                          setClientId(c.id); setClientName(c.name); setClientSearch(''); setShowClientSug(false)
                          setClientAccountBalance((c as ClientSuggestion & { account_balance?: number }).account_balance ?? 0)
                        }}
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-orange-50 flex justify-between items-center border-b border-gray-100 last:border-0 transition-colors">
                        <span className="font-semibold text-gray-800">{c.name}</span>
                        <div className="text-right">
                          <span className="text-gray-400 text-xs block">{c.phone}</span>
                          {(c as ClientSuggestion & { account_balance?: number }).account_balance !== undefined && (
                            <span className={`text-[10px] font-medium ${((c as ClientSuggestion & { account_balance?: number }).account_balance ?? 0) >= 0 ? 'text-indigo-600' : 'text-red-500'}`}>
                              Cpt: {formatCurrency((c as ClientSuggestion & { account_balance?: number }).account_balance ?? 0)}
                            </span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Canal</label>
                <select value={channel} onChange={e => setChannel(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400/30 hover:border-gray-300 transition-colors">
                  {CHANNELS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Vendeur</label>
                <input type="text" value={user?.name ?? ''} readOnly
                  className="w-full border border-gray-100 rounded-xl px-3 py-2 text-sm bg-gray-50 text-gray-500 cursor-default" />
              </div>

              <div className="md:col-span-4">
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Note <span className="font-normal text-gray-400">(optionnel)</span></label>
                <input type="text" value={note} onChange={e => setNote(e.target.value)}
                  placeholder="Commentaire ou référence client…"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/30 hover:border-gray-300 transition-colors" />
              </div>
            </div>
          </div>

          {/* Table des articles */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-5 bg-orange-400 rounded-full" />
                <h2 className="text-sm font-bold text-gray-700">Articles</h2>
                <span className="text-xs bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full font-semibold">
                  {validCartLines.length} produit{validCartLines.length !== 1 ? 's' : ''}
                </span>
              </div>
              <button onClick={addLine}
                className="flex items-center gap-1.5 text-xs font-semibold text-orange-600 hover:text-orange-700 bg-orange-50 hover:bg-orange-100 px-3 py-1.5 rounded-lg transition-colors">
                <Plus size={13} /> Ajouter une ligne
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[820px]">
                <thead>
                  <tr className="bg-gray-50/80 text-[11px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100">
                    <th className="px-3 py-3 text-center w-10">#</th>
                    <th className="px-3 py-3 text-left">Produit</th>
                    <th className="px-3 py-3 text-center w-24">Qté</th>
                    <th className="px-3 py-3 text-left w-32">Unité</th>
                    <th className="px-3 py-3 text-right w-32">Prix TTC</th>
                    <th className="px-3 py-3 text-center w-20">Remise</th>
                    <th className="px-3 py-3 text-right w-32">Total TTC</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, idx) => (
                    <SaleLineRow
                      key={line._id}
                      line={line}
                      index={idx}
                      onSearchProducts={searchProducts}
                      onSelectProduct={p => selectProduct(line._id, p)}
                      onChange={patch => updateLine(line._id, patch)}
                      onRemove={() => removeLine(line._id)}
                      canRemove={lines.length > 1}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Barre récapitulatif + bouton passer au paiement */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-5 py-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-5 text-sm text-gray-500">
              <div>
                <span className="font-bold text-gray-700">{validCartLines.length}</span> article{validCartLines.length !== 1 ? 's' : ''}
              </div>
              <div className="flex items-center gap-1.5">
                <span>HT :</span>
                <span className="font-semibold text-gray-700 font-mono">{formatCurrency(subtotalHt)}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span>TVA :</span>
                <span className="font-semibold text-gray-700 font-mono">{formatCurrency(vatAmount)}</span>
              </div>
              {discountTotal > 0 && (
                <div className="flex items-center gap-1.5 text-emerald-600 font-semibold">
                  <span>Remises :</span>
                  <span className="font-mono">−{formatCurrency(discountTotal)}</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-0.5">Total TTC</div>
                <div className="text-2xl font-bold text-gray-800 font-mono">{formatCurrency(totalTtc)}</div>
              </div>
              <button
                onClick={proceedToPayment}
                className="flex items-center gap-2 px-6 py-3 bg-orange-500 text-white rounded-xl text-sm font-bold hover:bg-orange-600 transition-all shadow-lg shadow-orange-200/60 hover:shadow-xl active:scale-95"
              >
                Passer au paiement <ChevronRight size={16} />
              </button>
            </div>
          </div>

        </div>
      )}

      {/* ═══ ÉTAPE 2 : PAIEMENT ═══ */}
      {step === 'payment' && (
        <div className="max-w-5xl mx-auto p-5">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

            {/* Récapitulatif commande */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm flex flex-col">
              <div className="px-5 py-4 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-5 bg-emerald-400 rounded-full" />
                  <h2 className="text-sm font-bold text-gray-700">Récapitulatif</h2>
                </div>
                {clientId && clientName && (
                  <div className="mt-2.5 flex items-center gap-2 text-xs bg-indigo-50 text-indigo-700 px-3 py-2 rounded-xl">
                    <User size={12} />
                    <span className="font-semibold">{clientName}</span>
                    {clientAccountBalance !== undefined && (
                      <span className="ml-auto text-indigo-500 font-mono">Compte : {formatCurrency(clientAccountBalance)}</span>
                    )}
                  </div>
                )}
              </div>

              <div className="flex-1 overflow-y-auto max-h-72 divide-y divide-gray-50">
                {validCartLines.map((l, i) => (
                  <div key={l._id} className={`flex items-center gap-3 px-5 py-3 ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                    <span className="w-6 h-6 rounded-full bg-orange-100 text-orange-600 text-xs font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-gray-800 truncate">{l.product_name}</div>
                      <div className="text-xs text-gray-400">
                        {l.qty} × {formatCurrency(l.unit_price_ttc)}
                        {l.discount_pct > 0 && <span className="ml-1.5 text-emerald-600 font-medium">−{l.discount_pct}%</span>}
                      </div>
                    </div>
                    <span className="text-sm font-bold text-gray-800 font-mono">{formatCurrency(l.total_ttc)}</span>
                  </div>
                ))}
              </div>

              <div className="px-5 py-4 border-t border-gray-200 bg-gray-50/50 rounded-b-2xl space-y-2">
                <div className="flex justify-between text-sm text-gray-500">
                  <span>Sous-total HT</span>
                  <span className="font-mono font-medium">{formatCurrency(subtotalHt)}</span>
                </div>
                <div className="flex justify-between text-sm text-gray-500">
                  <span>TVA</span>
                  <span className="font-mono font-medium">{formatCurrency(vatAmount)}</span>
                </div>
                {discountTotal > 0 && (
                  <div className="flex justify-between text-sm text-emerald-600 font-semibold">
                    <span>Total remises</span>
                    <span className="font-mono">−{formatCurrency(discountTotal)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center pt-3 border-t border-gray-200">
                  <span className="font-bold text-gray-800">TOTAL TTC</span>
                  <span className="text-2xl font-bold text-orange-500 font-mono">{formatCurrency(totalTtc)}</span>
                </div>
              </div>

              <div className="text-xs text-gray-400 text-center pb-1">
                {lines.filter(l => l.product_id).length} article(s) —&nbsp;
                {lines.filter(l => l.product_id).reduce((s, l) => s + l.qty, 0).toFixed(3)} unité(s)
              </div>

              <button
                onClick={() => {
                  const valid = lines.filter(l => l.product_id !== null && l.qty > 0)
                  if (valid.length === 0) { toast.error('Ajoutez au moins un produit.'); return }
                  setShowPaymentModal(true)
                }}
                className="w-full flex items-center justify-center gap-2 py-3 bg-primary text-white rounded-xl text-sm font-bold hover:bg-primary-600 transition-colors shadow-sm"
              >
                <CreditCard size={16} />
                Passer au paiement
              </button>
            </div>
          </div>

        </div>
      )}

      {/* ── Modale de paiement ── */}
      {showPaymentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-green-100 rounded-xl flex items-center justify-center">
                  <CreditCard size={18} className="text-green-600" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-gray-800">Mode de règlement</h2>
                  <p className="text-xs text-gray-400">
                    Total à encaisser : <span className="font-semibold text-gray-600 font-mono">{formatCurrency(totalTtc)}</span>
                    {clientName && <span className="ml-2 text-indigo-500">— {clientName}</span>}
                  </p>
                </div>
              </div>
              <button onClick={() => setShowPaymentModal(false)} className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-lg hover:bg-gray-100">
                <X size={18} />
              </button>
            </div>

            {/* Mode de règlement */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm flex flex-col">
              <div className="px-5 py-4 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-5 bg-orange-400 rounded-full" />
                  <h2 className="text-sm font-bold text-gray-700">Mode de règlement</h2>
                </div>
                <p className="text-xs text-gray-400 mt-0.5">Sélectionnez un ou plusieurs modes de paiement</p>
              </div>

              <div className="flex-1 p-5">
                <PaymentPanel
                  total={totalTtc}
                  clientAccountBalance={clientId ? (clientAccountBalance ?? 0) : undefined}
                  clientName={clientName}
                  value={payments}
                  onChange={setPayments}
                  compact
                  onCreditWithoutClient={() => {
                    setStep('cart')
                    setTimeout(() => document.querySelector<HTMLInputElement>('[placeholder="Anonyme"]')?.focus(), 300)
                  }}
                />
              </div>

              <div className="px-5 pb-5">
                <button
                  onClick={() => mutation.mutate()}
                  disabled={mutation.isPending}
                  className="w-full flex items-center justify-center gap-2 py-3.5 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition-all disabled:opacity-60 shadow-lg shadow-emerald-200/50 hover:shadow-xl active:scale-[0.99]"
                >
                  <Printer size={16} />
                  {mutation.isPending ? 'Enregistrement…' : 'Confirmer & Imprimer le reçu'}
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  )
}

// ─── Modify Confirm Modal ─────────────────────────────────────────────────────

interface ModifyConfirmModalProps {
  sale: Record<string, any>
  onClose: () => void
  onConfirmed: () => void
}

function ModifyConfirmModal({ sale, onClose, onConfirmed }: ModifyConfirmModalProps) {
  const [pin, setPin] = useState('')

  const mutation = useMutation({
    mutationFn: () => api.post(`/sales/${sale.id}/cancel`, {
      reason:         'Modification de la vente',
      supervisor_pin: pin,
      refund_method:  'none',
      refund_amount:  0,
    }),
    onSuccess: () => {
      toast.success('Vente annulée — modification en cours…')
      onConfirmed()
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message ?? 'PIN incorrect ou erreur serveur')
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-amber-100 rounded-xl flex items-center justify-center">
              <Edit2 size={18} className="text-amber-600" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-800">Modifier la vente</h2>
              <p className="text-xs text-gray-400 font-mono">{sale.reference}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors p-1">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Info box */}
          <div className="flex gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
            <AlertTriangle size={16} className="flex-shrink-0 mt-0.5 text-amber-500" />
            <p>
              Cette vente sera <strong>annulée</strong> et ses articles seront restitués en stock.
              Un nouveau bon de vente sera ensuite créé avec les modifications.
            </p>
          </div>

          {/* Sale summary */}
          <div className="px-4 py-3 bg-gray-50 rounded-xl border border-gray-200 flex justify-between items-center text-sm">
            <div>
              <div className="text-gray-500 text-xs">Client</div>
              <div className="font-medium text-gray-800">{sale.client?.name ?? 'Anonyme'}</div>
            </div>
            <div className="text-right">
              <div className="text-gray-500 text-xs">Total TTC</div>
              <div className="font-bold text-gray-800">{formatCurrency(parseFloat(sale.total_ttc ?? 0))}</div>
            </div>
          </div>

          {/* PIN */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              PIN Superviseur <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              value={pin}
              onChange={e => setPin(e.target.value)}
              maxLength={8}
              placeholder="● ● ● ● ● ●"
              onKeyDown={e => { if (e.key === 'Enter' && pin.trim()) mutation.mutate() }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm tracking-widest text-center font-mono focus:outline-none focus:ring-2 focus:ring-amber-400/30"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 px-6 pb-5">
          <button onClick={onClose}
            className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors">
            Annuler
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={!pin.trim() || mutation.isPending}
            className="flex-1 py-2.5 bg-amber-500 text-white rounded-lg text-sm font-semibold hover:bg-amber-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
            <Edit2 size={14} />
            {mutation.isPending ? 'En cours…' : 'Confirmer & Modifier'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Cancel + Refund Modal ────────────────────────────────────────────────────

const REFUND_METHODS = [
  { key: 'cash',         label: 'Espèces',             color: 'emerald' },
  { key: 'wave',         label: 'Wave',                color: 'sky' },
  { key: 'orange_money', label: 'Orange Money',        color: 'orange' },
  { key: 'free_money',   label: 'Free Money',          color: 'red' },
  { key: 'card',         label: 'Carte bancaire',      color: 'violet' },
  { key: 'account',      label: 'Compte client',       color: 'indigo' },
  { key: 'credit',       label: 'Crédit client',       color: 'amber' },
  { key: 'none',         label: 'Aucun remboursement', color: 'gray' },
]

interface CancelModalProps {
  sale: Record<string, any>
  onClose: () => void
  onCancelled: () => void
}

function CancelModal({ sale, onClose, onCancelled }: CancelModalProps) {
  const [reason,        setReason]        = useState('')
  const [pin,           setPin]           = useState('')
  const [refundMethod,  setRefundMethod]  = useState('cash')
  const [refundAmount,  setRefundAmount]  = useState(String(parseFloat(sale.paid_amount) || 0))

  const mutation = useMutation({
    mutationFn: () => api.post(`/sales/${sale.id}/cancel`, {
      reason,
      supervisor_pin: pin,
      refund_method:  refundMethod,
      refund_amount:  parseFloat(refundAmount) || 0,
    }),
    onSuccess: () => {
      toast.success('Vente annulée — stock restitué')
      onCancelled()
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message ?? 'Erreur lors de l\'annulation')
    },
  })

  const paidAmt    = parseFloat(sale.paid_amount) || 0
  const hasRefund  = refundMethod !== 'none'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-red-100 rounded-xl flex items-center justify-center">
              <Ban size={18} className="text-red-600" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-800">Annulation de vente</h2>
              <p className="text-xs text-gray-400 font-mono">{sale.reference}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors p-1">
            <X size={18} />
          </button>
        </div>

        {/* Sale summary */}
        <div className="mx-6 mt-4 px-4 py-3 bg-gray-50 rounded-xl border border-gray-200 flex justify-between items-center text-sm">
          <div>
            <div className="text-gray-500 text-xs">Client</div>
            <div className="font-medium text-gray-800">{sale.client?.name ?? 'Anonyme'}</div>
          </div>
          <div className="text-right">
            <div className="text-gray-500 text-xs">Montant payé</div>
            <div className="font-bold text-gray-800 text-base">{formatCurrency(paidAmt)}</div>
          </div>
        </div>

        <div className="px-6 py-4 space-y-4">

          {/* Reason */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              Motif d'annulation <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={2}
              placeholder="Expliquez la raison de cette annulation…"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400/30 resize-none"
            />
          </div>

          {/* Supervisor PIN */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              PIN Superviseur <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              value={pin}
              onChange={e => setPin(e.target.value)}
              maxLength={8}
              placeholder="● ● ● ● ● ●"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm tracking-widest text-center font-mono focus:outline-none focus:ring-2 focus:ring-red-400/30"
            />
          </div>

          {/* Refund section */}
          <div className="border-t border-gray-100 pt-4">
            <div className="flex items-center gap-2 mb-3">
              <RotateCcw size={14} className="text-blue-500" />
              <span className="text-xs font-semibold text-gray-600">Remboursement</span>
            </div>

            <div className="grid grid-cols-2 gap-2 mb-3">
              {REFUND_METHODS.map(m => (
                <button key={m.key} onClick={() => setRefundMethod(m.key)}
                  className={`py-2 px-3 rounded-xl text-xs font-semibold border-2 transition-all text-left ${
                    refundMethod === m.key
                      ? `bg-${m.color}-600 text-white border-${m.color}-600 shadow-sm`
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}>
                  {m.label}
                </button>
              ))}
            </div>

            {hasRefund && (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">
                  Montant remboursé (FCFA)
                </label>
                <input
                  type="number"
                  value={refundAmount}
                  onChange={e => setRefundAmount(e.target.value)}
                  min={0}
                  max={paidAmt}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-right font-mono focus:outline-none focus:ring-2 focus:ring-blue-400/30"
                />
                {parseFloat(refundAmount) > paidAmt && (
                  <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                    <AlertTriangle size={11} /> Le montant dépasse le montant payé ({formatCurrency(paidAmt)})
                  </p>
                )}
              </div>
            )}

            {!hasRefund && (
              <div className="px-3 py-2 bg-gray-50 rounded-lg border border-gray-200 text-xs text-gray-500">
                Aucun remboursement ne sera enregistré.
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 px-6 pb-5">
          <button onClick={onClose}
            className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors">
            Fermer
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={!reason.trim() || !pin.trim() || mutation.isPending}
            className="flex-1 py-2.5 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
            <Ban size={14} />
            {mutation.isPending ? 'En cours…' : 'Confirmer l\'annulation'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Sale Detail Modal ────────────────────────────────────────────────────────

function SaleDetailModal({
  saleId,
  onClose,
  onCancelled,
  onModify,
}: {
  saleId: number
  onClose: () => void
  onCancelled: () => void
  onModify: (lines: SaleLine[]) => void
}) {
  const [showCancel, setShowCancel]   = useState(false)
  const [showModify, setShowModify]   = useState(false)

  const { data: sale, isLoading } = useQuery({
    queryKey: ['sale-detail', saleId],
    queryFn: () => api.get(`/sales/${saleId}`).then(r => r.data),
  })

  const getModifyLines = (): SaleLine[] =>
    (sale?.items ?? []).map((item: Record<string, any>) =>
      calcLine({
        _id:            uuidv4(),
        product_id:     item.product_id,
        product_name:   item.product?.name ?? '',
        search:         item.product?.name ?? '',
        qty:            parseFloat(item.qty),
        unit_price_ttc: parseFloat(item.unit_price_ttc),
        discount_pct:   parseFloat(item.discount_pct ?? 0),
        vat_rate:       parseFloat(item.vat_rate ?? 18),
        total_ttc:      parseFloat(item.total_ttc),
        total_ht:       parseFloat(item.total_ht),
        containers:     [],
        container_id:   null,
        stock_qty:      0,
      })
    )

  const payments: Record<string, any>[] = sale?.payments ?? []
  const items: Record<string, any>[]    = sale?.items ?? []

  return (
    <>
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b">
            <div>
              <div className="flex items-center gap-2">
                <FileText size={16} className="text-primary" />
                <span className="font-bold text-gray-800 font-mono">{sale?.reference ?? '…'}</span>
                {sale && <ChannelBadge channel={sale.channel} />}
                {sale && (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    sale.status === 'completed' ? 'bg-green-100 text-green-700' :
                    sale.status === 'cancelled' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {sale.status === 'completed' ? 'Confirmée' : sale.status === 'cancelled' ? 'Annulée' : 'Brouillon'}
                  </span>
                )}
              </div>
              {sale && (
                <p className="text-xs text-gray-400 mt-0.5">
                  {new Date(sale.created_at).toLocaleString('fr-FR')}
                  {sale.user && ` — ${sale.user.name}`}
                  {sale.client && ` — Client : ${sale.client.name}`}
                </p>
              )}
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
              <X size={18} />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {isLoading && (
              <div className="flex justify-center py-10">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            )}

            {/* Items */}
            {!isLoading && items.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Articles</p>
                <div className="rounded-xl border border-gray-100 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-xs text-gray-500">
                      <tr>
                        <th className="px-3 py-2 text-left">Produit</th>
                        <th className="px-3 py-2 text-center">Qté</th>
                        <th className="px-3 py-2 text-right">Prix unit.</th>
                        <th className="px-3 py-2 text-center">Remise</th>
                        <th className="px-3 py-2 text-right">Total TTC</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, i) => (
                        <tr key={i} className="border-t border-gray-100">
                          <td className="px-3 py-2 font-medium text-gray-800">
                            {item.product?.name ?? '—'}
                          </td>
                          <td className="px-3 py-2 text-center text-gray-600">{parseFloat(item.qty)}</td>
                          <td className="px-3 py-2 text-right text-gray-600">
                            {formatCurrency(parseFloat(item.unit_price_ttc))}
                          </td>
                          <td className="px-3 py-2 text-center text-gray-500">
                            {parseFloat(item.discount_pct ?? 0) > 0
                              ? <span className="text-green-600">-{item.discount_pct}%</span>
                              : '—'}
                          </td>
                          <td className="px-3 py-2 text-right font-semibold text-gray-800">
                            {formatCurrency(parseFloat(item.total_ttc))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-50 border-t border-gray-200">
                      <tr>
                        <td colSpan={4} className="px-3 py-2 text-right font-bold text-gray-800">TOTAL TTC</td>
                        <td className="px-3 py-2 text-right font-bold text-primary">
                          {formatCurrency(parseFloat(sale?.total_ttc ?? 0))}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {/* Payments */}
            {!isLoading && payments.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Règlement</p>
                <div className="flex gap-2 flex-wrap">
                  {payments.map((p, i) => (
                    <span key={i} className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-xs font-medium">
                      {p.payment_method} — {formatCurrency(parseFloat(p.amount))}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Cancellation reason */}
            {sale?.status === 'cancelled' && sale.cancellation_reason && (
              <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                <span className="font-semibold">Motif : </span>{sale.cancellation_reason}
              </div>
            )}
          </div>

          {/* Footer actions */}
          <div className="flex gap-2 px-6 py-4 border-t">
            <button onClick={onClose}
              className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
              Fermer
            </button>
            <button onClick={() => printReceipt(sale ?? {})}
              className="flex items-center gap-1.5 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
              <Printer size={14} /> Ticket
            </button>
            {sale?.id && (
              <button onClick={() => downloadPdf(`/pdf/sales/${sale.id}`, `Recu-${sale.reference}.pdf`)}
                className="flex items-center gap-1.5 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                <FileText size={14} /> Format A4
              </button>
            )}
            {sale?.status === 'completed' && (
              <>
                <button
                  onClick={() => setShowCancel(true)}
                  className="flex items-center gap-1.5 px-4 py-2 bg-red-50 text-red-600 border border-red-200 rounded-lg text-sm hover:bg-red-100 ml-auto">
                  <Ban size={14} /> Annuler
                </button>
                <button
                  onClick={() => setShowModify(true)}
                  className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 text-white rounded-lg text-sm hover:bg-amber-600">
                  <Edit2 size={14} /> Modifier
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {showCancel && sale && (
        <CancelModal
          sale={sale}
          onClose={() => setShowCancel(false)}
          onCancelled={onCancelled}
        />
      )}

      {showModify && sale && (
        <ModifyConfirmModal
          sale={sale}
          onClose={() => setShowModify(false)}
          onConfirmed={() => onModify(getModifyLines())}
        />
      )}
    </>
  )
}

// ─── Sales List ───────────────────────────────────────────────────────────────

function SalesList({ onNew, onModify }: { onNew: () => void; onModify: (lines: SaleLine[]) => void }) {
  const queryClient = useQueryClient()
  const today = new Date().toISOString().slice(0, 10)

  // Draft filters (what user types) — not applied until "Chercher" is clicked
  const [draftFrom,    setDraftFrom]    = useState(today)
  const [draftTo,      setDraftTo]      = useState(today)
  const [draftStatus,  setDraftStatus]  = useState('')
  const [draftChannel, setDraftChannel] = useState('')

  // Applied filters (used in the query)
  const [applied, setApplied] = useState({ dateFrom: today, dateTo: today, status: '', channel: '' })
  const [page,         setPage]         = useState(1)
  const [detailSaleId, setDetailSaleId] = useState<number | null>(null)

  const search = () => {
    setApplied({ dateFrom: draftFrom, dateTo: draftTo, status: draftStatus, channel: draftChannel })
    setPage(1)
  }

  const reset = () => {
    setDraftFrom(today); setDraftTo(today); setDraftStatus(''); setDraftChannel('')
    setApplied({ dateFrom: today, dateTo: today, status: '', channel: '' })
    setPage(1)
  }

  const { data, isLoading } = useQuery({
    queryKey: ['sales', page, applied],
    queryFn: () => api.get('/sales', {
      params: {
        page, per_page: 25,
        date_from: applied.dateFrom, date_to: applied.dateTo,
        status: applied.status || undefined, channel: applied.channel || undefined,
      }
    }).then(r => r.data),
    staleTime: 0,
  })

  const sales: Record<string, any>[]  = data?.data    ?? []
  const meta                           = data?.meta    ?? {}
  const totals: Record<string, number> = data?.totals  ?? {}

  return (
    <div className="p-3 sm:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Ventes</h1>
          <p className="text-xs text-gray-500 mt-0.5">Historique des bons de vente</p>
        </div>
        <button onClick={onNew}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary-600 transition-colors shadow-sm">
          <Plus size={15} /> Nouvelle vente
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Du</label>
          <input type="date" value={draftFrom} onChange={e => setDraftFrom(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && search()}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Au</label>
          <input type="date" value={draftTo} onChange={e => setDraftTo(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && search()}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Canal</label>
          <select value={draftChannel} onChange={e => setDraftChannel(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30">
            <option value="">Tous les canaux</option>
            <option value="pos">Caisse POS</option>
            <option value="counter">Comptoir</option>
            <option value="takeaway">Emporter</option>
            <option value="delivery">Livraison</option>
            <option value="online">En ligne</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Statut</label>
          <select value={draftStatus} onChange={e => setDraftStatus(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30">
            <option value="">Tous les statuts</option>
            <option value="completed">Confirmées</option>
            <option value="draft">Brouillons</option>
            <option value="cancelled">Annulées</option>
          </select>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 ml-auto pt-4">
          <button
            onClick={reset}
            className="flex items-center gap-1.5 px-4 py-2 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50 transition-colors"
          >
            <X size={13} /> Effacer
          </button>
          <button
            onClick={search}
            className="flex items-center gap-1.5 px-5 py-2 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary-600 transition-colors shadow-sm"
          >
            <ShoppingCart size={13} /> Chercher
          </button>
        </div>
      </div>

      {/* Summary cards */}
      {!isLoading && (totals.count ?? 0) > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div className="bg-white rounded-xl border border-gray-200 px-4 py-3">
            <div className="text-xs text-gray-400 font-medium">Ventes confirmées</div>
            <div className="text-lg font-bold text-gray-800 mt-0.5">{totals.completed_count ?? 0}</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 px-4 py-3">
            <div className="text-xs text-gray-400 font-medium">Annulées</div>
            <div className="text-lg font-bold text-red-500 mt-0.5">{totals.cancelled_count ?? 0}</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 px-4 py-3">
            <div className="text-xs text-gray-400 font-medium">Total TTC (confirmées)</div>
            <div className="text-lg font-bold text-gray-800 mt-0.5 font-mono">{formatCurrency(totals.total_ttc ?? 0)}</div>
          </div>
          <div className="bg-emerald-50 rounded-xl border border-emerald-200 px-4 py-3">
            <div className="text-xs text-emerald-600 font-medium">Montant encaissé</div>
            <div className="text-lg font-bold text-emerald-700 mt-0.5 font-mono">{formatCurrency(totals.paid_amount ?? 0)}</div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              <th className="px-4 py-3 text-left">Référence</th>
              <th className="px-4 py-3 text-left">Date & Heure</th>
              <th className="px-4 py-3 text-left">Client</th>
              <th className="px-4 py-3 text-left">Vendeur</th>
              <th className="px-4 py-3 text-center">Canal</th>
              <th className="px-4 py-3 text-right">Avant remise</th>
              <th className="px-4 py-3 text-right">Remise</th>
              <th className="px-4 py-3 text-right">Total TTC</th>
              <th className="px-4 py-3 text-center">Statut</th>
              <th className="px-4 py-3 text-center w-20">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={10} className="py-16 text-center">
                <div className="inline-block w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </td></tr>
            )}
            {!isLoading && sales.length === 0 && (
              <tr><td colSpan={10} className="py-16 text-center text-gray-400 text-sm">
                Aucune vente trouvée pour cette période.
              </td></tr>
            )}
            {sales.map(s => (
              <tr
                key={s.id}
                onClick={() => setDetailSaleId(s.id)}
                className={`border-b border-gray-100 transition-colors cursor-pointer ${
                  s.status === 'cancelled' ? 'bg-red-50/30 hover:bg-red-50/60' : 'hover:bg-blue-50/30'
                }`}
              >
                <td className="px-4 py-3">
                  <span className={`font-mono text-xs px-2 py-0.5 rounded ${
                    s.status === 'cancelled' ? 'bg-red-100 text-red-700 line-through' : 'bg-gray-100 text-gray-600'
                  }`}>{s.reference}</span>
                </td>
                <td className="px-4 py-3 text-gray-600 text-xs">
                  {new Date(s.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                  {' '}<span className="text-gray-400">{new Date(s.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                </td>
                <td className="px-4 py-3 text-gray-700">{s.client?.name ?? <span className="text-gray-300">—</span>}</td>
                <td className="px-4 py-3 text-gray-600 text-xs">{s.user?.name ?? '—'}</td>
                <td className="px-4 py-3 text-center">
                  <ChannelBadge channel={s.channel} />
                </td>
                <td className="px-4 py-3 text-right">
                  {parseFloat(s.discount_amount ?? 0) > 0 ? (
                    <span className={`font-mono text-xs ${s.status === 'cancelled' ? 'text-gray-300 line-through' : 'text-gray-500'}`}>
                      {formatCurrency(parseFloat(s.total_ttc) + parseFloat(s.discount_amount))}
                    </span>
                  ) : (
                    <span className="text-gray-300">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  {parseFloat(s.discount_amount ?? 0) > 0 ? (
                    <span className={`font-mono text-xs font-semibold ${s.status === 'cancelled' ? 'text-gray-300 line-through' : 'text-green-600'}`}>
                      −{formatCurrency(parseFloat(s.discount_amount))}
                    </span>
                  ) : (
                    <span className="text-gray-300">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <span className={`font-semibold ${s.status === 'cancelled' ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                    {formatCurrency(parseFloat(s.total_ttc))}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  <div className="flex flex-col items-center gap-1">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      s.status === 'completed' ? 'bg-green-100 text-green-700' :
                      s.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                      'bg-amber-100 text-amber-700'
                    }`}>
                      {s.status === 'completed' ? 'Confirmée' : s.status === 'cancelled' ? 'Annulée' : 'Brouillon'}
                    </span>
                    {s.status === 'cancelled' && s.refund_method && s.refund_method !== 'none' && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 flex items-center gap-1">
                        <RotateCcw size={9} />
                        Remb. {formatCurrency(parseFloat(s.refund_amount ?? 0))}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                  <button
                    onClick={() => setDetailSaleId(s.id)}
                    title="Voir le détail"
                    className="text-gray-400 hover:text-primary transition-colors p-1.5 rounded-lg hover:bg-primary/5"
                  >
                    <Eye size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>

          {/* Totals footer */}
          {!isLoading && sales.length > 0 && (
            <tfoot>
              <tr className="bg-gray-900 text-white text-xs font-bold">
                <td colSpan={5} className="px-4 py-3 text-right uppercase tracking-wider text-gray-300">
                  Total sur {totals.count ?? 0} vente{(totals.count ?? 0) !== 1 ? 's' : ''} ({totals.completed_count ?? 0} confirmée{(totals.completed_count ?? 0) !== 1 ? 's' : ''})
                </td>
                <td className="px-4 py-3 text-right font-mono text-gray-400">
                  {(totals.total_discounts ?? 0) > 0 ? formatCurrency((totals.total_ttc ?? 0) + (totals.total_discounts ?? 0)) : '—'}
                </td>
                <td className="px-4 py-3 text-right font-mono text-green-300">
                  {(totals.total_discounts ?? 0) > 0 ? `−${formatCurrency(totals.total_discounts ?? 0)}` : '—'}
                </td>
                <td className="px-4 py-3 text-right font-mono text-base text-orange-300">
                  {formatCurrency(totals.total_ttc ?? 0)}
                </td>
                <td className="px-4 py-3 text-center text-emerald-300 font-mono">
                  Encaissé : {formatCurrency(totals.paid_amount ?? 0)}
                </td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>

        {/* Pagination */}
        {meta.last_page > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 bg-gray-50">
            <span className="text-xs text-gray-500">
              {meta.from}–{meta.to} sur {meta.total} ventes
            </span>
            <div className="flex gap-1">
              <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
                className="px-3 py-1.5 text-xs border rounded-lg disabled:opacity-40 hover:bg-white transition-colors">Précédent</button>
              <button disabled={page === meta.last_page} onClick={() => setPage(p => p + 1)}
                className="px-3 py-1.5 text-xs border rounded-lg disabled:opacity-40 hover:bg-white transition-colors">Suivant</button>
            </div>
          </div>
        )}
      </div>

      {/* Detail modal */}
      {detailSaleId !== null && (
        <SaleDetailModal
          saleId={detailSaleId}
          onClose={() => setDetailSaleId(null)}
          onCancelled={() => {
            setDetailSaleId(null)
            queryClient.invalidateQueries({ queryKey: ['sales'] })
          }}
          onModify={(lines) => {
            setDetailSaleId(null)
            queryClient.invalidateQueries({ queryKey: ['sales'] })
            onModify(lines)
          }}
        />
      )}
    </div>
  )
}

// ─── Main export ──────────────────────────────────────────────────────────────

export default function SalesPage() {
  const [view, setView]           = useState<'list' | 'new'>('list')
  const [editLines, setEditLines] = useState<SaleLine[] | undefined>()

  const handleModify = (lines: SaleLine[]) => {
    setEditLines(lines)
    setView('new')
  }

  if (view === 'new') {
    return (
      <SaleForm
        onSaved={() => { setView('list'); setEditLines(undefined) }}
        onCancel={() => { setView('list'); setEditLines(undefined) }}
        initialLines={editLines}
      />
    )
  }

  return <SalesList onNew={() => setView('new')} onModify={handleModify} />
}
