import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Package, Plus, Pencil, Trash2, Check, X, Loader2, RefreshCw, ToggleLeft, ToggleRight } from 'lucide-react'
import { useSuperAdminStore } from '../../store/superAdmin.store'
import axios from 'axios'
import toast from 'react-hot-toast'

// ── Types ─────────────────────────────────────────────────────────────────────

const ALL_FEATURES = [
  'pos_sales', 'stock_inventory', 'clients_loyalty', 'purchases_suppliers',
  'invoicing_quotes', 'crm_pipeline', 'restaurant_kds', 'accounting_syscohada',
  'multi_stores', 'offline_pwa', 'advanced_reports', 'api_webhooks',
  'sms_whatsapp', 'mobile_money',
] as const

const FEATURE_LABELS: Record<string, string> = {
  pos_sales: 'POS + Ventes',
  stock_inventory: 'Stock / Inventaire',
  clients_loyalty: 'Clients + Fidélité',
  purchases_suppliers: 'Achats / Fournisseurs',
  invoicing_quotes: 'Facturation / Devis',
  crm_pipeline: 'CRM Pipeline',
  restaurant_kds: 'Restaurant / KDS',
  accounting_syscohada: 'Comptabilité SYSCOHADA',
  multi_stores: 'Multi-magasins',
  offline_pwa: 'Sync Offline PWA',
  advanced_reports: 'Rapports avancés',
  api_webhooks: 'API / Webhooks',
  sms_whatsapp: 'SMS / WhatsApp',
  mobile_money: 'Mobile Money (Wave/OM)',
}

interface Plan {
  id: number
  name: string
  slug: string
  description: string | null
  max_stores: number
  max_users: number
  features: string[]
  price_monthly: number
  price_quarterly: number
  price_yearly: number
  trial_days: number
  grace_period_days: number
  is_active: boolean
}

type PlanForm = Omit<Plan, 'id'>

// ── API ───────────────────────────────────────────────────────────────────────

const saApi = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api/v1',
  headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
})
saApi.interceptors.request.use(cfg => {
  const token = useSuperAdminStore.getState().token
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

// ── Form Modal ────────────────────────────────────────────────────────────────

const BLANK_FORM: PlanForm = {
  name: '', slug: '', description: '', max_stores: 1, max_users: 5,
  features: ['pos_sales', 'stock_inventory', 'clients_loyalty', 'offline_pwa', 'mobile_money'],
  price_monthly: 0, price_quarterly: 0, price_yearly: 0,
  trial_days: 14, grace_period_days: 7, is_active: true,
}

function PlanModal({
  plan,
  onClose,
  onSave,
  saving,
}: {
  plan: Plan | null
  onClose: () => void
  onSave: (form: PlanForm) => void
  saving: boolean
}) {
  const [form, setForm] = useState<PlanForm>(plan ? {
    name: plan.name, slug: plan.slug, description: plan.description ?? '',
    max_stores: plan.max_stores, max_users: plan.max_users, features: plan.features,
    price_monthly: plan.price_monthly, price_quarterly: plan.price_quarterly,
    price_yearly: plan.price_yearly, trial_days: plan.trial_days,
    grace_period_days: plan.grace_period_days, is_active: plan.is_active,
  } : BLANK_FORM)

  const toggleFeature = (feat: string) => {
    setForm(f => ({
      ...f,
      features: f.features.includes(feat) ? f.features.filter(x => x !== feat) : [...f.features, feat],
    }))
  }

  const field = (key: keyof PlanForm, label: string, type = 'text', placeholder = '') => (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input
        type={type}
        className="input text-sm"
        placeholder={placeholder}
        value={form[key] as string | number}
        onChange={e => setForm(f => ({ ...f, [key]: type === 'number' ? (parseFloat(e.target.value) || 0) : e.target.value }))}
      />
    </div>
  )

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">{plan ? 'Modifier le plan' : 'Nouveau plan'}</h2>
        </div>

        <div className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            {field('name', 'Nom du plan', 'text', 'Ex: Business')}
            {field('slug', 'Slug (identifiant)', 'text', 'Ex: business')}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
            <textarea className="input resize-none text-sm" rows={2}
              placeholder="Destiné aux PME multi-sites..."
              value={form.description ?? ''}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {field('max_stores', 'Max magasins (-1 = illimité)', 'number')}
            {field('max_users', 'Max utilisateurs (-1 = illimité)', 'number')}
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-2">Fonctionnalités incluses</label>
            <div className="grid grid-cols-2 gap-2">
              {ALL_FEATURES.map(feat => (
                <label key={feat}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer border text-sm transition-colors ${
                    form.features.includes(feat)
                      ? 'bg-primary/10 border-primary/30 text-primary'
                      : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <input type="checkbox" className="sr-only" checked={form.features.includes(feat)} onChange={() => toggleFeature(feat)} />
                  {form.features.includes(feat) ? <Check size={12} /> : <X size={12} className="opacity-40" />}
                  <span>{FEATURE_LABELS[feat]}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-xs font-semibold text-gray-600 mb-2">Tarification (FCFA)</h3>
            <div className="grid grid-cols-3 gap-4">
              {field('price_monthly', 'Prix mensuel', 'number', '0')}
              {field('price_quarterly', 'Prix trimestriel', 'number', '0')}
              {field('price_yearly', 'Prix annuel', 'number', '0')}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            {field('trial_days', "Jours d'essai gratuit", 'number', '14')}
            {field('grace_period_days', 'Jours de grâce', 'number', '7')}
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <span className="text-xs font-medium text-gray-600">Plan actif</span>
                <button type="button" onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.is_active ? 'bg-green-500' : 'bg-gray-300'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${form.is_active ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </label>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-gray-100 flex justify-end gap-3">
          <button onClick={onClose} className="btn-secondary text-sm">Annuler</button>
          <button onClick={() => onSave(form)} disabled={saving || !form.name || !form.slug}
            className="bg-primary hover:bg-primary-600 disabled:bg-primary-300 text-white font-semibold px-5 py-2.5 rounded-lg text-sm transition-colors flex items-center gap-2"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            {plan ? 'Enregistrer' : 'Créer le plan'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function PlansPage() {
  const qc = useQueryClient()
  const [modal, setModal] = useState<Plan | null | 'new'>(null)

  const { data: plans = [], isLoading, refetch } = useQuery<Plan[]>({
    queryKey: ['sa-plans'],
    queryFn: async () => {
      const res = await saApi.get('/superadmin/plans')
      return res.data.data ?? res.data
    },
  })

  const createMutation = useMutation({
    mutationFn: async (form: PlanForm) => { await saApi.post('/superadmin/plans', form) },
    onSuccess: () => { toast.success('Plan créé !'); qc.invalidateQueries({ queryKey: ['sa-plans'] }); setModal(null) },
    onError: () => toast.error('Erreur lors de la création'),
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, form }: { id: number; form: PlanForm }) => { await saApi.put(`/superadmin/plans/${id}`, form) },
    onSuccess: () => { toast.success('Plan mis à jour !'); qc.invalidateQueries({ queryKey: ['sa-plans'] }); setModal(null) },
    onError: () => toast.error('Erreur lors de la mise à jour'),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => { await saApi.delete(`/superadmin/plans/${id}`) },
    onSuccess: () => { toast.success('Plan supprimé'); qc.invalidateQueries({ queryKey: ['sa-plans'] }) },
    onError: () => toast.error('Erreur lors de la suppression'),
  })

  const handleSave = (form: PlanForm) => {
    if (modal === 'new') { createMutation.mutate(form) }
    else if (modal && typeof modal === 'object') { updateMutation.mutate({ id: modal.id, form }) }
  }

  const handleDelete = (plan: Plan) => {
    if (confirm(`Supprimer le plan "${plan.name}" ? Cette action est irréversible.`)) {
      deleteMutation.mutate(plan.id)
    }
  }

  const formatXOF = (n: number) => n > 0 ? new Intl.NumberFormat('fr-SN', { style: 'currency', currency: 'XOF', maximumFractionDigits: 0 }).format(n) : '—'

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Package size={22} className="text-primary" /> Plans & Tarifs
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Configurez les plans d'abonnement proposés aux clients</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => refetch()} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 bg-white border border-gray-200 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors">
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => setModal('new')}
            className="flex items-center gap-2 bg-primary hover:bg-primary-600 text-white font-semibold px-4 py-2 rounded-lg text-sm transition-colors"
          >
            <Plus size={16} /> Nouveau plan
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16"><Loader2 size={24} className="animate-spin text-primary" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {plans.map(plan => (
            <div key={plan.id} className={`bg-white rounded-xl border-2 shadow-sm p-5 ${plan.is_active ? 'border-gray-200' : 'border-dashed border-gray-300 opacity-60'}`}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-gray-900">{plan.name}</h3>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${plan.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {plan.is_active ? 'Actif' : 'Inactif'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5 font-mono">{plan.slug}</p>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => setModal(plan)} className="p-1.5 text-gray-400 hover:text-brand hover:bg-gray-100 rounded-lg transition-colors">
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => handleDelete(plan)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {plan.description && <p className="text-xs text-gray-500 mb-3">{plan.description}</p>}

              <div className="space-y-1.5 mb-4">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Mensuel</span>
                  <span className="font-semibold text-gray-800">{formatXOF(plan.price_monthly)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Trimestriel</span>
                  <span className="font-semibold text-gray-800">{formatXOF(plan.price_quarterly)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Annuel</span>
                  <span className="font-semibold text-gray-800">{formatXOF(plan.price_yearly)}</span>
                </div>
              </div>

              <div className="flex gap-3 text-xs text-gray-500 mb-4 border-t border-gray-100 pt-3">
                <span>{plan.max_stores === -1 ? '∞ magasins' : `${plan.max_stores} mag.`}</span>
                <span>·</span>
                <span>{plan.max_users === -1 ? '∞ users' : `${plan.max_users} users`}</span>
                <span>·</span>
                <span>{plan.trial_days}j essai</span>
              </div>

              <div className="flex flex-wrap gap-1">
                {plan.features.map(feat => (
                  <span key={feat} className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-medium">
                    {FEATURE_LABELS[feat] ?? feat}
                  </span>
                ))}
              </div>
            </div>
          ))}

          {plans.length === 0 && (
            <div className="col-span-3 text-center py-16 text-gray-400">
              <Package size={40} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">Aucun plan configuré. Créez votre premier plan.</p>
            </div>
          )}
        </div>
      )}

      {modal !== null && (
        <PlanModal
          plan={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
          onSave={handleSave}
          saving={createMutation.isPending || updateMutation.isPending}
        />
      )}
    </div>
  )
}
