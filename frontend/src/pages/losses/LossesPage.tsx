import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../lib/api'
import { formatCurrency, formatDate, formatNumber } from '../../lib/format'
import {
  TrendingDown, Plus, AlertTriangle, CheckCircle, XCircle,
  Search, Filter, Trash2, ChevronLeft, ChevronRight,
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Product { id: number; name: string; internal_code?: string }
interface User    { id: number; name: string }

interface Loss {
  id: number
  reference: string
  product?: Product
  user?: User
  validator?: User
  type: string
  qty: number
  unit_cost: number
  total_cost: number
  notes?: string
  status: 'pending' | 'validated' | 'rejected'
  validated_at?: string
  created_at: string
}

interface LossStats {
  total_count: number
  total_value: number
  pending_count: number
  month_value: number
  by_type: Record<string, { count: number; value: number }>
}

// ─── Constants ───────────────────────────────────────────────────────────────

const LOSS_TYPES: Record<string, { label: string; color: string }> = {
  breakage:           { label: 'Casse',            color: 'bg-orange-100 text-orange-700' },
  expiry:             { label: 'Péremption',        color: 'bg-red-100 text-red-700' },
  theft:              { label: 'Vol',               color: 'bg-purple-100 text-purple-700' },
  internal_use:       { label: 'Usage interne',     color: 'bg-blue-100 text-blue-700' },
  commercial_gesture: { label: 'Geste commercial',  color: 'bg-green-100 text-green-700' },
  other:              { label: 'Autre',             color: 'bg-gray-100 text-gray-600' },
}

const STATUS_STYLES: Record<string, { label: string; cls: string }> = {
  pending:   { label: 'En attente', cls: 'bg-yellow-100 text-yellow-700' },
  validated: { label: 'Validée',    cls: 'bg-green-100 text-green-700' },
  rejected:  { label: 'Rejetée',    cls: 'bg-red-100 text-red-700' },
}

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

// ─── New Loss Modal ───────────────────────────────────────────────────────────

function NewLossModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [productSearch, setProductSearch] = useState('')
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [qty, setQty] = useState('')
  const [type, setType] = useState<string>('breakage')
  const [notes, setNotes] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)

  const { data: suggestions } = useQuery({
    queryKey: ['product-search', productSearch],
    queryFn: () => api.get('/products', { params: { search: productSearch, per_page: 8 } }).then(r => r.data.data ?? []),
    enabled: productSearch.length >= 2,
  })

  const { mutate: save, isPending } = useMutation({
    mutationFn: (body: object) => api.post('/losses', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['losses'] })
      qc.invalidateQueries({ queryKey: ['losses-stats'] })
      onClose()
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedProduct) return
    save({ product_id: selectedProduct.id, qty: parseFloat(qty), type, notes: notes || undefined })
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-lg font-bold text-gray-900">Enregistrer une perte</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Product search */}
          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 mb-1">Produit *</label>
            {selectedProduct ? (
              <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                <div>
                  <p className="font-medium text-gray-900">{selectedProduct.name}</p>
                  {selectedProduct.internal_code && <p className="text-xs text-gray-500">{selectedProduct.internal_code}</p>}
                </div>
                <button type="button" onClick={() => setSelectedProduct(null)} className="text-gray-400 hover:text-red-500">×</button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    className="input pl-9 w-full"
                    placeholder="Rechercher un produit…"
                    value={productSearch}
                    onChange={e => { setProductSearch(e.target.value); setShowSuggestions(true) }}
                    onFocus={() => setShowSuggestions(true)}
                  />
                </div>
                {showSuggestions && (suggestions ?? []).length > 0 && (
                  <div className="absolute z-10 bg-white border rounded-lg shadow-lg mt-1 w-full max-h-48 overflow-auto">
                    {(suggestions as Product[]).map(p => (
                      <button
                        key={p.id}
                        type="button"
                        className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b last:border-0"
                        onClick={() => { setSelectedProduct(p); setProductSearch(p.name); setShowSuggestions(false) }}
                      >
                        <p className="font-medium text-sm text-gray-900">{p.name}</p>
                        {p.internal_code && <p className="text-xs text-gray-400">{p.internal_code}</p>}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Quantity */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Quantité *</label>
            <input
              type="number" min="0.001" step="0.001"
              className="input w-full"
              placeholder="0.000"
              value={qty}
              onChange={e => setQty(e.target.value)}
              required
            />
          </div>

          {/* Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type de perte *</label>
            <select className="input w-full" value={type} onChange={e => setType(e.target.value)}>
              {Object.entries(LOSS_TYPES).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              className="input w-full"
              rows={2}
              placeholder="Description de la perte…"
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 btn-secondary">Annuler</button>
            <button type="submit" disabled={isPending || !selectedProduct || !qty} className="flex-1 btn-primary">
              {isPending ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function LossesPage() {
  const qc = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)

  const params = {
    page,
    per_page: 20,
    search: search || undefined,
    type: filterType || undefined,
    status: filterStatus || undefined,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
  }

  const { data } = useQuery({
    queryKey: ['losses', params],
    queryFn: () => api.get('/losses', { params }).then(r => r.data),
  })

  const { data: stats } = useQuery<LossStats>({
    queryKey: ['losses-stats'],
    queryFn: () => api.get('/losses/stats').then(r => r.data),
  })

  const { mutate: validateLoss } = useMutation({
    mutationFn: (id: number) => api.post(`/losses/${id}/validate`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['losses'] })
      qc.invalidateQueries({ queryKey: ['losses-stats'] })
    },
  })

  const { mutate: rejectLoss } = useMutation({
    mutationFn: (id: number) => api.post(`/losses/${id}/reject`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['losses'] })
      qc.invalidateQueries({ queryKey: ['losses-stats'] })
    },
  })

  const { mutate: deleteLoss } = useMutation({
    mutationFn: (id: number) => api.delete(`/losses/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['losses'] })
      qc.invalidateQueries({ queryKey: ['losses-stats'] })
    },
  })

  const losses: Loss[] = data?.data ?? []
  const meta = data?.meta ?? {}

  const resetFilters = () => {
    setSearch(''); setFilterType(''); setFilterStatus('')
    setDateFrom(''); setDateTo(''); setPage(1)
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <TrendingDown size={24} className="text-red-500" /> Pertes &amp; Démarque
        </h1>
        <button
          onClick={() => setShowModal(true)}
          className="btn-primary flex items-center gap-2"
        >
          <Plus size={18} /> Enregistrer une perte
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Total pertes"
            value={String(stats.total_count)}
            sub={`${stats.pending_count} en attente`}
            icon={<TrendingDown size={20} className="text-red-600" />}
            color="bg-red-50"
          />
          <StatCard
            label="Valeur totale"
            value={formatCurrency(stats.total_value)}
            sub="pertes validées"
            icon={<AlertTriangle size={20} className="text-orange-600" />}
            color="bg-orange-50"
          />
          <StatCard
            label="Ce mois-ci"
            value={formatCurrency(stats.month_value)}
            sub="pertes validées"
            icon={<TrendingDown size={20} className="text-purple-600" />}
            color="bg-purple-50"
          />
          <StatCard
            label="En attente"
            value={String(stats.pending_count)}
            sub="à valider/rejeter"
            icon={<AlertTriangle size={20} className="text-yellow-600" />}
            color="bg-yellow-50"
          />
        </div>
      )}

      {/* Type breakdown pills */}
      {stats && Object.keys(stats.by_type).length > 0 && (
        <div className="card p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Répartition par type (validées)</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(stats.by_type).map(([type, d]) => {
              const t = LOSS_TYPES[type] ?? { label: type, color: 'bg-gray-100 text-gray-600' }
              return (
                <button
                  key={type}
                  onClick={() => { setFilterType(filterType === type ? '' : type); setPage(1) }}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-all
                    ${filterType === type ? 'ring-2 ring-offset-1 ring-gray-400' : ''}
                    ${t.color}`}
                >
                  <span>{t.label}</span>
                  <span className="font-bold">{d.count}</span>
                  <span className="opacity-70">· {formatCurrency(d.value)}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="relative flex-1 min-w-48">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              className="input pl-9 w-full"
              placeholder="Rechercher produit…"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
            />
          </div>
          <select
            className="input"
            value={filterType}
            onChange={e => { setFilterType(e.target.value); setPage(1) }}
          >
            <option value="">Tous types</option>
            {Object.entries(LOSS_TYPES).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
          <select
            className="input"
            value={filterStatus}
            onChange={e => { setFilterStatus(e.target.value); setPage(1) }}
          >
            <option value="">Tous statuts</option>
            <option value="pending">En attente</option>
            <option value="validated">Validée</option>
            <option value="rejected">Rejetée</option>
          </select>
          <div className="flex items-center gap-2">
            <input
              type="date" className="input text-sm"
              value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1) }}
            />
            <span className="text-gray-400 text-sm">→</span>
            <input
              type="date" className="input text-sm"
              value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1) }}
            />
          </div>
          {(search || filterType || filterStatus || dateFrom || dateTo) && (
            <button onClick={resetFilters} className="btn-secondary flex items-center gap-1 text-sm">
              <Filter size={14} /> Réinitialiser
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              {['Référence', 'Produit', 'Type', 'Qté', 'Coût unit.', 'Valeur', 'Date', 'Enregistré par', 'Statut', ''].map(h => (
                <th key={h} className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {losses.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-12 text-center text-gray-400">
                  <TrendingDown size={32} className="mx-auto mb-2 opacity-30" />
                  Aucune perte enregistrée
                </td>
              </tr>
            ) : losses.map((l) => {
              const t = LOSS_TYPES[l.type] ?? { label: l.type, color: 'bg-gray-100 text-gray-600' }
              const s = STATUS_STYLES[l.status] ?? { label: l.status, cls: 'bg-gray-100 text-gray-600' }
              return (
                <tr key={l.id} className="hover:bg-gray-50 group">
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{l.reference ?? '—'}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{l.product?.name ?? '—'}</p>
                    {l.product?.internal_code && (
                      <p className="text-xs text-gray-400">{l.product.internal_code}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${t.color}`}>
                      {t.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 tabular-nums">{formatNumber(l.qty, 3)}</td>
                  <td className="px-4 py-3 tabular-nums text-gray-600">{formatCurrency(l.unit_cost)}</td>
                  <td className="px-4 py-3 font-semibold text-red-600 tabular-nums">{formatCurrency(l.total_cost)}</td>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDate(l.created_at)}</td>
                  <td className="px-4 py-3 text-gray-600">{l.user?.name ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${s.cls}`}>
                      {s.label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {l.status === 'pending' && (
                        <>
                          <button
                            title="Valider"
                            onClick={() => validateLoss(l.id)}
                            className="p-1.5 rounded-lg text-green-600 hover:bg-green-50 transition-colors"
                          >
                            <CheckCircle size={16} />
                          </button>
                          <button
                            title="Rejeter"
                            onClick={() => rejectLoss(l.id)}
                            className="p-1.5 rounded-lg text-orange-600 hover:bg-orange-50 transition-colors"
                          >
                            <XCircle size={16} />
                          </button>
                          <button
                            title="Supprimer"
                            onClick={() => {
                              if (confirm('Annuler cette perte et restaurer le stock ?')) deleteLoss(l.id)
                            }}
                            className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 transition-colors"
                          >
                            <Trash2 size={16} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {/* Pagination */}
        {meta.last_page > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50">
            <p className="text-sm text-gray-500">
              {meta.from}–{meta.to} sur {meta.total} pertes
            </p>
            <div className="flex gap-1">
              <button
                disabled={page === 1}
                onClick={() => setPage(p => p - 1)}
                className="p-1.5 rounded hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={16} />
              </button>
              {Array.from({ length: Math.min(meta.last_page, 7) }, (_, i) => {
                const p = i + 1
                return (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`w-8 h-8 rounded text-sm font-medium transition-colors ${
                      page === p ? 'bg-blue-600 text-white' : 'hover:bg-gray-200 text-gray-700'
                    }`}
                  >
                    {p}
                  </button>
                )
              })}
              <button
                disabled={page === meta.last_page}
                onClick={() => setPage(p => p + 1)}
                className="p-1.5 rounded hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {showModal && <NewLossModal onClose={() => setShowModal(false)} />}
    </div>
  )
}
