import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../lib/api'
import { formatCurrency, formatNumber } from '../../lib/format'
import toast from 'react-hot-toast'
import {
  Plus, Search, Edit2, ToggleLeft, ToggleRight, ChevronLeft, ChevronRight,
  Package, AlertTriangle, X, Check, Tag, Layers, BarChart2, TrendingUp,
  Eye, Filter, ChevronDown, Trash2, History, Barcode,
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

interface ProductStats {
  total: number
  active: number
  low_stock: number
  out_of_stock: number
}

interface Category { id: number; name: string; children?: Category[] }
interface Brand { id: number; name: string }
interface Unit { id: number; name: string; abbreviation: string }

interface PriceHistoryItem {
  id: number
  old_price_ttc: number
  new_price_ttc: number
  old_purchase_price: number
  new_purchase_price: number
  created_at: string
  user?: { name: string }
}

interface Product {
  id: number
  internal_code: string
  name: string
  short_name?: string
  description?: string
  category?: { id: number; name: string }
  brand?: { id: number; name: string }
  unit?: { id: number; name: string; abbreviation: string }
  purchase_price_ht: number
  sale_price_ttc: number
  vat_rate: number
  is_active: boolean
  is_weight_based: boolean
  track_expiry: boolean
  min_stock?: number
  max_stock?: number
  alert_stock?: number
  stockLevel?: { qty_on_hand: number; avg_cost: number }
  barcodes?: { barcode: string; is_primary: boolean; type: string }[]
  priceHistory?: PriceHistoryItem[]
}

interface Paginated<T> { data: T[]; total: number; current_page: number; last_page: number }

type StatusFilter = 'all' | 'active' | 'inactive' | 'low_stock'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function KpiCard({ icon, label, value, color }: {
  icon: React.ReactNode; label: string; value: number | string; color: string
}) {
  return (
    <div className="card p-4 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color}`}>
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-xs text-gray-500 mt-0.5">{label}</p>
      </div>
    </div>
  )
}

function flattenCategories(cats: Category[]): Category[] {
  return cats.flatMap(c => [c, ...(c.children ? flattenCategories(c.children) : [])])
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// ─── Product Form Modal ───────────────────────────────────────────────────────

interface BarcodeEntry { barcode: string; type: 'ean13' | 'ean8' | 'internal' | 'weight_variable' }

function ProductFormModal({ product, onClose }: { product?: Product; onClose: () => void }) {
  const qc = useQueryClient()

  const { data: rawCategories = [] } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: () => api.get('/categories').then(r => r.data),
  })
  const { data: brands = [] } = useQuery<Brand[]>({
    queryKey: ['brands'],
    queryFn: () => api.get('/brands').then(r => r.data),
  })
  const { data: units = [] } = useQuery<Unit[]>({
    queryKey: ['units'],
    queryFn: () => api.get('/units').then(r => r.data),
  })

  const flatCats = flattenCategories(rawCategories)

  const [form, setForm] = useState({
    name: product?.name ?? '',
    short_name: product?.short_name ?? '',
    category_id: product?.category?.id?.toString() ?? '',
    brand_id: product?.brand?.id?.toString() ?? '',
    unit_id: product?.unit?.id?.toString() ?? '',
    purchase_price_ht: product?.purchase_price_ht?.toString() ?? '0',
    sale_price_ttc: product?.sale_price_ttc?.toString() ?? '0',
    vat_rate: product?.vat_rate?.toString() ?? '18',
    min_stock: product?.min_stock?.toString() ?? '',
    max_stock: product?.max_stock?.toString() ?? '',
    alert_stock: product?.alert_stock?.toString() ?? '',
    is_weight_based: product?.is_weight_based ?? false,
    track_expiry: product?.track_expiry ?? false,
    price_per_kg: '',
  })

  const [barcodes, setBarcodes] = useState<BarcodeEntry[]>(
    product?.barcodes?.map(b => ({ barcode: b.barcode, type: b.type as BarcodeEntry['type'] })) ?? [{ barcode: '', type: 'ean13' }]
  )
  const [errors, setErrors] = useState<Record<string, string>>({})

  const mutation = useMutation({
    mutationFn: (payload: object) =>
      product ? api.put(`/products/${product.id}`, payload) : api.post('/products', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] })
      qc.invalidateQueries({ queryKey: ['product-stats'] })
      toast.success(product ? 'Produit mis à jour' : 'Produit créé')
      onClose()
    },
    onError: (err: { response?: { data?: { errors?: Record<string, string[]>; message?: string } } }) => {
      if (err.response?.data?.errors) {
        const e: Record<string, string> = {}
        Object.entries(err.response.data.errors).forEach(([k, v]) => { e[k] = v[0] })
        setErrors(e)
      } else {
        toast.error(err.response?.data?.message ?? 'Erreur')
      }
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const errs: Record<string, string> = {}
    if (!form.name.trim()) errs.name = 'Nom requis'
    if (!form.purchase_price_ht) errs.purchase_price_ht = 'Prix achat requis'
    if (!form.sale_price_ttc) errs.sale_price_ttc = 'Prix vente requis'
    if (Object.keys(errs).length) { setErrors(errs); return }

    const validBarcodes = barcodes.filter(b => b.barcode.trim())

    mutation.mutate({
      name: form.name,
      short_name: form.short_name || undefined,
      category_id: form.category_id ? Number(form.category_id) : undefined,
      brand_id: form.brand_id ? Number(form.brand_id) : undefined,
      unit_id: form.unit_id ? Number(form.unit_id) : undefined,
      purchase_price_ht: Number(form.purchase_price_ht),
      sale_price_ttc: Number(form.sale_price_ttc),
      vat_rate: Number(form.vat_rate),
      min_stock: form.min_stock ? Number(form.min_stock) : undefined,
      max_stock: form.max_stock ? Number(form.max_stock) : undefined,
      alert_stock: form.alert_stock ? Number(form.alert_stock) : undefined,
      is_weight_based: form.is_weight_based,
      track_expiry: form.track_expiry,
      barcodes: validBarcodes.length ? validBarcodes : undefined,
    })
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const marginPct = (() => {
    const ht = Number(form.sale_price_ttc) / (1 + Number(form.vat_rate) / 100)
    const buy = Number(form.purchase_price_ht)
    if (!buy || !ht) return null
    return Math.round(((ht - buy) / buy) * 100)
  })()

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl max-h-[92vh] flex flex-col">
        <div className="p-6 border-b flex items-center justify-between flex-shrink-0">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Package size={20} className="text-blue-600" />
            {product ? 'Modifier le produit' : 'Nouvel article'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Désignation */}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Désignation *</label>
              <input value={form.name} onChange={set('name')} className="input" placeholder="Nom complet du produit" />
              {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nom court (ticket)</label>
              <input value={form.short_name} onChange={set('short_name')} className="input" placeholder="Ex: COCA 33CL" maxLength={60} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Catégorie</label>
              <select value={form.category_id} onChange={set('category_id')} className="input">
                <option value="">— Sélectionner —</option>
                {flatCats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Marque</label>
              <select value={form.brand_id} onChange={set('brand_id')} className="input">
                <option value="">— Sélectionner —</option>
                {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Unité</label>
              <select value={form.unit_id} onChange={set('unit_id')} className="input">
                <option value="">— Sélectionner —</option>
                {units.map(u => <option key={u.id} value={u.id}>{u.name} ({u.abbreviation})</option>)}
              </select>
            </div>
          </div>

          {/* Prix */}
          <div className="bg-gray-50 rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2"><TrendingUp size={14} /> Tarification</h3>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Prix achat HT *</label>
                <input type="number" value={form.purchase_price_ht} onChange={set('purchase_price_ht')} className="input" min={0} step={1} />
                {errors.purchase_price_ht && <p className="text-red-500 text-xs mt-1">{errors.purchase_price_ht}</p>}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Prix vente TTC *</label>
                <input type="number" value={form.sale_price_ttc} onChange={set('sale_price_ttc')} className="input" min={0} step={1} />
                {errors.sale_price_ttc && <p className="text-red-500 text-xs mt-1">{errors.sale_price_ttc}</p>}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">TVA</label>
                <select value={form.vat_rate} onChange={set('vat_rate')} className="input">
                  <option value={18}>18% standard</option>
                  <option value={0}>Exonéré 0%</option>
                </select>
              </div>
            </div>
            {marginPct !== null && (
              <div className={`text-sm font-medium ${marginPct >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                Marge : {marginPct >= 0 ? '+' : ''}{marginPct}%
              </div>
            )}
          </div>

          {/* Stock */}
          <div className="bg-gray-50 rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2"><Layers size={14} /> Seuils stock</h3>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Stock minimum</label>
                <input type="number" value={form.min_stock} onChange={set('min_stock')} className="input" min={0} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Stock maximum</label>
                <input type="number" value={form.max_stock} onChange={set('max_stock')} className="input" min={0} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Seuil d'alerte</label>
                <input type="number" value={form.alert_stock} onChange={set('alert_stock')} className="input" min={0} />
              </div>
            </div>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form.is_weight_based}
                  onChange={e => setForm(f => ({ ...f, is_weight_based: e.target.checked }))}
                  className="rounded" />
                Vendu au poids
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form.track_expiry}
                  onChange={e => setForm(f => ({ ...f, track_expiry: e.target.checked }))}
                  className="rounded" />
                Suivi DLC
              </label>
            </div>
          </div>

          {/* Codes-barres */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2"><Barcode size={14} /> Codes-barres</h3>
              <button type="button"
                onClick={() => setBarcodes(b => [...b, { barcode: '', type: 'ean13' }])}
                className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                <Plus size={12} /> Ajouter
              </button>
            </div>
            {barcodes.map((bc, i) => (
              <div key={i} className="flex gap-2 items-center">
                <input
                  value={bc.barcode}
                  onChange={e => setBarcodes(arr => arr.map((a, j) => j === i ? { ...a, barcode: e.target.value } : a))}
                  className="input flex-1" placeholder="Code-barres" />
                <select
                  value={bc.type}
                  onChange={e => setBarcodes(arr => arr.map((a, j) => j === i ? { ...a, type: e.target.value as BarcodeEntry['type'] } : a))}
                  className="input w-32">
                  <option value="ean13">EAN-13</option>
                  <option value="ean8">EAN-8</option>
                  <option value="internal">Interne</option>
                </select>
                {i === 0 && <span className="text-xs text-blue-500 w-16 text-center">Principal</span>}
                {i > 0 && (
                  <button type="button" onClick={() => setBarcodes(arr => arr.filter((_, j) => j !== i))}
                    className="text-gray-400 hover:text-red-500 w-16 flex justify-center">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </form>

        <div className="p-6 border-t flex gap-3 flex-shrink-0">
          <button type="button" onClick={onClose} className="btn-secondary flex-1">Annuler</button>
          <button
            onClick={handleSubmit}
            disabled={mutation.isPending}
            className="btn-primary flex-1 flex items-center justify-center gap-2">
            <Check size={16} />
            {mutation.isPending ? 'Enregistrement...' : (product ? 'Mettre à jour' : 'Créer l\'article')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Product Detail Modal ─────────────────────────────────────────────────────

function ProductDetailModal({ product, onClose, onEdit }: {
  product: Product; onClose: () => void; onEdit: () => void
}) {
  const { data: detail } = useQuery<Product>({
    queryKey: ['product', product.id],
    queryFn: () => api.get(`/products/${product.id}`).then(r => r.data),
  })

  const p = detail ?? product
  const stock = p.stockLevel?.qty_on_hand ?? 0

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl max-h-[92vh] flex flex-col">
        <div className="p-6 border-b flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-xl font-bold">{p.name}</h2>
            <p className="text-sm text-gray-500 font-mono">{p.internal_code}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={onEdit}
              className="flex items-center gap-1 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-sm hover:bg-blue-100">
              <Edit2 size={14} /> Modifier
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Info grid */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="bg-gray-50 rounded-xl p-4 space-y-2">
              <p className="font-semibold text-gray-700">Tarification</p>
              <div className="flex justify-between"><span className="text-gray-500">Prix achat HT</span><span className="font-medium">{formatCurrency(p.purchase_price_ht)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Prix vente TTC</span><span className="font-bold text-blue-600">{formatCurrency(p.sale_price_ttc)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">TVA</span><span>{p.vat_rate}%</span></div>
            </div>
            <div className="bg-gray-50 rounded-xl p-4 space-y-2">
              <p className="font-semibold text-gray-700">Stock</p>
              <div className="flex justify-between"><span className="text-gray-500">Disponible</span>
                <span className={`font-bold ${stock <= 0 ? 'text-red-600' : stock <= (p.alert_stock ?? 5) ? 'text-amber-600' : 'text-green-600'}`}>
                  {formatNumber(stock, 0)} {p.unit?.abbreviation ?? ''}
                </span>
              </div>
              {p.alert_stock != null && <div className="flex justify-between"><span className="text-gray-500">Seuil alerte</span><span>{p.alert_stock}</span></div>}
              {p.stockLevel?.avg_cost != null && <div className="flex justify-between"><span className="text-gray-500">Coût moyen</span><span>{formatCurrency(p.stockLevel.avg_cost)}</span></div>}
            </div>
          </div>

          {/* Barcodes */}
          {(p.barcodes ?? []).length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2"><Barcode size={14} /> Codes-barres</h3>
              <div className="flex flex-wrap gap-2">
                {p.barcodes!.map((b, i) => (
                  <span key={i} className={`px-3 py-1 rounded-lg text-sm font-mono border ${b.is_primary ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-gray-50 border-gray-200 text-gray-600'}`}>
                    {b.barcode} {b.is_primary && <span className="text-xs">(principal)</span>}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Price history */}
          {(p.priceHistory ?? []).length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2"><History size={14} /> Historique des prix</h3>
              <table className="w-full text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Date</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-600">Ancien prix TTC</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-600">Nouveau prix TTC</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-600">Var.</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Modifié par</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {p.priceHistory!.map(h => {
                    const delta = h.new_price_ttc - h.old_price_ttc
                    return (
                      <tr key={h.id}>
                        <td className="px-3 py-2 text-gray-500">{fmtDate(h.created_at)}</td>
                        <td className="px-3 py-2 text-right text-gray-500 line-through">{formatCurrency(h.old_price_ttc)}</td>
                        <td className="px-3 py-2 text-right font-medium">{formatCurrency(h.new_price_ttc)}</td>
                        <td className={`px-3 py-2 text-right font-medium ${delta > 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {delta > 0 ? '+' : ''}{formatCurrency(delta)}
                        </td>
                        <td className="px-3 py-2 text-gray-500">{h.user?.name ?? '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ProductsPage() {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | ''>('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [showForm, setShowForm] = useState(false)
  const [editProduct, setEditProduct] = useState<Product | undefined>()
  const [viewProduct, setViewProduct] = useState<Product | undefined>()
  const [showStatusMenu, setShowStatusMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const qc = useQueryClient()

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowStatusMenu(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const { data: stats } = useQuery<ProductStats>({
    queryKey: ['product-stats'],
    queryFn: () => api.get('/products/stats').then(r => r.data),
  })

  const { data: rawCategories = [] } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: () => api.get('/categories').then(r => r.data),
  })

  const flatCats = flattenCategories(rawCategories)

  const queryParams = {
    search: search || undefined,
    page,
    per_page: 25,
    category_id: selectedCategoryId || undefined,
    is_active: statusFilter === 'active' ? true : statusFilter === 'inactive' ? false : undefined,
    low_stock: statusFilter === 'low_stock' ? true : undefined,
  }

  const { data, isLoading } = useQuery<Paginated<Product>>({
    queryKey: ['products', queryParams],
    queryFn: () => api.get('/products', { params: queryParams }).then(r => r.data),
    placeholderData: prev => prev,
  })

  const toggleActive = useMutation({
    mutationFn: (p: Product) => api.put(`/products/${p.id}`, { is_active: !p.is_active }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] })
      qc.invalidateQueries({ queryKey: ['product-stats'] })
    },
  })

  const STATUS_LABELS: Record<StatusFilter, string> = {
    all: 'Tous les articles',
    active: 'Actifs uniquement',
    inactive: 'Inactifs uniquement',
    low_stock: 'Stock faible',
  }

  const resetFilters = () => {
    setSearch('')
    setSelectedCategoryId('')
    setStatusFilter('all')
    setPage(1)
  }

  const hasFilters = search || selectedCategoryId !== '' || statusFilter !== 'all'

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Package size={24} className="text-blue-600" /> Catalogue Articles
          </h1>
          <p className="text-gray-500 text-sm">{data?.total ?? 0} articles correspondants</p>
        </div>
        <button onClick={() => { setEditProduct(undefined); setShowForm(true) }}
          className="btn-primary flex items-center gap-2">
          <Plus size={18} /> Nouvel article
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4">
        <KpiCard icon={<Package size={20} className="text-white" />} label="Total articles" value={stats?.total ?? 0} color="bg-blue-500" />
        <KpiCard icon={<Check size={20} className="text-white" />} label="Articles actifs" value={stats?.active ?? 0} color="bg-green-500" />
        <KpiCard icon={<AlertTriangle size={20} className="text-white" />} label="Stock faible" value={stats?.low_stock ?? 0} color="bg-amber-500" />
        <KpiCard icon={<X size={20} className="text-white" />} label="En rupture" value={stats?.out_of_stock ?? 0} color="bg-red-500" />
      </div>

      {/* Filters */}
      <div className="card p-4 space-y-3">
        <div className="flex gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <input
              type="text"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              className="input pl-10"
              placeholder="Rechercher par nom, code interne ou code-barres..."
            />
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          </div>

          {/* Status filter */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setShowStatusMenu(s => !s)}
              className="flex items-center gap-2 px-4 py-2 border rounded-lg text-sm hover:bg-gray-50 bg-white border-gray-200 whitespace-nowrap">
              <Filter size={15} className="text-gray-500" />
              {STATUS_LABELS[statusFilter]}
              <ChevronDown size={14} className="text-gray-400" />
            </button>
            {showStatusMenu && (
              <div className="absolute right-0 top-full mt-1 w-44 bg-white border border-gray-200 rounded-xl shadow-lg z-10 py-1">
                {(Object.keys(STATUS_LABELS) as StatusFilter[]).map(k => (
                  <button key={k}
                    onClick={() => { setStatusFilter(k); setPage(1); setShowStatusMenu(false) }}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 ${statusFilter === k ? 'text-blue-600 font-medium' : 'text-gray-700'}`}>
                    {STATUS_LABELS[k]}
                  </button>
                ))}
              </div>
            )}
          </div>

          {hasFilters && (
            <button onClick={resetFilters}
              className="flex items-center gap-1 px-3 py-2 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50">
              <X size={14} /> Réinitialiser
            </button>
          )}
        </div>

        {/* Category pills */}
        {flatCats.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => { setSelectedCategoryId(''); setPage(1) }}
              className={`px-3 py-1 rounded-full text-sm border transition-colors ${selectedCategoryId === '' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'}`}>
              Toutes
            </button>
            {flatCats.map(c => (
              <button key={c.id}
                onClick={() => { setSelectedCategoryId(c.id); setPage(1) }}
                className={`px-3 py-1 rounded-full text-sm border transition-colors ${selectedCategoryId === c.id ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'}`}>
                {c.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Chargement...</div>
        ) : (data?.data ?? []).length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <Package size={40} className="mx-auto mb-3 opacity-30" />
            <p className="font-medium">Aucun article trouvé</p>
            {hasFilters && <button onClick={resetFilters} className="mt-2 text-blue-500 text-sm hover:underline">Réinitialiser les filtres</button>}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Code</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Désignation</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Catégorie</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Achat HT</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Vente TTC</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Marge</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Stock</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">TVA</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Statut</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {(data?.data ?? []).map((p: Product) => {
                const stock = p.stockLevel?.qty_on_hand ?? 0
                const htVente = p.sale_price_ttc / (1 + p.vat_rate / 100)
                const margin = p.purchase_price_ht > 0
                  ? Math.round(((htVente - p.purchase_price_ht) / p.purchase_price_ht) * 100)
                  : null

                return (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors group">
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{p.internal_code}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setViewProduct(p)}
                        className="text-left hover:text-blue-600 transition-colors">
                        <p className="font-medium text-gray-900">{p.name}</p>
                        {p.barcodes?.find(b => b.is_primary) && (
                          <p className="text-xs text-gray-400 font-mono">{p.barcodes.find(b => b.is_primary)?.barcode}</p>
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      {p.category && (
                        <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs">{p.category.name}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">{formatCurrency(p.purchase_price_ht)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">{formatCurrency(p.sale_price_ttc)}</td>
                    <td className="px-4 py-3 text-right">
                      {margin !== null && (
                        <span className={`text-xs font-medium ${margin >= 20 ? 'text-green-600' : margin >= 0 ? 'text-amber-600' : 'text-red-600'}`}>
                          {margin >= 0 ? '+' : ''}{margin}%
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={stock <= 0 ? 'text-red-600 font-semibold' : stock <= (p.alert_stock ?? 5) ? 'text-amber-600 font-semibold' : 'text-gray-700'}>
                        {formatNumber(stock, 0)} {p.unit?.abbreviation ?? ''}
                        {stock <= 0 && <AlertTriangle size={12} className="inline ml-1" />}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${p.vat_rate > 0 ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                        {p.vat_rate}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => toggleActive.mutate(p)} className="transition-colors">
                        {p.is_active
                          ? <ToggleRight className="text-green-500" size={22} />
                          : <ToggleLeft className="text-gray-300" size={22} />}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => setViewProduct(p)} title="Voir le détail"
                          className="text-gray-400 hover:text-blue-600 transition-colors">
                          <Eye size={15} />
                        </button>
                        <button onClick={() => { setEditProduct(p); setShowForm(true) }} title="Modifier"
                          className="text-gray-400 hover:text-blue-600 transition-colors">
                          <Edit2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        {data && data.last_page > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50">
            <p className="text-sm text-gray-500">
              Page {data.current_page} / {data.last_page} · {data.total} articles
            </p>
            <div className="flex gap-1">
              <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
                className="p-1.5 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-100">
                <ChevronLeft size={16} />
              </button>
              {Array.from({ length: Math.min(data.last_page, 7) }, (_, i) => {
                const p = i + 1
                return (
                  <button key={p} onClick={() => setPage(p)}
                    className={`px-3 py-1 rounded border text-sm ${page === p ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 hover:bg-gray-100'}`}>
                    {p}
                  </button>
                )
              })}
              <button disabled={page === data.last_page} onClick={() => setPage(p => p + 1)}
                className="p-1.5 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-100">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {showForm && (
        <ProductFormModal
          product={editProduct}
          onClose={() => { setShowForm(false); setEditProduct(undefined) }}
        />
      )}
      {viewProduct && !showForm && (
        <ProductDetailModal
          product={viewProduct}
          onClose={() => setViewProduct(undefined)}
          onEdit={() => { setEditProduct(viewProduct); setViewProduct(undefined); setShowForm(true) }}
        />
      )}
    </div>
  )
}
