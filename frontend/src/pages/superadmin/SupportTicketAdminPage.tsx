import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { useSuperAdminStore } from '../../store/superAdmin.store'
import toast from 'react-hot-toast'
import {
  ArrowLeft, Send, Loader2, LifeBuoy, AlertCircle,
  CheckCircle2, Clock, Circle, X, Lock, ShieldCheck,
} from 'lucide-react'

// Super admin axios instance
const saApi = axios.create({
  baseURL: (import.meta.env.VITE_API_URL ?? '') + '/api/v1/superadmin',
  headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
})
saApi.interceptors.request.use(cfg => {
  const token = useSuperAdminStore.getState().token
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

type TicketStatus = 'open' | 'in_progress' | 'waiting_reply' | 'resolved' | 'closed'

interface Message {
  id: number
  user_id: number | null
  super_admin_id: number | null
  author_name: string | null
  body: string
  is_internal: boolean
  created_at: string
  user?: { id: number; name: string } | null
  superAdmin?: { id: number; name: string } | null
}

interface Ticket {
  id: number
  ticket_number: string
  subject: string
  category: string
  priority: string
  status: TicketStatus
  created_at: string
  updated_at: string
  first_response_at: string | null
  resolved_at: string | null
  creator: { id: number; name: string }
  organization: { id: number; name: string } | null
  store: { id: number; name: string } | null
  messages: Message[]
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

function formatDate(iso: string) {
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))
}

function getAuthorName(msg: Message): string {
  if (msg.author_name) return msg.author_name
  if (msg.user)        return msg.user.name
  if (msg.superAdmin)  return msg.superAdmin.name
  return 'Support'
}

export default function SupportTicketAdminPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const admin = useSuperAdminStore(s => s.admin)

  const [reply, setReply]           = useState('')
  const [isInternal, setIsInternal] = useState(false)

  const { data: ticket, isLoading } = useQuery<Ticket>({
    queryKey: ['sa-support-ticket', id],
    queryFn: () => saApi.get(`/support/tickets/${id}`).then(r => r.data),
    staleTime: 0,
  })

  const replyMutation = useMutation({
    mutationFn: () => saApi.post(`/support/tickets/${id}/reply`, { body: reply, is_internal: isInternal }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sa-support-ticket', id] })
      qc.invalidateQueries({ queryKey: ['sa-support-tickets'] })
      setReply('')
      setIsInternal(false)
      toast.success('Réponse envoyée')
    },
    onError: () => toast.error('Erreur lors de l\'envoi'),
  })

  const statusMutation = useMutation({
    mutationFn: (status: TicketStatus) => saApi.patch(`/support/tickets/${id}/status`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sa-support-ticket', id] })
      qc.invalidateQueries({ queryKey: ['sa-support-tickets'] })
      toast.success('Statut mis à jour')
    },
  })

  if (isLoading) return (
    <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>
  )
  if (!ticket) return (
    <div className="text-center py-20 text-gray-400"><AlertCircle className="w-10 h-10 mx-auto mb-2" /><p>Ticket introuvable</p></div>
  )

  const isClosed = ticket.status === 'closed' || ticket.status === 'resolved'

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <button onClick={() => navigate('/superadmin/support')} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-5">
        <ArrowLeft className="w-4 h-4" /> Retour aux tickets
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Thread */}
        <div className="lg:col-span-2 space-y-4">
          {/* Header */}
          <div className="bg-white border rounded-xl p-5">
            <div className="flex items-start gap-3">
              <LifeBuoy className="w-5 h-5 text-indigo-500 mt-0.5" />
              <div>
                <p className="text-xs text-gray-400 font-mono mb-1">{ticket.ticket_number}</p>
                <h1 className="text-lg font-bold text-gray-900">{ticket.subject}</h1>
                <div className="flex flex-wrap gap-2 mt-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[ticket.status]}`}>
                    {STATUS_LABEL[ticket.status]}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 capitalize">
                    {ticket.priority}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600">
                    {ticket.category}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Messages */}
          <div className="space-y-3">
            {ticket.messages.map(msg => {
              const isAdmin  = !!msg.super_admin_id
              const authorName = getAuthorName(msg)
              return (
                <div key={msg.id} className={`flex gap-3 ${isAdmin ? 'flex-row-reverse' : ''}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold
                    ${isAdmin ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600'}`}>
                    {isAdmin ? <ShieldCheck className="w-4 h-4" /> : authorName[0]?.toUpperCase()}
                  </div>
                  <div className={`max-w-[75%] ${msg.is_internal ? 'opacity-80' : ''}`}>
                    <div className={`rounded-xl px-4 py-3 text-sm
                      ${msg.is_internal
                        ? 'bg-yellow-50 border border-yellow-200 text-yellow-900'
                        : isAdmin
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
                    <div className={`flex items-center gap-2 mt-1 text-xs text-gray-400 ${isAdmin ? 'justify-end' : ''}`}>
                      <span className="font-medium">{isAdmin ? `${authorName} (Support)` : authorName}</span>
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
              <div className="flex items-center gap-2 mb-3">
                <button onClick={() => setIsInternal(false)}
                  className={`text-xs px-3 py-1 rounded-full font-medium transition-colors
                    ${!isInternal ? 'bg-indigo-100 text-indigo-700' : 'text-gray-400 hover:text-gray-600'}`}>
                  Réponse publique
                </button>
                <button onClick={() => setIsInternal(true)}
                  className={`text-xs px-3 py-1 rounded-full font-medium transition-colors flex items-center gap-1
                    ${isInternal ? 'bg-yellow-100 text-yellow-700' : 'text-gray-400 hover:text-gray-600'}`}>
                  <Lock className="w-3 h-3" /> Note interne
                </button>
              </div>
              <textarea rows={4}
                className={`w-full text-sm resize-none focus:outline-none p-3 rounded-lg border
                  ${isInternal ? 'bg-yellow-50 border-yellow-200' : 'bg-gray-50 border-gray-200'}`}
                placeholder={isInternal ? 'Note visible uniquement par l\'équipe…' : 'Réponse au client…'}
                value={reply}
                onChange={e => setReply(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey && reply.trim()) replyMutation.mutate() }}
              />
              <div className="flex justify-end mt-3">
                <button onClick={() => replyMutation.mutate()}
                  disabled={!reply.trim() || replyMutation.isPending}
                  className="flex items-center gap-2 bg-indigo-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                  {replyMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Envoyer
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-gray-50 border rounded-xl p-4 text-center text-sm text-gray-400">
              Ticket {ticket.status === 'resolved' ? 'résolu' : 'fermé'}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <div className="bg-white border rounded-xl p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Informations</h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-gray-500">Organisation</dt><dd className="font-medium">{ticket.organization?.name ?? '—'}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">Magasin</dt><dd className="font-medium">{ticket.store?.name ?? '—'}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">Demandeur</dt><dd className="font-medium">{ticket.creator.name}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">Ouvert le</dt><dd className="text-gray-600">{formatDate(ticket.created_at)}</dd></div>
              {ticket.first_response_at && (
                <div className="flex justify-between"><dt className="text-gray-500">1ère réponse</dt><dd className="text-gray-600">{formatDate(ticket.first_response_at)}</dd></div>
              )}
              {ticket.resolved_at && (
                <div className="flex justify-between"><dt className="text-gray-500">Résolu le</dt><dd className="text-green-600 font-medium">{formatDate(ticket.resolved_at)}</dd></div>
              )}
            </dl>
          </div>

          <div className="bg-white border rounded-xl p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Changer le statut</h3>
            <div className="space-y-2">
              {(['open','in_progress','waiting_reply','resolved','closed'] as TicketStatus[])
                .filter(s => s !== ticket.status)
                .map(s => (
                  <button key={s} onClick={() => statusMutation.mutate(s)} disabled={statusMutation.isPending}
                    className="w-full text-left text-sm px-3 py-2 rounded-lg border hover:bg-gray-50 text-gray-700">
                    → {STATUS_LABEL[s]}
                  </button>
                ))
              }
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
