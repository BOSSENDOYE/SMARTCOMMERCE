import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../lib/api'
import { formatCurrency, formatNumber, formatDate } from '../../lib/format'
import {
  ClipboardList, Plus, ArrowLeft, Search, CheckCircle2,
  Loader2, X, Trash2, AlertTriangle, TrendingDown, TrendingUp,
  Package, ChevronRight, Calendar, User, BarChart2,
} from 'lucide-react'
import { useConfirm } from '../../hooks/useConfirm'

// ─── Types ──────────────────────────────────────────────────────────────────

interface InventorySession {
  id: number
  name: string
  type: 'full' | 'rotating'
  status: 'draft' | 'counting' | 'validating' | 'completed' | 'cancelled'
  started_by?: number
  started_at?: string
  validated_at?: string
  total_variance_value?: number | null
  shrinkage_rate_pct?: number | null
  items_count?: number
  startedBy?: { id: number; name: string }
  validator?: { id: number; name: string }
}

interface SessionItem {
  id: number
  session_id: number
  product_id: number
  theoretical_qty: string | number
  counted_qty: string | number | null
  unit_cost: string | number
  variance_value: string | number | null
  counted_at?: string
  product: {
    id: number
    name: string
    internal_code: string
    alert_stock: number
    unit?: { abbreviation: string }
  }
  countedBy?: { name: string }
}

interface SessionDetail extends InventorySession {
  items: SessionItem[]
}

interface ProductHit {
  id: number
  name: string
  internal_code: string
  unit?: { abbreviation: string }
}

interface Paginated<T> {
  data: T[]
  current_page: number
  last_page: number
  total: number
}

// ─── Constants ───────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string; step: number }> = {
  draft:      { label: 'Brouillon',     color: 'gray',    step: 0 },
  counting:   { label: 'En comptage',   color: 'info',    step: 1 },
  validating: { label: 'En validation', color: 'warning', step: 2 },
  completed:  { label: 'Terminé',       color: 'success', step: 3 },
  cancelled:  { label: 'Annulé',        color: 'danger',  step: -1 },
}

const FLOW_STEPS = ['Brouillon', 'En comptage', 'En validation', 'Terminé']

// ─── Helpers ─────────────────────────────────────────────────────────────────

function variance(item: SessionItem) {
  if (item.counted_qty === null || item.counted_qty === undefined || item.counted_qty === '') return null
  return parseFloat(String(item.counted_qty)) - parseFloat(String(item.theoretical_qty))
}

function varianceValue(item: SessionItem) {
  const v = variance(item)
  if (v === null) return null
  return v * parseFloat(String(item.unit_cost))
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, color: 'gray' }
  return <span className={`badge-${cfg.color}`}>{cfg.label}</span>
}

function StepFlow({ status }: { status: string }) {
  if (status === 'cancelled') {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600 font-medium">
        <X size={13} /> Inventaire annulé
      </div>
    )
  }
  const current = STATUS_CONFIG[status]?.step ?? 0
  return (
    <div className="flex items-center gap-1">
      {FLOW_STEPS.map((label, i) => (
        <div key={i} className="flex items-center gap-1">
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            i < current ? 'bg-emerald-100 text-emerald-700' :
            i === current ? 'bg-primary text-white shadow-sm' :
            'bg-gray-100 text-gray-400'
          }`}>
            {i < current && <CheckCircle2 size={11} />}
            {label}
          </div>
          {i < FLOW_STEPS.length - 1 && (
            <ChevronRight size={13} className={i < current ? 'text-emerald-400' : 'text-gray-300'} />
          )}
        </div>
      ))}
    </div>
  )
}

function CreateSessionModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('')
  const [type, setType] = useState<'full' | 'rotating'>('full')
  const qc = useQueryClient()

  const mutation = useMutation({
    mutationFn: () => api.post('/inventory-sessions', { name: name || undefined, type }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory-sessions'] })
      onClose()
    },
  })

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <Plus size={18} className="text-primary" /> Nouvel inventaire
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
            <X size={17} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Nom de l'inventaire</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)}
              className="input text-sm" placeholder={`Inventaire du ${new Date().toLocaleDateString('fr-FR')}`} />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Type d'inventaire</label>
            <div className="grid grid-cols-2 gap-3">
              {([
                { v: 'full', title: 'Inventaire complet', desc: 'Tous les articles du stock sont pré-chargés automatiquement.' },
                { v: 'rotating', title: 'Inventaire tournant', desc: 'Vous ajoutez les articles à compter manuellement.' },
              ] as const).map(opt => (
                <button key={opt.v} type="button" onClick={() => setType(opt.v)}
                  className={`text-left p-4 rounded-xl border-2 transition-all ${type === opt.v ? 'border-primary bg-primary-50' : 'border-gray-200 hover:border-gray-300'}`}>
                  <p className={`text-sm font-semibold ${type === opt.v ? 'text-primary-600' : 'text-gray-800'}`}>{opt.title}</p>
                  <p className="text-xs text-gray-500 mt-1 leading-relaxed">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {mutation.isError && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">Une erreur est survenue.</p>
          )}
        </div>

        <div className="flex gap-3 px-6 pb-6">
          <button onClick={onClose} className="flex-1 btn-secondary text-sm">Annuler</button>
          <button onClick={() => mutation.mutate()} disabled={mutation.isPending}
            className="flex-1 btn-primary text-sm flex items-center justify-center gap-2 disabled:opacity-50">
            {mutation.isPending
              ? <><Loader2 size={15} className="animate-spin" /> Création...</>
              : <><Plus size={15} /> Créer l'inventaire</>}
          </button>
        </div>
      </div>
    </div>
  )
}

function AddProductModal({ sessionId, storeId, onClose }: {
  sessionId: number
  storeId?: number
  onClose: () => void
}) {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<ProductHit | null>(null)
  const [qty, setQty] = useState('')
  const [open, setOpen] = useState(false)
  const qc = useQueryClient()
  const ref = useRef<HTMLInputElement>(null)

  const { data: hits } = useQuery({
    queryKey: ['products-search-inv', search],
    queryFn: () => api.get('/products', { params: { search, per_page: 8 } }).then(r => r.data.data as ProductHit[]),
    enabled: search.length >= 2,
  })

  const mutation = useMutation({
    mutationFn: (d: { product_id: number; counted_qty: number }) =>
      api.post(`/inventory-sessions/${sessionId}/items`, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory-session', sessionId] })
      setSelected(null); setSearch(''); setQty('')
    },
  })

  const qtyNum = parseFloat(qty)
  const valid = selected && !isNaN(qtyNum) && qtyNum >= 0

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <Package size={18} className="text-primary" /> Saisir un comptage
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X size={17} /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Produit *</label>
            {selected ? (
              <div className="flex items-center gap-3 px-3 py-2.5 bg-primary-50 border border-primary-200 rounded-xl">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{selected.name}</p>
                  <p className="text-xs text-gray-400 font-mono">{selected.internal_code}</p>
                </div>
                <button onClick={() => { setSelected(null); setSearch('') }}
                  className="text-primary-400 hover:text-primary p-1"><X size={13} /></button>
              </div>
            ) : (
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input ref={ref} value={search} onChange={e => { setSearch(e.target.value); setOpen(true) }}
                  onFocus={() => setOpen(true)} className="input pl-8 text-sm"
                  placeholder="Rechercher un produit..." autoFocus />
                {open && (hits ?? []).length > 0 && (
                  <div className="absolute z-20 w-full mt-1 bg-white rounded-xl shadow-xl border overflow-hidden">
                    {(hits ?? []).map(p => (
                      <button key={p.id} onMouseDown={e => { e.preventDefault(); setSelected(p); setOpen(false) }}
                        className="w-full text-left px-4 py-2.5 hover:bg-gray-50 flex justify-between gap-3 text-sm border-b last:border-0">
                        <span className="font-medium text-gray-900">{p.name}</span>
                        <span className="text-xs text-gray-400 font-mono">{p.internal_code}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Quantité comptée *</label>
            <input type="number" min="0" step="0.001" value={qty} onChange={e => setQty(e.target.value)}
              className="input font-bold text-lg text-center" placeholder="0" />
          </div>
          {mutation.isError && (
            <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">Une erreur est survenue.</p>
          )}
        </div>
        <div className="flex gap-3 px-6 pb-6">
          <button onClick={onClose} className="flex-1 btn-secondary text-sm">Fermer</button>
          <button disabled={!valid || mutation.isPending}
            onClick={() => mutation.mutate({ product_id: selected!.id, counted_qty: qtyNum })}
            className="flex-1 btn-primary text-sm flex items-center justify-center gap-2 disabled:opacity-50">
            {mutation.isPending
              ? <><Loader2 size={14} className="animate-spin" /> Enregistrement...</>
              : <><CheckCircle2 size={14} /> Enregistrer</>}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Session Detail View ─────────────────────────────────────────────────────

function SessionDetail({ sessionId, onBack }: { sessionId: number; onBack: () => void }) {
  const [showAddProduct, setShowAddProduct] = useState(false)
  const [search, setSearch] = useState('')
  const [filterCounted, setFilterCounted] = useState<'' | 'counted' | 'pending'>('')
  const qc = useQueryClient()
  const confirm = useConfirm()

  const { data: session, isLoading } = useQuery<SessionDetail>({
    queryKey: ['inventory-session', sessionId],
    queryFn: () => api.get(`/inventory-sessions/${sessionId}`).then(r => r.data),
    refetchInterval: showAddProduct ? 0 : 5000,
  })

  const validateMut = useMutation({
    mutationFn: () => api.post(`/inventory-sessions/${sessionId}/validate`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory-session', sessionId] })
      qc.invalidateQueries({ queryKey: ['inventory-sessions'] })
      qc.invalidateQueries({ queryKey: ['stock-levels'] })
      qc.invalidateQueries({ queryKey: ['stock-valuation-kpi'] })
    },
  })

  const removeMut = useMutation({
    mutationFn: (itemId: number) => api.delete(`/inventory-sessions/${sessionId}/items/${itemId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inventory-session', sessionId] }),
  })

  const updateQtyMut = useMutation({
    mutationFn: ({ product_id, counted_qty }: { product_id: number; counted_qty: number }) =>
      api.post(`/inventory-sessions/${sessionId}/items`, { product_id, counted_qty }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inventory-session', sessionId] }),
  })

  if (isLoading || !session) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 size={24} className="animate-spin text-primary" />
      </div>
    )
  }

  const canEdit = ['draft', 'counting'].includes(session.status)
  const canValidate = session.status === 'counting' || session.status === 'draft'

  // Filter items
  const allItems = session.items ?? []
  const filtered = allItems
    .filter(i => {
      if (search) {
        const q = search.toLowerCase()
        return i.product.name.toLowerCase().includes(q) || i.product.internal_code.toLowerCase().includes(q)
      }
      return true
    })
    .filter(i => {
      if (filterCounted === 'counted') return i.counted_qty !== null
      if (filterCounted === 'pending') return i.counted_qty === null
      return true
    })

  const countedItems = allItems.filter(i => i.counted_qty !== null)
  const pendingItems = allItems.filter(i => i.counted_qty === null)
  const totalVariance = countedItems.reduce((s, i) => s + (varianceValue(i) ?? 0), 0)
  const positiveVariance = countedItems.reduce((s, i) => { const v = varianceValue(i) ?? 0; return s + (v > 0 ? v : 0) }, 0)
  const negativeVariance = countedItems.reduce((s, i) => { const v = varianceValue(i) ?? 0; return s + (v < 0 ? v : 0) }, 0)

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <button onClick={onBack}
            className="mt-0.5 p-2 rounded-xl hover:bg-gray-100 text-gray-500 transition-colors">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{session.name}</h1>
            <div className="flex items-center gap-3 mt-1 text-xs text-gray-400 flex-wrap">
              <span className={`badge-${session.type === 'full' ? 'info' : 'gray'}`}>
                {session.type === 'full' ? 'Complet' : 'Tournant'}
              </span>
              {session.startedBy && (
                <span className="flex items-center gap-1"><User size={11} /> {session.startedBy.name}</span>
              )}
              {session.started_at && (
                <span className="flex items-center gap-1"><Calendar size={11} /> {formatDate(session.started_at)}</span>
              )}
              {session.validated_at && (
                <span className="flex items-center gap-1 text-emerald-600">
                  <CheckCircle2 size={11} /> Validé le {formatDate(session.validated_at)}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {canEdit && (
            <button onClick={() => setShowAddProduct(true)}
              className="btn-secondary text-sm flex items-center gap-2">
              <Plus size={15} /> Ajouter un article
            </button>
          )}
          {canValidate && (
            <button onClick={async () => { if (await confirm('Valider et appliquer cet inventaire au stock ?')) validateMut.mutate() }}
              disabled={validateMut.isPending || countedItems.length === 0}
              className="btn-primary text-sm flex items-center gap-2 disabled:opacity-50">
              {validateMut.isPending
                ? <><Loader2 size={14} className="animate-spin" /> Validation...</>
                : <><CheckCircle2 size={14} /> Valider l'inventaire</>}
            </button>
          )}
        </div>
      </div>

      {/* Status flow */}
      <div className="flex flex-wrap items-center gap-3">
        <StepFlow status={session.status} />
      </div>

      {/* Success banner */}
      {session.status === 'completed' && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-4 flex items-start gap-3">
          <CheckCircle2 size={20} className="text-emerald-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-emerald-800">Inventaire validé avec succès</p>
            <p className="text-sm text-emerald-700 mt-0.5">
              Les niveaux de stock ont été mis à jour.
              Écart total : <span className={`font-bold ${(session.total_variance_value ?? 0) >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                {formatCurrency(session.total_variance_value ?? 0)}
              </span>
            </p>
          </div>
        </div>
      )}

      {/* Validation error */}
      {validateMut.isError && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-3 text-sm text-red-700 flex items-center gap-2">
          <AlertTriangle size={16} /> Une erreur est survenue lors de la validation.
        </div>
      )}

      {/* KPI mini-cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="card p-4">
          <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Articles total</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{allItems.length}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Comptés</p>
          <p className="text-2xl font-bold text-emerald-600 mt-1">{countedItems.length}</p>
          {pendingItems.length > 0 && (
            <p className="text-xs text-amber-500 mt-0.5">{pendingItems.length} restant{pendingItems.length > 1 ? 's' : ''}</p>
          )}
        </div>
        <div className="card p-4">
          <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Écart positif</p>
          <p className="text-2xl font-bold text-primary mt-1">+{formatCurrency(positiveVariance)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Écart négatif</p>
          <p className={`text-2xl font-bold mt-1 ${negativeVariance < 0 ? 'text-red-600' : 'text-gray-400'}`}>
            {formatCurrency(negativeVariance)}
          </p>
        </div>
      </div>

      {/* Progress bar */}
      {allItems.length > 0 && (
        <div className="flex items-center gap-3">
          <div className="flex-1 h-2.5 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500 rounded-full transition-all duration-500"
              style={{ width: `${Math.round((countedItems.length / allItems.length) * 100)}%` }} />
          </div>
          <span className="text-sm font-semibold text-gray-700 flex-shrink-0">
            {Math.round((countedItems.length / allItems.length) * 100)}% compté
          </span>
        </div>
      )}

      {/* Items table */}
      <div className="card p-0 overflow-hidden">
        {/* Table toolbar */}
        <div className="px-4 py-3 border-b bg-gray-50 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              className="input pl-8 text-sm h-9" placeholder="Filtrer par produit..." />
            {search && (
              <button onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X size={12} />
              </button>
            )}
          </div>
          <div className="flex items-center gap-1 bg-white border rounded-lg p-0.5">
            {([['', 'Tous'], ['counted', 'Comptés'], ['pending', 'À compter']] as const).map(([v, label]) => (
              <button key={v} onClick={() => setFilterCounted(v)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${filterCounted === v ? 'bg-primary text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
                {label}
                {v === 'pending' && pendingItems.length > 0 && (
                  <span className="ml-1 bg-amber-100 text-amber-700 rounded-full px-1.5">{pendingItems.length}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b text-xs font-semibold text-gray-500 uppercase tracking-wide">
                <th className="text-left px-4 py-3">Produit</th>
                <th className="text-right px-4 py-3">Qté théorique</th>
                <th className="text-right px-4 py-3">Qté comptée</th>
                <th className="text-right px-4 py-3">Écart</th>
                <th className="text-right px-4 py-3">Valeur écart</th>
                <th className="text-left px-4 py-3">Compté par</th>
                {canEdit && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((item: SessionItem) => {
                const v = variance(item)
                const vv = varianceValue(item)
                const isCounted = item.counted_qty !== null
                const rowBg = !isCounted ? '' : v === 0 ? 'bg-emerald-50/30' : v! > 0 ? 'bg-primary-50/30' : 'bg-red-50/30'

                return (
                  <tr key={item.id} className={`group hover:bg-gray-50/80 transition-colors ${rowBg}`}>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-gray-900">{item.product.name}</p>
                      <p className="text-xs font-mono text-gray-400 mt-0.5">{item.product.internal_code}</p>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">
                      {formatNumber(parseFloat(String(item.theoretical_qty)), 3)}
                      {item.product.unit && <span className="text-xs text-gray-400 ml-1">{item.product.unit.abbreviation}</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {canEdit ? (
                        <InlineQtyEditor
                          item={item}
                          onSave={qty => updateQtyMut.mutate({ product_id: item.product_id, counted_qty: qty })}
                        />
                      ) : (
                        isCounted ? (
                          <span className="font-semibold text-gray-900">
                            {formatNumber(parseFloat(String(item.counted_qty)), 3)}
                          </span>
                        ) : (
                          <span className="text-gray-300 text-xs">Non compté</span>
                        )
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {v !== null ? (
                        <span className={`font-bold ${v === 0 ? 'text-emerald-600' : v > 0 ? 'text-primary' : 'text-red-600'}`}>
                          {v > 0 ? '+' : ''}{formatNumber(v, 3)}
                        </span>
                      ) : <span className="text-gray-300 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {vv !== null ? (
                        <span className={`font-semibold text-xs ${vv === 0 ? 'text-emerald-600' : vv > 0 ? 'text-primary' : 'text-red-600'}`}>
                          {vv > 0 ? '+' : ''}{formatCurrency(vv)}
                        </span>
                      ) : <span className="text-gray-300 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">
                      {item.countedBy?.name ?? <span className="text-gray-300">—</span>}
                    </td>
                    {canEdit && (
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => removeMut.mutate(item.id)}
                          disabled={removeMut.isPending}
                          className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-all">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    )}
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={canEdit ? 7 : 6} className="px-4 py-12 text-center">
                    <Package size={32} className="mx-auto text-gray-300 mb-2" />
                    <p className="text-gray-400">
                      {allItems.length === 0 ? 'Aucun article dans cette session.' : 'Aucun article ne correspond au filtre.'}
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr className="bg-gray-50 border-t text-xs font-semibold text-gray-600">
                  <td colSpan={3} className="px-4 py-2.5">Total écart (articles filtrés)</td>
                  <td className="px-4 py-2.5 text-right">—</td>
                  <td className={`px-4 py-2.5 text-right font-bold ${totalVariance >= 0 ? 'text-primary-600' : 'text-red-700'}`}>
                    {totalVariance > 0 ? '+' : ''}{formatCurrency(totalVariance)}
                  </td>
                  <td colSpan={canEdit ? 2 : 1} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {showAddProduct && (
        <AddProductModal sessionId={sessionId} onClose={() => setShowAddProduct(false)} />
      )}
    </div>
  )
}

// Inline quantity editor — click to edit, Enter/blur to save
function InlineQtyEditor({ item, onSave }: { item: SessionItem; onSave: (qty: number) => void }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(item.counted_qty !== null ? String(item.counted_qty) : '')
  const ref = useRef<HTMLInputElement>(null)

  const commit = () => {
    const n = parseFloat(val)
    if (!isNaN(n) && n >= 0) onSave(n)
    setEditing(false)
  }

  if (editing) {
    return (
      <input ref={ref} type="number" min="0" step="0.001" value={val}
        onChange={e => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
        className="w-24 text-right border border-primary-400 rounded-lg px-2 py-1 text-sm font-bold bg-primary-50 focus:outline-none focus:ring-2 focus:ring-primary/30"
        autoFocus />
    )
  }

  return (
    <button onClick={() => { setEditing(true) }}
      className={`text-right w-24 px-2 py-1 rounded-lg text-sm font-semibold transition-colors hover:bg-primary-50 group/edit ${item.counted_qty !== null ? 'text-gray-900' : 'text-gray-300'}`}
      title="Cliquer pour modifier">
      {item.counted_qty !== null
        ? formatNumber(parseFloat(String(item.counted_qty)), 3)
        : <span className="text-xs font-normal italic">Saisir...</span>
      }
    </button>
  )
}

// ─── Session List View ────────────────────────────────────────────────────────

export default function InventoryPage() {
  const [showCreate, setShowCreate] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const { data, isLoading } = useQuery<Paginated<InventorySession>>({
    queryKey: ['inventory-sessions'],
    queryFn: () => api.get('/inventory-sessions').then(r => r.data),
  })

  if (selectedId !== null) {
    return (
      <div className="p-6">
        <SessionDetail sessionId={selectedId} onBack={() => setSelectedId(null)} />
      </div>
    )
  }

  const sessions = data?.data ?? []
  const activeSessions = sessions.filter(s => ['draft', 'counting', 'validating'].includes(s.status))
  const lastCompleted = sessions.find(s => s.status === 'completed')

  return (
    <div className="p-3 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2.5">
          <ClipboardList size={24} className="text-primary" /> Inventaire
        </h1>
        <button onClick={() => setShowCreate(true)}
          className="btn-primary flex items-center gap-2 text-sm">
          <Plus size={15} /> Nouvel inventaire
        </button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card p-4 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-primary-50 flex items-center justify-center text-primary flex-shrink-0">
            <ClipboardList size={20} />
          </div>
          <div>
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Sessions actives</p>
            <p className="text-xl font-bold text-gray-900">{activeSessions.length}</p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 flex-shrink-0">
            <CheckCircle2 size={20} />
          </div>
          <div>
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Total inventaires</p>
            <p className="text-xl font-bold text-gray-900">{data?.total ?? 0}</p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-4">
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${(lastCompleted?.total_variance_value ?? 0) >= 0 ? 'bg-primary-50 text-primary' : 'bg-red-50 text-red-600'}`}>
            <BarChart2 size={20} />
          </div>
          <div>
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Écart dernier inventaire</p>
            <p className={`text-xl font-bold ${(lastCompleted?.total_variance_value ?? 0) < 0 ? 'text-red-600' : 'text-gray-900'}`}>
              {lastCompleted ? formatCurrency(lastCompleted.total_variance_value ?? 0) : '—'}
            </p>
          </div>
        </div>
      </div>

      {/* Sessions table */}
      <div className="card p-0 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 size={22} className="animate-spin text-primary" />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b text-xs font-semibold text-gray-500 uppercase tracking-wide">
                <th className="text-left px-4 py-3">Nom</th>
                <th className="text-left px-4 py-3">Type</th>
                <th className="text-right px-4 py-3">Articles</th>
                <th className="text-left px-4 py-3">Démarré par</th>
                <th className="text-left px-4 py-3">Date démarrage</th>
                <th className="text-right px-4 py-3">Écart total</th>
                <th className="text-center px-4 py-3">Statut</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sessions.map((s: InventorySession) => (
                <tr key={s.id} onClick={() => setSelectedId(s.id)}
                  className="hover:bg-primary-50/40 cursor-pointer transition-colors group">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-gray-900 group-hover:text-primary-600 transition-colors">
                      {s.name}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`badge-${s.type === 'full' ? 'info' : 'gray'}`}>
                      {s.type === 'full' ? 'Complet' : 'Tournant'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-700">
                    {s.items_count ?? 0}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {s.startedBy?.name ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {s.started_at ? formatDate(s.started_at) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-xs font-semibold">
                    {s.status === 'completed' && s.total_variance_value != null ? (
                      <span className={s.total_variance_value >= 0 ? 'text-primary' : 'text-red-600'}>
                        {s.total_variance_value > 0 ? '+' : ''}{formatCurrency(s.total_variance_value)}
                      </span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <StatusBadge status={s.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <ChevronRight size={15} className="text-gray-300 group-hover:text-primary-400 transition-colors ml-auto" />
                  </td>
                </tr>
              ))}
              {sessions.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-14 text-center">
                    <ClipboardList size={40} className="mx-auto text-gray-300 mb-3" />
                    <p className="text-gray-500 font-medium">Aucun inventaire enregistré</p>
                    <p className="text-sm text-gray-400 mt-1">Créez votre premier inventaire pour commencer.</p>
                    <button onClick={() => setShowCreate(true)}
                      className="btn-primary text-sm mt-4 inline-flex items-center gap-2">
                      <Plus size={14} /> Créer un inventaire
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {showCreate && <CreateSessionModal onClose={() => setShowCreate(false)} />}
    </div>
  )
}
