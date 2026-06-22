import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../lib/api'
import toast from 'react-hot-toast'
import {
  FileText, Plus, Search, Send, AlertCircle, ChevronRight, ArrowRight,
  Printer, CreditCard, Bell, Trash2, Edit2, X, Check, XCircle, FileDown,
} from 'lucide-react'
import { downloadPdf } from '../../lib/format'
import { useAuthStore } from '../../store/auth.store'
import { useActiveStoreStore } from '../../store/active-store.store'
import { useConfirm } from '../../hooks/useConfirm'

// ── Types ─────────────────────────────────────────────────────────────────────

type InvoiceStatus = 'draft' | 'sent' | 'partial' | 'paid' | 'overdue' | 'cancelled'
type QuoteStatus   = 'draft' | 'sent' | 'accepted' | 'invoiced' | 'expired' | 'cancelled'

interface LineItem {
  id?: number
  product_id?: number | null
  description: string
  quantity: number
  unit: string
  unit_price: number
  discount_percent: number
  vat_rate: number
  total_ht?: number
  total_ttc?: number
}

interface ClientEntry { id: number; name: string; phone: string; email?: string }

// Produit de catalogue normalisé (produit boutique OU article restaurant)
interface CatalogItem {
  id: number
  name: string
  unit_price_ht: number  // toujours HT
  vat_rate: number
  source: 'product' | 'restaurant'
}

interface Invoice {
  id: number
  reference: string
  object?: string
  status: InvoiceStatus
  issue_date: string
  due_date?: string
  subtotal_ht: number
  vat_amount: number
  discount_amount: number
  total_ttc: number
  paid_amount: number
  balance: number
  is_overdue: boolean
  notes?: string
  terms?: string
  client?: ClientEntry
  items?: LineItem[]
  payments?: Payment[]
  reminders?: Reminder[]
}

interface Quote {
  id: number
  reference: string
  object?: string
  status: QuoteStatus
  issue_date: string
  valid_until?: string
  subtotal_ht: number
  vat_amount: number
  discount_amount: number
  total_ttc: number
  is_expired: boolean
  notes?: string
  terms?: string
  client?: ClientEntry
  items?: LineItem[]
  invoice_id?: number | null
}

interface Payment {
  id: number
  amount: number
  method: string
  reference?: string
  paid_at: string
  notes?: string
}

interface Reminder {
  id: number
  type: string
  method: string
  sent_at: string
  notes?: string
}

interface Stats {
  total_count: number
  draft_count: number
  sent_count: number
  paid_count: number
  overdue_count: number
  total_ttc: number
  total_paid: number
  total_balance: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat('fr-SN', { style: 'currency', currency: 'XOF', maximumFractionDigits: 0 }).format(n)

const fmtDate = (d?: string) =>
  d ? new Date(d).toLocaleDateString('fr-SN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

const STATUS_INVOICE: Record<InvoiceStatus, { label: string; color: string }> = {
  draft:     { label: 'Brouillon',  color: 'bg-gray-100 text-gray-600' },
  sent:      { label: 'Envoyée',    color: 'bg-blue-100 text-blue-700' },
  partial:   { label: 'Partiel',    color: 'bg-yellow-100 text-yellow-700' },
  paid:      { label: 'Payée',      color: 'bg-green-100 text-green-700' },
  overdue:   { label: 'En retard',  color: 'bg-red-100 text-red-700' },
  cancelled: { label: 'Annulée',    color: 'bg-gray-100 text-gray-400' },
}

const STATUS_QUOTE: Record<QuoteStatus, { label: string; color: string }> = {
  draft:     { label: 'Brouillon',  color: 'bg-gray-100 text-gray-600' },
  sent:      { label: 'Envoyé',     color: 'bg-blue-100 text-blue-700' },
  accepted:  { label: 'Accepté',    color: 'bg-green-100 text-green-700' },
  invoiced:  { label: 'Facturé',    color: 'bg-purple-100 text-purple-700' },
  expired:   { label: 'Expiré',     color: 'bg-red-100 text-red-700' },
  cancelled: { label: 'Annulé',     color: 'bg-gray-100 text-gray-400' },
}

const PAYMENT_METHODS: Record<string, string> = {
  cash:          'Espèces',
  mobile_money:  'Mobile Money',
  bank_transfer: 'Virement',
  check:         'Chèque',
  other:         'Autre',
}

// ── Composant calcul ligne ────────────────────────────────────────────────────

function calcLine(item: LineItem): { ht: number; ttc: number } {
  const base     = item.quantity * item.unit_price
  const afterDisc = base * (1 - item.discount_percent / 100)
  const ttc      = afterDisc * (1 + item.vat_rate / 100)
  return { ht: Math.round(afterDisc), ttc: Math.round(ttc) }
}

// ═══════════════════════════════════════════════════════════════════════════════
// DOCUMENT EDITOR MODAL (Facture ou Devis)
// ═══════════════════════════════════════════════════════════════════════════════

type BusinessType = 'grande_surface' | 'restaurant' | 'depot' | 'mixte'

interface CrmPrefill {
  client_id?: number
  client?: ClientEntry
  object?: string
  type?: 'invoice' | 'quote'
}

function DocumentEditor({
  type,
  initial,
  storeId,
  businessType,
  onClose,
  onSaved,
  prefill,
}: {
  type: 'invoice' | 'quote'
  initial?: Invoice | Quote | null
  storeId: number
  businessType: BusinessType
  onClose: () => void
  onSaved: (doc: Invoice | Quote) => void
  prefill?: CrmPrefill
}) {
  const isEdit = !!initial

  const [clientId, setClientId]     = useState<number | ''>(initial?.client?.id ?? prefill?.client_id ?? '')
  const [object, setObject]         = useState(initial?.object ?? prefill?.object ?? '')
  const [issueDate, setIssueDate]   = useState(initial?.issue_date ?? new Date().toISOString().slice(0, 10))
  const [dueDate, setDueDate]       = useState((initial as Invoice)?.due_date ?? '')
  const [validUntil, setValidUntil] = useState((initial as Quote)?.valid_until ?? '')
  const [notes, setNotes]           = useState(initial?.notes ?? '')
  const [terms, setTerms]           = useState(initial?.terms ?? '')
  const [items, setItems]           = useState<LineItem[]>(
    initial?.items?.length
      ? initial.items.map(i => ({
          product_id: i.product_id,
          description: i.description,
          quantity: Number(i.quantity),
          unit: i.unit || 'unité',
          unit_price: Number(i.unit_price),
          discount_percent: Number(i.discount_percent),
          vat_rate: Number(i.vat_rate),
        }))
      : [{ description: '', quantity: 1, unit: 'unité', unit_price: 0, discount_percent: 0, vat_rate: 18 }]
  )

  const { data: clients = [] } = useQuery<ClientEntry[]>({
    queryKey: ['clients-list'],
    queryFn: () => api.get('/clients', { params: { per_page: 200 } }).then(r => r.data.data ?? r.data),
    staleTime: 60_000,
  })

  // Produits boutique — exclus pour les magasins purement restaurant
  const isRestaurantOnly = businessType === 'restaurant'
  const isBoutiqueOnly   = businessType === 'grande_surface' || businessType === 'depot'

  const { data: rawProducts = [] } = useQuery<{ id: number; name: string; sale_price_ttc: number; vat_rate: number }[]>({
    queryKey: ['products-short', storeId],
    queryFn: () => api.get('/products', { params: { per_page: 500, active: 1 } })
      .then(r => r.data.data ?? r.data),
    staleTime: 60_000,
    enabled: !isRestaurantOnly, // pas besoin pour restaurant pur
  })

  // Articles restaurant — exclus pour les magasins purement boutique
  const { data: rawRestaurantItems = [] } = useQuery<{ id: number; name: string; price_ht: number; vat_rate: number }[]>({
    queryKey: ['restaurant-items-short', storeId],
    queryFn: () => api.get('/restaurant-items', { params: { per_page: 500 } })
      .then(r => r.data.data ?? r.data),
    staleTime: 60_000,
    enabled: !isBoutiqueOnly, // pas besoin pour boutique pure
  })

  // Normalisation en CatalogItem avec prix HT
  const catalogProducts: CatalogItem[] = rawProducts.map(p => ({
    id: p.id,
    name: p.name,
    // Convertir TTC → HT
    unit_price_ht: Math.round(Number(p.sale_price_ttc) / (1 + Number(p.vat_rate || 18) / 100)),
    vat_rate: Number(p.vat_rate || 18),
    source: 'product' as const,
  }))

  const catalogRestaurant: CatalogItem[] = rawRestaurantItems.map(r => ({
    id: r.id,
    name: r.name,
    unit_price_ht: Math.round(Number(r.price_ht)),
    vat_rate: Number(r.vat_rate || 18),
    source: 'restaurant' as const,
  }))

  const mutation = useMutation({
    mutationFn: (payload: object) => {
      if (isEdit) {
        const url = type === 'invoice' ? `/invoices/${initial!.id}` : `/quotes/${initial!.id}`
        return api.put(url, payload).then(r => r.data)
      }
      return api.post(`/${type === 'invoice' ? 'invoices' : 'quotes'}`, payload).then(r => r.data)
    },
    onSuccess: (doc) => { onSaved(doc); onClose() },
    onError: (e: unknown) => {
      const err = e as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } }
      const errors = err?.response?.data?.errors
      const msg    = err?.response?.data?.message
      if (errors) {
        toast.error(Object.values(errors).flat().slice(0, 2).join(' · '))
      } else {
        toast.error(msg ?? 'Erreur lors de la sauvegarde')
      }
      console.error('[DocumentEditor] save error:', err?.response?.data ?? e)
    },
  })

  const addLine = () =>
    setItems(prev => [...prev, { description: '', quantity: 1, unit: 'unité', unit_price: 0, discount_percent: 0, vat_rate: 18 }])

  const removeLine = (i: number) => setItems(prev => prev.filter((_, idx) => idx !== i))

  const updateLine = (i: number, field: keyof LineItem, value: string | number) => {
    setItems(prev => prev.map((it, idx) => idx === i ? { ...it, [field]: value } : it))
  }

  const allCatalog: CatalogItem[] = [...catalogProducts, ...catalogRestaurant]

  const pickProduct = (i: number, itemKey: string) => {
    // itemKey = "product:123" ou "restaurant:456"
    const [source, idStr] = itemKey.split(':')
    const id = Number(idStr)
    const p = source === 'restaurant'
      ? catalogRestaurant.find(x => x.id === id)
      : catalogProducts.find(x => x.id === id)
    if (!p) return
    setItems(prev => prev.map((it, idx) => idx === i ? {
      ...it,
      product_id: p.source === 'product' ? p.id : null,
      description: p.name,
      unit_price: p.unit_price_ht,
      vat_rate: p.vat_rate,
    } : it))
  }

  const totals = items.reduce((acc, it) => {
    const { ht, ttc } = calcLine(it)
    const disc = it.quantity * it.unit_price * (it.discount_percent / 100)
    return { ht: acc.ht + ht, ttc: acc.ttc + ttc, disc: acc.disc + disc, vat: acc.vat + (ttc - ht) }
  }, { ht: 0, ttc: 0, disc: 0, vat: 0 })

  const handleSubmit = () => {
    if (!items.length || items.some(it => !it.description.trim())) {
      return toast.error('Chaque ligne doit avoir une description')
    }
    const payload: Record<string, unknown> = {
      store_id: storeId,
      client_id: clientId || null,
      object: object || null,
      issue_date: issueDate,
      notes: notes || null,
      terms: terms || null,
      items: items.map(it => ({
        product_id: it.product_id ?? null,
        description: it.description,
        quantity: it.quantity,
        unit: it.unit,
        unit_price: it.unit_price,
        discount_percent: it.discount_percent,
        vat_rate: it.vat_rate,
      })),
    }
    if (type === 'invoice') payload.due_date = dueDate || null
    if (type === 'quote')   payload.valid_until = validUntil || null
    mutation.mutate(payload)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 overflow-y-auto p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl my-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-primary/10 rounded-xl flex items-center justify-center">
              <FileText size={18} className="text-primary" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-800">
                {isEdit ? 'Modifier' : 'Nouveau'} {type === 'invoice' ? 'Facture' : 'Devis'}
              </h2>
              <p className="text-xs text-gray-400">{isEdit ? 'Modification du document' : 'Création d\'un nouveau document'}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-lg hover:bg-gray-100">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Infos générales */}
          <div className="bg-gray-50/50 rounded-xl border border-gray-100 p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1 h-4 bg-primary rounded-full" />
              <h3 className="text-sm font-semibold text-gray-700">Informations générales</h3>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Client</label>
                <select
                  value={clientId}
                  onChange={e => setClientId(e.target.value ? Number(e.target.value) : '')}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="">— Sans client —</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>{c.name} {c.phone ? `(${c.phone})` : ''}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Objet</label>
                <input
                  type="text"
                  value={object}
                  onChange={e => setObject(e.target.value)}
                  placeholder="Ex : Livraison matériaux mois de juin"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Date d'émission</label>
                <input
                  type="date"
                  value={issueDate}
                  onChange={e => setIssueDate(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">
                  {type === 'invoice' ? 'Date d\'échéance' : 'Valide jusqu\'au'}
                </label>
                <input
                  type="date"
                  value={type === 'invoice' ? dueDate : validUntil}
                  onChange={e => type === 'invoice' ? setDueDate(e.target.value) : setValidUntil(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            </div>
          </div>

          {/* Lignes */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-1 h-4 bg-primary rounded-full" />
                <h3 className="text-sm font-semibold text-gray-700">Détail des lignes</h3>
              </div>
              <button
                onClick={addLine}
                className="flex items-center gap-1.5 text-sm text-primary hover:text-primary-600 font-medium transition-colors group"
              >
                <div className="w-5 h-5 rounded-full bg-primary/10 group-hover:bg-primary/20 flex items-center justify-center transition-colors">
                  <Plus size={12} className="text-primary" />
                </div>
                Ajouter une ligne
              </button>
            </div>

            <div className="rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100">
                  <tr>
                    <th className="px-3 py-2.5 text-center w-8">#</th>
                    <th className="px-3 py-2.5 text-left">Produit / Description</th>
                    <th className="px-3 py-2.5 text-right w-20">Qté</th>
                    <th className="px-3 py-2.5 text-left w-20">Unité</th>
                    <th className="px-3 py-2.5 text-right w-24">P.U HT</th>
                    <th className="px-3 py-2.5 text-right w-16">Remise%</th>
                    <th className="px-3 py-2.5 text-right w-16">TVA%</th>
                    <th className="px-3 py-2.5 text-right w-28">Total TTC</th>
                    <th className="px-2 py-2.5 w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {items.map((it, i) => {
                    const { ttc } = calcLine(it)
                    return (
                      <tr key={i} className="hover:bg-blue-50/20 transition-colors">
                        <td className="px-3 py-2 text-gray-400 text-xs text-center">{i + 1}</td>
                        <td className="px-3 py-1.5">
                          <select
                            className="w-full text-xs border-0 bg-transparent text-primary mb-1 cursor-pointer"
                            value=""
                            onChange={e => e.target.value && pickProduct(i, e.target.value)}
                          >
                            <option value="">— Sélectionner dans le catalogue —</option>
                            {catalogProducts.length > 0 && (
                              <optgroup label="📦 Produits">
                                {catalogProducts.map(p => (
                                  <option key={`product:${p.id}`} value={`product:${p.id}`}>{p.name}</option>
                                ))}
                              </optgroup>
                            )}
                            {catalogRestaurant.length > 0 && (
                              <optgroup label="🍽️ Menu Restaurant">
                                {catalogRestaurant.map(r => (
                                  <option key={`restaurant:${r.id}`} value={`restaurant:${r.id}`}>{r.name}</option>
                                ))}
                              </optgroup>
                            )}
                          </select>
                          <input
                            type="text"
                            value={it.description}
                            onChange={e => updateLine(i, 'description', e.target.value)}
                            placeholder="Description de la prestation..."
                            className="w-full border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary/30"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            type="number"
                            min="0.001"
                            step="0.001"
                            value={it.quantity}
                            onChange={e => updateLine(i, 'quantity', parseFloat(e.target.value) || 0)}
                            className="w-full border border-gray-200 rounded-lg px-2 py-1 text-sm text-right focus:outline-none focus:ring-1 focus:ring-primary/30"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            type="text"
                            value={it.unit}
                            onChange={e => updateLine(i, 'unit', e.target.value)}
                            className="w-full border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary/30"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            type="number"
                            min="0"
                            value={it.unit_price}
                            onChange={e => updateLine(i, 'unit_price', parseFloat(e.target.value) || 0)}
                            className="w-full border border-gray-200 rounded-lg px-2 py-1 text-sm text-right focus:outline-none focus:ring-1 focus:ring-primary/30"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={it.discount_percent}
                            onChange={e => updateLine(i, 'discount_percent', parseFloat(e.target.value) || 0)}
                            className="w-full border border-gray-200 rounded-lg px-2 py-1 text-sm text-right focus:outline-none focus:ring-1 focus:ring-primary/30"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={it.vat_rate}
                            onChange={e => updateLine(i, 'vat_rate', parseFloat(e.target.value) || 0)}
                            className="w-full border border-gray-200 rounded-lg px-2 py-1 text-sm text-right focus:outline-none focus:ring-1 focus:ring-primary/30"
                          />
                        </td>
                        <td className="px-3 py-1.5 text-right font-semibold text-gray-800">
                          {fmt(ttc)}
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          {items.length > 1 && (
                            <button onClick={() => removeLine(i)} className="text-gray-300 hover:text-red-500 transition-colors">
                              <X size={14} />
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Totaux */}
            <div className="mt-4 flex justify-end">
              <div className="w-64 bg-gray-50 rounded-xl border border-gray-100 p-4 space-y-2 text-sm">
                <div className="flex justify-between text-gray-600">
                  <span>Sous-total HT</span>
                  <span className="font-mono">{fmt(totals.ht)}</span>
                </div>
                {totals.disc > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Remises</span>
                    <span className="font-mono">− {fmt(totals.disc)}</span>
                  </div>
                )}
                <div className="flex justify-between text-gray-600">
                  <span>TVA</span>
                  <span className="font-mono">{fmt(totals.vat)}</span>
                </div>
                <div className="flex justify-between font-bold text-gray-800 border-t border-gray-200 pt-2">
                  <span>Total TTC</span>
                  <span className="text-primary font-mono text-base">{fmt(totals.ttc)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Notes & Conditions */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Notes</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={3}
                placeholder="Remarques, instructions de livraison..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Conditions de paiement</label>
              <textarea
                value={terms}
                onChange={e => setTerms(e.target.value)}
                rows={3}
                placeholder="Ex : Paiement à 30 jours, pénalités de retard..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50/50 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-100 transition-colors">
            Annuler
          </button>
          <button
            onClick={handleSubmit}
            disabled={mutation.isPending}
            className="flex items-center gap-2 px-6 py-2 bg-primary hover:bg-primary-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50 transition-colors shadow-sm"
          >
            <Check size={16} />
            {mutation.isPending ? 'Sauvegarde…' : (isEdit ? 'Mettre à jour' : `Créer ${type === 'invoice' ? 'la facture' : 'le devis'}`)}
          </button>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// INVOICE PRINT VIEW — s'ouvre dans une nouvelle fenêtre
// ═══════════════════════════════════════════════════════════════════════════════

function printDocument(doc: Invoice | Quote, type: 'invoice' | 'quote', storeName: string) {
  const title = type === 'invoice' ? 'FACTURE' : 'DEVIS'
  const items = doc.items ?? []

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>${title} ${doc.reference}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 12px; color: #1f2937; padding: 20mm; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 30px; }
  .company { }
  .company h1 { font-size: 20px; font-weight: bold; color: #1d4ed8; }
  .company p { color: #6b7280; font-size: 11px; margin-top: 2px; }
  .doc-type { text-align: right; }
  .doc-type h2 { font-size: 28px; font-weight: bold; color: #374151; letter-spacing: 2px; }
  .doc-type .ref { font-size: 14px; font-weight: 600; color: #1d4ed8; margin-top: 4px; }
  .doc-type .dates { font-size: 11px; color: #6b7280; margin-top: 8px; }
  .client-section { margin-bottom: 24px; background: #f9fafb; border-radius: 8px; padding: 16px; }
  .client-section h3 { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #9ca3af; margin-bottom: 6px; }
  .client-section p { font-size: 13px; font-weight: 600; }
  .client-section .contact { font-size: 11px; color: #6b7280; }
  .object-section { margin-bottom: 16px; padding: 10px 16px; background: #eff6ff; border-left: 3px solid #3b82f6; border-radius: 0 6px 6px 0; }
  .object-section span { font-size: 11px; text-transform: uppercase; color: #3b82f6; font-weight: 600; }
  .object-section p { font-size: 13px; font-weight: 500; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  thead tr { background: #1d4ed8; color: white; }
  thead th { padding: 8px 10px; text-align: left; font-size: 11px; font-weight: 600; letter-spacing: 0.5px; }
  thead th:not(:first-child) { text-align: right; }
  tbody tr:nth-child(even) { background: #f9fafb; }
  tbody td { padding: 8px 10px; font-size: 12px; border-bottom: 1px solid #e5e7eb; }
  tbody td:not(:first-child) { text-align: right; }
  .totals { display: flex; justify-content: flex-end; margin-top: 8px; }
  .totals-box { width: 260px; }
  .totals-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 12px; }
  .totals-row.total { border-top: 2px solid #1d4ed8; margin-top: 4px; padding-top: 8px; font-size: 15px; font-weight: bold; color: #1d4ed8; }
  .notes { margin-top: 30px; display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
  .notes-box h4 { font-size: 11px; text-transform: uppercase; color: #9ca3af; margin-bottom: 6px; }
  .notes-box p { font-size: 11px; color: #4b5563; line-height: 1.5; }
  .footer { margin-top: 40px; text-align: center; font-size: 10px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 12px; }
  @media print {
    body { padding: 15mm; }
    button { display: none !important; }
  }
</style>
</head>
<body>
  <div class="header">
    <div class="company">
      <h1>${storeName}</h1>
      <p>Baobab SmartCommerce</p>
    </div>
    <div class="doc-type">
      <h2>${title}</h2>
      <div class="ref">${doc.reference}</div>
      <div class="dates">
        Date d'émission : ${fmtDate(doc.issue_date)}<br>
        ${'due_date' in doc && doc.due_date ? `Échéance : ${fmtDate(doc.due_date)}` : ''}
        ${'valid_until' in doc && doc.valid_until ? `Valide jusqu'au : ${fmtDate(doc.valid_until)}` : ''}
      </div>
    </div>
  </div>

  ${doc.client ? `
  <div class="client-section">
    <h3>Destinataire</h3>
    <p>${doc.client.name}</p>
    <p class="contact">${[doc.client.phone, doc.client.email].filter(Boolean).join(' · ')}</p>
  </div>` : ''}

  ${doc.object ? `
  <div class="object-section">
    <span>Objet</span>
    <p>${doc.object}</p>
  </div>` : ''}

  <table>
    <thead>
      <tr>
        <th style="width:40%">Description</th>
        <th style="width:8%">Qté</th>
        <th style="width:10%">Unité</th>
        <th style="width:12%">P.U HT</th>
        <th style="width:8%">Remise</th>
        <th style="width:8%">TVA</th>
        <th style="width:14%">Total TTC</th>
      </tr>
    </thead>
    <tbody>
      ${items.map(it => {
        const { ttc } = calcLine({ ...it, quantity: Number(it.quantity), unit_price: Number(it.unit_price), discount_percent: Number(it.discount_percent), vat_rate: Number(it.vat_rate) })
        return `<tr>
          <td>${it.description}</td>
          <td>${it.quantity}</td>
          <td>${it.unit || 'unité'}</td>
          <td>${Number(it.unit_price).toLocaleString('fr-SN')}</td>
          <td>${it.discount_percent ? it.discount_percent + '%' : '—'}</td>
          <td>${it.vat_rate}%</td>
          <td>${ttc.toLocaleString('fr-SN')}</td>
        </tr>`
      }).join('')}
    </tbody>
  </table>

  <div class="totals">
    <div class="totals-box">
      <div class="totals-row"><span>Sous-total HT</span><span>${Number(doc.subtotal_ht).toLocaleString('fr-SN')} XOF</span></div>
      ${Number(doc.discount_amount) > 0 ? `<div class="totals-row" style="color:#d97706"><span>Remises</span><span>− ${Number(doc.discount_amount).toLocaleString('fr-SN')} XOF</span></div>` : ''}
      <div class="totals-row"><span>TVA</span><span>${Number(doc.vat_amount).toLocaleString('fr-SN')} XOF</span></div>
      <div class="totals-row total"><span>TOTAL TTC</span><span>${Number(doc.total_ttc).toLocaleString('fr-SN')} XOF</span></div>
    </div>
  </div>

  ${doc.notes || doc.terms ? `
  <div class="notes">
    ${doc.notes ? `<div class="notes-box"><h4>Notes</h4><p>${doc.notes}</p></div>` : ''}
    ${doc.terms ? `<div class="notes-box"><h4>Conditions de paiement</h4><p>${doc.terms}</p></div>` : ''}
  </div>` : ''}

  <div class="footer">
    Document généré par Baobab SmartCommerce · ${new Date().toLocaleDateString('fr-SN')}
  </div>

  <script>window.onload = () => window.print()</script>
</body>
</html>`

  const w = window.open('', '_blank', 'width=800,height=900')
  if (w) {
    w.document.write(html)
    w.document.close()
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// INVOICE DETAIL PANEL
// ═══════════════════════════════════════════════════════════════════════════════

function InvoiceDetail({
  invoice,
  storeName,
  onClose,
  onRefresh,
}: {
  invoice: Invoice
  storeName: string
  onClose: () => void
  onRefresh: () => void
}) {
  const confirm = useConfirm()
  const [pdfLoading, setPdfLoading] = useState(false)
  const [payModal, setPayModal] = useState(false)
  const [reminderModal, setReminderModal] = useState(false)
  const [payAmount, setPayAmount] = useState(String(invoice.balance))
  const [payMethod, setPayMethod] = useState('cash')
  const [payRef, setPayRef]     = useState('')
  const [remType, setRemType]   = useState<'first' | 'second' | 'final'>('first')
  const [remMethod, setRemMethod] = useState('phone')
  const [remNotes, setRemNotes] = useState('')

  const qc = useQueryClient()

  const { data: full } = useQuery<Invoice>({
    queryKey: ['invoice', invoice.id],
    queryFn: () => api.get(`/invoices/${invoice.id}`).then(r => r.data),
    initialData: invoice,
  })

  const markSentMut = useMutation({
    mutationFn: () => api.post(`/invoices/${invoice.id}/mark-sent`).then(r => r.data),
    onSuccess: () => { toast.success('Facture marquée comme envoyée'); onRefresh() },
  })

  const cancelMut = useMutation({
    mutationFn: () => api.post(`/invoices/${invoice.id}/cancel`).then(r => r.data),
    onSuccess: () => { toast.success('Facture annulée'); onRefresh(); onClose() },
  })

  const payMut = useMutation({
    mutationFn: () => api.post(`/invoices/${invoice.id}/payments`, {
      amount: parseFloat(payAmount),
      method: payMethod,
      reference: payRef || null,
    }).then(r => r.data),
    onSuccess: () => {
      toast.success('Paiement enregistré')
      qc.invalidateQueries({ queryKey: ['invoice', invoice.id] })
      qc.invalidateQueries({ queryKey: ['invoices'] })
      setPayModal(false)
      onRefresh()
    },
    onError: () => toast.error('Erreur lors du paiement'),
  })

  const reminderMut = useMutation({
    mutationFn: () => api.post(`/invoices/${invoice.id}/reminders`, {
      type: remType, method: remMethod, notes: remNotes || null,
    }).then(r => r.data),
    onSuccess: () => {
      toast.success('Relance enregistrée')
      qc.invalidateQueries({ queryKey: ['invoice', invoice.id] })
      setReminderModal(false)
    },
    onError: () => toast.error('Erreur'),
  })

  const inv = full ?? invoice
  const st  = inv.is_overdue && inv.status !== 'paid' && inv.status !== 'cancelled' ? 'overdue' : inv.status
  const statusInfo = STATUS_INVOICE[st as InvoiceStatus] ?? STATUS_INVOICE.draft

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end bg-black/40" onClick={onClose}>
      <div
        className="h-full w-full max-w-2xl bg-white shadow-2xl overflow-y-auto animate-slide-in-right"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white z-10 px-6 py-4 border-b border-gray-100 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-bold text-gray-800 font-mono">{inv.reference}</span>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusInfo.color}`}>
                {statusInfo.label}
              </span>
            </div>
            {inv.object && <p className="text-sm text-gray-500">{inv.object}</p>}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => printDocument(inv, 'invoice', storeName)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
            >
              <Printer size={14} /> Imprimer
            </button>
            <button
              disabled={pdfLoading}
              onClick={async () => {
                setPdfLoading(true)
                try {
                  await downloadPdf(`/pdf/invoices/${inv.id}`, `Facture-${inv.reference}.pdf`)
                } catch {
                  toast.error('Erreur lors de la génération du PDF')
                } finally {
                  setPdfLoading(false)
                }
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-primary/30 text-sm text-primary hover:bg-primary/5 disabled:opacity-50 transition-colors"
            >
              <FileDown size={14} /> {pdfLoading ? '…' : 'PDF'}
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* KPI */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-gray-50 rounded-xl border border-gray-100 p-3 text-center">
              <div className="text-xs text-gray-500 mb-1">Total TTC</div>
              <div className="font-bold text-gray-800">{fmt(inv.total_ttc)}</div>
            </div>
            <div className="bg-green-50 rounded-xl border border-green-100 p-3 text-center">
              <div className="text-xs text-green-600 mb-1">Payé</div>
              <div className="font-bold text-green-700">{fmt(inv.paid_amount)}</div>
            </div>
            <div className={`rounded-xl border p-3 text-center ${inv.balance > 0 ? 'bg-red-50 border-red-100' : 'bg-gray-50 border-gray-100'}`}>
              <div className={`text-xs mb-1 ${inv.balance > 0 ? 'text-red-600' : 'text-gray-500'}`}>Solde</div>
              <div className={`font-bold ${inv.balance > 0 ? 'text-red-700' : 'text-gray-600'}`}>{fmt(inv.balance)}</div>
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-gray-50 rounded-xl border border-gray-100 p-3">
              <div className="text-xs text-gray-500 mb-0.5">Date d'émission</div>
              <div className="font-medium">{fmtDate(inv.issue_date)}</div>
            </div>
            {inv.due_date && (
              <div className={`rounded-xl border p-3 ${inv.is_overdue ? 'bg-red-50 border-red-100' : 'bg-gray-50 border-gray-100'}`}>
                <div className={`text-xs mb-0.5 ${inv.is_overdue ? 'text-red-500' : 'text-gray-500'}`}>Échéance</div>
                <div className={`font-medium ${inv.is_overdue ? 'text-red-700' : ''}`}>{fmtDate(inv.due_date)}</div>
              </div>
            )}
          </div>

          {/* Client */}
          {inv.client && (
            <div className="rounded-xl border border-gray-200 p-4">
              <div className="text-xs text-gray-400 uppercase tracking-wider mb-1.5">Client</div>
              <div className="font-semibold text-gray-800">{inv.client.name}</div>
              {inv.client.phone && <div className="text-sm text-gray-500 mt-0.5">{inv.client.phone}</div>}
              {inv.client.email && <div className="text-sm text-gray-500">{inv.client.email}</div>}
            </div>
          )}

          {/* Lignes */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-1 h-4 bg-primary rounded-full" />
              <h3 className="text-sm font-semibold text-gray-700">Prestations</h3>
            </div>
            <div className="rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100">
                  <tr>
                    <th className="px-3 py-2.5 text-left">Description</th>
                    <th className="px-3 py-2.5 text-right">Qté</th>
                    <th className="px-3 py-2.5 text-right">P.U</th>
                    <th className="px-3 py-2.5 text-right">TVA</th>
                    <th className="px-3 py-2.5 text-right">Total TTC</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(inv.items ?? []).map((it, i) => (
                    <tr key={i} className="hover:bg-blue-50/20 transition-colors">
                      <td className="px-3 py-2">
                        <div className="font-medium text-gray-800">{it.description}</div>
                        {it.discount_percent > 0 && (
                          <div className="text-xs text-green-600">Remise {it.discount_percent}%</div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-600">{it.quantity} {it.unit}</td>
                      <td className="px-3 py-2 text-right text-gray-600">{fmt(Number(it.unit_price))}</td>
                      <td className="px-3 py-2 text-right text-gray-500">{it.vat_rate}%</td>
                      <td className="px-3 py-2 text-right font-semibold text-gray-800">{fmt(Number(it.total_ttc))}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 border-t border-gray-200">
                  <tr>
                    <td colSpan={4} className="px-3 py-2.5 text-right font-bold text-gray-700">Total TTC</td>
                    <td className="px-3 py-2.5 text-right font-bold text-primary">{fmt(inv.total_ttc)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Paiements */}
          {(inv.payments ?? []).length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-1 h-4 bg-green-500 rounded-full" />
                <h3 className="text-sm font-semibold text-gray-700">Règlements</h3>
              </div>
              <div className="space-y-2">
                {inv.payments!.map(p => (
                  <div key={p.id} className="flex items-center justify-between bg-green-50 border border-green-100 rounded-xl px-4 py-2.5">
                    <div>
                      <span className="text-sm font-medium text-gray-800">{PAYMENT_METHODS[p.method] ?? p.method}</span>
                      {p.reference && <span className="text-xs text-gray-500 ml-2">Réf. {p.reference}</span>}
                      <div className="text-xs text-gray-400">{fmtDate(p.paid_at)}</div>
                    </div>
                    <span className="font-bold text-green-700">{fmt(p.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Relances */}
          {(inv.reminders ?? []).length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-1 h-4 bg-amber-500 rounded-full" />
                <h3 className="text-sm font-semibold text-gray-700">Relances</h3>
              </div>
              <div className="space-y-2">
                {inv.reminders!.map(r => (
                  <div key={r.id} className="flex items-center justify-between bg-amber-50 border border-amber-100 rounded-xl px-4 py-2.5">
                    <div>
                      <span className="text-sm font-medium text-gray-800 capitalize">{r.type} relance — {r.method}</span>
                      {r.notes && <div className="text-xs text-gray-500 mt-0.5">{r.notes}</div>}
                    </div>
                    <span className="text-xs text-gray-400">{fmtDate(r.sent_at)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          {!['paid', 'cancelled'].includes(inv.status) && (
            <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
              {inv.status === 'draft' && (
                <button
                  onClick={() => markSentMut.mutate()}
                  className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-600 transition-colors"
                >
                  <Send size={14} /> Marquer envoyée
                </button>
              )}
              {inv.balance > 0 && (
                <button
                  onClick={() => { setPayAmount(String(inv.balance)); setPayModal(true) }}
                  className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
                >
                  <CreditCard size={14} /> Enregistrer paiement
                </button>
              )}
              {inv.balance > 0 && (
                <button
                  onClick={() => setReminderModal(true)}
                  className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 transition-colors"
                >
                  <Bell size={14} /> Relance
                </button>
              )}
              <button
                onClick={async () => {
                  if (await confirm('Annuler cette facture ?')) cancelMut.mutate()
                }}
                className="flex items-center gap-1.5 px-4 py-2 border border-red-200 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 transition-colors"
              >
                <XCircle size={14} /> Annuler
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Modal paiement */}
      {payModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" onClick={() => setPayModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100">
              <div className="w-9 h-9 bg-green-100 rounded-xl flex items-center justify-center">
                <CreditCard size={18} className="text-green-600" />
              </div>
              <h3 className="font-bold text-gray-800">Enregistrer un paiement</h3>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Montant (FCFA)</label>
                <input type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 text-right font-mono" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Mode de paiement</label>
                <select value={payMethod} onChange={e => setPayMethod(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30">
                  {Object.entries(PAYMENT_METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Référence <span className="text-gray-400">(optionnel)</span></label>
                <input type="text" value={payRef} onChange={e => setPayRef(e.target.value)}
                  placeholder="N° chèque, transaction..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
            </div>
            <div className="flex gap-2 px-6 pb-5">
              <button onClick={() => setPayModal(false)} className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors">Annuler</button>
              <button
                onClick={() => payMut.mutate()}
                disabled={payMut.isPending || !parseFloat(payAmount)}
                className="flex-1 py-2.5 bg-green-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50 hover:bg-green-700 transition-colors"
              >
                {payMut.isPending ? '…' : 'Valider'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal relance */}
      {reminderModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" onClick={() => setReminderModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100">
              <div className="w-9 h-9 bg-amber-100 rounded-xl flex items-center justify-center">
                <Bell size={18} className="text-amber-600" />
              </div>
              <h3 className="font-bold text-gray-800">Enregistrer une relance</h3>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Type</label>
                <select value={remType} onChange={e => setRemType(e.target.value as typeof remType)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30">
                  <option value="first">1ère relance</option>
                  <option value="second">2ème relance</option>
                  <option value="final">Relance finale (mise en demeure)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Canal</label>
                <select value={remMethod} onChange={e => setRemMethod(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30">
                  <option value="phone">Téléphone</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="sms">SMS</option>
                  <option value="email">Email</option>
                  <option value="in_person">En personne</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Notes</label>
                <textarea value={remNotes} onChange={e => setRemNotes(e.target.value)} rows={3}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none" />
              </div>
            </div>
            <div className="flex gap-2 px-6 pb-5">
              <button onClick={() => setReminderModal(false)} className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors">Annuler</button>
              <button
                onClick={() => reminderMut.mutate()}
                disabled={reminderMut.isPending}
                className="flex-1 py-2.5 bg-amber-500 text-white rounded-lg text-sm font-semibold disabled:opacity-50 hover:bg-amber-600 transition-colors"
              >
                {reminderMut.isPending ? '…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE PRINCIPALE
// ═══════════════════════════════════════════════════════════════════════════════

type Tab = 'invoices' | 'quotes'

export default function InvoicesPage() {
  const { activeStore } = useActiveStoreStore()
  const { user } = useAuthStore()
  const confirm = useConfirm()
  const location = useLocation()
  // Fallback: si pas de magasin actif sélectionné, utiliser le magasin de l'utilisateur
  const storeId      = activeStore?.id ?? (user?.store_id ?? undefined)
  const storeName    = activeStore?.name ?? user?.store?.name ?? 'Baobab'
  const businessType: BusinessType = (user?.store?.business_type as BusinessType) ?? 'grande_surface'
  const qc = useQueryClient()

  const [tab, setTab]         = useState<Tab>('invoices')
  const [search, setSearch]   = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showEditor, setShowEditor]     = useState(false)
  const [editing, setEditing]           = useState<Invoice | Quote | null>(null)
  const [crmPrefill, setCrmPrefill]     = useState<CrmPrefill | undefined>(undefined)

  // Pré-remplissage depuis le CRM (navigation state)
  useEffect(() => {
    const state = location.state as { crmPrefill?: CrmPrefill } | null
    if (state?.crmPrefill) {
      setCrmPrefill(state.crmPrefill)
      setEditing(null)
      setTab(state.crmPrefill.type === 'invoice' ? 'invoices' : 'quotes')
      setShowEditor(true)
      // Nettoyer le state pour éviter une ré-ouverture
      window.history.replaceState({}, '')
    }
  }, [location.state])
  const [selected, setSelected]         = useState<Invoice | null>(null)
  const [printingId, setPrintingId]     = useState<number | null>(null)
  const [pdfIds, setPdfIds]             = useState<Set<number>>(new Set())

  const downloadDoc = async (id: number, type: 'invoice' | 'quote', reference: string) => {
    setPdfIds(prev => new Set(prev).add(id))
    try {
      const path = type === 'invoice' ? `/pdf/invoices/${id}` : `/pdf/quotes/${id}`
      const name = type === 'invoice' ? `Facture-${reference}.pdf` : `Devis-${reference}.pdf`
      await downloadPdf(path, name)
    } catch {
      toast.error('Erreur lors de la génération du PDF')
    } finally {
      setPdfIds(prev => { const s = new Set(prev); s.delete(id); return s })
    }
  }

  // Fetche le document complet (avec items) puis imprime
  const printFull = async (id: number, type: 'invoice' | 'quote') => {
    setPrintingId(id)
    try {
      const endpoint = type === 'invoice' ? `/invoices/${id}` : `/quotes/${id}`
      const res = await api.get(endpoint)
      printDocument(res.data, type, storeName)
    } catch {
      toast.error('Impossible de charger le document')
    } finally {
      setPrintingId(null)
    }
  }

  // ── Stats ──────────────────────────────────────────────────────────────────
  const { data: stats } = useQuery<Stats>({
    queryKey: ['invoice-stats', storeId],
    queryFn: () => api.get('/invoices/stats', { params: { store_id: storeId } }).then(r => r.data),
    enabled: !!storeId,
    staleTime: 30_000,
  })

  // ── Factures ───────────────────────────────────────────────────────────────
  const { data: invoicesData, isLoading: loadingInvoices, refetch: refetchInvoices } = useQuery<{
    data: Invoice[]; meta: { total: number }
  }>({
    queryKey: ['invoices', storeId, statusFilter, search],
    queryFn: () => api.get('/invoices', {
      params: { store_id: storeId, status: statusFilter || undefined, search: search || undefined, per_page: 50 }
    }).then(r => r.data),
    enabled: !!storeId && tab === 'invoices',
    staleTime: 30_000,
  })

  // ── Devis ──────────────────────────────────────────────────────────────────
  const { data: quotesData, isLoading: loadingQuotes, refetch: refetchQuotes } = useQuery<{
    data: Quote[]; meta: { total: number }
  }>({
    queryKey: ['quotes', storeId, statusFilter, search],
    queryFn: () => api.get('/quotes', {
      params: { store_id: storeId, status: statusFilter || undefined, search: search || undefined, per_page: 50 }
    }).then(r => r.data),
    enabled: !!storeId && tab === 'quotes',
    staleTime: 30_000,
  })

  // ── Mutations ──────────────────────────────────────────────────────────────
  const deleteInvoice = useMutation({
    mutationFn: (id: number) => api.delete(`/invoices/${id}`),
    onSuccess: () => { toast.success('Facture supprimée'); qc.invalidateQueries({ queryKey: ['invoices'] }) },
    onError: (e: { response?: { data?: { message?: string } } }) =>
      toast.error(e.response?.data?.message ?? 'Impossible de supprimer'),
  })

  const deleteQuote = useMutation({
    mutationFn: (id: number) => api.delete(`/quotes/${id}`),
    onSuccess: () => { toast.success('Devis supprimé'); qc.invalidateQueries({ queryKey: ['quotes'] }) },
    onError: (e: { response?: { data?: { message?: string } } }) =>
      toast.error(e.response?.data?.message ?? 'Impossible de supprimer'),
  })

  const convertQuote = useMutation({
    mutationFn: (id: number) => api.post(`/quotes/${id}/convert`).then(r => r.data),
    onSuccess: (data: { invoice: Invoice }) => {
      toast.success(`Facture ${data.invoice.reference} créée !`)
      qc.invalidateQueries({ queryKey: ['quotes'] })
      qc.invalidateQueries({ queryKey: ['invoices'] })
      qc.invalidateQueries({ queryKey: ['invoice-stats'] })
      setTab('invoices')
    },
    onError: (e: { response?: { data?: { message?: string } } }) =>
      toast.error(e.response?.data?.message ?? 'Erreur de conversion'),
  })

  const quoteMarkSent = useMutation({
    mutationFn: (id: number) => api.post(`/quotes/${id}/mark-sent`).then(r => r.data),
    onSuccess: () => { toast.success('Devis marqué comme envoyé'); qc.invalidateQueries({ queryKey: ['quotes'] }) },
  })

  const invoices = invoicesData?.data ?? []
  const quotes   = quotesData?.data ?? []

  const handleSaved = () => {
    setShowEditor(false)
    setEditing(null)
    qc.invalidateQueries({ queryKey: ['invoices'] })
    qc.invalidateQueries({ queryKey: ['quotes'] })
    qc.invalidateQueries({ queryKey: ['invoice-stats'] })
  }

  return (
    <div className="p-3 sm:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <FileText size={20} className="text-primary" />
            Facturation & Devis
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">Documents commerciaux professionnels</p>
        </div>
        <button
          onClick={() => { setEditing(null); setShowEditor(true) }}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary-600 transition-colors shadow-sm"
        >
          <Plus size={15} />
          {tab === 'invoices' ? 'Nouvelle facture' : 'Nouveau devis'}
        </button>
      </div>

      {/* KPIs */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4">
            <div className="text-xs text-gray-500 mb-1">Total facturé</div>
            <div className="text-xl font-bold text-gray-800">{fmt(stats.total_ttc)}</div>
            <div className="text-xs text-gray-400 mt-0.5">{stats.total_count} factures</div>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4">
            <div className="text-xs text-green-600 mb-1">Encaissé</div>
            <div className="text-xl font-bold text-green-700">{fmt(stats.total_paid)}</div>
            <div className="text-xs text-gray-400 mt-0.5">{stats.paid_count} payées</div>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4">
            <div className="text-xs text-red-500 mb-1">Solde à encaisser</div>
            <div className="text-xl font-bold text-red-600">{fmt(stats.total_balance)}</div>
            <div className="text-xs text-gray-400 mt-0.5">{stats.overdue_count} en retard</div>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4">
            <div className="text-xs text-primary mb-1">En cours</div>
            <div className="text-xl font-bold text-primary">{stats.sent_count}</div>
            <div className="text-xs text-gray-400 mt-0.5">{stats.draft_count} brouillons</div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="flex border-b border-gray-100">
          {(['invoices', 'quotes'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => { setTab(t); setStatusFilter(''); setSearch('') }}
              className={`flex-1 py-3 text-sm font-semibold transition ${
                tab === t ? 'border-b-2 border-primary text-primary' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t === 'invoices' ? 'Factures' : 'Devis'}
              {t === 'invoices' && invoicesData?.meta?.total != null && (
                <span className="ml-1.5 text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">
                  {invoicesData.meta.total}
                </span>
              )}
              {t === 'quotes' && quotesData?.meta?.total != null && (
                <span className="ml-1.5 text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">
                  {quotesData.meta.total}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Filtres */}
        <div className="flex gap-3 px-4 py-3 border-b border-gray-100 bg-gray-50/50">
          <div className="relative flex-1 max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Rechercher..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="">Tous statuts</option>
            {tab === 'invoices'
              ? Object.entries(STATUS_INVOICE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)
              : Object.entries(STATUS_QUOTE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)
            }
          </select>
        </div>

        {/* ── LISTE FACTURES ─────────────────────────────────────────────────── */}
        {tab === 'invoices' && (
          <div>
            {loadingInvoices ? (
              <div className="p-12 text-center">
                <div className="inline-block w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : invoices.length === 0 ? (
              <div className="p-16 text-center">
                <FileText size={48} className="text-gray-200 mx-auto mb-3" />
                <p className="text-gray-500 font-medium">Aucune facture</p>
                <p className="text-gray-400 text-sm mt-1">Créez votre première facture</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {invoices.map(inv => {
                  const st = inv.is_overdue && !['paid', 'cancelled'].includes(inv.status) ? 'overdue' : inv.status
                  const si = STATUS_INVOICE[st as InvoiceStatus]
                  return (
                    <div
                      key={inv.id}
                      className="flex items-center gap-4 px-4 py-3 hover:bg-blue-50/30 cursor-pointer transition-colors"
                      onClick={() => setSelected(inv)}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-gray-800 text-sm font-mono">{inv.reference}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${si.color}`}>{si.label}</span>
                          {inv.is_overdue && inv.status !== 'paid' && (
                            <AlertCircle size={13} className="text-red-500" />
                          )}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {inv.client?.name ?? <span className="text-gray-300">Sans client</span>}
                          {inv.object && <span className="text-gray-400"> · {inv.object}</span>}
                        </div>
                      </div>
                      <div className="text-right hidden sm:block">
                        <div className="text-sm font-bold text-gray-800">{fmt(inv.total_ttc)}</div>
                        {inv.balance > 0 && (
                          <div className="text-xs text-red-500">Solde : {fmt(inv.balance)}</div>
                        )}
                      </div>
                      <div className="text-xs text-gray-400 hidden md:block w-24 text-right">
                        {fmtDate(inv.issue_date)}
                      </div>
                      <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => { setEditing(inv); setShowEditor(true) }}
                          className="p-1.5 text-gray-400 hover:text-primary hover:bg-primary/5 rounded-lg transition-colors"
                          title="Modifier"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={() => printFull(inv.id, 'invoice')}
                          disabled={printingId === inv.id}
                          className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-40 transition-colors"
                          title="Imprimer"
                        >
                          {printingId === inv.id ? <span className="text-xs animate-pulse">…</span> : <Printer size={14} />}
                        </button>
                        <button
                          onClick={() => downloadDoc(inv.id, 'invoice', inv.reference)}
                          disabled={pdfIds.has(inv.id)}
                          className="p-1.5 text-primary/60 hover:text-primary hover:bg-primary/10 rounded-lg disabled:opacity-40 transition-colors"
                          title="Télécharger PDF"
                        >
                          {pdfIds.has(inv.id) ? <span className="text-xs animate-pulse">…</span> : <FileDown size={14} />}
                        </button>
                        <button
                          onClick={async () => {
                            if (await confirm(`Supprimer la facture ${inv.reference} ?`, { danger: true })) deleteInvoice.mutate(inv.id)
                          }}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Supprimer"
                        >
                          <Trash2 size={14} />
                        </button>
                        <ChevronRight size={14} className="text-gray-300" />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── LISTE DEVIS ────────────────────────────────────────────────────── */}
        {tab === 'quotes' && (
          <div>
            {loadingQuotes ? (
              <div className="p-12 text-center">
                <div className="inline-block w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : quotes.length === 0 ? (
              <div className="p-16 text-center">
                <FileText size={48} className="text-gray-200 mx-auto mb-3" />
                <p className="text-gray-500 font-medium">Aucun devis</p>
                <p className="text-gray-400 text-sm mt-1">Créez votre premier devis</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {quotes.map(q => {
                  const st  = q.is_expired && !['accepted', 'invoiced', 'cancelled'].includes(q.status) ? 'expired' : q.status
                  const si  = STATUS_QUOTE[st as QuoteStatus]
                  return (
                    <div key={q.id} className="flex items-center gap-4 px-4 py-3 hover:bg-blue-50/30 transition-colors">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-gray-800 text-sm font-mono">{q.reference}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${si.color}`}>{si.label}</span>
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {q.client?.name ?? <span className="text-gray-300">Sans client</span>}
                          {q.object && <span className="text-gray-400"> · {q.object}</span>}
                        </div>
                      </div>
                      <div className="text-right hidden sm:block">
                        <div className="text-sm font-bold text-gray-800">{fmt(q.total_ttc)}</div>
                        {q.valid_until && (
                          <div className="text-xs text-gray-400">Jusqu'au {fmtDate(q.valid_until)}</div>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        {q.status === 'draft' && (
                          <button
                            onClick={() => quoteMarkSent.mutate(q.id)}
                            className="flex items-center gap-1 px-2 py-1 text-xs text-primary hover:bg-primary/5 rounded-lg border border-primary/20 transition-colors"
                            title="Marquer envoyé"
                          >
                            <Send size={12} /> Envoyer
                          </button>
                        )}
                        {['draft', 'sent', 'accepted'].includes(q.status) && (
                          <button
                            onClick={async () => {
                              if (await confirm(`Convertir ${q.reference} en facture ?`)) convertQuote.mutate(q.id)
                            }}
                            className="flex items-center gap-1 px-2 py-1 text-xs text-purple-600 hover:bg-purple-50 rounded-lg border border-purple-200 transition-colors"
                            title="Convertir en facture"
                          >
                            <ArrowRight size={12} /> Facturer
                          </button>
                        )}
                        <button
                          onClick={() => printFull(q.id, 'quote')}
                          disabled={printingId === q.id}
                          className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-40 transition-colors"
                          title="Imprimer"
                        >
                          {printingId === q.id ? <span className="text-xs animate-pulse">…</span> : <Printer size={14} />}
                        </button>
                        <button
                          onClick={() => downloadDoc(q.id, 'quote', q.reference)}
                          disabled={pdfIds.has(q.id)}
                          className="p-1.5 text-primary/60 hover:text-primary hover:bg-primary/10 rounded-lg disabled:opacity-40 transition-colors"
                          title="Télécharger PDF"
                        >
                          {pdfIds.has(q.id) ? <span className="text-xs animate-pulse">…</span> : <FileDown size={14} />}
                        </button>
                        <button
                          onClick={() => { setEditing(q); setShowEditor(true) }}
                          className="p-1.5 text-gray-400 hover:text-primary hover:bg-primary/5 rounded-lg transition-colors"
                          title="Modifier"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={async () => {
                            if (await confirm(`Supprimer le devis ${q.reference} ?`, { danger: true })) deleteQuote.mutate(q.id)
                          }}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Supprimer"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Éditeur */}
      {showEditor && (
        <DocumentEditor
          type={tab === 'invoices' ? 'invoice' : 'quote'}
          initial={editing}
          storeId={storeId!}
          businessType={businessType}
          onClose={() => { setShowEditor(false); setEditing(null); setCrmPrefill(undefined) }}
          onSaved={handleSaved}
          prefill={!editing ? crmPrefill : undefined}
        />
      )}

      {/* Détail facture */}
      {selected && (
        <InvoiceDetail
          invoice={selected}
          storeName={storeName}
          onClose={() => setSelected(null)}
          onRefresh={() => {
            refetchInvoices()
            qc.invalidateQueries({ queryKey: ['invoice-stats'] })
          }}
        />
      )}
    </div>
  )
}
