import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  CreditCard, Search, AlertTriangle, Clock, CheckCircle, XCircle,
  Loader2, RefreshCw, Calendar, ArrowUpCircle, PlusCircle, Ban
} from 'lucide-react'
import { useSuperAdminStore } from '../../store/superAdmin.store'
import axios from 'axios'
import toast from 'react-hot-toast'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Licence {
  id: number
  organization_id: number
  organization_name: string
  plan_name: string
  plan_slug: string
  status: 'trial' | 'active' | 'suspended' | 'expired' | 'cancelled'
  billing_cycle: 'monthly' | 'quarterly' | 'yearly'
  starts_at: string
  ends_at: string
  grace_ends_at: string | null
  trial_ends_at: string | null
  max_stores_override: number | null
  max_users_override: number | null
}

// ── API ───────────────────────────────────────────────────────────────────────

const saApi = axios.create({
  baseURL: (import.meta.env.VITE_API_URL ?? 'http://localhost:8000') + '/api/v1',
  headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
})
saApi.interceptors.request.use(cfg => {
  const token = useSuperAdminStore.getState().token
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

// ── Helpers ───────────────────────────────────────────────────────────────────

const statusConfig = {
  trial: { label: 'Essai', color: 'bg-blue-100 text-blue-700', dot: 'bg-blue-400' },
  active: { label: 'Actif', color: 'bg-green-100 text-green-700', dot: 'bg-green-500' },
  suspended: { label: 'Suspendu', color: 'bg-orange-100 text-orange-700', dot: 'bg-orange-400' },
  expired: { label: 'Expiré', color: 'bg-red-100 text-red-700', dot: 'bg-red-500' },
  cancelled: { label: 'Résilié', color: 'bg-gray-100 text-gray-600', dot: 'bg-gray-400' },
}

const cycleLabels: Record<string, string> = {
  monthly: 'Mensuel', quarterly: 'Trimestriel', yearly: 'Annuel',
}

function daysUntil(dateStr: string) {
  const diff = new Date(dateStr).getTime() - Date.now()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

function urgency(days: number) {
  if (days <= 0) return 'text-red-600 font-semibold'
  if (days <= 7) return 'text-red-500 font-semibold'
  if (days <= 30) return 'text-amber-600 font-semibold'
  return 'text-gray-700'
}

// ── Extension Modal ───────────────────────────────────────────────────────────

function ExtendModal({ licence, onClose, onExtend }: {
  licence: Licence
  onClose: () => void
  onExtend: (id: number, days: number) => void
}) {
  const [days, setDays] = useState(7)

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-gray-900 mb-1">Prolonger la licence</h2>
        <p className="text-sm text-gray-500 mb-5">{licence.organization_name}</p>

        <div className="mb-5">
          <label className="block text-sm font-medium text-gray-700 mb-1">Nombre de jours à ajouter</label>
          <div className="flex gap-2 mb-3">
            {[7, 15, 30, 90].map(d => (
              <button key={d} onClick={() => setDays(d)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${days === d ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                {d}j
              </button>
            ))}
          </div>
          <input type="number" className="input" min={1} max={365} value={days}
            onChange={e => setDays(parseInt(e.target.value) || 1)}
          />
        </div>

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 btn-secondary text-sm">Annuler</button>
          <button onClick={() => onExtend(licence.id, days)}
            className="flex-1 bg-primary hover:bg-primary-600 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors flex items-center justify-center gap-2"
          >
            <PlusCircle size={14} /> Prolonger {days}j
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function LicencesPage() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [urgencyFilter, setUrgencyFilter] = useState('all')
  const [extendTarget, setExtendTarget] = useState<Licence | null>(null)

  const { data: licences = [], isLoading, refetch } = useQuery<Licence[]>({
    queryKey: ['sa-licences'],
    queryFn: async () => {
      const res = await saApi.get('/superadmin/licences')
      return res.data.data ?? res.data
    },
  })

  const extendMutation = useMutation({
    mutationFn: async ({ id, days }: { id: number; days: number }) => {
      await saApi.post(`/superadmin/licences/${id}/extend`, { days })
    },
    onSuccess: () => {
      toast.success('Licence prolongée avec succès !')
      qc.invalidateQueries({ queryKey: ['sa-licences'] })
      setExtendTarget(null)
    },
    onError: () => toast.error('Erreur lors de la prolongation'),
  })

  const filtered = licences.filter(l => {
    const days = daysUntil(l.ends_at)
    const matchSearch = !search || l.organization_name.toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'all' || l.status === statusFilter
    const matchUrgency =
      urgencyFilter === 'all' ||
      (urgencyFilter === 'expiring30' && days <= 30 && days > 7) ||
      (urgencyFilter === 'expiring7' && days <= 7 && days > 0) ||
      (urgencyFilter === 'expired' && days <= 0)
    return matchSearch && matchStatus && matchUrgency
  })

  const expiringCounts = {
    soon30: licences.filter(l => { const d = daysUntil(l.ends_at); return d > 0 && d <= 30 && l.status === 'active' }).length,
    soon7: licences.filter(l => { const d = daysUntil(l.ends_at); return d > 0 && d <= 7 && l.status === 'active' }).length,
    expired: licences.filter(l => l.status === 'expired').length,
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <CreditCard size={22} className="text-primary" /> Licences & Abonnements
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Suivi des licences actives, expirations et renouvellements</p>
        </div>
        <button onClick={() => refetch()} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 bg-white border border-gray-200 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors">
          <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} /> Actualiser
        </button>
      </div>

      {/* Alert cards */}
      {(expiringCounts.soon7 > 0 || expiringCounts.expired > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
          {expiringCounts.expired > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
              <XCircle size={20} className="text-red-500 flex-shrink-0" />
              <div>
                <div className="font-semibold text-red-700 text-sm">{expiringCounts.expired} licences expirées</div>
                <div className="text-xs text-red-500">Accès client bloqué</div>
              </div>
            </div>
          )}
          {expiringCounts.soon7 > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
              <AlertTriangle size={20} className="text-amber-500 flex-shrink-0" />
              <div>
                <div className="font-semibold text-amber-700 text-sm">{expiringCounts.soon7} expirent dans 7j</div>
                <div className="text-xs text-amber-500">Renouvellement urgent</div>
              </div>
            </div>
          )}
          {expiringCounts.soon30 > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center gap-3">
              <Clock size={20} className="text-blue-500 flex-shrink-0" />
              <div>
                <div className="font-semibold text-blue-700 text-sm">{expiringCounts.soon30} expirent dans 30j</div>
                <div className="text-xs text-blue-500">À contacter</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Rechercher une organisation..." className="input pl-9"
            value={search} onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select className="input sm:w-44" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="all">Tous les statuts</option>
          <option value="active">Actif</option>
          <option value="trial">En essai</option>
          <option value="expired">Expiré</option>
          <option value="suspended">Suspendu</option>
        </select>
        <select className="input sm:w-48" value={urgencyFilter} onChange={e => setUrgencyFilter(e.target.value)}>
          <option value="all">Toutes les dates</option>
          <option value="expiring7">Expirent dans 7j</option>
          <option value="expiring30">Expirent dans 30j</option>
          <option value="expired">Déjà expirées</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <CreditCard size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">Aucune licence trouvée</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Organisation</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 hidden md:table-cell">Plan</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Statut</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Expiration</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 hidden lg:table-cell">Cycle</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(l => {
                const days = daysUntil(l.ends_at)
                const cfg = statusConfig[l.status]
                return (
                  <tr key={l.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
                        <div>
                          <div className="font-medium text-gray-900 text-sm">{l.organization_name}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="text-xs bg-primary/10 text-primary font-semibold px-2 py-0.5 rounded-full">
                        {l.plan_name}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex text-xs font-semibold px-2 py-0.5 rounded-full ${cfg.color}`}>
                        {cfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className={`text-sm ${urgency(days)}`}>
                        {new Date(l.ends_at).toLocaleDateString('fr-FR')}
                      </div>
                      <div className="text-xs text-gray-400">
                        {days > 0 ? `J-${days}` : `Expiré il y a ${Math.abs(days)}j`}
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-xs text-gray-500">
                      {cycleLabels[l.billing_cycle] ?? l.billing_cycle}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => setExtendTarget(l)}
                        className="flex items-center gap-1.5 text-xs text-primary hover:text-primary-600 font-medium bg-primary/5 hover:bg-primary/10 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        <PlusCircle size={12} /> Prolonger
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {extendTarget && (
        <ExtendModal
          licence={extendTarget}
          onClose={() => setExtendTarget(null)}
          onExtend={(id, days) => extendMutation.mutate({ id, days })}
        />
      )}
    </div>
  )
}
