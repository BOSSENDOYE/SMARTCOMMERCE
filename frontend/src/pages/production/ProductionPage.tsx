import { Fragment, useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import api from '../../lib/api'
import { formatCurrency, formatDate, formatDateTime, formatNumber } from '../../lib/format'
import {
  ChefHat, Plus, Search, Factory, Coins, BookOpen, Eye, XCircle,
  Trash2, AlertTriangle, Pencil, ChevronLeft, ChevronRight,
} from 'lucide-react'
import { useConfirm } from '../../hooks/useConfirm'
import AllocationModal, { type PendingOrder } from '../../components/distribution/AllocationModal'
import BakeryDayTab from './BakeryDayTab'

// ─── Types ───────────────────────────────────────────────────────────────────

interface RecipeCost {
  batch_cost: number
  unit_cost: number
  margin: number
  margin_rate: number | null
}

interface Recipe {
  id: number
  name: string
  internal_code?: string
  category?: string
  unit?: string
  sale_price_ttc: number
  recipe_yield: number
  ingredients_count: number
  stock: number
  cost: RecipeCost
}

interface Requirement {
  ingredient_id: number
  name: string
  unit?: string
  qty: number
  unit_cost: number
  total_cost: number
  available: number
  shortage: number
}

interface RecipeDetail {
  product: { id: number; name: string; internal_code?: string; sale_price_ttc: number; recipe_yield: number }
  lines: Requirement[]
  cost: RecipeCost
}

interface ProductionOrder {
  id: number
  reference: string
  product?: { id: number; name: string; internal_code?: string }
  user?: { id: number; name: string }
  canceller?: { id: number; name: string }
  batches: number
  qty_produced: number
  qty_allocated: number
  qty_pending: number
  unit_cost: number
  total_cost: number
  status: 'completed' | 'cancelled'
  notes?: string
  produced_at: string
  cancelled_at?: string
  lines?: { id: number; qty: number; unit_cost: number; total_cost: number; ingredient?: { id: number; name: string; unit?: { abbreviation: string } } }[]
}

interface ProductionStats {
  today_count: number
  today_qty: number
  today_cost: number
  month_cost: number
  recipes_count: number
  unsold_month_cost: number
  unsold_rate: number | null
}

interface SearchProduct {
  id: number
  name: string
  internal_code?: string
  purchase_price_ht: number
  unit?: { abbreviation: string }
  stock_level?: { avg_cost: number; qty_on_hand: number }
}

const STATUS_STYLES: Record<string, { label: string; cls: string }> = {
  completed: { label: 'Produite', cls: 'bg-green-100 text-green-700' },
  cancelled: { label: 'Annulée',  cls: 'bg-red-100 text-red-700' },
}

type ApiErr = { response?: { data?: { message?: string; errors?: Record<string, string[]> } } }

const apiError = (err: unknown): string => {
  const data = (err as ApiErr)?.response?.data
  if (data?.errors) return Object.values(data.errors).flat().join('\n')
  return data?.message ?? 'Une erreur est survenue'
}

const marginClass = (rate: number | null) =>
  rate === null ? 'text-gray-400' : rate < 20 ? 'text-red-600' : rate < 40 ? 'text-orange-600' : 'text-green-600'

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

// ─── Product search (ingrédients / produit fini) ─────────────────────────────

function ProductSearch({ placeholder, onSelect, exclude = [], kind }: {
  placeholder: string
  onSelect: (p: SearchProduct) => void
  exclude?: number[]
  kind?: 'finished' | 'raw_material'
}) {
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)

  const { data: suggestions } = useQuery({
    queryKey: ['product-search', search, kind],
    queryFn: () => api.get('/products', { params: { search, per_page: 8, kind } }).then(r => (r.data.data ?? []) as SearchProduct[]),
    enabled: search.length >= 2,
  })

  const list = (suggestions ?? []).filter(p => !exclude.includes(p.id))

  return (
    <div className="relative">
      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
      <input
        className="input pl-9 w-full"
        placeholder={placeholder}
        value={search}
        onChange={e => { setSearch(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
      />
      {open && list.length > 0 && (
        <div className="absolute z-10 bg-white border rounded-lg shadow-lg mt-1 w-full max-h-48 overflow-auto">
          {list.map(p => (
            <button
              key={p.id}
              type="button"
              className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b last:border-0"
              onClick={() => { onSelect(p); setSearch(''); setOpen(false) }}
            >
              <p className="font-medium text-sm text-gray-900">{p.name}</p>
              <p className="text-xs text-gray-400">
                {p.internal_code} · stock {formatNumber(p.stock_level?.qty_on_hand ?? 0, 2)} {p.unit?.abbreviation}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Recipe Editor Modal ─────────────────────────────────────────────────────

interface EditorLine { ingredient_id: number; name: string; unit?: string; quantity: string; unit_cost: number }

function RecipeEditorModal({ productId, productName, onClose }: {
  productId: number; productName: string; onClose: () => void
}) {
  const qc = useQueryClient()
  const [recipeYield, setRecipeYield] = useState('1')
  const [lines, setLines] = useState<EditorLine[]>([])
  const [salePrice, setSalePrice] = useState(0)

  const { data: detail, isLoading } = useQuery({
    queryKey: ['production-recipe', productId],
    queryFn: () => api.get(`/production/recipes/${productId}`).then(r => r.data as RecipeDetail),
  })

  useEffect(() => {
    if (!detail) return
    setRecipeYield(String(detail.product.recipe_yield ?? 1))
    setSalePrice(Number(detail.product.sale_price_ttc))
    setLines(detail.lines.map(l => ({
      ingredient_id: l.ingredient_id, name: l.name, unit: l.unit,
      quantity: String(l.qty), unit_cost: l.unit_cost,
    })))
  }, [detail])

  const { mutate: save, isPending } = useMutation({
    mutationFn: () => api.put(`/production/recipes/${productId}`, {
      recipe_yield: parseFloat(recipeYield),
      ingredients: lines.map(l => ({ ingredient_id: l.ingredient_id, quantity: parseFloat(l.quantity) })),
    }),
    onSuccess: () => {
      toast.success('Recette enregistrée')
      qc.invalidateQueries({ queryKey: ['production-recipes'] })
      qc.invalidateQueries({ queryKey: ['production-recipe', productId] })
      qc.invalidateQueries({ queryKey: ['production-stats'] })
      onClose()
    },
    onError: (err) => toast.error(apiError(err)),
  })

  const addIngredient = (p: SearchProduct) => setLines(prev => [...prev, {
    ingredient_id: p.id, name: p.name, unit: p.unit?.abbreviation, quantity: '',
    unit_cost: Number(p.stock_level?.avg_cost || p.purchase_price_ht || 0),
  }])

  const batchCost = lines.reduce((sum, l) => sum + (parseFloat(l.quantity) || 0) * l.unit_cost, 0)
  const yieldNum = parseFloat(recipeYield) || 0
  const unitCost = yieldNum > 0 ? batchCost / yieldNum : 0
  const marginRate = salePrice > 0 ? ((salePrice - unitCost) / salePrice) * 100 : null
  const valid = yieldNum > 0 && lines.every(l => parseFloat(l.quantity) > 0)

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Recette — {productName}</h2>
            <p className="text-xs text-gray-500">Quantités exprimées pour une fournée, dans l'unité de stock de chaque matière</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        {isLoading ? (
          <div className="p-10 text-center text-gray-400">Chargement…</div>
        ) : (
          <div className="p-5 space-y-4 overflow-auto">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Rendement d'une fournée *</label>
              <div className="flex items-center gap-2">
                <input
                  type="number" min="0.001" step="0.001" className="input w-40"
                  value={recipeYield} onChange={e => setRecipeYield(e.target.value)}
                />
                <span className="text-sm text-gray-500">unités de « {productName} » produites</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Matières premières</label>
              <ProductSearch
                placeholder="Ajouter une matière première (farine, beurre…)"
                kind="raw_material"
                onSelect={addIngredient}
                exclude={[productId, ...lines.map(l => l.ingredient_id)]}
              />
              <div className="mt-3 border rounded-lg divide-y">
                {lines.length === 0 && (
                  <p className="p-4 text-sm text-gray-400 text-center">Aucune matière première</p>
                )}
                {lines.map((l, i) => (
                  <div key={l.ingredient_id} className="flex items-center gap-3 px-3 py-2">
                    <span className="flex-1 text-sm font-medium text-gray-900">{l.name}</span>
                    <input
                      type="number" min="0.0001" step="0.0001" className="input w-28 text-right"
                      placeholder="0" value={l.quantity}
                      onChange={e => setLines(prev => prev.map((x, j) => j === i ? { ...x, quantity: e.target.value } : x))}
                    />
                    <span className="w-10 text-xs text-gray-500">{l.unit}</span>
                    <span className="w-24 text-right text-sm text-gray-600">
                      {formatCurrency((parseFloat(l.quantity) || 0) * l.unit_cost)}
                    </span>
                    <button
                      type="button" className="text-gray-400 hover:text-red-500"
                      onClick={() => setLines(prev => prev.filter((_, j) => j !== i))}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-gray-50 rounded-lg p-3 text-sm">
              <div><p className="text-xs text-gray-500">Coût / fournée</p><p className="font-semibold">{formatCurrency(batchCost)}</p></div>
              <div><p className="text-xs text-gray-500">Coût unitaire</p><p className="font-semibold">{formatCurrency(unitCost)}</p></div>
              <div><p className="text-xs text-gray-500">Prix de vente</p><p className="font-semibold">{formatCurrency(salePrice)}</p></div>
              <div>
                <p className="text-xs text-gray-500">Marge</p>
                <p className={`font-semibold ${marginClass(marginRate)}`}>{marginRate === null ? '—' : `${marginRate.toFixed(1)} %`}</p>
              </div>
            </div>
          </div>
        )}

        <div className="flex gap-3 p-5 border-t">
          <button type="button" onClick={onClose} className="flex-1 btn-secondary">Annuler</button>
          <button type="button" disabled={isPending || !valid} onClick={() => save()} className="flex-1 btn-primary">
            {isPending ? 'Enregistrement…' : 'Enregistrer la recette'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── New Production Modal ────────────────────────────────────────────────────

function NewProductionModal({ recipes, onClose, onProduced }: { recipes: Recipe[]; onClose: () => void; onProduced: (order: PendingOrder) => void }) {
  const qc = useQueryClient()
  const [productId, setProductId] = useState<number | ''>(recipes[0]?.id ?? '')
  const [batches, setBatches] = useState('1')
  const [notes, setNotes] = useState('')
  const [allowShortage, setAllowShortage] = useState(false)

  const batchesNum = parseFloat(batches) || 0
  const recipe = recipes.find(r => r.id === productId)

  const { data: preview, isFetching } = useQuery({
    queryKey: ['production-recipe', productId, batchesNum],
    queryFn: () => api.get(`/production/recipes/${productId}`, { params: { batches: batchesNum } }).then(r => r.data as RecipeDetail),
    enabled: !!productId && batchesNum > 0,
  })

  const shortages = (preview?.lines ?? []).filter(l => l.shortage > 0)
  const totalCost = (preview?.lines ?? []).reduce((s, l) => s + l.total_cost, 0)

  const { mutate: produce, isPending } = useMutation({
    mutationFn: () => api.post('/production/orders', {
      product_id: productId, batches: batchesNum, notes: notes || undefined, allow_shortage: allowShortage,
    }),
    onSuccess: (res) => {
      toast.success('Production enregistrée — à répartir entre le point de vente et les livreurs')
      qc.invalidateQueries({ queryKey: ['production-orders'] })
      qc.invalidateQueries({ queryKey: ['production-stats'] })
      qc.invalidateQueries({ queryKey: ['production-recipes'] })
      qc.invalidateQueries({ queryKey: ['production-recipe'] })
      qc.invalidateQueries({ queryKey: ['distribution-pending'] })
      onProduced(res.data as PendingOrder)
    },
    onError: (err) => toast.error(apiError(err)),
  })

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-lg font-bold text-gray-900">Nouvelle production</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        <div className="p-5 space-y-4 overflow-auto">
          {recipes.length === 0 ? (
            <p className="text-sm text-gray-500">Aucune recette. Créez d'abord une recette dans l'onglet « Recettes ».</p>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Produit fini *</label>
                  <select className="input w-full" value={productId} onChange={e => setProductId(Number(e.target.value))}>
                    {recipes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nombre de fournées *</label>
                  <input
                    type="number" min="0.001" step="0.5" className="input w-full"
                    value={batches} onChange={e => setBatches(e.target.value)}
                  />
                </div>
              </div>

              {recipe && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm">
                  <span className="text-amber-800">Quantité produite : </span>
                  <span className="font-bold text-amber-900">
                    {formatNumber(batchesNum * recipe.recipe_yield, 2)} {recipe.unit}
                  </span>
                  <span className="text-amber-700"> ({formatNumber(recipe.recipe_yield, 2)} par fournée)</span>
                </div>
              )}

              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">
                  Matières premières consommées {isFetching && <span className="text-xs text-gray-400">(calcul…)</span>}
                </p>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                      <tr>
                        <th className="text-left px-3 py-2">Matière</th>
                        <th className="text-right px-3 py-2">Besoin</th>
                        <th className="text-right px-3 py-2">Stock</th>
                        <th className="text-right px-3 py-2">Coût</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {(preview?.lines ?? []).map(l => (
                        <tr key={l.ingredient_id} className={l.shortage > 0 ? 'bg-red-50' : ''}>
                          <td className="px-3 py-2">{l.name}</td>
                          <td className="px-3 py-2 text-right">{formatNumber(l.qty, 3)} {l.unit}</td>
                          <td className={`px-3 py-2 text-right ${l.shortage > 0 ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                            {formatNumber(l.available, 3)}
                          </td>
                          <td className="px-3 py-2 text-right">{formatCurrency(l.total_cost)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-50 font-semibold">
                      <tr>
                        <td className="px-3 py-2" colSpan={3}>Coût total de la production</td>
                        <td className="px-3 py-2 text-right">{formatCurrency(totalCost)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {shortages.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 space-y-2">
                  <p className="flex items-center gap-2 font-semibold"><AlertTriangle size={16} /> Stock insuffisant</p>
                  <ul className="list-disc pl-5">
                    {shortages.map(s => <li key={s.ingredient_id}>{s.name} : manque {formatNumber(s.shortage, 3)} {s.unit}</li>)}
                  </ul>
                  <label className="flex items-center gap-2 text-red-800">
                    <input type="checkbox" checked={allowShortage} onChange={e => setAllowShortage(e.target.checked)} />
                    Produire quand même (le stock de ces matières passera en négatif)
                  </label>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  className="input w-full" rows={2} placeholder="Ex. fournée du matin"
                  value={notes} onChange={e => setNotes(e.target.value)}
                />
              </div>
            </>
          )}
        </div>

        <div className="flex gap-3 p-5 border-t">
          <button type="button" onClick={onClose} className="flex-1 btn-secondary">Annuler</button>
          <button
            type="button"
            disabled={isPending || !productId || batchesNum <= 0 || (shortages.length > 0 && !allowShortage)}
            onClick={() => produce()}
            className="flex-1 btn-primary"
          >
            {isPending ? 'Enregistrement…' : 'Valider la production'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Production Detail Modal ─────────────────────────────────────────────────

function ProductionDetailModal({ id, onClose }: { id: number; onClose: () => void }) {
  const { data: order, isLoading } = useQuery({
    queryKey: ['production-order', id],
    queryFn: () => api.get(`/production/orders/${id}`).then(r => r.data as ProductionOrder),
  })

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-lg font-bold text-gray-900">Production {order?.reference}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>
        {isLoading || !order ? (
          <div className="p-10 text-center text-gray-400">Chargement…</div>
        ) : (
          <div className="p-5 space-y-4 overflow-auto text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div><p className="text-xs text-gray-500">Produit</p><p className="font-semibold">{order.product?.name}</p></div>
              <div><p className="text-xs text-gray-500">Date</p><p>{formatDateTime(order.produced_at)}</p></div>
              <div><p className="text-xs text-gray-500">Fournées / Quantité</p><p>{formatNumber(order.batches, 2)} → <b>{formatNumber(order.qty_produced, 2)}</b></p></div>
              <div><p className="text-xs text-gray-500">Coût total / unitaire</p><p>{formatCurrency(order.total_cost)} / {formatCurrency(order.unit_cost)}</p></div>
              <div><p className="text-xs text-gray-500">Par</p><p>{order.user?.name ?? '—'}</p></div>
              <div>
                <p className="text-xs text-gray-500">Statut</p>
                <span className={`badge ${STATUS_STYLES[order.status]?.cls}`}>{STATUS_STYLES[order.status]?.label}</span>
                {order.status === 'cancelled' && (
                  <p className="text-xs text-gray-400 mt-1">par {order.canceller?.name} le {formatDateTime(order.cancelled_at)}</p>
                )}
              </div>
            </div>
            {order.notes && <p className="bg-gray-50 rounded-lg p-3 text-gray-600">{order.notes}</p>}
            <table className="w-full border rounded-lg overflow-hidden">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                <tr>
                  <th className="text-left px-3 py-2">Matière consommée</th>
                  <th className="text-right px-3 py-2">Quantité</th>
                  <th className="text-right px-3 py-2">Coût</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {(order.lines ?? []).map(l => (
                  <tr key={l.id}>
                    <td className="px-3 py-2">{l.ingredient?.name}</td>
                    <td className="px-3 py-2 text-right">{formatNumber(l.qty, 3)} {l.ingredient?.unit?.abbreviation}</td>
                    <td className="px-3 py-2 text-right">{formatCurrency(l.total_cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Productions Tab ─────────────────────────────────────────────────────────

function ProductionsTab({ recipes }: { recipes: Recipe[] }) {
  const qc = useQueryClient()
  const confirm = useConfirm()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [detailId, setDetailId] = useState<number | null>(null)
  const [allocating, setAllocating] = useState<PendingOrder | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['production-orders', page, search, status],
    queryFn: () => api.get('/production/orders', { params: { page, search: search || undefined, status: status || undefined } }).then(r => r.data),
  })

  const { mutate: cancel } = useMutation({
    mutationFn: (id: number) => api.post(`/production/orders/${id}/cancel`),
    onSuccess: () => {
      toast.success('Production annulée — stocks restaurés')
      qc.invalidateQueries({ queryKey: ['production-orders'] })
      qc.invalidateQueries({ queryKey: ['production-stats'] })
      qc.invalidateQueries({ queryKey: ['production-recipes'] })
    },
    onError: (err) => toast.error(apiError(err)),
  })

  const orders: ProductionOrder[] = data?.data ?? []

  return (
    <>
      <div className="card p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="input pl-9 w-full" placeholder="Référence ou produit…"
            value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
          />
        </div>
        <select className="input w-40" value={status} onChange={e => { setStatus(e.target.value); setPage(1) }}>
          <option value="">Tous statuts</option>
          <option value="completed">Produites</option>
          <option value="cancelled">Annulées</option>
        </select>
        <button onClick={() => setShowNew(true)} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> Nouvelle production
        </button>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
            <tr>
              <th className="text-left px-4 py-3">Référence</th>
              <th className="text-left px-4 py-3">Date</th>
              <th className="text-left px-4 py-3">Produit</th>
              <th className="text-right px-4 py-3">Fournées</th>
              <th className="text-right px-4 py-3">Produit</th>
              <th className="text-right px-4 py-3">Coût</th>
              <th className="text-left px-4 py-3">Par</th>
              <th className="text-left px-4 py-3">Statut</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading && (
              <tr><td colSpan={9} className="text-center py-10 text-gray-400">Chargement…</td></tr>
            )}
            {!isLoading && orders.length === 0 && (
              <tr><td colSpan={9} className="text-center py-10 text-gray-400">Aucune production</td></tr>
            )}
            {orders.map(o => (
              <tr key={o.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-xs">{o.reference}</td>
                <td className="px-4 py-3 text-gray-500">{formatDateTime(o.produced_at)}</td>
                <td className="px-4 py-3 font-medium text-gray-900">{o.product?.name}</td>
                <td className="px-4 py-3 text-right">{formatNumber(o.batches, 2)}</td>
                <td className="px-4 py-3 text-right">
                  <p className="font-semibold">{formatNumber(o.qty_produced, 2)}</p>
                  {o.status === 'completed' && o.qty_pending > 0 && (
                    <p className="text-xs text-amber-700">{formatNumber(o.qty_pending)} à répartir</p>
                  )}
                </td>
                <td className="px-4 py-3 text-right">{formatCurrency(o.total_cost)}</td>
                <td className="px-4 py-3 text-gray-500">{o.user?.name ?? '—'}</td>
                <td className="px-4 py-3">
                  <span className={`badge ${STATUS_STYLES[o.status]?.cls}`}>{STATUS_STYLES[o.status]?.label}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2 justify-end">
                    {o.status === 'completed' && o.qty_pending > 0 && (
                      <button className="btn-primary text-xs px-2 py-1" onClick={() => setAllocating(o as PendingOrder)}>Répartir</button>
                    )}
                    <button title="Détail" className="text-gray-400 hover:text-blue-600" onClick={() => setDetailId(o.id)}>
                      <Eye size={16} />
                    </button>
                    {o.status === 'completed' && (
                      <button
                        title="Annuler la production" className="text-gray-400 hover:text-red-600"
                        onClick={async () => {
                          if (await confirm(`Annuler ${o.reference} ? La part mise au point de vente sera retirée du stock et les matières premières restituées.`, { danger: true })) cancel(o.id)
                        }}
                      >
                        <XCircle size={16} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {data && data.last_page > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t text-sm text-gray-500">
            <span>{data.total} productions</span>
            <div className="flex items-center gap-2">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="btn-secondary px-2 py-1"><ChevronLeft size={16} /></button>
              <span>{page} / {data.last_page}</span>
              <button disabled={page >= data.last_page} onClick={() => setPage(p => p + 1)} className="btn-secondary px-2 py-1"><ChevronRight size={16} /></button>
            </div>
          </div>
        )}
      </div>

      {showNew && <NewProductionModal recipes={recipes} onClose={() => setShowNew(false)} onProduced={o => { setShowNew(false); setAllocating(o) }} />}
      {allocating && <AllocationModal order={allocating} onClose={() => setAllocating(null)} />}
      {detailId && <ProductionDetailModal id={detailId} onClose={() => setDetailId(null)} />}
    </>
  )
}

// ─── Recipes Tab ─────────────────────────────────────────────────────────────

function NewRecipeModal({ exclude, onPicked, onClose }: {
  exclude: number[]
  onPicked: (p: { id: number; name: string }) => void
  onClose: () => void
}) {
  const [mode, setMode] = useState<'existing' | 'new'>('existing')
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')

  const { mutate: create, isPending } = useMutation({
    mutationFn: () => api.post('/products', {
      name, sale_price_ttc: parseFloat(price) || 0, purchase_price_ht: 0, vat_rate: 0,
    }).then(r => (r.data?.id ? r.data : r.data?.product) as { id: number; name: string }),
    onSuccess: (p) => { toast.success('Produit créé'); onPicked({ id: p.id, name: p.name }) },
    onError: (err) => toast.error(apiError(err)),
  })

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-lg font-bold text-gray-900">Nouvelle recette</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {([['existing', 'Produit existant'], ['new', 'Nouveau produit']] as const).map(([k, label]) => (
              <button
                key={k} type="button" onClick={() => setMode(k)}
                className={`px-3 py-2 rounded-lg border text-sm font-medium ${mode === k ? 'border-primary bg-primary/10 text-primary' : 'border-gray-200 text-gray-600'}`}
              >
                {label}
              </button>
            ))}
          </div>

          {mode === 'existing' ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Produit fini à fabriquer</label>
              <ProductSearch placeholder="Rechercher (baguette, croissant…)" kind="finished" exclude={exclude} onSelect={p => onPicked({ id: p.id, name: p.name })} />
              <p className="text-xs text-gray-400 mt-2">Les produits ayant déjà une recette sont exclus.</p>
            </div>
          ) : (
            <form className="space-y-3" onSubmit={e => { e.preventDefault(); create() }}>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nom du produit *</label>
                <input className="input w-full" placeholder="Ex. Pain aux céréales" value={name} onChange={e => setName(e.target.value)} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Prix de vente TTC *</label>
                <input type="number" min="0" className="input w-full" placeholder="0" value={price} onChange={e => setPrice(e.target.value)} required />
              </div>
              <button type="submit" disabled={isPending || !name || !price} className="btn-primary w-full">
                {isPending ? 'Création…' : 'Créer et définir la recette'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

function RecipesTab({ recipes, isLoading }: { recipes: Recipe[]; isLoading: boolean }) {
  const [editing, setEditing] = useState<{ id: number; name: string } | null>(null)
  const [picking, setPicking] = useState(false)
  const [search, setSearch] = useState('')

  const filtered = recipes.filter(r => r.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <>
      <div className="card p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="input pl-9 w-full" placeholder="Filtrer les recettes…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <button onClick={() => setPicking(true)} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> Nouvelle recette
        </button>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
            <tr>
              <th className="text-left px-4 py-3">Produit fini</th>
              <th className="text-right px-4 py-3">Rendement</th>
              <th className="text-right px-4 py-3">Matières</th>
              <th className="text-right px-4 py-3">Coût / fournée</th>
              <th className="text-right px-4 py-3">Coût unitaire</th>
              <th className="text-right px-4 py-3">Prix de vente</th>
              <th className="text-right px-4 py-3">Marge</th>
              <th className="text-right px-4 py-3">Stock</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading && (
              <tr><td colSpan={9} className="text-center py-10 text-gray-400">Chargement…</td></tr>
            )}
            {!isLoading && filtered.length === 0 && (
              <tr><td colSpan={9} className="text-center py-10 text-gray-400">Aucune recette</td></tr>
            )}
            {filtered.map(r => (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-900">{r.name}</p>
                  <p className="text-xs text-gray-400">{r.category}</p>
                </td>
                <td className="px-4 py-3 text-right">{formatNumber(r.recipe_yield, 2)} {r.unit}</td>
                <td className="px-4 py-3 text-right">{r.ingredients_count}</td>
                <td className="px-4 py-3 text-right">{formatCurrency(r.cost.batch_cost)}</td>
                <td className="px-4 py-3 text-right font-semibold">{formatCurrency(r.cost.unit_cost)}</td>
                <td className="px-4 py-3 text-right">{formatCurrency(r.sale_price_ttc)}</td>
                <td className={`px-4 py-3 text-right font-semibold ${marginClass(r.cost.margin_rate)}`}>
                  {r.cost.margin_rate === null ? '—' : `${r.cost.margin_rate.toFixed(1)} %`}
                </td>
                <td className="px-4 py-3 text-right">{formatNumber(r.stock, 2)}</td>
                <td className="px-4 py-3 text-right">
                  <button title="Modifier la recette" className="text-gray-400 hover:text-blue-600" onClick={() => setEditing({ id: r.id, name: r.name })}>
                    <Pencil size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {picking && (
        <NewRecipeModal
          exclude={recipes.map(r => r.id)}
          onPicked={p => { setPicking(false); setEditing(p) }}
          onClose={() => setPicking(false)}
        />
      )}
      {editing && <RecipeEditorModal productId={editing.id} productName={editing.name} onClose={() => setEditing(null)} />}
    </>
  )
}

// ─── Planning Tab ────────────────────────────────────────────────────────────

interface PlanLine {
  product_id: number
  name: string
  unit?: string
  recipe_yield: number
  stock: number
  avg_same_weekday: number
  avg_7_days: number
  orders_qty: number
  suggested_qty: number
  suggested_batches: number
  plan: { id: number; planned_batches: number; planned_qty: number; production_order?: { id: number; reference: string; status: string } | null } | null
}

interface PlanMaterial { ingredient_id: number; name: string; unit?: string; qty: number; available: number; shortage: number; total_cost: number }

const isoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

function PlanningTab() {
  const qc = useQueryClient()
  const confirm = useConfirm()
  const [date, setDate] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 1); return isoDate(d) })
  const [allocating, setAllocating] = useState<PendingOrder | null>(null)
  const [draft, setDraft] = useState<Record<number, string>>({})

  const { data, isLoading } = useQuery({
    queryKey: ['production-plan', date],
    queryFn: () => api.get('/production/plan', { params: { date } }).then(r => r.data as { date: string; lines: PlanLine[]; materials: PlanMaterial[] }),
  })

  useEffect(() => {
    if (!data) return
    setDraft(Object.fromEntries(data.lines.map(l => [l.product_id, l.plan ? String(l.plan.planned_batches) : ''])))
  }, [data])

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['production-plan'] })
    qc.invalidateQueries({ queryKey: ['production-orders'] })
    qc.invalidateQueries({ queryKey: ['production-stats'] })
    qc.invalidateQueries({ queryKey: ['production-recipes'] })
  }

  const { mutate: savePlan, isPending: saving } = useMutation({
    mutationFn: () => api.put('/production/plan', {
      date,
      lines: (data?.lines ?? [])
        .filter(l => !l.plan?.production_order)
        .map(l => ({ product_id: l.product_id, planned_batches: parseFloat(draft[l.product_id] ?? '') || 0 })),
    }),
    onSuccess: () => { toast.success('Plan enregistré'); refresh() },
    onError: (err) => toast.error(apiError(err)),
  })

  const { mutate: execute } = useMutation({
    mutationFn: ({ id, allowShortage }: { id: number; allowShortage: boolean }) =>
      api.post(`/production/plan/${id}/execute`, { allow_shortage: allowShortage }),
    onSuccess: (res) => { toast.success('Production lancée — à répartir'); refresh(); setAllocating(res.data as PendingOrder) },
    onError: async (err: unknown, vars) => {
      const shortages = (err as ApiErr)?.response?.data?.errors?.shortages
      if (shortages && !vars.allowShortage) {
        if (await confirm(`Stock insuffisant :\n${shortages.join('\n')}\n\nProduire quand même ?`, { danger: true })) {
          execute({ id: vars.id, allowShortage: true })
        }
        return
      }
      toast.error(apiError(err))
    },
  })

  const applySuggestions = () =>
    setDraft(prev => Object.fromEntries((data?.lines ?? []).map(l => [
      l.product_id, l.plan?.production_order ? prev[l.product_id] : (l.suggested_batches ? String(l.suggested_batches) : ''),
    ])))

  const lines = data?.lines ?? []
  const materials = data?.materials ?? []
  const savedDirty = lines.some(l => !l.plan?.production_order && (parseFloat(draft[l.product_id] ?? '') || 0) !== (l.plan?.planned_batches ?? 0))

  return (
    <>
      <div className="card p-4 flex flex-wrap items-center gap-3">
        <label className="text-sm font-medium text-gray-700">Plan du</label>
        <input type="date" className="input w-44" value={date} onChange={e => setDate(e.target.value)} />
        <div className="flex-1" />
        <button onClick={applySuggestions} className="btn-secondary">Appliquer les suggestions</button>
        <button onClick={() => savePlan()} disabled={saving || !savedDirty} className="btn-primary">
          {saving ? 'Enregistrement…' : 'Enregistrer le plan'}
        </button>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
            <tr>
              <th className="text-left px-4 py-3">Produit</th>
              <th className="text-right px-4 py-3" title="Moyenne des 4 derniers mêmes jours de semaine">Ventes même jour</th>
              <th className="text-right px-4 py-3">Moy. 7 jours</th>
              <th className="text-right px-4 py-3">Commandes</th>
              <th className="text-right px-4 py-3">Suggéré</th>
              <th className="text-right px-4 py-3">Fournées prévues</th>
              <th className="text-right px-4 py-3">Quantité</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading && <tr><td colSpan={8} className="text-center py-10 text-gray-400">Chargement…</td></tr>}
            {!isLoading && lines.length === 0 && (
              <tr><td colSpan={8} className="text-center py-10 text-gray-400">Aucune recette — créez-en dans l'onglet « Recettes »</td></tr>
            )}
            {lines.map(l => {
              const done = l.plan?.production_order
              const batches = parseFloat(draft[l.product_id] ?? '') || 0
              return (
                <tr key={l.product_id} className={done ? 'bg-green-50/50' : 'hover:bg-gray-50'}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{l.name}</p>
                    <p className="text-xs text-gray-400">{formatNumber(l.recipe_yield, 2)} {l.unit} / fournée · stock {formatNumber(l.stock, 0)}</p>
                  </td>
                  <td className="px-4 py-3 text-right">{formatNumber(l.avg_same_weekday, 1)}</td>
                  <td className="px-4 py-3 text-right text-gray-500">{formatNumber(l.avg_7_days, 1)}</td>
                  <td className="px-4 py-3 text-right">{l.orders_qty > 0 ? <span className="badge bg-purple-100 text-purple-700">+{formatNumber(l.orders_qty, 0)}</span> : '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <p className="font-semibold">{formatNumber(l.suggested_batches, 1)} f.</p>
                    <p className="text-xs text-gray-400">{formatNumber(l.suggested_qty, 0)} {l.unit}</p>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <input
                      type="number" min="0" step="0.5" disabled={!!done}
                      className="input w-24 text-right"
                      value={draft[l.product_id] ?? ''}
                      placeholder="0"
                      onChange={e => setDraft(prev => ({ ...prev, [l.product_id]: e.target.value }))}
                    />
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">{formatNumber(batches * l.recipe_yield, 0)}</td>
                  <td className="px-4 py-3 text-right">
                    {done ? (
                      <span className="badge bg-green-100 text-green-700">{done.reference}</span>
                    ) : l.plan ? (
                      <button
                        className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1 ml-auto"
                        disabled={savedDirty}
                        title={savedDirty ? 'Enregistrez le plan avant de lancer' : 'Lancer cette production'}
                        onClick={() => execute({ id: l.plan!.id, allowShortage: false })}
                      >
                        <Factory size={14} /> Produire
                      </button>
                    ) : null}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="card p-4">
        <h3 className="font-semibold text-gray-900 mb-1">Matières premières à prévoir</h3>
        <p className="text-xs text-gray-500 mb-3">Pour les lignes du plan enregistré qui ne sont pas encore produites</p>
        {materials.length === 0 ? (
          <p className="text-sm text-gray-400">Aucun besoin — enregistrez un plan.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-gray-500 uppercase">
              <tr>
                <th className="text-left py-2">Matière</th>
                <th className="text-right py-2">Besoin</th>
                <th className="text-right py-2">En stock</th>
                <th className="text-right py-2">À acheter</th>
                <th className="text-right py-2">Coût</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {materials.map(m => (
                <tr key={m.ingredient_id} className={m.shortage > 0 ? 'bg-red-50' : ''}>
                  <td className="py-2">{m.name}</td>
                  <td className="py-2 text-right">{formatNumber(m.qty, 3)} {m.unit}</td>
                  <td className="py-2 text-right text-gray-500">{formatNumber(m.available, 3)}</td>
                  <td className={`py-2 text-right ${m.shortage > 0 ? 'text-red-600 font-semibold' : 'text-gray-400'}`}>
                    {m.shortage > 0 ? `${formatNumber(m.shortage, 3)} ${m.unit ?? ''}` : '—'}
                  </td>
                  <td className="py-2 text-right">{formatCurrency(m.total_cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {allocating && <AllocationModal order={allocating} onClose={() => setAllocating(null)} />}
    </>
  )
}

// ─── Unsold Tab ──────────────────────────────────────────────────────────────

const UNSOLD_DESTINATIONS: Record<string, { label: string; cls: string }> = {
  waste:    { label: 'Jeté',        cls: 'bg-red-100 text-red-700' },
  donation: { label: 'Don',         cls: 'bg-blue-100 text-blue-700' },
  staff:    { label: 'Personnel',   cls: 'bg-gray-100 text-gray-700' },
  recycle:  { label: 'Recyclé',     cls: 'bg-green-100 text-green-700' },
}

interface UnsoldReport {
  id: number
  reference: string
  report_date: string
  total_cost: number
  notes?: string
  user?: { name: string }
  lines: { id: number; qty: number; destination: string; total_cost: number; target_qty?: number; product?: { name: string }; target_product?: { name: string } }[]
}

interface UnsoldDraftLine { product_id: number; name: string; unit?: string; stock: number; unit_cost: number; qty: string; destination: string; target_product_id?: number; target_name?: string; target_qty: string }

function UnsoldModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [date, setDate] = useState(() => isoDate(new Date()))
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<UnsoldDraftLine[]>([])

  const { data: prefill, isLoading } = useQuery({
    queryKey: ['unsold-prefill'],
    queryFn: () => api.get('/production/unsold/prefill').then(r => r.data as { product_id: number; name: string; unit?: string; stock: number; unit_cost: number }[]),
  })

  useEffect(() => {
    if (prefill) setLines(prefill.map(p => ({ ...p, qty: '', destination: 'waste', target_qty: '' })))
  }, [prefill])

  const update = (i: number, patch: Partial<UnsoldDraftLine>) => setLines(prev => prev.map((l, j) => j === i ? { ...l, ...patch } : l))
  const filled = lines.filter(l => parseFloat(l.qty) > 0)
  const total = filled.reduce((s, l) => s + parseFloat(l.qty) * l.unit_cost, 0)

  const { mutate: save, isPending } = useMutation({
    mutationFn: () => api.post('/production/unsold', {
      date, notes: notes || undefined,
      lines: filled.map(l => ({
        product_id: l.product_id, qty: parseFloat(l.qty), destination: l.destination,
        ...(l.destination === 'recycle' && l.target_product_id && parseFloat(l.target_qty) > 0
          ? { target_product_id: l.target_product_id, target_qty: parseFloat(l.target_qty) } : {}),
      })),
    }),
    onSuccess: () => {
      toast.success('Invendus enregistrés — stock mis à jour')
      qc.invalidateQueries({ queryKey: ['unsold-reports'] })
      qc.invalidateQueries({ queryKey: ['unsold-prefill'] })
      qc.invalidateQueries({ queryKey: ['production-stats'] })
      qc.invalidateQueries({ queryKey: ['production-recipes'] })
      onClose()
    },
    onError: (err) => toast.error(apiError(err)),
  })

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Clôture des invendus</h2>
            <p className="text-xs text-gray-500">Saisissez les quantités restantes en fin de journée</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>
        <div className="p-5 space-y-4 overflow-auto">
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-gray-700">Journée du</label>
            <input type="date" className="input w-44" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          {isLoading ? (
            <p className="text-center text-gray-400 py-6">Chargement…</p>
          ) : lines.length === 0 ? (
            <p className="text-center text-gray-400 py-6">Aucun produit fini en stock.</p>
          ) : (
            <div className="border rounded-lg divide-y">
              {lines.map((l, i) => (
                <div key={l.product_id} className="px-3 py-2 space-y-2">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex-1 min-w-[140px]">
                      <p className="text-sm font-medium text-gray-900">{l.name}</p>
                      <p className="text-xs text-gray-400">en stock : {formatNumber(l.stock, 0)} {l.unit}</p>
                    </div>
                    <input
                      type="number" min="0" step="1" className="input w-24 text-right" placeholder="0"
                      value={l.qty} onChange={e => update(i, { qty: e.target.value })}
                    />
                    <select className="input w-32" value={l.destination} onChange={e => update(i, { destination: e.target.value })}>
                      {Object.entries(UNSOLD_DESTINATIONS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                    <span className="w-24 text-right text-sm text-gray-600">{formatCurrency((parseFloat(l.qty) || 0) * l.unit_cost)}</span>
                  </div>
                  {l.destination === 'recycle' && (
                    <div className="flex flex-wrap items-center gap-2 pl-4 text-sm">
                      <span className="text-gray-500">→ transformé en</span>
                      {l.target_product_id ? (
                        <button type="button" className="badge bg-green-100 text-green-700" onClick={() => update(i, { target_product_id: undefined, target_name: undefined })}>
                          {l.target_name} ×
                        </button>
                      ) : (
                        <div className="w-60">
                          <ProductSearch placeholder="Produit obtenu (ex. chapelure)" kind="finished" exclude={[l.product_id]} onSelect={p => update(i, { target_product_id: p.id, target_name: p.name })} />
                        </div>
                      )}
                      <input
                        type="number" min="0" step="0.1" className="input w-24 text-right" placeholder="Qté"
                        value={l.target_qty} onChange={e => update(i, { target_qty: e.target.value })}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          <textarea className="input w-full" rows={2} placeholder="Notes" value={notes} onChange={e => setNotes(e.target.value)} />
        </div>
        <div className="flex items-center gap-3 p-5 border-t">
          <p className="flex-1 text-sm text-gray-600">Coût des invendus : <b>{formatCurrency(total)}</b></p>
          <button type="button" onClick={onClose} className="btn-secondary">Annuler</button>
          <button type="button" disabled={isPending || filled.length === 0} onClick={() => save()} className="btn-primary">
            {isPending ? 'Enregistrement…' : 'Valider la clôture'}
          </button>
        </div>
      </div>
    </div>
  )
}

function UnsoldTab() {
  const [page, setPage] = useState(1)
  const [showNew, setShowNew] = useState(false)
  const [expanded, setExpanded] = useState<number | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['unsold-reports', page],
    queryFn: () => api.get('/production/unsold', { params: { page } }).then(r => r.data),
  })
  const reports: UnsoldReport[] = data?.data ?? []

  return (
    <>
      <div className="card p-4 flex items-center gap-3">
        <p className="flex-1 text-sm text-gray-500">Chaque soir, enregistrez les produits non vendus : ils sortent du stock et leur coût est suivi.</p>
        <button onClick={() => setShowNew(true)} className="btn-primary flex items-center gap-2"><Plus size={16} /> Clôturer les invendus</button>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
            <tr>
              <th className="text-left px-4 py-3">Référence</th>
              <th className="text-left px-4 py-3">Journée</th>
              <th className="text-left px-4 py-3">Produits</th>
              <th className="text-right px-4 py-3">Coût</th>
              <th className="text-left px-4 py-3">Par</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading && <tr><td colSpan={5} className="text-center py-10 text-gray-400">Chargement…</td></tr>}
            {!isLoading && reports.length === 0 && <tr><td colSpan={5} className="text-center py-10 text-gray-400">Aucune clôture d'invendus</td></tr>}
            {reports.map(r => (
              <Fragment key={r.id}>
                <tr className="hover:bg-gray-50 cursor-pointer" onClick={() => setExpanded(expanded === r.id ? null : r.id)}>
                  <td className="px-4 py-3 font-mono text-xs">{r.reference}</td>
                  <td className="px-4 py-3">{formatDate(r.report_date)}</td>
                  <td className="px-4 py-3 text-gray-600">{r.lines.length} produit(s)</td>
                  <td className="px-4 py-3 text-right font-semibold text-red-600">{formatCurrency(r.total_cost)}</td>
                  <td className="px-4 py-3 text-gray-500">{r.user?.name ?? '—'}</td>
                </tr>
                {expanded === r.id && (
                  <tr className="bg-gray-50">
                    <td colSpan={5} className="px-6 py-3">
                      <div className="space-y-1">
                        {r.lines.map(l => (
                          <div key={l.id} className="flex items-center gap-3 text-sm">
                            <span className="flex-1">{l.product?.name} × {formatNumber(l.qty, 0)}</span>
                            <span className={`badge ${UNSOLD_DESTINATIONS[l.destination]?.cls}`}>{UNSOLD_DESTINATIONS[l.destination]?.label}</span>
                            {l.target_product && <span className="text-xs text-gray-500">→ {formatNumber(l.target_qty, 2)} {l.target_product.name}</span>}
                            <span className="w-24 text-right">{formatCurrency(l.total_cost)}</span>
                          </div>
                        ))}
                        {r.notes && <p className="text-xs text-gray-500 pt-1">{r.notes}</p>}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
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

      {showNew && <UnsoldModal onClose={() => setShowNew(false)} />}
    </>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

type ProductionTab = 'day' | 'plan' | 'orders' | 'recipes' | 'unsold'
const PRODUCTION_TABS: ProductionTab[] = ['day', 'plan', 'orders', 'recipes', 'unsold']

export default function ProductionPage() {
  // Onglet porté par l'URL (/production/:tab) : chaque onglet a son entrée dans le menu
  const params = useParams<{ tab: string }>()
  const navigate = useNavigate()
  const tab: ProductionTab = PRODUCTION_TABS.includes(params.tab as ProductionTab) ? params.tab as ProductionTab : 'plan'
  const setTab = (t: ProductionTab) => navigate(`/production/${t}`)

  const { data: stats } = useQuery({
    queryKey: ['production-stats'],
    queryFn: () => api.get('/production/stats').then(r => r.data as ProductionStats),
  })

  const { data: recipes = [], isLoading: recipesLoading } = useQuery({
    queryKey: ['production-recipes'],
    queryFn: () => api.get('/production/recipes').then(r => r.data as Recipe[]),
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-amber-100 rounded-xl"><ChefHat className="text-amber-700" size={24} /></div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Production</h1>
          <p className="text-sm text-gray-500">Planning, fournées, recettes et invendus</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Productions du jour" value={formatNumber(stats?.today_count ?? 0)} sub={`${formatNumber(stats?.today_qty ?? 0)} unités produites`} icon={<Factory size={20} className="text-amber-700" />} color="bg-amber-100" />
        <StatCard label="Coût du jour" value={formatCurrency(stats?.today_cost ?? 0)} icon={<Coins size={20} className="text-orange-700" />} color="bg-orange-100" />
        <StatCard label="Coût production du mois" value={formatCurrency(stats?.month_cost ?? 0)} sub={`${formatNumber(stats?.recipes_count ?? 0)} recettes`} icon={<BookOpen size={20} className="text-blue-700" />} color="bg-blue-100" />
        <StatCard
          label="Invendus du mois"
          value={formatCurrency(stats?.unsold_month_cost ?? 0)}
          sub={stats?.unsold_rate != null ? `${stats.unsold_rate.toFixed(1)} % de la production` : undefined}
          icon={<Trash2 size={20} className="text-red-700" />} color="bg-red-100"
        />
      </div>

      <div className="flex gap-2 border-b">
        {([['day', 'Bilan du jour'], ['plan', 'Planning'], ['orders', 'Productions'], ['recipes', 'Recettes'], ['unsold', 'Invendus']] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              tab === key ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'day' && <BakeryDayTab />}
      {tab === 'plan' && <PlanningTab />}
      {tab === 'orders' && <ProductionsTab recipes={recipes} />}
      {tab === 'recipes' && <RecipesTab recipes={recipes} isLoading={recipesLoading} />}
      {tab === 'unsold' && <UnsoldTab />}
    </div>
  )
}
