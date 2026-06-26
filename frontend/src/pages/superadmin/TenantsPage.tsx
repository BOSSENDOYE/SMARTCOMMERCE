import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Building2, Search, Eye, CheckCircle, XCircle,
  RefreshCw, Users, Store, RotateCcw, Ban, LogIn,
  PlusCircle, X, AlertTriangle
} from 'lucide-react'
import { useSuperAdminStore } from '../../store/superAdmin.store'
import { useAuthStore } from '../../store/auth.store'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import toast from 'react-hot-toast'

// ── Shared SA axios instance ──────────────────────────────────────────────────

const saApi = axios.create({
  baseURL: (import.meta.env.VITE_API_URL ?? 'http://localhost:8000') + '/api/v1',
  headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
})
saApi.interceptors.request.use(cfg => {
  const token = useSuperAdminStore.getState().token
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

// ── Types ─────────────────────────────────────────────────────────────────────

interface Tenant {
  id: number
  name: string
  slug: string
  email: string | null
  phone: string | null
  city: string | null
  country: string | null
  is_active: boolean
  stores_count: number
  users_count: number
  subscription: {
    plan_name: string
    plan_slug: string
    status: 'trial' | 'active' | 'suspended' | 'expired' | 'cancelled'
    starts_at: string
    ends_at: string
    grace_ends_at: string | null
  } | null
  created_at: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const SUB_STATUS: Record<string, { label: string; color: string }> = {
  trial:     { label: 'Essai',    color: 'bg-blue-100 text-blue-700' },
  active:    { label: 'Actif',    color: 'bg-green-100 text-green-700' },
  suspended: { label: 'Suspendu', color: 'bg-orange-100 text-orange-700' },
  expired:   { label: 'Expiré',  color: 'bg-red-100 text-red-700' },
  cancelled: { label: 'Résilié', color: 'bg-gray-100 text-gray-600' },
}

function daysUntil(d: string) {
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86_400_000)
}

// ── Extend modal ──────────────────────────────────────────────────────────────

function ExtendModal({ tenant, onClose, onExtend }: {
  tenant: Tenant
  onClose: () => void
  onExtend: (id: number, days: number) => void
}) {
  const [days, setDays] = useState(30)
  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">Prolonger la licence</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400"><X size={16} /></button>
        </div>
        <p className="text-sm text-gray-500 mb-5 font-medium">{tenant.name}</p>
        <div className="mb-5">
          <label className="block text-sm font-medium text-gray-700 mb-2">Jours à ajouter</label>
          <div className="flex gap-2 mb-3">
            {[7, 15, 30, 90].map(d => (
              <button key={d} onClick={() => setDays(d)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${days === d ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >{d}j</button>
            ))}
          </div>
          <input type="number" className="input" min={1} max={365} value={days}
            onChange={e => setDays(Math.max(1, parseInt(e.target.value) || 1))}
          />
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">Annuler</button>
          <button onClick={() => onExtend(tenant.id, days)}
            className="flex-1 bg-primary hover:bg-primary-600 text-white font-semibold py-2.5 rounded-lg text-sm flex items-center justify-center gap-2"
          >
            <PlusCircle size={14} /> +{days} jours
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Tenant Detail Panel ───────────────────────────────────────────────────────

function TenantPanel({ tenant, onClose, onActivate, onSuspend, onExtend, onImpersonate }: {
  tenant: Tenant
  onClose: () => void
  onActivate: () => void
  onSuspend: () => void
  onExtend: () => void
  onImpersonate: () => void
}) {
  const sub = tenant.subscription
  const days = sub ? daysUntil(sub.ends_at) : null

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="p-6 border-b border-gray-100 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{tenant.name}</h2>
            <p className="text-sm text-gray-400 font-mono mt-0.5">/{tenant.slug}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${tenant.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
              {tenant.is_active ? '● Actif' : '● Inactif'}
            </span>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X size={16} /></button>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* Info */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-400 uppercase">Informations</p>
              {tenant.email && <p className="text-gray-700">{tenant.email}</p>}
              {tenant.phone && <p className="text-gray-700">{tenant.phone}</p>}
              {tenant.city && <p className="text-gray-700">{tenant.city}, {tenant.country}</p>}
              <p className="text-xs text-gray-400">Créé le {new Date(tenant.created_at).toLocaleDateString('fr-FR')}</p>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-400 uppercase">Utilisation</p>
              <div className="flex items-center gap-2 text-gray-700"><Store size={14} className="text-gray-400" /> {tenant.stores_count} magasin(s)</div>
              <div className="flex items-center gap-2 text-gray-700"><Users size={14} className="text-gray-400" /> {tenant.users_count} utilisateur(s)</div>
            </div>
          </div>

          {/* Subscription */}
          {sub && (
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase mb-3">Abonnement</p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-gray-400">Plan</p>
                  <p className="font-semibold text-brand mt-0.5">{sub.plan_name}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Statut</p>
                  <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full mt-0.5 ${SUB_STATUS[sub.status]?.color}`}>
                    {SUB_STATUS[sub.status]?.label}
                  </span>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Début</p>
                  <p className="mt-0.5">{new Date(sub.starts_at).toLocaleDateString('fr-FR')}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Expiration</p>
                  <p className={`font-semibold mt-0.5 ${days !== null && days < 7 ? 'text-red-600' : days !== null && days < 30 ? 'text-amber-600' : 'text-gray-700'}`}>
                    {new Date(sub.ends_at).toLocaleDateString('fr-FR')}
                    {days !== null && <span className="text-xs font-normal ml-1">({days > 0 ? `J-${days}` : 'Expiré'})</span>}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs font-semibold text-gray-400 uppercase mb-3">Actions</p>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={onActivate}
                className="flex items-center justify-center gap-2 py-2.5 text-sm font-medium bg-green-50 hover:bg-green-100 text-green-700 rounded-lg transition-colors"
              ><CheckCircle size={14} /> Activer</button>
              <button onClick={onSuspend}
                className="flex items-center justify-center gap-2 py-2.5 text-sm font-medium bg-orange-50 hover:bg-orange-100 text-orange-700 rounded-lg transition-colors"
              ><Ban size={14} /> Suspendre</button>
              <button onClick={onExtend}
                className="flex items-center justify-center gap-2 py-2.5 text-sm font-medium bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg transition-colors"
              ><RotateCcw size={14} /> Prolonger</button>
              <button onClick={onImpersonate}
                className="flex items-center justify-center gap-2 py-2.5 text-sm font-medium bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-lg transition-colors"
              ><LogIn size={14} /> Se connecter</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function TenantsPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const setAuth = useAuthStore(s => s.setAuth)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [selected, setSelected] = useState<Tenant | null>(null)
  const [extendTarget, setExtendTarget] = useState<Tenant | null>(null)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['sa-tenants'],
    queryFn: () => saApi.get('/superadmin/tenants').then(r => r.data),
  })

  const tenants: Tenant[] = data?.data ?? data ?? []

  // Stats
  const stats = {
    total: tenants.length,
    active: tenants.filter(t => t.subscription?.status === 'active').length,
    trial: tenants.filter(t => t.subscription?.status === 'trial').length,
    expired: tenants.filter(t => t.subscription?.status === 'expired').length,
    suspended: tenants.filter(t => t.subscription?.status === 'suspended').length,
  }

  const activateMutation = useMutation({
    mutationFn: (id: number) => saApi.post(`/superadmin/tenants/${id}/activate`),
    onSuccess: () => { toast.success('Organisation activée'); qc.invalidateQueries({ queryKey: ['sa-tenants'] }); setSelected(null) },
    onError: () => toast.error("Erreur lors de l'activation"),
  })

  const suspendMutation = useMutation({
    mutationFn: (id: number) => saApi.post(`/superadmin/tenants/${id}/suspend`),
    onSuccess: () => { toast.success('Organisation suspendue'); qc.invalidateQueries({ queryKey: ['sa-tenants'] }); setSelected(null) },
    onError: () => toast.error("Erreur lors de la suspension"),
  })

  const extendMutation = useMutation({
    mutationFn: ({ id, days }: { id: number; days: number }) =>
      saApi.post(`/superadmin/tenants/${id}/extend`, { days }),
    onSuccess: () => {
      toast.success('Licence prolongée')
      qc.invalidateQueries({ queryKey: ['sa-tenants'] })
      setExtendTarget(null)
      setSelected(null)
    },
    onError: () => toast.error('Erreur lors de la prolongation'),
  })

  const impersonateMutation = useMutation({
    mutationFn: (id: number) => saApi.post(`/superadmin/tenants/${id}/impersonate`).then(r => r.data),
    onSuccess: (data) => {
      setAuth(data.user, data.token)
      setSelected(null)
      toast.success(`Connecté en tant que ${data.user.name}`)
      navigate('/dashboard')
    },
    onError: () => toast.error("Impossible de se connecter en tant que ce tenant"),
  })

  const filtered = tenants.filter(t => {
    const matchSearch = !search || [t.name, t.email, t.city, t.slug].some(
      v => v?.toLowerCase().includes(search.toLowerCase())
    )
    const matchStatus = statusFilter === 'all' || t.subscription?.status === statusFilter
    return matchSearch && matchStatus
  })

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Organisations</h1>
          <p className="text-sm text-gray-500 mt-0.5">Gérez tous les tenants de la plateforme</p>
        </div>
        <button onClick={() => refetch()} className="flex items-center gap-2 text-sm text-gray-500 bg-white border border-gray-200 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors">
          <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} /> Actualiser
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'Total', value: stats.total, color: 'text-gray-900' },
          { label: 'Actifs', value: stats.active, color: 'text-green-600' },
          { label: 'Essai', value: stats.trial, color: 'text-blue-600' },
          { label: 'Suspendus', value: stats.suspended, color: 'text-orange-600' },
          { label: 'Expirés', value: stats.expired, color: 'text-red-600' },
        ].map(k => (
          <div key={k.label} className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <p className={`text-2xl font-bold ${k.color}`}>{k.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{k.label}</p>
          </div>
        ))}
      </div>

      {/* Alert for expired */}
      {stats.expired > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle size={18} className="text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-700 font-medium">{stats.expired} organisation(s) avec licence expirée — accès client bloqué.</p>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Rechercher par nom, email, ville…" className="input pl-9"
            value={search} onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select className="input sm:w-48" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="all">Tous les statuts</option>
          <option value="active">Actif</option>
          <option value="trial">En essai</option>
          <option value="expired">Expiré</option>
          <option value="suspended">Suspendu</option>
          <option value="cancelled">Résilié</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <RefreshCw size={24} className="animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Building2 size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">Aucune organisation trouvée</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left text-xs font-semibold text-gray-500 uppercase px-4 py-3">Organisation</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase px-4 py-3 hidden md:table-cell">Plan</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase px-4 py-3">Statut</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase px-4 py-3 hidden lg:table-cell">Expiration</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase px-4 py-3 hidden md:table-cell">Usage</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(t => {
                const sub = t.subscription
                const days = sub ? daysUntil(sub.ends_at) : null
                return (
                  <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900 text-sm">{t.name}</div>
                      <div className="text-xs text-gray-400 font-mono">/{t.slug}</div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      {sub
                        ? <span className="text-xs bg-primary/10 text-primary font-semibold px-2 py-0.5 rounded-full">{sub.plan_name}</span>
                        : <span className="text-xs text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {sub
                        ? <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${SUB_STATUS[sub.status]?.color}`}>{SUB_STATUS[sub.status]?.label}</span>
                        : <span className="text-xs text-gray-400">Aucun</span>}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-xs">
                      {sub ? (
                        <span className={days !== null && days < 7 ? 'text-red-600 font-semibold' : days !== null && days < 30 ? 'text-amber-600' : 'text-gray-600'}>
                          {new Date(sub.ends_at).toLocaleDateString('fr-FR')}
                          {days !== null && <span className="ml-1 text-gray-400">{days > 0 ? `(J-${days})` : '(expiré)'}</span>}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-xs text-gray-500">
                      <div>{t.stores_count} mag.</div>
                      <div>{t.users_count} users</div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => setSelected(t)}
                        className="p-1.5 text-gray-400 hover:text-brand hover:bg-gray-100 rounded-lg transition-colors"
                      ><Eye size={16} /></button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Extend modal */}
      {extendTarget && (
        <ExtendModal
          tenant={extendTarget}
          onClose={() => setExtendTarget(null)}
          onExtend={(id, days) => extendMutation.mutate({ id, days })}
        />
      )}

      {/* Detail panel */}
      {selected && (
        <TenantPanel
          tenant={selected}
          onClose={() => setSelected(null)}
          onActivate={() => activateMutation.mutate(selected.id)}
          onSuspend={() => {
            if (confirm(`Suspendre "${selected.name}" ? Le client perdra l'accès à la plateforme.`)) {
              suspendMutation.mutate(selected.id)
            }
          }}
          onExtend={() => { setExtendTarget(selected); setSelected(null) }}
          onImpersonate={() => {
            if (confirm(`Se connecter en tant qu'administrateur de "${selected.name}" ?`)) {
              impersonateMutation.mutate(selected.id)
            }
          }}
        />
      )}
    </div>
  )
}
