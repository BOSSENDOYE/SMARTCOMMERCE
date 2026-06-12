import { useState, useRef, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import api from '../../lib/api'
import { formatCurrency, formatNumber, formatDate } from '../../lib/format'
import {
  Boxes, AlertTriangle, TrendingDown, Calendar, Settings2,
  PackageMinus, ChevronLeft, ChevronRight, X, Search,
  PackagePlus, Loader2, CheckCircle2, TrendingUp,
  ShoppingCart, RefreshCw, Filter,
} from 'lucide-react'

// ─── Types ─────────────────────────────────────────────────────────────────

type StockTab = 'levels' | 'low' | 'expiring' | 'movements'

interface ProductBase {
  id: number
  name: string
  internal_code: string
  alert_stock: number
  unit?: { abbreviation: string }
}

interface StockLevel {
  id: number
  qty_on_hand: number
  avg_cost: number
  product: ProductBase & { category?: { name: string } }
}

interface LowStockProduct extends ProductBase {
  stockLevel?: { qty_on_hand: number; avg_cost: number }
}

interface ExpiringLot {
  id: number
  lot_number: string
  expiry_date: string
  current_qty: number
  product: { name: string; internal_code: string }
}

interface StockMovement {
  id: number
  type: string
  qty: number
  unit_cost: number
  stock_after: number
  created_at: string
  reason?: string
  product: { name: string }
  user?: { name: string }
}

interface Paginated<T> {
  data: T[]
  current_page: number
  last_page: number
  total: number
  per_page: number
}

// ─── Constants ──────────────────────────────────────────────────────────────

const MOV_META: Record<string, { label: string; color: string; isOut: boolean }> = {
  purchase_in:          { label: 'Achat',             color: 'success', isOut: false },
  sale_out:             { label: 'Vente',              color: 'info',    isOut: true  },
  return_in:            { label: 'Retour client',      color: 'success', isOut: false },
  return_out:           { label: 'Retour fournisseur', color: 'warning', isOut: true  },
  adjustment_in:        { label: 'Ajustement +',       color: 'success', isOut: false },
  adjustment_out:       { label: 'Ajustement −',       color: 'warning', isOut: true  },
  transfer_in:          { label: 'Transfert (entrée)', color: 'info',    isOut: false },
  transfer_out:         { label: 'Transfert (sortie)', color: 'warning', isOut: true  },
  loss:                 { label: 'Perte / Démarque',   color: 'danger',  isOut: true  },
  kitchen_consumption:  { label: 'Conso. cuisine',     color: 'gray',    isOut: true  },
  inventory_adjustment: { label: 'Inventaire',         color: 'info',    isOut: false },
}

const EXPIRY_DAYS_OPTIONS = [7, 15, 30, 60, 90]

const DATE_PRESETS = [
  { label: "Aujourd'hui",  from: () => new Date().toISOString().slice(0, 10), to: () => new Date().toISOString().slice(0, 10) },
  { label: '7 derniers jours', from: () => new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10), to: () => new Date().toISOString().slice(0, 10) },
  { label: '30 derniers jours', from: () => new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10), to: () => new Date().toISOString().slice(0, 10) },
]

// ─── Sub-components ──────────────────────────────────────────────────────────

function Pagination({ page, lastPage, total, onPage }: {
  page: number; lastPage: number; total?: number; onPage: (p: number) => void
}) {
  if (lastPage <= 1) return null
  const pages: number[] = []
  const start = Math.max(1, Math.min(page - 2, lastPage - 4))
  for (let i = start; i <= Math.min(start + 4, lastPage); i++) pages.push(i)
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50/80 text-sm text-gray-500">
      <span>{total != null ? `${total} résultat${total > 1 ? 's' : ''}` : `Page ${page} / ${lastPage}`}</span>
      <div className="flex items-center gap-1">
        <button disabled={page <= 1} onClick={() => onPage(page - 1)}
          className="p-1.5 rounded-lg hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
          <ChevronLeft size={15} />
        </button>
        {pages.map(p => (
          <button key={p} onClick={() => onPage(p)}
            className={`w-8 h-8 rounded-lg text-xs font-semibold transition-colors ${p === page ? 'bg-blue-600 text-white shadow-sm' : 'hover:bg-gray-200 text-gray-700'}`}>
            {p}
          </button>
        ))}
        <button disabled={page >= lastPage} onClick={() => onPage(page + 1)}
          className="p-1.5 rounded-lg hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
          <ChevronRight size={15} />
        </button>
      </div>
    </div>
  )
}

function KpiCard({ icon, label, value, sub, color = 'blue' }: {
  icon: React.ReactNode; label: string; value: React.ReactNode; sub?: string; color?: 'blue' | 'red' | 'amber' | 'green'
}) {
  const palette = {
    blue:  'bg-blue-50 text-blue-600',
    red:   'bg-red-50 text-red-600',
    amber: 'bg-amber-50 text-amber-600',
    green: 'bg-emerald-50 text-emerald-600',
  }
  return (
    <div className="card p-4 flex items-center gap-4">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${palette[color]}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider truncate">{label}</p>
        <p className="text-xl font-bold text-gray-900 leading-tight">{value}</p>
        {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

function AdjustModal({ onClose, initialProduct }: {
  onClose: () => void
  initialProduct?: ProductBase | null
}) {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<ProductBase | null>(initialProduct ?? null)
  const [qty, setQty] = useState('')
  const [reason, setReason] = useState('')
  const [open, setOpen] = useState(false)
  const qc = useQueryClient()
  const ref = useRef<HTMLInputElement>(null)

  const { data: productList } = useQuery({
    queryKey: ['products-search-adj', search],
    queryFn: () => api.get('/products', { params: { search, per_page: 8 } }).then(r => r.data.data as ProductBase[]),
    enabled: search.length >= 2 && !selected,
  })

  const mutation = useMutation({
    mutationFn: (d: { product_id: number; qty: number; reason: string }) => api.post('/stock/adjust', d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stock-levels'] })
      qc.invalidateQueries({ queryKey: ['stock-low'] })
      qc.invalidateQueries({ queryKey: ['stock-valuation-kpi'] })
      onClose()
    },
  })

  useEffect(() => { if (!initialProduct) ref.current?.focus() }, [initialProduct])

  const qtyNum = parseFloat(qty)
  const isEntry = !isNaN(qtyNum) && qtyNum > 0
  const isExit  = !isNaN(qtyNum) && qtyNum < 0
  const valid   = !!selected && !isNaN(qtyNum) && qtyNum !== 0 && reason.trim().length >= 3

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-in fade-in slide-in-from-bottom-4 duration-200">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <Settings2 size={18} className="text-blue-600" />
            Ajustement de stock
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
            <X size={17} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Product picker */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Produit *</label>
            {selected ? (
              <div className="flex items-center gap-3 px-3 py-2.5 bg-blue-50 border border-blue-200 rounded-xl">
                <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <Boxes size={15} className="text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{selected.name}</p>
                  <p className="text-xs text-gray-400 font-mono">{selected.internal_code}</p>
                </div>
                <button onClick={() => { setSelected(null); setSearch('') }}
                  className="p-1 rounded-lg hover:bg-blue-100 text-blue-400 transition-colors">
                  <X size={14} />
                </button>
              </div>
            ) : (
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input ref={ref} value={search}
                  onChange={e => { setSearch(e.target.value); setOpen(true) }}
                  onFocus={() => setOpen(true)}
                  className="input pl-9 text-sm"
                  placeholder="Tapez un nom ou code produit..." />
                {open && (productList ?? []).length > 0 && (
                  <div className="absolute z-20 w-full mt-1.5 bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden">
                    {(productList ?? []).map(p => (
                      <button key={p.id} onMouseDown={e => { e.preventDefault(); setSelected(p); setOpen(false) }}
                        className="w-full text-left px-4 py-2.5 hover:bg-gray-50 flex items-center justify-between gap-3 transition-colors border-b last:border-0">
                        <span className="text-sm font-medium text-gray-900">{p.name}</span>
                        <span className="text-xs text-gray-400 font-mono flex-shrink-0">{p.internal_code}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Type selector */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Type de mouvement *</label>
            <div className="grid grid-cols-2 gap-2">
              <button type="button"
                onClick={() => { if (isExit) setQty('') }}
                className={`flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all ${isEntry ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                <TrendingUp size={15} /> Entrée de stock
              </button>
              <button type="button"
                onClick={() => { if (isEntry) setQty('') }}
                className={`flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all ${isExit ? 'border-red-400 bg-red-50 text-red-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                <TrendingDown size={15} /> Sortie de stock
              </button>
            </div>
          </div>

          {/* Quantity */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              Quantité *
              <span className="ml-2 text-xs font-normal text-gray-400">
                {isEntry ? '(valeur positive)' : isExit ? '(valeur négative)' : '(+ pour entrée, − pour sortie)'}
              </span>
            </label>
            <input type="number" step="0.01" value={qty}
              onChange={e => setQty(e.target.value)}
              className={`input font-bold text-lg text-center transition-colors ${isEntry ? 'border-emerald-400 bg-emerald-50/50 text-emerald-700 focus:ring-emerald-500/20' : isExit ? 'border-red-400 bg-red-50/50 text-red-700 focus:ring-red-500/20' : ''}`}
              placeholder="0" />
          </div>

          {/* Reason */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Motif *</label>
            <input type="text" value={reason} onChange={e => setReason(e.target.value)}
              className="input text-sm"
              placeholder="Ex: correction inventaire, casse, réception urgente..." />
          </div>

          {mutation.isError && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
              Une erreur est survenue. Vérifiez les données et réessayez.
            </div>
          )}
        </div>

        <div className="flex gap-3 px-6 pb-6">
          <button onClick={onClose} className="flex-1 btn-secondary text-sm">Annuler</button>
          <button disabled={!valid || mutation.isPending}
            onClick={() => mutation.mutate({ product_id: selected!.id, qty: qtyNum, reason })}
            className="flex-1 btn-primary text-sm flex items-center justify-center gap-2 disabled:opacity-40">
            {mutation.isPending
              ? <><Loader2 size={15} className="animate-spin" /> Enregistrement...</>
              : <><CheckCircle2 size={15} /> Valider</>}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function StockPage() {
  const [tab, setTab] = useState<StockTab>('levels')

  // Onglet 1 — Niveaux
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'' | 'low' | 'out'>('')
  const [page, setPage] = useState(1)
  const [adjustTarget, setAdjustTarget] = useState<ProductBase | null | undefined>(undefined)

  // Onglet 3 — DLC
  const [expiryDays, setExpiryDays] = useState(30)

  // Onglet 4 — Mouvements
  const [movPage, setMovPage] = useState(1)
  const [movType, setMovType] = useState('')
  const [movDateFrom, setMovDateFrom] = useState('')
  const [movDateTo, setMovDateTo] = useState('')

  const resetSearch = useCallback((v: string) => { setSearch(v); setPage(1) }, [])
  const resetStatus = useCallback((v: '' | 'low' | 'out') => { setStatusFilter(v); setPage(1) }, [])

  // ── Queries ──────────────────────────────────────────────────────────────

  const { data: levels, isLoading: levelsLoading } = useQuery<Paginated<StockLevel>>({
    queryKey: ['stock-levels', search, statusFilter, page],
    queryFn: () => api.get('/stock', { params: { search: search || undefined, status: statusFilter || undefined, page, per_page: 25 } }).then(r => r.data),
    placeholderData: prev => prev,
  })

  const { data: lowStock = [], isLoading: lowLoading } = useQuery<LowStockProduct[]>({
    queryKey: ['stock-low'],
    queryFn: () => api.get('/stock/low').then(r => r.data as LowStockProduct[]),
  })

  const { data: expiring = [], isLoading: expiringLoading } = useQuery<ExpiringLot[]>({
    queryKey: ['stock-expiring', expiryDays],
    queryFn: () => api.get('/stock/expiring', { params: { days: expiryDays } }).then(r => r.data as ExpiringLot[]),
    enabled: tab === 'expiring',
  })

  const { data: movements, isLoading: movLoading } = useQuery<Paginated<StockMovement>>({
    queryKey: ['stock-movements', movType, movDateFrom, movDateTo, movPage],
    queryFn: () => api.get('/stock/movements', {
      params: {
        type: movType || undefined,
        date_from: movDateFrom || undefined,
        date_to: movDateTo || undefined,
        page: movPage,
        per_page: 25,
      },
    }).then(r => r.data),
    enabled: tab === 'movements',
    placeholderData: prev => prev,
  })

  const { data: valuation } = useQuery<{ data: { value: number }[] }>({
    queryKey: ['stock-valuation-kpi'],
    queryFn: () => api.get('/reports/stock-valuation').then(r => r.data),
  })

  // ── KPI values ───────────────────────────────────────────────────────────

  const totalValue = (valuation?.data ?? []).reduce((s, v) => s + (v.value ?? 0), 0)
  const outProducts = lowStock.filter(p => (p.stockLevel?.qty_on_hand ?? 0) <= 0)
  const alertProducts = lowStock.filter(p => (p.stockLevel?.qty_on_hand ?? 0) > 0)

  // ── Helpers ───────────────────────────────────────────────────────────────

  const openAdjust = (product?: ProductBase) => setAdjustTarget(product ?? null)

  const applyDatePreset = (from: string, to: string) => {
    setMovDateFrom(from)
    setMovDateTo(to)
    setMovPage(1)
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-5">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2.5">
          <Boxes size={24} className="text-blue-600" />
          Gestion des Stocks
        </h1>
        <div className="flex items-center gap-2">
          <Link to="/losses" className="btn-secondary flex items-center gap-2 text-sm">
            <PackageMinus size={15} /> Saisir une perte
          </Link>
          <button onClick={() => openAdjust()} className="btn-primary flex items-center gap-2 text-sm">
            <Settings2 size={15} /> Ajustement stock
          </button>
        </div>
      </div>

      {/* ── KPI cards ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard color="blue"  icon={<TrendingUp size={20} />}
          label="Valeur totale stock"  value={formatCurrency(totalValue)} />
        <KpiCard color="green" icon={<PackagePlus size={20} />}
          label="Articles en stock"    value={levels?.total ?? '—'} sub="références actives" />
        <KpiCard color="amber" icon={<AlertTriangle size={20} />}
          label="Stocks bas"           value={alertProducts.length}  sub="sous le seuil d'alerte"
        />
        <KpiCard color="red"   icon={<Boxes size={20} />}
          label="Ruptures totales"     value={outProducts.length}    sub="stock ≤ 0" />
      </div>

      {/* ── Tabs ───────────────────────────────────────────────────────── */}
      <div className="flex border-b">
        {([
          { id: 'levels' as StockTab,    label: 'Niveaux de stock',   icon: <Boxes size={14} /> },
          { id: 'low' as StockTab,       label: 'Alertes & Ruptures', icon: <AlertTriangle size={14} />, badge: lowStock.length },
          { id: 'expiring' as StockTab,  label: 'DLC à venir',        icon: <Calendar size={14} /> },
          { id: 'movements' as StockTab, label: 'Mouvements',         icon: <TrendingDown size={14} /> },
        ]).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-5 py-3 text-sm font-medium border-b-2 transition-all whitespace-nowrap -mb-px ${
              tab === t.id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}>
            {t.icon}
            {t.label}
            {t.badge != null && t.badge > 0 && (
              <span className={`ml-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${tab === t.id ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-600'}`}>
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ════════════════════════════════════════════════════════════════
          TAB 1 — NIVEAUX DE STOCK
      ════════════════════════════════════════════════════════════════ */}
      {tab === 'levels' && (
        <div className="card p-0 overflow-hidden">

          {/* Toolbar */}
          <div className="px-4 py-3 border-b bg-gray-50 flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input type="text" value={search} onChange={e => resetSearch(e.target.value)}
                className="input pl-8 text-sm h-9" placeholder="Chercher par nom ou code..." />
              {search && (
                <button onClick={() => resetSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-gray-400 hover:text-gray-600">
                  <X size={13} />
                </button>
              )}
            </div>
            <div className="flex items-center gap-1 bg-white border rounded-lg p-0.5">
              {(['', 'low', 'out'] as const).map((s, i) => (
                <button key={i} onClick={() => resetStatus(s)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${statusFilter === s ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-100'}`}>
                  {s === '' ? 'Tous' : s === 'low' ? 'Alertes' : 'Ruptures'}
                </button>
              ))}
            </div>
            {levelsLoading && <Loader2 size={16} className="animate-spin text-blue-500 ml-auto" />}
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  <th className="text-left px-4 py-3">Produit</th>
                  <th className="text-left px-4 py-3">Catégorie</th>
                  <th className="text-right px-4 py-3">Qté actuelle</th>
                  <th className="text-right px-4 py-3">Seuil</th>
                  <th className="text-right px-4 py-3">Coût moy.</th>
                  <th className="text-right px-4 py-3">Valeur</th>
                  <th className="text-center px-4 py-3">Statut</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(levels?.data ?? []).map((s: StockLevel) => {
                  const isOut = s.qty_on_hand <= 0
                  const isLow = !isOut && s.qty_on_hand <= s.product.alert_stock
                  const fillPct = s.product.alert_stock > 0
                    ? Math.min(100, (s.qty_on_hand / (s.product.alert_stock * 2)) * 100)
                    : 100
                  return (
                    <tr key={s.id} className={`group transition-colors hover:bg-gray-50/80 ${isOut ? 'bg-red-50' : isLow ? 'bg-amber-50' : ''}`}>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-gray-900">{s.product.name}</p>
                        <p className="text-xs text-gray-400 font-mono mt-0.5">{s.product.internal_code}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">{s.product.category?.name ?? <span className="text-gray-300">—</span>}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex flex-col items-end gap-1">
                          <span className={`font-bold text-base leading-none ${isOut ? 'text-red-600' : isLow ? 'text-amber-600' : 'text-gray-900'}`}>
                            {formatNumber(s.qty_on_hand, 0)}
                            {s.product.unit && <span className="text-xs font-normal text-gray-400 ml-1">{s.product.unit.abbreviation}</span>}
                          </span>
                          {s.product.alert_stock > 0 && (
                            <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${isOut ? 'bg-red-500' : isLow ? 'bg-amber-400' : 'bg-emerald-500'}`}
                                style={{ width: `${fillPct}%` }} />
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-400 text-xs">{formatNumber(s.product.alert_stock, 0)}</td>
                      <td className="px-4 py-3 text-right text-gray-600 text-xs">{formatCurrency(s.avg_cost)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900">{formatCurrency(s.qty_on_hand * s.avg_cost)}</td>
                      <td className="px-4 py-3 text-center">
                        {isOut
                          ? <span className="badge-danger">Rupture</span>
                          : isLow
                            ? <span className="badge-warning">Alerte</span>
                            : <span className="badge-success">OK</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => openAdjust(s.product)}
                          className="text-xs text-blue-600 font-medium px-2 py-1 rounded-lg hover:bg-blue-50 opacity-0 group-hover:opacity-100 transition-all whitespace-nowrap">
                          Ajuster
                        </button>
                      </td>
                    </tr>
                  )
                })}
                {!levelsLoading && (levels?.data ?? []).length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center">
                      <Boxes size={32} className="mx-auto text-gray-300 mb-2" />
                      <p className="text-gray-400">Aucun article trouvé.</p>
                    </td>
                  </tr>
                )}
              </tbody>
              {(levels?.data ?? []).length > 0 && (
                <tfoot>
                  <tr className="bg-gray-50 border-t text-xs font-semibold text-gray-600">
                    <td colSpan={5} className="px-4 py-2.5">Total visible</td>
                    <td className="px-4 py-2.5 text-right font-bold text-gray-900">
                      {formatCurrency((levels?.data ?? []).reduce((s, r) => s + r.qty_on_hand * r.avg_cost, 0))}
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          <Pagination page={levels?.current_page ?? 1} lastPage={levels?.last_page ?? 1} total={levels?.total} onPage={setPage} />
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
          TAB 2 — ALERTES & RUPTURES
      ════════════════════════════════════════════════════════════════ */}
      {tab === 'low' && (
        <div className="space-y-5">
          {lowLoading && (
            <div className="flex items-center justify-center h-24">
              <Loader2 size={22} className="animate-spin text-blue-500" />
            </div>
          )}

          {/* Ruptures totales */}
          {outProducts.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-red-100 text-red-700 text-xs font-bold rounded-full uppercase tracking-wide">
                  <AlertTriangle size={12} /> {outProducts.length} Rupture{outProducts.length > 1 ? 's' : ''} totale{outProducts.length > 1 ? 's' : ''}
                </span>
                <span className="text-xs text-gray-400">Stock ≤ 0 — commande urgente requise</span>
              </div>
              <div className="card p-0 overflow-hidden border-red-200 border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-red-50 border-b border-red-200 text-xs font-semibold text-red-600 uppercase tracking-wide">
                      <th className="text-left px-4 py-3">Produit</th>
                      <th className="text-right px-4 py-3">Dernier stock connu</th>
                      <th className="text-right px-4 py-3">Seuil d'alerte</th>
                      <th className="text-center px-4 py-3">Urgence</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-red-100">
                    {outProducts.map(p => (
                      <tr key={p.id} className="bg-red-50/60 hover:bg-red-50 transition-colors">
                        <td className="px-4 py-3">
                          <p className="font-semibold text-gray-900">{p.name}</p>
                          <p className="text-xs font-mono text-gray-400 mt-0.5">{p.internal_code}</p>
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-red-600 text-base">
                          {formatNumber(p.stockLevel?.qty_on_hand ?? 0, 0)}
                          {p.unit && <span className="text-xs font-normal text-gray-400 ml-1">{p.unit.abbreviation}</span>}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-500">{formatNumber(p.alert_stock, 0)}</td>
                        <td className="px-4 py-3 text-center">
                          <span className="badge-danger font-bold">Rupture totale</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link to="/purchases"
                            className="flex items-center gap-1.5 text-xs text-blue-600 font-medium px-2.5 py-1.5 rounded-lg hover:bg-blue-50 transition-colors whitespace-nowrap">
                            <ShoppingCart size={13} /> Commander
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Stocks bas */}
          {alertProducts.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-100 text-amber-700 text-xs font-bold rounded-full uppercase tracking-wide">
                  <AlertTriangle size={12} /> {alertProducts.length} Stock{alertProducts.length > 1 ? 's' : ''} bas
                </span>
                <span className="text-xs text-gray-400">Sous le seuil d'alerte — à réapprovisionner</span>
              </div>
              <div className="card p-0 overflow-hidden border-amber-200 border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-amber-50 border-b border-amber-200 text-xs font-semibold text-amber-700 uppercase tracking-wide">
                      <th className="text-left px-4 py-3">Produit</th>
                      <th className="text-right px-4 py-3">Stock actuel</th>
                      <th className="text-right px-4 py-3">Seuil alerte</th>
                      <th className="text-right px-4 py-3">Manquant</th>
                      <th className="text-left px-4 py-3">Niveau</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-amber-100">
                    {alertProducts.map(p => {
                      const qty = p.stockLevel?.qty_on_hand ?? 0
                      const pct = p.alert_stock > 0 ? Math.round((qty / p.alert_stock) * 100) : 0
                      return (
                        <tr key={p.id} className="bg-amber-50/40 hover:bg-amber-50 transition-colors">
                          <td className="px-4 py-3">
                            <p className="font-semibold text-gray-900">{p.name}</p>
                            <p className="text-xs font-mono text-gray-400 mt-0.5">{p.internal_code}</p>
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-amber-700 text-base">
                            {formatNumber(qty, 0)}
                            {p.unit && <span className="text-xs font-normal text-gray-400 ml-1">{p.unit.abbreviation}</span>}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-500">{formatNumber(p.alert_stock, 0)}</td>
                          <td className="px-4 py-3 text-right font-semibold text-red-500">{formatNumber(p.alert_stock - qty, 0)}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden min-w-[60px]">
                                <div className="h-full bg-amber-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
                              </div>
                              <span className="text-xs text-gray-400 w-8">{pct}%</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Link to="/purchases"
                              className="flex items-center gap-1.5 text-xs text-blue-600 font-medium px-2.5 py-1.5 rounded-lg hover:bg-blue-50 transition-colors whitespace-nowrap">
                              <ShoppingCart size={13} /> Commander
                            </Link>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {!lowLoading && lowStock.length === 0 && (
            <div className="card p-12 text-center">
              <CheckCircle2 size={40} className="mx-auto text-emerald-400 mb-3" />
              <p className="font-semibold text-gray-700">Tous les stocks sont au niveau !</p>
              <p className="text-sm text-gray-400 mt-1">Aucun produit sous le seuil d'alerte.</p>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
          TAB 3 — DLC À VENIR
      ════════════════════════════════════════════════════════════════ */}
      {tab === 'expiring' && (
        <div className="space-y-4">

          {/* Day filter pills */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-gray-500 font-medium flex items-center gap-1.5">
              <Filter size={13} /> Horizon :
            </span>
            {EXPIRY_DAYS_OPTIONS.map(d => (
              <button key={d} onClick={() => setExpiryDays(d)}
                className={`px-4 py-1.5 text-xs font-semibold rounded-full border transition-all ${
                  expiryDays === d
                    ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                    : 'border-gray-300 text-gray-600 hover:border-blue-400 hover:text-blue-600'
                }`}>
                {d} jours
              </button>
            ))}
          </div>

          {/* Summary stats */}
          {!expiringLoading && expiring.length > 0 && (() => {
            const critical = expiring.filter(l => {
              const d = Math.ceil((new Date(l.expiry_date).getTime() - Date.now()) / 86400000)
              return d <= 7
            })
            const warning = expiring.filter(l => {
              const d = Math.ceil((new Date(l.expiry_date).getTime() - Date.now()) / 86400000)
              return d > 7 && d <= 15
            })
            return (
              <div className="flex gap-3 flex-wrap">
                {critical.length > 0 && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-xl text-sm">
                    <span className="w-2 h-2 rounded-full bg-red-500" />
                    <span className="font-bold text-red-700">{critical.length}</span>
                    <span className="text-red-600">lot{critical.length > 1 ? 's' : ''} critique{critical.length > 1 ? 's' : ''} (≤ 7j)</span>
                  </div>
                )}
                {warning.length > 0 && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl text-sm">
                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                    <span className="font-bold text-amber-700">{warning.length}</span>
                    <span className="text-amber-600">lot{warning.length > 1 ? 's' : ''} à surveiller (8–15j)</span>
                  </div>
                )}
                <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm">
                  <span className="font-bold text-gray-700">{expiring.length}</span>
                  <span className="text-gray-500">lot{expiring.length > 1 ? 's' : ''} total dans les {expiryDays}j</span>
                </div>
              </div>
            )
          })()}

          {expiringLoading ? (
            <div className="flex items-center justify-center h-24">
              <Loader2 size={22} className="animate-spin text-blue-500" />
            </div>
          ) : (
            <div className="card p-0 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      <th className="text-left px-4 py-3">Produit</th>
                      <th className="text-left px-4 py-3">N° Lot</th>
                      <th className="text-right px-4 py-3">Quantité</th>
                      <th className="text-center px-4 py-3">Date d'expiration</th>
                      <th className="text-center px-4 py-3">Jours restants</th>
                      <th className="text-left px-4 py-3">Progression</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {expiring.map(lot => {
                      const days = Math.ceil((new Date(lot.expiry_date).getTime() - Date.now()) / 86400000)
                      const urgency = days <= 7 ? 'danger' : days <= 15 ? 'warning' : 'info'
                      const barColor = days <= 7 ? 'bg-red-500' : days <= 15 ? 'bg-amber-400' : 'bg-blue-400'
                      const barPct = Math.max(5, Math.min(100, (days / expiryDays) * 100))
                      return (
                        <tr key={lot.id}
                          className={`transition-colors hover:bg-gray-50/80 ${days <= 7 ? 'bg-red-50' : days <= 15 ? 'bg-amber-50' : ''}`}>
                          <td className="px-4 py-3">
                            <p className="font-semibold text-gray-900">{lot.product.name}</p>
                            <p className="text-xs font-mono text-gray-400">{lot.product.internal_code}</p>
                          </td>
                          <td className="px-4 py-3">
                            <span className="font-mono text-xs bg-gray-100 border border-gray-200 px-2 py-0.5 rounded">{lot.lot_number}</span>
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-gray-900">{formatNumber(lot.current_qty, 0)}</td>
                          <td className="px-4 py-3 text-center text-gray-700">{formatDate(lot.expiry_date)}</td>
                          <td className="px-4 py-3 text-center">
                            <span className={`badge-${urgency} font-bold text-sm`}>{days}j</span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2 min-w-[80px]">
                              <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                <div className={`h-full rounded-full ${barColor} transition-all`} style={{ width: `${barPct}%` }} />
                              </div>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                    {expiring.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-12 text-center">
                          <Calendar size={32} className="mx-auto text-gray-300 mb-2" />
                          <p className="text-gray-400">Aucun lot expirant dans les {expiryDays} prochains jours.</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
          TAB 4 — MOUVEMENTS
      ════════════════════════════════════════════════════════════════ */}
      {tab === 'movements' && (
        <div className="card p-0 overflow-hidden">

          {/* Toolbar */}
          <div className="px-4 py-3 border-b bg-gray-50 space-y-3">
            {/* Quick date presets */}
            <div className="flex flex-wrap items-center gap-2">
              {DATE_PRESETS.map(preset => (
                <button key={preset.label}
                  onClick={() => applyDatePreset(preset.from(), preset.to())}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                    movDateFrom === preset.from() && movDateTo === preset.to()
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'border-gray-300 text-gray-600 hover:border-blue-400'
                  }`}>
                  {preset.label}
                </button>
              ))}
              {(movDateFrom || movDateTo) && (
                <button onClick={() => { setMovDateFrom(''); setMovDateTo(''); setMovPage(1) }}
                  className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 px-2">
                  <X size={11} /> Effacer dates
                </button>
              )}
            </div>

            {/* Filters row */}
            <div className="flex flex-wrap items-center gap-3">
              <select value={movType} onChange={e => { setMovType(e.target.value); setMovPage(1) }}
                className="input text-sm h-9 w-52">
                <option value="">Tous les types</option>
                <optgroup label="Entrées">
                  {Object.entries(MOV_META).filter(([, v]) => !v.isOut).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </optgroup>
                <optgroup label="Sorties">
                  {Object.entries(MOV_META).filter(([, v]) => v.isOut).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </optgroup>
              </select>
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <span>Du</span>
                <input type="date" value={movDateFrom} onChange={e => { setMovDateFrom(e.target.value); setMovPage(1) }}
                  className="input text-sm h-9 w-38" />
                <span>au</span>
                <input type="date" value={movDateTo} onChange={e => { setMovDateTo(e.target.value); setMovPage(1) }}
                  className="input text-sm h-9 w-38" />
              </div>
              {(movType || movDateFrom || movDateTo) && (
                <button onClick={() => { setMovType(''); setMovDateFrom(''); setMovDateTo(''); setMovPage(1) }}
                  className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 px-2.5 py-1.5 border rounded-lg hover:bg-gray-100 transition-colors">
                  <RefreshCw size={12} /> Tout réinitialiser
                </button>
              )}
              {movLoading && <Loader2 size={15} className="animate-spin text-blue-500 ml-auto" />}
            </div>
          </div>

          {/* Summary */}
          {!movLoading && movements?.data && movements.data.length > 0 && (() => {
            const entries = movements.data.filter(m => !MOV_META[m.type]?.isOut)
            const exits   = movements.data.filter(m =>  MOV_META[m.type]?.isOut)
            const sumIn   = entries.reduce((s, m) => s + m.qty, 0)
            const sumOut  = exits.reduce((s, m) => s + m.qty, 0)
            return (
              <div className="flex gap-4 px-4 py-2.5 bg-blue-50/40 border-b text-xs text-gray-600">
                <span className="text-emerald-600 font-semibold">↑ Entrées : +{formatNumber(sumIn, 2)}</span>
                <span className="text-gray-300">|</span>
                <span className="text-red-600 font-semibold">↓ Sorties : −{formatNumber(sumOut, 2)}</span>
                <span className="text-gray-300">|</span>
                <span>{movements.total} mouvement{movements.total > 1 ? 's' : ''} au total</span>
              </div>
            )
          })()}

          {/* Table */}
          {movLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 size={22} className="animate-spin text-blue-500" />
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      <th className="text-left px-4 py-3">Date & heure</th>
                      <th className="text-left px-4 py-3">Produit</th>
                      <th className="text-left px-4 py-3">Type</th>
                      <th className="text-right px-4 py-3">Qté</th>
                      <th className="text-right px-4 py-3">Stock après</th>
                      <th className="text-left px-4 py-3">Motif</th>
                      <th className="text-left px-4 py-3">Opérateur</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {(movements?.data ?? []).map((m: StockMovement) => {
                      const meta = MOV_META[m.type] ?? { label: m.type, color: 'gray', isOut: false }
                      return (
                        <tr key={m.id} className="hover:bg-gray-50/60 transition-colors">
                          <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap font-mono">
                            {formatDate(m.created_at)}
                          </td>
                          <td className="px-4 py-3 font-medium text-gray-900">{m.product.name}</td>
                          <td className="px-4 py-3">
                            <span className={`badge-${meta.color}`}>{meta.label}</span>
                          </td>
                          <td className={`px-4 py-3 text-right font-bold ${meta.isOut ? 'text-red-600' : 'text-emerald-600'}`}>
                            {meta.isOut ? '−' : '+'}
                            {formatNumber(m.qty, 2)}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-500 font-mono text-xs">
                            {formatNumber(m.stock_after, 2)}
                          </td>
                          <td className="px-4 py-3 text-gray-400 text-xs max-w-[140px] truncate" title={m.reason ?? ''}>
                            {m.reason ?? <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-4 py-3 text-gray-500 text-xs">{m.user?.name ?? <span className="text-gray-300">—</span>}</td>
                        </tr>
                      )
                    })}
                    {(movements?.data ?? []).length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-4 py-12 text-center">
                          <TrendingDown size={32} className="mx-auto text-gray-300 mb-2" />
                          <p className="text-gray-400">Aucun mouvement trouvé pour ces critères.</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <Pagination
                page={movements?.current_page ?? 1}
                lastPage={movements?.last_page ?? 1}
                total={movements?.total}
                onPage={setMovPage}
              />
            </>
          )}
        </div>
      )}

      {/* ── Modal d'ajustement ─────────────────────────────────────── */}
      {adjustTarget !== undefined && (
        <AdjustModal
          initialProduct={adjustTarget}
          onClose={() => setAdjustTarget(undefined)}
        />
      )}
    </div>
  )
}
