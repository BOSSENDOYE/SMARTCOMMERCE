import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Edit2, Trash2, Check, X, PackageCheck } from 'lucide-react'
import axios from 'axios'
import toast from 'react-hot-toast'

const API_URL = import.meta.env.VITE_API_URL || ''
function saApi() {
  const token = localStorage.getItem('sc_superadmin_token')
  return axios.create({
    baseURL: API_URL ? `${API_URL}/api/v1/superadmin` : '/api/v1/superadmin',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' },
  })
}

const ALL_FEATURES = [
  { key: 'pos',               label: 'Point de vente (POS)' },
  { key: 'inventory',         label: 'Stock & Inventaire' },
  { key: 'purchasing',        label: 'Achats / Fournisseurs' },
  { key: 'invoicing',         label: 'Facturation & Devis' },
  { key: 'crm',               label: 'CRM Pipeline' },
  { key: 'restaurant',        label: 'Module Restaurant' },
  { key: 'accounting',        label: 'Comptabilité SYSCOHADA' },
  { key: 'loyalty',           label: 'Fidélité clients' },
  { key: 'multi_store',       label: 'Multi-magasins' },
  { key: 'offline_sync',      label: 'Sync hors-ligne (PWA)' },
  { key: 'advanced_reports',  label: 'Rapports avancés' },
  { key: 'api_access',        label: 'API / Webhooks' },
  { key: 'sms_notifications', label: 'SMS / WhatsApp' },
  { key: 'mobile_pos',        label: 'POS Mobile' },
]

interface Plan {
  id: number
  name: string
  slug: string
  description: string | null
  max_stores: number | null
  max_users: number | null
  price_monthly: number
  price_quarterly: number
  price_yearly: number
  trial_days: number
  features: string[]
  is_active: boolean
}

const empty: Omit<Plan, 'id'> = {
  name: '', slug: '', description: '', max_stores: 1, max_users: 5,
  price_monthly: 0, price_quarterly: 0, price_yearly: 0, trial_days: 14,
  features: ['pos', 'inventory', 'loyalty', 'offline_sync'],
  is_active: true,
}

export default function PlansPage() {
  const qc = useQueryClient()
  const [modal, setModal] = useState<{ open: boolean; plan: Partial<Plan> }>({ open: false, plan: empty })

  const { data: plans = [], isLoading } = useQuery<Plan[]>({
    queryKey: ['sa-plans'],
    queryFn: () => saApi().get('/subscription-plans').then(r => r.data),
  })

  const saveMutation = useMutation({
    mutationFn: (p: Partial<Plan>) => p.id
      ? saApi().put(`/subscription-plans/${p.id}`, p).then(r => r.data)
      : saApi().post('/subscription-plans', p).then(r => r.data),
    onSuccess: () => { toast.success('Plan sauvegardé'); qc.invalidateQueries({ queryKey: ['sa-plans'] }); setModal({ open: false, plan: empty }) },
    onError:   () => toast.error('Erreur lors de la sauvegarde'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => saApi().delete(`/subscription-plans/${id}`),
    onSuccess: () => { toast.success('Plan supprimé'); qc.invalidateQueries({ queryKey: ['sa-plans'] }) },
    onError:   () => toast.error('Impossible de supprimer ce plan'),
  })

  function toggleFeature(key: string) {
    const features = modal.plan.features ?? []
    setModal(m => ({
      ...m,
      plan: {
        ...m.plan,
        features: features.includes(key) ? features.filter(f => f !== key) : [...features, key],
      },
    }))
  }

  const p = modal.plan

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Plans d'abonnement</h1>
          <p className="text-gray-400 text-sm">Configurez les offres proposées aux clients</p>
        </div>
        <button
          onClick={() => setModal({ open: true, plan: empty })}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm text-white transition"
        >
          <Plus className="w-4 h-4" /> Nouveau plan
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {plans.map(plan => (
            <div key={plan.id} className={`bg-gray-900 border rounded-xl p-5 space-y-3 ${plan.is_active ? 'border-gray-800' : 'border-gray-800 opacity-60'}`}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-bold text-white">{plan.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{plan.description}</p>
                </div>
                <PackageCheck className="w-5 h-5 text-indigo-400 shrink-0" />
              </div>
              <div className="text-sm space-y-1 text-gray-400">
                <p>Magasins : <span className="text-white">{plan.max_stores ?? '∞'}</span></p>
                <p>Utilisateurs : <span className="text-white">{plan.max_users ?? '∞'}</span></p>
                <p>Essai : <span className="text-white">{plan.trial_days} jours</span></p>
              </div>
              <div className="border-t border-gray-800 pt-2 space-y-0.5">
                <p className="text-xs text-gray-500 font-medium mb-1">Tarifs</p>
                <div className="text-xs text-gray-300">
                  <span className="text-gray-500">Mensuel</span> {plan.price_monthly.toLocaleString('fr-FR')} FCFA
                </div>
                <div className="text-xs text-gray-300">
                  <span className="text-gray-500">Trimestriel</span> {plan.price_quarterly.toLocaleString('fr-FR')} FCFA
                </div>
                <div className="text-xs text-gray-300">
                  <span className="text-gray-500">Annuel</span> {plan.price_yearly.toLocaleString('fr-FR')} FCFA
                </div>
              </div>
              <div className="flex flex-wrap gap-1 pt-1">
                {plan.features.slice(0, 5).map(f => (
                  <span key={f} className="bg-indigo-900/40 text-indigo-300 text-xs px-2 py-0.5 rounded-full">
                    {ALL_FEATURES.find(a => a.key === f)?.label ?? f}
                  </span>
                ))}
                {plan.features.length > 5 && (
                  <span className="text-xs text-gray-500">+{plan.features.length - 5}</span>
                )}
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button onClick={() => setModal({ open: true, plan: { ...plan } })} className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition">
                  <Edit2 className="w-4 h-4" />
                </button>
                <button onClick={() => deleteMutation.mutate(plan.id)} className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-900/20 rounded-lg transition">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal.open && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-lg my-4 p-6 space-y-4">
            <h2 className="text-lg font-bold text-white">{p.id ? 'Modifier le plan' : 'Nouveau plan'}</h2>

            <div className="grid grid-cols-2 gap-3">
              {([
                ['name', 'Nom du plan', 'text'],
                ['slug', 'Slug (identifiant)', 'text'],
                ['max_stores', 'Max magasins', 'number'],
                ['max_users', 'Max utilisateurs', 'number'],
                ['trial_days', 'Jours d\'essai', 'number'],
                ['price_monthly', 'Prix mensuel (FCFA)', 'number'],
                ['price_quarterly', 'Prix trimestriel (FCFA)', 'number'],
                ['price_yearly', 'Prix annuel (FCFA)', 'number'],
              ] as [keyof Plan, string, string][]).map(([field, label, type]) => (
                <div key={field}>
                  <label className="block text-xs text-gray-400 mb-1">{label}</label>
                  <input
                    type={type}
                    value={(p[field] as string | number) ?? ''}
                    onChange={e => setModal(m => ({ ...m, plan: { ...m.plan, [field]: type === 'number' ? Number(e.target.value) : e.target.value } }))}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              ))}
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-2">Fonctionnalités incluses</label>
              <div className="grid grid-cols-2 gap-1.5">
                {ALL_FEATURES.map(f => {
                  const active = (p.features ?? []).includes(f.key)
                  return (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => toggleFeature(f.key)}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition border ${
                        active ? 'bg-indigo-600/20 border-indigo-500/50 text-indigo-300' : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'
                      }`}
                    >
                      {active ? <Check className="w-3 h-3 shrink-0" /> : <X className="w-3 h-3 shrink-0 opacity-30" />}
                      {f.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is_active"
                checked={p.is_active ?? true}
                onChange={e => setModal(m => ({ ...m, plan: { ...m.plan, is_active: e.target.checked } }))}
                className="rounded"
              />
              <label htmlFor="is_active" className="text-sm text-gray-300">Plan actif (visible aux clients)</label>
            </div>

            <div className="flex justify-end gap-2">
              <button onClick={() => setModal({ open: false, plan: empty })} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm text-gray-300 transition">
                Annuler
              </button>
              <button
                onClick={() => saveMutation.mutate(p)}
                disabled={saveMutation.isPending}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm text-white transition disabled:opacity-50"
              >
                {saveMutation.isPending ? 'Sauvegarde...' : 'Sauvegarder'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
