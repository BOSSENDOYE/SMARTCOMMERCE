import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, Building2, CheckCircle, XCircle, Clock, AlertCircle, ChevronRight } from 'lucide-react'
import axios from 'axios'
import toast from 'react-hot-toast'

const API_URL = import.meta.env.VITE_API_URL || ''
function saApi() {
  const token = localStorage.getItem('sc_superadmin_token')
  return axios.create({
    baseURL: API_URL ? `${API_URL}/api/v1/superadmin` : '/api/v1/superadmin',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  })
}

type SubStatus = 'trial' | 'active' | 'suspended' | 'expired' | 'cancelled'

const statusCfg: Record<SubStatus, { label: string; color: string; icon: React.ElementType }> = {
  trial:     { label: 'Essai',    color: 'text-blue-400 bg-blue-500/10 border-blue-500/30',     icon: Clock },
  active:    { label: 'Actif',    color: 'text-green-400 bg-green-500/10 border-green-500/30',   icon: CheckCircle },
  suspended: { label: 'Suspendu', color: 'text-amber-400 bg-amber-500/10 border-amber-500/30',   icon: AlertCircle },
  expired:   { label: 'Expiré',   color: 'text-red-400 bg-red-500/10 border-red-500/30',         icon: XCircle },
  cancelled: { label: 'Résilié',  color: 'text-gray-400 bg-gray-500/10 border-gray-500/30',      icon: XCircle },
}

interface Tenant {
  id: number
  name: string
  email: string
  phone: string
  city: string
  country: string
  stores_count: number
  users_count: number
  subscription: {
    status: SubStatus
    plan_name: string
    ends_at: string
    billing_cycle: string
  } | null
  created_at: string
}

export default function TenantsPage() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<SubStatus | 'all'>('all')
  const [selected, setSelected] = useState<Tenant | null>(null)

  const { data: tenants = [], isLoading } = useQuery<Tenant[]>({
    queryKey: ['sa-tenants', statusFilter],
    queryFn: () => saApi().get(`/tenants?status=${statusFilter}`).then(r => r.data),
  })

  const actionMutation = useMutation({
    mutationFn: ({ id, action }: { id: number; action: string }) =>
      saApi().post(`/tenants/${id}/${action}`),
    onSuccess: (_, { action }) => {
      toast.success(`Tenant ${action === 'suspend' ? 'suspendu' : 'réactivé'}`)
      qc.invalidateQueries({ queryKey: ['sa-tenants'] })
      setSelected(null)
    },
    onError: () => toast.error('Action impossible'),
  })

  const filtered = tenants.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.email.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-white">Tenants</h1>
        <p className="text-gray-400 text-sm">Toutes les organisations clientes</p>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher..."
            className="w-full pl-9 pr-3 py-2 bg-gray-900 border border-gray-800 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
          />
        </div>
        <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-lg p-1">
          {(['all', 'trial', 'active', 'suspended', 'expired'] as const).map(f => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${statusFilter === f ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'}`}
            >
              {f === 'all' ? 'Tous' : statusCfg[f]?.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-400 text-xs">
                <th className="text-left px-4 py-3 font-medium">Organisation</th>
                <th className="text-left px-4 py-3 font-medium">Plan</th>
                <th className="text-left px-4 py-3 font-medium">Statut</th>
                <th className="text-left px-4 py-3 font-medium">Expiration</th>
                <th className="text-left px-4 py-3 font-medium">Magasins</th>
                <th className="text-left px-4 py-3 font-medium">Users</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map(t => {
                const sub = t.subscription
                const cfg = sub ? statusCfg[sub.status] : null
                const Icon = cfg?.icon ?? Building2
                return (
                  <tr key={t.id} className="border-b border-gray-800/50 hover:bg-gray-800/40 transition">
                    <td className="px-4 py-3">
                      <p className="font-medium text-white">{t.name}</p>
                      <p className="text-xs text-gray-500">{t.email}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-300">{sub?.plan_name ?? '—'}</td>
                    <td className="px-4 py-3">
                      {cfg && (
                        <span className={`inline-flex items-center gap-1 border px-2 py-0.5 rounded-full text-xs ${cfg.color}`}>
                          <Icon className="w-3 h-3" />
                          {cfg.label}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {sub?.ends_at ? new Date(sub.ends_at).toLocaleDateString('fr-FR') : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-300">{t.stores_count}</td>
                    <td className="px-4 py-3 text-gray-300">{t.users_count}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => setSelected(t)} className="text-gray-400 hover:text-white">
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="text-center py-12 text-gray-500">Aucun tenant trouvé</div>
          )}
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-indigo-700 rounded-xl flex items-center justify-center shrink-0">
                <Building2 className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">{selected.name}</h2>
                <p className="text-sm text-gray-400">{selected.email} · {selected.city}</p>
              </div>
            </div>
            <div className="space-y-1 text-sm">
              {[
                ['Plan',       selected.subscription?.plan_name ?? '—'],
                ['Statut',     selected.subscription ? statusCfg[selected.subscription.status]?.label : '—'],
                ['Expiration', selected.subscription?.ends_at ? new Date(selected.subscription.ends_at).toLocaleDateString('fr-FR') : '—'],
                ['Cycle',      selected.subscription?.billing_cycle ?? '—'],
                ['Magasins',   String(selected.stores_count)],
                ['Utilisateurs', String(selected.users_count)],
                ['Inscrit le', new Date(selected.created_at).toLocaleDateString('fr-FR')],
              ].map(([k, v]) => (
                <div key={k} className="flex gap-2">
                  <span className="text-gray-500 w-24 shrink-0">{k}</span>
                  <span className="text-gray-200">{v}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setSelected(null)} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm text-gray-300 transition">Fermer</button>
              {selected.subscription?.status === 'active' && (
                <button onClick={() => actionMutation.mutate({ id: selected.id, action: 'suspend' })} className="px-4 py-2 bg-amber-700 hover:bg-amber-600 rounded-lg text-sm text-white transition">
                  Suspendre
                </button>
              )}
              {selected.subscription?.status === 'suspended' && (
                <button onClick={() => actionMutation.mutate({ id: selected.id, action: 'reactivate' })} className="px-4 py-2 bg-green-700 hover:bg-green-600 rounded-lg text-sm text-white transition">
                  Réactiver
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
