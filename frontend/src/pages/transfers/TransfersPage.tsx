import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../lib/api'
import { formatCurrency } from '../../lib/format'
import toast from 'react-hot-toast'
import {
  ArrowLeftRight, Plus, X, Check, ChevronRight, Package,
  Truck, ArrowDownToLine, CheckCircle, XCircle,
  AlertTriangle, Search, Eye, Clock, Ban
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface StoreRef { id: number; name: string; code: string }
interface ProductRef { id: number; name: string; internal_code: string }

interface TransferItem {
  id: number
  product_id: number
  product?: ProductRef
  qty_requested: number
  qty_approved?: number
  qty_shipped?: number
  qty_received?: number
  unit_cost: number
  notes?: string
}

interface Transfer {
  id: number
  reference: string
  from_store_id: number
  to_store_id: number
  status: 'draft' | 'pending' | 'approved' | 'rejected' | 'shipped' | 'received' | 'cancelled'
  fromStore?: StoreRef
  toStore?: StoreRef
  createdBy?: { id: number; name: string }
  validatedBy?: { id: number; name: string }
  shippedBy?: { id: number; name: string }
  receivedBy?: { id: number; name: string }
  notes?: string
  rejection_reason?: string
  validated_at?: string
  shipped_at?: string
  received_at?: string
  items?: TransferItem[]
  items_count?: number
  created_at: string
}

interface ProductSearch { id: number; name: string; internal_code: string; sale_price_ttc: number }
interface StoreList { id: number; name: string; code: string; is_active: boolean }

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  draft:     { label: 'Brouillon',    color: 'text-gray-500',   bg: 'bg-gray-100',   icon: <Clock size={12} /> },
  pending:   { label: 'En attente',   color: 'text-yellow-600', bg: 'bg-yellow-100', icon: <Clock size={12} /> },
  approved:  { label: 'Approuvé',     color: 'text-blue-600',   bg: 'bg-blue-100',   icon: <CheckCircle size={12} /> },
  rejected:  { label: 'Rejeté',       color: 'text-red-600',    bg: 'bg-red-100',    icon: <XCircle size={12} /> },
  shipped:   { label: 'Expédié',      color: 'text-indigo-600', bg: 'bg-indigo-100', icon: <Truck size={12} /> },
  received:  { label: 'Réceptionné',  color: 'text-emerald-600',bg: 'bg-emerald-100',icon: <CheckCircle size={12} /> },
  cancelled: { label: 'Annulé',       color: 'text-gray-400',   bg: 'bg-gray-50',    icon: <Ban size={12} /> },
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CFG[status] ?? STATUS_CFG.draft
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${cfg.color} ${cfg.bg}`}>
      {cfg.icon} {cfg.label}
    </span>
  )
}

function fmtDate(d?: string) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

// ─── Create Transfer Modal ────────────────────────────────────────────────────

function CreateTransferModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [toStoreId, setToStoreId] = useState('')
  const [notes, setNotes] = useState('')
  const [search, setSearch] = useState('')
  const [lines, setLines] = useState<{ product_id: number; name: string; qty: number; notes: string }[]>([])

  const { data: stores = [] } = useQuery<StoreList[]>({
    queryKey: ['stores-list'],
    queryFn: () => api.get('/stores').then(r => r.data),
  })

  const { data: products = [] } = useQuery<ProductSearch[]>({
    queryKey: ['products-search-transfer', search],
    queryFn: () => api.get('/products', { params: { search, per_page: 10 } }).then(r => r.data.data),
    enabled: search.length >= 2,
  })

  const addLine = (p: ProductSearch) => {
    if (lines.find(l => l.product_id === p.id)) return
    setLines(prev => [...prev, { product_id: p.id, name: p.name, qty: 1, notes: '' }])
    setSearch('')
  }

  const mutation = useMutation({
    mutationFn: () => api.post('/store-transfers', {
      to_store_id: Number(toStoreId),
      notes: notes || undefined,
      items: lines.map(l => ({ product_id: l.product_id, qty_requested: l.qty, notes: l.notes || undefined })),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transfers'] })
      toast.success('Demande de transfert envoyée')
      onClose()
    },
    onError: (err: { response?: { data?: { message?: string }; status?: number }; message?: string }) => {
      const status = err?.response?.status
      const msg = err?.response?.data?.message ?? err?.message ?? 'Erreur inconnue'
      console.error('Transfer error:', status, msg, err)
      toast.error(`Erreur (${status ?? '?'}): ${msg}`)
    },
  })

  const activeStores = stores.filter(s => s.is_active)

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl max-h-[92vh] flex flex-col">
        <div className="p-6 border-b flex items-center justify-between flex-shrink-0">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <ArrowLeftRight size={20} className="text-primary" />
            Nouvelle demande de transfert
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Destination store */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Magasin destinataire *
            </label>
            <select
              value={toStoreId}
              onChange={e => setToStoreId(e.target.value)}
              className="input"
            >
              <option value="">Sélectionner un magasin...</option>
              {activeStores.map(s => (
                <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
              ))}
            </select>
          </div>

          {/* Product search */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Ajouter des produits
            </label>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="input pl-9"
                placeholder="Nom ou code produit..."
              />
            </div>
            {search.length >= 2 && products.length > 0 && (
              <div className="mt-1 border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                {products.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => addLine(p)}
                    className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 text-sm border-b last:border-0"
                  >
                    <div className="text-left">
                      <p className="font-medium text-gray-800">{p.name}</p>
                      <p className="text-xs text-gray-400">{p.internal_code}</p>
                    </div>
                    <span className="text-xs text-gray-400">{formatCurrency(p.sale_price_ttc)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Lines */}
          {lines.length > 0 && (
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Produits demandés ({lines.length})</p>
              <div className="space-y-2">
                {lines.map((line, idx) => (
                  <div key={line.product_id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                    <div className="w-8 h-8 bg-indigo-100 rounded-xl flex items-center justify-center flex-shrink-0">
                      <Package size={14} className="text-indigo-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{line.name}</p>
                    </div>
                    <input
                      type="number"
                      value={line.qty}
                      min={0.001}
                      step={0.001}
                      onChange={e => setLines(prev => prev.map((l, i) => i === idx ? { ...l, qty: Number(e.target.value) } : l))}
                      className="w-20 border border-gray-200 rounded-lg px-2 py-1 text-sm text-right font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    <button
                      type="button"
                      onClick={() => setLines(prev => prev.filter((_, i) => i !== idx))}
                      className="text-red-400 hover:text-red-600 p-1 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optionnel)</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="input resize-none"
              rows={2}
              placeholder="Motif de la demande..."
            />
          </div>
        </div>

        <div className="p-6 border-t flex gap-3 flex-shrink-0">
          <button onClick={onClose} className="btn-secondary flex-1">Annuler</button>
          <button
            onClick={() => mutation.mutate()}
            disabled={!toStoreId || lines.length === 0 || mutation.isPending}
            className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <ArrowLeftRight size={16} />
            {mutation.isPending ? 'Envoi...' : 'Envoyer la demande'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Transfer Detail Modal ────────────────────────────────────────────────────

function TransferDetailModal({ transfer: initial, onClose }: { transfer: Transfer; onClose: () => void }) {
  const qc = useQueryClient()
  const [rejectReason, setRejectReason] = useState('')
  const [showRejectInput, setShowRejectInput] = useState(false)

  const { data: transfer } = useQuery<Transfer>({
    queryKey: ['transfer-detail', initial.id],
    queryFn: () => api.get(`/store-transfers/${initial.id}`).then(r => r.data),
    initialData: initial,
  })

  const approve = useMutation({
    mutationFn: () => api.post(`/store-transfers/${transfer.id}/approve`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['transfers'] }); qc.invalidateQueries({ queryKey: ['transfer-detail', transfer.id] }); toast.success('Transfert approuvé') },
    onError: (e: { response?: { data?: { message?: string } } }) => toast.error(e.response?.data?.message ?? 'Erreur'),
  })
  const reject = useMutation({
    mutationFn: () => api.post(`/store-transfers/${transfer.id}/reject`, { rejection_reason: rejectReason }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['transfers'] }); qc.invalidateQueries({ queryKey: ['transfer-detail', transfer.id] }); toast.success('Transfert rejeté'); setShowRejectInput(false) },
    onError: (e: { response?: { data?: { message?: string } } }) => toast.error(e.response?.data?.message ?? 'Erreur'),
  })
  const ship = useMutation({
    mutationFn: () => api.post(`/store-transfers/${transfer.id}/ship`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['transfers'] }); qc.invalidateQueries({ queryKey: ['transfer-detail', transfer.id] }); toast.success('Transfert expédié — stock débité') },
    onError: (e: { response?: { data?: { message?: string } } }) => toast.error(e.response?.data?.message ?? 'Erreur'),
  })
  const receive = useMutation({
    mutationFn: () => api.post(`/store-transfers/${transfer.id}/receive`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['transfers'] }); qc.invalidateQueries({ queryKey: ['transfer-detail', transfer.id] }); toast.success('Réception confirmée — stock crédité') },
    onError: (e: { response?: { data?: { message?: string } } }) => toast.error(e.response?.data?.message ?? 'Erreur'),
  })
  const cancel = useMutation({
    mutationFn: () => api.post(`/store-transfers/${transfer.id}/cancel`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['transfers'] }); onClose(); toast.success('Transfert annulé') },
    onError: (e: { response?: { data?: { message?: string } } }) => toast.error(e.response?.data?.message ?? 'Erreur'),
  })

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="p-6 border-b flex items-start justify-between flex-shrink-0">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h2 className="text-xl font-bold text-gray-900 font-mono">{transfer.reference}</h2>
              <StatusBadge status={transfer.status} />
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <span className="font-medium">{transfer.fromStore?.name}</span>
              <ChevronRight size={14} />
              <span className="font-medium text-indigo-600">{transfer.toStore?.name}</span>
              <span className="text-gray-400">· {fmtDate(transfer.created_at)}</span>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 ml-4"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Rejection reason */}
          {transfer.status === 'rejected' && transfer.rejection_reason && (
            <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-700">
              <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold mb-0.5">Motif du rejet</p>
                <p>{transfer.rejection_reason}</p>
              </div>
            </div>
          )}

          {/* Notes */}
          {transfer.notes && (
            <div className="text-sm text-gray-600 bg-gray-50 rounded-xl p-3">{transfer.notes}</div>
          )}

          {/* Items */}
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-3">Produits ({(transfer.items ?? []).length})</p>
            <div className="space-y-2">
              {(transfer.items ?? []).map(item => (
                <div key={item.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                  <div className="w-8 h-8 bg-indigo-100 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Package size={14} className="text-indigo-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{item.product?.name}</p>
                    <p className="text-xs text-gray-400">{item.product?.internal_code}</p>
                  </div>
                  <div className="text-right text-xs space-y-0.5">
                    <p className="font-semibold text-gray-800">Demandé : {item.qty_requested}</p>
                    {item.qty_approved != null && <p className="text-blue-600">Approuvé : {item.qty_approved}</p>}
                    {item.qty_shipped  != null && <p className="text-indigo-600">Expédié : {item.qty_shipped}</p>}
                    {item.qty_received != null && <p className="text-emerald-600">Reçu : {item.qty_received}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Timeline */}
          <div className="space-y-2 text-xs text-gray-500">
            {transfer.createdBy && <p>Créé par <span className="font-medium text-gray-700">{transfer.createdBy.name}</span> le {fmtDate(transfer.created_at)}</p>}
            {transfer.validatedBy && transfer.validated_at && <p>Traité par <span className="font-medium text-gray-700">{transfer.validatedBy.name}</span> le {fmtDate(transfer.validated_at)}</p>}
            {transfer.shippedBy && transfer.shipped_at && <p>Expédié par <span className="font-medium text-gray-700">{transfer.shippedBy.name}</span> le {fmtDate(transfer.shipped_at)}</p>}
            {transfer.receivedBy && transfer.received_at && <p>Réceptionné par <span className="font-medium text-gray-700">{transfer.receivedBy.name}</span> le {fmtDate(transfer.received_at)}</p>}
          </div>

          {/* Reject input */}
          {showRejectInput && (
            <div className="p-4 bg-red-50 rounded-xl space-y-3">
              <p className="text-sm font-medium text-red-700">Motif du rejet *</p>
              <textarea
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                className="w-full border border-red-200 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 resize-none"
                rows={2}
                placeholder="Expliquez pourquoi ce transfert est rejeté..."
              />
              <div className="flex gap-2">
                <button onClick={() => setShowRejectInput(false)} className="flex-1 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">
                  Annuler
                </button>
                <button
                  onClick={() => reject.mutate()}
                  disabled={!rejectReason || reject.isPending}
                  className="flex-1 py-2 rounded-xl bg-red-500 text-white text-sm font-semibold disabled:opacity-50 hover:bg-red-600"
                >
                  {reject.isPending ? 'Rejet...' : 'Confirmer le rejet'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="p-6 border-t flex gap-2 flex-shrink-0 flex-wrap">
          {transfer.status === 'pending' && (
            <>
              <button onClick={() => approve.mutate()} disabled={approve.isPending}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-blue-500 text-white rounded-xl text-sm font-semibold hover:bg-blue-600 disabled:opacity-50">
                <Check size={15} /> {approve.isPending ? 'Approbation...' : 'Approuver'}
              </button>
              <button onClick={() => setShowRejectInput(true)}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-red-500 text-white rounded-xl text-sm font-semibold hover:bg-red-600">
                <XCircle size={15} /> Rejeter
              </button>
            </>
          )}
          {transfer.status === 'approved' && (
            <button onClick={() => ship.mutate()} disabled={ship.isPending}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-indigo-500 text-white rounded-xl text-sm font-semibold hover:bg-indigo-600 disabled:opacity-50">
              <Truck size={15} /> {ship.isPending ? 'Expédition...' : 'Marquer Expédié (débite le stock)'}
            </button>
          )}
          {transfer.status === 'shipped' && (
            <button onClick={() => receive.mutate()} disabled={receive.isPending}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-emerald-500 text-white rounded-xl text-sm font-semibold hover:bg-emerald-600 disabled:opacity-50">
              <ArrowDownToLine size={15} /> {receive.isPending ? 'Réception...' : 'Confirmer la réception (crédite le stock)'}
            </button>
          )}
          {['pending', 'draft'].includes(transfer.status) && (
            <button onClick={() => cancel.mutate()} disabled={cancel.isPending}
              className="px-4 py-2.5 border-2 border-gray-200 text-gray-500 rounded-xl text-sm font-semibold hover:bg-gray-50 disabled:opacity-50">
              {cancel.isPending ? '...' : 'Annuler'}
            </button>
          )}
          <button onClick={onClose} className="px-4 py-2.5 border-2 border-gray-200 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-50">
            Fermer
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TransfersPage() {
  const [showCreate, setShowCreate] = useState(false)
  const [viewTransfer, setViewTransfer] = useState<Transfer | undefined>()
  const [direction, setDirection] = useState<'all' | 'outgoing' | 'incoming'>('all')
  const [statusFilter, setStatusFilter] = useState('')

  const { data, isLoading } = useQuery<{ data: Transfer[] }>({
    queryKey: ['transfers', direction, statusFilter],
    queryFn: () => api.get('/store-transfers', {
      params: {
        direction: direction !== 'all' ? direction : undefined,
        status: statusFilter || undefined,
        per_page: 50,
      }
    }).then(r => r.data),
    placeholderData: prev => prev,
  })

  const transfers = data?.data ?? []

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ArrowLeftRight size={24} className="text-primary" /> Transferts inter-magasins
          </h1>
          <p className="text-gray-500 text-sm">Demandes de ravitaillement entre magasins</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="btn-primary flex items-center gap-2">
          <Plus size={18} /> Nouvelle demande
        </button>
      </div>

      {/* Filters */}
      <div className="card p-4 flex flex-wrap gap-3 items-center">
        {/* Direction */}
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
          {(['all', 'outgoing', 'incoming'] as const).map(d => (
            <button key={d} onClick={() => setDirection(d)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                direction === d ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {d === 'all' ? 'Tous' : d === 'outgoing' ? '↑ Sortants' : '↓ Entrants'}
            </button>
          ))}
        </div>

        {/* Status */}
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="input w-auto py-1.5 text-sm"
        >
          <option value="">Tous les statuts</option>
          {Object.entries(STATUS_CFG).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Chargement...</div>
        ) : transfers.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <ArrowLeftRight size={40} className="mx-auto mb-3 opacity-30" />
            <p className="font-medium">Aucun transfert</p>
            <p className="text-sm mt-1">Créez une demande d'approvisionnement pour commencer</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Référence</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">De → Vers</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Produits</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Statut</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {transfers.map(t => (
                <tr key={t.id} className="hover:bg-gray-50 transition-colors group">
                  <td className="px-4 py-3 font-mono font-medium text-gray-900">{t.reference}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 text-sm">
                      <span className="text-gray-600">{t.fromStore?.name ?? `#${t.from_store_id}`}</span>
                      <ChevronRight size={13} className="text-gray-400" />
                      <span className="font-medium text-indigo-600">{t.toStore?.name ?? `#${t.to_store_id}`}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center text-gray-500">{t.items_count ?? '—'}</td>
                  <td className="px-4 py-3 text-center">
                    <StatusBadge status={t.status} />
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{fmtDate(t.created_at)}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setViewTransfer(t)}
                      className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-primary transition-all"
                    >
                      <Eye size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modals */}
      {showCreate && <CreateTransferModal onClose={() => setShowCreate(false)} />}
      {viewTransfer && (
        <TransferDetailModal
          transfer={viewTransfer}
          onClose={() => setViewTransfer(undefined)}
        />
      )}
    </div>
  )
}
