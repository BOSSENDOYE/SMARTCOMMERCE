import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { v4 as uuidv4 } from 'uuid'
import QRCode from 'react-qr-code'
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
  DollarSign, Tag, Users, Printer, Clock, Ban, RotateCcw, Edit2, Eye,
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
  source: 'product' | 'restaurant_item'
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
              <div className="flex flex-col items-end gap-0.5">
                {c.credit_balance != null && c.credit_balance > 0 && (
                  <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                    Dette {formatCurrency(c.credit_balance)}
                  </span>
                )}
                {c.account_balance != null && (
                  <span className={`text-xs px-2 py-0.5 rounded-full ${(c.account_balance ?? 0) >= 0 ? 'text-indigo-600 bg-indigo-50' : 'text-red-600 bg-red-50'}`}>
                    Compte {(c.account_balance ?? 0) >= 0 ? '+' : ''}{formatCurrency(c.account_balance ?? 0)}
                  </span>
                )}
              </div>
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

function PaymentModal({ total, clientAccountBalance, clientName, onClose, onConfirm, processing }: {
  total: number
  clientAccountBalance?: number
  clientName?: string
  onClose: () => void
  onConfirm: (payments: { payment_method: string; amount: number }[]) => void
  processing: boolean
}) {
  const [payments, setPayments] = useState<PaymentEntry[]>([
    { method: 'cash', amount: total }
  ])

  const totalPaid = payments.reduce((s, p) => s + (p.amount || 0), 0)
  const hasCredit = payments.some(p => p.method === 'credit')
  const ready = totalPaid >= total || hasCredit

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-lg shadow-2xl overflow-hidden">

        {/* Header with gradient */}
        <div className="bg-gradient-to-br from-gray-900 to-gray-800 px-6 py-5 flex items-center justify-between">
          <div>
            <p className="text-gray-400 text-xs font-medium uppercase tracking-widest mb-1">Encaissement</p>
            <p className="text-white text-3xl font-bold font-mono">{formatCurrency(total)}</p>
            {clientName && (
              <p className="text-gray-400 text-xs mt-1">Client : {clientName}</p>
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
                ? total - payments.filter(x => x.method !== 'credit').reduce((s, x) => s + x.amount, 0)
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

  const handlePrint = () => window.print()

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
        ] as ([string, string] | null)[]).filter(Boolean).map(([k, v]) => (
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
        <div className="w-full max-w-sm bg-white rounded-b-2xl border-t px-4 pb-5 pt-3 flex gap-3 flex-shrink-0 shadow-2xl">
          <button
            onClick={handlePrint}
            className="flex-1 flex items-center justify-center gap-2 py-3 border-2 text-sm font-semibold rounded-xl transition-colors"
            style={{ borderColor: 'var(--color-primary)', color: 'var(--color-primary)' }}
          >
            <Printer size={17} /> Imprimer
          </button>
          <button
            onClick={onNewSale}
            className="flex-1 py-3 btn-primary text-sm font-semibold rounded-xl flex items-center justify-center gap-2"
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

export default function PosPage() {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const {
    items, addItem, updateQty, updateDiscount, removeItem, clearCart,
    client_id, client_name, client_account_balance, setClient, cash_session_id, setCashSession,
    holdCart, recallCart, on_hold_carts, is_offline, setOffline,
  } = usePosStore()

  const storeBusinessType = user?.store?.business_type ?? 'grande_surface'
  const isRestaurant = storeBusinessType === 'restaurant' || storeBusinessType === 'mixte'

  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState<PosItem[]>([])
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null)
  const [selectedCourse, setSelectedCourse] = useState<string | null>(null)
  const [showPayment, setShowPayment] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [showCloseSession, setShowCloseSession] = useState(false)
  const [showClientSearch, setShowClientSearch] = useState(false)
  const [showHoldCarts, setShowHoldCarts] = useState(false)
  const [showRecentSales, setShowRecentSales] = useState(false)
  const [session, setSession] = useState<CashSession | null>(null)
  const [sessionLoading, setSessionLoading] = useState(true)
  const [saleReceipt, setSaleReceipt] = useState<SaleReceipt | null>(null)

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

  // Fetch items for grid — products or restaurant items depending on store type
  const { data: gridProducts = [], isLoading: productsLoading, isError: productsError } = useQuery<PosItem[]>({
    queryKey: isRestaurant
      ? ['pos-restaurant-items', selectedCourse]
      : ['pos-products', selectedCategoryId],
    queryFn: isRestaurant
      ? () => api.get('/restaurant-items', {
          params: { course: selectedCourse ?? undefined, available: 1, active: 1 },
        }).then(res => (res.data as any[]).map(ri => ({
          id: ri.id,
          name: ri.name,
          short_name: ri.name,
          sale_price_ttc: parseFloat(ri.price_ttc),
          vat_rate: parseFloat(ri.vat_rate),
          is_weight_based: false,
          stock_qty: 999,
          category_name: COURSES.find(c => c.value === ri.course)?.label,
          source: 'restaurant_item' as const,
        })))
      : () => api.get('/products', {
          params: { category_id: selectedCategoryId ?? undefined, per_page: 500, is_active: true, has_stock: 1 },
        }).then(res => res.data.data.map((p: {
          id: number; name: string; short_name: string
          sale_price_ttc: number; vat_rate: number; is_weight_based: boolean
          category?: { name: string }; stock_level?: { qty_on_hand: number }
        }) => ({
          id: p.id,
          name: p.name,
          short_name: p.short_name,
          sale_price_ttc: p.sale_price_ttc,
          vat_rate: p.vat_rate,
          is_weight_based: p.is_weight_based,
          stock_qty: p.stock_level?.qty_on_hand ?? 0,
          category_name: p.category?.name,
          source: 'product' as const,
        }))),
    enabled: !is_offline,
  })

  // Search products / restaurant items
  useEffect(() => {
    if (!search || search.length < 2) { setSearchResults([]); return }
    const timer = setTimeout(async () => {
      if (isRestaurant) {
        try {
          const res = await api.get('/restaurant-items', { params: { search, available: 1, active: 1 } })
          setSearchResults((res.data as any[]).map(ri => ({
            id: ri.id,
            name: ri.name,
            short_name: ri.name,
            sale_price_ttc: parseFloat(ri.price_ttc),
            vat_rate: parseFloat(ri.vat_rate),
            is_weight_based: false,
            stock_qty: 999,
            category_name: COURSES.find(c => c.value === ri.course)?.label,
            source: 'restaurant_item' as const,
          })))
        } catch {
          setSearchResults([])
        }
      } else if (is_offline) {
        setSearchResults(await searchProductsOffline(search) as any)
      } else {
        try {
          const res = await api.get('/products', { params: { search, per_page: 10, is_active: true } })
          setSearchResults(res.data.data.map((p: {
            id: number; name: string; short_name: string
            sale_price_ttc: number; vat_rate: number; is_weight_based: boolean
            category?: { name: string }; stock_level?: { qty_on_hand: number }
          }) => ({
            id: p.id,
            name: p.name,
            short_name: p.short_name,
            sale_price_ttc: p.sale_price_ttc,
            vat_rate: p.vat_rate,
            is_weight_based: p.is_weight_based,
            stock_qty: p.stock_level?.qty_on_hand ?? 0,
            category_name: p.category?.name,
            source: 'product' as const,
          })))
        } catch {
          setSearchResults(await searchProductsOffline(search) as any)
        }
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [search, is_offline, isRestaurant])

  const handleScanOrSearch = async (value: string) => {
    if (!value.trim()) return
    // Barcode scan only for non-restaurant stores
    if (!isRestaurant && /^\d{8,14}$/.test(value.trim())) {
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
    setSearch('')
    setSearchResults([])
    searchRef.current?.focus()
    toast.success(`${item.short_name ?? item.name} ajouté`, { duration: 800 })
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
        ...(i.restaurant_item_id
          ? { restaurant_item_id: i.restaurant_item_id }
          : { product_id: i.product_id, lot_id: i.lot_id }),
        qty: i.qty,
        unit_price_ttc: i.unit_price_ttc,
        discount_pct: i.discount_pct,
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
      const res = await api.post('/sales', salePayload)
      clearCart()
      setShowPayment(false)
      setSaleReceipt(res.data)
      // Refresh product stock counts after sale
      queryClient.invalidateQueries({ queryKey: ['pos-products'] })
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
            onClick={() => setShowRecentSales(true)}
            className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 border border-indigo-200 hover:border-indigo-300 px-2 py-1 rounded-lg bg-indigo-50">
            <Clock size={12} /> Ventes récentes
          </button>
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
              <button key={p.id}
                onClick={() => addProductToCart(p)}
                disabled={p.source !== 'restaurant_item' && p.stock_qty <= 0}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left border-b last:border-0 ${p.source !== 'restaurant_item' && p.stock_qty <= 0 ? 'opacity-40 cursor-not-allowed bg-gray-50' : 'hover:bg-primary-50'}`}>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">{p.name}</p>
                  <p className="text-xs text-gray-400">{p.category_name}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-bold text-primary">{formatCurrency(p.sale_price_ttc)}</p>
                  {p.source !== 'restaurant_item' && (
                    <p className={`text-xs ${p.stock_qty > 0 ? 'text-green-600' : 'text-red-500'}`}>
                      {p.stock_qty <= 0 ? 'Rupture' : `Stock: ${formatNumber(p.stock_qty, 0)}`}
                    </p>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
        {search.length >= 2 && searchResults.length === 0 && (
          <div className="bg-white border-b px-4 py-3 text-sm text-gray-400">Aucun produit trouvé pour «{search}»</div>
        )}

        {/* Category / Course filter pills */}
        <div className="bg-white border-b px-4 py-2 flex gap-2 overflow-x-auto flex-shrink-0">
          {isRestaurant ? (
            <>
              <button
                onClick={() => setSelectedCourse(null)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap border transition-colors ${selectedCourse === null ? 'bg-primary text-white border-primary' : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-primary-300'}`}>
                Tout le menu
              </button>
              {COURSES.map(c => (
                <button key={c.value}
                  onClick={() => setSelectedCourse(c.value)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap border transition-colors ${selectedCourse === c.value ? 'bg-primary text-white border-primary' : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-primary-300'}`}>
                  {c.label}
                </button>
              ))}
            </>
          ) : (
            <>
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
            </>
          )}
        </div>

        {/* Product grid */}
        <div className="flex-1 p-3 overflow-y-auto">
          {!search && productsLoading && (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mb-3" />
              <p className="text-sm">Chargement des produits...</p>
            </div>
          )}
          {!search && productsError && (
            <div className="flex flex-col items-center justify-center h-full text-red-400">
              <Scan size={48} className="mb-3 opacity-40" />
              <p className="text-sm font-medium">Erreur de chargement</p>
              <p className="text-xs text-gray-400 mt-1">Vérifiez la connexion au serveur</p>
            </div>
          )}
          {!search && !productsLoading && !productsError && gridProducts.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-gray-300">
              <Scan size={64} className="mb-4" />
              <p className="text-base font-medium">Aucun produit disponible</p>
              <p className="text-sm">Tous les articles sont en rupture de stock</p>
            </div>
          )}
          {!search && !productsLoading && gridProducts.length > 0 && (
            <div className="grid grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-2">
              {gridProducts.map(p => (
                <button
                  key={p.id}
                  onClick={() => addProductToCart(p)}
                  className={`bg-white rounded-xl border p-3 text-left hover:border-primary-400 hover:shadow-sm transition-all group ${!isRestaurant && p.stock_qty <= 5 ? 'border-amber-200' : ''}`}>
                  <div className="w-8 h-8 bg-primary-50 rounded-lg flex items-center justify-center mb-2 group-hover:bg-primary-100">
                    <ShoppingBag size={16} className="text-primary" />
                  </div>
                  <p className="text-xs font-semibold text-gray-900 line-clamp-2 leading-tight mb-1">
                    {p.short_name ?? p.name}
                  </p>
                  <p className="text-sm font-bold text-primary">{formatCurrency(p.sale_price_ttc)}</p>
                  {isRestaurant ? (
                    <p className="text-xs mt-0.5 text-gray-400">{p.category_name}</p>
                  ) : (
                    <p className={`text-xs mt-0.5 ${p.stock_qty <= 5 ? 'text-amber-500' : 'text-gray-400'}`}>
                      Stock: {formatNumber(p.stock_qty, 0)}
                    </p>
                  )}
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
          clientAccountBalance={client_account_balance ?? undefined}
          clientName={client_name ?? undefined}
          onClose={() => setShowPayment(false)}
          onConfirm={handleSaleConfirm}
          processing={processing}
        />
      )}
      {showClientSearch && (
        <ClientSearchModal
          onSelect={(c) => { setClient(c.id, c.name, c.account_balance ?? null); setShowClientSearch(false) }}
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
      {saleReceipt && (
        <ReceiptModal
          sale={saleReceipt}
          onNewSale={() => setSaleReceipt(null)}
        />
      )}
      {showRecentSales && (
        <PosRecentSalesModal
          onClose={() => setShowRecentSales(false)}
        />
      )}
    </div>
  )
}
