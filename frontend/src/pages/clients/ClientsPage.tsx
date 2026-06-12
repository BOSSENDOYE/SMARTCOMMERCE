import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../lib/api'
import { formatCurrency, formatNumber } from '../../lib/format'
import toast from 'react-hot-toast'
import {
  Users, Search, Plus, X, Check, Edit2, Eye, ChevronLeft, ChevronRight,
  Phone, Mail, MapPin, Star, CreditCard, ShoppingBag, Gift, TrendingUp,
  ArrowUpCircle, ArrowDownCircle, Building2, User, Filter, ChevronDown,
  AlertCircle, ToggleLeft, ToggleRight,
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

interface ClientStats {
  total: number
  active: number
  with_credit: number
  total_credit: number
  total_loyalty: number
}

interface Client {
  id: number
  name: string
  phone?: string
  email?: string
  address?: string
  type: 'individual' | 'company'
  ninea?: string
  notes?: string
  credit_balance: number
  credit_limit: number
  loyalty_points: number
  is_active: boolean
  sales_count?: number
}

interface Sale {
  id: number
  reference: string
  total_ttc: number
  status: string
  created_at: string
  payments?: { payment_method: string; amount: number }[]
}

interface LoyaltyTx {
  id: number
  type: 'earn' | 'redeem' | 'adjust' | 'expire'
  points: number
  balance_after: number
  notes?: string
  created_at: string
}

interface Paginated<T> { data: T[]; total: number; current_page: number; last_page: number }

type TypeFilter = 'all' | 'individual' | 'company'
type StatusFilter = 'all' | 'active' | 'inactive' | 'credit'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function KpiCard({ icon, label, value, sub, color }: {
  icon: React.ReactNode; label: string; value: string | number; sub?: string; color: string
}) {
  return (
    <div className="card p-4 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-bold text-gray-900 truncate">{value}</p>
        <p className="text-xs text-gray-500">{label}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const TYPE_LABEL: Record<string, string> = { individual: 'Particulier', company: 'Entreprise' }
const LOYALTY_TYPE_CFG: Record<string, { label: string; cls: string }> = {
  earn:   { label: 'Gagné',    cls: 'text-green-600' },
  redeem: { label: 'Utilisé',  cls: 'text-orange-600' },
  adjust: { label: 'Ajusté',   cls: 'text-blue-600' },
  expire: { label: 'Expiré',   cls: 'text-gray-400' },
}

// ─── Client Form Modal ────────────────────────────────────────────────────────

function ClientFormModal({ client, onClose }: { client?: Client; onClose: () => void }) {
  const qc = useQueryClient()

  const [form, setForm] = useState({
    name: client?.name ?? '',
    phone: client?.phone ?? '',
    email: client?.email ?? '',
    address: client?.address ?? '',
    type: client?.type ?? 'individual',
    ninea: client?.ninea ?? '',
    notes: client?.notes ?? '',
    credit_limit: client?.credit_limit?.toString() ?? '0',
    is_active: client?.is_active ?? true,
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  const mutation = useMutation({
    mutationFn: (payload: object) =>
      client ? api.put(`/clients/${client.id}`, payload) : api.post('/clients', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clients'] })
      qc.invalidateQueries({ queryKey: ['client-stats'] })
      toast.success(client ? 'Client mis à jour' : 'Client créé')
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
      name: form.name,
      phone: form.phone || undefined,
      email: form.email || undefined,
      address: form.address || undefined,
      type: form.type,
      ninea: form.ninea || undefined,
      notes: form.notes || undefined,
      credit_limit: Number(form.credit_limit),
      ...(client ? { is_active: form.is_active } : {}),
    })
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[92vh] flex flex-col">
        <div className="p-6 border-b flex items-center justify-between flex-shrink-0">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Users size={20} className="text-blue-600" />
            {client ? 'Modifier le client' : 'Nouveau client'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Type toggle */}
          <div className="flex gap-2">
            {(['individual', 'company'] as const).map(t => (
              <button key={t} type="button"
                onClick={() => setForm(f => ({ ...f, type: t }))}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-medium transition-colors ${
                  form.type === t ? 'bg-blue-600 text-white border-blue-600' : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                }`}>
                {t === 'individual' ? <User size={15} /> : <Building2 size={15} />}
                {TYPE_LABEL[t]}
              </button>
            ))}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {form.type === 'company' ? 'Raison sociale *' : 'Nom complet *'}
            </label>
            <input value={form.name} onChange={set('name')} className="input" placeholder={form.type === 'company' ? 'Nom de l\'entreprise' : 'Prénom Nom'} />
            {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Téléphone</label>
              <div className="relative">
                <Phone size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input value={form.phone} onChange={set('phone')} className="input pl-9" placeholder="77 000 00 00" />
              </div>
              {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <div className="relative">
                <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input value={form.email} onChange={set('email')} className="input pl-9" type="email" placeholder="email@exemple.com" />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Adresse</label>
            <div className="relative">
              <MapPin size={15} className="absolute left-3 top-3 text-gray-400" />
              <textarea value={form.address} onChange={set('address')} className="input pl-9 resize-none" rows={2} placeholder="Adresse complète" />
            </div>
          </div>

          {form.type === 'company' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">NINEA</label>
              <input value={form.ninea} onChange={set('ninea')} className="input font-mono" placeholder="Numéro NINEA" maxLength={30} />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Plafond crédit (FCFA)</label>
            <input type="number" value={form.credit_limit} onChange={set('credit_limit')} className="input" min={0} step={1000} />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes internes</label>
            <textarea value={form.notes} onChange={set('notes')} className="input resize-none" rows={2} placeholder="Informations complémentaires..." />
          </div>

          {client && (
            <label className="flex items-center gap-3 cursor-pointer">
              <button type="button"
                onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}
                className="transition-colors">
                {form.is_active
                  ? <ToggleRight className="text-green-500" size={28} />
                  : <ToggleLeft className="text-gray-300" size={28} />}
              </button>
              <span className="text-sm font-medium text-gray-700">
                Compte {form.is_active ? 'actif' : 'inactif'}
              </span>
            </label>
          )}
        </form>

        <div className="p-6 border-t flex gap-3 flex-shrink-0">
          <button type="button" onClick={onClose} className="btn-secondary flex-1">Annuler</button>
          <button onClick={handleSubmit} disabled={mutation.isPending}
            className="btn-primary flex-1 flex items-center justify-center gap-2">
            <Check size={16} />
            {mutation.isPending ? 'Enregistrement...' : (client ? 'Mettre à jour' : 'Créer le client')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Adjust Credit Modal ──────────────────────────────────────────────────────

function AdjustCreditModal({ client, onClose }: { client: Client; onClose: () => void }) {
  const qc = useQueryClient()
  const [type, setType] = useState<'add' | 'deduct'>('deduct')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')

  const mutation = useMutation({
    mutationFn: () => api.post(`/clients/${client.id}/adjust-credit`, { amount: Number(amount), type, reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clients'] })
      qc.invalidateQueries({ queryKey: ['client-stats'] })
      qc.invalidateQueries({ queryKey: ['client', client.id] })
      toast.success('Crédit mis à jour')
      onClose()
    },
    onError: (err: { response?: { data?: { message?: string } } }) =>
      toast.error(err.response?.data?.message ?? 'Erreur'),
  })

  return (
    <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="p-6 border-b flex items-center justify-between">
          <h3 className="font-bold text-lg flex items-center gap-2"><CreditCard size={18} /> Ajuster le crédit</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="bg-orange-50 rounded-xl p-3 text-sm">
            <p className="text-gray-500">Solde actuel</p>
            <p className="text-2xl font-bold text-orange-600">{formatCurrency(client.credit_balance)}</p>
            {client.credit_limit > 0 && <p className="text-xs text-gray-400">Plafond : {formatCurrency(client.credit_limit)}</p>}
          </div>
          <div className="flex gap-2">
            {(['deduct', 'add'] as const).map(t => (
              <button key={t} type="button" onClick={() => setType(t)}
                className={`flex-1 py-2 rounded-xl border text-sm font-medium transition-colors ${
                  type === t
                    ? t === 'deduct' ? 'bg-green-600 text-white border-green-600' : 'bg-red-500 text-white border-red-500'
                    : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                }`}>
                {t === 'deduct' ? '↓ Encaisser (réduire)' : '↑ Ajouter du crédit'}
              </button>
            ))}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Montant (FCFA)</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
              className="input" min={1} step={100} autoFocus />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Motif *</label>
            <input value={reason} onChange={e => setReason(e.target.value)} className="input" placeholder="Ex: Paiement reçu le..." />
          </div>
        </div>
        <div className="p-6 border-t flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1">Annuler</button>
          <button onClick={() => mutation.mutate()}
            disabled={!amount || !reason || mutation.isPending}
            className="btn-primary flex-1 disabled:opacity-50">
            {mutation.isPending ? 'Traitement...' : 'Confirmer'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Adjust Loyalty Modal ─────────────────────────────────────────────────────

function AdjustLoyaltyModal({ client, onClose }: { client: Client; onClose: () => void }) {
  const qc = useQueryClient()
  const [type, setType] = useState<'add' | 'redeem'>('add')
  const [points, setPoints] = useState('')
  const [notes, setNotes] = useState('')

  const mutation = useMutation({
    mutationFn: () => api.post(`/clients/${client.id}/adjust-loyalty`, { points: Number(points), type, notes }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clients'] })
      qc.invalidateQueries({ queryKey: ['client', client.id] })
      qc.invalidateQueries({ queryKey: ['loyalty-tx', client.id] })
      toast.success('Points mis à jour')
      onClose()
    },
    onError: (err: { response?: { data?: { message?: string } } }) =>
      toast.error(err.response?.data?.message ?? 'Points insuffisants'),
  })

  return (
    <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="p-6 border-b flex items-center justify-between">
          <h3 className="font-bold text-lg flex items-center gap-2"><Star size={18} className="text-yellow-500" /> Ajuster les points</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="bg-yellow-50 rounded-xl p-3 text-sm">
            <p className="text-gray-500">Solde actuel</p>
            <p className="text-2xl font-bold text-yellow-600">{formatNumber(client.loyalty_points, 0)} pts</p>
          </div>
          <div className="flex gap-2">
            {(['add', 'redeem'] as const).map(t => (
              <button key={t} type="button" onClick={() => setType(t)}
                className={`flex-1 py-2 rounded-xl border text-sm font-medium transition-colors ${
                  type === t ? 'bg-blue-600 text-white border-blue-600' : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                }`}>
                {t === 'add' ? '+ Ajouter' : '− Utiliser'}
              </button>
            ))}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Points</label>
            <input type="number" value={points} onChange={e => setPoints(e.target.value)}
              className="input" min={1} autoFocus />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Note</label>
            <input value={notes} onChange={e => setNotes(e.target.value)} className="input" placeholder="Motif de l'ajustement..." />
          </div>
        </div>
        <div className="p-6 border-t flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1">Annuler</button>
          <button onClick={() => mutation.mutate()}
            disabled={!points || mutation.isPending}
            className="btn-primary flex-1 disabled:opacity-50">
            {mutation.isPending ? 'Traitement...' : 'Confirmer'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Client Detail ────────────────────────────────────────────────────────────

function ClientDetail({ client: initialClient, onClose, onEdit }: {
  client: Client; onClose: () => void; onEdit: () => void
}) {
  const [tab, setTab] = useState<'sales' | 'loyalty'>('sales')
  const [showCreditModal, setShowCreditModal] = useState(false)
  const [showLoyaltyModal, setShowLoyaltyModal] = useState(false)

  const { data: clientData } = useQuery<Client>({
    queryKey: ['client', initialClient.id],
    queryFn: () => api.get(`/clients/${initialClient.id}`).then(r => r.data),
  })
  const client = clientData ?? initialClient

  const { data: salesData } = useQuery<Paginated<Sale>>({
    queryKey: ['client-sales', client.id],
    queryFn: () => api.get(`/clients/${client.id}/sales`).then(r => r.data),
    enabled: tab === 'sales',
  })

  const { data: loyaltyData } = useQuery<Paginated<LoyaltyTx>>({
    queryKey: ['loyalty-tx', client.id],
    queryFn: () => api.get(`/clients/${client.id}/loyalty-transactions`).then(r => r.data),
    enabled: tab === 'loyalty',
  })

  const creditPct = client.credit_limit > 0
    ? Math.min(100, Math.round((client.credit_balance / client.credit_limit) * 100))
    : null

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl max-h-[92vh] flex flex-col">

          {/* Header */}
          <div className="p-6 border-b flex items-start justify-between flex-shrink-0">
            <div className="flex items-center gap-4">
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-white text-xl font-bold ${client.type === 'company' ? 'bg-purple-500' : 'bg-blue-500'}`}>
                {client.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">{client.name}</h2>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${client.type === 'company' ? 'bg-purple-50 text-purple-700' : 'bg-blue-50 text-blue-700'}`}>
                    {TYPE_LABEL[client.type]}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${client.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {client.is_active ? 'Actif' : 'Inactif'}
                  </span>
                  {client.sales_count != null && (
                    <span className="text-xs text-gray-400">{client.sales_count} achat{(client.sales_count ?? 0) > 1 ? 's' : ''}</span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={onEdit}
                className="flex items-center gap-1 px-3 py-1.5 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-lg text-sm border border-gray-200">
                <Edit2 size={14} /> Modifier
              </button>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600 ml-1"><X size={20} /></button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-5">
            {/* Contact info */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              {client.phone && (
                <div className="flex items-center gap-2 text-gray-600">
                  <Phone size={14} className="text-gray-400 flex-shrink-0" />
                  <span>{client.phone}</span>
                </div>
              )}
              {client.email && (
                <div className="flex items-center gap-2 text-gray-600">
                  <Mail size={14} className="text-gray-400 flex-shrink-0" />
                  <span className="truncate">{client.email}</span>
                </div>
              )}
              {client.address && (
                <div className="flex items-center gap-2 text-gray-600 col-span-2">
                  <MapPin size={14} className="text-gray-400 flex-shrink-0" />
                  <span>{client.address}</span>
                </div>
              )}
              {client.ninea && (
                <div className="flex items-center gap-2 text-gray-600">
                  <Building2 size={14} className="text-gray-400 flex-shrink-0" />
                  <span className="font-mono text-xs">NINEA: {client.ninea}</span>
                </div>
              )}
            </div>

            {/* Credit + Loyalty cards */}
            <div className="grid grid-cols-2 gap-4">
              {/* Credit */}
              <div className="bg-orange-50 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                    <CreditCard size={14} className="text-orange-500" /> Crédit
                  </p>
                  <button onClick={() => setShowCreditModal(true)}
                    className="text-xs text-orange-600 hover:text-orange-800 font-medium border border-orange-200 px-2 py-0.5 rounded-lg hover:bg-orange-100">
                    Ajuster
                  </button>
                </div>
                <div>
                  <p className={`text-2xl font-bold ${client.credit_balance > 0 ? 'text-orange-600' : 'text-gray-700'}`}>
                    {formatCurrency(client.credit_balance)}
                  </p>
                  {client.credit_limit > 0 && (
                    <>
                      <p className="text-xs text-gray-400 mt-0.5">Plafond : {formatCurrency(client.credit_limit)}</p>
                      {creditPct !== null && (
                        <div className="mt-2 h-1.5 bg-orange-200 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${creditPct > 80 ? 'bg-red-500' : 'bg-orange-400'}`}
                            style={{ width: `${creditPct}%` }} />
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Loyalty */}
              <div className="bg-yellow-50 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                    <Star size={14} className="text-yellow-500" /> Fidélité
                  </p>
                  <button onClick={() => setShowLoyaltyModal(true)}
                    className="text-xs text-yellow-600 hover:text-yellow-800 font-medium border border-yellow-200 px-2 py-0.5 rounded-lg hover:bg-yellow-100">
                    Ajuster
                  </button>
                </div>
                <div>
                  <p className="text-2xl font-bold text-yellow-600">
                    {formatNumber(client.loyalty_points, 0)} <span className="text-base font-normal text-gray-500">pts</span>
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    ≈ {formatCurrency(client.loyalty_points * 100)} en valeur
                  </p>
                </div>
              </div>
            </div>

            {/* Notes */}
            {client.notes && (
              <div className="bg-gray-50 rounded-xl p-3 text-sm text-gray-600 flex gap-2">
                <AlertCircle size={14} className="text-gray-400 flex-shrink-0 mt-0.5" />
                <span>{client.notes}</span>
              </div>
            )}

            {/* Tabs */}
            <div>
              <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
                {([['sales', 'Achats', ShoppingBag], ['loyalty', 'Fidélité', Gift]] as const).map(([key, label, Icon]) => (
                  <button key={key} onClick={() => setTab(key)}
                    className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      tab === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                    }`}>
                    <Icon size={14} /> {label}
                  </button>
                ))}
              </div>

              <div className="mt-4">
                {tab === 'sales' && (
                  <div className="space-y-1">
                    {(salesData?.data ?? []).length === 0
                      ? <p className="text-sm text-gray-400 text-center py-6">Aucun achat enregistré</p>
                      : (salesData?.data ?? []).map((s: Sale) => {
                          const pmLabels: Record<string, string> = { cash: 'Espèces', wave: 'Wave', orange_money: 'Orange Money', card: 'Carte', credit: 'Crédit' }
                          return (
                            <div key={s.id} className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
                              <div>
                                <p className="text-sm font-mono font-medium text-gray-700">{s.reference}</p>
                                <p className="text-xs text-gray-400">{fmtDate(s.created_at)}</p>
                              </div>
                              <div className="text-right">
                                <p className="text-sm font-bold text-gray-900">{formatCurrency(s.total_ttc)}</p>
                                <p className="text-xs text-gray-400">
                                  {s.payments?.map(p => pmLabels[p.payment_method] ?? p.payment_method).join(', ')}
                                </p>
                              </div>
                            </div>
                          )
                        })
                    }
                  </div>
                )}

                {tab === 'loyalty' && (
                  <div className="space-y-1">
                    {(loyaltyData?.data ?? []).length === 0
                      ? <p className="text-sm text-gray-400 text-center py-6">Aucune transaction de fidélité</p>
                      : (loyaltyData?.data ?? []).map((tx: LoyaltyTx) => {
                          const cfg = LOYALTY_TYPE_CFG[tx.type] ?? { label: tx.type, cls: 'text-gray-500' }
                          const isPositive = ['earn', 'adjust'].includes(tx.type)
                          return (
                            <div key={tx.id} className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
                              <div className="flex items-center gap-2">
                                {isPositive
                                  ? <ArrowUpCircle size={16} className="text-green-500 flex-shrink-0" />
                                  : <ArrowDownCircle size={16} className="text-red-400 flex-shrink-0" />}
                                <div>
                                  <p className={`text-sm font-medium ${cfg.cls}`}>{cfg.label}</p>
                                  {tx.notes && <p className="text-xs text-gray-400">{tx.notes}</p>}
                                </div>
                              </div>
                              <div className="text-right">
                                <p className={`text-sm font-bold ${isPositive ? 'text-green-600' : 'text-red-500'}`}>
                                  {isPositive ? '+' : '-'}{formatNumber(tx.points, 0)} pts
                                </p>
                                <p className="text-xs text-gray-400">Solde: {formatNumber(tx.balance_after, 0)}</p>
                              </div>
                            </div>
                          )
                        })
                    }
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {showCreditModal && <AdjustCreditModal client={client} onClose={() => setShowCreditModal(false)} />}
      {showLoyaltyModal && <AdjustLoyaltyModal client={client} onClose={() => setShowLoyaltyModal(false)} />}
    </>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ClientsPage() {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [showForm, setShowForm] = useState(false)
  const [editClient, setEditClient] = useState<Client | undefined>()
  const [viewClient, setViewClient] = useState<Client | undefined>()
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

  const { data: stats } = useQuery<ClientStats>({
    queryKey: ['client-stats'],
    queryFn: () => api.get('/clients/stats').then(r => r.data),
  })

  const queryParams = {
    search: search || undefined,
    page,
    per_page: 25,
    type: typeFilter !== 'all' ? typeFilter : undefined,
    is_active: statusFilter === 'active' ? true : statusFilter === 'inactive' ? false : undefined,
    has_credit: statusFilter === 'credit' ? true : undefined,
  }

  const { data, isLoading } = useQuery<Paginated<Client>>({
    queryKey: ['clients', queryParams],
    queryFn: () => api.get('/clients', { params: queryParams }).then(r => r.data),
    placeholderData: prev => prev,
  })

  const toggleActive = useMutation({
    mutationFn: (c: Client) => api.put(`/clients/${c.id}`, { is_active: !c.is_active }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clients'] })
      qc.invalidateQueries({ queryKey: ['client-stats'] })
    },
  })

  const STATUS_LABELS: Record<StatusFilter, string> = {
    all: 'Tous les statuts',
    active: 'Actifs',
    inactive: 'Inactifs',
    credit: 'Avec crédit en cours',
  }

  const hasFilters = search || typeFilter !== 'all' || statusFilter !== 'all'

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Users size={24} className="text-blue-600" /> Clients
          </h1>
          <p className="text-gray-500 text-sm">{data?.total ?? 0} clients correspondants</p>
        </div>
        <button onClick={() => { setEditClient(undefined); setShowForm(true) }}
          className="btn-primary flex items-center gap-2">
          <Plus size={18} /> Nouveau client
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4">
        <KpiCard
          icon={<Users size={20} className="text-white" />}
          label="Total clients" value={stats?.total ?? 0}
          color="bg-blue-500" />
        <KpiCard
          icon={<Check size={20} className="text-white" />}
          label="Clients actifs" value={stats?.active ?? 0}
          color="bg-green-500" />
        <KpiCard
          icon={<CreditCard size={20} className="text-white" />}
          label="Crédit total dû" value={formatCurrency(stats?.total_credit ?? 0)}
          sub={`${stats?.with_credit ?? 0} client${(stats?.with_credit ?? 0) > 1 ? 's' : ''} concerné${(stats?.with_credit ?? 0) > 1 ? 's' : ''}`}
          color="bg-orange-500" />
        <KpiCard
          icon={<Star size={20} className="text-white" />}
          label="Points fidélité" value={formatNumber(stats?.total_loyalty ?? 0, 0) + ' pts'}
          color="bg-yellow-500" />
      </div>

      {/* Filters */}
      <div className="card p-4 space-y-3">
        <div className="flex gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              className="input pl-10"
              placeholder="Nom, téléphone, email..."
            />
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          </div>

          {/* Status filter */}
          <div className="relative" ref={menuRef}>
            <button onClick={() => setShowStatusMenu(s => !s)}
              className="flex items-center gap-2 px-4 py-2 border rounded-lg text-sm bg-white border-gray-200 hover:bg-gray-50 whitespace-nowrap">
              <Filter size={14} className="text-gray-400" />
              {STATUS_LABELS[statusFilter]}
              <ChevronDown size={13} className="text-gray-400" />
            </button>
            {showStatusMenu && (
              <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-gray-200 rounded-xl shadow-lg z-10 py-1">
                {(Object.keys(STATUS_LABELS) as StatusFilter[]).map(k => (
                  <button key={k} onClick={() => { setStatusFilter(k); setPage(1); setShowStatusMenu(false) }}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 ${statusFilter === k ? 'text-blue-600 font-medium' : 'text-gray-700'}`}>
                    {STATUS_LABELS[k]}
                  </button>
                ))}
              </div>
            )}
          </div>

          {hasFilters && (
            <button onClick={() => { setSearch(''); setTypeFilter('all'); setStatusFilter('all'); setPage(1) }}
              className="flex items-center gap-1 px-3 py-2 text-sm text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50">
              <X size={14} /> Réinitialiser
            </button>
          )}
        </div>

        {/* Type pills */}
        <div className="flex gap-2">
          {([['all', 'Tous', undefined], ['individual', 'Particuliers', User], ['company', 'Entreprises', Building2]] as const).map(([k, label, Icon]) => (
            <button key={k} onClick={() => { setTypeFilter(k); setPage(1) }}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-sm border transition-colors ${
                typeFilter === k ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
              }`}>
              {Icon && <Icon size={12} />} {label}
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
            <Users size={40} className="mx-auto mb-3 opacity-30" />
            <p className="font-medium">Aucun client trouvé</p>
            {hasFilters && (
              <button onClick={() => { setSearch(''); setTypeFilter('all'); setStatusFilter('all') }}
                className="mt-2 text-blue-500 text-sm hover:underline">
                Réinitialiser les filtres
              </button>
            )}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Client</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Contact</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Type</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Crédit en cours</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Fidélité</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Achats</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Statut</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {(data?.data ?? []).map((c: Client) => (
                <tr key={c.id} className="hover:bg-gray-50 transition-colors group">
                  <td className="px-4 py-3">
                    <button onClick={() => setViewClient(c)} className="text-left hover:text-blue-600 transition-colors">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${c.type === 'company' ? 'bg-purple-500' : 'bg-blue-500'}`}>
                          {c.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{c.name}</p>
                          {c.ninea && <p className="text-xs text-gray-400 font-mono">NINEA: {c.ninea}</p>}
                        </div>
                      </div>
                    </button>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    <div className="space-y-0.5">
                      {c.phone && <p className="flex items-center gap-1 text-xs"><Phone size={11} />{c.phone}</p>}
                      {c.email && <p className="flex items-center gap-1 text-xs text-gray-400 truncate max-w-32"><Mail size={11} />{c.email}</p>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${c.type === 'company' ? 'bg-purple-50 text-purple-700' : 'bg-blue-50 text-blue-700'}`}>
                      {TYPE_LABEL[c.type]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={`font-semibold ${c.credit_balance > 0 ? 'text-orange-600' : 'text-gray-400'}`}>
                      {formatCurrency(c.credit_balance)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={`font-medium ${c.loyalty_points > 0 ? 'text-yellow-600' : 'text-gray-400'}`}>
                      {formatNumber(c.loyalty_points, 0)} pts
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-500">
                    {c.sales_count ?? 0}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => toggleActive.mutate(c)} className="transition-colors">
                      {c.is_active
                        ? <ToggleRight className="text-green-500" size={22} />
                        : <ToggleLeft className="text-gray-300" size={22} />}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => setViewClient(c)} title="Voir le détail"
                        className="text-gray-400 hover:text-blue-600">
                        <Eye size={15} />
                      </button>
                      <button onClick={() => { setEditClient(c); setShowForm(true) }} title="Modifier"
                        className="text-gray-400 hover:text-blue-600">
                        <Edit2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        {data && data.last_page > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50">
            <p className="text-sm text-gray-500">
              Page {data.current_page} / {data.last_page} · {data.total} clients
            </p>
            <div className="flex gap-1">
              <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
                className="p-1.5 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-100">
                <ChevronLeft size={16} />
              </button>
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
        <ClientFormModal
          client={editClient}
          onClose={() => { setShowForm(false); setEditClient(undefined) }}
        />
      )}
      {viewClient && !showForm && (
        <ClientDetail
          client={viewClient}
          onClose={() => setViewClient(undefined)}
          onEdit={() => { setEditClient(viewClient); setViewClient(undefined); setShowForm(true) }}
        />
      )}
    </div>
  )
}
