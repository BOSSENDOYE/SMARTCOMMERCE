import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../lib/api'
import { formatCurrency } from '../../lib/format'
import toast from 'react-hot-toast'
import { useForm } from 'react-hook-form'
import {
  Truck, Plus, Search, ChevronRight, ArrowLeft, Edit2,
  Package, FileText, ShoppingCart, CheckCircle, Clock,
  AlertTriangle, X, Star, Trash2, Upload, Download, CheckCircle2, AlertCircle,
} from 'lucide-react'
import { useConfirm } from '../../hooks/useConfirm'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Supplier {
  id: number
  company_name: string
  ninea?: string
  rc?: string
  address?: string
  phone?: string
  email?: string
  contact_name?: string
  payment_terms: string
  delivery_days_avg: number
  balance_due: number
  is_active: boolean
  notes?: string
  purchase_orders_count?: number
  invoices_count?: number
}

interface PurchaseOrder {
  id: number
  reference: string
  status: 'draft' | 'sent' | 'partial' | 'received' | 'cancelled'
  total_ht: number
  total_ttc: number
  expected_date?: string
  created_at: string
  items_count?: number
}

interface SupplierInvoice {
  id: number
  reference: string
  amount_ht: number
  amount_ttc: number
  amount_paid: number
  balance_due: number
  payment_status: 'unpaid' | 'partial' | 'paid'
  invoice_date: string
  due_date?: string
}

interface LinkedProduct {
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

interface Paginated<T> {
  data: T[]
  meta: { current_page: number; last_page: number; total: number }
}

interface Stats {
  total: number
  active: number
  total_balance_due: number
  avg_delivery_days: number
}

interface SupplierInvoiceForm {
  reference: string
  amount_ht: number
  vat_rate: number
  invoice_date: string
  due_date?: string
}

interface SupplierPaymentForm {
  amount: number
  payment_method: string
  reference?: string
}

// ─── Constants ───────────────────────────────────────────────────────────────

const PAYMENT_TERMS: Record<string, string> = {
  immediate: 'Comptant',
  '30_days': '30 jours',
  '45_days': '45 jours',
  '60_days': '60 jours',
  '90_days': '90 jours',
}

const PO_STATUS: Record<string, { label: string; cls: string }> = {
  draft:     { label: 'Brouillon',  cls: 'bg-gray-100 text-gray-700' },
  sent:      { label: 'Envoyée',    cls: 'bg-primary-100 text-primary-600' },
  partial:   { label: 'Partielle',  cls: 'bg-yellow-100 text-yellow-700' },
  received:  { label: 'Reçue',      cls: 'bg-green-100 text-green-700' },
  cancelled: { label: 'Annulée',    cls: 'bg-red-100 text-red-700' },
}

const INV_STATUS: Record<string, { label: string; cls: string }> = {
  unpaid:  { label: 'Impayée',     cls: 'bg-red-100 text-red-700' },
  partial: { label: 'Partielle',   cls: 'bg-yellow-100 text-yellow-700' },
  paid:    { label: 'Réglée',      cls: 'bg-green-100 text-green-700' },
}

const PAYMENT_METHODS = [
  { value: 'cash',          label: 'Espèces' },
  { value: 'bank_transfer', label: 'Virement' },
  { value: 'check',         label: 'Chèque' },
  { value: 'wave',          label: 'Wave' },
  { value: 'orange_money',  label: 'Orange Money' },
]

// ─── Small helpers ────────────────────────────────────────────────────────────

function KpiCard({ icon, label, value, sub, color = 'blue' }: {
  icon: React.ReactNode; label: string; value: string | number; sub?: string; color?: string
}) {
  const colors: Record<string, string> = {
    blue:   'bg-primary-50 text-primary',
    green:  'bg-green-50 text-green-600',
    red:    'bg-red-50 text-red-600',
    orange: 'bg-orange-50 text-orange-600',
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

function Badge({ label, cls }: { label: string; cls: string }) {
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{label}</span>
}

function fmtDate(d?: string) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ─── SupplierFormModal ────────────────────────────────────────────────────────

function SupplierFormModal({ supplier, onClose }: { supplier?: Supplier; onClose: () => void }) {
  const qc = useQueryClient()
  const { register, handleSubmit, formState: { errors } } = useForm({ defaultValues: supplier })

  const mut = useMutation({
    mutationFn: (d: Partial<Supplier>) =>
      supplier ? api.put(`/suppliers/${supplier.id}`, d) : api.post('/suppliers', d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['suppliers'] })
      qc.invalidateQueries({ queryKey: ['suppliers-stats'] })
      if (supplier) qc.invalidateQueries({ queryKey: ['supplier', supplier.id] })
      toast.success(supplier ? 'Fournisseur modifié' : 'Fournisseur créé')
      onClose()
    },
    onError: () => toast.error('Erreur lors de l\'enregistrement'),
  })

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b flex items-center justify-between">
          <h2 className="text-xl font-bold">{supplier ? 'Modifier le fournisseur' : 'Nouveau fournisseur'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit(d => mut.mutate(d))} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Raison sociale *</label>
            <input {...register('company_name', { required: true })} className="input" placeholder="Nom de la société" />
            {errors.company_name && <p className="text-red-500 text-xs mt-1">Champ requis</p>}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">NINEA</label>
              <input {...register('ninea')} className="input" placeholder="Numéro NINEA" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">RC</label>
              <input {...register('rc')} className="input" placeholder="Registre de commerce" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Contact</label>
              <input {...register('contact_name')} className="input" placeholder="Nom du contact" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Téléphone</label>
              <input {...register('phone')} className="input" placeholder="+221 77 000 00 00" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input type="email" {...register('email')} className="input" placeholder="email@fournisseur.com" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Délai livraison (jours)</label>
              <input type="number" min={0} {...register('delivery_days_avg', { valueAsNumber: true })} className="input" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Adresse</label>
            <input {...register('address')} className="input" placeholder="Adresse complète" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Conditions de paiement</label>
            <select {...register('payment_terms')} className="input">
              {Object.entries(PAYMENT_TERMS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes internes</label>
            <textarea {...register('notes')} rows={3} className="input resize-none" placeholder="Conditions particulières, remarques..." />
          </div>
          {supplier && (
            <div className="flex items-center gap-2">
              <input type="checkbox" id="is_active" {...register('is_active')} className="w-4 h-4 accent-primary" />
              <label htmlFor="is_active" className="text-sm font-medium text-gray-700">Fournisseur actif</label>
            </div>
          )}
          <div className="flex gap-3 pt-4 border-t">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Annuler</button>
            <button type="submit" disabled={mut.isPending} className="btn-primary flex-1">
              {mut.isPending ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── AddInvoiceModal ──────────────────────────────────────────────────────────

function AddInvoiceModal({ supplierId, onClose }: { supplierId: number; onClose: () => void }) {
  const qc = useQueryClient()
  const { register, handleSubmit, watch } = useForm<SupplierInvoiceForm>({
    defaultValues: {
      reference: '',
      amount_ht: 0,
      vat_rate: 18,
      invoice_date: new Date().toISOString().slice(0, 10),
      due_date: '',
    },
  })
  const amountHt = Number(watch('amount_ht') || 0)
  const vatRate  = Number(watch('vat_rate') || 0)
  const computed  = (amountHt * (1 + vatRate / 100)).toFixed(2)

  const mut = useMutation({
    mutationFn: (d: SupplierInvoiceForm) =>
      api.post(`/suppliers/${supplierId}/invoices`, {
        ...d,
        vat_amount: ((amountHt * vatRate) / 100).toFixed(2),
        amount_ttc: computed,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['supplier-invoices', supplierId] })
      qc.invalidateQueries({ queryKey: ['supplier', supplierId] })
      qc.invalidateQueries({ queryKey: ['suppliers-stats'] })
      toast.success('Facture enregistrée')
      onClose()
    },
    onError: () => toast.error('Erreur lors de l\'enregistrement'),
  })

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl">
        <div className="p-6 border-b flex items-center justify-between">
          <h2 className="text-xl font-bold">Nouvelle facture</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit(d => mut.mutate(d))} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">N° facture *</label>
            <input {...register('reference', { required: true })} className="input" placeholder="FACT-2026-001" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Montant HT *</label>
              <input type="number" step="0.01" min="0" {...register('amount_ht', { required: true })} className="input" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">TVA %</label>
              <input type="number" step="0.01" min="0" {...register('vat_rate')} className="input" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date facture *</label>
              <input type="date" {...register('invoice_date', { required: true })} className="input" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date échéance</label>
              <input type="date" {...register('due_date')} className="input" />
            </div>
          </div>
          <div className="bg-primary-50 rounded-xl p-3 text-sm">
            <span className="text-gray-600">Montant TTC : </span>
            <span className="font-bold text-primary-600">{formatCurrency(Number(computed))}</span>
          </div>
          <div className="flex gap-3 pt-2 border-t">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Annuler</button>
            <button type="submit" disabled={mut.isPending} className="btn-primary flex-1">
              {mut.isPending ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── PayInvoiceModal ──────────────────────────────────────────────────────────

function PayInvoiceModal({ invoice, supplierId, onClose }: {
  invoice: SupplierInvoice; supplierId: number; onClose: () => void
}) {
  const qc = useQueryClient()
  const { register, handleSubmit } = useForm<SupplierPaymentForm>({
    defaultValues: {
      amount: invoice.balance_due,
      payment_method: 'cash',
      reference: '',
    },
  })

  const mut = useMutation({
    mutationFn: (d: SupplierPaymentForm) =>
      api.post(`/suppliers/${supplierId}/invoices/${invoice.id}/pay`, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['supplier-invoices', supplierId] })
      qc.invalidateQueries({ queryKey: ['supplier', supplierId] })
      qc.invalidateQueries({ queryKey: ['suppliers-stats'] })
      qc.invalidateQueries({ queryKey: ['suppliers'] })
      toast.success('Paiement enregistré')
      onClose()
    },
    onError: () => toast.error('Erreur lors du paiement'),
  })

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        <div className="p-6 border-b flex items-center justify-between">
          <h2 className="text-xl font-bold">Enregistrer un paiement</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit(d => mut.mutate(d))} className="p-6 space-y-4">
          <div className="bg-gray-50 rounded-xl p-3 text-sm space-y-1">
            <div className="flex justify-between"><span className="text-gray-500">Facture</span><span className="font-medium">{invoice.reference}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Total TTC</span><span className="font-medium">{formatCurrency(invoice.amount_ttc)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Déjà payé</span><span className="text-green-600 font-medium">{formatCurrency(invoice.amount_paid)}</span></div>
            <div className="flex justify-between border-t pt-1"><span className="text-gray-700 font-semibold">Reste à payer</span><span className="font-bold text-red-600">{formatCurrency(invoice.balance_due)}</span></div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Montant payé *</label>
            <input type="number" step="0.01" min="0.01" {...register('amount', { required: true })} className="input" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Mode de paiement *</label>
            <select {...register('payment_method', { required: true })} className="input">
              {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Référence (optionnel)</label>
            <input {...register('reference')} className="input" placeholder="N° chèque, référence virement..." />
          </div>
          <div className="flex gap-3 pt-2 border-t">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Annuler</button>
            <button type="submit" disabled={mut.isPending} className="btn-primary flex-1">
              {mut.isPending ? 'Enregistrement...' : 'Valider le paiement'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── LinkProductModal ─────────────────────────────────────────────────────────

function LinkProductModal({ supplierId, onClose }: { supplierId: number; onClose: () => void }) {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const { register, handleSubmit } = useForm<{
    product_id: number; supplier_ref: string; negotiated_price_ht: number; is_preferred: boolean
  }>()
  const [selectedProduct, setSelectedProduct] = useState<{ id: number; name: string } | null>(null)

  const { data: results } = useQuery({
    queryKey: ['products-search', search],
    queryFn: () => api.get('/products', { params: { search, per_page: 10 } }).then(r => r.data),
    enabled: search.length > 1,
  })

  const mut = useMutation({
    mutationFn: (d: Record<string, unknown>) => api.post(`/suppliers/${supplierId}/products`, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['supplier-products', supplierId] })
      toast.success('Produit lié au fournisseur')
      onClose()
    },
    onError: () => toast.error('Erreur lors de l\'association'),
  })

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        <div className="p-6 border-b flex items-center justify-between">
          <h2 className="text-xl font-bold">Lier un produit</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit(d => mut.mutate({ ...d, product_id: selectedProduct?.id }))} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Produit *</label>
            {selectedProduct ? (
              <div className="flex items-center gap-2 p-2 bg-primary-50 rounded-lg">
                <span className="flex-1 text-sm font-medium text-blue-900">{selectedProduct.name}</span>
                <button type="button" onClick={() => setSelectedProduct(null)} className="text-primary-400 hover:text-primary"><X size={14} /></button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="input pl-9"
                    placeholder="Rechercher un produit..."
                  />
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                </div>
                {(results?.data ?? []).length > 0 && (
                  <div className="mt-1 border rounded-xl overflow-hidden shadow-lg">
                    {(results?.data ?? []).map((p: { id: number; name: string; internal_code?: string }) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => { setSelectedProduct(p); setSearch('') }}
                        className="w-full px-3 py-2 text-left hover:bg-primary-50 flex items-center justify-between text-sm"
                      >
                        <span>{p.name}</span>
                        {p.internal_code && <span className="text-gray-400 text-xs">{p.internal_code}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Réf. fournisseur</label>
              <input {...register('supplier_ref')} className="input" placeholder="CODE-FRS-001" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Prix négocié HT</label>
              <input type="number" step="0.01" min="0" {...register('negotiated_price_ht', { valueAsNumber: true })} className="input" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="is_preferred" {...register('is_preferred')} className="w-4 h-4 accent-primary" />
            <label htmlFor="is_preferred" className="text-sm font-medium text-gray-700">Fournisseur préférentiel pour ce produit</label>
          </div>
          <div className="flex gap-3 pt-2 border-t">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Annuler</button>
            <button type="submit" disabled={mut.isPending || !selectedProduct} className="btn-primary flex-1">
              {mut.isPending ? 'Enregistrement...' : 'Lier le produit'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Tab: Commandes ───────────────────────────────────────────────────────────

function OrdersTab({ supplier }: { supplier: Supplier }) {
  const { data, isLoading } = useQuery<Paginated<PurchaseOrder>>({
    queryKey: ['supplier-orders', supplier.id],
    queryFn: () => api.get(`/suppliers/${supplier.id}/orders`).then(r => r.data),
  })

  if (isLoading) return <div className="py-8 text-center text-gray-400">Chargement...</div>

  const orders = data?.data ?? []

  if (orders.length === 0) {
    return (
      <div className="py-12 text-center text-gray-400">
        <ShoppingCart size={40} className="mx-auto mb-3 opacity-40" />
        <p>Aucune commande pour ce fournisseur</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b">
          <tr>
            {['Référence', 'Date', 'Livraison prévue', 'Articles', 'Total TTC', 'Statut'].map(h => (
              <th key={h} className="text-left px-4 py-3 font-medium text-gray-600">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {orders.map(o => {
            const st = PO_STATUS[o.status] ?? { label: o.status, cls: 'bg-gray-100 text-gray-700' }
            return (
              <tr key={o.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-mono font-medium text-primary-600">{o.reference}</td>
                <td className="px-4 py-3 text-gray-500">{fmtDate(o.created_at)}</td>
                <td className="px-4 py-3 text-gray-500">{fmtDate(o.expected_date)}</td>
                <td className="px-4 py-3 text-gray-500">{o.items_count ?? '—'}</td>
                <td className="px-4 py-3 font-semibold text-gray-900">{formatCurrency(o.total_ttc)}</td>
                <td className="px-4 py-3"><Badge label={st.label} cls={st.cls} /></td>
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
  )
}

// ─── Tab: Factures ────────────────────────────────────────────────────────────

function InvoicesTab({ supplier }: { supplier: Supplier }) {
  const [showAdd, setShowAdd] = useState(false)
  const [payTarget, setPayTarget] = useState<SupplierInvoice | null>(null)

  const { data, isLoading } = useQuery<Paginated<SupplierInvoice>>({
    queryKey: ['supplier-invoices', supplier.id],
    queryFn: () => api.get(`/suppliers/${supplier.id}/invoices`).then(r => r.data),
  })

  const invoices = data?.data ?? []
  const totalDue = invoices.reduce((s, i) => s + Number(i.balance_due ?? 0), 0)

  function isOverdue(inv: SupplierInvoice) {
    return inv.due_date && inv.payment_status !== 'paid' && new Date(inv.due_date) < new Date()
  }

  if (isLoading) return <div className="py-8 text-center text-gray-400">Chargement...</div>

  return (
    <>
      <div className="p-4 border-b flex items-center justify-between">
        <div className="text-sm text-gray-600">
          Solde dû total : <span className={`font-bold ${totalDue > 0 ? 'text-red-600' : 'text-green-600'}`}>{formatCurrency(totalDue)}</span>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-primary flex items-center gap-2 text-sm py-1.5">
          <Plus size={16} /> Nouvelle facture
        </button>
      </div>

      {invoices.length === 0 ? (
        <div className="py-12 text-center text-gray-400">
          <FileText size={40} className="mx-auto mb-3 opacity-40" />
          <p>Aucune facture enregistrée</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['Référence', 'Date', 'Échéance', 'Montant TTC', 'Payé', 'Reste dû', 'Statut', ''].map(h => (
                  <th key={h} className="text-left px-4 py-3 font-medium text-gray-600">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {invoices.map(inv => {
                const st = INV_STATUS[inv.payment_status] ?? { label: inv.payment_status, cls: 'bg-gray-100 text-gray-700' }
                const overdue = isOverdue(inv)
                return (
                  <tr key={inv.id} className={`hover:bg-gray-50 ${overdue ? 'bg-red-50/40' : ''}`}>
                    <td className="px-4 py-3 font-medium text-gray-900 flex items-center gap-1">
                      {overdue && <AlertTriangle size={14} className="text-red-500" />}
                      {inv.reference}
                    </td>
                    <td className="px-4 py-3 text-gray-500">{fmtDate(inv.invoice_date)}</td>
                    <td className={`px-4 py-3 ${overdue ? 'text-red-600 font-medium' : 'text-gray-500'}`}>{fmtDate(inv.due_date)}</td>
                    <td className="px-4 py-3 font-semibold text-gray-900">{formatCurrency(inv.amount_ttc)}</td>
                    <td className="px-4 py-3 text-green-600">{formatCurrency(inv.amount_paid)}</td>
                    <td className={`px-4 py-3 font-semibold ${Number(inv.balance_due) > 0 ? 'text-red-600' : 'text-gray-500'}`}>
                      {formatCurrency(inv.balance_due)}
                    </td>
                    <td className="px-4 py-3"><Badge label={st.label} cls={st.cls} /></td>
                    <td className="px-4 py-3">
                      {inv.payment_status !== 'paid' && (
                        <button
                          onClick={() => setPayTarget(inv)}
                          className="text-xs bg-green-100 text-green-700 hover:bg-green-200 px-3 py-1 rounded-full font-medium flex items-center gap-1"
                        >
                          <CheckCircle size={12} /> Payer
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && <AddInvoiceModal supplierId={supplier.id} onClose={() => setShowAdd(false)} />}
      {payTarget && <PayInvoiceModal invoice={payTarget} supplierId={supplier.id} onClose={() => setPayTarget(null)} />}
    </>
  )
}

// ─── Tab: Produits liés ───────────────────────────────────────────────────────

function ProductsTab({ supplier }: { supplier: Supplier }) {
  const qc = useQueryClient()
  const confirm = useConfirm()
  const [showLink, setShowLink] = useState(false)

  const { data: products, isLoading } = useQuery<LinkedProduct[]>({
    queryKey: ['supplier-products', supplier.id],
    queryFn: () => api.get(`/suppliers/${supplier.id}/products`).then(r => r.data),
  })

  const unlinkMut = useMutation({
    mutationFn: (productId: number) => api.delete(`/suppliers/${supplier.id}/products/${productId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['supplier-products', supplier.id] })
      toast.success('Produit retiré')
    },
  })

  if (isLoading) return <div className="py-8 text-center text-gray-400">Chargement...</div>

  return (
    <>
      <div className="p-4 border-b flex items-center justify-between">
        <p className="text-sm text-gray-500">{(products ?? []).length} produit(s) associé(s)</p>
        <button onClick={() => setShowLink(true)} className="btn-primary flex items-center gap-2 text-sm py-1.5">
          <Plus size={16} /> Lier un produit
        </button>
      </div>

      {(products ?? []).length === 0 ? (
        <div className="py-12 text-center text-gray-400">
          <Package size={40} className="mx-auto mb-3 opacity-40" />
          <p>Aucun produit lié à ce fournisseur</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['Produit', 'Code interne', 'Réf. fournisseur', 'Prix négocié HT', 'Préférentiel', ''].map(h => (
                  <th key={h} className="text-left px-4 py-3 font-medium text-gray-600">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {(products ?? []).map(p => (
                <tr key={p.id} className="hover:bg-gray-50 group">
                  <td className="px-4 py-3 font-medium text-gray-900">{p.name}</td>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">{p.internal_code ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{p.pivot.supplier_ref ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-700">
                    {p.pivot.negotiated_price_ht ? formatCurrency(p.pivot.negotiated_price_ht) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {p.pivot.is_preferred
                      ? <span className="flex items-center gap-1 text-yellow-600 text-xs font-medium"><Star size={13} className="fill-yellow-400 stroke-yellow-400" /> Préférentiel</span>
                      : <span className="text-gray-400 text-xs">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={async () => { if (await confirm('Retirer ce produit du fournisseur ?', { danger: true })) unlinkMut.mutate(p.id) }}
                      className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-opacity"
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showLink && <LinkProductModal supplierId={supplier.id} onClose={() => setShowLink(false)} />}
    </>
  )
}

// ─── SupplierDetail ───────────────────────────────────────────────────────────

type DetailTab = 'orders' | 'invoices' | 'products'

function SupplierDetail({ supplierId, onBack }: { supplierId: number; onBack: () => void }) {
  const [tab, setTab] = useState<DetailTab>('orders')
  const [showEdit, setShowEdit] = useState(false)

  const { data: supplier, isLoading } = useQuery<Supplier>({
    queryKey: ['supplier', supplierId],
    queryFn: () => api.get(`/suppliers/${supplierId}`).then(r => r.data),
  })

  if (isLoading || !supplier) {
    return <div className="p-8 text-center text-gray-400">Chargement...</div>
  }

  const tabs: { id: DetailTab; label: string; icon: React.ReactNode }[] = [
    { id: 'orders',   label: `Commandes (${supplier.purchase_orders_count ?? 0})`, icon: <ShoppingCart size={16} /> },
    { id: 'invoices', label: `Factures (${supplier.invoices_count ?? 0})`,         icon: <FileText size={16} /> },
    { id: 'products', label: 'Produits liés',                                       icon: <Package size={16} /> },
  ]

  return (
    <div className="p-3 sm:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="flex items-center gap-2 text-gray-500 hover:text-gray-900 text-sm font-medium">
          <ArrowLeft size={18} /> Retour
        </button>
      </div>

      {/* Supplier header card */}
      <div className="card p-5">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-primary-100 flex items-center justify-center">
              <Truck size={28} className="text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-bold text-gray-900">{supplier.company_name}</h2>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${supplier.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {supplier.is_active ? 'Actif' : 'Inactif'}
                </span>
              </div>
              {supplier.contact_name && <p className="text-gray-500 text-sm">{supplier.contact_name}</p>}
              <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                {supplier.phone && <span>{supplier.phone}</span>}
                {supplier.email && <span>{supplier.email}</span>}
              </div>
            </div>
          </div>
          <button onClick={() => setShowEdit(true)} className="btn-secondary flex items-center gap-2 text-sm">
            <Edit2 size={15} /> Modifier
          </button>
        </div>

        {/* Info grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 pt-4 border-t">
          <div>
            <p className="text-xs text-gray-400">NINEA</p>
            <p className="text-sm font-medium text-gray-700">{supplier.ninea || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">RC</p>
            <p className="text-sm font-medium text-gray-700">{supplier.rc || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Conditions paiement</p>
            <p className="text-sm font-medium text-gray-700">{PAYMENT_TERMS[supplier.payment_terms] || supplier.payment_terms}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Délai livraison</p>
            <p className="text-sm font-medium text-gray-700 flex items-center gap-1">
              <Clock size={13} className="text-gray-400" /> {supplier.delivery_days_avg} j
            </p>
          </div>
          {supplier.address && (
            <div className="col-span-2">
              <p className="text-xs text-gray-400">Adresse</p>
              <p className="text-sm font-medium text-gray-700">{supplier.address}</p>
            </div>
          )}
          {supplier.notes && (
            <div className="col-span-2 md:col-span-4">
              <p className="text-xs text-gray-400">Notes</p>
              <p className="text-sm text-gray-600 italic">{supplier.notes}</p>
            </div>
          )}
        </div>

        {supplier.balance_due > 0 && (
          <div className="mt-4 p-3 bg-red-50 rounded-xl flex items-center justify-between">
            <span className="text-sm text-red-700 font-medium flex items-center gap-2">
              <AlertTriangle size={16} /> Solde dû au fournisseur
            </span>
            <span className="text-lg font-bold text-red-700">{formatCurrency(supplier.balance_due)}</span>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="card p-0 overflow-hidden">
        <div className="flex border-b">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-5 py-3.5 text-sm font-medium border-b-2 transition-colors ${
                tab === t.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-gray-500 hover:text-gray-900'
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>
        {tab === 'orders'   && <OrdersTab   supplier={supplier} />}
        {tab === 'invoices' && <InvoicesTab supplier={supplier} />}
        {tab === 'products' && <ProductsTab supplier={supplier} />}
      </div>

      {showEdit && <SupplierFormModal supplier={supplier} onClose={() => setShowEdit(false)} />}
    </div>
  )
}

// ─── Import Fournisseurs Modal ────────────────────────────────────────────────

interface SupplierImportRow {
  row: number
  action: 'create' | 'update'
  existing_id?: number
  raison_sociale: string
  ninea?: string
  rc?: string
  contact?: string
  telephone?: string
  email?: string
  adresse?: string
  conditions: string
  delai: number
  notes?: string
  solde_du: number
  errors: string[]
  warnings: string[]
  status: 'ok' | 'error'
}

interface SupplierPreviewResult {
  rows: SupplierImportRow[]
  total: number
  ok: number
  errors: number
  creates: number
  updates: number
}

function ImportSuppliersModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<'upload' | 'preview' | 'done'>('upload')
  const [preview, setPreview] = useState<SupplierPreviewResult | null>(null)
  const [result, setResult] = useState<{ created: number; updated: number; skipped: number; errors: string[] } | null>(null)
  const [dragging, setDragging] = useState(false)

  const previewMutation = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData()
      fd.append('file', file)
      return api.post<SupplierPreviewResult>('/suppliers/import/preview', fd)
    },
    onSuccess: (res) => {
      setPreview(res.data)
      setStep('preview')
    },
    onError: (err: unknown) => {
      const data = (err as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } })?.response?.data
      const fieldErrors: string[] = data?.errors ? (Object.values(data.errors).flat() as string[]) : []
      toast.error(fieldErrors[0] ?? data?.message ?? 'Erreur lors de la lecture du fichier')
    },
  })

  const confirmMutation = useMutation({
    mutationFn: () => {
      const okRows = preview!.rows.filter(r => r.status === 'ok')
      return api.post('/suppliers/import/confirm', { rows: okRows })
    },
    onSuccess: (res) => {
      setResult(res.data)
      setStep('done')
      qc.invalidateQueries({ queryKey: ['suppliers'] })
      qc.invalidateQueries({ queryKey: ['suppliers-stats'] })
    },
    onError: (err: unknown) => {
      const data = (err as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } })?.response?.data
      const fieldErrors: string[] = data?.errors ? (Object.values(data.errors).flat() as string[]) : []
      toast.error(fieldErrors[0] ?? data?.message ?? "Erreur lors de l'import")
    },
  })

  const handleFile = (file: File) => {
    if (!file) return
    previewMutation.mutate(file)
  }

  const downloadTemplate = async () => {
    try {
      const res = await api.get('/suppliers/import-template', { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url
      a.download = 'modele_import_fournisseurs.xlsx'
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Erreur téléchargement modèle')
    }
  }

  const COND_LABELS: Record<string, string> = {
    immediate: 'Comptant',
    '30_days': '30 jours',
    '45_days': '45 jours',
    '60_days': '60 jours',
    '90_days': '90 jours',
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-3xl shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-6 border-b flex items-center justify-between flex-shrink-0">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Upload size={20} className="text-green-600" />
            Import fournisseurs
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {/* Step: Upload */}
          {step === 'upload' && (
            <div className="space-y-5">
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex gap-3">
                <AlertCircle size={18} className="text-green-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-green-800">
                  <p className="font-medium mb-1">Colonnes du fichier</p>
                  <p>
                    <strong>raison_sociale *</strong>, ninea, rc, contact, telephone, email, adresse,{' '}
                    conditions_paiement (immediate/30_days/45_days/60_days/90_days),{' '}
                    delai_livraison_jours, notes, solde_du
                  </p>
                  <p className="mt-1 text-green-700">
                    Les fournisseurs existants sont identifiés par leur téléphone (ou raison sociale) et seront mis à jour.
                  </p>
                </div>
              </div>

              <button onClick={downloadTemplate} className="flex items-center gap-2 text-sm text-green-700 hover:underline font-medium">
                <Download size={16} /> Télécharger le modèle Excel
              </button>

              {/* Drop zone */}
              <div
                onDragOver={e => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
                onClick={() => fileRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
                  dragging ? 'border-green-500 bg-green-50' : 'border-gray-300 hover:border-green-400 hover:bg-gray-50'
                }`}
              >
                <Upload size={32} className="mx-auto text-gray-400 mb-3" />
                <p className="font-medium text-gray-700">Glissez votre fichier ici</p>
                <p className="text-sm text-gray-400 mt-1">ou cliquez pour sélectionner</p>
                <p className="text-xs text-gray-400 mt-2">CSV, XLS, XLSX — max 10 Mo</p>
                <input ref={fileRef} type="file" accept=".csv,.xls,.xlsx" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
              </div>

              {previewMutation.isPending && (
                <div className="text-center text-sm text-gray-500 animate-pulse">Analyse du fichier en cours...</div>
              )}
            </div>
          )}

          {/* Step: Preview */}
          {step === 'preview' && preview && (
            <div className="space-y-4">
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: 'Total lignes',      value: preview.total,   cls: 'bg-gray-100 text-gray-700' },
                  { label: 'Valides',            value: preview.ok,      cls: 'bg-green-100 text-green-700' },
                  { label: 'À créer',            value: preview.creates, cls: 'bg-blue-100 text-blue-700' },
                  { label: 'À mettre à jour',    value: preview.updates, cls: 'bg-yellow-100 text-yellow-700' },
                ].map(s => (
                  <div key={s.label} className={`rounded-xl p-3 text-center ${s.cls}`}>
                    <p className="text-2xl font-bold">{s.value}</p>
                    <p className="text-xs mt-0.5">{s.label}</p>
                  </div>
                ))}
              </div>

              {preview.errors > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 flex gap-2">
                  <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
                  <span>{preview.errors} ligne(s) avec erreur seront ignorées.</span>
                </div>
              )}

              <div className="overflow-x-auto rounded-xl border border-gray-200">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 text-gray-600 uppercase text-[10px]">
                    <tr>
                      <th className="px-3 py-2 text-left">Ligne</th>
                      <th className="px-3 py-2 text-left">Action</th>
                      <th className="px-3 py-2 text-left">Raison sociale</th>
                      <th className="px-3 py-2 text-left">Téléphone</th>
                      <th className="px-3 py-2 text-left">Conditions</th>
                      <th className="px-3 py-2 text-right">Solde dû</th>
                      <th className="px-3 py-2 text-left">Alertes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {preview.rows.map(r => (
                      <tr key={r.row} className={r.status === 'error' ? 'bg-red-50' : 'hover:bg-gray-50'}>
                        <td className="px-3 py-2 text-gray-400">{r.row}</td>
                        <td className="px-3 py-2">
                          {r.status === 'error'
                            ? <span className="text-red-600 font-medium">Erreur</span>
                            : r.action === 'update'
                              ? <span className="text-yellow-600 font-medium">Màj</span>
                              : <span className="text-green-600 font-medium">Créer</span>}
                        </td>
                        <td className="px-3 py-2 font-medium text-gray-800">{r.raison_sociale || <span className="text-gray-400">—</span>}</td>
                        <td className="px-3 py-2 text-gray-600">{r.telephone || '—'}</td>
                        <td className="px-3 py-2 text-gray-600">{COND_LABELS[r.conditions] ?? r.conditions}</td>
                        <td className="px-3 py-2 text-right">{r.solde_du > 0 ? formatCurrency(r.solde_du) : '—'}</td>
                        <td className="px-3 py-2">
                          {r.errors.map((e, i) => <p key={i} className="text-red-600">{e}</p>)}
                          {r.warnings.map((w, i) => <p key={i} className="text-yellow-600">{w}</p>)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Step: Done */}
          {step === 'done' && result && (
            <div className="text-center py-8 space-y-4">
              <CheckCircle2 size={52} className="mx-auto text-green-500" />
              <h3 className="text-xl font-bold text-gray-800">Import terminé</h3>
              <div className="grid grid-cols-3 gap-4 max-w-sm mx-auto">
                <div className="bg-green-50 rounded-xl p-3">
                  <p className="text-2xl font-bold text-green-700">{result.created}</p>
                  <p className="text-xs text-green-600">Créés</p>
                </div>
                <div className="bg-yellow-50 rounded-xl p-3">
                  <p className="text-2xl font-bold text-yellow-700">{result.updated}</p>
                  <p className="text-xs text-yellow-600">Mis à jour</p>
                </div>
                <div className="bg-gray-100 rounded-xl p-3">
                  <p className="text-2xl font-bold text-gray-600">{result.skipped}</p>
                  <p className="text-xs text-gray-500">Ignorés</p>
                </div>
              </div>
              {result.errors.length > 0 && (
                <div className="text-left bg-red-50 rounded-xl p-3 max-h-32 overflow-y-auto">
                  {result.errors.map((e, i) => <p key={i} className="text-xs text-red-600">{e}</p>)}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t flex justify-between flex-shrink-0">
          <button onClick={onClose} className="btn-secondary">
            {step === 'done' ? 'Fermer' : 'Annuler'}
          </button>
          {step === 'preview' && (
            <div className="flex gap-3">
              <button onClick={() => { setStep('upload'); setPreview(null) }} className="btn-secondary">
                Changer de fichier
              </button>
              <button
                onClick={() => confirmMutation.mutate()}
                disabled={confirmMutation.isPending || preview!.ok === 0}
                className="btn-primary disabled:opacity-50 flex items-center gap-2">
                {confirmMutation.isPending ? 'Import en cours...' : `Importer ${preview!.ok} fournisseur(s)`}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SuppliersPage() {
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [search, setSearch]         = useState('')
  const [filter, setFilter]         = useState<'all' | 'active' | 'inactive'>('all')
  const [showCreate, setShowCreate] = useState(false)
  const [showImport, setShowImport] = useState(false)

  const { data: stats } = useQuery<Stats>({
    queryKey: ['suppliers-stats'],
    queryFn: () => api.get('/suppliers/stats').then(r => r.data),
  })

  const { data, isLoading } = useQuery<Paginated<Supplier>>({
    queryKey: ['suppliers', search, filter],
    queryFn: () => api.get('/suppliers', { params: { search, filter: filter === 'all' ? undefined : filter } }).then(r => r.data),
  })

  if (selectedId !== null) {
    return <SupplierDetail supplierId={selectedId} onBack={() => setSelectedId(null)} />
  }

  const suppliers = data?.data ?? []

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Truck size={24} /> Fournisseurs
        </h1>
        <div className="flex gap-2">
          <button onClick={() => setShowImport(true)} className="btn-secondary flex items-center gap-2">
            <Upload size={18} /> Importer
          </button>
          <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
            <Plus size={18} /> Nouveau fournisseur
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={<Truck size={20} />}
          label="Total fournisseurs"
          value={stats?.total ?? 0}
          color="blue"
        />
        <KpiCard
          icon={<CheckCircle size={20} />}
          label="Actifs"
          value={stats?.active ?? 0}
          sub={`${stats?.total ? Math.round(((stats?.active ?? 0) / stats.total) * 100) : 0}% du total`}
          color="green"
        />
        <KpiCard
          icon={<AlertTriangle size={20} />}
          label="Solde dû total"
          value={formatCurrency(stats?.total_balance_due ?? 0)}
          color={(stats?.total_balance_due ?? 0) > 0 ? 'red' : 'green'}
        />
        <KpiCard
          icon={<Clock size={20} />}
          label="Délai livraison moyen"
          value={`${stats?.avg_delivery_days ?? 0} jours`}
          color="orange"
        />
      </div>

      {/* Search + filters */}
      <div className="card p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input pl-10"
            placeholder="Rechercher un fournisseur ou contact..."
          />
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
        </div>
        <div className="flex gap-2">
          {(['all', 'active', 'inactive'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                filter === f ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {f === 'all' ? 'Tous' : f === 'active' ? 'Actifs' : 'Inactifs'}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              {['Fournisseur', 'Contact', 'Téléphone', 'Conditions', 'Délai', 'Commandes', 'Solde dû', 'Statut', ''].map(h => (
                <th key={h} className="text-left px-4 py-3 font-medium text-gray-600">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading ? (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">Chargement...</td></tr>
            ) : suppliers.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center">
                  <Truck size={40} className="mx-auto mb-3 text-gray-300" />
                  <p className="text-gray-400">Aucun fournisseur trouvé</p>
                  <button onClick={() => setShowCreate(true)} className="mt-3 btn-primary text-sm">
                    Créer le premier fournisseur
                  </button>
                </td>
              </tr>
            ) : suppliers.map(s => (
              <tr
                key={s.id}
                onClick={() => setSelectedId(s.id)}
                className="hover:bg-primary-50 cursor-pointer transition-colors"
              >
                <td className="px-4 py-3">
                  <div className="font-semibold text-gray-900">{s.company_name}</div>
                  {s.ninea && <div className="text-xs text-gray-400">NINEA {s.ninea}</div>}
                </td>
                <td className="px-4 py-3 text-gray-500">{s.contact_name ?? '—'}</td>
                <td className="px-4 py-3 text-gray-500">{s.phone ?? '—'}</td>
                <td className="px-4 py-3">
                  <span className="bg-primary-50 text-primary-600 px-2 py-0.5 rounded-full text-xs font-medium">
                    {PAYMENT_TERMS[s.payment_terms] ?? s.payment_terms}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500 flex items-center gap-1">
                  <Clock size={13} className="text-gray-400" /> {s.delivery_days_avg}j
                </td>
                <td className="px-4 py-3 text-gray-600">{s.purchase_orders_count ?? 0}</td>
                <td className={`px-4 py-3 font-semibold ${s.balance_due > 0 ? 'text-red-600' : 'text-gray-500'}`}>
                  {formatCurrency(s.balance_due)}
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${s.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {s.is_active ? 'Actif' : 'Inactif'}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-400">
                  <ChevronRight size={18} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {data?.meta && data.meta.last_page > 1 && (
          <div className="px-4 py-3 text-sm text-gray-500 border-t">
            {data.meta.total} fournisseur(s) au total
          </div>
        )}
      </div>

      {showCreate && <SupplierFormModal onClose={() => setShowCreate(false)} />}
      {showImport && <ImportSuppliersModal onClose={() => setShowImport(false)} />}
    </div>
  )
}
