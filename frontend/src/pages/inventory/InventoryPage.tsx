import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import api from '../../lib/api'
import { formatCurrency, formatNumber, formatDate } from '../../lib/format'
import {
  ClipboardList, Plus, ArrowLeft, Search, CheckCircle2,
  Loader2, X, Trash2, AlertTriangle, TrendingDown, TrendingUp,
  Package, ChevronRight, Calendar, User, BarChart2,
  Layers, Tag, Send, ChevronDown, ChevronUp, ShoppingBag,
  QrCode, Camera, Barcode, Clock, Play, Users, ShieldAlert,
} from 'lucide-react'
import { useConfirm } from '../../hooks/useConfirm'

// ─── Types ──────────────────────────────────────────────────────────────────

interface InventorySession {
  id: number
  name: string
  type: 'full' | 'rotating'
  status: 'scheduled' | 'draft' | 'counting' | 'validating' | 'pending' | 'completed' | 'cancelled'
  started_by?: number
  started_at?: string
  validated_at?: string
  scheduled_at?: string | null
  sales_mode?: 'normal' | 'blocked'
  remind_before_minutes?: number | null
  total_variance_value?: number | null
  shrinkage_rate_pct?: number | null
  items_count?: number
  startedBy?: { id: number; name: string }
  validator?: { id: number; name: string }
}

interface SessionItem {
  id: number
  session_id: number
  sheet_id: number | null
  product_id: number
  theoretical_qty: string | number
  counted_qty: string | number | null
  unit_cost: string | number
  variance_value: string | number | null
  counted_at?: string
  new_expiry_date?: string | null
  new_sale_price?: number | null
  new_purchase_price?: number | null
  product: {
    id: number
    name: string
    internal_code: string
    alert_stock: number
    unit?: { abbreviation: string }
  }
  countedBy?: { name: string }
}

interface InventorySheet {
  id: number
  session_id: number
  name: string
  type: 'section' | 'free'
  section_id: number | null
  assigned_to?: number | null
  status: 'draft' | 'counting' | 'validated' | 'cancelled'
  validated_by?: number | null
  validated_at?: string | null
  section?: { id: number; name: string; color: string; icon: string }
  validatedBy?: { id: number; name: string }
  assignedTo?: { id: number; name: string }
  items: SessionItem[]
}

interface SessionDetail extends InventorySession {
  items: SessionItem[]
  sheets: InventorySheet[]
}

interface ProductHit {
  id: number
  name: string
  internal_code: string
  unit?: { abbreviation: string }
}

interface Section {
  id: number
  name: string
  color?: string
  icon?: string
}

interface Paginated<T> {
  data: T[]
  current_page: number
  last_page: number
  total: number
}

// ─── Constants ───────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string; step: number }> = {
  scheduled:  { label: 'Planifié',      color: 'info',    step: 0 },
  draft:      { label: 'Brouillon',     color: 'gray',    step: 1 },
  counting:   { label: 'En cours',      color: 'info',    step: 2 },
  pending:    { label: 'En attente',    color: 'warning', step: 3 },
  completed:  { label: 'Terminé',       color: 'success', step: 4 },
  validating: { label: 'En validation', color: 'warning', step: 3 },
  cancelled:  { label: 'Annulé',        color: 'danger',  step: -1 },
}

const FLOW_STEPS = ['Planifié', 'Brouillon', 'En cours', 'En attente', 'Terminé']

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
    <div className="flex items-center gap-1 flex-wrap">
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

// ─── Inline Qty Editor ───────────────────────────────────────────────────────

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
    <button onClick={() => setEditing(true)}
      className={`text-right w-24 px-2 py-1 rounded-lg text-sm font-semibold transition-colors hover:bg-primary-50 ${item.counted_qty !== null ? 'text-gray-900' : 'text-gray-300'}`}
      title="Cliquer pour modifier">
      {item.counted_qty !== null
        ? formatNumber(parseFloat(String(item.counted_qty)), 3)
        : <span className="text-xs font-normal italic">Saisir...</span>
      }
    </button>
  )
}

// ─── Create Session Modal ────────────────────────────────────────────────────

function CreateSessionModal({ onClose }: { onClose: () => void }) {
  const [name, setName]           = useState('')
  const [type, setType]           = useState<'full' | 'rotating'>('rotating')
  const [schedule, setSchedule]   = useState(false)
  const [scheduledAt, setScheduledAt] = useState('')
  const [salesMode, setSalesMode] = useState<'normal' | 'blocked'>('normal')
  const [remindMin, setRemindMin] = useState<number | ''>('')
  const qc = useQueryClient()

  const mutation = useMutation({
    mutationFn: () => api.post('/inventory-sessions', {
      name: name || undefined,
      type,
      scheduled_at:          schedule && scheduledAt ? scheduledAt : undefined,
      sales_mode:            schedule ? salesMode : undefined,
      remind_before_minutes: schedule && remindMin ? remindMin : undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory-sessions'] })
      onClose()
    },
  })

  // min datetime for scheduling = now + 2 minutes
  const minDatetime = new Date(Date.now() + 2 * 60_000).toISOString().slice(0, 16)

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-y-auto max-h-[90vh]">
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
                { v: 'rotating', title: 'Par fiches', desc: 'Créez des fiches par rayon ou par lot de produits. Recommandé.' },
                { v: 'full', title: 'Complet (auto)', desc: 'Tous les articles du stock sont pré-chargés automatiquement.' },
              ] as const).map(opt => (
                <button key={opt.v} type="button" onClick={() => setType(opt.v)}
                  className={`text-left p-4 rounded-xl border-2 transition-all ${type === opt.v ? 'border-primary bg-primary-50' : 'border-gray-200 hover:border-gray-300'}`}>
                  <p className={`text-sm font-semibold ${type === opt.v ? 'text-primary-600' : 'text-gray-800'}`}>{opt.title}</p>
                  <p className="text-xs text-gray-500 mt-1 leading-relaxed">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Scheduling toggle */}
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setSchedule(v => !v)}
              className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${schedule ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
            >
              <div className={`w-9 h-5 rounded-full relative transition-colors flex-shrink-0 ${schedule ? 'bg-primary' : 'bg-gray-300'}`}>
                <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${schedule ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                  <Clock size={14} className="text-primary" /> Planifier à une date précise
                </p>
                <p className="text-xs text-gray-500">L'inventaire démarrera automatiquement à l'heure choisie</p>
              </div>
            </button>

            {schedule && (
              <div className="px-4 pb-4 pt-2 space-y-3 border-t border-gray-100 bg-blue-50/40">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Date et heure *</label>
                  <input type="datetime-local" value={scheduledAt} min={minDatetime}
                    onChange={e => setScheduledAt(e.target.value)}
                    className="input text-sm w-full" />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">
                    Rappel avant l'inventaire
                  </label>
                  <select value={remindMin} onChange={e => setRemindMin(e.target.value ? Number(e.target.value) : '')}
                    className="input text-sm w-full">
                    <option value="">Pas de rappel</option>
                    <option value={15}>15 minutes avant</option>
                    <option value={30}>30 minutes avant</option>
                    <option value={60}>1 heure avant</option>
                    <option value={120}>2 heures avant</option>
                    <option value={1440}>La veille</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-2">
                    Ventes pendant l'inventaire
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      { v: 'normal',  label: 'Autorisées',  desc: 'Les ventes continuent normalement', icon: '✓' },
                      { v: 'blocked', label: 'Bloquées',    desc: 'Aucune vente possible pendant l\'inventaire', icon: '⊘' },
                    ] as const).map(opt => (
                      <button key={opt.v} type="button" onClick={() => setSalesMode(opt.v)}
                        className={`text-left p-3 rounded-lg border-2 transition-all ${salesMode === opt.v
                          ? opt.v === 'blocked' ? 'border-red-400 bg-red-50' : 'border-emerald-400 bg-emerald-50'
                          : 'border-gray-200 hover:border-gray-300'}`}>
                        <p className="text-xs font-bold text-gray-900">{opt.icon} {opt.label}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{opt.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {mutation.isError && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">Une erreur est survenue.</p>
          )}
        </div>

        <div className="flex gap-3 px-6 pb-6">
          <button onClick={onClose} className="flex-1 btn-secondary text-sm">Annuler</button>
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || (schedule && !scheduledAt)}
            className="flex-1 btn-primary text-sm flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {mutation.isPending
              ? <><Loader2 size={15} className="animate-spin" /> Création...</>
              : schedule
                ? <><Clock size={15} /> Planifier l'inventaire</>
                : <><Plus size={15} /> Créer l'inventaire</>
            }
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Section product type ────────────────────────────────────────────────────

interface SectionProduct {
  id: number
  name: string
  internal_code: string
  category?: { name: string }
  unit?: { abbreviation: string }
  stock_level?: { qty_on_hand: number }
}

// ─── Create Sheet Modal ──────────────────────────────────────────────────────

interface AppUser { id: number; name: string }

function CreateSheetModal({ sessionId, onClose }: { sessionId: number; onClose: () => void }) {
  const [name, setName]                         = useState('')
  const [type, setType]                         = useState<'section' | 'free'>('section')
  const [sectionId, setSectionId]               = useState<number | ''>('')
  const [assignedTo, setAssignedTo]             = useState<number | ''>('')
  const [productSearch, setProductSearch]       = useState('')
  const [selectedIds, setSelectedIds]           = useState<Set<number>>(new Set())
  const qc = useQueryClient()

  const { data: users } = useQuery<AppUser[]>({
    queryKey: ['store-users-list'],
    queryFn: () => api.get('/users').then(r => r.data?.data ?? r.data),
  })

  const { data: sections } = useQuery<Section[]>({
    queryKey: ['sections-list'],
    queryFn: () => api.get('/sections').then(r => r.data),
  })

  const { data: sectionProducts, isLoading: loadingProducts } = useQuery<SectionProduct[]>({
    queryKey: ['section-products-inv', sectionId],
    queryFn: () => api.get(`/sections/${sectionId}/products`).then(r => r.data),
    enabled: type === 'section' && sectionId !== '',
  })

  const filtered = (sectionProducts ?? []).filter(p => {
    if (!productSearch) return true
    const q = productSearch.toLowerCase()
    return p.name.toLowerCase().includes(q) ||
      (p.internal_code ?? '').toLowerCase().includes(q) ||
      (p.category?.name ?? '').toLowerCase().includes(q)
  })

  const allSelected   = filtered.length > 0 && filtered.every(p => selectedIds.has(p.id))
  const someSelected  = filtered.some(p => selectedIds.has(p.id))

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(prev => { const s = new Set(prev); filtered.forEach(p => s.delete(p.id)); return s })
    } else {
      setSelectedIds(prev => { const s = new Set(prev); filtered.forEach(p => s.add(p.id)); return s })
    }
  }

  const toggle = (id: number) => {
    setSelectedIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }

  // Reset selections when section changes
  const handleSectionChange = (id: number | '') => {
    setSectionId(id)
    setSelectedIds(new Set())
    setProductSearch('')
  }

  const selectedSection = sections?.find(s => s.id === Number(sectionId))

  const mutation = useMutation({
    mutationFn: () => {
      const payload: Record<string, unknown> = {
        name: name || (type === 'section' ? (selectedSection?.name ?? 'Fiche rayon') : 'Fiche libre'),
        type,
        section_id:  type === 'section' ? sectionId || null : null,
        assigned_to: assignedTo || null,
      }
      if (type === 'section' && selectedIds.size > 0) {
        payload.product_ids = [...selectedIds]
      }
      return api.post(`/inventory-sessions/${sessionId}/sheets`, payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory-session', sessionId] })
      toast.success('Fiche créée')
      onClose()
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message ?? 'Erreur lors de la création')
    },
  })

  const canCreate = type === 'free' || (type === 'section' && sectionId !== '' && selectedIds.size > 0)

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0">
          <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <Layers size={18} className="text-primary" /> Nouvelle fiche d'inventaire
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
            <X size={17} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-6 space-y-5">
          {/* Type selector */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Type de fiche</label>
            <div className="grid grid-cols-2 gap-3">
              {([
                { v: 'section', title: 'Par rayon', desc: 'Sélectionnez les produits du rayon à inventorier.' },
                { v: 'free',    title: 'Libre',     desc: 'Ajoutez les produits manuellement un par un.' },
              ] as const).map(opt => (
                <button key={opt.v} type="button" onClick={() => { setType(opt.v); setSectionId(''); setSelectedIds(new Set()) }}
                  className={`text-left p-4 rounded-xl border-2 transition-all ${type === opt.v ? 'border-primary bg-primary-50' : 'border-gray-200 hover:border-gray-300'}`}>
                  <p className={`text-sm font-semibold ${type === opt.v ? 'text-primary-600' : 'text-gray-800'}`}>{opt.title}</p>
                  <p className="text-xs text-gray-500 mt-1 leading-relaxed">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Section selector */}
          {type === 'section' && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Rayon *</label>
              <select value={sectionId} onChange={e => handleSectionChange(e.target.value ? Number(e.target.value) : '')}
                className="input text-sm">
                <option value="">— Choisir un rayon —</option>
                {(sections ?? []).map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Product selection (section type) */}
          {type === 'section' && sectionId !== '' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold text-gray-700">
                  Produits à inventorier
                </label>
                {selectedIds.size > 0 && (
                  <span className="text-xs font-semibold text-primary-600 bg-primary-50 px-2 py-0.5 rounded-full">
                    {selectedIds.size} sélectionné(s)
                  </span>
                )}
              </div>

              {/* Search filter */}
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={productSearch}
                  onChange={e => setProductSearch(e.target.value)}
                  className="input pl-8 text-sm h-9 w-full"
                  placeholder="Filtrer par nom, code, catégorie..."
                />
                {productSearch && (
                  <button onClick={() => setProductSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    <X size={12} />
                  </button>
                )}
              </div>

              {/* Product list */}
              {loadingProducts ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 size={20} className="animate-spin text-primary" />
                </div>
              ) : filtered.length === 0 ? (
                <div className="py-8 text-center text-sm text-gray-400">
                  {(sectionProducts ?? []).length === 0
                    ? 'Aucun produit dans ce rayon.'
                    : 'Aucun produit ne correspond au filtre.'}
                </div>
              ) : (
                <div className="border rounded-xl overflow-hidden">
                  {/* Select all header */}
                  <div className="flex items-center gap-3 px-3 py-2.5 bg-gray-50 border-b">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={el => { if (el) el.indeterminate = someSelected && !allSelected }}
                      onChange={toggleAll}
                      className="w-4 h-4 rounded accent-primary cursor-pointer"
                    />
                    <span className="text-xs font-semibold text-gray-600">
                      Tout sélectionner ({filtered.length} produit{filtered.length > 1 ? 's' : ''})
                    </span>
                  </div>

                  {/* Scrollable list */}
                  <div className="max-h-56 overflow-y-auto divide-y divide-gray-100">
                    {filtered.map(p => {
                      const checked = selectedIds.has(p.id)
                      return (
                        <label key={p.id}
                          className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors hover:bg-primary-50/40 ${checked ? 'bg-primary-50/30' : ''}`}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggle(p.id)}
                            className="w-4 h-4 rounded accent-primary cursor-pointer flex-shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-900 truncate">{p.name}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-xs font-mono text-gray-400">{p.internal_code}</span>
                              {p.category && (
                                <span className="text-xs text-gray-400">· {p.category.name}</span>
                              )}
                            </div>
                          </div>
                          {p.stock_level != null && (
                            <span className="text-xs text-gray-500 flex-shrink-0 font-mono">
                              {parseFloat(String(p.stock_level.qty_on_hand)).toFixed(2)}
                              {p.unit ? ` ${p.unit.abbreviation}` : ''}
                            </span>
                          )}
                        </label>
                      )
                    })}
                  </div>
                </div>
              )}

              {(sectionProducts ?? []).length > 0 && selectedIds.size === 0 && (
                <p className="text-xs text-amber-600 flex items-center gap-1">
                  <AlertTriangle size={11} /> Sélectionnez au moins un produit pour créer la fiche.
                </p>
              )}
            </div>
          )}

          {/* Optional name */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              Nom de la fiche <span className="text-gray-400 font-normal">(optionnel)</span>
            </label>
            <input type="text" value={name} onChange={e => setName(e.target.value)}
              className="input text-sm"
              placeholder={
                type === 'section' && selectedSection
                  ? selectedSection.name
                  : 'Ex: Produits frais, Lot promotions...'
              } />
          </div>

          {/* Assigned user */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5 flex items-center gap-1.5">
              <Users size={14} className="text-primary" /> Assigner à un utilisateur
              <span className="text-gray-400 font-normal">(optionnel)</span>
            </label>
            <select value={assignedTo} onChange={e => setAssignedTo(e.target.value ? Number(e.target.value) : '')}
              className="input text-sm w-full">
              <option value="">— Non assigné —</option>
              {(users ?? []).map(u => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
            {assignedTo && (
              <p className="text-xs text-blue-600 mt-1 flex items-center gap-1">
                <Users size={11} /> Cette personne sera redirigée vers sa fiche lors de sa connexion
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 pb-6 pt-4 border-t flex-shrink-0">
          <button onClick={onClose} className="flex-1 btn-secondary text-sm">Annuler</button>
          <button onClick={() => mutation.mutate()} disabled={!canCreate || mutation.isPending}
            className="flex-1 btn-primary text-sm flex items-center justify-center gap-2 disabled:opacity-50">
            {mutation.isPending
              ? <><Loader2 size={15} className="animate-spin" /> Création...</>
              : <><Plus size={15} />
                  {type === 'section' && selectedIds.size > 0
                    ? `Créer la fiche (${selectedIds.size} produit${selectedIds.size > 1 ? 's' : ''})`
                    : 'Créer la fiche'
                  }
                </>}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Add Product to Sheet Modal ──────────────────────────────────────────────

function AddProductModal({ sessionId, sheetId, onClose }: {
  sessionId: number
  sheetId: number | null
  onClose: () => void
}) {
  const [search, setSearch]     = useState('')
  const [selected, setSelected] = useState<ProductHit | null>(null)
  const [qty, setQty]           = useState('')
  const qc = useQueryClient()

  const { data: hits, isFetching } = useQuery({
    queryKey: ['products-search-inv', search],
    queryFn: () => api.get('/products', { params: { search, per_page: 10 } }).then(r => r.data.data as ProductHit[]),
    enabled: search.length >= 2,
    staleTime: 0,
  })

  const mutation = useMutation({
    mutationFn: (d: { product_id: number; counted_qty: number }) =>
      api.post(`/inventory-sessions/${sessionId}/items`, { ...d, sheet_id: sheetId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory-session', sessionId] })
      setSelected(null); setSearch(''); setQty('')
    },
  })

  const qtyNum = parseFloat(qty)
  const valid  = selected && !isNaN(qtyNum) && qtyNum >= 0

  const showDropdown = !selected && search.length > 0

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
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="input pl-8 pr-8 text-sm"
                  placeholder="Rechercher un produit..."
                  autoFocus
                  autoComplete="off"
                />
                {isFetching && (
                  <Loader2 size={13} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-primary" />
                )}
                {showDropdown && (
                  <div className="absolute z-20 w-full mt-1 bg-white rounded-xl shadow-xl border overflow-hidden">
                    {search.length < 2 ? (
                      <div className="px-4 py-3 text-xs text-gray-400 flex items-center gap-1.5">
                        <Search size={11} /> Tapez au moins 2 caractères...
                      </div>
                    ) : isFetching ? (
                      <div className="px-4 py-3 text-xs text-gray-400 flex items-center gap-1.5">
                        <Loader2 size={11} className="animate-spin" /> Recherche en cours...
                      </div>
                    ) : (hits ?? []).length === 0 ? (
                      <div className="px-4 py-3 text-xs text-gray-500 flex items-center gap-1.5">
                        <Package size={11} /> Aucun produit trouvé pour &laquo;{search}&raquo;
                      </div>
                    ) : (
                      (hits ?? []).map(p => (
                        <button key={p.id} onMouseDown={e => { e.preventDefault(); setSelected(p) }}
                          className="w-full text-left px-4 py-2.5 hover:bg-primary-50 flex justify-between gap-3 text-sm border-b last:border-0 transition-colors">
                          <span className="font-medium text-gray-900">{p.name}</span>
                          <span className="text-xs text-gray-400 font-mono flex-shrink-0">{p.internal_code}</span>
                        </button>
                      ))
                    )}
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

// ─── Sheet Card (expandable) ─────────────────────────────────────────────────

function SheetCard({ sheet, sessionId, canEdit }: {
  sheet: InventorySheet
  sessionId: number
  canEdit: boolean
}) {
  const [expanded, setExpanded]     = useState(false)
  const [showAddProd, setShowAddProd] = useState(false)
  const qc = useQueryClient()
  const confirm = useConfirm()

  const validateMut = useMutation({
    mutationFn: () => api.post(`/inventory-sessions/${sessionId}/sheets/${sheet.id}/validate`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory-session', sessionId] })
      toast.success(`Fiche "${sheet.name}" validée`)
    },
    onError: (err: any) => toast.error(err?.response?.data?.message ?? 'Erreur de validation'),
  })

  const deleteMut = useMutation({
    mutationFn: () => api.delete(`/inventory-sessions/${sessionId}/sheets/${sheet.id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory-session', sessionId] })
      toast.success('Fiche supprimée')
    },
  })

  const saveItemMut = useMutation({
    mutationFn: (payload: object) => api.post(`/inventory-sessions/${sessionId}/items`, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inventory-session', sessionId] }),
  })

  const countedItems  = sheet.items.filter(i => i.counted_qty !== null)
  const pendingItems  = sheet.items.filter(i => i.counted_qty === null)
  const isValidated   = sheet.status === 'validated'
  const pct           = sheet.items.length > 0
    ? Math.round((countedItems.length / sheet.items.length) * 100)
    : 0

  return (
    <div className={`border rounded-xl overflow-hidden transition-all ${isValidated ? 'border-emerald-300 bg-emerald-50/30' : 'border-gray-200 bg-white'}`}>
      {/* Sheet header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <button onClick={() => setExpanded(v => !v)}
          className="flex items-center gap-3 flex-1 min-w-0 text-left">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${isValidated ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-100 text-gray-500'}`}>
            {sheet.type === 'section' ? <Tag size={15} /> : <Package size={15} />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-semibold text-gray-900 text-sm truncate">{sheet.name}</p>
              {isValidated
                ? <span className="badge-success text-xs shrink-0">Validée</span>
                : <span className="badge-gray text-xs shrink-0">En cours</span>
              }
            </div>
            <div className="flex items-center gap-3 mt-0.5 flex-wrap">
              <span className="text-xs text-gray-400">
                {sheet.type === 'section' ? 'Par rayon' : 'Libre'} · {sheet.items.length} article(s)
              </span>
              {sheet.assignedTo && (
                <span className="text-xs text-blue-600 flex items-center gap-1">
                  <User size={10} /> {sheet.assignedTo.name}
                </span>
              )}
              {!isValidated && sheet.items.length > 0 && (
                <span className="text-xs text-amber-600">{pendingItems.length} à compter</span>
              )}
              {isValidated && sheet.validatedBy && (
                <span className="text-xs text-emerald-600 flex items-center gap-1">
                  <CheckCircle2 size={10} /> {sheet.validatedBy.name}
                </span>
              )}
              {sheet.status === 'cancelled' && (
                <span className="text-xs text-red-500">Annulée</span>
              )}
            </div>
          </div>
          {sheet.items.length > 0 && (
            <div className="flex items-center gap-2 flex-shrink-0">
              <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full"
                  style={{ width: `${pct}%` }} />
              </div>
              <span className="text-xs font-semibold text-gray-500 w-8 text-right">{pct}%</span>
            </div>
          )}
          <span className="text-gray-400 ml-1 flex-shrink-0">
            {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </span>
        </button>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {canEdit && !isValidated && sheet.type === 'free' && (
            <button onClick={() => setShowAddProd(true)}
              className="p-1.5 rounded-lg hover:bg-primary-50 text-gray-400 hover:text-primary transition-colors"
              title="Ajouter un produit">
              <Plus size={15} />
            </button>
          )}
          {canEdit && !isValidated && (
            <button
              onClick={async () => {
                if (await confirm(`Valider la fiche "${sheet.name}" ?`))
                  validateMut.mutate()
              }}
              disabled={validateMut.isPending || pendingItems.length > 0}
              className="px-3 py-1.5 text-xs font-semibold bg-emerald-50 text-emerald-700 rounded-lg hover:bg-emerald-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1">
              {validateMut.isPending ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
              Valider
            </button>
          )}
          {canEdit && !isValidated && (
            <button
              onClick={async () => {
                if (await confirm(`Supprimer la fiche "${sheet.name}" ?`))
                  deleteMut.mutate()
              }}
              className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Expandable items table */}
      {expanded && (
        <div className="border-t bg-white">
          {sheet.items.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <Package size={28} className="mx-auto text-gray-300 mb-2" />
              <p className="text-sm text-gray-400">Aucun produit dans cette fiche.</p>
              {canEdit && sheet.type === 'free' && (
                <button onClick={() => setShowAddProd(true)}
                  className="btn-secondary text-xs mt-3 inline-flex items-center gap-1">
                  <Plus size={12} /> Ajouter un produit
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b text-gray-500 uppercase tracking-wide">
                    <th className="text-left px-4 py-2.5">Produit</th>
                    <th className="text-right px-3 py-2.5">Théorique</th>
                    <th className="text-right px-3 py-2.5">Compté</th>
                    <th className="text-right px-3 py-2.5">Écart</th>
                    <th className="text-center px-3 py-2.5">Date exp.</th>
                    <th className="text-right px-3 py-2.5">Prix vente</th>
                    <th className="text-right px-3 py-2.5">Prix achat</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {sheet.items.map(item => {
                    const v  = variance(item)
                    const vv = varianceValue(item)
                    return (
                      <tr key={item.id} className={`group ${
                        item.counted_qty === null ? '' :
                        v === 0 ? 'bg-emerald-50/20' :
                        v! > 0 ? 'bg-primary-50/20' : 'bg-red-50/20'
                      }`}>
                        <td className="px-4 py-2.5">
                          <p className="font-semibold text-gray-900">{item.product.name}</p>
                          <p className="text-gray-400 font-mono">{item.product.internal_code}</p>
                        </td>
                        <td className="px-3 py-2.5 text-right text-gray-600">
                          {formatNumber(parseFloat(String(item.theoretical_qty)), 3)}
                          {item.product.unit && <span className="text-gray-400 ml-0.5">{item.product.unit.abbreviation}</span>}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          {canEdit && !isValidated ? (
                            <InlineQtyEditor item={item}
                              onSave={qty => saveItemMut.mutate({
                                product_id: item.product_id,
                                counted_qty: qty,
                                sheet_id: sheet.id,
                                new_expiry_date: item.new_expiry_date ?? null,
                                new_sale_price: item.new_sale_price ?? null,
                                new_purchase_price: item.new_purchase_price ?? null,
                              })} />
                          ) : (
                            item.counted_qty !== null
                              ? <span className="font-semibold text-gray-900">{formatNumber(parseFloat(String(item.counted_qty)), 3)}</span>
                              : <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          {v !== null ? (
                            <span className={`font-bold ${v === 0 ? 'text-emerald-600' : v > 0 ? 'text-primary' : 'text-red-600'}`}>
                              {v > 0 ? '+' : ''}{formatNumber(v, 3)}
                            </span>
                          ) : <span className="text-gray-300">—</span>}
                        </td>
                        {/* Expiry date */}
                        <td className="px-3 py-2.5 text-center">
                          {canEdit && !isValidated ? (
                            <input type="date"
                              value={item.new_expiry_date ?? ''}
                              onChange={e => saveItemMut.mutate({
                                product_id: item.product_id,
                                counted_qty: item.counted_qty ?? 0,
                                sheet_id: sheet.id,
                                new_expiry_date: e.target.value || null,
                                new_sale_price: item.new_sale_price ?? null,
                                new_purchase_price: item.new_purchase_price ?? null,
                              })}
                              className="input text-xs py-1 px-2 w-32 text-center" />
                          ) : (
                            item.new_expiry_date
                              ? <span className="text-amber-600 font-semibold">{item.new_expiry_date}</span>
                              : <span className="text-gray-300">—</span>
                          )}
                        </td>
                        {/* New sale price */}
                        <td className="px-3 py-2.5 text-right">
                          {canEdit && !isValidated ? (
                            <input type="number" min="0" step="0.01"
                              value={item.new_sale_price ?? ''}
                              onChange={e => saveItemMut.mutate({
                                product_id: item.product_id,
                                counted_qty: item.counted_qty ?? 0,
                                sheet_id: sheet.id,
                                new_expiry_date: item.new_expiry_date ?? null,
                                new_sale_price: e.target.value ? parseFloat(e.target.value) : null,
                                new_purchase_price: item.new_purchase_price ?? null,
                              })}
                              placeholder="—"
                              className="input text-xs py-1 px-2 w-24 text-right" />
                          ) : (
                            item.new_sale_price
                              ? <span className="text-primary font-semibold">{formatCurrency(item.new_sale_price)}</span>
                              : <span className="text-gray-300">—</span>
                          )}
                        </td>
                        {/* New purchase price */}
                        <td className="px-3 py-2.5 text-right">
                          {canEdit && !isValidated ? (
                            <input type="number" min="0" step="0.01"
                              value={item.new_purchase_price ?? ''}
                              onChange={e => saveItemMut.mutate({
                                product_id: item.product_id,
                                counted_qty: item.counted_qty ?? 0,
                                sheet_id: sheet.id,
                                new_expiry_date: item.new_expiry_date ?? null,
                                new_sale_price: item.new_sale_price ?? null,
                                new_purchase_price: e.target.value ? parseFloat(e.target.value) : null,
                              })}
                              placeholder="—"
                              className="input text-xs py-1 px-2 w-24 text-right" />
                          ) : (
                            item.new_purchase_price
                              ? <span className="text-gray-700 font-semibold">{formatCurrency(item.new_purchase_price)}</span>
                              : <span className="text-gray-300">—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {showAddProd && (
        <AddProductModal sessionId={sessionId} sheetId={sheet.id} onClose={() => setShowAddProd(false)} />
      )}
    </div>
  )
}

// ─── Scanner Types ────────────────────────────────────────────────────────────

interface ScannedProduct {
  id: number
  name: string
  internal_code: string
  unit?: { abbreviation: string }
  stock_level?: { qty_on_hand: number }
}

interface ScanEntry {
  product_name: string
  counted_qty: number
  action: 'added' | 'updated'
}

// ─── Scan History ─────────────────────────────────────────────────────────────

function ScanHistory({ entries }: { entries: ScanEntry[] }) {
  if (!entries.length) return null
  return (
    <div className="space-y-1 max-h-44 overflow-y-auto">
      {entries.map((e, i) => (
        <div key={i} className="flex items-center gap-3 py-1.5 px-3 rounded-lg bg-white">
          <CheckCircle2 size={13} className="text-emerald-500 flex-shrink-0" />
          <p className="text-sm text-gray-700 flex-1 truncate">{e.product_name}</p>
          <span className="text-xs font-bold text-gray-900 tabular-nums">{formatNumber(e.counted_qty, 3)}</span>
          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
            e.action === 'added' ? 'bg-primary-50 text-primary-700' : 'bg-amber-50 text-amber-700'
          }`}>{e.action === 'added' ? 'Ajouté' : 'Mis à jour'}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Scan Product Panel (partagé HID + Caméra) ───────────────────────────────

function ScanProductPanel({
  product, qty, setQty, onConfirm, onClear, saving, existingQty,
}: {
  product: ScannedProduct | null
  qty: string
  setQty: (v: string) => void
  onConfirm: () => void
  onClear: () => void
  saving: boolean
  existingQty: number | null
}) {
  const qtyRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (product && qtyRef.current) {
      qtyRef.current.focus()
      qtyRef.current.select()
    }
  }, [product])

  if (!product) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 py-14 text-gray-300">
        <QrCode size={52} />
        <p className="text-sm text-gray-400">En attente d'un scan...</p>
      </div>
    )
  }

  return (
    <div className="p-5 space-y-4">
      <div className="bg-primary-50 border border-primary-100 rounded-2xl p-4 flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-bold text-gray-900 text-base leading-tight">{product.name}</p>
          <p className="text-xs font-mono text-gray-500 mt-0.5">{product.internal_code}</p>
          <div className="flex flex-wrap items-center gap-4 mt-2 text-sm">
            <span className="text-gray-500">
              Stock théorique : <span className="font-bold text-gray-900">
                {formatNumber(product.stock_level?.qty_on_hand ?? 0, 3)} {product.unit?.abbreviation ?? ''}
              </span>
            </span>
            {existingQty !== null && (
              <span className="text-amber-600 font-semibold">
                Déjà compté : {formatNumber(existingQty, 3)}
              </span>
            )}
          </div>
        </div>
        <button onClick={onClear}
          className="p-1.5 rounded-lg hover:bg-white text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0">
          <X size={15} />
        </button>
      </div>

      <div>
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">
          Quantité comptée {product.unit?.abbreviation ? `(${product.unit.abbreviation})` : ''}
        </label>
        <div className="flex items-center gap-2">
          <button onClick={() => setQty(String(Math.max(0, (parseFloat(qty) || 0) - 1)))}
            className="w-12 h-12 rounded-xl border-2 border-gray-200 flex items-center justify-center text-xl font-bold text-gray-600 hover:border-primary hover:text-primary hover:bg-primary-50 transition-all">
            −
          </button>
          <input ref={qtyRef} type="number" min="0" step="0.001" value={qty}
            onChange={e => setQty(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onConfirm() } }}
            className="flex-1 text-center text-3xl font-bold border-2 border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          <button onClick={() => setQty(String((parseFloat(qty) || 0) + 1))}
            className="w-12 h-12 rounded-xl border-2 border-gray-200 flex items-center justify-center text-xl font-bold text-gray-600 hover:border-primary hover:text-primary hover:bg-primary-50 transition-all">
            +
          </button>
        </div>
      </div>

      <button onClick={onConfirm} disabled={saving || !qty || isNaN(parseFloat(qty))}
        className="w-full py-4 rounded-xl bg-primary text-white font-bold text-base flex items-center justify-center gap-2 disabled:opacity-50 hover:bg-primary-700 transition-colors">
        {saving ? <Loader2 size={20} className="animate-spin" /> : <CheckCircle2 size={20} />}
        {existingQty !== null ? 'Mettre à jour' : 'Confirmer'}
      </button>
    </div>
  )
}

// ─── HID Scanner Panel ────────────────────────────────────────────────────────

function HidScannerPanel({
  sessionItems, sessionId, onHistoryAdd,
}: {
  sessionItems: SessionItem[]
  sessionId: number
  onHistoryAdd: (e: ScanEntry) => void
}) {
  const [barcode, setBarcode]       = useState('')
  const [product, setProduct]       = useState<ScannedProduct | null>(null)
  const [qty, setQty]               = useState('1')
  const [lookupError, setLookupError] = useState<string | null>(null)
  const [looking, setLooking]       = useState(false)
  const [saving, setSaving]         = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const qc = useQueryClient()

  const clearProduct = () => {
    setProduct(null); setBarcode(''); setLookupError(null); setQty('1')
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  const lookup = async (code: string) => {
    const trimmed = code.trim()
    if (!trimmed) return
    setLooking(true); setLookupError(null)
    try {
      const { data } = await api.get('/products/barcode', { params: { barcode: trimmed } })
      setProduct(data); setQty('1')
    } catch (e: any) {
      setLookupError(e?.response?.data?.message ?? `"${trimmed}" introuvable`)
    } finally {
      setLooking(false)
    }
  }

  const existingItem = product ? sessionItems.find(i => i.product_id === product.id) : null

  const confirm = async () => {
    if (!product) return
    const qtyNum = parseFloat(qty)
    if (isNaN(qtyNum) || qtyNum < 0) return
    setSaving(true)
    try {
      await api.post(`/inventory-sessions/${sessionId}/items`, { product_id: product.id, counted_qty: qtyNum })
      qc.invalidateQueries({ queryKey: ['inventory-session', sessionId] })
      onHistoryAdd({ product_name: product.name, counted_qty: qtyNum, action: existingItem ? 'updated' : 'added' })
      toast.success(`✓ ${product.name}`)
      clearProduct()
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Erreur enregistrement')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col">
      <div className="px-5 py-4 bg-gray-50 border-b">
        <div className="relative">
          <Barcode size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input ref={inputRef} type="text" value={barcode} autoFocus autoComplete="off"
            onChange={e => setBarcode(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { lookup(barcode); setBarcode('') } }}
            placeholder="Scanner ou saisir le code-barres + Entrée..."
            className="w-full pl-10 pr-10 py-3 text-sm border-2 border-gray-200 rounded-xl focus:outline-none focus:border-primary bg-white"
          />
          {looking && <Loader2 size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 animate-spin text-primary" />}
        </div>
        {lookupError && (
          <p className="mt-2 text-sm text-red-600 flex items-center gap-1.5">
            <AlertTriangle size={13} /> {lookupError}
          </p>
        )}
      </div>
      <ScanProductPanel product={product} qty={qty} setQty={setQty}
        onConfirm={confirm} onClear={clearProduct} saving={saving}
        existingQty={existingItem ? parseFloat(String(existingItem.counted_qty ?? 0)) : null}
      />
    </div>
  )
}

// ─── Camera Scanner Panel ─────────────────────────────────────────────────────

function CameraScannerPanel({
  sessionItems, sessionId, onHistoryAdd,
}: {
  sessionItems: SessionItem[]
  sessionId: number
  onHistoryAdd: (e: ScanEntry) => void
}) {
  const videoRef        = useRef<HTMLVideoElement>(null)
  const readerRef       = useRef<any>(null)
  const productFoundRef = useRef(false)
  const [product, setProduct]           = useState<ScannedProduct | null>(null)
  const [qty, setQty]                   = useState('1')
  const [saving, setSaving]             = useState(false)
  const [camError, setCamError]         = useState<string | null>(null)
  const [scanFeedback, setScanFeedback] = useState<string | null>(null)
  const qc = useQueryClient()

  useEffect(() => {
    let mounted = true

    const start = async () => {
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser')
        if (!mounted || !videoRef.current) return
        const reader = new BrowserMultiFormatReader()
        readerRef.current = reader
        await reader.decodeFromVideoDevice(undefined, videoRef.current, async (result) => {
          if (!mounted || productFoundRef.current || !result) return
          productFoundRef.current = true
          const code = result.getText()
          try {
            const { data } = await api.get('/products/barcode', { params: { barcode: code } })
            if (!mounted) return
            setProduct(data); setQty('1')
          } catch (e: any) {
            if (!mounted) return
            setScanFeedback(e?.response?.data?.message ?? `"${code}" introuvable`)
            setTimeout(() => { if (mounted) { setScanFeedback(null); productFoundRef.current = false } }, 2500)
          }
        })
      } catch {
        if (mounted) setCamError("Accès caméra refusé. Autorisez-la dans les paramètres du navigateur.")
      }
    }

    start()
    return () => {
      mounted = false
      try { readerRef.current?.reset() } catch {}
    }
  }, [])

  const clearProduct = () => { setProduct(null); setQty('1'); productFoundRef.current = false }

  const existingItem = product ? sessionItems.find(i => i.product_id === product.id) : null

  const confirm = async () => {
    if (!product) return
    const qtyNum = parseFloat(qty)
    if (isNaN(qtyNum) || qtyNum < 0) return
    setSaving(true)
    try {
      await api.post(`/inventory-sessions/${sessionId}/items`, { product_id: product.id, counted_qty: qtyNum })
      qc.invalidateQueries({ queryKey: ['inventory-session', sessionId] })
      onHistoryAdd({ product_name: product.name, counted_qty: qtyNum, action: existingItem ? 'updated' : 'added' })
      toast.success(`✓ ${product.name}`)
      clearProduct()
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Erreur enregistrement')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col">
      <div className="relative bg-black flex-shrink-0" style={{ height: 240 }}>
        {camError ? (
          <div className="h-full flex flex-col items-center justify-center gap-3 text-center px-6">
            <Camera size={36} className="text-gray-500" />
            <p className="text-sm text-gray-400">{camError}</p>
          </div>
        ) : (
          <>
            <video ref={videoRef} className="w-full h-full object-cover" autoPlay playsInline muted />
            {!product && !scanFeedback && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-52 h-28 relative">
                  <span className="absolute top-0 left-0 w-5 h-5 border-t-[3px] border-l-[3px] border-white rounded-tl-sm" />
                  <span className="absolute top-0 right-0 w-5 h-5 border-t-[3px] border-r-[3px] border-white rounded-tr-sm" />
                  <span className="absolute bottom-0 left-0 w-5 h-5 border-b-[3px] border-l-[3px] border-white rounded-bl-sm" />
                  <span className="absolute bottom-0 right-0 w-5 h-5 border-b-[3px] border-r-[3px] border-white rounded-br-sm" />
                  <div className="absolute inset-x-0 top-1/2 -translate-y-0.5 h-0.5 bg-red-500/80 animate-pulse" />
                </div>
              </div>
            )}
            {scanFeedback && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                <div className="text-center text-white px-6">
                  <AlertTriangle size={28} className="mx-auto mb-1.5 text-amber-400" />
                  <p className="text-sm">{scanFeedback}</p>
                </div>
              </div>
            )}
          </>
        )}
      </div>
      <ScanProductPanel product={product} qty={qty} setQty={setQty}
        onConfirm={confirm} onClear={clearProduct} saving={saving}
        existingQty={existingItem ? parseFloat(String(existingItem.counted_qty ?? 0)) : null}
      />
    </div>
  )
}

// ─── Scanner Modal ────────────────────────────────────────────────────────────

function ScannerModal({ session, sessionId, onClose }: {
  session: SessionDetail
  sessionId: number
  onClose: () => void
}) {
  const [mode, setMode]       = useState<'select' | 'hid' | 'camera'>('select')
  const [history, setHistory] = useState<ScanEntry[]>([])

  const addHistory = (e: ScanEntry) => setHistory(prev => [e, ...prev].slice(0, 15))

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden" style={{ maxHeight: '95vh' }}>
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b bg-gray-50 flex-shrink-0">
          {mode !== 'select' && (
            <button onClick={() => setMode('select')}
              className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-500 transition-colors">
              <ArrowLeft size={15} />
            </button>
          )}
          <div className="flex items-center gap-2 flex-1">
            <QrCode size={17} className="text-primary" />
            <h2 className="font-bold text-gray-900 text-sm">
              Mode Scanner
              {mode !== 'select' && (
                <span className="font-normal text-gray-400 ml-1.5 text-xs">
                  — {mode === 'hid' ? 'Terminal HID / USB' : 'Caméra'}
                </span>
              )}
            </h2>
          </div>
          {history.length > 0 && (
            <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded-full">
              {history.length} scanné{history.length > 1 ? 's' : ''}
            </span>
          )}
          <button onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-400 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {mode === 'select' && (
            <div className="p-5 space-y-4">
              <p className="text-sm text-gray-500">Choisissez votre méthode de scan :</p>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => setMode('hid')}
                  className="flex flex-col items-center gap-3 p-5 border-2 border-gray-200 rounded-2xl hover:border-primary hover:bg-primary-50 transition-all group text-center">
                  <div className="w-14 h-14 rounded-2xl bg-primary-50 group-hover:bg-primary-100 flex items-center justify-center transition-colors">
                    <Barcode size={28} className="text-primary" />
                  </div>
                  <div>
                    <p className="font-bold text-gray-900 text-sm">Scanner HID / USB</p>
                    <p className="text-xs text-gray-500 mt-1 leading-relaxed">Pistolet filaire, terminal Bluetooth, douchette. Scanne automatiquement dans le champ.</p>
                  </div>
                </button>
                <button onClick={() => setMode('camera')}
                  className="flex flex-col items-center gap-3 p-5 border-2 border-gray-200 rounded-2xl hover:border-emerald-400 hover:bg-emerald-50 transition-all group text-center">
                  <div className="w-14 h-14 rounded-2xl bg-emerald-50 group-hover:bg-emerald-100 flex items-center justify-center transition-colors">
                    <Camera size={28} className="text-emerald-600" />
                  </div>
                  <div>
                    <p className="font-bold text-gray-900 text-sm">Scanner Caméra</p>
                    <p className="text-xs text-gray-500 mt-1 leading-relaxed">Smartphone ou tablette. Utilise la caméra de l'appareil pour lire les codes-barres.</p>
                  </div>
                </button>
              </div>
              {history.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    Historique de cette session de scan
                  </p>
                  <ScanHistory entries={history} />
                </div>
              )}
            </div>
          )}
          {mode === 'hid' && (
            <div>
              <HidScannerPanel sessionItems={session.items} sessionId={sessionId} onHistoryAdd={addHistory} />
              {history.length > 0 && (
                <div className="px-5 pb-5 border-t bg-gray-50 pt-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Historique</p>
                  <ScanHistory entries={history} />
                </div>
              )}
            </div>
          )}
          {mode === 'camera' && (
            <div>
              <CameraScannerPanel sessionItems={session.items} sessionId={sessionId} onHistoryAdd={addHistory} />
              {history.length > 0 && (
                <div className="px-5 pb-5 border-t bg-gray-50 pt-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Historique</p>
                  <ScanHistory entries={history} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Session Detail View ─────────────────────────────────────────────────────

function SessionDetail({ sessionId, onBack }: { sessionId: number; onBack: () => void }) {
  const [activeTab, setActiveTab]   = useState<'sheets' | 'items'>('sheets')
  const [showCreateSheet, setShowCreateSheet] = useState(false)
  const [showAddProduct, setShowAddProduct]   = useState(false)
  const [showScanner, setShowScanner]         = useState(false)
  const [search, setSearch]                   = useState('')
  const [filterCounted, setFilterCounted]     = useState<'' | 'counted' | 'pending'>('')
  const qc = useQueryClient()
  const confirm = useConfirm()

  const { data: session, isLoading } = useQuery<SessionDetail>({
    queryKey: ['inventory-session', sessionId],
    queryFn: () => api.get(`/inventory-sessions/${sessionId}`).then(r => r.data),
    refetchInterval: 8000,
  })

  const transmitMut = useMutation({
    mutationFn: () => api.post(`/inventory-sessions/${sessionId}/transmit`),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['inventory-session', sessionId] })
      qc.invalidateQueries({ queryKey: ['inventory-sessions'] })
      qc.invalidateQueries({ queryKey: ['stock-levels'] })
      qc.invalidateQueries({ queryKey: ['stock-valuation-kpi'] })
      toast.success(res.data.message ?? 'Stock mis à jour')
    },
    onError: (err: any) => toast.error(err?.response?.data?.message ?? 'Erreur lors de la transmission'),
  })

  const startMut = useMutation({
    mutationFn: () => api.post(`/inventory-sessions/${sessionId}/start`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory-session', sessionId] })
      qc.invalidateQueries({ queryKey: ['inventory-sessions'] })
      toast.success('Inventaire démarré')
    },
    onError: (err: any) => toast.error(err?.response?.data?.message ?? 'Erreur lors du démarrage'),
  })

  const updateQtyMut = useMutation({
    mutationFn: (d: { product_id: number; counted_qty: number }) =>
      api.post(`/inventory-sessions/${sessionId}/items`, d),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inventory-session', sessionId] }),
  })

  const removeMut = useMutation({
    mutationFn: (itemId: number) => api.delete(`/inventory-sessions/${sessionId}/items/${itemId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inventory-session', sessionId] }),
  })

  if (isLoading || !session) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 size={24} className="animate-spin text-primary" />
      </div>
    )
  }

  const canEdit     = ['draft', 'counting', 'pending'].includes(session.status)
  const canStart    = session.status === 'scheduled'
  const canTransmit = !['completed', 'cancelled', 'scheduled'].includes(session.status)
  const activeSheets = (session.sheets ?? []).filter(s => s.status !== 'cancelled')
  const allValidated = activeSheets.length > 0 && activeSheets.every(s => s.status === 'validated')
  const hasSheets    = (session.sheets ?? []).length > 0

  // All items (across all sheets + unassigned)
  const allItems     = session.items ?? []
  const filtered     = allItems
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

  const countedItems    = allItems.filter(i => i.counted_qty !== null)
  const pendingItems    = allItems.filter(i => i.counted_qty === null)
  const totalVariance   = countedItems.reduce((s, i) => s + (varianceValue(i) ?? 0), 0)
  const positiveVariance = countedItems.reduce((s, i) => { const v = varianceValue(i) ?? 0; return s + (v > 0 ? v : 0) }, 0)
  const negativeVariance = countedItems.reduce((s, i) => { const v = varianceValue(i) ?? 0; return s + (v < 0 ? v : 0) }, 0)

  const draftSheetsCount     = (session.sheets ?? []).filter(s => !['validated', 'cancelled'].includes(s.status)).length
  const validatedSheetsCount = (session.sheets ?? []).filter(s => s.status === 'validated').length

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <button onClick={onBack}
            className="mt-0.5 p-2 rounded-xl hover:bg-gray-100 text-gray-500 transition-colors">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{session.name}</h1>
            <div className="flex items-center gap-3 mt-1 text-xs text-gray-400 flex-wrap">
              <span className={`badge-${session.type === 'full' ? 'info' : 'gray'}`}>
                {session.type === 'full' ? 'Complet' : 'Par fiches'}
              </span>
              {session.startedBy && (
                <span className="flex items-center gap-1"><User size={11} /> {session.startedBy.name}</span>
              )}
              {session.scheduled_at && session.status === 'scheduled' && (
                <span className="flex items-center gap-1 text-blue-600 font-semibold">
                  <Clock size={11} /> Planifié le {formatDate(session.scheduled_at)}
                </span>
              )}
              {session.started_at && (
                <span className="flex items-center gap-1"><Calendar size={11} /> {formatDate(session.started_at)}</span>
              )}
              {session.sales_mode === 'blocked' && (
                <span className="flex items-center gap-1 text-red-500 font-semibold">
                  <ShieldAlert size={11} /> Ventes bloquées
                </span>
              )}
              {session.validated_at && (
                <span className="flex items-center gap-1 text-emerald-600">
                  <CheckCircle2 size={11} /> Transmis le {formatDate(session.validated_at)}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
          {canStart && (
            <button
              onClick={async () => {
                if (await confirm('Démarrer cet inventaire maintenant sans attendre l\'heure planifiée ?'))
                  startMut.mutate()
              }}
              disabled={startMut.isPending}
              className="btn-primary text-sm flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50">
              {startMut.isPending
                ? <><Loader2 size={14} className="animate-spin" /> Démarrage...</>
                : <><Play size={14} /> Démarrer maintenant</>}
            </button>
          )}
          {canEdit && !hasSheets && (
            <button onClick={() => setShowAddProduct(true)}
              className="btn-secondary text-sm flex items-center gap-2">
              <Plus size={15} /> Ajouter un article
            </button>
          )}
          {canEdit && (
            <button onClick={() => setShowScanner(true)}
              className="btn-secondary text-sm flex items-center gap-2">
              <QrCode size={15} /> Scanner
            </button>
          )}
          {canEdit && (
            <button onClick={() => setShowCreateSheet(true)}
              className="btn-secondary text-sm flex items-center gap-2">
              <Layers size={15} /> Nouvelle fiche
            </button>
          )}
          {canTransmit && (
            <button
              onClick={async () => {
                const hasPending = hasSheets && draftSheetsCount > 0
                const msg = hasPending
                  ? `${draftSheetsCount} fiche(s) non validée(s) seront ANNULÉES. Seules les fiches validées (${validatedSheetsCount}) seront transmises au stock. Confirmer ?`
                  : 'Transmettre cet inventaire au stock ? Cette action est irréversible.'
                if (await confirm(msg))
                  transmitMut.mutate()
              }}
              disabled={transmitMut.isPending}
              className="btn-primary text-sm flex items-center gap-2 disabled:opacity-50">
              {transmitMut.isPending
                ? <><Loader2 size={14} className="animate-spin" /> Transmission...</>
                : <><Send size={14} /> Transmettre au stock</>}
            </button>
          )}
        </div>
      </div>

      {/* Status flow */}
      <StepFlow status={session.status} />

      {/* Alerts */}
      {hasSheets && draftSheetsCount > 0 && session.status !== 'completed' && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-3 flex items-start gap-3">
          <AlertTriangle size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800">
            <span className="font-semibold">{draftSheetsCount} fiche(s) non encore validée(s).</span>{' '}
            Validez toutes les fiches pour pouvoir transmettre au stock.
          </p>
        </div>
      )}

      {transmitMut.isError && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-3 text-sm text-red-700 flex items-center gap-2">
          <AlertTriangle size={16} /> {(transmitMut.error as any)?.response?.data?.message ?? 'Erreur lors de la transmission.'}
        </div>
      )}

      {session.status === 'completed' && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-4 flex items-start gap-3">
          <CheckCircle2 size={20} className="text-emerald-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-emerald-800">Inventaire transmis avec succès</p>
            <p className="text-sm text-emerald-700 mt-0.5">
              Les niveaux de stock ont été mis à jour.
              Écart total : <span className={`font-bold ${(session.total_variance_value ?? 0) >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                {formatCurrency(session.total_variance_value ?? 0)}
              </span>
            </p>
          </div>
        </div>
      )}

      {/* KPI mini-cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="card p-4">
          <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">
            {hasSheets ? 'Fiches' : 'Articles total'}
          </p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {hasSheets ? (session.sheets ?? []).length : allItems.length}
          </p>
          {hasSheets && (
            <p className="text-xs mt-0.5">
              <span className="text-emerald-600">{validatedSheetsCount} validée(s)</span>
              {draftSheetsCount > 0 && <span className="text-amber-600 ml-2">{draftSheetsCount} en cours</span>}
            </p>
          )}
        </div>
        <div className="card p-4">
          <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Articles comptés</p>
          <p className="text-2xl font-bold text-emerald-600 mt-1">{countedItems.length}</p>
          {pendingItems.length > 0 && (
            <p className="text-xs text-amber-500 mt-0.5">{pendingItems.length} restant(s)</p>
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

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        <button onClick={() => setActiveTab('sheets')}
          className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all ${activeTab === 'sheets' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
          <span className="flex items-center gap-2">
            <Layers size={14} /> Fiches {(session.sheets ?? []).length > 0 && `(${(session.sheets ?? []).length})`}
          </span>
        </button>
        <button onClick={() => setActiveTab('items')}
          className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all ${activeTab === 'items' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
          <span className="flex items-center gap-2">
            <Package size={14} /> Tous les articles ({allItems.length})
          </span>
        </button>
      </div>

      {/* ── Sheets Tab ── */}
      {activeTab === 'sheets' && (
        <div className="space-y-3">
          {(session.sheets ?? []).length === 0 ? (
            <div className="card p-12 text-center">
              <Layers size={36} className="mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500 font-medium">Aucune fiche d'inventaire</p>
              <p className="text-sm text-gray-400 mt-1 max-w-sm mx-auto">
                Créez des fiches par rayon pour organiser votre inventaire. Vous pouvez avoir plusieurs fiches par inventaire.
              </p>
              {canEdit && (
                <button onClick={() => setShowCreateSheet(true)}
                  className="btn-primary text-sm mt-4 inline-flex items-center gap-2">
                  <Plus size={14} /> Créer une fiche
                </button>
              )}
            </div>
          ) : (
            (session.sheets ?? []).map(sheet => (
              <SheetCard key={sheet.id} sheet={sheet} sessionId={sessionId} canEdit={canEdit} />
            ))
          )}
        </div>
      )}

      {/* ── All items Tab ── */}
      {activeTab === 'items' && (
        <div className="card p-0 overflow-hidden">
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
                  const v  = variance(item)
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
                          <InlineQtyEditor item={item}
                            onSave={qty => updateQtyMut.mutate({ product_id: item.product_id, counted_qty: qty })} />
                        ) : (
                          isCounted
                            ? <span className="font-semibold text-gray-900">{formatNumber(parseFloat(String(item.counted_qty)), 3)}</span>
                            : <span className="text-gray-300 text-xs">Non compté</span>
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
      )}

      {showCreateSheet && <CreateSheetModal sessionId={sessionId} onClose={() => setShowCreateSheet(false)} />}
      {showAddProduct && (
        <AddProductModal sessionId={sessionId} sheetId={null} onClose={() => setShowAddProduct(false)} />
      )}
      {showScanner && session && (
        <ScannerModal session={session} sessionId={sessionId} onClose={() => setShowScanner(false)} />
      )}
    </div>
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

  const sessions          = data?.data ?? []
  const activeSessions    = sessions.filter(s => ['draft', 'counting', 'validating', 'pending'].includes(s.status))
  const scheduledSessions = sessions.filter(s => s.status === 'scheduled')
  const lastCompleted     = sessions.find(s => s.status === 'completed')

  return (
    <div className="p-6 space-y-6">
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

      {/* Scheduled sessions banner */}
      {scheduledSessions.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-5 py-3 flex items-center gap-3">
          <Clock size={18} className="text-blue-500 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-blue-800">
              {scheduledSessions.length} inventaire(s) planifié(s)
            </p>
            <p className="text-xs text-blue-600 mt-0.5">
              {scheduledSessions.map(s => `"${s.name}" — ${s.scheduled_at ? formatDate(s.scheduled_at) : ''}`).join(' · ')}
            </p>
          </div>
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card p-4 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-primary-50 flex items-center justify-center text-primary flex-shrink-0">
            <ClipboardList size={20} />
          </div>
          <div>
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Sessions actives</p>
            <p className="text-xl font-bold text-gray-900">{activeSessions.length}</p>
            {scheduledSessions.length > 0 && (
              <p className="text-xs text-blue-500 mt-0.5">{scheduledSessions.length} planifié(s)</p>
            )}
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
                <th className="text-left px-4 py-3">Date</th>
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
                      {s.type === 'full' ? 'Complet' : 'Par fiches'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-700">
                    {s.items_count ?? 0}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {s.startedBy?.name ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {s.status === 'scheduled' && s.scheduled_at
                      ? <span className="flex items-center gap-1 text-blue-600 font-medium">
                          <Clock size={11} /> {formatDate(s.scheduled_at)}
                        </span>
                      : s.started_at ? formatDate(s.started_at) : '—'
                    }
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
