import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, RefreshCw, ChevronLeft, ChevronRight, Search, Filter } from 'lucide-react'
import axios from 'axios'
import { useSuperAdminStore } from '../../store/superAdmin.store'

const saApi = axios.create({
  baseURL: (import.meta.env.VITE_API_URL ?? 'http://localhost:8000') + '/api/v1',
  headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
})

saApi.interceptors.request.use(cfg => {
  const token = useSuperAdminStore.getState().token
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

interface AuditEntry {
  id: number
  action: string
  target_type: string | null
  target_id: number | null
  metadata: Record<string, unknown> | null
  ip_address: string | null
  created_at: string
  super_admin: { id: number; name: string; email: string } | null
}

const ACTION_COLORS: Record<string, string> = {
  'superadmin.login':     'bg-blue-100 text-blue-700',
  'onboarding.approved':  'bg-green-100 text-green-700',
  'onboarding.rejected':  'bg-red-100 text-red-700',
  'tenant.activated':     'bg-green-100 text-green-700',
  'tenant.suspended':     'bg-red-100 text-red-700',
  'tenant.extended':      'bg-amber-100 text-amber-700',
  'tenant.impersonated':  'bg-purple-100 text-purple-700',
  'plan.created':         'bg-brand/10 text-brand',
  'plan.updated':         'bg-brand/10 text-brand',
  'plan.deleted':         'bg-red-100 text-red-700',
  'licence.extended':     'bg-amber-100 text-amber-700',
}

function fmtDate(d: string) {
  return new Date(d).toLocaleString('fr-FR', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  })
}

const ALL_ACTIONS = [
  'superadmin.login',
  'onboarding.approved', 'onboarding.rejected',
  'tenant.activated', 'tenant.suspended', 'tenant.extended', 'tenant.impersonated',
  'plan.created', 'plan.updated', 'plan.deleted',
  'licence.extended',
]

function MetaBadge({ meta }: { meta: Record<string, unknown> | null }) {
  if (!meta || Object.keys(meta).length === 0) return null
  return (
    <span className="font-mono text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded max-w-xs truncate inline-block">
      {JSON.stringify(meta)}
    </span>
  )
}

export default function AuditLogPage() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [showFilters, setShowFilters] = useState(false)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['sa-audit', page, actionFilter],
    queryFn: () => saApi.get('/superadmin/audit', {
      params: { page, per_page: 50, action: actionFilter || undefined }
    }).then(r => r.data),
  })

  const entries: AuditEntry[] = data?.data ?? []
  const meta = data?.meta ?? { current_page: 1, last_page: 1, total: 0 }

  const filtered = search
    ? entries.filter(e =>
        e.action.includes(search.toLowerCase()) ||
        e.super_admin?.name?.toLowerCase().includes(search.toLowerCase()) ||
        e.super_admin?.email?.toLowerCase().includes(search.toLowerCase())
      )
    : entries

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Audit Log</h1>
          <p className="text-sm text-gray-500 mt-0.5">Historique complet des actions effectuées sur la plateforme</p>
        </div>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-brand border border-gray-200 hover:border-brand px-3 py-2 rounded-lg transition-colors"
        >
          <RefreshCw size={14} /> Rafraîchir
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher par action ou administrateur…"
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-3 py-2 text-sm rounded-lg border transition-colors ${
              showFilters || actionFilter ? 'border-brand text-brand bg-brand/5' : 'border-gray-200 text-gray-600 hover:border-gray-300'
            }`}
          >
            <Filter size={14} /> Filtres
          </button>
        </div>
        {showFilters && (
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-2">Filtrer par action</p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => { setActionFilter(''); setPage(1) }}
                className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                  !actionFilter ? 'bg-brand text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                Toutes
              </button>
              {ALL_ACTIONS.map(a => (
                <button
                  key={a}
                  onClick={() => { setActionFilter(a); setPage(1) }}
                  className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                    actionFilter === a
                      ? 'bg-brand text-white'
                      : (ACTION_COLORS[a] ?? 'bg-gray-100 text-gray-600') + ' hover:opacity-80'
                  }`}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Stats bar */}
      {meta.total > 0 && (
        <p className="text-xs text-gray-500">
          {meta.total} entrée{meta.total > 1 ? 's' : ''} au total · Page {meta.current_page}/{meta.last_page}
        </p>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <RefreshCw size={24} className="animate-spin text-gray-300" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <AlertTriangle size={40} className="mb-3 opacity-30" />
            <p className="text-sm">Aucune entrée trouvée</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Date</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Action</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase hidden md:table-cell">Admin</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase hidden lg:table-cell">Cible</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase hidden xl:table-cell">Détails</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase hidden xl:table-cell">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(entry => (
                <tr key={entry.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{fmtDate(entry.created_at)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold font-mono ${ACTION_COLORS[entry.action] ?? 'bg-gray-100 text-gray-600'}`}>
                      {entry.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    {entry.super_admin ? (
                      <div>
                        <div className="font-medium text-gray-800 text-xs">{entry.super_admin.name}</div>
                        <div className="text-[11px] text-gray-400">{entry.super_admin.email}</div>
                      </div>
                    ) : <span className="text-gray-400 text-xs">Système</span>}
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell text-xs text-gray-500">
                    {entry.target_type ? (
                      <span className="font-mono">{entry.target_type}#{entry.target_id}</span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3 hidden xl:table-cell">
                    <MetaBadge meta={entry.metadata} />
                  </td>
                  <td className="px-4 py-3 hidden xl:table-cell text-xs text-gray-400 font-mono">
                    {entry.ip_address ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {meta.last_page > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={meta.current_page <= 1}
            className="p-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm text-gray-600">
            Page {meta.current_page} / {meta.last_page}
          </span>
          <button
            onClick={() => setPage(p => Math.min(meta.last_page, p + 1))}
            disabled={meta.current_page >= meta.last_page}
            className="p-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  )
}
