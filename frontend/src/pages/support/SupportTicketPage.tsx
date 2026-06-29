import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../lib/api'
import toast from 'react-hot-toast'
import { useAuthStore } from '../../store/auth.store'
import {
  ArrowLeft, Send, Loader2, LifeBuoy, AlertCircle,
  CheckCircle2, Clock, Circle, X, Lock,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type TicketStatus   = 'open' | 'in_progress' | 'waiting_reply' | 'resolved' | 'closed'
type TicketPriority = 'low' | 'normal' | 'high' | 'urgent'
type TicketCategory = 'bug' | 'question' | 'billing' | 'feature' | 'other'

interface Message {
  id: number
  user_id: number
  body: string
  is_internal: boolean
  created_at: string
  user: { id: number; name: string }
}

interface Ticket {
  id: number
  ticket_number: string
  subject: string
  category: TicketCategory
  priority: TicketPriority
  status: TicketStatus
  created_at: string
  updated_at: string
  first_response_at: string | null
  resolved_at: string | null
  creator: { id: number; name: string }
  agent: { id: number; name: string } | null
  organization: { id: number; name: string } | null
  messages: Message[]
}

const STATUS_LABEL: Record<TicketStatus, string> = {
  open: 'Ouvert', in_progress: 'En cours', waiting_reply: 'En attente de réponse',
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

function formatDate(iso: string) {
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SupportTicketPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const user = useAuthStore(s => s.user)
  const isSuperAdmin = user?.roles?.includes('super_admin') ?? false

  const [reply, setReply]           = useState('')
  const [isInternal, setIsInternal] = useState(false)

  const { data: ticket, isLoading } = useQuery<Ticket>({
    queryKey: ['support-ticket', id],
    queryFn: () => api.get(`/support/tickets/${id}`).then(r => r.data),
    staleTime: 0,
  })

  const replyMutation = useMutation({
    mutationFn: () => api.post(`/support/tickets/${id}/reply`, { body: reply, is_internal: isInternal }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['support-ticket', id] })
      qc.invalidateQueries({ queryKey: ['support-tickets'] })
      setReply('')
      setIsInternal(false)
    },
    onError: () => toast.error('Erreur lors de l\'envoi'),
  })

  const statusMutation = useMutation({
    mutationFn: (status: TicketStatus) => api.patch(`/support/tickets/${id}/status`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['support-ticket', id] })
      qc.invalidateQueries({ queryKey: ['support-tickets'] })
      toast.success('Statut mis à jour')
    },
  })

  const closeMutation = useMutation({
    mutationFn: () => api.post(`/support/tickets/${id}/close`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['support-ticket', id] })
      qc.invalidateQueries({ queryKey: ['support-tickets'] })
      toast.success('Ticket fermé')
    },
  })

  if (isLoading) return (
    <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>
  )
  if (!ticket) return (
    <div className="text-center py-20 text-gray-400"><AlertCircle className="w-10 h-10 mx-auto mb-2" /><p>Ticket introuvable</p></div>
  )

  const isClosed = ticket.status === 'closed' || ticket.status === 'resolved'
  const isOwner  = ticket.creator.id === user?.id

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Back */}
      <button onClick={() => navigate('/support')} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-5">
        <ArrowLeft className="w-4 h-4" /> Retour au support
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main — thread */}
        <div className="lg:col-span-2 space-y-4">
          {/* Header */}
          <div className="bg-white border rounded-xl p-5">
            <div className="flex items-start gap-3">
              <LifeBuoy className="w-5 h-5 text-indigo-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs text-gray-400 font-mono mb-1">{ticket.ticket_number}</p>
                <h1 className="text-lg font-bold text-gray-900">{ticket.subject}</h1>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1 ${STATUS_COLOR[ticket.status]}`}>
                    <StatusIcon status={ticket.status} /> {STATUS_LABEL[ticket.status]}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_COLOR[ticket.priority]}`}>
                    {PRIORITY_LABEL[ticket.priority]}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                    {CATEGORY_LABEL[ticket.category]}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Messages */}
          <div className="space-y-3">
            {ticket.messages.map(msg => {
              const isFromSupport = isSuperAdmin && msg.user_id !== ticket.creator.id
              const isMe = msg.user_id === user?.id
              return (
                <div key={msg.id} className={`flex gap-3 ${isMe ? 'flex-row-reverse' : ''}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold
                    ${isFromSupport ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600'}`}>
                    {msg.user.name[0].toUpperCase()}
                  </div>
                  <div className={`max-w-[75%] ${msg.is_internal ? 'opacity-70' : ''}`}>
                    <div className={`rounded-xl px-4 py-3 text-sm
                      ${msg.is_internal
                        ? 'bg-yellow-50 border border-yellow-200 text-yellow-900'
                        : isMe
                          ? 'bg-indigo-600 text-white'
                          : 'bg-white border text-gray-800'
                      }`}>
                      {msg.is_internal && (
                        <div className="flex items-center gap-1 text-xs font-medium text-yellow-700 mb-1">
                          <Lock className="w-3 h-3" /> Note interne
                        </div>
                      )}
                      <p className="whitespace-pre-wrap">{msg.body}</p>
                    </div>
                    <div className={`flex items-center gap-2 mt-1 text-xs text-gray-400 ${isMe ? 'justify-end' : ''}`}>
                      <span className="font-medium">{isMe ? 'Vous' : msg.user.name}</span>
                      <span>·</span>
                      <span>{formatDate(msg.created_at)}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Reply box */}
          {!isClosed ? (
            <div className="bg-white border rounded-xl p-4">
              {isSuperAdmin && (
                <div className="flex items-center gap-2 mb-3">
                  <button
                    onClick={() => setIsInternal(false)}
                    className={`text-xs px-3 py-1 rounded-full font-medium transition-colors
                      ${!isInternal ? 'bg-indigo-100 text-indigo-700' : 'text-gray-400 hover:text-gray-600'}`}
                  >
                    Réponse publique
                  </button>
                  <button
                    onClick={() => setIsInternal(true)}
                    className={`text-xs px-3 py-1 rounded-full font-medium transition-colors flex items-center gap-1
                      ${isInternal ? 'bg-yellow-100 text-yellow-700' : 'text-gray-400 hover:text-gray-600'}`}
                  >
                    <Lock className="w-3 h-3" /> Note interne
                  </button>
                </div>
              )}
              <textarea
                rows={3}
                className={`w-full text-sm resize-none focus:outline-none p-2 rounded-lg border
                  ${isInternal ? 'bg-yellow-50 border-yellow-200' : 'bg-gray-50 border-gray-200'}`}
                placeholder={isInternal ? 'Note visible uniquement par l\'équipe support…' : 'Écrire votre réponse…'}
                value={reply}
                onChange={e => setReply(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey && reply.trim()) replyMutation.mutate() }}
              />
              <div className="flex items-center justify-between mt-3">
                <span className="text-xs text-gray-400">Ctrl+Entrée pour envoyer</span>
                <button
                  onClick={() => replyMutation.mutate()}
                  disabled={!reply.trim() || replyMutation.isPending}
                  className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
                >
                  {replyMutation.isPending
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <Send className="w-4 h-4" />
                  }
                  Envoyer
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-center text-sm text-gray-400">
              Ce ticket est {ticket.status === 'resolved' ? 'résolu' : 'fermé'}
            </div>
          )}
        </div>

        {/* Sidebar — details */}
        <div className="space-y-4">
          {/* Ticket info */}
          <div className="bg-white border rounded-xl p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Détails</h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500">Créé par</dt>
                <dd className="font-medium text-gray-800">{ticket.creator.name}</dd>
              </div>
              {ticket.agent && (
                <div className="flex justify-between">
                  <dt className="text-gray-500">Assigné à</dt>
                  <dd className="font-medium text-indigo-600">{ticket.agent.name}</dd>
                </div>
              )}
              {ticket.organization && (
                <div className="flex justify-between">
                  <dt className="text-gray-500">Organisation</dt>
                  <dd className="font-medium text-gray-800">{ticket.organization.name}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-gray-500">Ouvert le</dt>
                <dd className="text-gray-600">{formatDate(ticket.created_at)}</dd>
              </div>
              {ticket.first_response_at && (
                <div className="flex justify-between">
                  <dt className="text-gray-500">1ère réponse</dt>
                  <dd className="text-gray-600">{formatDate(ticket.first_response_at)}</dd>
                </div>
              )}
              {ticket.resolved_at && (
                <div className="flex justify-between">
                  <dt className="text-gray-500">Résolu le</dt>
                  <dd className="text-green-600 font-medium">{formatDate(ticket.resolved_at)}</dd>
                </div>
              )}
            </dl>
          </div>

          {/* Actions */}
          <div className="bg-white border rounded-xl p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Actions</h3>
            <div className="space-y-2">
              {/* Super admin: change status */}
              {isSuperAdmin && !isClosed && (
                <>
                  {ticket.status !== 'in_progress' && (
                    <button
                      onClick={() => statusMutation.mutate('in_progress')}
                      disabled={statusMutation.isPending}
                      className="w-full text-left text-sm px-3 py-2 rounded-lg hover:bg-yellow-50 text-yellow-700 border border-yellow-200"
                    >
                      Marquer en cours
                    </button>
                  )}
                  {ticket.status !== 'waiting_reply' && (
                    <button
                      onClick={() => statusMutation.mutate('waiting_reply')}
                      disabled={statusMutation.isPending}
                      className="w-full text-left text-sm px-3 py-2 rounded-lg hover:bg-purple-50 text-purple-700 border border-purple-200"
                    >
                      En attente de réponse
                    </button>
                  )}
                  <button
                    onClick={() => statusMutation.mutate('resolved')}
                    disabled={statusMutation.isPending}
                    className="w-full text-left text-sm px-3 py-2 rounded-lg hover:bg-green-50 text-green-700 border border-green-200"
                  >
                    Marquer résolu
                  </button>
                </>
              )}
              {/* User: close own ticket */}
              {(isOwner || isSuperAdmin) && !isClosed && (
                <button
                  onClick={() => { if (confirm('Fermer ce ticket ?')) closeMutation.mutate() }}
                  disabled={closeMutation.isPending}
                  className="w-full text-left text-sm px-3 py-2 rounded-lg hover:bg-red-50 text-red-600 border border-red-200"
                >
                  Fermer le ticket
                </button>
              )}
              {isClosed && (
                <div className="text-xs text-gray-400 text-center py-2">Ticket fermé — aucune action disponible</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
