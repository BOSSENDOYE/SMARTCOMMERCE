import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import api from '../../lib/api'
import { formatCurrency, formatDate, formatDateTime, formatNumber } from '../../lib/format'
import {
  Truck, Store, Hourglass, Wallet, ArrowLeftRight, Plus, Pencil, Search, ChevronLeft, ChevronRight, ClipboardCheck,
} from 'lucide-react'
import AllocationModal, { type PendingOrder } from '../../components/distribution/AllocationModal'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Courier {
  id: number
  name: string
  phone?: string
  zone?: string
  is_active: boolean
  debt: number
  open_round: { id: number; reference: string; qty_out: number; value: number } | null
}

interface RoundItem {
  id: number
  product_id: number
  product?: { id: number; name: string }
  qty_given: number
  qty_returned: number
  unit_price: number
}

interface CourierRound {
  id: number
  reference: string
  round_date: string
  status: 'open' | 'settled'
  amount_due: number
  amount_paid: number
  courier?: { id: number; name: string; phone?: string }
  items: RoundItem[]
  sale?: { id: number; reference: string } | null
  settled_at?: string
}

interface Movement {
  id: number
  created_at: string
  qty: number
  source: 'production' | 'pos' | 'courier'
  destination: 'pos' | 'courier'
  product?: { name: string }
  user?: { name: string }
  production_order?: { reference: string } | null
  source_round?: { reference: string; courier?: { name: string } } | null
  destination_round?: { reference: string; courier?: { name: string } } | null
}

interface DistributionStats {
  pending_orders: number
  pending_qty: number
  today_to_pos: number
  today_to_couriers: number
  open_rounds: number
  couriers_debt: number
}

interface FinishedProduct { id: number; name: string; stock_level?: { qty_on_hand: number } }

type Tab = 'pending' | 'rounds' | 'couriers' | 'journal'
const TABS: [Tab, string][] = [['pending', 'À répartir'], ['rounds', 'Tournées'], ['couriers', 'Livreurs'], ['journal', 'Journal']]

const PAYMENT_METHODS: Record<string, string> = {
  cash: 'Espèces', wave: 'Wave', orange_money: 'Orange Money', free_money: 'Free Money', card: 'Carte', bank_transfer: 'Virement',
}

type ApiErr = { response?: { data?: { message?: string; errors?: Record<string, string[]> } } }
const apiError = (err: unknown): string => {
  const data = (err as ApiErr)?.response?.data
  if (data?.errors) return Object.values(data.errors).flat().join('\n')
  return data?.message ?? 'Une erreur est survenue'
}

const REFRESH_KEYS = ['distribution-pending', 'distribution-stats', 'couriers', 'courier-rounds', 'distribution-movements', 'production-orders']

function useRefresh() {
  const qc = useQueryClient()
  return () => REFRESH_KEYS.forEach(key => qc.invalidateQueries({ queryKey: [key] }))
}

// ─── Stat Card ───────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, icon, color }: {
  label: string; value: string; sub?: string; icon: React.ReactNode; color: string
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

const Modal = ({ title, subtitle, onClose, children, footer }: {
  title: string; subtitle?: React.ReactNode; onClose: () => void; children: React.ReactNode; footer: React.ReactNode
}) => (
  <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
      <div className="flex items-center justify-between p-5 border-b">
        <div>
          <h2 className="text-lg font-bold text-gray-900">{title}</h2>
          {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
      </div>
      <div className="p-5 space-y-4 overflow-auto">{children}</div>
      <div className="flex gap-2 justify-end p-5 border-t">{footer}</div>
    </div>
  </div>
)

// ─── Transfer Modal (réaffectation) ──────────────────────────────────────────

type Place = { type: 'pos' } | { type: 'courier'; courier_id: number }
const parsePlace = (k: string): Place => (k === 'pos' ? { type: 'pos' } : { type: 'courier', courier_id: Number(k.slice(1)) })

function TransferModal({ couriers, onClose }: { couriers: Courier[]; onClose: () => void }) {
  const refresh = useRefresh()
  const [search, setSearch] = useState('')
  const [product, setProduct] = useState<FinishedProduct | null>(null)
  const [from, setFrom] = useState('pos')
  const [to, setTo] = useState(couriers[0] ? `c${couriers[0].id}` : 'pos')
  const [qty, setQty] = useState('')

  const { data: hits = [] } = useQuery({
    queryKey: ['product-search', search, 'finished'],
    queryFn: () => api.get('/products', { params: { search, per_page: 8, kind: 'finished' } }).then(r => r.data.data as FinishedProduct[]),
    enabled: search.length >= 2 && !product,
  })

  const { mutate, isPending } = useMutation({
    mutationFn: () => api.post('/distribution/transfer', {
      product_id: product!.id, qty: parseFloat(qty), from: parsePlace(from), to: parsePlace(to),
    }),
    onSuccess: () => { toast.success('Réaffectation enregistrée'); refresh(); onClose() },
    onError: (err) => toast.error(apiError(err)),
  })

  const places = [{ key: 'pos', label: 'Point de vente' }, ...couriers.map(c => ({ key: `c${c.id}`, label: c.name }))]

  return (
    <Modal
      title="Réaffecter du stock"
      subtitle="Transfert en cours de journée entre le point de vente et les livreurs"
      onClose={onClose}
      footer={<>
        <button className="btn-secondary" onClick={onClose}>Annuler</button>
        <button className="btn-primary" disabled={isPending || !product || !(parseFloat(qty) > 0) || from === to} onClick={() => mutate()}>
          {isPending ? 'Enregistrement…' : 'Transférer'}
        </button>
      </>}
    >
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Produit *</label>
        {product ? (
          <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
            <span className="font-medium">{product.name}</span>
            <button className="text-gray-400 hover:text-red-500" onClick={() => setProduct(null)}>×</button>
          </div>
        ) : (
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className="input pl-9 w-full" placeholder="Baguette, croissant…" value={search} onChange={e => setSearch(e.target.value)} />
            {hits.length > 0 && (
              <div className="absolute z-10 bg-white border rounded-lg shadow-lg mt-1 w-full max-h-48 overflow-auto">
                {hits.map(p => (
                  <button key={p.id} className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b last:border-0 text-sm" onClick={() => { setProduct(p); setSearch('') }}>
                    {p.name} <span className="text-gray-400">· stock PV {formatNumber(p.stock_level?.qty_on_hand ?? 0)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">De</label>
          <select className="input w-full" value={from} onChange={e => setFrom(e.target.value)}>
            {places.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Vers</label>
          <select className="input w-full" value={to} onChange={e => setTo(e.target.value)}>
            {places.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
        </div>
      </div>
      {from === to && <p className="text-xs text-red-600">La source et la destination doivent être différentes.</p>}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Quantité *</label>
        <input type="number" min="1" className="input w-full" value={qty} onChange={e => setQty(e.target.value)} />
      </div>
    </Modal>
  )
}

// ─── Settle Modal (fin de tournée) ───────────────────────────────────────────

function SettleModal({ round, onClose }: { round: CourierRound; onClose: () => void }) {
  const refresh = useRefresh()
  const [returns, setReturns] = useState<Record<number, string>>({})
  const [method, setMethod] = useState('cash')
  const [paid, setPaid] = useState<string | null>(null)
  const [notes, setNotes] = useState('')

  const rows = round.items.map(i => {
    const ret = Math.min(parseFloat(returns[i.product_id] ?? '') || 0, i.qty_given)
    const sold = i.qty_given - ret
    return { ...i, ret, sold, due: sold * i.unit_price }
  })
  const due = rows.reduce((s, r) => s + r.due, 0)
  const paidNum = paid === null ? due : parseFloat(paid) || 0
  const gap = Math.round((due - paidNum) * 100) / 100

  const { mutate, isPending } = useMutation({
    mutationFn: () => api.post(`/distribution/rounds/${round.id}/settle`, {
      returns: Object.fromEntries(rows.map(r => [r.product_id, r.ret])),
      payment_method: method, amount_paid: paidNum, notes: notes || null,
    }),
    onSuccess: () => { toast.success('Tournée clôturée — invendus remis en stock, vente enregistrée'); refresh(); onClose() },
    onError: (err) => toast.error(apiError(err)),
  })

  return (
    <Modal
      title={`Clôturer la tournée de ${round.courier?.name}`}
      subtitle={`${round.reference} · ${formatDate(round.round_date)}`}
      onClose={onClose}
      footer={<>
        <button className="btn-secondary" onClick={onClose}>Annuler</button>
        <button className="btn-primary" disabled={isPending || paidNum < 0} onClick={() => mutate()}>
          {isPending ? 'Enregistrement…' : 'Valider la clôture'}
        </button>
      </>}
    >
      <table className="w-full text-sm">
        <thead className="text-xs text-gray-500 uppercase">
          <tr>
            <th className="text-left py-2">Produit</th>
            <th className="text-right py-2">Confié</th>
            <th className="text-right py-2">Invendus</th>
            <th className="text-right py-2">Vendu</th>
            <th className="text-right py-2">Dû</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map(r => (
            <tr key={r.id}>
              <td className="py-2">
                <p className="font-medium">{r.product?.name}</p>
                <p className="text-xs text-gray-400">{formatCurrency(r.unit_price)} / u (prix livreur)</p>
              </td>
              <td className="py-2 text-right">{formatNumber(r.qty_given)}</td>
              <td className="py-2 text-right">
                <input
                  type="number" min="0" max={r.qty_given} className="input w-20 text-right" placeholder="0"
                  value={returns[r.product_id] ?? ''} onChange={e => setReturns(prev => ({ ...prev, [r.product_id]: e.target.value }))}
                />
              </td>
              <td className="py-2 text-right font-semibold">{formatNumber(r.sold)}</td>
              <td className="py-2 text-right">{formatCurrency(r.due)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-gray-500">Les invendus reviennent dans le stock du point de vente.</p>

      <div className="bg-gray-50 rounded-lg p-3 space-y-3">
        <div className="flex justify-between text-sm"><span className="text-gray-600">Montant dû</span><b>{formatCurrency(due)}</b></div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-gray-600 flex-1">Montant versé</span>
          <input type="number" min="0" className="input w-32 text-right" value={paid ?? String(Math.round(due))} onChange={e => setPaid(e.target.value)} />
          <select className="input w-36" value={method} onChange={e => setMethod(e.target.value)}>
            {Object.entries(PAYMENT_METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        {gap > 0 && <p className="text-sm text-red-600">Manquant de {formatCurrency(gap)} — reste à la charge du livreur.</p>}
        {gap < 0 && <p className="text-sm text-green-700">Excédent de {formatCurrency(-gap)} — imputé sur ses manquants antérieurs.</p>}
      </div>
      <textarea className="input w-full" rows={2} placeholder="Notes" value={notes} onChange={e => setNotes(e.target.value)} />
    </Modal>
  )
}

// ─── Courier Modal ───────────────────────────────────────────────────────────

function CourierModal({ courier, onClose }: { courier?: Courier; onClose: () => void }) {
  const refresh = useRefresh()
  const [name, setName] = useState(courier?.name ?? '')
  const [phone, setPhone] = useState(courier?.phone ?? '')
  const [zone, setZone] = useState(courier?.zone ?? '')
  const [active, setActive] = useState(courier?.is_active ?? true)

  const { mutate, isPending } = useMutation({
    mutationFn: () => {
      const body = { name, phone: phone || null, zone: zone || null, is_active: active }
      return courier ? api.put(`/distribution/couriers/${courier.id}`, body) : api.post('/distribution/couriers', body)
    },
    onSuccess: () => { toast.success(courier ? 'Livreur modifié' : 'Livreur ajouté'); refresh(); onClose() },
    onError: (err) => toast.error(apiError(err)),
  })

  return (
    <Modal
      title={courier ? `Modifier ${courier.name}` : 'Nouveau livreur'}
      onClose={onClose}
      footer={<>
        <button className="btn-secondary" onClick={onClose}>Annuler</button>
        <button className="btn-primary" disabled={isPending || !name.trim()} onClick={() => mutate()}>{isPending ? 'Enregistrement…' : 'Enregistrer'}</button>
      </>}
    >
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Nom *</label>
        <input className="input w-full" value={name} onChange={e => setName(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Téléphone</label>
          <input className="input w-full" value={phone} onChange={e => setPhone(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Zone de tournée</label>
          <input className="input w-full" placeholder="Ex. Médina" value={zone} onChange={e => setZone(e.target.value)} />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} /> Actif (peut recevoir des dotations)
      </label>
    </Modal>
  )
}

function DebtModal({ courier, onClose }: { courier: Courier; onClose: () => void }) {
  const refresh = useRefresh()
  const [amount, setAmount] = useState(String(courier.debt))
  const [method, setMethod] = useState('cash')

  const { mutate, isPending } = useMutation({
    mutationFn: () => api.post(`/distribution/couriers/${courier.id}/payments`, { payment_method: method, amount: parseFloat(amount) }),
    onSuccess: () => { toast.success('Remboursement enregistré'); refresh(); onClose() },
    onError: (err) => toast.error(apiError(err)),
  })

  return (
    <Modal
      title={`Remboursement — ${courier.name}`}
      subtitle={<>Manquant actuel : <b className="text-red-600">{formatCurrency(courier.debt)}</b></>}
      onClose={onClose}
      footer={<>
        <button className="btn-secondary" onClick={onClose}>Annuler</button>
        <button className="btn-primary" disabled={isPending || !(parseFloat(amount) > 0) || parseFloat(amount) > courier.debt} onClick={() => mutate()}>
          {isPending ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </>}
    >
      <div className="flex gap-2">
        <input type="number" min="1" max={courier.debt} className="input flex-1 text-right" value={amount} onChange={e => setAmount(e.target.value)} />
        <select className="input w-40" value={method} onChange={e => setMethod(e.target.value)}>
          {Object.entries(PAYMENT_METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
    </Modal>
  )
}

// ─── Tabs ────────────────────────────────────────────────────────────────────

function PendingTab() {
  const [allocating, setAllocating] = useState<PendingOrder | null>(null)
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['distribution-pending'],
    queryFn: () => api.get('/distribution/pending').then(r => r.data as PendingOrder[]),
  })

  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
          <tr>
            <th className="text-left px-4 py-3">Production</th>
            <th className="text-left px-4 py-3">Produit</th>
            <th className="text-right px-4 py-3">Fabriqué</th>
            <th className="text-right px-4 py-3">Déjà réparti</th>
            <th className="text-right px-4 py-3">En attente</th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {isLoading && <tr><td colSpan={6} className="text-center py-10 text-gray-400">Chargement…</td></tr>}
          {!isLoading && orders.length === 0 && (
            <tr><td colSpan={6} className="text-center py-10 text-gray-400">Toutes les productions sont réparties ✓</td></tr>
          )}
          {orders.map(o => (
            <tr key={o.id} className="hover:bg-gray-50">
              <td className="px-4 py-3">
                <p className="font-mono text-xs">{o.reference}</p>
                <p className="text-xs text-gray-400">{formatDateTime(o.produced_at)}</p>
              </td>
              <td className="px-4 py-3 font-medium text-gray-900">{o.product?.name}</td>
              <td className="px-4 py-3 text-right">{formatNumber(o.qty_produced)}</td>
              <td className="px-4 py-3 text-right text-gray-500">{formatNumber(o.qty_allocated)}</td>
              <td className="px-4 py-3 text-right"><span className="badge bg-amber-100 text-amber-800">{formatNumber(o.qty_pending)}</span></td>
              <td className="px-4 py-3 text-right">
                <button className="btn-primary text-xs px-3 py-1.5" onClick={() => setAllocating(o)}>Répartir</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {allocating && <AllocationModal order={allocating} onClose={() => setAllocating(null)} />}
    </div>
  )
}

function RoundsTab() {
  const [status, setStatus] = useState('open')
  const [settling, setSettling] = useState<CourierRound | null>(null)
  const [page, setPage] = useState(1)

  const { data, isLoading } = useQuery({
    queryKey: ['courier-rounds', status, page],
    queryFn: () => api.get('/distribution/rounds', { params: { status: status || undefined, page } }).then(r => r.data),
  })
  const rounds: CourierRound[] = data?.data ?? []

  return (
    <>
      <div className="card p-4 flex items-center gap-3">
        <select className="input w-44" value={status} onChange={e => { setStatus(e.target.value); setPage(1) }}>
          <option value="open">En cours</option>
          <option value="settled">Clôturées</option>
          <option value="">Toutes</option>
        </select>
        <p className="text-sm text-gray-500">Une tournée s'ouvre à la première dotation du livreur et se clôture à son retour.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {isLoading && <p className="text-gray-400">Chargement…</p>}
        {!isLoading && rounds.length === 0 && <p className="text-gray-400">Aucune tournée.</p>}
        {rounds.map(r => {
          const out = r.items.reduce((s, i) => s + i.qty_given - i.qty_returned, 0)
          const value = r.items.reduce((s, i) => s + i.qty_given * i.unit_price, 0)
          return (
            <div key={r.id} className="card p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-bold text-gray-900 flex items-center gap-2"><Truck size={16} className="text-amber-600" /> {r.courier?.name}</p>
                  <p className="text-xs text-gray-400">{r.reference} · {formatDate(r.round_date)}</p>
                </div>
                <span className={`badge ${r.status === 'open' ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-700'}`}>
                  {r.status === 'open' ? 'En tournée' : 'Clôturée'}
                </span>
              </div>
              <div className="text-sm divide-y border rounded-lg">
                {r.items.map(i => (
                  <div key={i.id} className="flex justify-between px-3 py-1.5">
                    <span>{i.product?.name}</span>
                    <span className="text-gray-600">
                      {formatNumber(i.qty_given)} confiés{r.status === 'settled' && <> · {formatNumber(i.qty_returned)} rendus · <b>{formatNumber(i.qty_given - i.qty_returned)} vendus</b></>}
                    </span>
                  </div>
                ))}
              </div>
              {r.status === 'open' ? (
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-600">{formatNumber(out)} en circulation · valeur {formatCurrency(value)}</p>
                  <button className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1" onClick={() => setSettling(r)}>
                    <ClipboardCheck size={14} /> Clôturer
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap justify-between text-sm gap-2">
                  <span>Dû {formatCurrency(r.amount_due)} · versé {formatCurrency(r.amount_paid)}</span>
                  {r.amount_due - r.amount_paid > 0.01
                    ? <span className="text-red-600 font-semibold">Manquant {formatCurrency(r.amount_due - r.amount_paid)}</span>
                    : <span className="text-green-700">Soldée</span>}
                  {r.sale && <span className="text-xs text-gray-400 w-full">Vente {r.sale.reference}</span>}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {data && data.last_page > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm text-gray-500">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="btn-secondary px-2 py-1"><ChevronLeft size={16} /></button>
          <span>{page} / {data.last_page}</span>
          <button disabled={page >= data.last_page} onClick={() => setPage(p => p + 1)} className="btn-secondary px-2 py-1"><ChevronRight size={16} /></button>
        </div>
      )}
      {settling && <SettleModal round={settling} onClose={() => setSettling(null)} />}
    </>
  )
}

function CouriersTab({ couriers, isLoading }: { couriers: Courier[]; isLoading: boolean }) {
  const [editing, setEditing] = useState<Courier | undefined | null>(null)
  const [paying, setPaying] = useState<Courier | null>(null)

  return (
    <>
      <div className="flex justify-end">
        <button className="btn-primary flex items-center gap-2" onClick={() => setEditing(undefined)}><Plus size={16} /> Nouveau livreur</button>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
            <tr>
              <th className="text-left px-4 py-3">Livreur</th>
              <th className="text-left px-4 py-3">Zone</th>
              <th className="text-left px-4 py-3">Tournée en cours</th>
              <th className="text-right px-4 py-3">Manquant</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading && <tr><td colSpan={5} className="text-center py-10 text-gray-400">Chargement…</td></tr>}
            {!isLoading && couriers.length === 0 && <tr><td colSpan={5} className="text-center py-10 text-gray-400">Aucun livreur</td></tr>}
            {couriers.map(c => (
              <tr key={c.id} className={c.is_active ? 'hover:bg-gray-50' : 'opacity-50'}>
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-900">{c.name}{!c.is_active && ' (inactif)'}</p>
                  {c.phone && <p className="text-xs text-gray-400">{c.phone}</p>}
                </td>
                <td className="px-4 py-3 text-gray-600">{c.zone ?? '—'}</td>
                <td className="px-4 py-3">
                  {c.open_round
                    ? <span>{formatNumber(c.open_round.qty_out)} en circulation <span className="text-gray-400">· {formatCurrency(c.open_round.value)}</span></span>
                    : <span className="text-gray-400">—</span>}
                </td>
                <td className={`px-4 py-3 text-right font-semibold ${c.debt > 0 ? 'text-red-600' : 'text-gray-400'}`}>{formatCurrency(c.debt)}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    {c.debt > 0 && <button className="btn-secondary text-xs px-2 py-1" onClick={() => setPaying(c)}>Rembourser</button>}
                    <button className="text-gray-400 hover:text-blue-600" title="Modifier" onClick={() => setEditing(c)}><Pencil size={16} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing !== null && <CourierModal courier={editing} onClose={() => setEditing(null)} />}
      {paying && <DebtModal courier={paying} onClose={() => setPaying(null)} />}
    </>
  )
}

const placeLabel = (kind: string, round?: Movement['source_round']) =>
  kind === 'production' ? 'Production' : kind === 'pos' ? 'Point de vente' : round?.courier?.name ?? 'Livreur'

function JournalTab() {
  const [date, setDate] = useState('')
  const [page, setPage] = useState(1)
  const { data, isLoading } = useQuery({
    queryKey: ['distribution-movements', date, page],
    queryFn: () => api.get('/distribution/movements', { params: { date: date || undefined, page } }).then(r => r.data),
  })
  const rows: Movement[] = data?.data ?? []

  return (
    <>
      <div className="card p-4 flex items-center gap-3">
        <label className="text-sm text-gray-600">Date</label>
        <input type="date" className="input w-44" value={date} onChange={e => { setDate(e.target.value); setPage(1) }} />
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
            <tr>
              <th className="text-left px-4 py-3">Date</th>
              <th className="text-left px-4 py-3">Produit</th>
              <th className="text-left px-4 py-3">De</th>
              <th className="text-left px-4 py-3">Vers</th>
              <th className="text-right px-4 py-3">Quantité</th>
              <th className="text-left px-4 py-3">Production</th>
              <th className="text-left px-4 py-3">Saisi par</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading && <tr><td colSpan={7} className="text-center py-10 text-gray-400">Chargement…</td></tr>}
            {!isLoading && rows.length === 0 && <tr><td colSpan={7} className="text-center py-10 text-gray-400">Aucun mouvement</td></tr>}
            {rows.map(m => (
              <tr key={m.id}>
                <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDateTime(m.created_at)}</td>
                <td className="px-4 py-3 font-medium">{m.product?.name}</td>
                <td className="px-4 py-3">{placeLabel(m.source, m.source_round)}</td>
                <td className="px-4 py-3">{placeLabel(m.destination, m.destination_round)}</td>
                <td className="px-4 py-3 text-right font-semibold">{formatNumber(m.qty)}</td>
                <td className="px-4 py-3 font-mono text-xs">{m.production_order?.reference ?? '—'}</td>
                <td className="px-4 py-3 text-gray-500">{m.user?.name ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && data.last_page > 1 && (
          <div className="flex items-center justify-end gap-2 px-4 py-3 border-t text-sm text-gray-500">
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="btn-secondary px-2 py-1"><ChevronLeft size={16} /></button>
            <span>{page} / {data.last_page}</span>
            <button disabled={page >= data.last_page} onClick={() => setPage(p => p + 1)} className="btn-secondary px-2 py-1"><ChevronRight size={16} /></button>
          </div>
        )}
      </div>
    </>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function DistributionPage() {
  const params = useParams<{ tab: string }>()
  const navigate = useNavigate()
  const tab: Tab = TABS.some(([k]) => k === params.tab) ? params.tab as Tab : 'pending'
  const [transferring, setTransferring] = useState(false)

  useEffect(() => { if (!params.tab) navigate('/distribution/pending', { replace: true }) }, [params.tab, navigate])

  const { data: stats } = useQuery({
    queryKey: ['distribution-stats'],
    queryFn: () => api.get('/distribution/stats').then(r => r.data as DistributionStats),
  })
  const { data: couriers = [], isLoading: couriersLoading } = useQuery({
    queryKey: ['couriers'],
    queryFn: () => api.get('/distribution/couriers').then(r => r.data as Courier[]),
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="p-2 bg-amber-100 rounded-xl"><Truck className="text-amber-700" size={24} /></div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">Distribution</h1>
          <p className="text-sm text-gray-500">Répartition des productions entre le point de vente et les livreurs</p>
        </div>
        <button className="btn-secondary flex items-center gap-2" onClick={() => setTransferring(true)}>
          <ArrowLeftRight size={16} /> Réaffecter
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="En attente de répartition" value={formatNumber(stats?.pending_qty ?? 0)} sub={`${stats?.pending_orders ?? 0} production(s)`} icon={<Hourglass size={20} className="text-amber-700" />} color="bg-amber-100" />
        <StatCard label="Au point de vente (jour)" value={formatNumber(stats?.today_to_pos ?? 0)} icon={<Store size={20} className="text-blue-700" />} color="bg-blue-100" />
        <StatCard label="Aux livreurs (jour)" value={formatNumber(stats?.today_to_couriers ?? 0)} sub={`${stats?.open_rounds ?? 0} tournée(s) en cours`} icon={<Truck size={20} className="text-orange-700" />} color="bg-orange-100" />
        <StatCard label="Manquants livreurs" value={formatCurrency(stats?.couriers_debt ?? 0)} icon={<Wallet size={20} className="text-red-700" />} color="bg-red-100" />
      </div>

      <div className="flex gap-2 border-b">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            onClick={() => navigate(`/distribution/${key}`)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === key ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            {label}
            {key === 'pending' && (stats?.pending_orders ?? 0) > 0 && (
              <span className="ml-2 badge bg-amber-100 text-amber-800">{stats?.pending_orders}</span>
            )}
          </button>
        ))}
      </div>

      {tab === 'pending' && <PendingTab />}
      {tab === 'rounds' && <RoundsTab />}
      {tab === 'couriers' && <CouriersTab couriers={couriers} isLoading={couriersLoading} />}
      {tab === 'journal' && <JournalTab />}

      {transferring && <TransferModal couriers={couriers.filter(c => c.is_active)} onClose={() => setTransferring(false)} />}
    </div>
  )
}
