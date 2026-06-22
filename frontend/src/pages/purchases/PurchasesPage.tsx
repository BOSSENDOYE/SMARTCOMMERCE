import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../lib/api'
import { formatCurrency } from '../../lib/format'
import toast from 'react-hot-toast'
import {
  ShoppingCart, Plus, Search, ChevronRight, ArrowLeft,
  Package, Truck, CheckCircle, Clock, AlertCircle,
  Send, X, Trash2, Edit2, RotateCcw, FileText, Star,
  Upload, FileDown, Loader2, Check,
} from 'lucide-react'
import { useConfirm } from '../../hooks/useConfirm'

// ─── Types ────────────────────────────────────────────────────────────────────

type PurchaseStatus = 'draft' | 'sent' | 'partial' | 'received' | 'cancelled'

interface Supplier { id: number; company_name: string }

interface ProductResult { id: number; name: string; internal_code?: string; unit?: { abbreviation: string } }

interface POItem {
  id: number
  product_id: number
  product: { id: number; name: string; internal_code?: string }
  qty_ordered: number
  unit_price_ht: number
  vat_rate: number
  total_ht: number
  qty_received_total?: number
}

interface POReceptionItem {
  id: number
  product: { id: number; name: string }
  qty_ordered: number
  qty_received: number
  qty_rejected: number
  unit_price_ht: number
  lot_number?: string
  expiry_date?: string
}

interface POReception {
  id: number
  reference: string
  supplier_delivery_ref?: string
  status: 'partial' | 'complete'
  received_at: string
  receiver?: { id: number; name: string }
  items?: POReceptionItem[]
}

interface PurchaseOrder {
  id: number
  reference: string
  status: PurchaseStatus
  supplier: Supplier
  creator?: { id: number; name: string }
  total_ht: number
  total_ttc: number
  expected_date?: string
  notes?: string
  created_at: string
  items_count?: number
  items?: POItem[]
  receptions?: POReception[]
}

interface Paginated<T> { data: T[]; meta: { current_page: number; last_page: number; total: number } }

interface Stats { total: number; pending: number; draft: number; total_amount: number; this_month: number }

interface OrderFormItem {
  product_id: number
  product_name: string
  qty_ordered: number
  unit_price_ht: number
  vat_rate: number
}

interface SupplierLinkedProduct {
  id: number
  name: string
  internal_code?: string
  unit?: { abbreviation: string }
  pivot: {
    supplier_ref?: string
    negotiated_price_ht?: number
    is_preferred: boolean
  }
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<PurchaseStatus, { label: string; cls: string; dotCls: string }> = {
  draft:     { label: 'Brouillon',  cls: 'bg-gray-100 text-gray-700',    dotCls: 'bg-gray-400' },
  sent:      { label: 'Envoyée',    cls: 'bg-primary-100 text-primary-600',    dotCls: 'bg-primary' },
  partial:   { label: 'Partielle',  cls: 'bg-yellow-100 text-yellow-700', dotCls: 'bg-yellow-500' },
  received:  { label: 'Reçue',      cls: 'bg-green-100 text-green-700',   dotCls: 'bg-green-500' },
  cancelled: { label: 'Annulée',    cls: 'bg-red-100 text-red-700',       dotCls: 'bg-red-400' },
}

const STATUS_FLOW: PurchaseStatus[] = ['draft', 'sent', 'partial', 'received']

function fmtDate(d?: string) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ─── KpiCard ──────────────────────────────────────────────────────────────────

function KpiCard({ icon, label, value, sub, color = 'blue' }: {
  icon: React.ReactNode; label: string; value: string | number; sub?: string; color?: string
}) {
  const colors: Record<string, string> = {
    blue:   'bg-primary-50 text-primary',
    green:  'bg-green-50 text-green-600',
    orange: 'bg-orange-50 text-orange-600',
    purple: 'bg-purple-50 text-purple-600',
  }
  return (
    <div className="card p-4 flex items-start gap-3">
      <div className={`p-2 rounded-xl ${colors[color]}`}>{icon}</div>
      <div>
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-xl font-bold text-gray-900">{value}</p>
        {sub && <p className="text-xs text-gray-400">{sub}</p>}
      </div>
    </div>
  )
}

// ─── ProductSearch ────────────────────────────────────────────────────────────

function ProductSearch({ onSelect }: { onSelect: (p: ProductResult) => void }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const { data } = useQuery({
    queryKey: ['products-search-po', q],
    queryFn: () => api.get('/products', { params: { search: q, per_page: 8 } }).then(r => r.data),
    enabled: q.length > 1,
  })

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <input
          value={q}
          onChange={e => { setQ(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          className="input pl-9 text-sm"
          placeholder="Rechercher un produit..."
        />
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
      </div>
      {open && (data?.data ?? []).length > 0 && (
        <div className="absolute z-30 w-full mt-1 bg-white border rounded-xl shadow-xl overflow-hidden">
          {(data?.data ?? []).map((p: ProductResult) => (
            <button
              key={p.id}
              type="button"
              onMouseDown={() => { onSelect(p); setQ(''); setOpen(false) }}
              className="w-full px-3 py-2 text-left hover:bg-primary-50 flex items-center justify-between text-sm border-b last:border-0"
            >
              <span className="font-medium">{p.name}</span>
              <span className="text-gray-400 text-xs">{p.internal_code ?? ''}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── OrderFormModal (create + edit) ──────────────────────────────────────────

function OrderFormModal({ order, onClose }: { order?: PurchaseOrder; onClose: () => void }) {
  const qc = useQueryClient()
  const [supplierId, setSupplierId] = useState<number | ''>(order?.supplier?.id ?? '')
  const [expectedDate, setExpectedDate] = useState(order?.expected_date ?? '')
  const [notes, setNotes] = useState(order?.notes ?? '')
  const [items, setItems] = useState<OrderFormItem[]>(
    order?.items?.map(i => ({
      product_id: i.product_id,
      product_name: i.product.name,
      qty_ordered: i.qty_ordered,
      unit_price_ht: i.unit_price_ht,
      vat_rate: i.vat_rate,
    })) ?? []
  )

  const { data: suppliers } = useQuery<Paginated<Supplier>>({
    queryKey: ['suppliers-select'],
    queryFn: () => api.get('/suppliers', { params: { filter: 'active', per_page: 100 } }).then(r => r.data),
  })

  const { data: supplierProducts } = useQuery<SupplierLinkedProduct[]>({
    queryKey: ['supplier-products', supplierId],
    queryFn: () => api.get(`/suppliers/${supplierId}/products`).then(r => r.data),
    enabled: !!supplierId,
  })

  const mut = useMutation({
    mutationFn: (payload: object) => order
      ? api.put(`/purchase-orders/${order.id}`, payload)
      : api.post('/purchase-orders', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchase-orders'] })
      qc.invalidateQueries({ queryKey: ['po-stats'] })
      if (order) qc.invalidateQueries({ queryKey: ['purchase-order', order.id] })
      toast.success(order ? 'Commande modifiée' : 'Bon de commande créé')
      onClose()
    },
    onError: () => toast.error('Erreur lors de l\'enregistrement'),
  })

  function addItem(p: ProductResult, negotiatedPrice?: number) {
    if (items.some(i => i.product_id === p.id)) {
      toast.error('Ce produit est déjà dans la liste')
      return
    }
    setItems(prev => [...prev, {
      product_id: p.id,
      product_name: p.name,
      qty_ordered: 1,
      unit_price_ht: negotiatedPrice ?? 0,
      vat_rate: 18,
    }])
  }

  function updateItem(idx: number, key: keyof OrderFormItem, value: number | string) {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [key]: value } : it))
  }

  function removeItem(idx: number) {
    setItems(prev => prev.filter((_, i) => i !== idx))
  }

  const totalHt  = items.reduce((s, i) => s + i.qty_ordered * i.unit_price_ht, 0)
  const totalTtc = totalHt * 1.18

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!supplierId) { toast.error('Sélectionnez un fournisseur'); return }
    if (items.length === 0) { toast.error('Ajoutez au moins un article'); return }
    mut.mutate({ supplier_id: supplierId, expected_date: expectedDate || null, notes: notes || null, items })
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-3xl shadow-2xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-6 border-b flex items-center justify-between shrink-0">
          <h2 className="text-xl font-bold">{order ? 'Modifier le bon de commande' : 'Nouveau bon de commande'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="p-6 space-y-4 overflow-y-auto flex-1">
            {/* Order info */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">Fournisseur *</label>
                <select
                  value={supplierId}
                  onChange={e => setSupplierId(Number(e.target.value))}
                  className="input"
                  required
                >
                  <option value="">Sélectionner...</option>
                  {(suppliers?.data ?? []).map(s => (
                    <option key={s.id} value={s.id}>{s.company_name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Livraison prévue</label>
                <input
                  type="date"
                  value={expectedDate}
                  onChange={e => setExpectedDate(e.target.value)}
                  className="input"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <input
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  className="input"
                  placeholder="Commentaire..."
                />
              </div>
            </div>

            {/* Supplier products quick-add */}
            {supplierId && (supplierProducts ?? []).length > 0 && (
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Produits de ce fournisseur
                  <span className="ml-2 text-xs font-normal text-gray-400">
                    ({(supplierProducts ?? []).length} associé{(supplierProducts ?? []).length > 1 ? 's' : ''})
                  </span>
                </label>
                <div className="border rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium text-gray-600">Produit</th>
                        <th className="text-left px-3 py-2 font-medium text-gray-600 hidden sm:table-cell">Réf. fournisseur</th>
                        <th className="text-right px-3 py-2 font-medium text-gray-600">Prix négocié HT</th>
                        <th className="w-16 px-3 py-2"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {(supplierProducts ?? []).map(p => {
                        const alreadyAdded = items.some(i => i.product_id === p.id)
                        return (
                          <tr key={p.id} className={alreadyAdded ? 'bg-green-50/60' : 'hover:bg-primary-50'}>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-1.5">
                                {p.pivot.is_preferred && (
                                  <Star size={12} className="fill-yellow-400 stroke-yellow-400 shrink-0" />
                                )}
                                <span className="font-medium text-gray-900">{p.name}</span>
                                {p.internal_code && (
                                  <span className="text-xs text-gray-400 font-mono hidden md:inline">{p.internal_code}</span>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-2 text-gray-500 text-xs font-mono hidden sm:table-cell">
                              {p.pivot.supplier_ref ?? '—'}
                            </td>
                            <td className="px-3 py-2 text-right font-semibold text-gray-800">
                              {p.pivot.negotiated_price_ht
                                ? formatCurrency(p.pivot.negotiated_price_ht)
                                : <span className="text-gray-400 font-normal text-xs">Non défini</span>}
                            </td>
                            <td className="px-3 py-2 text-center">
                              {alreadyAdded ? (
                                <span className="text-green-600 text-xs font-medium">Ajouté</span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => addItem({
                                    id: p.id,
                                    name: p.name,
                                    internal_code: p.internal_code,
                                    unit: p.unit,
                                  }, p.pivot.negotiated_price_ht)}
                                  className="flex items-center gap-1 text-xs bg-primary text-white px-2.5 py-1 rounded-lg hover:bg-primary-600 transition-colors"
                                >
                                  <Plus size={12} /> Ajouter
                                </button>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Items */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-semibold text-gray-700">
                  {supplierId && (supplierProducts ?? []).length > 0 ? 'Ou rechercher un autre produit' : 'Articles *'}
                </label>
              </div>
              <ProductSearch onSelect={addItem} />

              {items.length > 0 && (
                <div className="mt-3 border rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium text-gray-600">Produit</th>
                        <th className="text-right px-3 py-2 font-medium text-gray-600 w-24">Qté</th>
                        <th className="text-right px-3 py-2 font-medium text-gray-600 w-32">Prix HT</th>
                        <th className="text-right px-3 py-2 font-medium text-gray-600 w-28">Total HT</th>
                        <th className="w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {items.map((item, idx) => (
                        <tr key={item.product_id}>
                          <td className="px-3 py-2 text-gray-800 font-medium">{item.product_name}</td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              step="0.001"
                              min="0.001"
                              value={item.qty_ordered}
                              onChange={e => updateItem(idx, 'qty_ordered', Number(e.target.value))}
                              className="input text-right py-1 px-2 text-sm w-full"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={item.unit_price_ht}
                              onChange={e => updateItem(idx, 'unit_price_ht', Number(e.target.value))}
                              className="input text-right py-1 px-2 text-sm w-full"
                            />
                          </td>
                          <td className="px-3 py-2 text-right font-semibold text-gray-700">
                            {formatCurrency(item.qty_ordered * item.unit_price_ht)}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <button
                              type="button"
                              onClick={() => removeItem(idx)}
                              className="text-red-400 hover:text-red-600"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-50 border-t">
                      <tr>
                        <td colSpan={3} className="px-3 py-2 text-right text-sm font-semibold text-gray-700">
                          Total HT / TTC
                        </td>
                        <td className="px-3 py-2 text-right">
                          <div className="font-bold text-gray-900">{formatCurrency(totalHt)}</div>
                          <div className="text-xs text-gray-500">{formatCurrency(totalTtc)}</div>
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              {items.length === 0 && (
                <div className="mt-3 py-6 border-2 border-dashed rounded-xl text-center text-gray-400 text-sm">
                  Recherchez un produit ci-dessus pour l'ajouter
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="p-6 border-t flex gap-3 shrink-0">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Annuler</button>
            <button type="submit" disabled={mut.isPending} className="btn-primary flex-1">
              {mut.isPending ? 'Enregistrement...' : (order ? 'Enregistrer les modifications' : 'Créer le bon de commande')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── ReceptionModal ───────────────────────────────────────────────────────────

function ReceptionModal({ order, onClose }: { order: PurchaseOrder; onClose: () => void }) {
  const qc = useQueryClient()
  const [deliveryRef, setDeliveryRef] = useState('')
  const [notes, setNotes] = useState('')
  const [rows, setRows] = useState<{
    purchase_order_item_id: number
    product_name: string
    qty_ordered: number
    already_received: number
    qty_received: number
    qty_rejected: number
    unit_price_ht: number
    lot_number: string
    expiry_date: string
    checked: boolean
  }[]>(
    (order.items ?? []).map(it => ({
      purchase_order_item_id: it.id,
      product_name: it.product.name,
      qty_ordered: it.qty_ordered,
      already_received: it.qty_received_total ?? 0,
      qty_received: Math.max(0, it.qty_ordered - (it.qty_received_total ?? 0)),
      qty_rejected: 0,
      unit_price_ht: it.unit_price_ht,
      lot_number: '',
      expiry_date: '',
      checked: true,
    }))
  )

  const mut = useMutation({
    mutationFn: (payload: object) => api.post(`/purchase-orders/${order.id}/receive`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchase-order', order.id] })
      qc.invalidateQueries({ queryKey: ['purchase-orders'] })
      qc.invalidateQueries({ queryKey: ['po-stats'] })
      toast.success('Réception enregistrée')
      onClose()
    },
    onError: (e: { response?: { data?: { message?: string } } }) =>
      toast.error(e.response?.data?.message ?? 'Erreur lors de la réception'),
  })

  function updateRow<K extends keyof (typeof rows)[0]>(idx: number, key: K, value: (typeof rows)[0][K]) {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, [key]: value } : r))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const items = rows
      .filter(r => r.checked && r.qty_received > 0)
      .map(r => ({
        purchase_order_item_id: r.purchase_order_item_id,
        qty_received: r.qty_received,
        qty_rejected: r.qty_rejected || 0,
        unit_price_ht: r.unit_price_ht,
        lot_number: r.lot_number || null,
        expiry_date: r.expiry_date || null,
      }))

    if (items.length === 0) {
      toast.error('Sélectionnez au moins un article avec une quantité reçue > 0')
      return
    }
    mut.mutate({ supplier_delivery_ref: deliveryRef || null, notes: notes || null, items })
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[92vh]">
        <div className="p-6 border-b flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-xl font-bold">Réceptionner la commande</h2>
            <p className="text-sm text-gray-500">{order.reference} — {order.supplier.company_name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="p-6 space-y-4 overflow-y-auto flex-1">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Réf. bon de livraison fournisseur</label>
                <input
                  value={deliveryRef}
                  onChange={e => setDeliveryRef(e.target.value)}
                  className="input"
                  placeholder="BL-FOURN-0001"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <input
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  className="input"
                  placeholder="Observations sur la livraison..."
                />
              </div>
            </div>

            <div className="border rounded-xl overflow-hidden">
              <div className="bg-gray-50 border-b px-4 py-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Articles à réceptionner</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b bg-gray-50">
                    <tr>
                      <th className="w-8 px-3 py-2"></th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Produit</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600 w-20">Commandé</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600 w-20">Déjà reçu</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600 w-24">Qté reçue *</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600 w-24">Qté rejetée</th>
                      <th className="px-3 py-2 font-medium text-gray-600 w-28">N° Lot</th>
                      <th className="px-3 py-2 font-medium text-gray-600 w-32">DLC</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {rows.map((row, idx) => (
                      <tr key={row.purchase_order_item_id} className={!row.checked ? 'opacity-40 bg-gray-50' : ''}>
                        <td className="px-3 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={row.checked}
                            onChange={e => updateRow(idx, 'checked', e.target.checked)}
                            className="w-4 h-4 accent-primary"
                          />
                        </td>
                        <td className="px-3 py-2 font-medium text-gray-800">{row.product_name}</td>
                        <td className="px-3 py-2 text-right text-gray-500">{row.qty_ordered}</td>
                        <td className="px-3 py-2 text-right">
                          <span className={row.already_received > 0 ? 'text-green-600 font-medium' : 'text-gray-400'}>
                            {row.already_received || '—'}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            step="0.001"
                            min="0"
                            value={row.qty_received}
                            onChange={e => updateRow(idx, 'qty_received', Number(e.target.value))}
                            disabled={!row.checked}
                            className="input text-right py-1 px-2 text-sm w-full"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            step="0.001"
                            min="0"
                            value={row.qty_rejected}
                            onChange={e => updateRow(idx, 'qty_rejected', Number(e.target.value))}
                            disabled={!row.checked}
                            className="input text-right py-1 px-2 text-sm w-full"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            value={row.lot_number}
                            onChange={e => updateRow(idx, 'lot_number', e.target.value)}
                            disabled={!row.checked}
                            className="input py-1 px-2 text-sm w-full"
                            placeholder="LOT-001"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="date"
                            value={row.expiry_date}
                            onChange={e => updateRow(idx, 'expiry_date', e.target.value)}
                            disabled={!row.checked}
                            className="input py-1 px-2 text-sm w-full"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="p-6 border-t flex gap-3 shrink-0">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Annuler</button>
            <button type="submit" disabled={mut.isPending} className="btn-primary flex-1 flex items-center justify-center gap-2">
              <CheckCircle size={16} />
              {mut.isPending ? 'Enregistrement...' : 'Valider la réception'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── StatusFlow ───────────────────────────────────────────────────────────────

function StatusFlow({ status }: { status: PurchaseStatus }) {
  if (status === 'cancelled') {
    return (
      <div className="flex items-center gap-2 text-sm text-red-600 font-medium">
        <div className="w-2.5 h-2.5 rounded-full bg-red-500"></div>
        Commande annulée
      </div>
    )
  }

  const steps = [
    { key: 'draft',    label: 'Brouillon' },
    { key: 'sent',     label: 'Envoyée' },
    { key: 'partial',  label: 'Réception partielle' },
    { key: 'received', label: 'Réceptionnée' },
  ]

  const currentIdx = STATUS_FLOW.indexOf(status)

  return (
    <div className="flex items-center gap-0">
      {steps.map((step, i) => {
        const done    = i < currentIdx
        const active  = i === currentIdx
        const future  = i > currentIdx
        return (
          <div key={step.key} className="flex items-center">
            <div className="flex flex-col items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all ${
                done   ? 'bg-green-500 border-green-500 text-white' :
                active ? 'bg-primary border-primary text-white' :
                         'bg-white border-gray-300 text-gray-400'
              }`}>
                {done ? <CheckCircle size={16} /> : <span className="text-xs font-bold">{i + 1}</span>}
              </div>
              <span className={`text-xs mt-1 whitespace-nowrap font-medium ${
                active ? 'text-primary' : done ? 'text-green-600' : 'text-gray-400'
              }`}>{step.label}</span>
            </div>
            {i < steps.length - 1 && (
              <div className={`h-0.5 w-12 mb-4 mx-1 ${i < currentIdx ? 'bg-green-400' : 'bg-gray-200'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── OrderDetail ─────────────────────────────────────────────────────────────

function OrderDetail({ orderId, onBack }: { orderId: number; onBack: () => void }) {
  const qc = useQueryClient()
  const confirm = useConfirm()
  const [tab, setTab] = useState<'items' | 'receptions'>('items')
  const [showEdit, setShowEdit] = useState(false)
  const [showReceive, setShowReceive] = useState(false)

  const { data: order, isLoading } = useQuery<PurchaseOrder>({
    queryKey: ['purchase-order', orderId],
    queryFn: () => api.get(`/purchase-orders/${orderId}`).then(r => r.data),
  })

  const sendMut = useMutation({
    mutationFn: () => api.post(`/purchase-orders/${orderId}/send`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['purchase-order', orderId] }); qc.invalidateQueries({ queryKey: ['purchase-orders'] }); qc.invalidateQueries({ queryKey: ['po-stats'] }); toast.success('Commande envoyée') },
    onError: (e: { response?: { data?: { message?: string } } }) => toast.error(e.response?.data?.message ?? 'Erreur'),
  })

  const cancelMut = useMutation({
    mutationFn: () => api.post(`/purchase-orders/${orderId}/cancel`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['purchase-order', orderId] }); qc.invalidateQueries({ queryKey: ['purchase-orders'] }); qc.invalidateQueries({ queryKey: ['po-stats'] }); toast.success('Commande annulée') },
  })

  const deleteMut = useMutation({
    mutationFn: () => api.delete(`/purchase-orders/${orderId}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['purchase-orders'] }); qc.invalidateQueries({ queryKey: ['po-stats'] }); toast.success('Commande supprimée'); onBack() },
    onError: (e: { response?: { data?: { message?: string } } }) => toast.error(e.response?.data?.message ?? 'Erreur'),
  })

  if (isLoading || !order) {
    return <div className="p-8 text-center text-gray-400">Chargement...</div>
  }

  const st = STATUS_CFG[order.status]

  return (
    <div className="p-6 space-y-4">
      {/* Back */}
      <button onClick={onBack} className="flex items-center gap-2 text-gray-500 hover:text-gray-900 text-sm font-medium">
        <ArrowLeft size={18} /> Retour aux commandes
      </button>

      {/* Header card */}
      <div className="card p-5">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h2 className="text-2xl font-bold text-gray-900 font-mono">{order.reference}</h2>
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${st.cls}`}>{st.label}</span>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500">
              <span className="flex items-center gap-1"><Truck size={14} />{order.supplier?.company_name}</span>
              {order.creator && <span className="flex items-center gap-1"><FileText size={14} />Créé par {order.creator.name}</span>}
              <span className="flex items-center gap-1"><Clock size={14} />Le {fmtDate(order.created_at)}</span>
              {order.expected_date && <span className="flex items-center gap-1"><Package size={14} />Livraison prévue: {fmtDate(order.expected_date)}</span>}
            </div>
            {order.notes && <p className="mt-2 text-sm text-gray-600 italic border-l-2 border-gray-200 pl-3">{order.notes}</p>}
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2">
            {order.status === 'draft' && (
              <>
                <button
                  onClick={() => sendMut.mutate()}
                  disabled={sendMut.isPending}
                  className="btn-primary flex items-center gap-2 text-sm"
                >
                  <Send size={15} /> Envoyer la commande
                </button>
                <button onClick={() => setShowEdit(true)} className="btn-secondary flex items-center gap-2 text-sm">
                  <Edit2 size={15} /> Modifier
                </button>
                <button
                  onClick={async () => { if (await confirm('Supprimer ce bon de commande ?', { danger: true })) deleteMut.mutate() }}
                  className="btn-secondary text-red-600 hover:bg-red-50 flex items-center gap-2 text-sm"
                >
                  <Trash2 size={15} /> Supprimer
                </button>
              </>
            )}
            {(order.status === 'sent' || order.status === 'partial') && (
              <>
                <button
                  onClick={() => setShowReceive(true)}
                  className="btn-primary flex items-center gap-2 text-sm"
                >
                  <CheckCircle size={15} /> Réceptionner
                </button>
                <button
                  onClick={async () => { if (await confirm('Annuler cette commande ?', { danger: true })) cancelMut.mutate() }}
                  className="btn-secondary text-red-600 hover:bg-red-50 flex items-center gap-2 text-sm"
                >
                  <RotateCcw size={15} /> Annuler
                </button>
              </>
            )}
          </div>
        </div>

        {/* Status flow */}
        {order.status !== 'cancelled' && (
          <div className="mt-5 pt-5 border-t overflow-x-auto">
            <StatusFlow status={order.status} />
          </div>
        )}

        {/* Totals */}
        <div className="mt-4 pt-4 border-t flex flex-wrap gap-6 text-sm">
          <div>
            <p className="text-gray-400 text-xs">Total HT</p>
            <p className="font-bold text-gray-900 text-lg">{formatCurrency(order.total_ht)}</p>
          </div>
          <div>
            <p className="text-gray-400 text-xs">TVA (18%)</p>
            <p className="font-semibold text-gray-600">{formatCurrency(order.total_ttc - order.total_ht)}</p>
          </div>
          <div>
            <p className="text-gray-400 text-xs">Total TTC</p>
            <p className="font-bold text-primary-600 text-lg">{formatCurrency(order.total_ttc)}</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="card p-0 overflow-hidden">
        <div className="flex border-b">
          {[
            { id: 'items',      label: `Articles (${order.items?.length ?? 0})` },
            { id: 'receptions', label: `Réceptions (${order.receptions?.length ?? 0})` },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id as 'items' | 'receptions')}
              className={`px-5 py-3.5 text-sm font-medium border-b-2 transition-colors ${
                tab === t.id ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-900'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Articles tab */}
        {tab === 'items' && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  {['Produit', 'Code', 'Qté commandée', 'Qté reçue', 'Prix HT', 'TVA', 'Total HT'].map(h => (
                    <th key={h} className="text-left px-4 py-3 font-medium text-gray-600">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {(order.items ?? []).map(it => {
                  const received = it.qty_received_total ?? 0
                  const pct = it.qty_ordered > 0 ? (received / it.qty_ordered) * 100 : 0
                  return (
                    <tr key={it.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{it.product.name}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-400">{it.product.internal_code ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-700">{it.qty_ordered}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className={received >= it.qty_ordered ? 'text-green-600 font-medium' : received > 0 ? 'text-yellow-600 font-medium' : 'text-gray-400'}>
                            {received > 0 ? received : '—'}
                          </span>
                          {received > 0 && (
                            <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${pct >= 100 ? 'bg-green-500' : 'bg-yellow-500'}`} style={{ width: `${Math.min(100, pct)}%` }} />
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{formatCurrency(it.unit_price_ht)}</td>
                      <td className="px-4 py-3 text-gray-500">{it.vat_rate}%</td>
                      <td className="px-4 py-3 font-semibold text-gray-900">{formatCurrency(it.total_ht)}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot className="bg-gray-50 border-t">
                <tr>
                  <td colSpan={6} className="px-4 py-3 text-right font-semibold text-gray-700">Total HT</td>
                  <td className="px-4 py-3 font-bold text-gray-900">{formatCurrency(order.total_ht)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* Receptions tab */}
        {tab === 'receptions' && (
          <div>
            {(order.receptions ?? []).length === 0 ? (
              <div className="py-12 text-center text-gray-400">
                <Package size={40} className="mx-auto mb-3 opacity-40" />
                <p>Aucune réception enregistrée</p>
                {(order.status === 'sent' || order.status === 'partial') && (
                  <button onClick={() => setShowReceive(true)} className="mt-3 btn-primary text-sm">
                    Enregistrer une réception
                  </button>
                )}
              </div>
            ) : (
              <div className="divide-y">
                {(order.receptions ?? []).map(rec => (
                  <div key={rec.id} className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-semibold text-primary-600">{rec.reference}</span>
                          {rec.supplier_delivery_ref && (
                            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">BL: {rec.supplier_delivery_ref}</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Reçu le {fmtDate(rec.received_at)}
                          {rec.receiver && ` par ${rec.receiver.name}`}
                        </p>
                      </div>
                    </div>
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border rounded-lg">
                        <tr>
                          {['Produit', 'Reçu', 'Rejeté', 'Lot', 'DLC'].map(h => (
                            <th key={h} className="text-left px-3 py-2 font-medium text-gray-500 text-xs">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {(rec.items ?? []).map(ri => (
                          <tr key={ri.id}>
                            <td className="px-3 py-2 text-gray-800">{ri.product.name}</td>
                            <td className="px-3 py-2 text-green-600 font-medium">{ri.qty_received}</td>
                            <td className="px-3 py-2 text-red-500">{ri.qty_rejected > 0 ? ri.qty_rejected : '—'}</td>
                            <td className="px-3 py-2 text-gray-500 font-mono text-xs">{ri.lot_number ?? '—'}</td>
                            <td className="px-3 py-2 text-gray-500">{ri.expiry_date ? fmtDate(ri.expiry_date) : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {showEdit    && <OrderFormModal   order={order} onClose={() => setShowEdit(false)} />}
      {showReceive && <ReceptionModal   order={order} onClose={() => setShowReceive(false)} />}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type StatusFilter = 'all' | PurchaseStatus

// ─── BLImportModal ────────────────────────────────────────────────────────────

interface BLRow {
  row: number
  reference?: string | null
  designation?: string | null
  product_id?: number | null
  product_name?: string | null
  product_code?: string | null
  quantite: number
  prix_achat_ht: number
  tva: number
  lot?: string | null
  date_expiration?: string | null
  errors: string[]
  warnings: string[]
  status: 'ok' | 'error'
}

interface BLPreview { rows: BLRow[]; total: number; ok: number; errors: number }
interface BLResult  { reception_ref: string; order_ref: string; lines: number }

function BLImportModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [step, setStep]           = useState<1 | 2 | 3>(1)
  const [file, setFile]           = useState<File | null>(null)
  const [supplierId, setSupplierId] = useState<string>('')
  const [blRef, setBlRef]         = useState('')
  const [preview, setPreview]     = useState<BLPreview | null>(null)
  const [result, setResult]       = useState<BLResult | null>(null)
  const [loading, setLoading]     = useState(false)
  const fileRef                   = useRef<HTMLInputElement>(null)

  const { data: suppliers } = useQuery<{ data: Supplier[] }>({
    queryKey: ['suppliers-bl'],
    queryFn:  () => api.get('/suppliers', { params: { per_page: 200 } }).then(r => r.data),
  })

  async function handlePreview() {
    if (!file) return
    setLoading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const { data } = await api.post<BLPreview>('/purchase-orders/import-bl/preview', fd)
      setPreview(data)
      setStep(2)
    } catch (e: any) {
      toast.error(e.response?.data?.message ?? "Erreur lors de l'analyse du BL")
    } finally { setLoading(false) }
  }

  async function handleConfirm() {
    if (!preview) return
    const validRows = preview.rows.filter(r => r.status === 'ok')
    if (validRows.length === 0) { toast.error('Aucune ligne valide'); return }
    setLoading(true)
    try {
      const { data } = await api.post<BLResult>('/purchase-orders/import-bl/confirm', {
        supplier_id:  supplierId ? parseInt(supplierId) : undefined,
        bl_reference: blRef || undefined,
        rows:         validRows,
      })
      setResult(data)
      setStep(3)
      onDone()
    } catch (e: any) {
      toast.error(e.response?.data?.message ?? "Erreur lors de l'import BL")
    } finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Import Bon de Livraison (BL)</h2>
            <p className="text-xs text-gray-500">
              {step === 1 ? 'Étape 1 — Fichier & paramètres' :
               step === 2 ? 'Étape 2 — Vérification des lignes' :
               'Étape 3 — Résultat'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {([1, 2, 3] as const).map(s => (
              <div key={s} className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors ${
                step === s ? 'bg-primary border-primary text-white' :
                step > s  ? 'bg-green-500 border-green-500 text-white' :
                'border-gray-200 text-gray-400'
              }`}>{step > s ? <Check size={12} /> : s}</div>
            ))}
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100"><X size={18} /></button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">

          {/* Step 1 */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Fournisseur (optionnel)</label>
                  <select value={supplierId} onChange={e => setSupplierId(e.target.value)} className="input text-sm">
                    <option value="">— Sélectionner un fournisseur —</option>
                    {(suppliers?.data ?? []).map(s => (
                      <option key={s.id} value={s.id}>{s.company_name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Référence BL</label>
                  <input value={blRef} onChange={e => setBlRef(e.target.value)} className="input text-sm"
                    placeholder="Ex: BL-2024-0042" />
                </div>
              </div>

              <div
                onClick={() => fileRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) setFile(f) }}
                className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center cursor-pointer hover:border-primary hover:bg-primary-50 transition-colors"
              >
                <Upload size={32} className="mx-auto text-gray-300 mb-3" />
                {file ? (
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{file.name}</p>
                    <p className="text-xs text-gray-500">{(file.size / 1024).toFixed(1)} Ko</p>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm font-medium text-gray-600">Glisser-déposer ou cliquer pour choisir</p>
                    <p className="text-xs text-gray-400 mt-1">Formats : XLSX, XLS, CSV (max 10 Mo)</p>
                  </div>
                )}
              </div>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.txt" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) setFile(f) }} />

              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-xs font-semibold text-gray-600 mb-2">Colonnes attendues dans le fichier BL :</p>
                <div className="flex flex-wrap gap-1.5">
                  {['reference_produit *', 'designation', 'quantite *', 'prix_achat_ht', 'tva', 'lot', 'date_expiration'].map(c => (
                    <span key={c} className={`text-xs px-2 py-0.5 rounded-full ${
                      c.endsWith('*') ? 'bg-primary-100 text-primary font-semibold' : 'bg-gray-100 text-gray-600'
                    }`}>{c}</span>
                  ))}
                </div>
                <p className="text-[10px] text-gray-400 mt-2">* reference_produit = code interne ou code-barres du produit existant dans le système</p>
              </div>
            </div>
          )}

          {/* Step 2 */}
          {step === 2 && preview && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-gray-50 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-gray-900">{preview.total}</p>
                  <p className="text-xs text-gray-500">Lignes trouvées</p>
                </div>
                <div className="bg-green-50 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-green-600">{preview.ok}</p>
                  <p className="text-xs text-green-600">Produits identifiés</p>
                </div>
                <div className="bg-red-50 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-red-600">{preview.errors}</p>
                  <p className="text-xs text-red-500">Non trouvés (ignorés)</p>
                </div>
              </div>

              <div className="border rounded-xl overflow-hidden">
                <div className="overflow-x-auto max-h-96">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left text-gray-500 font-medium">#</th>
                        <th className="px-3 py-2 text-left text-gray-500 font-medium">Référence</th>
                        <th className="px-3 py-2 text-left text-gray-500 font-medium">Produit trouvé</th>
                        <th className="px-3 py-2 text-right text-gray-500 font-medium">Qté</th>
                        <th className="px-3 py-2 text-right text-gray-500 font-medium">Prix HT</th>
                        <th className="px-3 py-2 text-left text-gray-500 font-medium">Lot / Exp.</th>
                        <th className="px-3 py-2 text-left text-gray-500 font-medium">Statut</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {preview.rows.map(r => (
                        <tr key={r.row} className={r.status === 'error' ? 'bg-red-50' : ''}>
                          <td className="px-3 py-2 text-gray-400">{r.row}</td>
                          <td className="px-3 py-2 font-mono text-gray-700">{r.reference ?? '—'}</td>
                          <td className="px-3 py-2 font-medium text-gray-900">
                            {r.product_name ?? <span className="text-red-400 italic">Non trouvé</span>}
                          </td>
                          <td className="px-3 py-2 text-right font-semibold">{r.quantite}</td>
                          <td className="px-3 py-2 text-right">{formatCurrency(r.prix_achat_ht)}</td>
                          <td className="px-3 py-2 text-gray-500">
                            {r.lot ? <span className="bg-gray-100 px-1.5 py-0.5 rounded text-[10px]">{r.lot}</span> : ''}
                            {r.date_expiration ? <span className="ml-1 text-[10px] text-amber-600">{r.date_expiration}</span> : ''}
                          </td>
                          <td className="px-3 py-2">
                            {r.status === 'error' ? (
                              <div>
                                <span className="inline-flex items-center gap-1 text-red-600 font-medium"><AlertCircle size={11} /> Erreur</span>
                                {r.errors.map((e, i) => <div key={i} className="text-red-500 text-[10px]">{e}</div>)}
                              </div>
                            ) : (
                              <div>
                                <span className="inline-flex items-center gap-1 text-green-600 font-medium"><CheckCircle size={11} /> OK</span>
                                {r.warnings.map((w, i) => <div key={i} className="text-amber-500 text-[10px]">{w}</div>)}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Step 3 */}
          {step === 3 && result && (
            <div className="flex flex-col items-center justify-center py-8 space-y-4">
              <CheckCircle size={56} className="text-green-500" />
              <h3 className="text-xl font-bold text-gray-900">BL importé avec succès !</h3>
              <div className="grid grid-cols-2 gap-4 w-full max-w-sm">
                <div className="bg-green-50 rounded-xl p-4 text-center">
                  <p className="text-3xl font-bold text-green-600">{result.lines}</p>
                  <p className="text-xs text-green-600 mt-1">Lignes réceptionnées</p>
                </div>
                <div className="bg-primary-50 rounded-xl p-4 text-center">
                  <p className="text-sm font-bold text-primary font-mono">{result.reception_ref}</p>
                  <p className="text-xs text-primary-600 mt-1">Réf. réception</p>
                </div>
              </div>
              <p className="text-xs text-gray-500">Stock mis à jour automatiquement pour toutes les lignes importées.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t flex justify-between">
          <button onClick={onClose} className="btn-outline">
            {step === 3 ? 'Fermer' : 'Annuler'}
          </button>
          <div className="flex gap-2">
            {step === 2 && (
              <button onClick={() => setStep(1)} className="btn-outline">Retour</button>
            )}
            {step === 1 && (
              <button onClick={handlePreview} disabled={!file || loading} className="btn-primary flex items-center gap-2">
                {loading ? <><Loader2 size={15} className="animate-spin" /> Analyse...</> : 'Analyser le BL'}
              </button>
            )}
            {step === 2 && (
              <button onClick={handleConfirm} disabled={(preview?.ok ?? 0) === 0 || loading} className="btn-primary flex items-center gap-2">
                {loading ? <><Loader2 size={15} className="animate-spin" /> Import...</> : `Réceptionner ${preview?.ok ?? 0} ligne(s)`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── PurchasesPage ────────────────────────────────────────────────────────────

export default function PurchasesPage() {
  const queryClient                 = useQueryClient()
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [search, setSearch]         = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [showCreate, setShowCreate] = useState(false)
  const [showBLImport, setShowBLImport] = useState(false)

  const { data: stats } = useQuery<Stats>({
    queryKey: ['po-stats'],
    queryFn: () => api.get('/purchase-orders/stats').then(r => r.data),
  })

  const { data, isLoading } = useQuery<Paginated<PurchaseOrder>>({
    queryKey: ['purchase-orders', search, statusFilter],
    queryFn: () => api.get('/purchase-orders', {
      params: {
        search: search || undefined,
        status: statusFilter === 'all' ? undefined : statusFilter,
      },
    }).then(r => r.data),
  })

  if (selectedId !== null) {
    return <OrderDetail orderId={selectedId} onBack={() => setSelectedId(null)} />
  }

  const orders = data?.data ?? []
  const filterTabs: { key: StatusFilter; label: string }[] = [
    { key: 'all',       label: 'Tous' },
    { key: 'draft',     label: 'Brouillon' },
    { key: 'sent',      label: 'Envoyée' },
    { key: 'partial',   label: 'Partielle' },
    { key: 'received',  label: 'Reçue' },
    { key: 'cancelled', label: 'Annulée' },
  ]

  return (
    <div className="p-3 sm:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <ShoppingCart size={24} /> Achats & Approvisionnements
        </h1>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowBLImport(true)} className="btn-outline flex items-center gap-2">
            <Upload size={16} /> Importer un BL
          </button>
          <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
            <Plus size={18} /> Nouveau bon de commande
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={<FileText size={20} />}
          label="Total commandes"
          value={stats?.total ?? 0}
          color="blue"
        />
        <KpiCard
          icon={<AlertCircle size={20} />}
          label="En attente réception"
          value={stats?.pending ?? 0}
          sub="Envoyées ou partielles"
          color="orange"
        />
        <KpiCard
          icon={<ShoppingCart size={20} />}
          label="Montant total (hors annulées)"
          value={formatCurrency(stats?.total_amount ?? 0)}
          color="purple"
        />
        <KpiCard
          icon={<CheckCircle size={20} />}
          label="Ce mois"
          value={formatCurrency(stats?.this_month ?? 0)}
          color="green"
        />
      </div>

      {/* Filters */}
      <div className="card p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input pl-10"
            placeholder="Référence, fournisseur..."
          />
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
        </div>
        <div className="flex flex-wrap gap-2">
          {filterTabs.map(f => (
            <button
              key={f.key}
              onClick={() => setStatusFilter(f.key)}
              className={`px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                statusFilter === f.key
                  ? 'bg-primary text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              {['Référence', 'Fournisseur', 'Articles', 'Montant HT', 'Montant TTC', 'Livraison prévue', 'Créé le', 'Statut', ''].map(h => (
                <th key={h} className="text-left px-4 py-3 font-medium text-gray-600">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading ? (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">Chargement...</td></tr>
            ) : orders.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center">
                  <ShoppingCart size={40} className="mx-auto mb-3 text-gray-300" />
                  <p className="text-gray-400">Aucun bon de commande trouvé</p>
                  <button onClick={() => setShowCreate(true)} className="mt-3 btn-primary text-sm">
                    Créer le premier bon de commande
                  </button>
                </td>
              </tr>
            ) : orders.map(o => {
              const st = STATUS_CFG[o.status]
              return (
                <tr
                  key={o.id}
                  onClick={() => setSelectedId(o.id)}
                  className="hover:bg-primary-50 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3 font-mono font-semibold text-primary-600">{o.reference}</td>
                  <td className="px-4 py-3 text-gray-800">{o.supplier?.company_name}</td>
                  <td className="px-4 py-3 text-gray-500">{o.items_count ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-700">{formatCurrency(o.total_ht)}</td>
                  <td className="px-4 py-3 font-semibold text-gray-900">{formatCurrency(o.total_ttc)}</td>
                  <td className="px-4 py-3 text-gray-500">{fmtDate(o.expected_date)}</td>
                  <td className="px-4 py-3 text-gray-500">{fmtDate(o.created_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <div className={`w-2 h-2 rounded-full ${st.dotCls}`}></div>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${st.cls}`}>{st.label}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-400"><ChevronRight size={18} /></td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {data?.meta && data.meta.last_page > 1 && (
          <div className="px-4 py-3 text-sm text-gray-500 border-t">
            {data.meta.total} commande(s) au total
          </div>
        )}
      </div>

      {showCreate && <OrderFormModal onClose={() => setShowCreate(false)} />}

      {showBLImport && (
        <BLImportModal
          onClose={() => setShowBLImport(false)}
          onDone={() => {
            queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
            queryClient.invalidateQueries({ queryKey: ['po-stats'] })
          }}
        />
      )}
    </div>
  )
}
