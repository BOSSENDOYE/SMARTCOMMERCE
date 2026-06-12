import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../lib/api'
import { formatCurrency } from '../../lib/format'
import {
  Utensils, Users, TrendingUp, CalendarDays, ChefHat,
  Plus, X, Check, RefreshCw, Send, ChevronDown,
} from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface RestaurantStats {
  occupied_tables: number; total_tables: number
  active_orders: number; today_revenue: number; today_reservations: number
}

interface Table {
  id: number; number: string; seats: number; status: string
  area_id: number; is_active: boolean
  active_session?: TableSession | null
}

interface TableSession {
  id: number; table_id: number; covers: number
  opened_at: string; closed_at: string | null
  orders?: Order[]
}

interface Order {
  id: number; reference: string; status: string; channel: string
  client_name?: string; covers: number; notes?: string
  total_amount: number; created_at: string
  items: OrderItem[]
  table_session?: TableSession & { table?: Table }
}

interface OrderItem {
  id: number; product_id: number; qty: number; unit_price: number
  total: number; course: string; status: string; notes?: string
  product?: { id: number; name: string; price_ttc: number }
}

interface Reservation {
  id: number; client_name: string; client_phone?: string; covers: number
  reservation_date: string; reservation_time: string; status: string
  special_requests?: string; table_id?: number
  client?: { id: number; name: string; phone?: string }
  table?: { id: number; number: string }
}

interface Area {
  id: number; name: string; type: string; color: string; tables: Table[]
}

interface Product { id: number; name: string; price_ttc: number; internal_code?: string }

// ── Constants ─────────────────────────────────────────────────────────────────

const TABLE_STATUS_STYLES: Record<string, string> = {
  free: 'bg-green-50 border-green-300 text-green-800 hover:bg-green-100',
  occupied: 'bg-orange-50 border-orange-300 text-orange-800 hover:bg-orange-100',
  ordered: 'bg-blue-50 border-blue-300 text-blue-800 hover:bg-blue-100',
  served: 'bg-purple-50 border-purple-300 text-purple-800 hover:bg-purple-100',
  bill_requested: 'bg-red-50 border-red-300 text-red-800 hover:bg-red-100',
  cleaning: 'bg-gray-100 border-gray-300 text-gray-500 hover:bg-gray-200',
}

const TABLE_STATUS_LABELS: Record<string, string> = {
  free: 'Libre', occupied: 'Occupée', ordered: 'En commande',
  served: 'Servi', bill_requested: 'Addition', cleaning: 'Nettoyage',
}

const ORDER_STATUS: Record<string, { label: string; color: string }> = {
  pending: { label: 'En attente', color: 'bg-yellow-100 text-yellow-800' },
  confirmed: { label: 'Confirmée', color: 'bg-blue-100 text-blue-800' },
  preparing: { label: 'En préparation', color: 'bg-orange-100 text-orange-800' },
  ready: { label: 'Prête', color: 'bg-green-100 text-green-800' },
  served: { label: 'Servie', color: 'bg-purple-100 text-purple-800' },
  cancelled: { label: 'Annulée', color: 'bg-red-100 text-red-800' },
}

const RESERVATION_STATUS: Record<string, { label: string; color: string }> = {
  pending: { label: 'En attente', color: 'bg-yellow-100 text-yellow-800' },
  confirmed: { label: 'Confirmée', color: 'bg-blue-100 text-blue-800' },
  arrived: { label: 'Arrivée', color: 'bg-green-100 text-green-800' },
  no_show: { label: 'No-show', color: 'bg-red-100 text-red-800' },
  cancelled: { label: 'Annulée', color: 'bg-gray-100 text-gray-600' },
}

const COURSES: Record<string, string> = {
  starter: 'Entrée', main: 'Plat', dessert: 'Dessert', drink: 'Boisson', other: 'Autre',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function StatCard({ icon, label, value, color }: {
  icon: React.ReactNode; label: string; value: string | number; color: string
}) {
  return (
    <div className="card flex items-center gap-4 py-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color}`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-sm text-gray-500">{label}</p>
        <p className="text-xl font-bold text-gray-900">{value}</p>
      </div>
    </div>
  )
}

// ── Open Table Modal ──────────────────────────────────────────────────────────

function OpenTableModal({ table, onClose, onSuccess }: {
  table: Table; onClose: () => void; onSuccess: () => void
}) {
  const [covers, setCovers] = useState(2)
  const qc = useQueryClient()

  const mut = useMutation({
    mutationFn: () => api.post(`/restaurant/tables/${table.id}/open`, { covers }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['floor-plan'] })
      qc.invalidateQueries({ queryKey: ['restaurant-stats'] })
      onSuccess()
    },
  })

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <h2 className="text-lg font-bold mb-1">Ouvrir la table {table.number}</h2>
        <p className="text-sm text-gray-500 mb-5">{table.seats} places disponibles</p>
        <label className="block text-sm font-medium text-gray-700 mb-3">Nombre de couverts</label>
        <div className="flex items-center justify-center gap-5 mb-6">
          <button onClick={() => setCovers(c => Math.max(1, c - 1))}
            className="w-11 h-11 rounded-full border border-gray-300 flex items-center justify-center text-gray-600 hover:bg-gray-100 text-xl font-light">−
          </button>
          <span className="text-3xl font-bold w-12 text-center">{covers}</span>
          <button onClick={() => setCovers(c => Math.min(table.seats, c + 1))}
            className="w-11 h-11 rounded-full border border-gray-300 flex items-center justify-center text-gray-600 hover:bg-gray-100 text-xl font-light">+
          </button>
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 btn-secondary">Annuler</button>
          <button onClick={() => mut.mutate()} disabled={mut.isPending} className="flex-1 btn-primary">
            {mut.isPending ? 'Ouverture…' : 'Ouvrir'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Order Form Modal ──────────────────────────────────────────────────────────

interface CartLine { product: Product; qty: number; unit_price: number; course: string; notes: string }

function OrderFormModal({ table, session, onClose, onSuccess }: {
  table: Table; session: TableSession; onClose: () => void; onSuccess: () => void
}) {
  const [cart, setCart] = useState<CartLine[]>([])
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<Product[]>([])
  const [notes, setNotes] = useState('')
  const qc = useQueryClient()
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    if (!search.trim()) { setResults([]); return }
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      const r = await api.get('/products', { params: { search, per_page: 8 } })
      setResults(r.data.data ?? r.data)
    }, 300)
    return () => clearTimeout(timerRef.current)
  }, [search])

  const addToCart = (p: Product) => {
    setCart(c => {
      const idx = c.findIndex(l => l.product.id === p.id)
      if (idx >= 0) { const n = [...c]; n[idx] = { ...n[idx], qty: n[idx].qty + 1 }; return n }
      return [...c, { product: p, qty: 1, unit_price: p.price_ttc, course: 'main', notes: '' }]
    })
    setSearch(''); setResults([])
  }

  const updateLine = (i: number, patch: Partial<CartLine>) =>
    setCart(c => c.map((l, idx) => idx === i ? { ...l, ...patch } : l))

  const total = cart.reduce((s, l) => s + l.qty * l.unit_price, 0)

  const mut = useMutation({
    mutationFn: () => api.post('/restaurant/orders', {
      table_session_id: session.id,
      channel: 'dine_in',
      covers: session.covers,
      notes: notes || undefined,
      items: cart.map(l => ({
        product_id: l.product.id, qty: l.qty, unit_price: l.unit_price,
        course: l.course, notes: l.notes || undefined,
      })),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['floor-plan'] })
      qc.invalidateQueries({ queryKey: ['kds-orders'] })
      qc.invalidateQueries({ queryKey: ['restaurant-stats'] })
      onSuccess()
    },
  })

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-5 border-b">
          <div>
            <h2 className="text-lg font-bold">Nouvelle commande — Table {table.number}</h2>
            <p className="text-sm text-gray-500">{session.covers} couvert{session.covers > 1 ? 's' : ''}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="p-5 border-b">
          <div className="relative">
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher un plat ou boisson…"
              className="input w-full"
            />
            {results.length > 0 && (
              <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-lg z-10 max-h-48 overflow-y-auto mt-1">
                {results.map(p => (
                  <button key={p.id} onClick={() => addToCart(p)}
                    className="w-full flex justify-between items-center px-4 py-2.5 hover:bg-gray-50 text-left text-sm">
                    <span className="font-medium">{p.name}</span>
                    <span className="text-gray-500 ml-4 flex-shrink-0">{formatCurrency(p.price_ttc)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-2">
          {cart.length === 0 && (
            <div className="text-center text-gray-400 py-8">
              <Utensils size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">Recherchez des articles ci-dessus</p>
            </div>
          )}
          {cart.map((line, i) => (
            <div key={i} className="flex items-center gap-3 bg-gray-50 rounded-xl p-3">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{line.product.name}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <select value={line.course} onChange={e => updateLine(i, { course: e.target.value })}
                    className="text-xs border border-gray-200 rounded px-1.5 py-0.5 bg-white">
                    {Object.entries(COURSES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  <input value={line.notes} onChange={e => updateLine(i, { notes: e.target.value })}
                    placeholder="Note cuisine…"
                    className="text-xs border border-gray-200 rounded px-1.5 py-0.5 flex-1 bg-white" />
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button onClick={() => { if (line.qty <= 1) setCart(c => c.filter((_, idx) => idx !== i)); else updateLine(i, { qty: line.qty - 1 }) }}
                  className="w-7 h-7 rounded-full border flex items-center justify-center text-gray-500 hover:bg-white">−
                </button>
                <span className="w-6 text-center text-sm font-bold">{line.qty}</span>
                <button onClick={() => updateLine(i, { qty: line.qty + 1 })}
                  className="w-7 h-7 rounded-full border flex items-center justify-center text-gray-500 hover:bg-white">+
                </button>
              </div>
              <span className="text-sm font-semibold w-16 text-right">{formatCurrency(line.qty * line.unit_price)}</span>
              <button onClick={() => setCart(c => c.filter((_, idx) => idx !== i))}
                className="text-gray-300 hover:text-red-500 flex-shrink-0"><X size={14} /></button>
            </div>
          ))}
        </div>

        <div className="p-5 border-t">
          <input value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="Note générale (ex: sans gluten, allergie…)"
            className="input w-full mb-3 text-sm" />
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm text-gray-500">Total</span>
              <span className="ml-2 text-xl font-bold">{formatCurrency(total)}</span>
            </div>
            <div className="flex gap-3">
              <button onClick={onClose} className="btn-secondary">Annuler</button>
              <button onClick={() => mut.mutate()} disabled={cart.length === 0 || mut.isPending}
                className="btn-primary flex items-center gap-2">
                <Send size={16} />{mut.isPending ? 'Envoi…' : 'Envoyer'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Table Action Modal ────────────────────────────────────────────────────────

function TableActionModal({ table, onClose }: { table: Table; onClose: () => void }) {
  const [view, setView] = useState<'main' | 'open' | 'order'>('main')
  const qc = useQueryClient()

  const closeMut = useMutation({
    mutationFn: () => api.post(`/restaurant/tables/${table.id}/close`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['floor-plan'] })
      qc.invalidateQueries({ queryKey: ['restaurant-stats'] })
      onClose()
    },
  })

  const { data: sessionOrders } = useQuery({
    queryKey: ['session-orders', table.active_session?.id],
    queryFn: () => api.get(`/restaurant/sessions/${table.active_session!.id}/orders`).then(r => r.data as Order[]),
    enabled: !!table.active_session?.id,
  })

  if (view === 'open') return <OpenTableModal table={table} onClose={onClose} onSuccess={onClose} />
  if (view === 'order' && table.active_session) {
    return <OrderFormModal table={table} session={table.active_session} onClose={onClose} onSuccess={onClose} />
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b">
          <div>
            <h2 className="text-lg font-bold">Table {table.number}</h2>
            <span className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-full font-medium border ${TABLE_STATUS_STYLES[table.status]?.split(' hover:')[0]}`}>
              {TABLE_STATUS_LABELS[table.status]}
            </span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="p-5 space-y-3">
          {table.status === 'free' ? (
            <button onClick={() => setView('open')}
              className="w-full btn-primary flex items-center justify-center gap-2 py-3">
              <Users size={18} />Ouvrir la table
            </button>
          ) : (
            <>
              {table.active_session && (
                <div className="bg-blue-50 rounded-xl p-3 text-sm border border-blue-100">
                  <p className="font-semibold text-blue-800">{table.active_session.covers} couvert{table.active_session.covers > 1 ? 's' : ''}</p>
                  <p className="text-blue-600 text-xs mt-0.5">
                    Ouverte à {new Date(table.active_session.opened_at).toLocaleTimeString('fr', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              )}

              {sessionOrders && sessionOrders.length > 0 && (
                <div className="space-y-1.5 max-h-36 overflow-y-auto">
                  {sessionOrders.map(o => (
                    <div key={o.id} className="flex items-center justify-between text-sm bg-gray-50 rounded-lg px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{o.reference}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full ${ORDER_STATUS[o.status]?.color}`}>
                          {ORDER_STATUS[o.status]?.label}
                        </span>
                      </div>
                      <span className="font-semibold">{formatCurrency(o.total_amount)}</span>
                    </div>
                  ))}
                </div>
              )}

              <button onClick={() => setView('order')}
                className="w-full btn-primary flex items-center justify-center gap-2">
                <Plus size={16} />Nouvelle commande
              </button>

              <button onClick={() => closeMut.mutate()} disabled={closeMut.isPending}
                className="w-full btn-secondary text-red-600 border-red-200 hover:bg-red-50 flex items-center justify-center gap-2">
                <Check size={16} />{closeMut.isPending ? 'Fermeture…' : 'Libérer la table'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Reservation Form Modal ────────────────────────────────────────────────────

function ReservationFormModal({ reservation, onClose, onSuccess }: {
  reservation?: Reservation; onClose: () => void; onSuccess: () => void
}) {
  const today = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState({
    client_name: reservation?.client_name ?? '',
    client_phone: reservation?.client_phone ?? '',
    covers: reservation?.covers ?? 2,
    reservation_date: reservation?.reservation_date?.slice(0, 10) ?? today,
    reservation_time: reservation?.reservation_time ?? '19:00',
    special_requests: reservation?.special_requests ?? '',
  })
  const qc = useQueryClient()

  const mut = useMutation({
    mutationFn: () => reservation
      ? api.put(`/restaurant/reservations/${reservation.id}`, form)
      : api.post('/restaurant/reservations', form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reservations'] })
      qc.invalidateQueries({ queryKey: ['restaurant-stats'] })
      onSuccess()
    },
  })

  const set = (k: string, v: string | number) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold">{reservation ? 'Modifier la réservation' : 'Nouvelle réservation'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Nom du client *</label>
            <input value={form.client_name} onChange={e => set('client_name', e.target.value)}
              className="input w-full" placeholder="Prénom Nom" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Téléphone</label>
            <input value={form.client_phone} onChange={e => set('client_phone', e.target.value)}
              className="input w-full" placeholder="+221 XX XXX XXXX" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Couverts *</label>
            <input type="number" min={1} value={form.covers} onChange={e => set('covers', +e.target.value)}
              className="input w-full" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
            <input type="date" value={form.reservation_date} onChange={e => set('reservation_date', e.target.value)}
              className="input w-full" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Heure *</label>
            <input type="time" value={form.reservation_time} onChange={e => set('reservation_time', e.target.value)}
              className="input w-full" />
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Demandes spéciales</label>
            <textarea value={form.special_requests} onChange={e => set('special_requests', e.target.value)}
              className="input w-full h-20 resize-none"
              placeholder="Allergie, anniversaire, chaise bébé…" />
          </div>
        </div>

        {mut.isError && <p className="text-red-600 text-sm mt-3">Erreur lors de l'enregistrement.</p>}

        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="flex-1 btn-secondary">Annuler</button>
          <button onClick={() => mut.mutate()} disabled={!form.client_name || !form.reservation_date || mut.isPending}
            className="flex-1 btn-primary">
            {mut.isPending ? 'Enregistrement…' : reservation ? 'Modifier' : 'Réserver'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Elapsed time hook ────────────────────────────────────────────────────────

function useElapsed(openedAt: string | null | undefined): string {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!openedAt) return
    const t = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [openedAt])
  if (!openedAt) return ''
  const mins = Math.floor((now - new Date(openedAt).getTime()) / 60_000)
  if (mins < 1) return '< 1 min'
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60); const m = mins % 60
  return m > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`
}

// ── Table Card ────────────────────────────────────────────────────────────────

const STATUS_CARD: Record<string, { top: string; dot: string; ring: string; bg: string }> = {
  free:           { top: 'bg-emerald-400',  dot: 'bg-emerald-400',  ring: 'border-emerald-200', bg: 'bg-white' },
  occupied:       { top: 'bg-orange-400',   dot: 'bg-orange-400',   ring: 'border-orange-200',  bg: 'bg-orange-50' },
  ordered:        { top: 'bg-blue-500',     dot: 'bg-blue-500',     ring: 'border-blue-200',    bg: 'bg-blue-50' },
  served:         { top: 'bg-purple-500',   dot: 'bg-purple-500',   ring: 'border-purple-200',  bg: 'bg-purple-50' },
  bill_requested: { top: 'bg-red-500',      dot: 'bg-red-500',      ring: 'border-red-300',     bg: 'bg-red-50' },
  cleaning:       { top: 'bg-gray-300',     dot: 'bg-gray-300',     ring: 'border-gray-200',    bg: 'bg-gray-50' },
}

const ORDER_DOT: Record<string, string> = {
  pending: 'bg-gray-300', preparing: 'bg-orange-400',
  ready: 'bg-emerald-400', served: 'bg-purple-400', cancelled: 'bg-red-300',
}

function TableCard({ table, onClick }: { table: Table; onClick: () => void }) {
  const elapsed = useElapsed(table.active_session?.opened_at)
  const orders = table.active_session?.orders ?? []
  const orderTotal = orders.reduce((s, o) => s + (o.total_amount ?? 0), 0)
  const c = STATUS_CARD[table.status] ?? STATUS_CARD.free
  const isBillReq = table.status === 'bill_requested'

  return (
    <button
      onClick={onClick}
      className={`relative rounded-2xl border-2 ${c.ring} ${c.bg} text-left transition-all duration-200 hover:shadow-xl hover:-translate-y-1 group overflow-hidden w-full ${isBillReq ? 'animate-pulse' : ''}`}
    >
      {/* status bar top */}
      <div className={`h-1.5 ${c.top} w-full`} />

      <div className="p-4">
        {/* row 1: status dot + label + elapsed */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-1.5">
            <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${c.dot}`} />
            <span className="text-xs font-medium text-gray-500">{TABLE_STATUS_LABELS[table.status]}</span>
          </div>
          {elapsed && (
            <span className="text-xs text-gray-400 font-mono bg-white/70 rounded px-1.5 py-0.5">{elapsed}</span>
          )}
        </div>

        {/* row 2: big table number */}
        <div className="flex items-end justify-between mb-3">
          <div>
            <p className="text-4xl font-black text-gray-800 leading-none">{table.number}</p>
            <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
              <Users size={11} />{table.seats} places
            </p>
          </div>
          {/* chair silhouettes */}
          <div className="flex flex-col gap-1 opacity-20 group-hover:opacity-40 transition-opacity">
            {Array.from({ length: Math.min(table.seats, 4) }).map((_, i) => (
              <div key={i} className="w-4 h-1.5 rounded-full bg-gray-600" />
            ))}
          </div>
        </div>

        {/* row 3: session info */}
        {table.active_session && (
          <div className="pt-3 border-t border-dashed border-gray-200 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">
                {table.active_session.covers} couvert{table.active_session.covers > 1 ? 's' : ''}
              </span>
              {orderTotal > 0 && (
                <span className="text-sm font-bold text-gray-800">{formatCurrency(orderTotal)}</span>
              )}
            </div>
            {orders.length > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-gray-400">{orders.length} cmd</span>
                <div className="flex gap-1 ml-1">
                  {orders.map(o => (
                    <span
                      key={o.id}
                      title={ORDER_STATUS[o.status]?.label}
                      className={`w-2 h-2 rounded-full ${ORDER_DOT[o.status] ?? 'bg-gray-300'}`}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* free table hint */}
        {table.status === 'free' && (
          <div className="mt-3 pt-2.5 border-t border-dashed border-gray-200 text-center">
            <span className="text-xs text-emerald-600 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
              Cliquer pour ouvrir →
            </span>
          </div>
        )}
      </div>
    </button>
  )
}

// ── Floor Plan Tab ────────────────────────────────────────────────────────────

function FloorPlanTab({ areas }: { areas: Area[] }) {
  const [activeAreaId, setActiveAreaId] = useState<number | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [activeTable, setActiveTable] = useState<Table | null>(null)

  useEffect(() => {
    if (areas.length > 0 && activeAreaId === null) setActiveAreaId(areas[0].id)
  }, [areas, activeAreaId])

  if (areas.length === 0) {
    return (
      <div className="card flex flex-col items-center justify-center py-20 text-gray-400">
        <Utensils size={48} className="mb-4 opacity-30" />
        <p className="text-lg font-medium">Aucune zone configurée</p>
        <p className="text-sm">Créez des zones et des tables depuis les paramètres</p>
      </div>
    )
  }

  const currentArea = areas.find(a => a.id === activeAreaId)
  const allTables = currentArea?.tables ?? []
  const occupied = allTables.filter(t => t.status !== 'free' && t.status !== 'cleaning').length
  const occupancyPct = allTables.length > 0 ? Math.round((occupied / allTables.length) * 100) : 0

  // counts per status for current area
  const statusCounts = allTables.reduce<Record<string, number>>((acc, t) => {
    acc[t.status] = (acc[t.status] ?? 0) + 1
    return acc
  }, {})

  const filteredTables = statusFilter === 'all' ? allTables : allTables.filter(t => t.status === statusFilter)

  const STATUS_FILTERS = [
    { k: 'all', l: 'Toutes', count: allTables.length },
    { k: 'free', l: 'Libres', count: statusCounts.free ?? 0 },
    { k: 'occupied', l: 'Occupées', count: (statusCounts.occupied ?? 0) + (statusCounts.ordered ?? 0) + (statusCounts.served ?? 0) },
    { k: 'bill_requested', l: 'Addition', count: statusCounts.bill_requested ?? 0 },
  ]

  return (
    <>
      <div className="card p-0 overflow-hidden">
        {/* Area tab strip */}
        <div className="flex items-stretch overflow-x-auto border-b border-gray-100 bg-gray-50/60">
          {areas.map(area => {
            const areaOccupied = area.tables.filter(t => t.status !== 'free' && t.status !== 'cleaning').length
            const active = area.id === activeAreaId
            return (
              <button
                key={area.id}
                onClick={() => { setActiveAreaId(area.id); setStatusFilter('all') }}
                className={`flex items-center gap-2.5 px-5 py-3.5 text-sm font-medium whitespace-nowrap border-b-2 transition-all ${active ? 'border-primary-500 text-primary-700 bg-white' : 'border-transparent text-gray-500 hover:text-gray-800 hover:bg-white/60'}`}
              >
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: area.color || '#4CAF50' }} />
                {area.name}
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ml-0.5 ${active ? 'bg-primary-100 text-primary-700' : 'bg-gray-100 text-gray-500'}`}>
                  {areaOccupied}/{area.tables.length}
                </span>
              </button>
            )
          })}
        </div>

        <div className="p-5">
          {/* Area header: occupancy bar + status filters */}
          <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
            {/* occupancy rate */}
            <div className="flex items-center gap-3">
              <div>
                <p className="text-xs text-gray-400 mb-1">Occupation</p>
                <div className="flex items-center gap-2">
                  <div className="w-28 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${occupancyPct >= 80 ? 'bg-red-400' : occupancyPct >= 50 ? 'bg-orange-400' : 'bg-emerald-400'}`}
                      style={{ width: `${occupancyPct}%` }}
                    />
                  </div>
                  <span className="text-sm font-bold text-gray-700">{occupancyPct}%</span>
                </div>
              </div>
              <div className="h-8 w-px bg-gray-200" />
              <div className="flex gap-3 text-xs text-gray-500">
                <span><b className="text-emerald-600">{statusCounts.free ?? 0}</b> libres</span>
                <span><b className="text-orange-500">{occupied}</b> occupées</span>
                {(statusCounts.bill_requested ?? 0) > 0 && (
                  <span><b className="text-red-500">{statusCounts.bill_requested}</b> addition</span>
                )}
              </div>
            </div>

            {/* status filter pills */}
            <div className="flex gap-1.5">
              {STATUS_FILTERS.map(({ k, l, count }) => (
                <button
                  key={k}
                  onClick={() => setStatusFilter(k)}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${statusFilter === k ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                >
                  {l}
                  <span className={`rounded-full px-1.5 py-0.5 text-xs ${statusFilter === k ? 'bg-white/20 text-white' : 'bg-white text-gray-500'}`}>
                    {count}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Table grid */}
          {filteredTables.length === 0 ? (
            <div className="text-center py-14 text-gray-400">
              <Utensils size={36} className="mx-auto mb-3 opacity-20" />
              <p className="text-sm">Aucune table dans cette catégorie</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {filteredTables.map(table => (
                <TableCard key={table.id} table={table} onClick={() => setActiveTable(table)} />
              ))}
            </div>
          )}
        </div>
      </div>

      {activeTable && (
        <TableActionModal table={activeTable} onClose={() => setActiveTable(null)} />
      )}
    </>
  )
}

// ── Orders Tab ────────────────────────────────────────────────────────────────

function OrdersTab() {
  const [statusFilter, setStatusFilter] = useState<string>('active')
  const qc = useQueryClient()

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['kds-orders'],
    queryFn: () => api.get('/restaurant/kds').then(r => r.data as Order[]),
    refetchInterval: 20000,
  })

  const sendMut = useMutation({
    mutationFn: (orderId: number) => api.post(`/restaurant/orders/${orderId}/send-to-kitchen`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['kds-orders'] }),
  })

  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => api.put(`/restaurant/orders/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['kds-orders'] }),
  })

  const filtered = orders.filter(o => {
    if (statusFilter === 'active') return !['served', 'cancelled'].includes(o.status)
    return o.status === statusFilter
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        {[
          { k: 'active', l: 'Actives' },
          { k: 'pending', l: 'En attente' },
          { k: 'preparing', l: 'En préparation' },
          { k: 'ready', l: 'Prêtes' },
        ].map(({ k, l }) => (
          <button key={k} onClick={() => setStatusFilter(k)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${statusFilter === k ? 'bg-primary-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            {l}
          </button>
        ))}
        <button onClick={() => qc.invalidateQueries({ queryKey: ['kds-orders'] })}
          className="ml-auto p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
          <RefreshCw size={16} />
        </button>
      </div>

      {isLoading && <div className="text-center text-gray-400 py-10">Chargement…</div>}

      {!isLoading && filtered.length === 0 && (
        <div className="card text-center py-16 text-gray-400">
          <ChefHat size={40} className="mx-auto mb-3 opacity-30" />
          <p>Aucune commande active pour le moment</p>
        </div>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(order => (
          <div key={order.id} className={`card border-l-4 ${order.status === 'ready' ? 'border-l-green-400' : order.status === 'preparing' ? 'border-l-orange-400' : 'border-l-blue-300'}`}>
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="font-bold text-gray-900">{order.reference}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {order.table_session?.table ? `Table ${order.table_session.table.number}` : order.channel === 'takeaway' ? 'À emporter' : 'Livraison'}
                  {order.client_name && ` — ${order.client_name}`}
                </p>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${ORDER_STATUS[order.status]?.color}`}>
                {ORDER_STATUS[order.status]?.label}
              </span>
            </div>

            <div className="space-y-1.5 mb-3">
              {order.items.map(item => (
                <div key={item.id} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="text-xs text-gray-400 flex-shrink-0">{COURSES[item.course] ?? item.course}</span>
                    <span className="font-medium truncate">{item.qty}× {item.product?.name}</span>
                  </span>
                  <span className={`text-xs px-1.5 py-0.5 rounded flex-shrink-0 ${item.status === 'ready' ? 'bg-green-100 text-green-700' : item.status === 'preparing' ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-400'}`}>
                    {item.status === 'ready' ? '✓' : item.status === 'preparing' ? '⏳' : '—'}
                  </span>
                </div>
              ))}
            </div>

            {order.notes && (
              <p className="text-xs text-gray-500 italic mb-3 bg-yellow-50 rounded p-2 border border-yellow-100">
                {order.notes}
              </p>
            )}

            <div className="flex gap-2 pt-3 border-t">
              {order.status === 'pending' && (
                <button onClick={() => sendMut.mutate(order.id)} disabled={sendMut.isPending}
                  className="flex-1 btn-primary text-xs py-1.5 flex items-center justify-center gap-1">
                  <Send size={12} />Envoyer cuisine
                </button>
              )}
              {order.status === 'preparing' && (
                <button onClick={() => statusMut.mutate({ id: order.id, status: 'ready' })}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white text-xs py-1.5 rounded-lg font-medium flex items-center justify-center gap-1 transition-colors">
                  <Check size={12} />Prête
                </button>
              )}
              {order.status === 'ready' && (
                <button onClick={() => statusMut.mutate({ id: order.id, status: 'served' })}
                  className="flex-1 bg-purple-600 hover:bg-purple-700 text-white text-xs py-1.5 rounded-lg font-medium flex items-center justify-center gap-1 transition-colors">
                  <Check size={12} />Servie
                </button>
              )}
              <button onClick={() => statusMut.mutate({ id: order.id, status: 'cancelled' })}
                className="text-xs text-red-400 hover:text-red-600 px-2 flex items-center">
                <X size={12} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Reservations Tab ──────────────────────────────────────────────────────────

function ReservationsTab() {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Reservation | undefined>()
  const qc = useQueryClient()

  const { data: reservations = [], isLoading } = useQuery({
    queryKey: ['reservations', date],
    queryFn: () => api.get('/restaurant/reservations', { params: { date } }).then(r => r.data as Reservation[]),
  })

  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      api.put(`/restaurant/reservations/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reservations'] }),
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <input type="date" value={date} onChange={e => setDate(e.target.value)} className="input text-sm" />
        <button onClick={() => { setEditing(undefined); setFormOpen(true) }}
          className="ml-auto btn-primary flex items-center gap-2 text-sm">
          <Plus size={16} />Nouvelle réservation
        </button>
      </div>

      {isLoading && <div className="text-center text-gray-400 py-10">Chargement…</div>}

      {!isLoading && reservations.length === 0 && (
        <div className="card text-center py-16 text-gray-400">
          <CalendarDays size={40} className="mx-auto mb-3 opacity-30" />
          <p>Aucune réservation pour cette date</p>
        </div>
      )}

      <div className="space-y-3">
        {reservations.map(r => (
          <div key={r.id} className="card flex items-center gap-4">
            <div className="w-16 text-center flex-shrink-0">
              <p className="text-xl font-bold text-primary-600">{r.reservation_time?.slice(0, 5)}</p>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold text-gray-900">{r.client_name}</p>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${RESERVATION_STATUS[r.status]?.color}`}>
                  {RESERVATION_STATUS[r.status]?.label}
                </span>
              </div>
              <p className="text-sm text-gray-500 mt-0.5">
                {r.covers} couvert{r.covers > 1 ? 's' : ''}
                {r.client_phone && ` · ${r.client_phone}`}
                {r.table && ` · Table ${r.table.number}`}
              </p>
              {r.special_requests && (
                <p className="text-xs text-gray-400 mt-0.5 italic">{r.special_requests}</p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {r.status === 'confirmed' && (
                <button onClick={() => statusMut.mutate({ id: r.id, status: 'arrived' })}
                  className="text-xs bg-green-100 hover:bg-green-200 text-green-800 px-2.5 py-1 rounded-lg font-medium transition-colors">
                  Arrivée
                </button>
              )}
              {['confirmed', 'pending'].includes(r.status) && (
                <button onClick={() => statusMut.mutate({ id: r.id, status: 'no_show' })}
                  className="text-xs bg-red-50 hover:bg-red-100 text-red-600 px-2.5 py-1 rounded-lg font-medium transition-colors">
                  No-show
                </button>
              )}
              <button onClick={() => { setEditing(r); setFormOpen(true) }}
                className="text-gray-400 hover:text-gray-600 p-1 rounded">
                <ChevronDown size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {formOpen && (
        <ReservationFormModal
          reservation={editing}
          onClose={() => { setFormOpen(false); setEditing(undefined) }}
          onSuccess={() => { setFormOpen(false); setEditing(undefined) }}
        />
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function RestaurantPage() {
  const [tab, setTab] = useState<'floor' | 'orders' | 'reservations'>('floor')

  const { data: stats } = useQuery({
    queryKey: ['restaurant-stats'],
    queryFn: () => api.get('/restaurant/stats').then(r => r.data as RestaurantStats),
    refetchInterval: 30000,
  })

  const { data: floorPlan = [] } = useQuery({
    queryKey: ['floor-plan'],
    queryFn: () => api.get('/restaurant/floor-plan').then(r => r.data as Area[]),
    refetchInterval: 15000,
  })

  const TABS = [
    { key: 'floor' as const, label: 'Plan de salle', icon: <Utensils size={16} /> },
    { key: 'orders' as const, label: 'Commandes', icon: <ChefHat size={16} /> },
    { key: 'reservations' as const, label: 'Réservations', icon: <CalendarDays size={16} /> },
  ]

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Utensils size={24} /> Restaurant
        </h1>
        <div className="flex items-center gap-2 flex-wrap">
          {Object.entries(TABLE_STATUS_LABELS).map(([k, v]) => (
            <div key={k} className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full border ${TABLE_STATUS_STYLES[k]?.split(' hover:')[0]}`}>
              {v}
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<Utensils size={22} className="text-orange-600" />}
          label="Tables occupées"
          value={`${stats?.occupied_tables ?? 0} / ${stats?.total_tables ?? 0}`}
          color="bg-orange-100"
        />
        <StatCard
          icon={<ChefHat size={22} className="text-blue-600" />}
          label="Commandes actives"
          value={stats?.active_orders ?? 0}
          color="bg-blue-100"
        />
        <StatCard
          icon={<CalendarDays size={22} className="text-purple-600" />}
          label="Réservations aujourd'hui"
          value={stats?.today_reservations ?? 0}
          color="bg-purple-100"
        />
        <StatCard
          icon={<TrendingUp size={22} className="text-green-600" />}
          label="CA du jour"
          value={formatCurrency(stats?.today_revenue ?? 0)}
          color="bg-green-100"
        />
      </div>

      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === t.key ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {tab === 'floor' && <FloorPlanTab areas={floorPlan} />}
      {tab === 'orders' && <OrdersTab />}
      {tab === 'reservations' && <ReservationsTab />}
    </div>
  )
}
