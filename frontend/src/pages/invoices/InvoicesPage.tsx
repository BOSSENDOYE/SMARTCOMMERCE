import { useState, useEffect, useMemo, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../lib/api'
import toast from 'react-hot-toast'
import {
  FileText, Plus, Search, Send, AlertCircle, ChevronRight, ChevronLeft, ArrowRight,
  Printer, CreditCard, Bell, Trash2, Edit2, X, Check, XCircle, FileDown,
  Upload, Loader2, CheckCircle2, AlertTriangle, ChevronDown, Package,
  MessageCircle, SkipForward, Settings, ExternalLink, Smartphone,
} from 'lucide-react'
import { downloadPdf } from '../../lib/format'
import { useAuthStore } from '../../store/auth.store'
import { useActiveStoreStore } from '../../store/active-store.store'
import { useConfirm } from '../../hooks/useConfirm'
import PaymentPanel, { type PaymentEntry } from '../../components/PaymentPanel'

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

interface ClientEntry { id: number; name: string; phone: string; email?: string; account_balance?: number }

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
  const [clientQ, setClientQ]       = useState(initial?.client?.name ?? prefill?.client?.name ?? '')
  const [showClientDrop, setShowClientDrop] = useState(false)
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
      : [{ description: '', quantity: 1, unit: 'unité', unit_price: 0, discount_percent: 0, vat_rate: 0 }]
  )

  const [prodQ, setProdQ]           = useState<Record<number, string>>({})
  const [openProdLine, setOpenProdLine] = useState<number | null>(null)

  const { data: clients = [] } = useQuery<ClientEntry[]>({
    queryKey: ['clients-list'],
    queryFn: () => api.get('/clients', { params: { per_page: 500 } }).then(r => r.data.data ?? r.data),
    staleTime: 60_000,
  })

  const isRestaurantOnly = businessType === 'restaurant'
  const isBoutiqueOnly   = businessType === 'grande_surface' || businessType === 'depot'

  const { data: rawProducts = [] } = useQuery<{ id: number; name: string; sale_price_ttc: number; vat_rate: number }[]>({
    queryKey: ['products-short', storeId],
    queryFn: () => api.get('/products', { params: { per_page: 500, active: 1 } }).then(r => r.data.data ?? r.data),
    staleTime: 60_000,
    enabled: !isRestaurantOnly,
  })

  const { data: rawRestaurantItems = [] } = useQuery<{ id: number; name: string; price_ht: number; vat_rate: number }[]>({
    queryKey: ['restaurant-items-short', storeId],
    queryFn: () => api.get('/restaurant-items', { params: { per_page: 500 } }).then(r => r.data.data ?? r.data),
    staleTime: 60_000,
    enabled: !isBoutiqueOnly,
  })

  const catalogProducts: CatalogItem[] = useMemo(() => rawProducts.map(p => ({
    id: p.id, name: p.name,
    unit_price_ht: Math.round(Number(p.sale_price_ttc) / (1 + Number(p.vat_rate || 18) / 100)),
    vat_rate: Number(p.vat_rate || 18), source: 'product' as const,
  })), [rawProducts])

  const catalogRestaurant: CatalogItem[] = useMemo(() => rawRestaurantItems.map(r => ({
    id: r.id, name: r.name,
    unit_price_ht: Math.round(Number(r.price_ht)),
    vat_rate: Number(r.vat_rate || 18), source: 'restaurant' as const,
  })), [rawRestaurantItems])

  const allCatalog = useMemo(() => [...catalogProducts, ...catalogRestaurant], [catalogProducts, catalogRestaurant])

  const filteredClients = useMemo(() => {
    const q = clientQ.toLowerCase().trim()
    if (!q) return clients.slice(0, 8)
    return clients.filter(c =>
      c.name.toLowerCase().includes(q) || (c.phone ?? '').includes(q)
    ).slice(0, 8)
  }, [clients, clientQ])

  const filteredProds = (lineIdx: number) => {
    const q = (prodQ[lineIdx] ?? '').toLowerCase().trim()
    if (!q) return allCatalog.slice(0, 10)
    return allCatalog.filter(p => p.name.toLowerCase().includes(q)).slice(0, 12)
  }

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
      toast.error(errors ? Object.values(errors).flat().slice(0, 2).join(' · ') : (msg ?? 'Erreur lors de la sauvegarde'))
    },
  })

  const addLine = () =>
    setItems(prev => [...prev, { description: '', quantity: 1, unit: 'unité', unit_price: 0, discount_percent: 0, vat_rate: 0 }])

  const removeLine = (i: number) => setItems(prev => prev.filter((_, idx) => idx !== i))

  const updateLine = (i: number, field: keyof LineItem, value: string | number) =>
    setItems(prev => prev.map((it, idx) => idx === i ? { ...it, [field]: value } : it))

  const pickProduct = (lineIdx: number, p: CatalogItem) => {
    setItems(prev => prev.map((it, idx) => idx === lineIdx ? {
      ...it,
      product_id: p.source === 'product' ? p.id : null,
      description: p.name,
      unit_price: p.unit_price_ht,
      vat_rate: p.vat_rate,
    } : it))
    setProdQ(prev => { const n = { ...prev }; delete n[lineIdx]; return n })
    setOpenProdLine(null)
  }

  const totals = items.reduce((acc, it) => {
    const { ht, ttc } = calcLine(it)
    return { ht: acc.ht + ht, ttc: acc.ttc + ttc, disc: acc.disc + it.quantity * it.unit_price * (it.discount_percent / 100), vat: acc.vat + (ttc - ht) }
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
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl my-4">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-primary rounded-t-2xl">
          <div>
            <h2 className="text-lg font-bold text-white">
              {isEdit ? 'Modifier' : 'Nouveau'} {type === 'invoice' ? 'Facture' : 'Devis'}
            </h2>
            <p className="text-white/70 text-xs mt-0.5">
              {isEdit ? `Réf. ${(initial as Invoice).reference ?? ''}` : 'Nouveau document commercial'}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Infos générales */}
          <div className="grid grid-cols-2 gap-4">
            {/* Client autocomplete */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Client</label>
              <div className="relative">
                <input
                  type="text"
                  value={clientQ}
                  onChange={e => { setClientQ(e.target.value); setShowClientDrop(true); if (!e.target.value) setClientId('') }}
                  onFocus={() => setShowClientDrop(true)}
                  onBlur={() => setTimeout(() => setShowClientDrop(false), 200)}
                  placeholder="Rechercher un client..."
                  className="w-full border rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary focus:border-transparent pr-8"
                />
                <ChevronDown size={14} className="absolute right-3 top-3.5 text-gray-400 pointer-events-none" />
                {showClientDrop && (
                  <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-white border rounded-xl shadow-xl max-h-52 overflow-y-auto">
                    <button
                      type="button"
                      onMouseDown={e => { e.preventDefault(); setClientId(''); setClientQ(''); setShowClientDrop(false) }}
                      className="w-full text-left px-3 py-2 text-sm text-gray-400 hover:bg-gray-50 italic"
                    >
                      — Sans client —
                    </button>
                    {filteredClients.map(c => (
                      <button
                        key={c.id}
                        type="button"
                        onMouseDown={e => { e.preventDefault(); setClientId(c.id); setClientQ(c.name); setShowClientDrop(false) }}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 flex items-center justify-between ${clientId === c.id ? 'bg-blue-50 text-blue-700' : 'text-gray-700'}`}
                      >
                        <span className="font-medium">{c.name}</span>
                        {c.phone && <span className="text-xs text-gray-400">{c.phone}</span>}
                      </button>
                    ))}
                    {filteredClients.length === 0 && clientQ.length > 0 && (
                      <p className="px-3 py-2 text-sm text-gray-400">Aucun client trouvé</p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Objet */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Objet</label>
              <input
                value={object}
                onChange={e => setObject(e.target.value)}
                placeholder="Ex : Livraison matériaux mois de juin"
                className="w-full border rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Date d'émission</label>
              <input
                type="date"
                value={issueDate}
                onChange={e => setIssueDate(e.target.value)}
                className="w-full border rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                {type === 'invoice' ? "Date d'échéance" : "Valide jusqu'au"}
              </label>
              <input
                type="date"
                value={type === 'invoice' ? dueDate : validUntil}
                onChange={e => type === 'invoice' ? setDueDate(e.target.value) : setValidUntil(e.target.value)}
                className="w-full border rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          {/* Lignes */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-800">Lignes</h3>
              <button
                onClick={addLine}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-50 hover:bg-primary-100 text-primary rounded-lg text-sm font-semibold transition"
              >
                <Plus size={14} /> Ajouter une ligne
              </button>
            </div>

            <div className="space-y-2">
              {items.map((it, i) => {
                const { ttc } = calcLine(it)
                const prodList = filteredProds(i)
                const isSearching = prodQ[i] !== undefined

                return (
                  <div key={i} className="border rounded-xl p-3 bg-gray-50/50 hover:bg-white transition">
                    {/* Row 1: numéro + autocomplete produit + qty + unit + supprimer */}
                    <div className="flex gap-2 items-start mb-2">
                      <span className="w-6 h-6 rounded-full bg-primary-100 text-primary text-xs font-bold flex items-center justify-center flex-shrink-0 mt-2">{i + 1}</span>

                      <div className="flex-1 relative">
                        <input
                          type="text"
                          value={isSearching ? (prodQ[i] ?? '') : it.description}
                          onChange={e => {
                            setProdQ(prev => ({ ...prev, [i]: e.target.value }))
                            updateLine(i, 'description', e.target.value)
                            setOpenProdLine(i)
                          }}
                          onFocus={() => {
                            setProdQ(prev => ({ ...prev, [i]: prev[i] ?? '' }))
                            setOpenProdLine(i)
                          }}
                          onBlur={() => setTimeout(() => {
                            setOpenProdLine(null)
                            setProdQ(prev => { const n = { ...prev }; delete n[i]; return n })
                          }, 200)}
                          placeholder="Tapez pour rechercher un produit ou saisir une description..."
                          className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:border-transparent bg-white"
                        />
                        {openProdLine === i && prodList.length > 0 && (
                          <div className="absolute z-20 left-0 right-0 top-full mt-0.5 bg-white border rounded-xl shadow-xl max-h-52 overflow-y-auto">
                            {prodList.map(p => (
                              <button
                                key={`${p.source}:${p.id}`}
                                type="button"
                                onMouseDown={e => { e.preventDefault(); pickProduct(i, p) }}
                                className="w-full text-left px-3 py-2.5 text-sm hover:bg-blue-50 flex items-center justify-between border-b last:border-0"
                              >
                                <div>
                                  <span className="font-medium text-gray-800">{p.name}</span>
                                  <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded-full ${p.source === 'restaurant' ? 'bg-orange-100 text-orange-600' : 'bg-blue-100 text-blue-600'}`}>
                                    {p.source === 'restaurant' ? 'Menu' : 'Produit'}
                                  </span>
                                </div>
                                <span className="text-xs font-semibold text-gray-600 font-mono">{fmt(p.unit_price_ht)}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="w-20">
                        <input
                          type="number" min="0.001" step="any"
                          value={it.quantity}
                          onChange={e => updateLine(i, 'quantity', parseFloat(e.target.value) || 0)}
                          className="w-full border rounded-lg px-2 py-2 text-sm text-center focus:ring-2 focus:ring-primary bg-white"
                          placeholder="Qté"
                        />
                      </div>

                      <div className="w-20">
                        <input
                          type="text"
                          value={it.unit}
                          onChange={e => updateLine(i, 'unit', e.target.value)}
                          className="w-full border rounded-lg px-2 py-2 text-sm text-center focus:ring-2 focus:ring-primary bg-white"
                          placeholder="unité"
                        />
                      </div>

                      {items.length > 1 && (
                        <button onClick={() => removeLine(i)} className="p-2 text-red-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition mt-0.5">
                          <X size={14} />
                        </button>
                      )}
                    </div>

                    {/* Row 2: prix + remise + tva + total */}
                    <div className="flex gap-2 items-end pl-8">
                      <div className="flex-1">
                        <label className="text-[10px] text-gray-400 uppercase block mb-0.5">P.U HT</label>
                        <input
                          type="number" min="0" step="any"
                          value={it.unit_price}
                          onChange={e => updateLine(i, 'unit_price', parseFloat(e.target.value) || 0)}
                          className="w-full border rounded-lg px-2 py-1.5 text-sm text-right focus:ring-2 focus:ring-primary bg-white"
                        />
                      </div>
                      <div className="w-24">
                        <label className="text-[10px] text-gray-400 uppercase block mb-0.5">Remise %</label>
                        <input
                          type="number" min="0" max="100"
                          value={it.discount_percent}
                          onChange={e => updateLine(i, 'discount_percent', parseFloat(e.target.value) || 0)}
                          className="w-full border rounded-lg px-2 py-1.5 text-sm text-right focus:ring-2 focus:ring-primary bg-white"
                        />
                      </div>
                      <div className="w-24">
                        <label className="text-[10px] text-gray-400 uppercase block mb-0.5">TVA %</label>
                        <input
                          type="number" min="0" max="100"
                          value={it.vat_rate}
                          onChange={e => updateLine(i, 'vat_rate', parseFloat(e.target.value) || 0)}
                          className="w-full border rounded-lg px-2 py-1.5 text-sm text-right focus:ring-2 focus:ring-primary bg-white"
                        />
                      </div>
                      <div className="w-36 text-right pb-1.5">
                        <label className="text-[10px] text-gray-400 uppercase block mb-0.5">Total TTC</label>
                        <span className="font-bold text-gray-800 text-sm font-mono">{fmt(ttc)}</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Totaux */}
            <div className="mt-4 flex justify-end">
              <div className="bg-gray-50 rounded-xl border p-4 w-72 space-y-2 text-sm">
                <div className="flex justify-between text-gray-600">
                  <span>Sous-total HT</span>
                  <span className="font-mono">{fmt(totals.ht)}</span>
                </div>
                {totals.disc > 0 && (
                  <div className="flex justify-between text-orange-600">
                    <span>Remises</span>
                    <span className="font-mono">- {fmt(totals.disc)}</span>
                  </div>
                )}
                {totals.vat > 0 && (
                  <div className="flex justify-between text-gray-600">
                    <span>TVA</span>
                    <span className="font-mono">{fmt(totals.vat)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-gray-900 border-t pt-2 text-lg">
                  <span>Total TTC</span>
                  <span className="text-primary font-mono">{fmt(totals.ttc)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Notes & Conditions */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Notes</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={3}
                placeholder="Remarques, instructions de livraison..."
                className="w-full border rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary resize-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Conditions de paiement</label>
              <textarea
                value={terms}
                onChange={e => setTerms(e.target.value)}
                rows={3}
                placeholder="Ex : Paiement à 30 jours..."
                className="w-full border rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary resize-none"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t bg-gray-50 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
            Annuler
          </button>
          <button
            onClick={handleSubmit}
            disabled={mutation.isPending}
            className="flex items-center gap-2 px-6 py-2.5 bg-primary hover:opacity-90 text-white rounded-xl text-sm font-semibold disabled:opacity-50 transition shadow-md"
          >
            <Check size={16} />
            {mutation.isPending ? 'Sauvegarde...' : (isEdit ? 'Mettre à jour' : `Créer ${type === 'invoice' ? 'la facture' : 'le devis'}`)}
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
  const [payEntries, setPayEntries] = useState<PaymentEntry[]>([{ method: 'cash', amount: 0 }])
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
    mutationFn: async (entries: PaymentEntry[]) => {
      for (const e of entries) {
        if (e.amount > 0 && e.method !== 'credit') {
          await api.post(`/invoices/${invoice.id}/payments`, { amount: e.amount, method: e.method })
        } else if (e.method === 'credit' && e.amount > 0) {
          await api.post(`/invoices/${invoice.id}/payments`, { amount: e.amount, method: 'other', notes: 'Crédit' })
        }
      }
    },
    onSuccess: () => {
      toast.success('Paiement enregistré')
      qc.invalidateQueries({ queryKey: ['invoice', invoice.id] })
      qc.invalidateQueries({ queryKey: ['invoices'] })
      qc.invalidateQueries({ queryKey: ['invoice-stats'] })
      setPayModal(false)
      setPayEntries([{ method: 'cash', amount: 0 }])
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
        <div className="sticky top-0 bg-white z-10 px-6 py-4 border-b flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-bold text-gray-800 text-lg">{inv.reference}</span>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusInfo.color}`}>
                {statusInfo.label}
              </span>
            </div>
            {inv.object && <p className="text-sm text-gray-500">{inv.object}</p>}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => printDocument(inv, 'invoice', storeName)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg border text-sm text-gray-600 hover:bg-gray-50"
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
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-primary/30 text-sm text-primary hover:bg-primary/5 disabled:opacity-50"
            >
              <FileDown size={14} /> {pdfLoading ? '...' : 'PDF'}
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* KPI */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-gray-50 rounded-xl p-3 text-center">
              <div className="text-xs text-gray-500 mb-1">Total TTC</div>
              <div className="font-bold text-gray-800">{fmt(inv.total_ttc)}</div>
            </div>
            <div className="bg-green-50 rounded-xl p-3 text-center">
              <div className="text-xs text-green-600 mb-1">Payé</div>
              <div className="font-bold text-green-700">{fmt(inv.paid_amount)}</div>
            </div>
            <div className={`rounded-xl p-3 text-center ${inv.balance > 0 ? 'bg-red-50' : 'bg-gray-50'}`}>
              <div className={`text-xs mb-1 ${inv.balance > 0 ? 'text-red-600' : 'text-gray-500'}`}>Solde</div>
              <div className={`font-bold ${inv.balance > 0 ? 'text-red-700' : 'text-gray-600'}`}>{fmt(inv.balance)}</div>
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-xs text-gray-500 mb-0.5">Date d'émission</div>
              <div className="font-medium">{fmtDate(inv.issue_date)}</div>
            </div>
            {inv.due_date && (
              <div className={`rounded-lg p-3 ${inv.is_overdue ? 'bg-red-50' : 'bg-gray-50'}`}>
                <div className={`text-xs mb-0.5 ${inv.is_overdue ? 'text-red-500' : 'text-gray-500'}`}>Échéance</div>
                <div className={`font-medium ${inv.is_overdue ? 'text-red-700' : ''}`}>{fmtDate(inv.due_date)}</div>
              </div>
            )}
          </div>

          {/* Client */}
          {inv.client && (
            <div className="rounded-xl border p-4">
              <div className="text-xs text-gray-400 uppercase mb-1">Client</div>
              <div className="font-semibold">{inv.client.name}</div>
              {inv.client.phone && <div className="text-sm text-gray-500">{inv.client.phone}</div>}
              {inv.client.email && <div className="text-sm text-gray-500">{inv.client.email}</div>}
            </div>
          )}

          {/* Lignes */}
          <div>
            <h3 className="font-semibold text-gray-700 mb-2 text-sm uppercase tracking-wide">Prestations</h3>
            <div className="rounded-xl border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500">
                  <tr>
                    <th className="px-3 py-2 text-left">Description</th>
                    <th className="px-3 py-2 text-right">Qté</th>
                    <th className="px-3 py-2 text-right">P.U</th>
                    <th className="px-3 py-2 text-right">TVA</th>
                    <th className="px-3 py-2 text-right">Total TTC</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(inv.items ?? []).map((it, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-3 py-2">
                        <div>{it.description}</div>
                        {it.discount_percent > 0 && (
                          <div className="text-xs text-orange-500">Remise {it.discount_percent}%</div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">{it.quantity} {it.unit}</td>
                      <td className="px-3 py-2 text-right">{fmt(Number(it.unit_price))}</td>
                      <td className="px-3 py-2 text-right">{it.vat_rate}%</td>
                      <td className="px-3 py-2 text-right font-semibold">{fmt(Number(it.total_ttc))}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 font-semibold">
                  <tr>
                    <td colSpan={4} className="px-3 py-2 text-right text-gray-600">Total TTC</td>
                    <td className="px-3 py-2 text-right text-primary">{fmt(inv.total_ttc)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Paiements */}
          {(inv.payments ?? []).length > 0 && (
            <div>
              <h3 className="font-semibold text-gray-700 mb-2 text-sm uppercase tracking-wide">Règlements</h3>
              <div className="space-y-2">
                {inv.payments!.map(p => (
                  <div key={p.id} className="flex items-center justify-between bg-green-50 rounded-lg px-3 py-2">
                    <div>
                      <span className="text-sm font-medium">{PAYMENT_METHODS[p.method] ?? p.method}</span>
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
              <h3 className="font-semibold text-gray-700 mb-2 text-sm uppercase tracking-wide">Relances</h3>
              <div className="space-y-2">
                {inv.reminders!.map(r => (
                  <div key={r.id} className="flex items-center justify-between bg-yellow-50 rounded-lg px-3 py-2">
                    <div>
                      <span className="text-sm font-medium capitalize">{r.type} relance — {r.method}</span>
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
            <div className="flex flex-wrap gap-2 pt-2 border-t">
              {inv.status === 'draft' && (
                <button
                  onClick={() => markSentMut.mutate()}
                  className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-xl text-sm font-medium hover:opacity-90"
                >
                  <Send size={14} /> Marquer envoyée
                </button>
              )}
              {inv.balance > 0 && (
                <button
                  onClick={() => { setPayEntries([{ method: 'cash', amount: inv.balance }]); setPayModal(true) }}
                  className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700"
                >
                  <CreditCard size={14} /> Enregistrer paiement
                </button>
              )}
              {inv.balance > 0 && (
                <button
                  onClick={() => setReminderModal(true)}
                  className="flex items-center gap-1.5 px-4 py-2 bg-yellow-500 text-white rounded-xl text-sm font-medium hover:bg-yellow-600"
                >
                  <Bell size={14} /> Relance
                </button>
              )}
              <button
                onClick={async () => {
                  if (await confirm('Annuler cette facture ?')) cancelMut.mutate()
                }}
                className="flex items-center gap-1.5 px-4 py-2 border text-red-600 border-red-200 rounded-xl text-sm font-medium hover:bg-red-50"
              >
                <XCircle size={14} /> Annuler
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Modal paiement */}
      {payModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-lg shadow-2xl overflow-hidden">
            <div className="bg-gradient-to-br from-gray-900 to-gray-800 px-6 py-5 flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-xs font-medium uppercase tracking-widest mb-1">Encaissement facture</p>
                <p className="text-white text-3xl font-bold font-mono">{fmt(inv.balance)}</p>
                {inv.client && <p className="text-indigo-300 text-xs mt-1">{inv.client.name}</p>}
              </div>
              <button onClick={() => setPayModal(false)}
                className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-white">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 max-h-[60vh] overflow-y-auto">
              <PaymentPanel
                total={inv.balance}
                clientName={inv.client?.name}
                clientAccountBalance={inv.client?.account_balance}
                value={payEntries}
                onChange={setPayEntries}
                hideCredit={false}
                compact={false}
              />
            </div>
            <div className="p-4 border-t bg-gray-50 flex gap-3">
              <button onClick={() => setPayModal(false)}
                className="flex-1 py-3 rounded-2xl border-2 border-gray-200 text-gray-600 text-sm font-semibold hover:bg-gray-100">
                Annuler
              </button>
              <button
                onClick={() => payMut.mutate(payEntries)}
                disabled={payMut.isPending || payEntries.every(e => e.amount <= 0)}
                className="flex-1 py-3 rounded-2xl bg-gradient-to-r from-green-500 to-emerald-600 text-white text-sm font-bold hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-2 shadow-lg">
                <Check size={18} />
                {payMut.isPending ? 'Enregistrement...' : 'Valider le paiement'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal relance */}
      {reminderModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50" onClick={() => setReminderModal(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-gray-800 mb-4">Enregistrer une relance</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">Type</label>
                <select value={remType} onChange={e => setRemType(e.target.value as typeof remType)}
                  className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="first">1ère relance</option>
                  <option value="second">2ème relance</option>
                  <option value="final">Relance finale (mise en demeure)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Canal</label>
                <select value={remMethod} onChange={e => setRemMethod(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="phone">Téléphone</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="sms">SMS</option>
                  <option value="email">Email</option>
                  <option value="in_person">En personne</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Notes</label>
                <textarea value={remNotes} onChange={e => setRemNotes(e.target.value)} rows={3}
                  className="w-full border rounded-lg px-3 py-2 text-sm resize-none" />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setReminderModal(false)} className="flex-1 py-2 border rounded-xl text-sm text-gray-600">Annuler</button>
              <button
                onClick={() => reminderMut.mutate()}
                disabled={reminderMut.isPending}
                className="flex-1 py-2 bg-yellow-500 text-white rounded-xl text-sm font-semibold disabled:opacity-50"
              >
                {reminderMut.isPending ? '...' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// IMPORT INVOICES MODAL
// ═══════════════════════════════════════════════════════════════════════════════

interface ImportRow {
  row: number
  action: string
  full_name: string
  client_id: number | null
  client_name: string | null
  reference: string | null
  issue_date: string
  total_ttc: number
  deja_paye: number
  reste: number
  status: string
  method: string
  num_cheque: string | null
  notes: string | null
  errors: string[]
  warnings: string[]
  row_status: 'ok' | 'error' | 'skip'
}

interface ImportPreview {
  rows: ImportRow[]
  total: number
  ok: number
  errors: number
  skipped: number
}

const STATUS_LABELS_FR: Record<string, string> = {
  sent: 'Non payé', partial: 'Partiel', paid: 'Payé', overdue: 'En retard',
}

function ImportInvoicesModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const qc = useQueryClient()
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [step, setStep] = useState<'upload' | 'preview' | 'done'>('upload')
  const [result, setResult] = useState<{ created: number; skipped: number; errors: string[] } | null>(null)

  const previewMutation = useMutation({
    mutationFn: (f: File) => {
      const fd = new FormData()
      fd.append('file', f)
      return api.post<ImportPreview>('/invoices/import/preview', fd)
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
    mutationFn: (rows: ImportRow[]) =>
      api.post('/invoices/import/confirm', { rows }),
    onSuccess: (res) => {
      setResult(res.data)
      setStep('done')
      qc.invalidateQueries({ queryKey: ['invoices'] })
      qc.invalidateQueries({ queryKey: ['invoice-stats'] })
      onSuccess()
    },
    onError: (err: unknown) => {
      const data = (err as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } })?.response?.data
      const fieldErrors: string[] = data?.errors ? (Object.values(data.errors).flat() as string[]) : []
      toast.error(fieldErrors[0] ?? data?.message ?? "Erreur lors de l'import")
    },
  })

  const okRows = preview?.rows.filter(r => r.row_status === 'ok') ?? []

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-2">
            <Upload size={18} className="text-blue-600" />
            <h2 className="text-lg font-bold text-gray-900">Importer des factures</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="overflow-y-auto flex-1 p-6">
          {/* Step: upload */}
          {step === 'upload' && (
            <div className="space-y-5">
              <div className="flex items-start gap-3 p-4 bg-blue-50 rounded-xl text-sm text-blue-800">
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold mb-1">Format attendu des colonnes :</p>
                  <p className="text-xs text-blue-700">
                    <strong>full_name</strong> (nom du client), NumeroFC, DateFC, <strong>montantapaye</strong>, dejapaye, etatFC, modepaye, numcheque
                  </p>
                  <p className="text-xs text-blue-600 mt-1">Les clients doivent déjà exister dans le système (correspondance par nom).</p>
                </div>
              </div>

              <div>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const res = await api.get('/invoices/import-template', { responseType: 'blob' })
                      const url = URL.createObjectURL(res.data)
                      const a = document.createElement('a')
                      a.href = url
                      a.download = 'modele_import_factures.xlsx'
                      a.click()
                      URL.revokeObjectURL(url)
                    } catch {
                      toast.error('Erreur lors du téléchargement du modèle')
                    }
                  }}
                  className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline"
                >
                  <FileDown size={14} /> Télécharger le modèle Excel
                </button>
              </div>

              <label className="block cursor-pointer">
                <div className={`border-2 border-dashed rounded-xl p-8 text-center transition ${
                  file ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                }`}>
                  <Upload size={28} className={`mx-auto mb-2 ${file ? 'text-blue-500' : 'text-gray-300'}`} />
                  {file ? (
                    <p className="text-sm font-medium text-blue-700">{file.name}</p>
                  ) : (
                    <>
                      <p className="text-sm text-gray-500">Glissez ou cliquez pour choisir un fichier</p>
                      <p className="text-xs text-gray-400 mt-1">.xlsx, .xls, .csv — max 10 Mo</p>
                    </>
                  )}
                </div>
                <input type="file" className="hidden" accept=".xlsx,.xls,.csv,.txt"
                  onChange={e => setFile(e.target.files?.[0] ?? null)} />
              </label>
            </div>
          )}

          {/* Step: preview */}
          {step === 'preview' && preview && (
            <div className="space-y-4">
              {/* Stats */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-green-50 rounded-xl p-3 text-center">
                  <div className="text-2xl font-bold text-green-700">{preview.ok}</div>
                  <div className="text-xs text-green-600">À importer</div>
                </div>
                <div className="bg-red-50 rounded-xl p-3 text-center">
                  <div className="text-2xl font-bold text-red-600">{preview.errors}</div>
                  <div className="text-xs text-red-500">Erreurs</div>
                </div>
                <div className="bg-gray-50 rounded-xl p-3 text-center">
                  <div className="text-2xl font-bold text-gray-500">{preview.skipped}</div>
                  <div className="text-xs text-gray-400">Ignorées (doublons)</div>
                </div>
              </div>

              {/* Rows table */}
              <div className="border rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 text-gray-500 uppercase text-[10px]">
                    <tr>
                      <th className="px-3 py-2 text-left">Ligne</th>
                      <th className="px-3 py-2 text-left">Client</th>
                      <th className="px-3 py-2 text-left">Réf</th>
                      <th className="px-3 py-2 text-right">Total</th>
                      <th className="px-3 py-2 text-right">Payé</th>
                      <th className="px-3 py-2 text-right">Reste</th>
                      <th className="px-3 py-2 text-center">Statut</th>
                      <th className="px-3 py-2 text-center"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {preview.rows.map((r, idx) => (
                      <tr key={idx} className={
                        r.row_status === 'error' ? 'bg-red-50' :
                        r.row_status === 'skip' ? 'bg-gray-50 opacity-60' : ''
                      }>
                        <td className="px-3 py-2 text-gray-400">{r.row}</td>
                        <td className="px-3 py-2">
                          <span className={r.client_id ? 'text-gray-800' : 'text-red-600 font-medium'}>
                            {r.full_name || '—'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-gray-500">{r.reference || '—'}</td>
                        <td className="px-3 py-2 text-right font-medium">{r.total_ttc.toLocaleString('fr-SN')}</td>
                        <td className="px-3 py-2 text-right text-green-700">{r.deja_paye > 0 ? r.deja_paye.toLocaleString('fr-SN') : '—'}</td>
                        <td className="px-3 py-2 text-right text-red-600 font-semibold">{r.reste.toLocaleString('fr-SN')}</td>
                        <td className="px-3 py-2 text-center">
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-100 text-blue-700">
                            {STATUS_LABELS_FR[r.status] ?? r.status}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center">
                          {r.row_status === 'ok' && <CheckCircle2 size={14} className="text-green-500 mx-auto" />}
                          {r.row_status === 'error' && (
                            <span title={r.errors.join(', ')}>
                              <AlertTriangle size={14} className="text-red-500 mx-auto" />
                            </span>
                          )}
                          {r.row_status === 'skip' && <span className="text-gray-400 text-[10px]">doublon</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Error detail */}
              {preview.rows.some(r => r.errors.length > 0 || r.warnings.length > 0) && (
                <div className="space-y-1.5">
                  {preview.rows.filter(r => r.errors.length > 0 || r.warnings.length > 0).map((r, i) => (
                    <div key={i} className="text-xs">
                      {r.errors.map((e, j) => (
                        <p key={j} className="text-red-600">Ligne {r.row}: {e}</p>
                      ))}
                      {r.warnings.map((w, j) => (
                        <p key={j} className="text-yellow-600">Ligne {r.row}: ⚠ {w}</p>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Step: done */}
          {step === 'done' && result && (
            <div className="text-center py-8 space-y-4">
              <CheckCircle2 size={48} className="text-green-500 mx-auto" />
              <div>
                <p className="text-xl font-bold text-gray-900">{result.created} facture(s) importée(s)</p>
                {result.skipped > 0 && <p className="text-sm text-gray-500 mt-1">{result.skipped} ligne(s) ignorée(s)</p>}
              </div>
              {result.errors.length > 0 && (
                <div className="text-left bg-red-50 rounded-xl p-3 text-xs text-red-600 space-y-1">
                  {result.errors.map((e, i) => <p key={i}>{e}</p>)}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t px-6 py-4 flex justify-end gap-3">
          {step === 'upload' && (
            <>
              <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Annuler</button>
              <button
                onClick={() => file && previewMutation.mutate(file)}
                disabled={!file || previewMutation.isPending}
                className="flex items-center gap-2 px-5 py-2 bg-primary text-white rounded-xl text-sm font-semibold hover:opacity-90 disabled:opacity-50"
              >
                {previewMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                Analyser
              </button>
            </>
          )}
          {step === 'preview' && (
            <>
              <button onClick={() => { setStep('upload'); setPreview(null) }}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
                ← Retour
              </button>
              <button
                onClick={() => confirmMutation.mutate(okRows)}
                disabled={okRows.length === 0 || confirmMutation.isPending}
                className="flex items-center gap-2 px-5 py-2 bg-primary text-white rounded-xl text-sm font-semibold hover:opacity-90 disabled:opacity-50"
              >
                {confirmMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                Importer {okRows.length} facture(s)
              </button>
            </>
          )}
          {step === 'done' && (
            <button onClick={onClose}
              className="px-5 py-2 bg-primary text-white rounded-xl text-sm font-semibold hover:opacity-90">
              Fermer
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE PRINCIPALE
// ═══════════════════════════════════════════════════════════════════════════════

// ─── PaginationBar ────────────────────────────────────────────────────────────

function PaginationBar({
  currentPage, lastPage, total, onPage,
}: {
  currentPage: number; lastPage: number; total: number; onPage: (p: number) => void
}) {
  const pages: (number | null)[] = []
  if (lastPage <= 7) {
    for (let i = 1; i <= lastPage; i++) pages.push(i)
  } else {
    pages.push(1)
    if (currentPage > 3) pages.push(null)
    for (let i = Math.max(2, currentPage - 1); i <= Math.min(lastPage - 1, currentPage + 1); i++) pages.push(i)
    if (currentPage < lastPage - 2) pages.push(null)
    pages.push(lastPage)
  }

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50 text-sm">
      <span className="text-gray-500">
        Page <strong>{currentPage}</strong> sur <strong>{lastPage}</strong> · {total} résultat(s)
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPage(currentPage - 1)}
          disabled={currentPage === 1}
          className="flex items-center gap-1 px-3 py-1.5 border rounded-lg disabled:opacity-40 hover:bg-gray-100 transition text-gray-600"
        >
          <ChevronLeft size={14} /> Précédent
        </button>
        {pages.map((p, i) =>
          p === null ? (
            <span key={`e-${i}`} className="px-2 text-gray-400">…</span>
          ) : (
            <button
              key={p}
              onClick={() => onPage(p)}
              className={`w-8 h-8 rounded-lg text-xs font-medium transition ${
                p === currentPage
                  ? 'bg-primary text-white'
                  : 'border hover:bg-gray-100 text-gray-600'
              }`}
            >
              {p}
            </button>
          )
        )}
        <button
          onClick={() => onPage(currentPage + 1)}
          disabled={currentPage === lastPage}
          className="flex items-center gap-1 px-3 py-1.5 border rounded-lg disabled:opacity-40 hover:bg-gray-100 transition text-gray-600"
        >
          Suivant <ChevronRight size={14} />
        </button>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

type Tab = 'invoices' | 'quotes' | 'reminders'

interface ReminderQueueItem {
  id: number
  invoice_id: number
  channel: 'whatsapp' | 'sms' | 'email'
  phone: string | null
  client_name: string | null
  message: string
  scheduled_date: string
  status: 'pending' | 'sent' | 'skipped'
  invoice?: {
    id: number
    reference: string
    total_ttc: number
    paid_amount: number
    due_date?: string
    client?: { id: number; name: string; phone?: string }
  }
  rule?: { id: number; type: string; offset_days?: number; day_of_month?: number } | null
}

export default function InvoicesPage() {
  const { activeStore } = useActiveStoreStore()
  const { user } = useAuthStore()
  const confirm = useConfirm()
  const location = useLocation()
  const navigate = useNavigate()
  // Fallback: si pas de magasin actif sélectionné, utiliser le magasin de l'utilisateur
  const storeId      = activeStore?.id ?? (user?.store_id ?? undefined)
  const storeName    = activeStore?.name ?? user?.store?.name ?? 'Baobab'
  const businessType: BusinessType = (user?.store?.business_type as BusinessType) ?? 'grande_surface'
  const qc = useQueryClient()

  const [tab, setTab] = useState<Tab>('invoices')

  // Draft filter states (inputs — not sent to API until "Rechercher" is clicked)
  const [draftSearch,   setDraftSearch]   = useState('')
  const [draftStatus,   setDraftStatus]   = useState('')
  const [draftDateFrom, setDraftDateFrom] = useState('')
  const [draftDateTo,   setDraftDateTo]   = useState('')

  // Active filter states (actually used in queries)
  const [activeSearch,   setActiveSearch]   = useState('')
  const [activeStatus,   setActiveStatus]   = useState('')
  const [activeDateFrom, setActiveDateFrom] = useState('')
  const [activeDateTo,   setActiveDateTo]   = useState('')
  const [page, setPage] = useState(1)

  const handleSearch = () => {
    setActiveSearch(draftSearch)
    setActiveStatus(draftStatus)
    setActiveDateFrom(draftDateFrom)
    setActiveDateTo(draftDateTo)
    setPage(1)
  }

  const handleClear = () => {
    setDraftSearch(''); setDraftStatus(''); setDraftDateFrom(''); setDraftDateTo('')
    setActiveSearch(''); setActiveStatus(''); setActiveDateFrom(''); setActiveDateTo('')
    setPage(1)
  }

  const resetFilters = () => {
    setDraftSearch(''); setDraftStatus(''); setDraftDateFrom(''); setDraftDateTo('')
    setActiveSearch(''); setActiveStatus(''); setActiveDateFrom(''); setActiveDateTo('')
    setPage(1)
  }

  const hasActiveFilters = !!(activeSearch || activeStatus || activeDateFrom || activeDateTo)

  const [showEditor, setShowEditor]     = useState(false)
  const [editing, setEditing]           = useState<Invoice | Quote | null>(null)
  const [crmPrefill, setCrmPrefill]     = useState<CrmPrefill | undefined>(undefined)
  const [showImport, setShowImport]     = useState(false)

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

  // ── Twilio status ─────────────────────────────────────────────────────────
  const { data: twilioStatus } = useQuery<{ configured: boolean; has_sms: boolean; has_whatsapp: boolean }>({
    queryKey: ['twilio-status'],
    queryFn: () => api.get('/twilio/status').then(r => r.data),
    staleTime: 5 * 60_000,
  })

  // ── File relances ─────────────────────────────────────────────────────────
  const { data: reminderQueue, isLoading: loadingQueue, refetch: refetchQueue } = useQuery<{
    data: ReminderQueueItem[]; meta: { total: number; current_page: number; last_page: number }
  }>({
    queryKey: ['invoice-reminder-queue', storeId, 'pending'],
    queryFn: () => api.get('/invoice-reminder-queue', { params: { status: 'pending' } }).then(r => r.data),
    enabled: !!storeId && tab === 'reminders',
    staleTime: 30_000,
  })

  const reminderPendingCount = reminderQueue?.meta?.total ?? 0

  const [sendingIds, setSendingIds] = useState<Set<number>>(new Set())

  const markReminderSent = useMutation({
    mutationFn: (id: number) => api.post(`/invoice-reminder-queue/${id}/send`).then(r => r.data),
    onSuccess: (_data, id) => {
      setSendingIds(prev => { const s = new Set(prev); s.delete(id); return s })
      qc.invalidateQueries({ queryKey: ['invoice-reminder-queue'] })
      toast.success('Message envoyé via Twilio')
    },
    onError: (e: { response?: { data?: { error?: string } } }, id) => {
      setSendingIds(prev => { const s = new Set(prev); s.delete(id); return s })
      toast.error(e.response?.data?.error ?? 'Erreur d\'envoi Twilio')
    },
  })

  const markReminderSkipped = useMutation({
    mutationFn: (id: number) => api.post(`/invoice-reminder-queue/${id}/skip`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoice-reminder-queue'] })
    },
    onError: () => toast.error('Erreur'),
  })

  const handleSend = (item: ReminderQueueItem) => {
    const channel   = item.channel
    const twilioOk  = channel === 'whatsapp' ? twilioStatus?.has_whatsapp : (channel === 'sms' ? twilioStatus?.has_sms : false)

    if (twilioOk) {
      // Send via Twilio API
      setSendingIds(prev => new Set(prev).add(item.id))
      markReminderSent.mutate(item.id)
    } else if (channel === 'whatsapp') {
      // Fallback: open wa.me link + mark sent manually
      const phone = (item.phone ?? '').replace(/\D/g, '')
      if (!phone) {
        toast.error('Numéro de téléphone manquant pour ce client')
        return
      }
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(item.message)}`, '_blank')
      markReminderSent.mutate(item.id)
    } else {
      toast.error('Twilio non configuré pour ce canal')
    }
  }

  // ── Factures ───────────────────────────────────────────────────────────────
  const { data: invoicesData, isLoading: loadingInvoices, refetch: refetchInvoices } = useQuery<{
    data: Invoice[]; meta: { total: number; current_page: number; last_page: number; per_page: number }
  }>({
    queryKey: ['invoices', storeId, activeStatus, activeSearch, activeDateFrom, activeDateTo, page],
    queryFn: () => api.get('/invoices', {
      params: {
        store_id:  storeId,
        status:    activeStatus   || undefined,
        search:    activeSearch   || undefined,
        date_from: activeDateFrom || undefined,
        date_to:   activeDateTo   || undefined,
        page,
        per_page:  20,
      }
    }).then(r => r.data),
    enabled: !!storeId && tab === 'invoices',
    staleTime: 30_000,
  })

  // ── Devis ──────────────────────────────────────────────────────────────────
  const { data: quotesData, isLoading: loadingQuotes, refetch: refetchQuotes } = useQuery<{
    data: Quote[]; meta: { total: number; current_page: number; last_page: number; per_page: number }
  }>({
    queryKey: ['quotes', storeId, activeStatus, activeSearch, activeDateFrom, activeDateTo, page],
    queryFn: () => api.get('/quotes', {
      params: {
        store_id:  storeId,
        status:    activeStatus   || undefined,
        search:    activeSearch   || undefined,
        date_from: activeDateFrom || undefined,
        date_to:   activeDateTo   || undefined,
        page,
        per_page:  20,
      }
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
          <h1 className="text-2xl font-bold text-gray-900">Facturation & Devis</h1>
          <p className="text-sm text-gray-500 mt-0.5">Documents commerciaux professionnels</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowImport(true)}
            className="flex items-center gap-2 px-4 py-2.5 border border-primary/30 text-primary rounded-xl text-sm font-semibold hover:bg-primary-50 transition"
          >
            <Upload size={15} />
            Importer
          </button>
          {tab !== 'reminders' && (
            <button
              onClick={() => { setEditing(null); setShowEditor(true) }}
              className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:opacity-90 transition shadow-sm"
            >
              <Plus size={16} />
              Nouveau {tab === 'invoices' ? 'Facture' : 'Devis'}
            </button>
          )}
        </div>
      </div>

      {/* KPIs */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-2xl shadow-sm border p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-xl bg-primary-100 flex items-center justify-center">
                <FileText size={15} className="text-primary" />
              </div>
              <span className="text-xs text-gray-500">Total facturé</span>
            </div>
            <div className="text-xl font-bold text-gray-900">{fmt(stats.total_ttc)}</div>
            <div className="text-xs text-gray-400 mt-0.5">{stats.total_count} factures</div>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-xl bg-green-100 flex items-center justify-center">
                <Check size={15} className="text-green-600" />
              </div>
              <span className="text-xs text-green-600">Encaissé</span>
            </div>
            <div className="text-xl font-bold text-green-700">{fmt(stats.total_paid)}</div>
            <div className="text-xs text-gray-400 mt-0.5">{stats.paid_count} payées</div>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-xl bg-red-100 flex items-center justify-center">
                <AlertCircle size={15} className="text-red-500" />
              </div>
              <span className="text-xs text-red-500">Solde à encaisser</span>
            </div>
            <div className="text-xl font-bold text-red-600">{fmt(stats.total_balance)}</div>
            <div className="text-xs text-gray-400 mt-0.5">{stats.overdue_count} en retard</div>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-xl bg-orange-100 flex items-center justify-center">
                <Send size={15} className="text-orange-500" />
              </div>
              <span className="text-xs text-orange-500">En cours</span>
            </div>
            <div className="text-xl font-bold text-orange-600">{stats.sent_count}</div>
            <div className="text-xs text-gray-400 mt-0.5">{stats.draft_count} brouillons</div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
        <div className="flex border-b">
          {(['invoices', 'quotes', 'reminders'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => { setTab(t); resetFilters() }}
              className={`flex-1 py-3 text-sm font-semibold transition ${
                tab === t ? 'border-b-2 border-primary text-primary' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t === 'invoices' ? 'Factures' : t === 'quotes' ? 'Devis' : 'Relances'}
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
              {t === 'reminders' && reminderPendingCount > 0 && (
                <span className="ml-1.5 text-xs bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full font-bold">
                  {reminderPendingCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Filtres — masqués sur l'onglet relances */}
        {tab !== 'reminders' && <div className="px-4 py-3 border-b bg-gray-50 space-y-2.5">
          <div className="flex flex-wrap gap-2">
            {/* Recherche texte */}
            <div className="relative flex-1 min-w-[200px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Référence, client, objet..."
                value={draftSearch}
                onChange={e => setDraftSearch(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                className="w-full pl-8 pr-3 py-2 rounded-lg border text-sm focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>
            {/* Date de */}
            <div className="flex items-center gap-1">
              <label className="text-xs text-gray-500 whitespace-nowrap">Du</label>
              <input
                type="date"
                value={draftDateFrom}
                onChange={e => setDraftDateFrom(e.target.value)}
                className="border rounded-lg px-2 py-2 text-sm focus:ring-2 focus:ring-primary w-36"
              />
            </div>
            {/* Date au */}
            <div className="flex items-center gap-1">
              <label className="text-xs text-gray-500 whitespace-nowrap">Au</label>
              <input
                type="date"
                value={draftDateTo}
                onChange={e => setDraftDateTo(e.target.value)}
                className="border rounded-lg px-2 py-2 text-sm focus:ring-2 focus:ring-primary w-36"
              />
            </div>
            {/* Statut */}
            <select
              value={draftStatus}
              onChange={e => setDraftStatus(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary"
            >
              <option value="">Tous les statuts</option>
              {tab === 'invoices'
                ? Object.entries(STATUS_INVOICE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)
                : Object.entries(STATUS_QUOTE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)
              }
            </select>
          </div>

          {/* Boutons d'action */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleSearch}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:opacity-90 transition"
            >
              <Search size={14} /> Rechercher
            </button>
            <button
              onClick={handleClear}
              className="flex items-center gap-1.5 px-4 py-2 border border-gray-300 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-100 transition"
            >
              <X size={14} /> Effacer
            </button>
            {hasActiveFilters && (
              <span className="text-xs text-blue-600 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-full">
                Filtre actif
              </span>
            )}
          </div>
        </div>}

        {/* ── LISTE FACTURES ─────────────────────────────────────────────────── */}
        {tab === 'invoices' && (
          <div>
            {loadingInvoices ? (
              <div className="p-12 text-center text-gray-400">Chargement...</div>
            ) : invoices.length === 0 ? (
              <div className="p-16 text-center">
                <FileText size={48} className="text-gray-200 mx-auto mb-3" />
                <p className="text-gray-500 font-medium">Aucune facture</p>
                <p className="text-gray-400 text-sm mt-1">Créez votre première facture</p>
              </div>
            ) : (
              <div className="divide-y">
                {invoices.map(inv => {
                  const st = inv.is_overdue && !['paid', 'cancelled'].includes(inv.status) ? 'overdue' : inv.status
                  const si = STATUS_INVOICE[st as InvoiceStatus]
                  return (
                    <div
                      key={inv.id}
                      className="flex items-center gap-4 px-4 py-3 hover:bg-gray-50 cursor-pointer"
                      onClick={() => setSelected(inv)}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-gray-800 text-sm">{inv.reference}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${si.color}`}>{si.label}</span>
                          {inv.is_overdue && inv.status !== 'paid' && (
                            <AlertCircle size={14} className="text-red-500" />
                          )}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {inv.client?.name ?? 'Sans client'}
                          {inv.object && ` · ${inv.object}`}
                        </div>
                      </div>
                      <div className="text-right hidden sm:block">
                        <div className="text-sm font-bold text-gray-800">{fmt(inv.total_ttc)}</div>
                        {inv.balance > 0 && (
                          <div className="text-xs text-red-500">Solde: {fmt(inv.balance)}</div>
                        )}
                      </div>
                      <div className="text-xs text-gray-400 hidden md:block w-20 text-right">
                        {fmtDate(inv.issue_date)}
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={e => { e.stopPropagation(); setEditing(inv); setShowEditor(true) }}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                          title="Modifier"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); printFull(inv.id, 'invoice') }}
                          disabled={printingId === inv.id}
                          className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-40"
                          title="Imprimer"
                        >
                          {printingId === inv.id ? <span className="text-xs">...</span> : <Printer size={14} />}
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); downloadDoc(inv.id, 'invoice', inv.reference) }}
                          disabled={pdfIds.has(inv.id)}
                          className="p-1.5 text-primary/60 hover:text-primary hover:bg-primary/10 rounded-lg disabled:opacity-40"
                          title="Télécharger PDF"
                        >
                          {pdfIds.has(inv.id) ? <span className="text-xs">...</span> : <FileDown size={14} />}
                        </button>
                        <button
                          onClick={async e => {
                            e.stopPropagation()
                            if (await confirm(`Supprimer la facture ${inv.reference} ?`, { danger: true })) deleteInvoice.mutate(inv.id)
                          }}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
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

            {/* Pagination factures */}
            {invoicesData?.meta && invoicesData.meta.last_page > 1 && (
              <PaginationBar
                currentPage={invoicesData.meta.current_page}
                lastPage={invoicesData.meta.last_page}
                total={invoicesData.meta.total}
                onPage={setPage}
              />
            )}
          </div>
        )}

        {/* ── LISTE DEVIS ────────────────────────────────────────────────────── */}
        {tab === 'quotes' && (
          <div>
            {loadingQuotes ? (
              <div className="p-12 text-center text-gray-400">Chargement...</div>
            ) : quotes.length === 0 ? (
              <div className="p-16 text-center">
                <FileText size={48} className="text-gray-200 mx-auto mb-3" />
                <p className="text-gray-500 font-medium">Aucun devis</p>
                <p className="text-gray-400 text-sm mt-1">Créez votre premier devis</p>
              </div>
            ) : (
              <div className="divide-y">
                {quotes.map(q => {
                  const st  = q.is_expired && !['accepted', 'invoiced', 'cancelled'].includes(q.status) ? 'expired' : q.status
                  const si  = STATUS_QUOTE[st as QuoteStatus]
                  return (
                    <div key={q.id} className="flex items-center gap-4 px-4 py-3 hover:bg-gray-50">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-gray-800 text-sm">{q.reference}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${si.color}`}>{si.label}</span>
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {q.client?.name ?? 'Sans client'}
                          {q.object && ` · ${q.object}`}
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
                            className="flex items-center gap-1 px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded-lg border border-blue-200"
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
                            className="flex items-center gap-1 px-2 py-1 text-xs text-purple-600 hover:bg-purple-50 rounded-lg border border-purple-200"
                            title="Convertir en facture"
                          >
                            <ArrowRight size={12} /> Facturer
                          </button>
                        )}
                        <button
                          onClick={() => printFull(q.id, 'quote')}
                          disabled={printingId === q.id}
                          className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-40"
                          title="Imprimer"
                        >
                          <Printer size={14} />
                        </button>
                        <button
                          onClick={() => downloadDoc(q.id, 'quote', q.reference)}
                          disabled={pdfIds.has(q.id)}
                          className="p-1.5 text-primary/60 hover:text-primary hover:bg-primary/10 rounded-lg disabled:opacity-40"
                          title="Télécharger PDF"
                        >
                          {pdfIds.has(q.id) ? <span className="text-xs">...</span> : <FileDown size={14} />}
                        </button>
                        <button
                          onClick={() => { setEditing(q); setShowEditor(true) }}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                          title="Modifier"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={async () => {
                            if (await confirm(`Supprimer le devis ${q.reference} ?`, { danger: true })) deleteQuote.mutate(q.id)
                          }}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
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

            {/* Pagination devis */}
            {quotesData?.meta && quotesData.meta.last_page > 1 && (
              <PaginationBar
                currentPage={quotesData.meta.current_page}
                lastPage={quotesData.meta.last_page}
                total={quotesData.meta.total}
                onPage={setPage}
              />
            )}
          </div>
        )}

        {/* ── Onglet Relances ─────────────────────────────────────────────── */}
        {tab === 'reminders' && (
          <div>
            {/* Sub-header */}
            <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
              <p className="text-sm text-gray-600">
                {reminderPendingCount > 0
                  ? <><span className="font-semibold text-orange-600">{reminderPendingCount}</span> relance(s) en attente d'envoi</>
                  : 'Aucune relance en attente'}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => refetchQueue()}
                  className="text-xs text-gray-500 hover:text-primary flex items-center gap-1 border rounded-lg px-3 py-1.5 hover:border-primary transition-colors"
                >
                  Actualiser
                </button>
                <button
                  onClick={() => navigate('/invoice-reminders')}
                  className="text-xs text-primary flex items-center gap-1.5 border border-primary/30 rounded-lg px-3 py-1.5 hover:bg-primary-50 transition-colors"
                >
                  <Settings size={12} /> Configurer les règles
                </button>
              </div>
            </div>

            {loadingQueue ? (
              <div className="py-12 text-center text-gray-400 text-sm">Chargement...</div>
            ) : !reminderQueue?.data?.length ? (
              <div className="py-16 text-center">
                <Bell size={36} className="mx-auto mb-3 text-gray-200" />
                <p className="text-sm text-gray-500">Aucune relance en attente</p>
                <p className="text-xs text-gray-400 mt-1">
                  Les relances sont générées automatiquement chaque jour à 08h00
                </p>
                <button
                  onClick={() => navigate('/invoice-reminders')}
                  className="mt-4 flex items-center gap-2 mx-auto text-sm text-primary hover:underline"
                >
                  <Settings size={13} /> Configurer les règles de relance
                </button>
              </div>
            ) : (
              <div className="divide-y">
                {reminderQueue.data.map(item => {
                  const balance = item.invoice
                    ? Math.max(0, (item.invoice.total_ttc ?? 0) - (item.invoice.paid_amount ?? 0))
                    : 0
                  const clientPhone = item.phone ?? item.invoice?.client?.phone ?? null
                  return (
                    <div key={item.id} className="px-4 py-3 flex items-center gap-4 hover:bg-gray-50 transition-colors">
                      {/* Channel badge */}
                      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                        item.channel === 'whatsapp' ? 'bg-green-100 text-green-600'
                        : item.channel === 'sms'    ? 'bg-purple-100 text-purple-600'
                        : 'bg-blue-100 text-blue-600'
                      }`}>
                        {item.channel === 'whatsapp' ? <MessageCircle size={14} />
                         : item.channel === 'sms'    ? <Smartphone size={14} />
                         : <Bell size={14} />}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm text-gray-900">{item.invoice?.reference ?? `#${item.invoice_id}`}</span>
                          <span className="text-xs text-gray-500">{item.client_name ?? item.invoice?.client?.name ?? '—'}</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-400 mt-0.5">
                          <span>Solde : <span className="font-medium text-red-600">{new Intl.NumberFormat('fr-SN').format(balance)} FCFA</span></span>
                          {item.invoice?.due_date && (
                            <span>Échéance : {new Date(item.invoice.due_date).toLocaleDateString('fr-SN', { day: '2-digit', month: 'short' })}</span>
                          )}
                          <span>Prévu le {new Date(item.scheduled_date).toLocaleDateString('fr-SN', { day: '2-digit', month: 'short' })}</span>
                        </div>
                        {!clientPhone && (
                          <p className="text-xs text-red-500 mt-0.5">Numéro de téléphone manquant</p>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {(() => {
                          const isSending  = sendingIds.has(item.id)
                          const twilioOk   = item.channel === 'whatsapp' ? twilioStatus?.has_whatsapp : (item.channel === 'sms' ? twilioStatus?.has_sms : false)
                          const canSend    = !!clientPhone || item.channel === 'sms'
                          const btnColor   = item.channel === 'sms' ? 'bg-purple-500 hover:bg-purple-600' : 'bg-green-500 hover:bg-green-600'
                          const BtnIcon    = item.channel === 'sms' ? Smartphone : MessageCircle
                          const label      = twilioOk ? 'Envoyer' : (item.channel === 'whatsapp' ? 'WhatsApp' : 'Envoyer')
                          return (
                            <button
                              onClick={() => handleSend(item)}
                              disabled={!canSend || isSending}
                              title={canSend
                                ? (twilioOk ? `Envoyer via Twilio (${item.channel})` : `Ouvrir WhatsApp — ${clientPhone}`)
                                : 'Téléphone manquant'}
                              className={`flex items-center gap-1.5 text-xs font-medium text-white ${btnColor} disabled:opacity-40 disabled:cursor-not-allowed px-3 py-1.5 rounded-lg transition-colors`}
                            >
                              {isSending ? <Loader2 size={12} className="animate-spin" /> : <BtnIcon size={12} />}
                              {!twilioOk && item.channel === 'whatsapp' && <ExternalLink size={10} />}
                              {label}
                            </button>
                          )
                        })()}
                        <button
                          onClick={() => markReminderSkipped.mutate(item.id)}
                          title="Ignorer cette relance"
                          className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                          <SkipForward size={14} />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Pagination */}
            {reminderQueue?.meta && reminderQueue.meta.last_page > 1 && (
              <PaginationBar
                currentPage={reminderQueue.meta.current_page}
                lastPage={reminderQueue.meta.last_page}
                total={reminderQueue.meta.total}
                onPage={setPage}
              />
            )}
          </div>
        )}
      </div>

      {/* Import modal */}
      {showImport && (
        <ImportInvoicesModal
          onClose={() => setShowImport(false)}
          onSuccess={() => setShowImport(false)}
        />
      )}

      {/* Éditeur */}
      {showEditor && (
        <DocumentEditor
          type={tab !== 'quotes' ? 'invoice' : 'quote'}
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
