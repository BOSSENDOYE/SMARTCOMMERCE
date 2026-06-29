import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import api from '../../lib/api'
import toast from 'react-hot-toast'
import {
  LifeBuoy, Search, Loader2, MessageSquare, AlertCircle,
  CheckCircle2, Clock, Circle, X, ChevronRight, Filter,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type TicketStatus   = 'open' | 'in_progress' | 'waiting_reply' | 'resolved' | 'closed'
type TicketPriority = 'low' | 'normal' | 'high' | 'urgent'
type TicketCategory = 'bug' | 'question' | 'billing' | 'feature' | 'other'

interface Ticket {
  id: number
  ticket_number: string
  subject: string
  category: TicketCategory
  priority: TicketPriority
  status: TicketStatus
  messages_count: number
  created_at: string
  updated_at: string
  creator: { id: number; name: string }
  agent: { id: number; name: string } | null
  organization: { id: number; name: string } | null
}

interface Stats {
  total: number; open: number; in_progress: number
  waiting_reply: number; resolved: number; urgent: number
}

const STATUS_LABEL: Record<TicketStatus, string> = {
  open: 'Ouvert', in_progress: 'En cours', waiting_reply: 'En attente',
  resolved: 'Résolu', closed: 'Fermé',
}
const STATUS_COLOR: Record<TicketStatus, string> = {
  open: 'bg-blue-100 text-blue-700', in_progress: 'bg-yellow-100 text-yellow-700',
  waiting_reply: 'bg-purple-100 text-purple-700', resolved: 'bg-green-100 text-green-700',
  closed: 'bg-gray-100 text-gray-500',
}
const PRIORITY_COLOR: Record<TicketPriority, string> = {
  low: 'bg-gray-100 text-gray-500', normal: 'bg-blue-100 text-blue-600',
  high: 'bg-orange-100 text-orange-600', urgent: 'bg-red-100 text-red-600',
}
const PRIORITY_LABEL: Record<TicketPriority, string> = {
  low: 'Faible', normal: 'Normal', high: 'Élevé', urgent: 'Urgent',
}

function StatusIcon({ status }: { status: TicketStatus }) {
  if (status === 'open')          return <Circle className="w-4 h-4 text-blue-500" />
  if (status === 'in_progress')   return <Loader2 className="w-4 h-4 text-yellow-500" />
  if (status === 'waiting_reply') return <Clock className="w-4 h-4 text-purple-500" />
  if (status === 'resolved')      return <CheckCircle2 className="w-4 h-4 text-green-500" />
  return <X className="w-4 h-4 text-gray-400" />
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SupportAdminPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [search, setSearch]             = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterPriority, setFilterPriority] = useState('')
  const [filterCategory, setFilterCategory] = useState('')

  const { data: stats } = useQuery<Stats>({
    queryKey: ['support-stats'],
    queryFn: () => api.get('/support/stats').then(r => r.data),
    staleTime: 0,
  })

  const { data, isLoading } = useQuery({
    queryKey: ['support-tickets-admin', search, filterStatus, filterPriority, filterCategory],
    queryFn: () => api.get('/support/tickets', {
      params: {
        search:   search || undefined,
        status:   filterStatus || undefined,
        priority: filterPriority || undefined,
        category: filterCategory || undefined,
        per_page: 50,
      },
    }).then(r => r.data),
    staleTime: 0,
  })

  const tickets: Ticket[] = data?.data ?? []

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: TicketStatus }) =>
      api.patch(`/support/tickets/${id}/status`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['support-tickets-admin'] })
      qc.invalidateQueries({ queryKey: ['support-stats'] })
      toast.success('Statut mis à jour')
    },
  })

  const statCards = [
    { label: 'Ouverts',      value: stats?.open,          color: 'text-blue-600',   bg: 'bg-blue-50' },
    { label: 'En cours',     value: stats?.in_progress,   color: 'text-yellow-600', bg: 'bg-yellow-50' },
    { label: 'En attente',   value: stats?.waiting_reply, color: 'text-purple-600', bg: 'bg-purple-50' },
    { label: 'Urgents',      value: stats?.urgent,        color: 'text-red-600',    bg: 'bg-red-50' },
    { label: 'Résolus',      value: stats?.resolved,      color: 'text-green-600',  bg: 'bg-green-50' },
    { label: 'Total',        value: stats?.total,         color: 'text-gray-700',   bg: 'bg-gray-50' },
  ]

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <LifeBuoy className="w-7 h-7 text-indigo-600" />
        <div>
          <h1 className="text-xl font-bold text-gray-900">Support — Tickets</h1>
          <p className="text-sm text-gray-500">Toutes les demandes d'assistance des organisations</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {statCards.map(s => (
          <div key={s.label} className={`${s.bg} rounded-xl p-4 text-center`}>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value ?? '—'}</p>
            <p className="text-xs text-gray-500 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="Rechercher…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">Tous les statuts</option>
          {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          value={filterPriority} onChange={e => setFilterPriority(e.target.value)}>
          <option value="">Toutes priorités</option>
          {Object.entries(PRIORITY_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
          <option value="">Toutes catégories</option>
          {[['bug','Bug'],['question','Question'],['billing','Facturation'],['feature','Fonctionnalité'],['other','Autre']].map(([v,l]) =>
            <option key={v} value={v}>{l}</option>
          )}
        </select>
      </div>

      {/* Ticket table */}
      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>
      ) : tickets.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <LifeBuoy className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Aucun ticket trouvé</p>
        </div>
      ) : (
        <div className="bg-white border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
              <tr>
                <th className="text-left px-4 py-3">Ticket</th>
                <th className="text-left px-4 py-3">Organisation</th>
                <th className="text-left px-4 py-3">Statut</th>
                <th className="text-left px-4 py-3">Priorité</th>
                <th className="text-left px-4 py-3">Créateur</th>
                <th className="text-left px-4 py-3">Msgs</th>
                <th className="text-left px-4 py-3">Date</th>
                <th className="text-left px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {tickets.map(ticket => (
                <tr key={ticket.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <button
                      onClick={() => navigate(`/support/${ticket.id}`)}
                      className="flex items-center gap-2 hover:text-indigo-600 group"
                    >
                      <StatusIcon status={ticket.status} />
                      <div>
                        <p className="font-medium text-gray-800 group-hover:text-indigo-600 max-w-48 truncate">{ticket.subject}</p>
                        <p className="text-xs text-gray-400 font-mono">{ticket.ticket_number}</p>
                      </div>
                    </button>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{ticket.organization?.name ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_COLOR[ticket.status]}`}>
                      {STATUS_LABEL[ticket.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${PRIORITY_COLOR[ticket.priority]}`}>
                      {PRIORITY_LABEL[ticket.priority]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{ticket.creator.name}</td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1 text-gray-500">
                      <MessageSquare className="w-3.5 h-3.5" /> {ticket.messages_count}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {new Date(ticket.updated_at).toLocaleDateString('fr-FR')}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => navigate(`/support/${ticket.id}`)}
                        className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg"
                        title="Voir"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                      {ticket.status !== 'resolved' && ticket.status !== 'closed' && (
                        <button
                          onClick={() => statusMutation.mutate({ id: ticket.id, status: 'resolved' })}
                          className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg"
                          title="Marquer résolu"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                        </button>
                      )}
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
