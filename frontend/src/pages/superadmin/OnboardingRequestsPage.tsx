import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle, XCircle, Clock, Eye, ChevronDown } from 'lucide-react'
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

type Status = 'pending' | 'approved' | 'rejected'

interface Request {
  id: number
  company_name: string
  contact_name: string
  email: string
  phone: string
  activity_type: string
  city: string
  plan_name: string
  duration_months: number
  status: Status
  notes: string | null
  created_at: string
  reviewed_at: string | null
}

const statusConfig: Record<Status, { label: string; color: string; icon: React.ElementType }> = {
  pending:  { label: 'En attente', color: 'bg-amber-500/10 text-amber-400 border-amber-500/30',  icon: Clock },
  approved: { label: 'Approuvée',  color: 'bg-green-500/10 text-green-400 border-green-500/30',  icon: CheckCircle },
  rejected: { label: 'Refusée',   color: 'bg-red-500/10 text-red-400 border-red-500/30',         icon: XCircle },
}

export default function OnboardingRequestsPage() {
  const qc = useQueryClient()
  const [filter, setFilter] = useState<Status | 'all'>('pending')
  const [selected, setSelected] = useState<Request | null>(null)
  const [rejectionReason, setRejectionReason] = useState('')

  const { data: requests = [], isLoading } = useQuery<Request[]>({
    queryKey: ['sa-requests', filter],
    queryFn: () => saApi().get(`/onboarding-requests?status=${filter}`).then(r => r.data),
  })

  const approveMutation = useMutation({
    mutationFn: (id: number) => saApi().post(`/onboarding-requests/${id}/approve`),
    onSuccess: () => { toast.success('Demande approuvée'); qc.invalidateQueries({ queryKey: ['sa-requests'] }); setSelected(null) },
    onError:   () => toast.error('Erreur lors de l\'approbation'),
  })

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      saApi().post(`/onboarding-requests/${id}/reject`, { rejection_reason: reason }),
    onSuccess: () => { toast.success('Demande refusée'); qc.invalidateQueries({ queryKey: ['sa-requests'] }); setSelected(null) },
    onError:   () => toast.error('Erreur lors du refus'),
  })

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Demandes d'onboarding</h1>
          <p className="text-gray-400 text-sm">Gérez les demandes d'accès à la plateforme</p>
        </div>
        <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-lg p-1">
          {(['all', 'pending', 'approved', 'rejected'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                filter === f ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              {f === 'all' ? 'Toutes' : statusConfig[f]?.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : requests.length === 0 ? (
        <div className="text-center py-20 text-gray-500">Aucune demande</div>
      ) : (
        <div className="space-y-2">
          {requests.map(req => {
            const cfg = statusConfig[req.status]
            const Icon = cfg.icon
            return (
              <div key={req.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-medium text-white text-sm">{req.company_name}</p>
                    <span className={`inline-flex items-center gap-1 border px-2 py-0.5 rounded-full text-xs ${cfg.color}`}>
                      <Icon className="w-3 h-3" />
                      {cfg.label}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400">{req.contact_name} · {req.email} · {req.city}</p>
                  <p className="text-xs text-gray-500 mt-0.5">Plan : <span className="text-gray-300">{req.plan_name}</span> · {req.duration_months} mois · {req.activity_type}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-gray-500">{new Date(req.created_at).toLocaleDateString('fr-FR')}</span>
                  <button
                    onClick={() => setSelected(req)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg text-xs text-gray-300 transition"
                  >
                    <Eye className="w-3.5 h-3.5" /> Détails
                  </button>
                  {req.status === 'pending' && (
                    <>
                      <button
                        onClick={() => approveMutation.mutate(req.id)}
                        disabled={approveMutation.isPending}
                        className="px-3 py-1.5 bg-green-700 hover:bg-green-600 rounded-lg text-xs text-white transition disabled:opacity-50"
                      >
                        Approuver
                      </button>
                      <button
                        onClick={() => { setSelected(req); setRejectionReason('') }}
                        className="px-3 py-1.5 bg-red-700 hover:bg-red-600 rounded-lg text-xs text-white transition"
                      >
                        Refuser
                      </button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Detail / Reject modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-bold text-white">{selected.company_name}</h2>
            <div className="space-y-1 text-sm">
              {[
                ['Contact',  selected.contact_name],
                ['Email',    selected.email],
                ['Téléphone', selected.phone],
                ['Ville',    selected.city],
                ['Activité', selected.activity_type],
                ['Plan',     selected.plan_name],
                ['Durée',    `${selected.duration_months} mois`],
                ['Notes',    selected.notes ?? '—'],
              ].map(([k, v]) => (
                <div key={k} className="flex gap-2">
                  <span className="text-gray-500 w-24 shrink-0">{k}</span>
                  <span className="text-gray-200">{v}</span>
                </div>
              ))}
            </div>

            {selected.status === 'pending' && (
              <div className="space-y-2">
                <label className="block text-xs text-gray-400">Motif de refus (optionnel)</label>
                <textarea
                  value={rejectionReason}
                  onChange={e => setRejectionReason(e.target.value)}
                  rows={3}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white resize-none focus:outline-none focus:border-indigo-500"
                  placeholder="Expliquez la raison du refus..."
                />
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button onClick={() => setSelected(null)} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm text-gray-300 transition">
                Fermer
              </button>
              {selected.status === 'pending' && (
                <>
                  <button
                    onClick={() => rejectMutation.mutate({ id: selected.id, reason: rejectionReason })}
                    disabled={rejectMutation.isPending}
                    className="px-4 py-2 bg-red-700 hover:bg-red-600 rounded-lg text-sm text-white transition disabled:opacity-50"
                  >
                    Confirmer le refus
                  </button>
                  <button
                    onClick={() => approveMutation.mutate(selected.id)}
                    disabled={approveMutation.isPending}
                    className="px-4 py-2 bg-green-700 hover:bg-green-600 rounded-lg text-sm text-white transition disabled:opacity-50"
                  >
                    Approuver
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
