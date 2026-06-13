import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../lib/api'
import { useAuthStore } from '../../store/auth.store'
import { formatCurrency } from '../../lib/format'
import toast from 'react-hot-toast'
import {
  Receipt, Plus, X, CheckCircle, Ban, Eye, Edit2, RefreshCw,
  Wallet, TrendingDown, Clock, Tag, ChevronDown, AlertTriangle,
  BookOpen, Search, Filter, Printer,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Account {
  id: number
  code: string
  name: string
  class: string
  nature: string
}

interface ExpenseCategory {
  id: number
  name: string
  color: string
  is_vat_deductible: boolean
  is_active: boolean
  sort_order: number
  default_charge_account_id: number | null
  default_account_code: string | null
  default_charge_account?: Account
}

interface Expense {
  id: number
  reference: string
  expense_date: string
  status: 'draft' | 'validated' | 'cancelled'
  description: string
  beneficiary: string | null
  amount_ht: number
  vat_rate: number
  vat_amount: number
  amount_ttc: number
  payment_method: string
  notes: string | null
  cancellation_reason: string | null
  category?: ExpenseCategory
  charge_account?: Account
  treasury_account?: Account
  user?: { id: number; name: string }
  journal_entry?: { id: number; reference: string }
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PAYMENT_METHODS = [
  { value: 'cash',         label: 'Espèces',            color: 'emerald' },
  { value: 'wave',         label: 'Wave',               color: 'sky' },
  { value: 'orange_money', label: 'Orange Money',       color: 'orange' },
  { value: 'free_money',   label: 'Free Money',         color: 'red' },
  { value: 'card',         label: 'Carte bancaire',     color: 'violet' },
  { value: 'virement',     label: 'Virement bancaire',  color: 'blue' },
  { value: 'cheque',       label: 'Chèque',             color: 'gray' },
]

const COLOR_CLASSES: Record<string, string> = {
  indigo:  'bg-indigo-100 text-indigo-700',
  violet:  'bg-violet-100 text-violet-700',
  yellow:  'bg-yellow-100 text-yellow-700',
  blue:    'bg-blue-100 text-blue-700',
  orange:  'bg-orange-100 text-orange-700',
  sky:     'bg-sky-100 text-sky-700',
  teal:    'bg-teal-100 text-teal-700',
  emerald: 'bg-emerald-100 text-emerald-700',
  purple:  'bg-purple-100 text-purple-700',
  red:     'bg-red-100 text-red-700',
  gray:    'bg-gray-100 text-gray-600',
  pink:    'bg-pink-100 text-pink-700',
  slate:   'bg-slate-100 text-slate-600',
}

function CategoryBadge({ category }: { category?: ExpenseCategory }) {
  if (!category) return <span className="text-gray-400 text-xs">—</span>
  const cls = COLOR_CLASSES[category.color] ?? COLOR_CLASSES.gray
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{category.name}</span>
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft:     'bg-amber-100 text-amber-700',
    validated: 'bg-green-100 text-green-700',
    cancelled: 'bg-red-100 text-red-700',
  }
  const labels: Record<string, string> = {
    draft: 'Brouillon', validated: 'Validée', cancelled: 'Annulée',
  }
  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${map[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {labels[status] ?? status}
    </span>
  )
}

function PmBadge({ method }: { method: string }) {
  const pm = PAYMENT_METHODS.find(m => m.value === method)
  return <span className="text-xs text-gray-600">{pm?.label ?? method}</span>
}

// ─── Stats Cards ──────────────────────────────────────────────────────────────

function StatsRow({ from, to }: { from: string; to: string }) {
  const { data } = useQuery({
    queryKey: ['expense-stats', from, to],
    queryFn: () => api.get('/expenses/stats', { params: { date_from: from, date_to: to } }).then(r => r.data),
    staleTime: 30_000,
  })

  const cards = [
    {
      label: 'Total dépenses (validées)',
      value: formatCurrency(data?.total_validated_ttc ?? 0),
      icon: <TrendingDown size={18} className="text-red-500" />,
      bg: 'bg-red-50',
      border: 'border-red-100',
    },
    {
      label: 'En attente de validation',
      value: data?.draft ?? '—',
      icon: <Clock size={18} className="text-amber-500" />,
      bg: 'bg-amber-50',
      border: 'border-amber-100',
    },
    {
      label: 'Validées (période)',
      value: data?.validated ?? '—',
      icon: <CheckCircle size={18} className="text-green-500" />,
      bg: 'bg-green-50',
      border: 'border-green-100',
    },
    {
      label: 'Nombre total',
      value: data?.count ?? '—',
      icon: <Receipt size={18} className="text-blue-500" />,
      bg: 'bg-blue-50',
      border: 'border-blue-100',
    },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map(c => (
        <div key={c.label} className={`${c.bg} border ${c.border} rounded-2xl p-4 flex items-center gap-3`}>
          <div className="w-9 h-9 bg-white rounded-xl flex items-center justify-center shadow-sm flex-shrink-0">
            {c.icon}
          </div>
          <div>
            <p className="text-xs text-gray-500">{c.label}</p>
            <p className="text-lg font-bold text-gray-800">{c.value}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Expense Form ─────────────────────────────────────────────────────────────

function ExpenseForm({
  editExpense,
  categories,
  accounts,
  onClose,
}: {
  editExpense?: Expense | null
  categories: ExpenseCategory[]
  accounts: Account[]
  onClose: () => void
}) {
  const { user } = useAuthStore()
  const qc = useQueryClient()

  const isEdit = !!editExpense

  const [expenseDate,       setExpenseDate]       = useState(editExpense?.expense_date.slice(0, 10) ?? new Date().toISOString().slice(0, 10))
  const [categoryId,        setCategoryId]        = useState<number | ''>(editExpense?.category?.id ?? '')
  const [chargeAccountId,   setChargeAccountId]   = useState<number | ''>(editExpense?.charge_account?.id ?? '')
  const [treasuryAccountId, setTreasuryAccountId] = useState<number | ''>(editExpense?.treasury_account?.id ?? '')
  const [description,       setDescription]       = useState(editExpense?.description ?? '')
  const [beneficiary,       setBeneficiary]       = useState(editExpense?.beneficiary ?? '')
  const [amountHt,          setAmountHt]          = useState(String(editExpense?.amount_ht ?? ''))
  const [vatRate,           setVatRate]           = useState(String(editExpense?.vat_rate ?? '0'))
  const [paymentMethod,     setPaymentMethod]     = useState(editExpense?.payment_method ?? 'cash')
  const [notes,             setNotes]             = useState(editExpense?.notes ?? '')
  const [validateNow,       setValidateNow]       = useState(false)

  // Auto-fill charge account when category changes
  useEffect(() => {
    if (!categoryId) return
    const cat = categories.find(c => c.id === Number(categoryId))
    if (cat?.default_charge_account_id && !isEdit) {
      setChargeAccountId(cat.default_charge_account_id)
    }
  }, [categoryId])

  // Computed
  const ht         = parseFloat(amountHt) || 0
  const rate       = parseFloat(vatRate) || 0
  const vatAmount  = Math.round(ht * rate / 100 * 100) / 100
  const amountTtc  = Math.round((ht + vatAmount) * 100) / 100

  const chargeAccounts   = accounts.filter(a => a.class === '6')
  const treasuryAccounts = accounts.filter(a => a.class === '5')

  const mutation = useMutation({
    mutationFn: () => {
      const payload = {
        expense_date:        expenseDate,
        expense_category_id: categoryId || undefined,
        charge_account_id:   chargeAccountId,
        treasury_account_id: treasuryAccountId,
        description,
        beneficiary: beneficiary || undefined,
        amount_ht:   ht,
        vat_rate:    rate,
        payment_method: paymentMethod,
        notes: notes || undefined,
        validate_now: validateNow,
      }
      if (isEdit) return api.put(`/expenses/${editExpense!.id}`, payload)
      return api.post('/expenses', payload)
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Dépense mise à jour' : validateNow ? 'Dépense créée et validée' : 'Dépense enregistrée en brouillon')
      qc.invalidateQueries({ queryKey: ['expenses'] })
      qc.invalidateQueries({ queryKey: ['expense-stats'] })
      onClose()
    },
    onError: (e: { response?: { data?: { message?: string } } }) => {
      toast.error(e.response?.data?.message ?? 'Erreur lors de l\'enregistrement')
    },
  })

  const canSubmit = description.trim() && ht > 0 && chargeAccountId && treasuryAccountId

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[95vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-red-100 rounded-xl flex items-center justify-center">
              <Receipt size={18} className="text-red-600" />
            </div>
            <h2 className="text-base font-bold text-gray-800">
              {isEdit ? 'Modifier la dépense' : 'Nouvelle dépense'}
            </h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors p-1">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">

          {/* Ligne 1 : date + catégorie + bénéficiaire */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Date <span className="text-red-500">*</span></label>
              <input type="date" value={expenseDate} onChange={e => setExpenseDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400/30" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Catégorie</label>
              <select value={categoryId} onChange={e => setCategoryId(e.target.value ? Number(e.target.value) : '')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-400/30">
                <option value="">— Sans catégorie —</option>
                {categories.filter(c => c.is_active).map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Bénéficiaire</label>
              <input type="text" value={beneficiary} onChange={e => setBeneficiary(e.target.value)}
                placeholder="Propriétaire, EDF, Employé..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400/30" />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Description <span className="text-red-500">*</span></label>
            <input type="text" value={description} onChange={e => setDescription(e.target.value)}
              placeholder="Loyer mois de juin, Facture SENELEC, Salaire chauffeur..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400/30" />
          </div>

          {/* Montants */}
          <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
            <p className="text-xs font-semibold text-gray-600 mb-3">Montants</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1.5">Montant HT (FCFA) <span className="text-red-500">*</span></label>
                <input type="number" value={amountHt} onChange={e => setAmountHt(e.target.value)}
                  min={0} step={1} placeholder="0"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-right font-mono focus:outline-none focus:ring-2 focus:ring-red-400/30" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1.5">Taux TVA (%)</label>
                <select value={vatRate} onChange={e => setVatRate(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-400/30">
                  <option value="0">0% (Exonéré)</option>
                  <option value="18">18%</option>
                  <option value="10">10%</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1.5">TVA</label>
                <div className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-right font-mono bg-white text-gray-500">
                  {vatAmount.toLocaleString('fr-FR')}
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1.5">Total TTC</label>
                <div className="w-full border border-primary/30 rounded-lg px-3 py-2 text-sm text-right font-mono font-bold bg-primary/5 text-primary">
                  {amountTtc.toLocaleString('fr-FR')}
                </div>
              </div>
            </div>
          </div>

          {/* Comptes SYSCOHADA */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                Compte de charge (Classe 6) <span className="text-red-500">*</span>
              </label>
              {chargeAccounts.length === 0 ? (
                <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  Initialisez le plan comptable SYSCOHADA d'abord.
                </p>
              ) : (
                <select value={chargeAccountId} onChange={e => setChargeAccountId(e.target.value ? Number(e.target.value) : '')}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-400/30">
                  <option value="">— Choisir un compte —</option>
                  {chargeAccounts.map(a => (
                    <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                  ))}
                </select>
              )}
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                Compte de trésorerie (Classe 5) <span className="text-red-500">*</span>
              </label>
              {treasuryAccounts.length === 0 ? (
                <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  Initialisez le plan comptable SYSCOHADA d'abord.
                </p>
              ) : (
                <select value={treasuryAccountId} onChange={e => setTreasuryAccountId(e.target.value ? Number(e.target.value) : '')}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-400/30">
                  <option value="">— Choisir un compte —</option>
                  {treasuryAccounts.map(a => (
                    <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Mode de paiement */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-2">Mode de règlement <span className="text-red-500">*</span></label>
            <div className="flex flex-wrap gap-2">
              {PAYMENT_METHODS.map(pm => (
                <button key={pm.value} type="button"
                  onClick={() => setPaymentMethod(pm.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border-2 transition-all ${
                    paymentMethod === pm.value
                      ? 'bg-primary text-white border-primary shadow-sm'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                  }`}>
                  {pm.label}
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Notes internes <span className="text-gray-400">(optionnel)</span></label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              placeholder="Commentaires, référence de pièce justificative..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-400/30" />
          </div>

          {/* Option validation immédiate */}
          {!isEdit && (
            <label className="flex items-center gap-3 cursor-pointer p-3 bg-green-50 border border-green-200 rounded-xl hover:bg-green-100 transition-colors">
              <input type="checkbox" checked={validateNow} onChange={e => setValidateNow(e.target.checked)}
                className="w-4 h-4 accent-green-600" />
              <div>
                <p className="text-sm font-semibold text-green-800">Valider immédiatement</p>
                <p className="text-xs text-green-600">L'écriture comptable sera générée automatiquement dans le journal.</p>
              </div>
            </label>
          )}

          {/* Saisie info */}
          <div className="text-xs text-gray-400 text-right">Saisi par : {user?.name}</div>
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-6 py-4 border-t border-gray-100 flex-shrink-0">
          <button onClick={onClose}
            className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors">
            Annuler
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={!canSubmit || mutation.isPending}
            className="flex-1 py-2.5 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
            <Receipt size={14} />
            {mutation.isPending ? 'Enregistrement…' : isEdit ? 'Mettre à jour' : validateNow ? 'Créer & Valider' : 'Enregistrer en brouillon'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Cancel Modal ─────────────────────────────────────────────────────────────

function CancelModal({ expense, onClose }: { expense: Expense; onClose: () => void }) {
  const [reason, setReason] = useState('')
  const qc = useQueryClient()

  const mutation = useMutation({
    mutationFn: () => api.post(`/expenses/${expense.id}/cancel`, { reason }),
    onSuccess: () => {
      toast.success('Dépense annulée' + (expense.status === 'validated' ? ' — écriture d\'extourne créée' : ''))
      qc.invalidateQueries({ queryKey: ['expenses'] })
      qc.invalidateQueries({ queryKey: ['expense-stats'] })
      onClose()
    },
    onError: (e: { response?: { data?: { message?: string } } }) =>
      toast.error(e.response?.data?.message ?? 'Erreur'),
  })

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-red-100 rounded-xl flex items-center justify-center">
              <Ban size={18} className="text-red-600" />
            </div>
            <div>
              <h2 className="font-bold text-gray-800">Annuler la dépense</h2>
              <p className="text-xs text-gray-400 font-mono">{expense.reference}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1"><X size={18} /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {expense.status === 'validated' && (
            <div className="flex gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
              <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
              <p>Cette dépense est validée. Une <strong>écriture d'extourne</strong> sera automatiquement générée dans le journal comptable.</p>
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Motif d'annulation <span className="text-red-500">*</span></label>
            <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3}
              placeholder="Expliquez la raison de cette annulation..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-400/30" />
          </div>
        </div>
        <div className="flex gap-2 px-6 pb-5">
          <button onClick={onClose}
            className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
            Fermer
          </button>
          <button onClick={() => mutation.mutate()} disabled={!reason.trim() || mutation.isPending}
            className="flex-1 py-2.5 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2">
            <Ban size={14} />
            {mutation.isPending ? 'En cours…' : 'Confirmer l\'annulation'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Detail Modal ─────────────────────────────────────────────────────────────

function DetailModal({
  expenseId,
  onClose,
  onEdit,
  onCancel,
}: {
  expenseId: number
  onClose: () => void
  onEdit: (e: Expense) => void
  onCancel: (e: Expense) => void
}) {
  const qc = useQueryClient()

  const { data: expense, isLoading } = useQuery<Expense>({
    queryKey: ['expense-detail', expenseId],
    queryFn: () => api.get(`/expenses/${expenseId}`).then(r => r.data),
  })

  const validateMut = useMutation({
    mutationFn: () => api.post(`/expenses/${expenseId}/validate`),
    onSuccess: () => {
      toast.success('Dépense validée — écriture comptable créée')
      qc.invalidateQueries({ queryKey: ['expenses'] })
      qc.invalidateQueries({ queryKey: ['expense-stats'] })
      qc.invalidateQueries({ queryKey: ['expense-detail', expenseId] })
    },
    onError: (e: { response?: { data?: { message?: string } } }) =>
      toast.error(e.response?.data?.message ?? 'Erreur lors de la validation'),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <Receipt size={15} className="text-primary" />
              <span className="font-bold text-gray-800 font-mono text-sm">{expense?.reference ?? '…'}</span>
              {expense && <StatusBadge status={expense.status} />}
            </div>
            {expense && (
              <p className="text-xs text-gray-400 mt-0.5">
                {new Date(expense.expense_date).toLocaleDateString('fr-FR')}
                {expense.user && ` — Saisi par ${expense.user.name}`}
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {isLoading && <div className="text-center py-10"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" /></div>}

          {expense && (
            <>
              {/* Info principale */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-xs text-gray-500">Catégorie</p>
                  <div className="mt-1"><CategoryBadge category={expense.category} /></div>
                </div>
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-xs text-gray-500">Mode de règlement</p>
                  <p className="font-medium text-gray-800 text-sm mt-1">{PAYMENT_METHODS.find(m => m.value === expense.payment_method)?.label ?? expense.payment_method}</p>
                </div>
                {expense.beneficiary && (
                  <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-xs text-gray-500">Bénéficiaire</p>
                    <p className="font-medium text-gray-800 text-sm mt-1">{expense.beneficiary}</p>
                  </div>
                )}
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-xs text-gray-500">Description</p>
                  <p className="font-medium text-gray-800 text-sm mt-1">{expense.description}</p>
                </div>
              </div>

              {/* Montants */}
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-600 uppercase tracking-wider">Montants</div>
                <div className="divide-y divide-gray-100">
                  <div className="flex justify-between px-4 py-2.5 text-sm">
                    <span className="text-gray-600">Montant HT</span>
                    <span className="font-mono font-medium">{formatCurrency(expense.amount_ht)}</span>
                  </div>
                  {expense.vat_rate > 0 && (
                    <div className="flex justify-between px-4 py-2.5 text-sm">
                      <span className="text-gray-600">TVA ({expense.vat_rate}%)</span>
                      <span className="font-mono text-gray-600">{formatCurrency(expense.vat_amount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between px-4 py-2.5 bg-primary/5">
                    <span className="font-bold text-gray-800">Total TTC</span>
                    <span className="font-mono font-bold text-primary text-base">{formatCurrency(expense.amount_ttc)}</span>
                  </div>
                </div>
              </div>

              {/* Comptes SYSCOHADA */}
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-600 uppercase tracking-wider flex items-center gap-1.5">
                  <BookOpen size={12} /> Imputation comptable
                </div>
                <div className="divide-y divide-gray-100">
                  <div className="flex justify-between px-4 py-2.5 text-sm">
                    <span className="text-gray-500">Compte de charge</span>
                    <span className="font-mono text-xs text-gray-700">
                      {expense.charge_account ? `${expense.charge_account.code} — ${expense.charge_account.name}` : '—'}
                    </span>
                  </div>
                  <div className="flex justify-between px-4 py-2.5 text-sm">
                    <span className="text-gray-500">Compte de trésorerie</span>
                    <span className="font-mono text-xs text-gray-700">
                      {expense.treasury_account ? `${expense.treasury_account.code} — ${expense.treasury_account.name}` : '—'}
                    </span>
                  </div>
                  {expense.journal_entry && (
                    <div className="flex justify-between px-4 py-2.5 text-sm">
                      <span className="text-gray-500">Écriture journal</span>
                      <span className="font-mono text-xs text-green-700 font-semibold">{expense.journal_entry.reference}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Annulation */}
              {expense.status === 'cancelled' && expense.cancellation_reason && (
                <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                  <span className="font-semibold">Motif : </span>{expense.cancellation_reason}
                </div>
              )}

              {/* Notes */}
              {expense.notes && (
                <div className="px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-600 italic">
                  {expense.notes}
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex gap-2 px-6 py-4 border-t flex-shrink-0">
          <button onClick={onClose}
            className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
            Fermer
          </button>
          {expense?.status === 'draft' && (
            <>
              <button onClick={() => { onClose(); onEdit(expense) }}
                className="flex items-center gap-1.5 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                <Edit2 size={14} /> Modifier
              </button>
              <button onClick={() => validateMut.mutate()} disabled={validateMut.isPending}
                className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50">
                <CheckCircle size={14} />
                {validateMut.isPending ? 'Validation…' : 'Valider'}
              </button>
              <button onClick={() => { onClose(); onCancel(expense) }}
                className="flex items-center gap-1.5 px-4 py-2 bg-red-50 text-red-600 border border-red-200 rounded-lg text-sm hover:bg-red-100 ml-auto">
                <Ban size={14} /> Annuler
              </button>
            </>
          )}
          {expense?.status === 'validated' && (
            <button onClick={() => { onClose(); onCancel(expense) }}
              className="flex items-center gap-1.5 px-4 py-2 bg-red-50 text-red-600 border border-red-200 rounded-lg text-sm hover:bg-red-100 ml-auto">
              <Ban size={14} /> Annuler & extourner
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Categories Manager ────────────────────────────────────────────────────────

function CategoriesManager({ accounts }: { accounts: Account[] }) {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editCat, setEditCat] = useState<ExpenseCategory | null>(null)
  const [form, setForm] = useState({
    name: '',
    default_charge_account_id: '' as number | '',
    is_vat_deductible: true,
    color: 'gray',
  })

  const { data: categories = [], isLoading } = useQuery<ExpenseCategory[]>({
    queryKey: ['expense-categories'],
    queryFn: () => api.get('/expense-categories').then(r => r.data),
  })

  const initMut = useMutation({
    mutationFn: () => api.post('/expense-categories/init'),
    onSuccess: r => { toast.success(r.data.message); qc.invalidateQueries({ queryKey: ['expense-categories'] }) },
    onError: () => toast.error('Erreur lors de l\'initialisation'),
  })

  const saveMut = useMutation({
    mutationFn: () => {
      const payload = {
        ...form,
        default_charge_account_id: form.default_charge_account_id || undefined,
      }
      if (editCat) return api.put(`/expense-categories/${editCat.id}`, payload)
      return api.post('/expense-categories', payload)
    },
    onSuccess: () => {
      toast.success(editCat ? 'Catégorie mise à jour' : 'Catégorie créée')
      qc.invalidateQueries({ queryKey: ['expense-categories'] })
      setShowForm(false); setEditCat(null)
      setForm({ name: '', default_charge_account_id: '', is_vat_deductible: true, color: 'gray' })
    },
    onError: (e: { response?: { data?: { message?: string } } }) =>
      toast.error(e.response?.data?.message ?? 'Erreur'),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete(`/expense-categories/${id}`),
    onSuccess: () => { toast.success('Catégorie supprimée'); qc.invalidateQueries({ queryKey: ['expense-categories'] }) },
    onError: (e: { response?: { data?: { message?: string } } }) =>
      toast.error(e.response?.data?.message ?? 'Erreur'),
  })

  const openEdit = (cat: ExpenseCategory) => {
    setEditCat(cat)
    setForm({
      name: cat.name,
      default_charge_account_id: cat.default_charge_account_id ?? '',
      is_vat_deductible: cat.is_vat_deductible,
      color: cat.color,
    })
    setShowForm(true)
  }

  const COLORS = ['gray','indigo','violet','yellow','blue','orange','sky','teal','emerald','purple','red','pink','slate']
  const chargeAccounts = accounts.filter(a => a.class === '6')

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        {categories.length === 0 && (
          <button onClick={() => initMut.mutate()} disabled={initMut.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary-600 transition-colors disabled:opacity-60">
            <RefreshCw size={15} className={initMut.isPending ? 'animate-spin' : ''} />
            Initialiser les catégories par défaut
          </button>
        )}
        <button onClick={() => { setEditCat(null); setForm({ name: '', default_charge_account_id: '', is_vat_deductible: true, color: 'gray' }); setShowForm(!showForm) }}
          className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors">
          <Plus size={15} /> Nouvelle catégorie
        </button>
      </div>

      {showForm && (
        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-4">
          <h3 className="font-semibold text-gray-800">{editCat ? 'Modifier la catégorie' : 'Nouvelle catégorie'}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-500 mb-1.5 block">Nom <span className="text-red-500">*</span></label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="ex: Loyer, Électricité..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1.5 block">Compte de charge par défaut (Classe 6)</label>
              <select value={form.default_charge_account_id}
                onChange={e => setForm(f => ({ ...f, default_charge_account_id: e.target.value ? Number(e.target.value) : '' }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30">
                <option value="">— Aucun compte par défaut —</option>
                {chargeAccounts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
              </select>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.is_vat_deductible} onChange={e => setForm(f => ({ ...f, is_vat_deductible: e.target.checked }))}
                className="w-4 h-4 accent-primary" />
              <span className="text-sm text-gray-700">TVA déductible sur ces dépenses</span>
            </label>
            <div>
              <label className="text-xs text-gray-500 mr-2">Couleur :</label>
              <div className="flex gap-1.5 flex-wrap mt-1">
                {COLORS.map(c => (
                  <button key={c} type="button" onClick={() => setForm(f => ({ ...f, color: c }))}
                    className={`w-6 h-6 rounded-full border-2 transition-all ${COLOR_CLASSES[c]?.split(' ')[0]} ${form.color === c ? 'border-gray-800 scale-110' : 'border-transparent'}`} />
                ))}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => saveMut.mutate()} disabled={!form.name.trim() || saveMut.isPending}
              className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary-600 disabled:opacity-50">
              {saveMut.isPending ? 'Enregistrement…' : editCat ? 'Mettre à jour' : 'Créer'}
            </button>
            <button onClick={() => { setShowForm(false); setEditCat(null) }}
              className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
              Annuler
            </button>
          </div>
        </div>
      )}

      {isLoading && <div className="text-center py-8 text-gray-400">Chargement…</div>}

      {categories.length === 0 && !isLoading && (
        <div className="bg-gray-50 rounded-2xl border border-dashed border-gray-300 p-10 text-center">
          <Tag size={36} className="mx-auto mb-3 text-gray-300" />
          <p className="font-medium text-gray-500">Aucune catégorie</p>
          <p className="text-sm text-gray-400 mt-1">Initialisez les catégories SYSCOHADA ou créez les vôtres.</p>
        </div>
      )}

      {categories.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <th className="px-4 py-3 text-left">Catégorie</th>
                <th className="px-4 py-3 text-left">Compte de charge par défaut</th>
                <th className="px-4 py-3 text-center">TVA déductible</th>
                <th className="px-4 py-3 text-center">Statut</th>
                <th className="px-4 py-3 text-right w-24">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {categories.map(cat => (
                <tr key={cat.id} className={`hover:bg-gray-50 transition-colors ${!cat.is_active ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3">
                    <CategoryBadge category={cat} />
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">
                    {cat.default_charge_account
                      ? `${cat.default_charge_account.code} — ${cat.default_charge_account.name}`
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {cat.is_vat_deductible
                      ? <span className="text-green-600 text-xs font-medium">Oui</span>
                      : <span className="text-gray-400 text-xs">Non</span>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cat.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {cat.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => openEdit(cat)}
                        className="text-gray-400 hover:text-primary transition-colors p-1">
                        <Edit2 size={14} />
                      </button>
                      <button onClick={() => { if (confirm(`Supprimer la catégorie "${cat.name}" ?`)) deleteMut.mutate(cat.id) }}
                        className="text-gray-400 hover:text-red-500 transition-colors p-1">
                        <X size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type PageTab = 'list' | 'categories'

export default function ExpensesPage() {
  const qc = useQueryClient()

  const [tab,          setTab]          = useState<PageTab>('list')
  const [dateFrom,     setDateFrom]     = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10))
  const [dateTo,       setDateTo]       = useState(new Date().toISOString().slice(0, 10))
  const [filterStatus, setFilterStatus] = useState('')
  const [filterCat,    setFilterCat]    = useState('')
  const [filterPm,     setFilterPm]     = useState('')
  const [search,       setSearch]       = useState('')
  const [page,         setPage]         = useState(1)

  // Modals
  const [showForm,    setShowForm]    = useState(false)
  const [editExpense, setEditExpense] = useState<Expense | null>(null)
  const [detailId,    setDetailId]    = useState<number | null>(null)
  const [cancelExp,   setCancelExp]   = useState<Expense | null>(null)

  const { data: categories = [] } = useQuery<ExpenseCategory[]>({
    queryKey: ['expense-categories'],
    queryFn: () => api.get('/expense-categories').then(r => r.data),
  })

  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: ['accounting-accounts'],
    queryFn: () => api.get('/accounting/accounts').then(r => r.data),
    staleTime: 120_000,
  })

  const { data, isLoading } = useQuery({
    queryKey: ['expenses', page, dateFrom, dateTo, filterStatus, filterCat, filterPm, search],
    queryFn: () => api.get('/expenses', {
      params: {
        page, per_page: 25,
        date_from:      dateFrom,
        date_to:        dateTo,
        status:         filterStatus || undefined,
        category_id:    filterCat || undefined,
        payment_method: filterPm || undefined,
        search:         search || undefined,
      },
    }).then(r => r.data),
  })

  const expenses: Expense[] = data?.data ?? []
  const meta = data?.meta ?? {}

  const validateMut = useMutation({
    mutationFn: (id: number) => api.post(`/expenses/${id}/validate`),
    onSuccess: () => {
      toast.success('Dépense validée — écriture comptable créée')
      qc.invalidateQueries({ queryKey: ['expenses'] })
      qc.invalidateQueries({ queryKey: ['expense-stats'] })
    },
    onError: (e: { response?: { data?: { message?: string } } }) =>
      toast.error(e.response?.data?.message ?? 'Erreur'),
  })

  const openNew = () => { setEditExpense(null); setShowForm(true) }
  const openEdit = (exp: Expense) => { setEditExpense(exp); setShowForm(true) }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Receipt size={24} className="text-red-500" /> Gestion des Dépenses
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Saisie, validation et imputation comptable des charges</p>
        </div>
        <button onClick={openNew}
          className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary-600 transition-colors shadow-sm">
          <Plus size={16} /> Nouvelle dépense
        </button>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {([
          { id: 'list' as const,       label: 'Dépenses',      icon: <Receipt size={14} /> },
          { id: 'categories' as const, label: 'Catégories',    icon: <Tag size={14} /> },
        ]).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t.id ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab: Liste ── */}
      {tab === 'list' && (
        <>
          {/* Stats */}
          <StatsRow from={dateFrom} to={dateTo} />

          {/* Filters */}
          <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
            <div className="flex flex-wrap gap-3 items-end">
              {/* Date */}
              <div>
                <label className="block text-xs text-gray-500 mb-1">Du</label>
                <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1) }}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Au</label>
                <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1) }}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>

              {/* Catégorie */}
              <div>
                <label className="block text-xs text-gray-500 mb-1">Catégorie</label>
                <select value={filterCat} onChange={e => { setFilterCat(e.target.value); setPage(1) }}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30">
                  <option value="">Toutes</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              {/* Statut */}
              <div>
                <label className="block text-xs text-gray-500 mb-1">Statut</label>
                <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1) }}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30">
                  <option value="">Tous</option>
                  <option value="draft">Brouillons</option>
                  <option value="validated">Validées</option>
                  <option value="cancelled">Annulées</option>
                </select>
              </div>

              {/* Mode paiement */}
              <div>
                <label className="block text-xs text-gray-500 mb-1">Mode de paiement</label>
                <select value={filterPm} onChange={e => { setFilterPm(e.target.value); setPage(1) }}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30">
                  <option value="">Tous</option>
                  {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>

              {/* Recherche */}
              <div className="flex-1 min-w-48">
                <label className="block text-xs text-gray-500 mb-1">Recherche</label>
                <div className="relative">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input type="text" value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
                    placeholder="Référence, description, bénéficiaire…"
                    className="w-full border border-gray-300 rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                </div>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="px-4 py-3 text-left">Référence</th>
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-left">Catégorie</th>
                  <th className="px-4 py-3 text-left">Description / Bénéficiaire</th>
                  <th className="px-4 py-3 text-left">Compte charge</th>
                  <th className="px-4 py-3 text-center">Mode</th>
                  <th className="px-4 py-3 text-right">Montant TTC</th>
                  <th className="px-4 py-3 text-center">Statut</th>
                  <th className="px-4 py-3 text-center w-28">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr><td colSpan={9} className="py-16 text-center">
                    <div className="inline-block w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  </td></tr>
                )}
                {!isLoading && expenses.length === 0 && (
                  <tr><td colSpan={9} className="py-16 text-center text-gray-400">
                    <Receipt size={32} className="mx-auto mb-2 opacity-30" />
                    Aucune dépense trouvée pour cette période.
                  </td></tr>
                )}
                {expenses.map(exp => (
                  <tr key={exp.id}
                    onClick={() => setDetailId(exp.id)}
                    className={`border-b border-gray-100 cursor-pointer transition-colors ${
                      exp.status === 'cancelled' ? 'bg-red-50/30 hover:bg-red-50/60' : 'hover:bg-blue-50/30'
                    }`}>
                    <td className="px-4 py-3">
                      <span className={`font-mono text-xs px-2 py-0.5 rounded ${
                        exp.status === 'cancelled' ? 'bg-red-100 text-red-700 line-through' : 'bg-gray-100 text-gray-600'
                      }`}>{exp.reference}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">
                      {new Date(exp.expense_date).toLocaleDateString('fr-FR')}
                    </td>
                    <td className="px-4 py-3">
                      <CategoryBadge category={exp.category} />
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      <p className="font-medium text-gray-800 truncate">{exp.description}</p>
                      {exp.beneficiary && <p className="text-xs text-gray-400 truncate">{exp.beneficiary}</p>}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">
                      {exp.charge_account ? `${exp.charge_account.code}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <PmBadge method={exp.payment_method} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-semibold ${exp.status === 'cancelled' ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                        {formatCurrency(exp.amount_ttc)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge status={exp.status} />
                    </td>
                    <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => setDetailId(exp.id)} title="Voir le détail"
                          className="text-gray-400 hover:text-primary p-1.5 rounded-lg hover:bg-primary/5 transition-colors">
                          <Eye size={14} />
                        </button>
                        {exp.status === 'draft' && (
                          <>
                            <button onClick={() => openEdit(exp)} title="Modifier"
                              className="text-gray-400 hover:text-amber-600 p-1.5 rounded-lg hover:bg-amber-50 transition-colors">
                              <Edit2 size={14} />
                            </button>
                            <button onClick={() => validateMut.mutate(exp.id)} disabled={validateMut.isPending}
                              title="Valider"
                              className="text-gray-400 hover:text-green-600 p-1.5 rounded-lg hover:bg-green-50 transition-colors">
                              <CheckCircle size={14} />
                            </button>
                            <button onClick={() => setCancelExp(exp)} title="Annuler"
                              className="text-gray-400 hover:text-red-600 p-1.5 rounded-lg hover:bg-red-50 transition-colors">
                              <Ban size={14} />
                            </button>
                          </>
                        )}
                        {exp.status === 'validated' && (
                          <button onClick={() => setCancelExp(exp)} title="Annuler & extourner"
                            className="text-gray-400 hover:text-red-600 p-1.5 rounded-lg hover:bg-red-50 transition-colors">
                            <Ban size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {meta.last_page > 1 && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 bg-gray-50">
                <span className="text-xs text-gray-500">{meta.from}–{meta.to} sur {meta.total} dépenses</span>
                <div className="flex gap-1">
                  <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
                    className="px-3 py-1.5 text-xs border rounded-lg disabled:opacity-40 hover:bg-white transition-colors">
                    Précédent
                  </button>
                  <button disabled={page === meta.last_page} onClick={() => setPage(p => p + 1)}
                    className="px-3 py-1.5 text-xs border rounded-lg disabled:opacity-40 hover:bg-white transition-colors">
                    Suivant
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Tab: Catégories ── */}
      {tab === 'categories' && (
        <CategoriesManager accounts={accounts} />
      )}

      {/* ── Modals ── */}
      {showForm && (
        <ExpenseForm
          editExpense={editExpense}
          categories={categories}
          accounts={accounts}
          onClose={() => { setShowForm(false); setEditExpense(null) }}
        />
      )}

      {detailId !== null && (
        <DetailModal
          expenseId={detailId}
          onClose={() => setDetailId(null)}
          onEdit={(exp) => { setDetailId(null); openEdit(exp) }}
          onCancel={(exp) => { setDetailId(null); setCancelExp(exp) }}
        />
      )}

      {cancelExp && (
        <CancelModal
          expense={cancelExp}
          onClose={() => setCancelExp(null)}
        />
      )}
    </div>
  )
}
