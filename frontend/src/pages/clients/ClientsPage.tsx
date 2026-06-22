import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../lib/api'
import { formatCurrency, formatNumber } from '../../lib/format'
import toast from 'react-hot-toast'
import {
  Users, Search, Plus, X, Check, Edit2, Eye, ChevronLeft, ChevronRight,
  Phone, Mail, MapPin, Star, CreditCard, ShoppingBag, Gift, TrendingUp,
  ArrowUpCircle, ArrowDownCircle, Building2, User, Filter, ChevronDown,
  AlertCircle, ToggleLeft, ToggleRight, Wallet, ArrowDownToLine, ArrowUpFromLine,
  TrendingDown, Activity, Upload, Download, AlertTriangle, CheckCircle2,
  Banknote, Loader2, FileText,
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

interface ClientStats {
  total: number
  active: number
  with_credit: number
  total_credit: number
  total_loyalty: number
}

interface ClientCategory {
  id: number
  name: string
  code?: string
  color: string
  is_pos_default: boolean
}

interface Client {
  id: number
  name: string
  phone?: string
  email?: string
  address?: string
  type: 'individual' | 'company'
  client_category_id?: number | null
  category?: ClientCategory | null
  ninea?: string
  notes?: string
  credit_balance: number
  credit_limit: number
  account_balance: number
  loyalty_points: number
  is_active: boolean
  sales_count?: number
}

interface AccountTx {
  id: number
  type: 'deposit' | 'withdrawal' | 'sale_debit' | 'change_deposit' | 'sale_refund' | 'adjustment'
  amount: number
  balance_before: number
  balance_after: number
  note?: string
  created_at: string
  sale?: { id: number; reference: string }
  creator?: { id: number; name: string }
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

interface ClientInvoice {
  id: number
  reference: string
  object?: string
  status: 'draft' | 'sent' | 'partial' | 'paid' | 'overdue' | 'cancelled'
  issue_date: string
  due_date?: string
  total_ttc: number
  paid_amount: number
  balance: number
  is_overdue: boolean
}

type TypeFilter = 'all' | 'individual' | 'company'
type StatusFilter = 'all' | 'active' | 'inactive' | 'credit'

interface EncourItem {
  id: number
  type: 'invoice' | 'sale'
  reference: string
  label: string
  date: string
  due_date: string | null
  total_ttc: number
  paid_amount: number
  balance: number
  status: string
  is_overdue: boolean
}

interface EncourData {
  client: { id: number; name: string; phone: string; credit_balance: number; account_balance: number }
  items: EncourItem[]
  total_due: number
}

const PAYMENT_METHODS_ENCOUR = [
  { value: 'cash',          label: 'Espèces' },
  { value: 'mobile_money',  label: 'Mobile' },
  { value: 'bank_transfer', label: 'Virement' },
  { value: 'check',         label: 'Chèque' },
  { value: 'other',         label: 'Autre' },
]

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
  adjust: { label: 'Ajusté',   cls: 'text-primary' },
  expire: { label: 'Expiré',   cls: 'text-gray-400' },
}

// ─── Client Form Modal ────────────────────────────────────────────────────────

function ClientFormModal({ client, onClose }: { client?: Client; onClose: () => void }) {
  const qc = useQueryClient()

  const { data: clientCategories = [] } = useQuery<ClientCategory[]>({
    queryKey: ['client-categories'],
    queryFn: () => api.get('/client-categories').then(r => r.data),
  })

  const [form, setForm] = useState({
    name: client?.name ?? '',
    phone: client?.phone ?? '',
    email: client?.email ?? '',
    address: client?.address ?? '',
    type: client?.type ?? 'individual',
    client_category_id: client?.client_category_id?.toString() ?? '',
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
      client_category_id: form.client_category_id ? Number(form.client_category_id) : null,
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
            <Users size={20} className="text-primary" />
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
                  form.type === t ? 'bg-primary text-white border-primary' : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                }`}>
                {t === 'individual' ? <User size={15} /> : <Building2 size={15} />}
                {TYPE_LABEL[t]}
              </button>
            ))}
          </div>

          {/* Catégorie client */}
          {clientCategories.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Catégorie</label>
              <div className="flex flex-wrap gap-2">
                <button type="button"
                  onClick={() => setForm(f => ({ ...f, client_category_id: '' }))}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                    !form.client_category_id
                      ? 'bg-gray-700 text-white border-gray-700'
                      : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                  }`}>
                  Non défini
                </button>
                {clientCategories.map(cat => (
                  <button key={cat.id} type="button"
                    onClick={() => setForm(f => ({ ...f, client_category_id: String(cat.id) }))}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
                      form.client_category_id === String(cat.id)
                        ? 'text-white border-transparent'
                        : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                    }`}
                    style={form.client_category_id === String(cat.id) ? { backgroundColor: cat.color, borderColor: cat.color } : {}}>
                    {cat.name}
                  </button>
                ))}
              </div>
            </div>
          )}

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
                  type === t ? 'bg-primary text-white border-primary' : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
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

// ─── Deposit / Withdraw Modal ─────────────────────────────────────────────────

const ACCOUNT_TX_CFG: Record<string, { label: string; Icon: React.ElementType; color: string; bg: string }> = {
  deposit:        { label: 'Dépôt',        Icon: ArrowDownToLine,   color: 'text-emerald-600', bg: 'bg-emerald-100' },
  withdrawal:     { label: 'Retrait',       Icon: ArrowUpFromLine,   color: 'text-red-500',     bg: 'bg-red-100' },
  sale_debit:     { label: 'Vente débitée', Icon: ShoppingBag,       color: 'text-blue-600',    bg: 'bg-blue-100' },
  change_deposit: { label: 'Monnaie déposée', Icon: Wallet,          color: 'text-indigo-600',  bg: 'bg-indigo-100' },
  sale_refund:    { label: 'Remboursement', Icon: TrendingDown,      color: 'text-purple-600',  bg: 'bg-purple-100' },
  adjustment:     { label: 'Ajustement',    Icon: Activity,          color: 'text-gray-500',    bg: 'bg-gray-100' },
}

function DepositWithdrawModal({ client, mode, onClose }: {
  client: Client
  mode: 'deposit' | 'withdraw'
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')

  const isDeposit = mode === 'deposit'

  const mutation = useMutation({
    mutationFn: () => api.post(`/clients/${client.id}/${isDeposit ? 'deposit' : 'withdraw'}`, {
      amount: Number(amount),
      note: note || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['client', client.id] })
      qc.invalidateQueries({ queryKey: ['account-tx', client.id] })
      qc.invalidateQueries({ queryKey: ['clients'] })
      qc.invalidateQueries({ queryKey: ['client-stats'] })
      toast.success(isDeposit ? 'Dépôt enregistré' : 'Retrait enregistré')
      onClose()
    },
    onError: (err: { response?: { data?: { message?: string } } }) =>
      toast.error(err.response?.data?.message ?? 'Erreur'),
  })

  const bal = client.account_balance
  const afterAmount = isDeposit ? bal + Number(amount) : bal - Number(amount)

  const QUICK = [1000, 2000, 5000, 10000, 25000, 50000]

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden">

        {/* Header */}
        <div className={`px-6 py-5 text-white ${isDeposit ? 'bg-gradient-to-br from-emerald-500 to-green-600' : 'bg-gradient-to-br from-red-500 to-rose-600'}`}>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-white/20 rounded-2xl flex items-center justify-center">
              {isDeposit ? <ArrowDownToLine size={20} /> : <ArrowUpFromLine size={20} />}
            </div>
            <div>
              <p className="font-bold text-lg">{isDeposit ? 'Dépôt' : 'Retrait'}</p>
              <p className="text-white/80 text-xs">{client.name}</p>
            </div>
            <button onClick={onClose} className="ml-auto w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center hover:bg-white/30 transition-colors">
              <X size={15} />
            </button>
          </div>
          {/* Balance */}
          <div className="bg-white/15 rounded-2xl px-4 py-3">
            <p className="text-white/70 text-xs mb-0.5">Solde actuel</p>
            <p className={`text-2xl font-bold ${bal >= 0 ? 'text-white' : 'text-red-200'}`}>
              {bal >= 0 ? '' : '−'}{formatCurrency(Math.abs(bal))}
            </p>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {/* Amount input */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-2">Montant (FCFA)</label>
            <input
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              autoFocus
              min={1}
              className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 text-xl font-bold text-right font-mono focus:outline-none focus:border-primary/50"
              placeholder="0"
            />
          </div>

          {/* Quick chips */}
          <div className="flex flex-wrap gap-1.5">
            {QUICK.map(q => (
              <button key={q} type="button"
                onClick={() => setAmount(String(q))}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border-2 transition-all ${
                  Number(amount) === q
                    ? isDeposit ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-red-500 text-white border-red-500'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                }`}>
                {formatCurrency(q)}
              </button>
            ))}
          </div>

          {/* Projected balance */}
          {Number(amount) > 0 && (
            <div className={`rounded-2xl p-3 text-sm flex items-center justify-between ${afterAmount >= 0 ? 'bg-emerald-50' : 'bg-red-50'}`}>
              <span className={afterAmount >= 0 ? 'text-emerald-600' : 'text-red-600'}>Nouveau solde</span>
              <span className={`font-bold text-base ${afterAmount >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                {afterAmount >= 0 ? '' : '−'}{formatCurrency(Math.abs(afterAmount))}
              </span>
            </div>
          )}

          {/* Note */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Note (optionnel)</label>
            <input
              value={note}
              onChange={e => setNote(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder={isDeposit ? 'Ex: Versement espèces' : 'Ex: Remboursement'}
            />
          </div>
        </div>

        <div className="px-5 pb-5 flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-2xl border-2 border-gray-200 text-gray-600 text-sm font-semibold hover:bg-gray-50">
            Annuler
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={!amount || Number(amount) <= 0 || mutation.isPending}
            className={`flex-1 py-3 rounded-2xl text-white text-sm font-bold disabled:opacity-40 flex items-center justify-center gap-2 ${
              isDeposit ? 'bg-gradient-to-r from-emerald-500 to-green-600' : 'bg-gradient-to-r from-red-500 to-rose-600'
            }`}>
            {isDeposit ? <ArrowDownToLine size={15} /> : <ArrowUpFromLine size={15} />}
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
  const [tab, setTab] = useState<'sales' | 'invoices' | 'loyalty' | 'account'>('sales')
  const [showCreditModal, setShowCreditModal] = useState(false)
  const [showLoyaltyModal, setShowLoyaltyModal] = useState(false)
  const [showDeposit, setShowDeposit] = useState(false)
  const [showWithdraw, setShowWithdraw] = useState(false)
  const [showEncour, setShowEncour] = useState(false)

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

  const { data: accountTxData } = useQuery<Paginated<AccountTx>>({
    queryKey: ['account-tx', client.id],
    queryFn: () => api.get(`/clients/${client.id}/account-transactions`).then(r => r.data),
    enabled: tab === 'account',
  })

  const { data: invoicesData } = useQuery<{ data: ClientInvoice[] }>({
    queryKey: ['client-invoices', client.id],
    queryFn: () => api.get(`/invoices?client_id=${client.id}&per_page=50&sort=issue_date&dir=desc`).then(r => r.data),
    enabled: tab === 'invoices',
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
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-white text-xl font-bold ${client.type === 'company' ? 'bg-purple-500' : 'bg-primary'}`}>
                {client.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">{client.name}</h2>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${client.type === 'company' ? 'bg-purple-50 text-purple-700' : 'bg-primary-50 text-primary-600'}`}>
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
              <button onClick={() => setShowEncour(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors">
                <Banknote size={14} /> Encaisser
              </button>
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

            {/* Account + Credit + Loyalty cards */}
            <div className="grid grid-cols-3 gap-3">

              {/* Account balance */}
              <div className={`rounded-2xl p-4 space-y-2 relative overflow-hidden ${
                client.account_balance > 0 ? 'bg-gradient-to-br from-indigo-500 to-blue-600 text-white' :
                client.account_balance < 0 ? 'bg-gradient-to-br from-red-500 to-rose-600 text-white' :
                'bg-gray-50 text-gray-700'
              }`}>
                <div className="flex items-center justify-between">
                  <p className={`text-xs font-semibold flex items-center gap-1.5 ${client.account_balance !== 0 ? 'text-white/80' : 'text-gray-500'}`}>
                    <Wallet size={12} /> Compte
                  </p>
                </div>
                <p className={`text-xl font-bold leading-tight ${client.account_balance !== 0 ? 'text-white' : 'text-gray-500'}`}>
                  {client.account_balance >= 0 ? '' : '−'}{formatCurrency(Math.abs(client.account_balance))}
                </p>
                <p className={`text-[10px] ${client.account_balance !== 0 ? 'text-white/60' : 'text-gray-400'}`}>
                  {client.account_balance > 0 ? 'Avoir disponible' : client.account_balance < 0 ? 'Montant dû' : 'Solde nul'}
                </p>
                <div className="flex gap-1 mt-1">
                  <button onClick={() => setShowDeposit(true)}
                    className={`flex-1 py-1 rounded-xl text-[10px] font-bold transition-colors ${
                      client.account_balance !== 0 ? 'bg-white/20 text-white hover:bg-white/30' : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
                    }`}>
                    + Dépôt
                  </button>
                  <button onClick={() => setShowWithdraw(true)}
                    className={`flex-1 py-1 rounded-xl text-[10px] font-bold transition-colors ${
                      client.account_balance !== 0 ? 'bg-white/20 text-white hover:bg-white/30' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                    }`}>
                    − Retrait
                  </button>
                </div>
              </div>

              {/* Credit */}
              <div className="bg-orange-50 rounded-2xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-gray-500 flex items-center gap-1.5">
                    <CreditCard size={12} className="text-orange-500" /> Crédit dû
                  </p>
                  <button onClick={() => setShowCreditModal(true)}
                    className="text-[10px] text-orange-600 hover:text-orange-800 font-semibold border border-orange-200 px-1.5 py-0.5 rounded-lg hover:bg-orange-100">
                    ···
                  </button>
                </div>
                <p className={`text-xl font-bold ${client.credit_balance > 0 ? 'text-orange-600' : 'text-gray-400'}`}>
                  {formatCurrency(client.credit_balance)}
                </p>
                {client.credit_limit > 0 && (
                  <>
                    <p className="text-[10px] text-gray-400">Plafond : {formatCurrency(client.credit_limit)}</p>
                    {creditPct !== null && (
                      <div className="h-1.5 bg-orange-200 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${creditPct > 80 ? 'bg-red-500' : 'bg-orange-400'}`}
                          style={{ width: `${creditPct}%` }} />
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Loyalty */}
              <div className="bg-yellow-50 rounded-2xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-gray-500 flex items-center gap-1.5">
                    <Star size={12} className="text-yellow-500" /> Fidélité
                  </p>
                  <button onClick={() => setShowLoyaltyModal(true)}
                    className="text-[10px] text-yellow-600 hover:text-yellow-800 font-semibold border border-yellow-200 px-1.5 py-0.5 rounded-lg hover:bg-yellow-100">
                    ···
                  </button>
                </div>
                <p className="text-xl font-bold text-yellow-600">
                  {formatNumber(client.loyalty_points, 0)} <span className="text-sm font-normal text-gray-400">pts</span>
                </p>
                <p className="text-[10px] text-gray-400">
                  ≈ {formatCurrency(client.loyalty_points * 100)}
                </p>
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
                {([
                  ['sales',    'Achats',    ShoppingBag],
                  ['invoices', 'Factures',  FileText],
                  ['account',  'Compte',    Wallet],
                  ['loyalty',  'Fidélité',  Gift],
                ] as const).map(([key, label, Icon]) => (
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

                {tab === 'invoices' && (() => {
                  const STATUS_INV: Record<string, { label: string; cls: string }> = {
                    draft:     { label: 'Brouillon',  cls: 'bg-gray-100 text-gray-500' },
                    sent:      { label: 'Non payé',   cls: 'bg-blue-100 text-blue-700' },
                    partial:   { label: 'Partiel',    cls: 'bg-yellow-100 text-yellow-700' },
                    paid:      { label: 'Payé',       cls: 'bg-green-100 text-green-700' },
                    overdue:   { label: 'En retard',  cls: 'bg-red-100 text-red-700' },
                    cancelled: { label: 'Annulé',     cls: 'bg-gray-100 text-gray-400' },
                  }
                  const invs = invoicesData?.data ?? []
                  const totalDue = invs.filter(i => ['sent','partial','overdue'].includes(i.status))
                    .reduce((s, i) => s + (i.balance ?? (i.total_ttc - i.paid_amount)), 0)
                  return (
                    <div className="space-y-2">
                      {totalDue > 0 && (
                        <div className="flex items-center justify-between p-3 bg-red-50 rounded-xl mb-3">
                          <span className="text-sm font-semibold text-red-700">Total restant dû</span>
                          <span className="text-base font-bold text-red-700">{formatCurrency(totalDue)}</span>
                        </div>
                      )}
                      {invs.length === 0
                        ? <p className="text-sm text-gray-400 text-center py-6">Aucune facture enregistrée</p>
                        : invs.map((inv: ClientInvoice) => {
                            const st = STATUS_INV[inv.status] ?? { label: inv.status, cls: 'bg-gray-100 text-gray-500' }
                            const balance = inv.balance ?? (inv.total_ttc - inv.paid_amount)
                            return (
                              <div key={inv.id} className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
                                <div>
                                  <div className="flex items-center gap-2">
                                    <p className="text-sm font-mono font-medium text-gray-700">{inv.reference}</p>
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${st.cls}`}>{st.label}</span>
                                  </div>
                                  <p className="text-xs text-gray-400 mt-0.5">
                                    {inv.object && inv.object !== 'Import' ? `${inv.object} · ` : ''}
                                    {inv.issue_date ? new Date(inv.issue_date).toLocaleDateString('fr-SN', { day:'2-digit', month:'short', year:'numeric' }) : ''}
                                  </p>
                                </div>
                                <div className="text-right">
                                  <p className="text-sm font-bold text-gray-900">{formatCurrency(inv.total_ttc)}</p>
                                  {balance > 0.01 && (
                                    <p className="text-xs font-semibold text-red-600">Reste: {formatCurrency(balance)}</p>
                                  )}
                                  {balance <= 0.01 && inv.paid_amount > 0 && (
                                    <p className="text-xs text-green-600">Soldé</p>
                                  )}
                                </div>
                              </div>
                            )
                          })
                      }
                    </div>
                  )
                })()}

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

                {tab === 'account' && (
                  <div>
                    {/* Quick actions */}
                    <div className="flex gap-2 mb-4">
                      <button
                        onClick={() => setShowDeposit(true)}
                        className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-emerald-500 text-white rounded-xl text-sm font-semibold hover:bg-emerald-600 transition-colors">
                        <ArrowDownToLine size={15} /> Déposer
                      </button>
                      <button
                        onClick={() => setShowWithdraw(true)}
                        className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-red-500 text-white rounded-xl text-sm font-semibold hover:bg-red-600 transition-colors">
                        <ArrowUpFromLine size={15} /> Retirer
                      </button>
                    </div>

                    {/* Transaction list */}
                    <div className="space-y-1">
                      {(accountTxData?.data ?? []).length === 0 ? (
                        <div className="text-center py-8">
                          <Wallet size={32} className="mx-auto mb-2 text-gray-200" />
                          <p className="text-sm text-gray-400">Aucune transaction de compte</p>
                        </div>
                      ) : (accountTxData?.data ?? []).map((tx: AccountTx) => {
                        const cfg = ACCOUNT_TX_CFG[tx.type] ?? { label: tx.type, Icon: Activity, color: 'text-gray-500', bg: 'bg-gray-100' }
                        const isCredit = ['deposit', 'change_deposit', 'sale_refund'].includes(tx.type)
                        return (
                          <div key={tx.id} className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
                            <div className="flex items-center gap-2.5">
                              <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${cfg.bg}`}>
                                <cfg.Icon size={14} className={cfg.color} />
                              </div>
                              <div>
                                <p className="text-sm font-medium text-gray-800">{cfg.label}</p>
                                <p className="text-xs text-gray-400">
                                  {tx.sale ? `Vente ${tx.sale.reference} · ` : ''}
                                  {new Date(tx.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                </p>
                                {tx.note && <p className="text-xs text-gray-400 italic">{tx.note}</p>}
                              </div>
                            </div>
                            <div className="text-right">
                              <p className={`text-sm font-bold ${isCredit ? 'text-emerald-600' : 'text-red-500'}`}>
                                {isCredit ? '+' : '−'}{formatCurrency(tx.amount)}
                              </p>
                              <p className={`text-[10px] font-medium ${(tx.balance_after ?? 0) >= 0 ? 'text-gray-400' : 'text-red-400'}`}>
                                Solde: {(tx.balance_after ?? 0) >= 0 ? '' : '−'}{formatCurrency(Math.abs(tx.balance_after ?? 0))}
                              </p>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {showCreditModal && <AdjustCreditModal client={client} onClose={() => setShowCreditModal(false)} />}
      {showLoyaltyModal && <AdjustLoyaltyModal client={client} onClose={() => setShowLoyaltyModal(false)} />}
      {showDeposit && <DepositWithdrawModal client={client} mode="deposit" onClose={() => setShowDeposit(false)} />}
      {showWithdraw && <DepositWithdrawModal client={client} mode="withdraw" onClose={() => setShowWithdraw(false)} />}
      {showEncour && (
        <PayEncourModal
          client={client}
          onClose={() => setShowEncour(false)}
          onSuccess={() => setShowEncour(false)}
        />
      )}
    </>
  )
}

// ─── Pay Encour Modal ─────────────────────────────────────────────────────────

function PayEncourModal({ client, onClose, onSuccess }: {
  client: Client
  onClose: () => void
  onSuccess: () => void
}) {
  const queryClient = useQueryClient()
  const [method, setMethod] = useState('cash')
  const [reference, setReference] = useState('')
  const [note, setNote] = useState('')
  const [advance, setAdvance] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [amounts, setAmounts] = useState<Record<string, string>>({})

  const { data, isLoading } = useQuery<EncourData>({
    queryKey: ['encours', client.id],
    queryFn: () => api.get(`/clients/${client.id}/encours`).then(r => r.data),
  })

  // Pré-sélectionner tous les encours avec leur solde restant
  const itemsKey = data?.items?.map(i => `${i.type}-${i.id}`).join(',') ?? ''
  useEffect(() => {
    if (!data?.items?.length) return
    const newSelected = new Set<string>()
    const newAmounts: Record<string, string> = {}
    data.items.forEach(item => {
      const key = `${item.type}-${item.id}`
      newSelected.add(key)
      newAmounts[key] = String(item.balance)
    })
    setSelected(newSelected)
    setAmounts(newAmounts)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsKey])

  const totalSelected = Array.from(selected).reduce((sum, key) => {
    return sum + (parseFloat(amounts[key] || '0') || 0)
  }, 0)
  const totalWithAdvance = totalSelected + (parseFloat(advance) || 0)

  const mutation = useMutation({
    mutationFn: (payload: object) =>
      api.post(`/clients/${client.id}/payer-encours`, payload).then(r => r.data),
    onSuccess: () => {
      toast.success('Paiement enregistré avec succès')
      queryClient.invalidateQueries({ queryKey: ['encours', client.id] })
      queryClient.invalidateQueries({ queryKey: ['client', client.id] })
      queryClient.invalidateQueries({ queryKey: ['client-sales', client.id] })
      queryClient.invalidateQueries({ queryKey: ['account-tx', client.id] })
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      onSuccess()
      onClose()
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(msg || 'Erreur lors du paiement')
    },
  })

  const handleSubmit = () => {
    const payments = Array.from(selected)
      .filter(key => (parseFloat(amounts[key] || '0') || 0) > 0)
      .map(key => {
        const dashIdx = key.indexOf('-')
        return {
          type: key.slice(0, dashIdx),
          id: parseInt(key.slice(dashIdx + 1)),
          amount: parseFloat(amounts[key]),
        }
      })

    const advanceAmount = parseFloat(advance) || 0
    if (payments.length === 0 && advanceAmount <= 0) {
      toast.error('Sélectionnez au moins un encours ou saisissez une avance')
      return
    }
    mutation.mutate({
      method,
      reference: reference || undefined,
      note: note || undefined,
      payments: payments.length > 0 ? payments : undefined,
      advance: advanceAmount > 0 ? advanceAmount : undefined,
    })
  }

  const toggleItem = (key: string) => {
    const next = new Set(selected)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setSelected(next)
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="p-5 border-b flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Banknote size={20} className="text-primary" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900">Paiement des encours</h2>
              <p className="text-sm text-gray-500">{client.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {isLoading && (
            <div className="flex items-center justify-center py-10 text-gray-400 gap-2">
              <Loader2 size={18} className="animate-spin" /> Chargement des encours...
            </div>
          )}

          {data && (
            <>
              {/* Résumé encours */}
              {data.total_due > 0 ? (
                <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertTriangle size={15} className="text-orange-500" />
                    <span className="text-sm font-semibold text-orange-700">Total dû</span>
                  </div>
                  <span className="text-lg font-bold text-orange-700">{formatCurrency(data.total_due)}</span>
                </div>
              ) : (
                <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex items-center gap-2">
                  <CheckCircle2 size={15} className="text-green-500" />
                  <span className="text-sm text-green-700 font-medium">Aucun encours — le client est à jour</span>
                </div>
              )}

              {/* Moyen de paiement */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Moyen de paiement</label>
                <div className="grid grid-cols-5 gap-1.5">
                  {PAYMENT_METHODS_ENCOUR.map(m => (
                    <button key={m.value} onClick={() => setMethod(m.value)}
                      className={`py-2 px-1 rounded-xl text-xs font-semibold text-center transition-all border ${
                        method === m.value
                          ? 'bg-primary text-white border-primary shadow-sm'
                          : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                      }`}>
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Référence</label>
                  <input value={reference} onChange={e => setReference(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    placeholder="N° chèque, transaction..." />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Note</label>
                  <input value={note} onChange={e => setNote(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    placeholder="Remarque..." />
                </div>
              </div>

              {/* Liste des encours */}
              {data.items.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Encours à régler</label>
                    <div className="flex gap-2 text-[11px]">
                      <button onClick={() => setSelected(new Set(data.items.map(i => `${i.type}-${i.id}`)))}
                        className="text-primary font-semibold hover:underline">Tout</button>
                      <span className="text-gray-300">·</span>
                      <button onClick={() => setSelected(new Set())}
                        className="text-gray-400 font-semibold hover:underline">Aucun</button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {data.items.map(item => {
                      const key = `${item.type}-${item.id}`
                      const isChecked = selected.has(key)
                      return (
                        <div key={key}
                          className={`border rounded-xl p-3 transition-all ${isChecked ? 'border-primary/30 bg-primary/5' : 'border-gray-200 bg-gray-50'}`}>
                          <div className="flex items-start gap-2">
                            <button onClick={() => toggleItem(key)} className="mt-0.5 flex-shrink-0">
                              {isChecked
                                ? <div className="w-4 h-4 rounded bg-primary flex items-center justify-center"><Check size={10} className="text-white" /></div>
                                : <div className="w-4 h-4 rounded border-2 border-gray-300" />
                              }
                            </button>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-sm font-semibold text-gray-800">{item.reference}</span>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                                  item.type === 'invoice'
                                    ? 'bg-blue-100 text-blue-700'
                                    : 'bg-orange-100 text-orange-700'
                                }`}>
                                  {item.type === 'invoice' ? 'Facture' : 'Vente crédit'}
                                </span>
                                {item.is_overdue && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 font-medium">En retard</span>
                                )}
                              </div>
                              <div className="flex items-center gap-3 text-xs text-gray-400 mt-0.5 flex-wrap">
                                <span>{new Date(item.date).toLocaleDateString('fr-FR')}</span>
                                {item.due_date && (
                                  <span>Échéance : {new Date(item.due_date).toLocaleDateString('fr-FR')}</span>
                                )}
                                {item.paid_amount > 0 && (
                                  <span className="text-emerald-600">Déjà encaissé : {formatCurrency(item.paid_amount)}</span>
                                )}
                              </div>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <p className="text-[10px] text-gray-400">Reste dû</p>
                              <p className="text-sm font-bold text-orange-600">{formatCurrency(item.balance)}</p>
                            </div>
                          </div>
                          {isChecked && (
                            <div className="mt-2.5 ml-6 flex items-center gap-2">
                              <label className="text-xs text-gray-500 flex-shrink-0">Montant :</label>
                              <input
                                type="number" min="0" max={item.balance}
                                value={amounts[key] ?? String(item.balance)}
                                onChange={e => setAmounts(prev => ({ ...prev, [key]: e.target.value }))}
                                className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-1 focus:ring-primary/30"
                              />
                              <button
                                onClick={() => setAmounts(prev => ({ ...prev, [key]: String(item.balance) }))}
                                className="text-[11px] text-primary font-semibold hover:underline flex-shrink-0">
                                Max
                              </button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Avance sur compte */}
              <div className="border border-dashed border-gray-200 rounded-xl p-3">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  Avance sur compte
                  <span className="ml-1 text-gray-400 font-normal normal-case">(crédite le solde compte du client)</span>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number" min="0"
                    value={advance}
                    onChange={e => setAdvance(e.target.value)}
                    className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    placeholder="0"
                  />
                  <span className="text-sm text-gray-500 flex-shrink-0">FCFA</span>
                </div>
                {data.client.account_balance !== 0 && (
                  <p className="text-xs mt-1 text-gray-400">
                    Solde actuel : <span className={data.client.account_balance > 0 ? 'text-emerald-600' : 'text-red-500'}>
                      {data.client.account_balance >= 0 ? '+' : '−'}{formatCurrency(Math.abs(data.client.account_balance))}
                    </span>
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t flex-shrink-0 bg-gray-50 rounded-b-2xl">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-gray-500 font-medium">Total à encaisser</span>
            <span className="text-2xl font-bold text-gray-900">{formatCurrency(totalWithAdvance)}</span>
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} disabled={mutation.isPending}
              className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-700 text-sm font-semibold hover:bg-white disabled:opacity-50">
              Annuler
            </button>
            <button
              onClick={handleSubmit}
              disabled={mutation.isPending || totalWithAdvance <= 0 || isLoading}
              className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2">
              {mutation.isPending
                ? <><Loader2 size={15} className="animate-spin" /> Traitement...</>
                : <><Check size={15} /> Confirmer le paiement</>
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Import Clients Modal ─────────────────────────────────────────────────────

interface ImportRow {
  row: number
  action: 'create' | 'update'
  existing_id?: number
  nom: string
  telephone?: string
  email?: string
  adresse?: string
  type: string
  ninea?: string
  notes?: string
  credit_balance: number
  account_balance: number
  credit_limit: number
  errors: string[]
  warnings: string[]
  status: 'ok' | 'error'
}

interface PreviewResult {
  rows: ImportRow[]
  total: number
  ok: number
  errors: number
  creates: number
  updates: number
}

function ImportClientsModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<'upload' | 'preview' | 'done'>('upload')
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [result, setResult] = useState<{ created: number; updated: number; skipped: number; errors: string[] } | null>(null)
  const [dragging, setDragging] = useState(false)

  const previewMutation = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData()
      fd.append('file', file)
      return api.post<PreviewResult>('/clients/import/preview', fd)
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
      return api.post('/clients/import/confirm', { rows: okRows })
    },
    onSuccess: (res) => {
      setResult(res.data)
      setStep('done')
      qc.invalidateQueries({ queryKey: ['clients'] })
      qc.invalidateQueries({ queryKey: ['client-stats'] })
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
      const res = await api.get('/clients/import-template', { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url
      a.download = 'modele_import_clients.xlsx'
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Erreur téléchargement modèle')
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-3xl shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-6 border-b flex items-center justify-between flex-shrink-0">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Upload size={20} className="text-primary" />
            Import clients
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {/* Step: Upload */}
          {step === 'upload' && (
            <div className="space-y-5">
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex gap-3">
                <AlertCircle size={18} className="text-blue-500 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-blue-800">
                  <p className="font-medium mb-1">Colonnes du fichier</p>
                  <p><strong>nom *</strong>, telephone, email, adresse, type (individual/company), ninea, notes, <strong>credit_en_cours</strong>, <strong>solde_compte</strong>, plafond_credit</p>
                  <p className="mt-1 text-blue-600">Les clients existants sont identifiés par leur téléphone et seront mis à jour.</p>
                </div>
              </div>

              <button onClick={downloadTemplate}
                className="flex items-center gap-2 text-sm text-primary hover:underline font-medium">
                <Download size={16} /> Télécharger le modèle Excel
              </button>

              {/* Drop zone */}
              <div
                onDragOver={e => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
                onClick={() => fileRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${dragging ? 'border-primary bg-primary/5' : 'border-gray-300 hover:border-primary hover:bg-gray-50'}`}
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
              {/* Summary bar */}
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: 'Total lignes', value: preview.total, cls: 'bg-gray-100 text-gray-700' },
                  { label: 'Valides', value: preview.ok, cls: 'bg-green-100 text-green-700' },
                  { label: 'À créer', value: preview.creates, cls: 'bg-blue-100 text-blue-700' },
                  { label: 'À mettre à jour', value: preview.updates, cls: 'bg-yellow-100 text-yellow-700' },
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

              {/* Table */}
              <div className="overflow-x-auto rounded-xl border border-gray-200">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 text-gray-600 uppercase text-[10px]">
                    <tr>
                      <th className="px-3 py-2 text-left">Ligne</th>
                      <th className="px-3 py-2 text-left">Action</th>
                      <th className="px-3 py-2 text-left">Nom</th>
                      <th className="px-3 py-2 text-left">Téléphone</th>
                      <th className="px-3 py-2 text-right">Crédit dû</th>
                      <th className="px-3 py-2 text-right">Solde compte</th>
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
                        <td className="px-3 py-2 font-medium text-gray-800">{r.nom || <span className="text-gray-400">—</span>}</td>
                        <td className="px-3 py-2 text-gray-600">{r.telephone || '—'}</td>
                        <td className="px-3 py-2 text-right">{r.credit_balance > 0 ? formatCurrency(r.credit_balance) : '—'}</td>
                        <td className="px-3 py-2 text-right">{r.account_balance !== 0 ? formatCurrency(r.account_balance) : '—'}</td>
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
                {confirmMutation.isPending ? 'Import en cours...' : `Importer ${preview!.ok} client(s)`}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
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
  const [showImport, setShowImport] = useState(false)
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
    <div className="p-3 sm:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Users size={24} className="text-primary" /> Clients
          </h1>
          <p className="text-gray-500 text-sm">{data?.total ?? 0} clients correspondants</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowImport(true)}
            className="btn-secondary flex items-center gap-2">
            <Upload size={18} /> Importer
          </button>
          <button onClick={() => { setEditClient(undefined); setShowForm(true) }}
            className="btn-primary flex items-center gap-2">
            <Plus size={18} /> Nouveau client
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4">
        <KpiCard
          icon={<Users size={20} className="text-white" />}
          label="Total clients" value={stats?.total ?? 0}
          color="bg-primary" />
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
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 ${statusFilter === k ? 'text-primary font-medium' : 'text-gray-700'}`}>
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
                typeFilter === k ? 'bg-primary text-white border-primary' : 'bg-white text-gray-600 border-gray-200 hover:border-primary-300'
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
                className="mt-2 text-primary text-sm hover:underline">
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
                    <button onClick={() => setViewClient(c)} className="text-left hover:text-primary transition-colors">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${c.type === 'company' ? 'bg-purple-500' : 'bg-primary'}`}>
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
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${c.type === 'company' ? 'bg-purple-50 text-purple-700' : 'bg-primary-50 text-primary-600'}`}>
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
                        className="text-gray-400 hover:text-primary">
                        <Eye size={15} />
                      </button>
                      <button onClick={() => { setEditClient(c); setShowForm(true) }} title="Modifier"
                        className="text-gray-400 hover:text-primary">
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
      {showImport && (
        <ImportClientsModal onClose={() => setShowImport(false)} />
      )}
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
