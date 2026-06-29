import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import api from '../../lib/api'
import toast from 'react-hot-toast'
import {
  LifeBuoy, Plus, Search, ChevronRight, Clock, CheckCircle2,
  AlertCircle, Circle, Loader2, X, MessageSquare,
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
  agent?: { id: number; name: string } | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<TicketStatus, string> = {
  open:           'Ouvert',
  in_progress:    'En cours',
  waiting_reply:  'En attente',
  resolved:       'Résolu',
  closed:         'Fermé',
}

const STATUS_COLOR: Record<TicketStatus, string> = {
  open:           'bg-blue-100 text-blue-700',
  in_progress:    'bg-yellow-100 text-yellow-700',
  waiting_reply:  'bg-purple-100 text-purple-700',
  resolved:       'bg-green-100 text-green-700',
  closed:         'bg-gray-100 text-gray-500',
}

const PRIORITY_COLOR: Record<TicketPriority, string> = {
  low:    'bg-gray-100 text-gray-500',
  normal: 'bg-blue-100 text-blue-600',
  high:   'bg-orange-100 text-orange-600',
  urgent: 'bg-red-100 text-red-600',
}

const PRIORITY_LABEL: Record<TicketPriority, string> = {
  low: 'Faible', normal: 'Normal', high: 'Élevé', urgent: 'Urgent',
}

const CATEGORY_LABEL: Record<TicketCategory, string> = {
  bug: 'Bug', question: 'Question', billing: 'Facturation', feature: 'Fonctionnalité', other: 'Autre',
}

function StatusIcon({ status }: { status: TicketStatus }) {
  if (status === 'open')          return <Circle className="w-4 h-4 text-blue-500" />
  if (status === 'in_progress')   return <Loader2 className="w-4 h-4 text-yellow-500" />
  if (status === 'waiting_reply') return <Clock className="w-4 h-4 text-purple-500" />
  if (status === 'resolved')      return <CheckCircle2 className="w-4 h-4 text-green-500" />
  return <X className="w-4 h-4 text-gray-400" />
}

// ─── New Ticket Modal ─────────────────────────────────────────────────────────

function NewTicketModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [form, setForm] = useState({
    subject: '', body: '', category: 'question' as TicketCategory, priority: 'normal' as TicketPriority,
  })

  const mutation = useMutation({
    mutationFn: () => api.post('/support/tickets', form).then(r => r.data),
    onSuccess: (ticket) => {
      qc.invalidateQueries({ queryKey: ['support-tickets'] })
      toast.success(`Ticket ${ticket.ticket_number} créé`)
      onClose()
      navigate(`/support/${ticket.id}`)
    },
    onError: () => toast.error('Erreur lors de la création du ticket'),
  })

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="font-semibold text-gray-800 text-lg">Nouveau ticket de support</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Sujet *</label>
            <input
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Décrivez brièvement votre demande…"
              value={form.subject}
              onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Catégorie</label>
              <select
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value as TicketCategory }))}
              >
                {Object.entries(CATEGORY_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Priorité</label>
              <select
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={form.priority}
                onChange={e => setForm(f => ({ ...f, priority: e.target.value as TicketPriority }))}
              >
                {Object.entries(PRIORITY_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Description *</label>
            <textarea
              rows={5}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              placeholder="Décrivez votre problème en détail. Incluez les étapes pour le reproduire si c'est un bug."
              value={form.body}
              onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
            />
          </div>
        </div>
        <div className="flex justify-end gap-3 p-5 border-t">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Annuler</button>
          <button
            onClick={() => mutation.mutate()}
            disabled={!form.subject.trim() || !form.body.trim() || mutation.isPending}
            className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
          >
            {mutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            Envoyer le ticket
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SupportPage() {
  const navigate = useNavigate()
  const [search, setSearch]     = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [showNew, setShowNew]   = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['support-tickets', search, filterStatus],
    queryFn: () => api.get('/support/tickets', {
      params: { search: search || undefined, status: filterStatus || undefined, per_page: 50 },
    }).then(r => r.data),
    staleTime: 0,
  })

  const tickets: Ticket[] = data?.data ?? []

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <LifeBuoy className="w-7 h-7 text-indigo-600" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">Support</h1>
            <p className="text-sm text-gray-500">Vos demandes d'assistance</p>
          </div>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700"
        >
          <Plus className="w-4 h-4" /> Nouveau ticket
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-5">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="Rechercher un ticket…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
        >
          <option value="">Tous les statuts</option>
          {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      {/* Ticket list */}
      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>
      ) : tickets.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <LifeBuoy className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Aucun ticket trouvé</p>
          <p className="text-sm mt-1">Créez votre premier ticket de support</p>
        </div>
      ) : (
        <div className="space-y-2">
          {tickets.map(ticket => (
            <button
              key={ticket.id}
              onClick={() => navigate(`/support/${ticket.id}`)}
              className="w-full text-left bg-white border rounded-xl p-4 hover:border-indigo-300 hover:shadow-sm transition-all group"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <StatusIcon status={ticket.status} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-gray-400 font-mono">{ticket.ticket_number}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[ticket.status]}`}>
                        {STATUS_LABEL[ticket.status]}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_COLOR[ticket.priority]}`}>
                        {PRIORITY_LABEL[ticket.priority]}
                      </span>
                    </div>
                    <p className="font-medium text-gray-800 mt-1 truncate">{ticket.subject}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                      <span>{CATEGORY_LABEL[ticket.category]}</span>
                      <span>·</span>
                      <span className="flex items-center gap-1">
                        <MessageSquare className="w-3 h-3" /> {ticket.messages_count}
                      </span>
                      <span>·</span>
                      <span>{new Date(ticket.updated_at).toLocaleDateString('fr-FR')}</span>
                    </div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-indigo-400 flex-shrink-0 mt-1" />
              </div>
            </button>
          ))}
        </div>
      )}

      {showNew && <NewTicketModal onClose={() => setShowNew(false)} />}
    </div>
  )
}
