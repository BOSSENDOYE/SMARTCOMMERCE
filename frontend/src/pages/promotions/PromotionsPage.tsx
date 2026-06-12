import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../lib/api'
import { formatCurrency } from '../../lib/format'
import toast from 'react-hot-toast'
import {
  Percent, Plus, X, Check, Edit2, Eye, Trash2,
  Tag, Clock, Calendar, Layers, Star, Gift,
  ToggleLeft, ToggleRight, Search, ChevronDown, AlertTriangle,
  Zap, Package,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface PromotionStats {
  total: number
  active: number
  expiring_soon: number
  expired: number
}

interface LinkedProduct  { id: number; name: string; internal_code?: string }
interface LinkedCategory { id: number; name: string }

interface Promotion {
  id: number
  name: string
  type: PromoType
  value: number
  min_amount: number
  buy_qty?: number
  get_qty?: number
  tiers?: TierEntry[]
  happy_hour_start?: string
  happy_hour_end?: string
  stackable: boolean
  applies_to_all: boolean
  loyalty_only: boolean
  starts_at?: string
  ends_at?: string
  is_active: boolean
  products?: LinkedProduct[]
  categories?: LinkedCategory[]
}

interface TierEntry { min_qty: number; discount_pct: number }

type PromoType = 'percentage' | 'fixed_amount' | 'special_price' | 'buy_x_get_y' | 'tiered' | 'happy_hour'
type PromoStatus = 'all' | 'active' | 'upcoming' | 'expired' | 'inactive'

interface Paginated<T> { data: T[]; total: number; current_page: number; last_page: number }

// ─── Config ───────────────────────────────────────────────────────────────────

const TYPE_CFG: Record<PromoType, { label: string; icon: React.ReactNode; desc: string; color: string }> = {
  percentage:    { label: 'Pourcentage',     icon: <Percent size={14} />,  desc: 'Remise en % sur le prix', color: 'bg-primary-50 text-primary-600 border-primary-200' },
  fixed_amount:  { label: 'Montant fixe',    icon: <Tag size={14} />,      desc: 'Remise d\'un montant fixe', color: 'bg-purple-50 text-purple-700 border-purple-200' },
  special_price: { label: 'Prix spécial',    icon: <Star size={14} />,     desc: 'Prix de vente forcé', color: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  buy_x_get_y:   { label: 'X acheté Y offert', icon: <Gift size={14} />,   desc: 'Achetez X, recevez Y gratuit', color: 'bg-green-50 text-green-700 border-green-200' },
  tiered:        { label: 'Paliers',          icon: <Layers size={14} />,  desc: 'Remise progressive selon quantité', color: 'bg-orange-50 text-orange-700 border-orange-200' },
  happy_hour:    { label: 'Happy Hour',       icon: <Clock size={14} />,   desc: 'Remise sur une plage horaire', color: 'bg-pink-50 text-pink-700 border-pink-200' },
}

const STATUS_CFG: Record<string, { label: string; dotCls: string; bgCls: string; textCls: string }> = {
  active:   { label: 'Active',    dotCls: 'bg-green-400',  bgCls: 'bg-green-50',  textCls: 'text-green-700' },
  upcoming: { label: 'À venir',   dotCls: 'bg-primary-400',   bgCls: 'bg-primary-50',   textCls: 'text-primary-600' },
  expired:  { label: 'Expirée',   dotCls: 'bg-gray-400',   bgCls: 'bg-gray-100',  textCls: 'text-gray-500' },
  inactive: { label: 'Inactive',  dotCls: 'bg-red-400',    bgCls: 'bg-red-50',    textCls: 'text-red-600' },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getPromoStatus(p: Promotion): string {
  const now = new Date()
  if (!p.is_active) {
    if (p.ends_at && new Date(p.ends_at) < now) return 'expired'
    return 'inactive'
  }
  if (p.starts_at && new Date(p.starts_at) > now) return 'upcoming'
  if (p.ends_at && new Date(p.ends_at) < now) return 'expired'
  return 'active'
}

function formatPromoValue(p: Promotion): string {
  if (p.type === 'percentage' || p.type === 'happy_hour') return `${p.value}%`
  if (p.type === 'buy_x_get_y') return `${p.buy_qty ?? '?'} + ${p.get_qty ?? '?'} offert`
  if (p.type === 'tiered') return `${(p.tiers ?? []).length} palier${(p.tiers ?? []).length > 1 ? 's' : ''}`
  return formatCurrency(p.value)
}

function fmtDate(d?: string) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function KpiCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number | string; color: string }) {
  return (
    <div className="card p-4 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>{icon}</div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-xs text-gray-500 mt-0.5">{label}</p>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CFG[status] ?? STATUS_CFG.inactive
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${cfg.bgCls} ${cfg.textCls} border-transparent`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dotCls}`} />
      {cfg.label}
    </span>
  )
}

function TypeBadge({ type }: { type: PromoType }) {
  const cfg = TYPE_CFG[type]
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.color}`}>
      {cfg.icon} {cfg.label}
    </span>
  )
}

// ─── Promotion Form Modal ─────────────────────────────────────────────────────

interface Category { id: number; name: string }

function PromotionFormModal({ promo, onClose }: { promo?: Promotion; onClose: () => void }) {
  const qc = useQueryClient()

  // Form state
  const [form, setForm] = useState({
    name:             promo?.name ?? '',
    type:             (promo?.type ?? 'percentage') as PromoType,
    value:            promo?.value?.toString() ?? '0',
    min_amount:       promo?.min_amount?.toString() ?? '0',
    buy_qty:          promo?.buy_qty?.toString() ?? '1',
    get_qty:          promo?.get_qty?.toString() ?? '1',
    happy_hour_start: promo?.happy_hour_start ?? '',
    happy_hour_end:   promo?.happy_hour_end ?? '',
    starts_at:        promo?.starts_at ? promo.starts_at.split('T')[0] : '',
    ends_at:          promo?.ends_at ? promo.ends_at.split('T')[0] : '',
    stackable:        promo?.stackable ?? false,
    loyalty_only:     promo?.loyalty_only ?? false,
    is_active:        promo?.is_active ?? true,
  })

  const [appliesTo, setAppliesTo] = useState<'all' | 'products' | 'categories'>(
    promo?.applies_to_all !== false ? 'all' : (promo?.products?.length ? 'products' : 'categories')
  )
  const [tiers, setTiers] = useState<TierEntry[]>(promo?.tiers ?? [{ min_qty: 2, discount_pct: 5 }])
  const [selectedProducts, setSelectedProducts] = useState<LinkedProduct[]>(promo?.products ?? [])
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<number[]>(
    promo?.categories?.map(c => c.id) ?? []
  )
  const [productSearch, setProductSearch] = useState('')
  const [productResults, setProductResults] = useState<LinkedProduct[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})

  const { data: allCategories = [] } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: () => api.get('/categories').then(r => r.data),
  })

  // Product search debounce
  useEffect(() => {
    if (productSearch.length < 2) { setProductResults([]); return }
    const t = setTimeout(async () => {
      const res = await api.get('/products', { params: { search: productSearch, per_page: 8, is_active: true } })
      setProductResults(res.data.data)
    }, 300)
    return () => clearTimeout(t)
  }, [productSearch])

  const mutation = useMutation({
    mutationFn: (payload: object) =>
      promo ? api.put(`/promotions/${promo.id}`, payload) : api.post('/promotions', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['promotions'] })
      qc.invalidateQueries({ queryKey: ['promo-stats'] })
      toast.success(promo ? 'Promotion mise à jour' : 'Promotion créée')
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
    if (Object.keys(errs).length) { setErrors(errs); return }

    mutation.mutate({
      name:             form.name,
      type:             form.type,
      value:            Number(form.value),
      min_amount:       Number(form.min_amount),
      buy_qty:          form.type === 'buy_x_get_y' ? Number(form.buy_qty) : undefined,
      get_qty:          form.type === 'buy_x_get_y' ? Number(form.get_qty) : undefined,
      tiers:            form.type === 'tiered' ? tiers : undefined,
      happy_hour_start: form.type === 'happy_hour' ? form.happy_hour_start || undefined : undefined,
      happy_hour_end:   form.type === 'happy_hour' ? form.happy_hour_end || undefined : undefined,
      starts_at:        form.starts_at || undefined,
      ends_at:          form.ends_at || undefined,
      stackable:        form.stackable,
      applies_to_all:   appliesTo === 'all',
      loyalty_only:     form.loyalty_only,
      is_active:        form.is_active,
      product_ids:      appliesTo === 'products' ? selectedProducts.map(p => p.id) : [],
      category_ids:     appliesTo === 'categories' ? selectedCategoryIds : [],
    })
  }

  const setF = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const addProduct = (p: LinkedProduct) => {
    if (!selectedProducts.find(s => s.id === p.id)) setSelectedProducts(arr => [...arr, p])
    setProductSearch('')
    setProductResults([])
  }

  const updateTier = (i: number, key: keyof TierEntry, val: string) =>
    setTiers(arr => arr.map((t, j) => j === i ? { ...t, [key]: Number(val) } : t))

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl max-h-[93vh] flex flex-col">
        {/* Header */}
        <div className="p-6 border-b flex items-center justify-between flex-shrink-0">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Percent size={20} className="text-primary" />
            {promo ? 'Modifier la promotion' : 'Nouvelle promotion'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nom de la promotion *</label>
            <input value={form.name} onChange={setF('name')} className="input" placeholder="Ex: Soldes été 2026, Happy Hour vendredi..." />
            {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
          </div>

          {/* Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Type de remise</label>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(TYPE_CFG) as PromoType[]).map(t => {
                const cfg = TYPE_CFG[t]
                const active = form.type === t
                return (
                  <button key={t} type="button"
                    onClick={() => setForm(f => ({ ...f, type: t }))}
                    className={`p-3 rounded-xl border text-left transition-all ${active ? 'border-primary bg-primary-50 ring-1 ring-primary' : 'border-gray-200 hover:border-gray-300'}`}>
                    <div className={`flex items-center gap-1 text-xs font-semibold mb-0.5 ${active ? 'text-primary' : 'text-gray-700'}`}>
                      {cfg.icon} {cfg.label}
                    </div>
                    <p className="text-xs text-gray-400 leading-tight">{cfg.desc}</p>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Value fields — conditional on type */}
          {['percentage', 'fixed_amount', 'special_price', 'happy_hour'].includes(form.type) && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {form.type === 'percentage' || form.type === 'happy_hour' ? 'Remise (%)' : form.type === 'special_price' ? 'Nouveau prix TTC' : 'Montant remisé (FCFA)'}
                </label>
                <input type="number" value={form.value} onChange={setF('value')} className="input" min={0} step={form.type === 'percentage' ? 1 : 100} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Montant minimum (FCFA)</label>
                <input type="number" value={form.min_amount} onChange={setF('min_amount')} className="input" min={0} step={100} />
              </div>
            </div>
          )}

          {form.type === 'buy_x_get_y' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Quantité achetée (X)</label>
                <input type="number" value={form.buy_qty} onChange={setF('buy_qty')} className="input" min={1} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Quantité offerte (Y)</label>
                <input type="number" value={form.get_qty} onChange={setF('get_qty')} className="input" min={1} />
              </div>
            </div>
          )}

          {form.type === 'happy_hour' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Heure de début</label>
                <input type="time" value={form.happy_hour_start} onChange={setF('happy_hour_start')} className="input" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Heure de fin</label>
                <input type="time" value={form.happy_hour_end} onChange={setF('happy_hour_end')} className="input" />
              </div>
            </div>
          )}

          {form.type === 'tiered' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-sm font-medium text-gray-700">Paliers de remise</label>
                <button type="button" onClick={() => setTiers(t => [...t, { min_qty: (t[t.length - 1]?.min_qty ?? 1) + 1, discount_pct: 10 }])}
                  className="text-xs text-primary hover:underline flex items-center gap-1">
                  <Plus size={12} /> Ajouter un palier
                </button>
              </div>
              {tiers.map((tier, i) => (
                <div key={i} className="flex items-center gap-2 bg-gray-50 rounded-lg p-2">
                  <span className="text-xs text-gray-500 w-20">À partir de</span>
                  <input type="number" value={tier.min_qty}
                    onChange={e => updateTier(i, 'min_qty', e.target.value)}
                    className="input w-16 text-center text-sm py-1" min={1} />
                  <span className="text-xs text-gray-500">unités →</span>
                  <input type="number" value={tier.discount_pct}
                    onChange={e => updateTier(i, 'discount_pct', e.target.value)}
                    className="input w-16 text-center text-sm py-1" min={0} max={100} />
                  <span className="text-xs text-gray-500">% de remise</span>
                  {tiers.length > 1 && (
                    <button type="button" onClick={() => setTiers(t => t.filter((_, j) => j !== i))}
                      className="ml-auto text-gray-400 hover:text-red-500"><X size={14} /></button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1"><Calendar size={13} /> Date de début</label>
              <input type="date" value={form.starts_at} onChange={setF('starts_at')} className="input" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1"><Calendar size={13} /> Date de fin</label>
              <input type="date" value={form.ends_at} onChange={setF('ends_at')} className="input" />
            </div>
          </div>

          {/* Applies to */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Portée de la promotion</label>
            <div className="flex gap-2">
              {([['all', 'Tous les produits', Package], ['products', 'Produits spécifiques', Tag], ['categories', 'Catégories', Layers]] as const).map(([k, label, Icon]) => (
                <button key={k} type="button" onClick={() => setAppliesTo(k)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm transition-colors ${
                    appliesTo === k ? 'bg-primary text-white border-primary' : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                  }`}>
                  <Icon size={13} /> {label}
                </button>
              ))}
            </div>

            {appliesTo === 'products' && (
              <div className="mt-3 space-y-2">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input value={productSearch} onChange={e => setProductSearch(e.target.value)}
                    className="input pl-9 text-sm" placeholder="Rechercher un produit..." />
                </div>
                {productResults.length > 0 && (
                  <div className="border rounded-xl divide-y max-h-40 overflow-y-auto bg-white shadow-sm">
                    {productResults.map((p: LinkedProduct) => (
                      <button key={p.id} type="button" onClick={() => addProduct(p)}
                        className="w-full flex items-center justify-between px-3 py-2 hover:bg-primary-50 text-left text-sm">
                        <span>{p.name}</span>
                        <span className="text-xs text-gray-400 font-mono">{p.internal_code}</span>
                      </button>
                    ))}
                  </div>
                )}
                {selectedProducts.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {selectedProducts.map(p => (
                      <span key={p.id} className="flex items-center gap-1 px-2.5 py-1 bg-primary-50 text-primary-600 text-xs rounded-full border border-primary-200">
                        {p.name}
                        <button type="button" onClick={() => setSelectedProducts(arr => arr.filter(a => a.id !== p.id))}
                          className="hover:text-red-500"><X size={10} /></button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {appliesTo === 'categories' && (
              <div className="mt-3 flex flex-wrap gap-2">
                {allCategories.map((c: Category) => {
                  const selected = selectedCategoryIds.includes(c.id)
                  return (
                    <button key={c.id} type="button"
                      onClick={() => setSelectedCategoryIds(arr => selected ? arr.filter(id => id !== c.id) : [...arr, c.id])}
                      className={`px-3 py-1 rounded-full text-sm border transition-colors ${selected ? 'bg-primary text-white border-primary' : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-primary-300'}`}>
                      {c.name}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Options */}
          <div className="flex gap-6 flex-wrap">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.stackable}
                onChange={e => setForm(f => ({ ...f, stackable: e.target.checked }))} className="rounded" />
              <span className="text-sm text-gray-700">Cumulable avec d'autres promos</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.loyalty_only}
                onChange={e => setForm(f => ({ ...f, loyalty_only: e.target.checked }))} className="rounded" />
              <span className="text-sm text-gray-700">Réservée aux clients fidélité</span>
            </label>
          </div>

          {/* Active toggle */}
          <label className="flex items-center gap-3 cursor-pointer">
            <button type="button" onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}>
              {form.is_active
                ? <ToggleRight className="text-green-500" size={28} />
                : <ToggleLeft className="text-gray-300" size={28} />}
            </button>
            <span className="text-sm font-medium text-gray-700">
              Promotion {form.is_active ? 'activée' : 'désactivée'}
            </span>
          </label>
        </form>

        <div className="p-6 border-t flex gap-3 flex-shrink-0">
          <button type="button" onClick={onClose} className="btn-secondary flex-1">Annuler</button>
          <button onClick={handleSubmit} disabled={mutation.isPending}
            className="btn-primary flex-1 flex items-center justify-center gap-2">
            <Check size={16} />
            {mutation.isPending ? 'Enregistrement...' : (promo ? 'Mettre à jour' : 'Créer la promotion')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Promotion Detail ─────────────────────────────────────────────────────────

function PromotionDetail({ promo, onClose, onEdit }: {
  promo: Promotion; onClose: () => void; onEdit: () => void
}) {
  const { data: detail } = useQuery<Promotion>({
    queryKey: ['promo', promo.id],
    queryFn: () => api.get(`/promotions/${promo.id}`).then(r => r.data),
  })
  const p = detail ?? promo
  const status = getPromoStatus(p)
  const typeCfg = TYPE_CFG[p.type]

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl max-h-[90vh] flex flex-col">
        <div className="p-6 border-b flex items-start justify-between flex-shrink-0">
          <div>
            <h2 className="text-xl font-bold text-gray-900">{p.name}</h2>
            <div className="flex items-center gap-2 mt-1.5">
              <TypeBadge type={p.type} />
              <StatusBadge status={status} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onEdit}
              className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">
              <Edit2 size={14} /> Modifier
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Value highlight */}
          <div className={`rounded-2xl p-5 ${typeCfg.color} border`}>
            <p className="text-sm font-medium opacity-70 mb-1">{typeCfg.label}</p>
            <p className="text-3xl font-bold">{formatPromoValue(p)}</p>
            {p.min_amount > 0 && <p className="text-sm opacity-70 mt-1">Commande minimum : {formatCurrency(p.min_amount)}</p>}
          </div>

          {/* Tiers */}
          {p.type === 'tiered' && (p.tiers ?? []).length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Paliers</h3>
              <div className="space-y-1">
                {(p.tiers ?? []).map((t, i) => (
                  <div key={i} className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-2 text-sm">
                    <span className="text-gray-600">À partir de {t.min_qty} unités</span>
                    <span className="font-bold text-orange-600">-{t.discount_pct}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Happy hour */}
          {p.type === 'happy_hour' && (p.happy_hour_start || p.happy_hour_end) && (
            <div className="flex items-center gap-2 text-sm text-gray-600 bg-pink-50 rounded-xl px-4 py-3">
              <Clock size={16} className="text-pink-500 flex-shrink-0" />
              <span>Plage horaire : <strong>{p.happy_hour_start ?? '?'}</strong> — <strong>{p.happy_hour_end ?? '?'}</strong></span>
            </div>
          )}

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-400 mb-0.5">Début</p>
              <p className="font-medium">{fmtDate(p.starts_at)}</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-400 mb-0.5">Fin</p>
              <p className={`font-medium ${status === 'expired' ? 'text-red-500' : ''}`}>{fmtDate(p.ends_at)}</p>
            </div>
          </div>

          {/* Options */}
          <div className="flex gap-2 flex-wrap">
            {p.stackable && <span className="px-2.5 py-1 bg-green-50 text-green-700 text-xs rounded-full border border-green-200">Cumulable</span>}
            {p.loyalty_only && <span className="px-2.5 py-1 bg-yellow-50 text-yellow-700 text-xs rounded-full border border-yellow-200 flex items-center gap-1"><Star size={10} /> Fidélité uniquement</span>}
          </div>

          {/* Products */}
          {(p.products ?? []).length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Produits concernés ({p.products!.length})</h3>
              <div className="flex flex-wrap gap-1.5">
                {p.products!.map(prod => (
                  <span key={prod.id} className="px-2.5 py-1 bg-primary-50 text-primary-600 text-xs rounded-full border border-primary-200">
                    {prod.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Categories */}
          {(p.categories ?? []).length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Catégories concernées ({p.categories!.length})</h3>
              <div className="flex flex-wrap gap-1.5">
                {p.categories!.map(cat => (
                  <span key={cat.id} className="px-2.5 py-1 bg-purple-50 text-purple-700 text-xs rounded-full border border-purple-200">
                    {cat.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {p.applies_to_all && (
            <div className="flex items-center gap-2 text-sm text-gray-500 bg-gray-50 rounded-xl px-4 py-3">
              <Package size={14} className="text-gray-400" />
              S'applique à tous les produits du catalogue
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PromotionsPage() {
  const [search, setSearch]         = useState('')
  const [page, setPage]             = useState(1)
  const [statusFilter, setStatus]   = useState<PromoStatus>('all')
  const [typeFilter, setTypeFilter] = useState<PromoType | 'all'>('all')
  const [showForm, setShowForm]     = useState(false)
  const [editPromo, setEditPromo]   = useState<Promotion | undefined>()
  const [viewPromo, setViewPromo]   = useState<Promotion | undefined>()
  const [showTypeMenu, setShowTypeMenu] = useState(false)
  const typeMenuRef = useRef<HTMLDivElement>(null)
  const qc = useQueryClient()

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (typeMenuRef.current && !typeMenuRef.current.contains(e.target as Node)) setShowTypeMenu(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const { data: stats } = useQuery<PromotionStats>({
    queryKey: ['promo-stats'],
    queryFn: () => api.get('/promotions/stats').then(r => r.data),
  })

  const queryParams = {
    search:   search || undefined,
    page,
    per_page: 20,
    status:   statusFilter !== 'all' ? statusFilter : undefined,
    type:     typeFilter !== 'all' ? typeFilter : undefined,
  }

  const { data, isLoading } = useQuery<Paginated<Promotion>>({
    queryKey: ['promotions', queryParams],
    queryFn: () => api.get('/promotions', { params: queryParams }).then(r => r.data),
    placeholderData: prev => prev,
  })

  const toggleActive = useMutation({
    mutationFn: (p: Promotion) => api.put(`/promotions/${p.id}`, { is_active: !p.is_active }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['promotions'] })
      qc.invalidateQueries({ queryKey: ['promo-stats'] })
    },
  })

  const deletePromo = useMutation({
    mutationFn: (id: number) => api.delete(`/promotions/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['promotions'] })
      qc.invalidateQueries({ queryKey: ['promo-stats'] })
      toast.success('Promotion supprimée')
    },
  })

  const STATUS_PILLS: { key: PromoStatus; label: string }[] = [
    { key: 'all',      label: 'Toutes' },
    { key: 'active',   label: 'Actives' },
    { key: 'upcoming', label: 'À venir' },
    { key: 'expired',  label: 'Expirées' },
    { key: 'inactive', label: 'Inactives' },
  ]

  const hasFilters = search || statusFilter !== 'all' || typeFilter !== 'all'

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Percent size={24} className="text-primary" /> Promotions
          </h1>
          <p className="text-gray-500 text-sm">{data?.total ?? 0} promotion{(data?.total ?? 0) > 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => { setEditPromo(undefined); setShowForm(true) }}
          className="btn-primary flex items-center gap-2">
          <Plus size={18} /> Nouvelle promotion
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4">
        <KpiCard icon={<Percent size={20} className="text-white" />} label="Total promotions"    value={stats?.total ?? 0}         color="bg-primary" />
        <KpiCard icon={<Zap size={20} className="text-white" />}     label="Actives en ce moment" value={stats?.active ?? 0}       color="bg-green-500" />
        <KpiCard icon={<AlertTriangle size={20} className="text-white" />} label="Expirent dans 7 jours" value={stats?.expiring_soon ?? 0} color="bg-amber-500" />
        <KpiCard icon={<Clock size={20} className="text-white" />}   label="Expirées"             value={stats?.expired ?? 0}       color="bg-gray-400" />
      </div>

      {/* Filters */}
      <div className="card p-4 space-y-3">
        <div className="flex gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
              className="input pl-10" placeholder="Rechercher une promotion..." />
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          </div>

          {/* Type filter */}
          <div className="relative" ref={typeMenuRef}>
            <button onClick={() => setShowTypeMenu(s => !s)}
              className="flex items-center gap-2 px-4 py-2 border rounded-lg text-sm bg-white border-gray-200 hover:bg-gray-50 whitespace-nowrap">
              <Tag size={14} className="text-gray-400" />
              {typeFilter === 'all' ? 'Tous les types' : TYPE_CFG[typeFilter as PromoType].label}
              <ChevronDown size={13} className="text-gray-400" />
            </button>
            {showTypeMenu && (
              <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-gray-200 rounded-xl shadow-lg z-10 py-1">
                <button onClick={() => { setTypeFilter('all'); setPage(1); setShowTypeMenu(false) }}
                  className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 ${typeFilter === 'all' ? 'text-primary font-medium' : 'text-gray-700'}`}>
                  Tous les types
                </button>
                {(Object.keys(TYPE_CFG) as PromoType[]).map(t => (
                  <button key={t} onClick={() => { setTypeFilter(t); setPage(1); setShowTypeMenu(false) }}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 ${typeFilter === t ? 'text-primary font-medium' : 'text-gray-700'}`}>
                    {TYPE_CFG[t].label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {hasFilters && (
            <button onClick={() => { setSearch(''); setStatus('all'); setTypeFilter('all'); setPage(1) }}
              className="flex items-center gap-1 px-3 py-2 text-sm text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50">
              <X size={14} /> Réinitialiser
            </button>
          )}
        </div>

        {/* Status pills */}
        <div className="flex gap-2">
          {STATUS_PILLS.map(({ key, label }) => (
            <button key={key} onClick={() => { setStatus(key); setPage(1) }}
              className={`px-3 py-1 rounded-full text-sm border transition-colors ${
                statusFilter === key ? 'bg-primary text-white border-primary' : 'bg-white text-gray-600 border-gray-200 hover:border-primary-300'
              }`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Chargement...</div>
        ) : (data?.data ?? []).length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <Percent size={40} className="mx-auto mb-3 opacity-30" />
            <p className="font-medium">Aucune promotion trouvée</p>
            {hasFilters && <button onClick={() => { setSearch(''); setStatus('all'); setTypeFilter('all') }} className="mt-2 text-primary text-sm hover:underline">Réinitialiser</button>}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Nom</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Type</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Valeur</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Portée</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Période</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Statut</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Active</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {(data?.data ?? []).map((p: Promotion) => {
                const status = getPromoStatus(p)
                const scope = p.applies_to_all
                  ? 'Tous les produits'
                  : (p.products?.length ? `${p.products.length} produit${p.products.length > 1 ? 's' : ''}` : '')
                    + (p.products?.length && p.categories?.length ? ' + ' : '')
                    + (p.categories?.length ? `${p.categories.length} catégorie${p.categories.length > 1 ? 's' : ''}` : '')

                return (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors group">
                    <td className="px-4 py-3">
                      <button onClick={() => setViewPromo(p)} className="text-left hover:text-primary transition-colors">
                        <p className="font-medium text-gray-900">{p.name}</p>
                        {(p.stackable || p.loyalty_only) && (
                          <div className="flex gap-1 mt-0.5">
                            {p.stackable && <span className="text-xs text-green-600 bg-green-50 px-1.5 py-0.5 rounded">Cumulable</span>}
                            {p.loyalty_only && <span className="text-xs text-yellow-600 bg-yellow-50 px-1.5 py-0.5 rounded">Fidélité</span>}
                          </div>
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-3"><TypeBadge type={p.type} /></td>
                    <td className="px-4 py-3 text-right font-bold text-gray-900">{formatPromoValue(p)}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{scope || '—'}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      <div>{fmtDate(p.starts_at)}</div>
                      {p.ends_at && <div className={status === 'expired' ? 'text-red-400' : ''}>→ {fmtDate(p.ends_at)}</div>}
                    </td>
                    <td className="px-4 py-3 text-center"><StatusBadge status={status} /></td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => toggleActive.mutate(p)} className="transition-colors">
                        {p.is_active
                          ? <ToggleRight className="text-green-500" size={22} />
                          : <ToggleLeft className="text-gray-300" size={22} />}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => setViewPromo(p)} title="Voir" className="text-gray-400 hover:text-primary"><Eye size={15} /></button>
                        <button onClick={() => { setEditPromo(p); setShowForm(true) }} title="Modifier" className="text-gray-400 hover:text-primary"><Edit2 size={15} /></button>
                        <button
                          onClick={() => { if (confirm(`Supprimer "${p.name}" ?`)) deletePromo.mutate(p.id) }}
                          title="Supprimer" className="text-gray-400 hover:text-red-500">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}

        {data && data.last_page > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50">
            <p className="text-sm text-gray-500">Page {data.current_page} / {data.last_page}</p>
            <div className="flex gap-1">
              <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
                className="p-1.5 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-100">
                <ChevronDown size={16} className="rotate-90" />
              </button>
              <button disabled={page === data.last_page} onClick={() => setPage(p => p + 1)}
                className="p-1.5 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-100">
                <ChevronDown size={16} className="-rotate-90" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {showForm && (
        <PromotionFormModal
          promo={editPromo}
          onClose={() => { setShowForm(false); setEditPromo(undefined) }}
        />
      )}
      {viewPromo && !showForm && (
        <PromotionDetail
          promo={viewPromo}
          onClose={() => setViewPromo(undefined)}
          onEdit={() => { setEditPromo(viewPromo); setViewPromo(undefined); setShowForm(true) }}
        />
      )}
    </div>
  )
}
