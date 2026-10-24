import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import api from '../../lib/api'
import { formatCurrency, formatDateTime, formatNumber } from '../../lib/format'
import {
  CakeSlice, Plus, Search, CalendarClock, PackageCheck, Wallet, Clock,
  Trash2, ChevronLeft, ChevronRight, Phone, XCircle, Truck,
} from 'lucide-react'
import { useConfirm } from '../../hooks/useConfirm'

// ─── Types ───────────────────────────────────────────────────────────────────

type Status = 'pending' | 'in_production' | 'ready' | 'delivered' | 'cancelled'

interface OrderItem {
  id?: number
  product_id: number
  product?: { id: number; name: string; internal_code?: string }
  qty: number
  unit_price_ttc: number
  total_ttc: number
  details?: string
}

interface OrderPayment {
  id: number
  payment_method: string
  amount: number
  reference?: string
  paid_at: string
  user?: { name: string }
}

interface CustomerOrder {
  id: number
  reference: string
  customer_name: string
  customer_phone?: string
  pickup_at: string
  status: Status
  total_ttc: number
  paid_amount: number
  balance: number
  notes?: string
  cancellation_reason?: string
  items: OrderItem[]
  payments?: OrderPayment[]
  sale?: { id: number; reference: string } | null
  user?: { name: string }
}

interface OrderStats {
  today_pickups: number
  tomorrow_pickups: number
  open_count: number
  ready_count: number
  deposits_held: number
  balance_due: number
}

interface SearchProduct { id: number; name: string; internal_code?: string; sale_price_ttc: number }

// ─── Constants ───────────────────────────────────────────────────────────────

const STATUS: Record<Status, { label: string; cls: string }> = {
  pending:       { label: 'En attente',    cls: 'bg-yellow-100 text-yellow-700' },
  in_production: { label: 'En production', cls: 'bg-blue-100 text-blue-700' },
  ready:         { label: 'Prête',         cls: 'bg-green-100 text-green-700' },
  delivered:     { label: 'Livrée',        cls: 'bg-gray-100 text-gray-600' },
  cancelled:     { label: 'Annulée',       cls: 'bg-red-100 text-red-700' },
}

const NEXT_STATUS: Partial<Record<Status, { to: Status; label: string }>> = {
  pending:       { to: 'in_production', label: 'Lancer en production' },
  in_production: { to: 'ready',         label: 'Marquer prête' },
}

const PAYMENT_METHODS: Record<string, string> = {
  cash: 'Espèces', wave: 'Wave', orange_money: 'Orange Money', free_money: 'Free Money',
  card: 'Carte', check: 'Chèque', bank_transfer: 'Virement',
}

type ApiErr = { response?: { data?: { message?: string; errors?: Record<string, string[]> } } }

const apiError = (err: unknown): string => {
  const data = (err as ApiErr)?.response?.data
  if (data?.errors) return Object.values(data.errors).flat().join('\n')
  return data?.message ?? 'Une erreur est survenue'
}

const toLocalInput = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const isToday = (iso: string) => new Date(iso).toDateString() === new Date().toDateString()

// ─── Stat Card ───────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, icon, color }: {
  label: string; value: string; sub?: string
  icon: React.ReactNode; color: string
}) {
  return (
    <div className="card p-4 flex items-center gap-4">
      <div className={`p-3 rounded-xl ${color}`}>{icon}</div>
      <div>
        <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
        <p className="text-xl font-bold text-gray-900">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

// ─── Product search ──────────────────────────────────────────────────────────

function ProductSearch({ onSelect }: { onSelect: (p: SearchProduct) => void }) {
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)

  const { data: suggestions } = useQuery({
    queryKey: ['product-search', search, 'finished'],
    queryFn: () => api.get('/products', { params: { search, per_page: 8, is_active: 1, kind: 'finished' } }).then(r => (r.data.data ?? []) as SearchProduct[]),
    enabled: search.length >= 2,
  })

  return (
    <div className="relative">
      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
      <input
        className="input pl-9 w-full" placeholder="Ajouter un produit (gâteau, baguette…)"
        value={search}
        onChange={e => { setSearch(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
      />
      {open && (suggestions ?? []).length > 0 && (
        <div className="absolute z-10 bg-white border rounded-lg shadow-lg mt-1 w-full max-h-48 overflow-auto">
          {(suggestions ?? []).map(p => (
            <button
              key={p.id} type="button"
              className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b last:border-0 flex justify-between"
              onClick={() => { onSelect(p); setSearch(''); setOpen(false) }}
            >
              <span className="text-sm font-medium text-gray-900">{p.name}</span>
              <span className="text-sm text-gray-500">{formatCurrency(p.sale_price_ttc)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Order Form Modal (création / modification) ──────────────────────────────

interface DraftItem { product_id: number; name: string; qty: string; unit_price_ttc: string; details: string }

function OrderFormModal({ order, onClose }: { order?: CustomerOrder; onClose: () => void }) {
  const qc = useQueryClient()
  const [customerName, setCustomerName] = useState(order?.customer_name ?? '')
  const [customerPhone, setCustomerPhone] = useState(order?.customer_phone ?? '')
  const [pickupAt, setPickupAt] = useState(() => {
    if (order) return toLocalInput(new Date(order.pickup_at))
    const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(10, 0, 0, 0)
    return toLocalInput(d)
  })
  const [notes, setNotes] = useState(order?.notes ?? '')
  const [items, setItems] = useState<DraftItem[]>(() => (order?.items ?? []).map(i => ({
    product_id: i.product_id, name: i.product?.name ?? '', qty: String(i.qty),
    unit_price_ttc: String(i.unit_price_ttc), details: i.details ?? '',
  })))
  const [depositAmount, setDepositAmount] = useState('')
  const [depositMethod, setDepositMethod] = useState('cash')

  const total = items.reduce((s, i) => s + (parseFloat(i.qty) || 0) * (parseFloat(i.unit_price_ttc) || 0), 0)
  const update = (idx: number, patch: Partial<DraftItem>) => setItems(prev => prev.map((x, j) => j === idx ? { ...x, ...patch } : x))

  const { mutate: save, isPending } = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {
        customer_name: customerName,
        customer_phone: customerPhone || null,
        pickup_at: pickupAt.replace('T', ' '),
        notes: notes || null,
        items: items.map(i => ({
          product_id: i.product_id, qty: parseFloat(i.qty),
          unit_price_ttc: parseFloat(i.unit_price_ttc), details: i.details || null,
        })),
      }
      if (order) return api.put(`/customer-orders/${order.id}`, body)
      if (parseFloat(depositAmount) > 0) body.deposit = { payment_method: depositMethod, amount: parseFloat(depositAmount) }
      return api.post('/customer-orders', body)
    },
    onSuccess: () => {
      toast.success(order ? 'Commande modifiée' : 'Commande enregistrée')
      qc.invalidateQueries({ queryKey: ['customer-orders'] })
      qc.invalidateQueries({ queryKey: ['customer-orders-stats'] })
      qc.invalidateQueries({ queryKey: ['customer-order'] })
      onClose()
    },
    onError: (err) => toast.error(apiError(err)),
  })

  const valid = customerName.trim() && pickupAt && items.length > 0
    && items.every(i => parseFloat(i.qty) > 0 && parseFloat(i.unit_price_ttc) >= 0)
    && (parseFloat(depositAmount) || 0) <= total

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-lg font-bold text-gray-900">{order ? `Modifier ${order.reference}` : 'Nouvelle commande client'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        <div className="p-5 space-y-4 overflow-auto">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Client *</label>
              <input className="input w-full" placeholder="Nom du client" value={customerName} onChange={e => setCustomerName(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Téléphone</label>
              <input className="input w-full" placeholder="77 000 00 00" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Retrait le *</label>
              <input type="datetime-local" className="input w-full" value={pickupAt} onChange={e => setPickupAt(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Articles *</label>
            <ProductSearch onSelect={p => setItems(prev => [...prev, {
              product_id: p.id, name: p.name, qty: '1', unit_price_ttc: String(p.sale_price_ttc), details: '',
            }])} />
            <div className="mt-3 border rounded-lg divide-y">
              {items.length === 0 && <p className="p-4 text-sm text-gray-400 text-center">Aucun article</p>}
              {items.map((i, idx) => (
                <div key={idx} className="px-3 py-2 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="flex-1 text-sm font-medium text-gray-900">{i.name}</span>
                    <input type="number" min="0.001" step="1" className="input w-20 text-right" value={i.qty} onChange={e => update(idx, { qty: e.target.value })} />
                    <span className="text-xs text-gray-400">×</span>
                    <input type="number" min="0" className="input w-28 text-right" value={i.unit_price_ttc} onChange={e => update(idx, { unit_price_ttc: e.target.value })} />
                    <span className="w-24 text-right text-sm font-semibold">{formatCurrency((parseFloat(i.qty) || 0) * (parseFloat(i.unit_price_ttc) || 0))}</span>
                    <button type="button" className="text-gray-400 hover:text-red-500" onClick={() => setItems(prev => prev.filter((_, j) => j !== idx))}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <input
                    className="input w-full text-sm" placeholder="Personnalisation : parfum, inscription, décoration…"
                    value={i.details} onChange={e => update(idx, { details: e.target.value })}
                  />
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea className="input w-full" rows={2} placeholder="Livraison, allergies…" value={notes} onChange={e => setNotes(e.target.value)} />
          </div>

          <div className="bg-gray-50 rounded-lg p-3 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Total de la commande</span>
              <span className="font-bold text-gray-900">{formatCurrency(total)}</span>
            </div>
            {!order && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-gray-600 flex-1">Acompte versé</span>
                <input type="number" min="0" className="input w-32 text-right" placeholder="0" value={depositAmount} onChange={e => setDepositAmount(e.target.value)} />
                <select className="input w-36" value={depositMethod} onChange={e => setDepositMethod(e.target.value)}>
                  {Object.entries(PAYMENT_METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
            )}
            {!order && (parseFloat(depositAmount) || 0) > total && (
              <p className="text-xs text-red-600">L'acompte dépasse le total de la commande.</p>
            )}
          </div>
        </div>

        <div className="flex gap-3 p-5 border-t">
          <button type="button" onClick={onClose} className="flex-1 btn-secondary">Annuler</button>
          <button type="button" disabled={isPending || !valid} onClick={() => save()} className="flex-1 btn-primary">
            {isPending ? 'Enregistrement…' : order ? 'Enregistrer' : 'Créer la commande'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Order Detail Modal ──────────────────────────────────────────────────────

function OrderDetailModal({ id, onClose, onEdit }: { id: number; onClose: () => void; onEdit: (o: CustomerOrder) => void }) {
  const qc = useQueryClient()
  const confirm = useConfirm()
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState('cash')
  const [balanceMethod, setBalanceMethod] = useState('cash')
  const [cancelling, setCancelling] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [refund, setRefund] = useState(true)

  const { data: order, isLoading } = useQuery({
    queryKey: ['customer-order', id],
    queryFn: () => api.get(`/customer-orders/${id}`).then(r => r.data as CustomerOrder),
  })

  const onDone = (msg: string) => {
    toast.success(msg)
    qc.invalidateQueries({ queryKey: ['customer-orders'] })
    qc.invalidateQueries({ queryKey: ['customer-orders-stats'] })
    qc.invalidateQueries({ queryKey: ['customer-order', id] })
  }

  const action = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: object; msg: string }) => api.post(`/customer-orders/${id}/${path}`, body),
    onSuccess: (_, vars) => { onDone(vars.msg); setPayAmount(''); setCancelling(false) },
    onError: (err) => toast.error(apiError(err)),
  })

  if (isLoading || !order) {
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-10 text-gray-400">Chargement…</div>
      </div>
    )
  }

  const open = !['delivered', 'cancelled'].includes(order.status)
  const next = NEXT_STATUS[order.status]

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b">
          <div>
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              {order.reference}
              <span className={`badge ${STATUS[order.status].cls}`}>{STATUS[order.status].label}</span>
            </h2>
            <p className="text-sm text-gray-500">
              {order.customer_name}{order.customer_phone && <> · <Phone size={12} className="inline" /> {order.customer_phone}</>}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        <div className="p-5 space-y-4 overflow-auto text-sm">
          <div className={`rounded-lg px-4 py-3 flex items-center gap-2 ${isToday(order.pickup_at) ? 'bg-amber-50 text-amber-800' : 'bg-gray-50 text-gray-700'}`}>
            <CalendarClock size={16} /> Retrait le <b>{formatDateTime(order.pickup_at)}</b>
          </div>

          <table className="w-full">
            <thead className="text-xs text-gray-500 uppercase">
              <tr><th className="text-left py-2">Article</th><th className="text-right py-2">Qté</th><th className="text-right py-2">P.U.</th><th className="text-right py-2">Total</th></tr>
            </thead>
            <tbody className="divide-y">
              {order.items.map(i => (
                <tr key={i.id}>
                  <td className="py-2">
                    <p className="font-medium">{i.product?.name}</p>
                    {i.details && <p className="text-xs text-purple-700">✎ {i.details}</p>}
                  </td>
                  <td className="py-2 text-right">{formatNumber(i.qty, 0)}</td>
                  <td className="py-2 text-right">{formatCurrency(i.unit_price_ttc)}</td>
                  <td className="py-2 text-right font-semibold">{formatCurrency(i.total_ttc)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {order.notes && <p className="bg-gray-50 rounded-lg p-3 text-gray-600">{order.notes}</p>}

          <div className="grid grid-cols-3 gap-3 bg-gray-50 rounded-lg p-3">
            <div><p className="text-xs text-gray-500">Total</p><p className="font-bold">{formatCurrency(order.total_ttc)}</p></div>
            <div><p className="text-xs text-gray-500">Déjà payé</p><p className="font-bold text-green-700">{formatCurrency(order.paid_amount)}</p></div>
            <div><p className="text-xs text-gray-500">Reste à payer</p><p className="font-bold text-orange-600">{formatCurrency(order.balance)}</p></div>
          </div>

          {(order.payments ?? []).length > 0 && (
            <div>
              <p className="text-xs text-gray-500 uppercase mb-1">Paiements</p>
              {order.payments!.map(p => (
                <div key={p.id} className="flex justify-between py-1 border-b last:border-0">
                  <span>{formatDateTime(p.paid_at)} · {PAYMENT_METHODS[p.payment_method] ?? p.payment_method}{p.reference ? ` · ${p.reference}` : ''}</span>
                  <span className={p.amount < 0 ? 'text-red-600' : ''}>{formatCurrency(p.amount)}</span>
                </div>
              ))}
            </div>
          )}

          {order.sale && <p className="text-gray-500">Vente associée : <b>{order.sale.reference}</b></p>}
          {order.cancellation_reason && <p className="text-red-600">Motif d'annulation : {order.cancellation_reason}</p>}

          {open && order.balance > 0 && (
            <div className="border rounded-lg p-3 space-y-2">
              <p className="font-medium text-gray-700 flex items-center gap-2"><Wallet size={16} /> Encaisser un acompte</p>
              <div className="flex flex-wrap gap-2">
                <input type="number" min="1" max={order.balance} className="input w-32 text-right" placeholder="Montant" value={payAmount} onChange={e => setPayAmount(e.target.value)} />
                <select className="input w-36" value={payMethod} onChange={e => setPayMethod(e.target.value)}>
                  {Object.entries(PAYMENT_METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <button
                  className="btn-secondary" disabled={action.isPending || !(parseFloat(payAmount) > 0)}
                  onClick={() => action.mutate({ path: 'payments', body: { payment_method: payMethod, amount: parseFloat(payAmount) }, msg: 'Acompte enregistré' })}
                >
                  Enregistrer
                </button>
              </div>
            </div>
          )}

          {cancelling && (
            <div className="border border-red-200 bg-red-50 rounded-lg p-3 space-y-2">
              <input className="input w-full" placeholder="Motif d'annulation" value={cancelReason} onChange={e => setCancelReason(e.target.value)} />
              {order.paid_amount > 0 && (
                <label className="flex items-center gap-2 text-red-800">
                  <input type="checkbox" checked={refund} onChange={e => setRefund(e.target.checked)} />
                  Rembourser l'acompte de {formatCurrency(order.paid_amount)} (sinon il est conservé)
                </label>
              )}
              <div className="flex gap-2 justify-end">
                <button className="btn-secondary" onClick={() => setCancelling(false)}>Retour</button>
                <button
                  className="btn-primary bg-red-600 hover:bg-red-700" disabled={action.isPending}
                  onClick={() => action.mutate({ path: 'cancel', body: { reason: cancelReason || null, refund }, msg: 'Commande annulée' })}
                >
                  Confirmer l'annulation
                </button>
              </div>
            </div>
          )}
        </div>

        {open && !cancelling && (
          <div className="flex flex-wrap items-center gap-2 p-5 border-t">
            <button className="btn-secondary text-red-600 flex items-center gap-1" onClick={() => setCancelling(true)}>
              <XCircle size={16} /> Annuler
            </button>
            <button className="btn-secondary" onClick={() => onEdit(order)}>Modifier</button>
            <div className="flex-1" />
            {next && (
              <button
                className="btn-secondary" disabled={action.isPending}
                onClick={() => action.mutate({ path: 'status', body: { status: next.to }, msg: STATUS[next.to].label })}
              >
                {next.label}
              </button>
            )}
            {order.balance > 0 && (
              <select className="input w-36" value={balanceMethod} onChange={e => setBalanceMethod(e.target.value)}>
                {Object.entries(PAYMENT_METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            )}
            <button
              className="btn-primary flex items-center gap-1" disabled={action.isPending}
              onClick={async () => {
                const msg = order.balance > 0
                  ? `Remettre la commande et encaisser le solde de ${formatCurrency(order.balance)} (${PAYMENT_METHODS[balanceMethod]}) ?`
                  : 'Remettre la commande au client ?'
                if (await confirm(msg)) action.mutate({ path: 'deliver', body: { payment_method: balanceMethod }, msg: 'Commande livrée — vente enregistrée' })
              }}
            >
              <Truck size={16} /> Livrer{order.balance > 0 ? ` · ${formatCurrency(order.balance)}` : ''}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function CustomerOrdersPage() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('open')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<CustomerOrder | undefined>()
  const [detailId, setDetailId] = useState<number | null>(null)

  const { data: stats } = useQuery({
    queryKey: ['customer-orders-stats'],
    queryFn: () => api.get('/customer-orders/stats').then(r => r.data as OrderStats),
  })

  const { data, isLoading } = useQuery({
    queryKey: ['customer-orders', page, search, status],
    queryFn: () => api.get('/customer-orders', { params: { page, search: search || undefined, status: status || undefined } }).then(r => r.data),
  })
  const orders: CustomerOrder[] = data?.data ?? []

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="p-2 bg-pink-100 rounded-xl"><CakeSlice className="text-pink-700" size={24} /></div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">Commandes clients</h1>
          <p className="text-sm text-gray-500">Gâteaux, pièces montées et grosses commandes avec acompte</p>
        </div>
        <button onClick={() => { setEditing(undefined); setShowForm(true) }} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> Nouvelle commande
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="À retirer aujourd'hui" value={formatNumber(stats?.today_pickups ?? 0)} sub={`${formatNumber(stats?.tomorrow_pickups ?? 0)} demain`} icon={<CalendarClock size={20} className="text-amber-700" />} color="bg-amber-100" />
        <StatCard label="Commandes en cours" value={formatNumber(stats?.open_count ?? 0)} sub={`${formatNumber(stats?.ready_count ?? 0)} prêtes`} icon={<Clock size={20} className="text-blue-700" />} color="bg-blue-100" />
        <StatCard label="Acomptes encaissés" value={formatCurrency(stats?.deposits_held ?? 0)} icon={<Wallet size={20} className="text-green-700" />} color="bg-green-100" />
        <StatCard label="Reste à encaisser" value={formatCurrency(stats?.balance_due ?? 0)} icon={<PackageCheck size={20} className="text-orange-700" />} color="bg-orange-100" />
      </div>

      <div className="card p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="input pl-9 w-full" placeholder="Référence, client, téléphone…" value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
        </div>
        <select className="input w-44" value={status} onChange={e => { setStatus(e.target.value); setPage(1) }}>
          <option value="open">En cours</option>
          <option value="">Toutes</option>
          {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
            <tr>
              <th className="text-left px-4 py-3">Retrait</th>
              <th className="text-left px-4 py-3">Référence</th>
              <th className="text-left px-4 py-3">Client</th>
              <th className="text-left px-4 py-3">Articles</th>
              <th className="text-right px-4 py-3">Total</th>
              <th className="text-right px-4 py-3">Reste</th>
              <th className="text-left px-4 py-3">Statut</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading && <tr><td colSpan={7} className="text-center py-10 text-gray-400">Chargement…</td></tr>}
            {!isLoading && orders.length === 0 && <tr><td colSpan={7} className="text-center py-10 text-gray-400">Aucune commande</td></tr>}
            {orders.map(o => (
              <tr key={o.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setDetailId(o.id)}>
                <td className={`px-4 py-3 whitespace-nowrap ${isToday(o.pickup_at) && !['delivered', 'cancelled'].includes(o.status) ? 'text-amber-700 font-semibold' : 'text-gray-600'}`}>
                  {formatDateTime(o.pickup_at)}
                </td>
                <td className="px-4 py-3 font-mono text-xs">{o.reference}</td>
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-900">{o.customer_name}</p>
                  {o.customer_phone && <p className="text-xs text-gray-400">{o.customer_phone}</p>}
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {o.items.map(i => `${formatNumber(i.qty, 0)} × ${i.product?.name}`).join(', ')}
                </td>
                <td className="px-4 py-3 text-right font-semibold">{formatCurrency(o.total_ttc)}</td>
                <td className={`px-4 py-3 text-right ${o.balance > 0 ? 'text-orange-600' : 'text-gray-400'}`}>{formatCurrency(o.balance)}</td>
                <td className="px-4 py-3"><span className={`badge ${STATUS[o.status].cls}`}>{STATUS[o.status].label}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && data.last_page > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t text-sm text-gray-500">
            <span>{data.total} commandes</span>
            <div className="flex items-center gap-2">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="btn-secondary px-2 py-1"><ChevronLeft size={16} /></button>
              <span>{page} / {data.last_page}</span>
              <button disabled={page >= data.last_page} onClick={() => setPage(p => p + 1)} className="btn-secondary px-2 py-1"><ChevronRight size={16} /></button>
            </div>
          </div>
        )}
      </div>

      {showForm && <OrderFormModal order={editing} onClose={() => setShowForm(false)} />}
      {detailId && (
        <OrderDetailModal
          id={detailId}
          onClose={() => setDetailId(null)}
          onEdit={o => { setDetailId(null); setEditing(o); setShowForm(true) }}
        />
      )}
    </div>
  )
}
