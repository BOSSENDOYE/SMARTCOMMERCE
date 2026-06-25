import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ScrollText, Search, Filter } from 'lucide-react'
import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || ''
function saApi() {
  const token = localStorage.getItem('sc_superadmin_token')
  return axios.create({
    baseURL: API_URL ? `${API_URL}/api/v1/superadmin` : '/api/v1/superadmin',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  })
}

interface AuditEntry {
  id: number
  admin_name: string
  action: string
  target_type: string | null
  target_id: number | null
  target_label: string | null
  ip_address: string
  metadata: Record<string, unknown> | null
  created_at: string
}

const actionColor: Record<string, string> = {
  login:             'text-blue-400 bg-blue-500/10',
  approve_request:   'text-green-400 bg-green-500/10',
  reject_request:    'text-red-400 bg-red-500/10',
  suspend_tenant:    'text-amber-400 bg-amber-500/10',
  reactivate_tenant: 'text-green-400 bg-green-500/10',
  create_plan:       'text-indigo-400 bg-indigo-500/10',
  update_plan:       'text-indigo-400 bg-indigo-500/10',
  extend_licence:    'text-purple-400 bg-purple-500/10',
  mark_invoice_paid: 'text-green-400 bg-green-500/10',
  create_admin:      'text-blue-400 bg-blue-500/10',
  delete_admin:      'text-red-400 bg-red-500/10',
}

export default function AuditLogPage() {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const { data, isLoading } = useQuery<{ data: AuditEntry[]; last_page: number }>({
    queryKey: ['sa-audit', page, search],
    queryFn: () => saApi().get(`/audit-logs?page=${page}&q=${search}`).then(r => r.data),
    placeholderData: prev => prev,
  })

  const entries = data?.data ?? []
  const lastPage = data?.last_page ?? 1

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Audit Log</h1>
          <p className="text-gray-400 text-sm">Toutes les actions des administrateurs</p>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <input
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
          placeholder="Filtrer par action, admin..."
          className="w-full pl-9 pr-3 py-2 bg-gray-900 border border-gray-800 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-400 text-xs">
                <th className="text-left px-4 py-3 font-medium">Date</th>
                <th className="text-left px-4 py-3 font-medium">Admin</th>
                <th className="text-left px-4 py-3 font-medium">Action</th>
                <th className="text-left px-4 py-3 font-medium">Cible</th>
                <th className="text-left px-4 py-3 font-medium">IP</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(e => (
                <tr key={e.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition">
                  <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                    {new Date(e.created_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
                  </td>
                  <td className="px-4 py-3 text-white text-sm">{e.admin_name}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${actionColor[e.action] ?? 'text-gray-400 bg-gray-500/10'}`}>
                      {e.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {e.target_label ?? (e.target_type ? `${e.target_type}#${e.target_id}` : '—')}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs font-mono">{e.ip_address}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {entries.length === 0 && <div className="text-center py-12 text-gray-500">Aucun log</div>}
        </div>
      )}

      {lastPage > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm text-gray-300 disabled:opacity-40 transition"
          >
            ← Précédent
          </button>
          <span className="text-sm text-gray-400">Page {page} / {lastPage}</span>
          <button
            onClick={() => setPage(p => Math.min(lastPage, p + 1))}
            disabled={page === lastPage}
            className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm text-gray-300 disabled:opacity-40 transition"
          >
            Suivant →
          </button>
        </div>
      )}
    </div>
  )
}
