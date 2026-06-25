import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ClipboardList, Search, Eye, CheckCircle, XCircle, Clock,
  Building2, Mail, Phone, MapPin, Calendar, Package,
  RefreshCw, MessageSquare, X, User
} from 'lucide-react'
import { useSuperAdminStore } from '../../store/superAdmin.store'
import axios from 'axios'
import toast from 'react-hot-toast'

// ── SA axios instance ─────────────────────────────────────────────────────────

const saApi = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api/v1',
  headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
})
saApi.interceptors.request.use(cfg => {
  const token = useSuperAdminStore.getState().token
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

// ── Types ─────────────────────────────────────────────────────────────────────

interface OnboardingRequest {
  id: number
  status: 'pending' | 'approved' | 'rejected' | 'expired'
  company_name: string
  contact_name: string
  email: string
  phone: string
  activity_type: string
  city: string | null
  country: string | null
  plan_slug: string | null
  duration_months: number | null
  notes: string | null
  rejection_reason: string | null
  reviewer?: { name: string } | null
  reviewed_at: string | null
  created_at: string
}

interface Plan {
  id: number
  name: string
  slug: string
  is_active: boolean
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_CFG = {
  pending:  { label: 'En attente', color: 'bg-amber-100 text-amber-700',  icon: <Clock size={12} /> },
  approved: { label: 'Approuvée',  color: 'bg-green-100 text-green-700',  icon: <CheckCircle size={12} /> },
  rejected: { label: 'Refusée',    color: 'bg-red-100 text-red-700',      icon: <XCircle size={12} /> },
  expired:  { label: 'Expirée',    color: 'bg-gray-100 text-gray-500',    icon: <Clock size={12} /> },
}

// ── Request Detail Modal ──────────────────────────────────────────────────────

function RequestModal({ request, plans, onClose, onApprove, onReject }: {
  request: OnboardingRequest
  plans: Plan[]
  onClose: () => void
  onApprove: (id: number, planSlug: string, durationMonths: number) => void
  onReject: (id: number, reason: string) => void
}) {
  const [rejectReason, setRejectReason] = useState('')
  const [mode, setMode] = useState<'view' | 'reject'>('view')
  const [approveSlug, setApproveSlug] = useState(request.plan_slug || 'business')
  const [approveDuration, setApproveDuration] = useState<number>(request.duration_months || 3)
  const cfg = STATUS_CFG[request.status]

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="p-6 border-b border-gray-100 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{request.company_name}</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Demande #{request.id} · {new Date(request.created_at).toLocaleDateString('fr-FR')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${cfg.color}`}>
              {cfg.icon} {cfg.label}
            </span>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X size={16} /></button>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* Info grid */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Contact</h3>
              <div className="flex items-center gap-2 text-sm text-gray-700"><User size={14} className="text-gray-400 flex-shrink-0" /> {request.contact_name}</div>
              <div className="flex items-center gap-2 text-sm text-gray-700"><Mail size={14} className="text-gray-400 flex-shrink-0" /> {request.email}</div>
              <div className="flex items-center gap-2 text-sm text-gray-700"><Phone size={14} className="text-gray-400 flex-shrink-0" /> {request.phone}</div>
              {request.city && (
                <div className="flex items-center gap-2 text-sm text-gray-700">
                  <MapPin size={14} className="text-gray-400 flex-shrink-0" /> {request.city}{request.country ? `, ${request.country}` : ''}
                </div>
              )}
            </div>
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Demande</h3>
              <div className="flex items-center gap-2 text-sm text-gray-700">
                <Building2 size={14} className="text-gray-400 flex-shrink-0" /> {request.activity_type}
              </div>
              {request.plan_slug && (
                <div className="flex items-center gap-2 text-sm text-gray-700">
                  <Package size={14} className="text-gray-400 flex-shrink-0" />
                  <span className="bg-primary/10 text-primary text-xs font-semibold px-2 py-0.5 rounded-full">{request.plan_slug}</span>
                </div>
              )}
              {request.duration_months && (
                <div className="flex items-center gap-2 text-sm text-gray-700">
                  <Calendar size={14} className="text-gray-400 flex-shrink-0" /> {request.duration_months} mois
                </div>
              )}
            </div>
          </div>

          {/* Notes */}
          {request.notes && (
            <div className="bg-gray-50 rounded-xl p-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 mb-2">
                <MessageSquare size={12} /> Message du client
              </div>
              <p className="text-sm text-gray-700 leading-relaxed">{request.notes}</p>
            </div>
          )}

          {/* Reviewer info for processed requests */}
          {request.status !== 'pending' && request.reviewer && (
            <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-600">
              Traitée par <span className="font-semibold">{request.reviewer.name}</span> le{' '}
              {request.reviewed_at ? new Date(request.reviewed_at).toLocaleDateString('fr-FR') : '—'}
            </div>
          )}

          {/* Reject reason */}
          {request.status === 'rejected' && request.rejection_reason && (
            <div className="bg-red-50 border border-red-100 rounded-xl p-4">
              <p className="text-xs font-semibold text-red-600 mb-1">Motif de refus</p>
              <p className="text-sm text-red-700">{request.rejection_reason}</p>
            </div>
          )}

          {/* Actions for pending */}
          {request.status === 'pending' && (
            <div className="border-t border-gray-100 pt-5 space-y-4">
              {mode === 'view' ? (
                <>
                  <h3 className="font-semibold text-gray-800">Traiter la demande</h3>

                  <div className="grid grid-cols-2 gap-4 p-4 bg-green-50 border border-green-100 rounded-xl">
                    <div>
                      <label className="block text-xs font-medium text-green-800 mb-1">Plan à activer</label>
                      <select className="input text-sm" value={approveSlug} onChange={e => setApproveSlug(e.target.value)}>
                        {plans.filter(p => p.is_active).map(p => (
                          <option key={p.slug} value={p.slug}>{p.name}</option>
                        ))}
                        {plans.length === 0 && <option value="business">Business</option>}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-green-800 mb-1">Durée</label>
                      <select className="input text-sm" value={approveDuration} onChange={e => setApproveDuration(parseInt(e.target.value))}>
                        <option value={1}>1 mois</option>
                        <option value={3}>3 mois</option>
                        <option value={6}>6 mois</option>
                        <option value={12}>12 mois (1 an)</option>
                        <option value={24}>24 mois (2 ans)</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => onApprove(request.id, approveSlug, approveDuration)}
                      className="flex-1 flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white font-semibold py-2.5 rounded-lg text-sm"
                    >
                      <CheckCircle size={16} /> Approuver & Créer le tenant
                    </button>
                    <button
                      onClick={() => setMode('reject')}
                      className="flex-1 flex items-center justify-center gap-2 bg-red-50 hover:bg-red-100 text-red-600 font-semibold py-2.5 rounded-lg text-sm"
                    >
                      <XCircle size={16} /> Refuser
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Motif de refus <span className="text-red-500">*</span></label>
                    <textarea
                      className="input resize-none" rows={3}
                      placeholder="Zone géographique non couverte, informations insuffisantes…"
                      value={rejectReason}
                      onChange={e => setRejectReason(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => { if (rejectReason.trim()) onReject(request.id, rejectReason) }}
                      disabled={!rejectReason.trim()}
                      className="flex-1 flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg text-sm"
                    >
                      <XCircle size={16} /> Confirmer le refus
                    </button>
                    <button onClick={() => setMode('view')}
                      className="flex-1 px-4 py-2.5 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50"
                    >
                      Retour
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function OnboardingRequestsPage() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [selected, setSelected] = useState<OnboardingRequest | null>(null)

  const { data: requestsData, isLoading, refetch } = useQuery({
    queryKey: ['sa-requests'],
    queryFn: () => saApi.get('/superadmin/requests').then(r => r.data),
  })

  const { data: plansData } = useQuery({
    queryKey: ['sa-plans'],
    queryFn: () => saApi.get('/superadmin/plans').then(r => r.data),
  })

  const requests: OnboardingRequest[] = requestsData?.data ?? requestsData ?? []
  const plans: Plan[] = plansData?.data ?? plansData ?? []

  const approveMutation = useMutation({
    mutationFn: ({ id, planSlug, durationMonths }: { id: number; planSlug: string; durationMonths: number }) =>
      saApi.post(`/superadmin/requests/${id}/approve`, { plan_slug: planSlug, duration_months: durationMonths }),
    onSuccess: () => {
      toast.success('Demande approuvée ! Tenant créé avec succès.')
      qc.invalidateQueries({ queryKey: ['sa-requests'] })
      qc.invalidateQueries({ queryKey: ['sa-tenants'] })
      setSelected(null)
    },
    onError: (err: { response?: { data?: { message?: string } } }) =>
      toast.error(err.response?.data?.message ?? "Erreur lors de l'approbation"),
  })

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      saApi.post(`/superadmin/requests/${id}/reject`, { rejection_reason: reason }),
    onSuccess: () => {
      toast.success('Demande refusée.')
      qc.invalidateQueries({ queryKey: ['sa-requests'] })
      setSelected(null)
    },
    onError: () => toast.error('Erreur lors du refus'),
  })

  const filtered = requests.filter(r => {
    const matchSearch = !search || [r.company_name, r.contact_name, r.email, r.city].some(
      v => v?.toLowerCase().includes(search.toLowerCase())
    )
    const matchStatus = statusFilter === 'all' || r.status === statusFilter
    return matchSearch && matchStatus
  })

  const counts = {
    all: requests.length,
    pending: requests.filter(r => r.status === 'pending').length,
    approved: requests.filter(r => r.status === 'approved').length,
    rejected: requests.filter(r => r.status === 'rejected').length,
  }

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Demandes d'onboarding</h1>
          <p className="text-sm text-gray-500 mt-0.5">Gérez les demandes d'accès à la plateforme</p>
        </div>
        <button onClick={() => refetch()} className="flex items-center gap-2 text-sm text-gray-500 bg-white border border-gray-200 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors">
          <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} /> Actualiser
        </button>
      </div>

      {/* Pending alert */}
      {counts.pending > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
          <Clock size={18} className="text-amber-500 flex-shrink-0" />
          <p className="text-sm text-amber-700 font-medium">
            {counts.pending} demande{counts.pending > 1 ? 's' : ''} en attente de traitement
          </p>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {([
          { key: 'all', label: 'Toutes' },
          { key: 'pending', label: 'En attente' },
          { key: 'approved', label: 'Approuvées' },
          { key: 'rejected', label: 'Refusées' },
        ] as const).map(tab => (
          <button key={tab.key} onClick={() => setStatusFilter(tab.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              statusFilter === tab.key ? 'bg-brand text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {tab.label}
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${statusFilter === tab.key ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'}`}>
              {counts[tab.key]}
            </span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input type="text" placeholder="Rechercher par nom, email, ville…" className="input pl-9"
          value={search} onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <RefreshCw size={24} className="animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <ClipboardList size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">Aucune demande trouvée</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left text-xs font-semibold text-gray-500 uppercase px-4 py-3">Entreprise</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase px-4 py-3">Contact</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase px-4 py-3 hidden md:table-cell">Plan</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase px-4 py-3 hidden lg:table-cell">Ville</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase px-4 py-3">Statut</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase px-4 py-3 hidden md:table-cell">Date</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(req => {
                const cfg = STATUS_CFG[req.status]
                return (
                  <tr key={req.id} className="hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => setSelected(req)}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900 text-sm">{req.company_name}</div>
                      <div className="text-xs text-gray-400">{req.activity_type}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-gray-700">{req.contact_name}</div>
                      <div className="text-xs text-gray-400">{req.email}</div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      {req.plan_slug
                        ? <span className="text-xs bg-primary/10 text-primary font-semibold px-2 py-0.5 rounded-full">{req.plan_slug}</span>
                        : <span className="text-xs text-gray-400">Non précisé</span>}
                      {req.duration_months && <div className="text-xs text-gray-400 mt-0.5">{req.duration_months} mois</div>}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-sm text-gray-600">{req.city || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full ${cfg.color}`}>
                        {cfg.icon} {cfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-xs text-gray-400">
                      {new Date(req.created_at).toLocaleDateString('fr-FR')}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Eye size={16} className="text-gray-400 hover:text-brand transition-colors inline-block" />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal */}
      {selected && (
        <RequestModal
          request={selected}
          plans={plans}
          onClose={() => setSelected(null)}
          onApprove={(id, planSlug, durationMonths) => approveMutation.mutate({ id, planSlug, durationMonths })}
          onReject={(id, reason) => rejectMutation.mutate({ id, reason })}
        />
      )}
    </div>
  )
}
