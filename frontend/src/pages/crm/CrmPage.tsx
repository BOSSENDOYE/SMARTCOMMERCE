import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../lib/api'
import toast from 'react-hot-toast'
import {
  Users, Plus, Phone, Mail, Building2, TrendingUp, Target,
  CheckCircle2, XCircle, ChevronRight, Edit2, Trash2, X, Check,
  ArrowRight, Calendar, MessageSquare, PhoneCall, Video,
  FileText, Star, Clock, AlertCircle, UserPlus, MoreHorizontal,
  Kanban, List, FilePlus2, Receipt,
} from 'lucide-react'
import { useAuthStore } from '../../store/auth.store'
import { useActiveStoreStore } from '../../store/active-store.store'

// ── Types ─────────────────────────────────────────────────────────────────────

type Stage = 'new' | 'qualified' | 'proposal' | 'negotiation' | 'won' | 'lost'
type ActivityType = 'call' | 'email' | 'meeting' | 'visit' | 'whatsapp' | 'sms' | 'note' | 'task'

interface Lead {
  id: number
  title: string
  display_name: string
  display_phone: string
  contact_name?: string
  contact_phone?: string
  contact_email?: string
  company_name?: string
  stage: Stage
  source: string
  probability: number
  expected_amount?: number
  expected_close_date?: string
  notes?: string
  lost_reason?: string
  won_at?: string
  lost_at?: string
  client?: { id: number; name: string; phone: string }
  assigned_to?: { id: number; name: string }
  activities?: Activity[]
  client_sales?: { id: number; reference: string; total_ttc: number; created_at: string }[]
}

interface Activity {
  id: number
  type: ActivityType
  title: string
  description?: string
  scheduled_at?: string
  completed_at?: string
  user?: { id: number; name: string }
}

interface Stats {
  total: number
  pipeline_value: number
  won_count: number
  won_value: number
  overdue_tasks: number
  activities_today: number
  by_stage: Record<Stage, { count: number; value: number }>
}

// ── Constantes ────────────────────────────────────────────────────────────────

const STAGES: { key: Stage; label: string; color: string; bg: string; prob: number }[] = [
  { key: 'new',         label: 'Nouveau',      color: 'text-gray-600',   bg: 'bg-gray-100',   prob: 10 },
  { key: 'qualified',   label: 'Qualifié',     color: 'text-blue-700',   bg: 'bg-blue-100',   prob: 30 },
  { key: 'proposal',    label: 'Proposition',  color: 'text-purple-700', bg: 'bg-purple-100', prob: 50 },
  { key: 'negotiation', label: 'Négociation',  color: 'text-orange-700', bg: 'bg-orange-100', prob: 75 },
  { key: 'won',         label: 'Gagné',        color: 'text-green-700',  bg: 'bg-green-100',  prob: 100 },
  { key: 'lost',        label: 'Perdu',        color: 'text-red-600',    bg: 'bg-red-100',    prob: 0 },
]

const ACTIVITY_ICONS: Record<ActivityType, React.ReactNode> = {
  call:     <PhoneCall size={14} />,
  email:    <Mail size={14} />,
  meeting:  <Video size={14} />,
  visit:    <Users size={14} />,
  whatsapp: <MessageSquare size={14} />,
  sms:      <MessageSquare size={14} />,
  note:     <FileText size={14} />,
  task:     <CheckCircle2 size={14} />,
}

const ACTIVITY_LABELS: Record<ActivityType, string> = {
  call: 'Appel', email: 'Email', meeting: 'Réunion', visit: 'Visite',
  whatsapp: 'WhatsApp', sms: 'SMS', note: 'Note', task: 'Tâche',
}

const SOURCE_LABELS: Record<string, string> = {
  walk_in: 'Visite', referral: 'Recommandation', phone: 'Téléphone',
  whatsapp: 'WhatsApp', social: 'Réseaux sociaux', website: 'Site web',
  email: 'Email', other: 'Autre',
}

const fmt = (n: number) =>
  new Intl.NumberFormat('fr-SN', { style: 'currency', currency: 'XOF', maximumFractionDigits: 0 }).format(n)

const fmtDate = (d?: string) =>
  d ? new Date(d).toLocaleDateString('fr-SN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

const fmtDateTime = (d?: string) =>
  d ? new Date(d).toLocaleString('fr-SN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'

// ── Lead Form Modal ───────────────────────────────────────────────────────────

function LeadFormModal({
  storeId, initial, users, onClose, onSaved,
}: {
  storeId: number
  initial?: Lead | null
  users: { id: number; name: string }[]
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = !!initial

  const [title, setTitle]             = useState(initial?.title ?? '')
  const [contactName, setContactName] = useState(initial?.contact_name ?? '')
  const [phone, setPhone]             = useState(initial?.contact_phone ?? '')
  const [email, setEmail]             = useState(initial?.contact_email ?? '')
  const [company, setCompany]         = useState(initial?.company_name ?? '')
  const [stage, setStage]             = useState<Stage>(initial?.stage ?? 'new')
  const [source, setSource]           = useState(initial?.source ?? 'other')
  const [amount, setAmount]           = useState(String(initial?.expected_amount ?? ''))
  const [closeDate, setCloseDate]     = useState(initial?.expected_close_date ?? '')
  const [assignedTo, setAssignedTo]   = useState(String(initial?.assigned_to?.id ?? ''))
  const [notes, setNotes]             = useState(initial?.notes ?? '')
  const [lostReason, setLostReason]   = useState(initial?.lost_reason ?? '')

  const mut = useMutation({
    mutationFn: (payload: object) => isEdit
      ? api.put(`/crm/leads/${initial!.id}`, payload).then(r => r.data)
      : api.post('/crm/leads', payload).then(r => r.data),
    onSuccess: () => { toast.success(isEdit ? 'Lead mis à jour' : 'Lead créé'); onSaved(); onClose() },
    onError: (e: { response?: { data?: { message?: string } } }) =>
      toast.error(e.response?.data?.message ?? 'Erreur'),
  })

  const handleSubmit = () => {
    if (!title.trim()) return toast.error('Le titre est requis')
    mut.mutate({
      store_id: storeId, title, contact_name: contactName || null,
      contact_phone: phone || null, contact_email: email || null,
      company_name: company || null, stage, source,
      expected_amount: amount ? Number(amount) : null,
      expected_close_date: closeDate || null,
      assigned_to: assignedTo ? Number(assignedTo) : null,
      notes: notes || null,
      lost_reason: lostReason || null,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 overflow-y-auto p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg my-4">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-bold text-gray-800">{isEdit ? 'Modifier le lead' : 'Nouveau lead'}</h2>
          <button onClick={onClose}><X size={20} className="text-gray-400" /></button>
        </div>

        <div className="p-6 space-y-4">
          {/* Titre */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Titre de l'opportunité *</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex: Fourniture mobilier bureau"
              className="w-full border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" />
          </div>

          {/* Contact */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nom contact</label>
              <input value={contactName} onChange={e => setContactName(e.target.value)} placeholder="Amadou Diallo"
                className="w-full border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Téléphone</label>
              <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="77 000 00 00"
                className="w-full border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="contact@email.com"
                className="w-full border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Entreprise</label>
              <input value={company} onChange={e => setCompany(e.target.value)} placeholder="Société SA"
                className="w-full border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          {/* Pipeline */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Étape</label>
              <select value={stage} onChange={e => setStage(e.target.value as Stage)}
                className="w-full border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500">
                {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Source</label>
              <select value={source} onChange={e => setSource(e.target.value)}
                className="w-full border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500">
                {Object.entries(SOURCE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Montant estimé</label>
              <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="500 000"
                className="w-full border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date de clôture prévue</label>
              <input type="date" value={closeDate} onChange={e => setCloseDate(e.target.value)}
                className="w-full border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          {/* Assigné */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Assigné à</label>
            <select value={assignedTo} onChange={e => setAssignedTo(e.target.value)}
              className="w-full border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500">
              <option value="">— Moi-même —</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>

          {stage === 'lost' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Raison de la perte</label>
              <input value={lostReason} onChange={e => setLostReason(e.target.value)} placeholder="Prix trop élevé, concurrent choisi..."
                className="w-full border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} resize-none
              className="w-full border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t bg-gray-50 rounded-b-2xl">
          <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700">Annuler</button>
          <button onClick={handleSubmit} disabled={mut.isPending}
            className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold disabled:opacity-50">
            <Check size={15} />
            {mut.isPending ? 'Sauvegarde...' : isEdit ? 'Mettre à jour' : 'Créer le lead'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Activity Form ─────────────────────────────────────────────────────────────

function ActivityForm({ leadId, onSaved }: { leadId: number; onSaved: () => void }) {
  const [type, setType]         = useState<ActivityType>('call')
  const [title, setTitle]       = useState('')
  const [desc, setDesc]         = useState('')
  const [scheduled, setScheduled] = useState('')
  const [open, setOpen]         = useState(false)

  const mut = useMutation({
    mutationFn: () => api.post(`/crm/leads/${leadId}/activities`, {
      type, title: title || ACTIVITY_LABELS[type], description: desc || null,
      scheduled_at: scheduled || null,
    }).then(r => r.data),
    onSuccess: () => {
      toast.success('Activité enregistrée')
      setTitle(''); setDesc(''); setScheduled(''); setOpen(false)
      onSaved()
    },
    onError: () => toast.error('Erreur'),
  })

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-xl border-2 border-dashed border-gray-200 text-sm text-gray-500 hover:border-blue-300 hover:text-blue-600 transition">
        <Plus size={14} /> Ajouter une activité
      </button>
    )
  }

  return (
    <div className="border rounded-xl p-3 space-y-2 bg-blue-50 border-blue-200">
      {/* Type */}
      <div className="flex flex-wrap gap-1">
        {(Object.keys(ACTIVITY_ICONS) as ActivityType[]).map(t => (
          <button key={t} onClick={() => setType(t)}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition ${
              type === t ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border hover:bg-gray-50'}`}>
            {ACTIVITY_ICONS[t]} {ACTIVITY_LABELS[t]}
          </button>
        ))}
      </div>
      <input value={title} onChange={e => setTitle(e.target.value)} placeholder={`Titre (défaut: ${ACTIVITY_LABELS[type]})`}
        className="w-full border rounded-lg px-2 py-1.5 text-sm focus:ring-1 focus:ring-blue-500" />
      <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2} placeholder="Description..."
        className="w-full border rounded-lg px-2 py-1.5 text-sm focus:ring-1 focus:ring-blue-500 resize-none" />
      {type === 'task' && (
        <input type="datetime-local" value={scheduled} onChange={e => setScheduled(e.target.value)}
          className="w-full border rounded-lg px-2 py-1.5 text-sm focus:ring-1 focus:ring-blue-500" />
      )}
      <div className="flex gap-2">
        <button onClick={() => setOpen(false)} className="flex-1 py-1.5 text-sm border rounded-lg text-gray-600">Annuler</button>
        <button onClick={() => mut.mutate()} disabled={mut.isPending}
          className="flex-1 py-1.5 text-sm bg-blue-600 text-white rounded-lg font-medium disabled:opacity-50">
          {mut.isPending ? '...' : 'Enregistrer'}
        </button>
      </div>
    </div>
  )
}

// ── Lead Detail Panel ─────────────────────────────────────────────────────────

function LeadDetail({
  lead: initial, users, onClose, onRefresh,
}: {
  lead: Lead
  users: { id: number; name: string }[]
  onClose: () => void
  onRefresh: () => void
}) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [showEdit, setShowEdit] = useState(false)

  const { data: lead } = useQuery<Lead>({
    queryKey: ['crm-lead', initial.id],
    queryFn:  () => api.get(`/crm/leads/${initial.id}`).then(r => r.data),
    initialData: initial,
    refetchOnWindowFocus: false,
  })

  const stageInfo = STAGES.find(s => s.key === lead!.stage) ?? STAGES[0]

  const moveStageMut = useMutation({
    mutationFn: (stage: Stage) => api.post(`/crm/leads/${lead!.id}/move-stage`, { stage }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-lead', lead!.id] })
      qc.invalidateQueries({ queryKey: ['crm-leads'] })
      qc.invalidateQueries({ queryKey: ['crm-stats'] })
      onRefresh()
    },
  })

  const convertMut = useMutation({
    mutationFn: () => api.post(`/crm/leads/${lead!.id}/convert-to-client`).then(r => r.data),
    onSuccess: () => {
      toast.success('Converti en client !')
      qc.invalidateQueries({ queryKey: ['crm-lead', lead!.id] })
      onRefresh()
    },
    onError: (e: { response?: { data?: { message?: string } } }) =>
      toast.error(e.response?.data?.message ?? 'Erreur'),
  })

  const completeMut = useMutation({
    mutationFn: (actId: number) => api.post(`/crm/activities/${actId}/complete`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['crm-lead', lead!.id] }),
  })

  const deleteActivityMut = useMutation({
    mutationFn: (actId: number) => api.delete(`/crm/activities/${actId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['crm-lead', lead!.id] }),
  })

  const deleteMut = useMutation({
    mutationFn: () => api.delete(`/crm/leads/${lead!.id}`),
    onSuccess: () => {
      toast.success('Lead supprimé')
      qc.invalidateQueries({ queryKey: ['crm-leads'] })
      qc.invalidateQueries({ queryKey: ['crm-stats'] })
      onClose()
      onRefresh()
    },
  })

  if (!lead) return null

  const pendingTasks = (lead.activities ?? []).filter(a => !a.completed_at && a.type === 'task')
  const doneActivities = (lead.activities ?? []).filter(a => a.completed_at)
  const pendingNotes = (lead.activities ?? []).filter(a => !a.completed_at && a.type !== 'task')

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end bg-black/40" onClick={onClose}>
      <div className="h-full w-full max-w-xl bg-white shadow-2xl overflow-y-auto"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="sticky top-0 bg-white z-10 px-5 py-4 border-b">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-bold text-gray-900 text-base truncate">{lead.title}</h2>
                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${stageInfo.bg} ${stageInfo.color}`}>
                  {stageInfo.label}
                </span>
              </div>
              <div className="text-sm text-gray-500 mt-0.5">{lead.display_name}</div>
            </div>
            <div className="flex items-center gap-1 ml-2 shrink-0">
              <button onClick={() => setShowEdit(true)}
                className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg">
                <Edit2 size={15} />
              </button>
              <button onClick={() => { if (confirm('Supprimer ce lead ?')) deleteMut.mutate() }}
                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                <Trash2 size={15} />
              </button>
              <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg">
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Barre de progression pipeline */}
          <div className="mt-3 flex gap-1">
            {STAGES.filter(s => s.key !== 'lost').map(s => (
              <button key={s.key} onClick={() => moveStageMut.mutate(s.key)}
                title={s.label}
                className={`flex-1 h-1.5 rounded-full transition-all ${
                  ['new','qualified','proposal','negotiation','won'].indexOf(s.key) <=
                  ['new','qualified','proposal','negotiation','won'].indexOf(lead.stage)
                  && lead.stage !== 'lost'
                    ? s.key === 'won' ? 'bg-green-500' : 'bg-blue-500'
                    : 'bg-gray-200'
                }`} />
            ))}
          </div>
          <div className="flex justify-between text-xs text-gray-400 mt-1 px-0.5">
            <span>Nouveau</span><span>Qualifié</span><span>Prop.</span><span>Négo.</span><span>Gagné</span>
          </div>
        </div>

        <div className="p-5 space-y-5">
          {/* KPIs */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-gray-50 rounded-xl p-3 text-center">
              <div className="text-xs text-gray-500 mb-1">Montant</div>
              <div className="font-bold text-sm text-gray-800">
                {lead.expected_amount ? fmt(lead.expected_amount) : '—'}
              </div>
            </div>
            <div className="bg-gray-50 rounded-xl p-3 text-center">
              <div className="text-xs text-gray-500 mb-1">Probabilité</div>
              <div className="font-bold text-sm text-gray-800">{lead.probability}%</div>
            </div>
            <div className="bg-gray-50 rounded-xl p-3 text-center">
              <div className="text-xs text-gray-500 mb-1">Clôture prévue</div>
              <div className="font-bold text-xs text-gray-800">{fmtDate(lead.expected_close_date)}</div>
            </div>
          </div>

          {/* Info contact */}
          <div className="rounded-xl border p-4 space-y-2">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Contact</div>
            {lead.display_name && (
              <div className="flex items-center gap-2 text-sm">
                <Users size={14} className="text-gray-400" /> {lead.display_name}
                {lead.client && <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">Client</span>}
              </div>
            )}
            {lead.display_phone && (
              <div className="flex items-center gap-2 text-sm">
                <Phone size={14} className="text-gray-400" />
                <a href={`tel:${lead.display_phone}`} className="text-blue-600 hover:underline">{lead.display_phone}</a>
              </div>
            )}
            {lead.contact_email && (
              <div className="flex items-center gap-2 text-sm">
                <Mail size={14} className="text-gray-400" />
                <a href={`mailto:${lead.contact_email}`} className="text-blue-600 hover:underline">{lead.contact_email}</a>
              </div>
            )}
            {lead.company_name && (
              <div className="flex items-center gap-2 text-sm">
                <Building2 size={14} className="text-gray-400" /> {lead.company_name}
              </div>
            )}
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Target size={14} className="text-gray-400" /> {SOURCE_LABELS[lead.source] ?? lead.source}
            </div>
            {lead.assigned_to && (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Users size={14} className="text-gray-400" /> Assigné à {lead.assigned_to.name}
              </div>
            )}
          </div>

          {/* Actions rapides */}
          <div className="flex flex-wrap gap-2">
            {lead.stage !== 'won' && lead.stage !== 'lost' && !lead.client_id && (
              <button onClick={() => { if (confirm('Convertir ce lead en client ?')) convertMut.mutate() }}
                disabled={convertMut.isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-xl text-xs font-semibold hover:bg-green-700 disabled:opacity-50">
                <UserPlus size={13} /> Convertir en client
              </button>
            )}
            {lead.stage !== 'won' && (
              <button onClick={() => moveStageMut.mutate('won')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 text-green-700 border border-green-200 rounded-xl text-xs font-semibold hover:bg-green-100">
                <CheckCircle2 size={13} /> Marquer gagné
              </button>
            )}
            {lead.stage !== 'lost' && (
              <button onClick={() => moveStageMut.mutate('lost')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-600 border border-red-200 rounded-xl text-xs font-semibold hover:bg-red-100">
                <XCircle size={13} /> Marquer perdu
              </button>
            )}
          </div>

          {/* Documents commerciaux */}
          <div>
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Documents commerciaux</div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => navigate('/invoices', {
                  state: {
                    crmPrefill: {
                      type: 'quote',
                      client_id: lead.client?.id,
                      client: lead.client,
                      object: lead.title,
                    }
                  }
                })}
                className="flex items-center gap-1.5 px-3 py-2 bg-purple-600 text-white rounded-xl text-xs font-semibold hover:bg-purple-700 transition">
                <FilePlus2 size={13} /> Créer un devis
              </button>
              <button
                onClick={() => navigate('/invoices', {
                  state: {
                    crmPrefill: {
                      type: 'invoice',
                      client_id: lead.client?.id,
                      client: lead.client,
                      object: lead.title,
                    }
                  }
                })}
                className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-xl text-xs font-semibold hover:bg-blue-700 transition">
                <Receipt size={13} /> Créer une facture
              </button>
            </div>
            {!lead.client && (
              <p className="text-xs text-amber-600 mt-1.5">
                Convertissez ce lead en client pour lier les documents automatiquement.
              </p>
            )}
          </div>

          {/* Raison perte */}
          {lead.stage === 'lost' && lead.lost_reason && (
            <div className="bg-red-50 rounded-xl p-3 text-sm text-red-700">
              <div className="font-semibold mb-0.5">Raison de la perte</div>
              {lead.lost_reason}
            </div>
          )}

          {/* Notes */}
          {lead.notes && (
            <div className="bg-yellow-50 rounded-xl p-3 text-sm text-gray-700">
              <div className="font-semibold text-yellow-700 mb-0.5 text-xs uppercase">Notes</div>
              {lead.notes}
            </div>
          )}

          {/* Historique ventes */}
          {(lead.client_sales ?? []).length > 0 && (
            <div>
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Historique achats</div>
              <div className="space-y-1.5">
                {lead.client_sales!.map(s => (
                  <div key={s.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-sm">
                    <span className="text-gray-600">{s.reference}</span>
                    <div className="text-right">
                      <div className="font-semibold">{fmt(s.total_ttc)}</div>
                      <div className="text-xs text-gray-400">{fmtDate(s.created_at)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tâches en attente */}
          {pendingTasks.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-orange-600 uppercase tracking-wide mb-2">
                Tâches à faire ({pendingTasks.length})
              </div>
              <div className="space-y-1.5">
                {pendingTasks.map(a => (
                  <div key={a.id} className="flex items-center gap-2 bg-orange-50 rounded-lg px-3 py-2">
                    <button onClick={() => completeMut.mutate(a.id)}
                      className="w-5 h-5 rounded border-2 border-orange-400 hover:bg-orange-400 flex items-center justify-center flex-shrink-0 transition">
                      {completeMut.isPending ? <span className="text-xs">...</span> : <Check size={11} className="text-white" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-800">{a.title}</div>
                      {a.scheduled_at && (
                        <div className={`text-xs ${new Date(a.scheduled_at) < new Date() ? 'text-red-500' : 'text-gray-400'}`}>
                          <Clock size={10} className="inline mr-0.5" />
                          {fmtDateTime(a.scheduled_at)}
                        </div>
                      )}
                    </div>
                    <button onClick={() => deleteActivityMut.mutate(a.id)}
                      className="text-gray-300 hover:text-red-500 p-0.5"><Trash2 size={12} /></button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Activités */}
          <div>
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Activités</div>
            <ActivityForm leadId={lead.id} onSaved={() => qc.invalidateQueries({ queryKey: ['crm-lead', lead.id] })} />

            <div className="mt-3 space-y-2">
              {[...pendingNotes, ...doneActivities].map(a => (
                <div key={a.id}
                  className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${
                    a.completed_at ? 'bg-gray-50' : 'bg-blue-50'
                  }`}>
                  <div className={`mt-0.5 p-1 rounded-full ${a.completed_at ? 'bg-gray-200 text-gray-500' : 'bg-blue-100 text-blue-600'}`}>
                    {ACTIVITY_ICONS[a.type]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`font-medium ${a.completed_at ? 'text-gray-500' : 'text-gray-800'}`}>{a.title}</div>
                    {a.description && <div className="text-xs text-gray-500 mt-0.5">{a.description}</div>}
                    <div className="text-xs text-gray-400 mt-0.5">
                      {a.user?.name} · {fmtDateTime(a.completed_at ?? a.created_at)}
                    </div>
                  </div>
                  <button onClick={() => deleteActivityMut.mutate(a.id)}
                    className="text-gray-300 hover:text-red-500 p-0.5 mt-0.5"><Trash2 size={12} /></button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {showEdit && (
        <LeadFormModal
          storeId={lead.store_id ?? 0}
          initial={lead}
          users={users}
          onClose={() => setShowEdit(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['crm-lead', lead.id] })
            qc.invalidateQueries({ queryKey: ['crm-leads'] })
            qc.invalidateQueries({ queryKey: ['crm-stats'] })
            onRefresh()
          }}
        />
      )}
    </div>
  )
}

// ── Kanban Column ─────────────────────────────────────────────────────────────

function KanbanColumn({
  stage, leads, onSelect, onMoveStage,
}: {
  stage: typeof STAGES[number]
  leads: Lead[]
  onSelect: (l: Lead) => void
  onMoveStage: (leadId: number, stage: Stage) => void
}) {
  const total = leads.reduce((s, l) => s + (l.expected_amount ?? 0), 0)

  return (
    <div className="flex-shrink-0 w-64 bg-gray-50 rounded-2xl p-3 flex flex-col gap-2 border">
      {/* Header colonne */}
      <div className="flex items-center justify-between px-1 mb-1">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${stage.bg} ${stage.color}`}>
            {stage.label}
          </span>
          <span className="text-xs text-gray-400 font-medium">{leads.length}</span>
        </div>
        {total > 0 && <span className="text-xs font-semibold text-gray-500">{fmt(total)}</span>}
      </div>

      {/* Cartes */}
      <div className="space-y-2 flex-1 overflow-y-auto max-h-[calc(100vh-280px)]">
        {leads.length === 0 && (
          <div className="text-center text-gray-400 text-xs py-6 border-2 border-dashed rounded-xl">
            Aucun lead
          </div>
        )}
        {leads.map(lead => (
          <div
            key={lead.id}
            onClick={() => onSelect(lead)}
            className="bg-white rounded-xl border p-3 cursor-pointer hover:shadow-md hover:border-blue-200 transition group"
          >
            <div className="font-semibold text-sm text-gray-800 mb-1 truncate">{lead.title}</div>
            <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-2">
              <Users size={11} /> {lead.display_name}
            </div>
            {lead.display_phone && (
              <div className="flex items-center gap-1.5 text-xs text-gray-400">
                <Phone size={10} /> {lead.display_phone}
              </div>
            )}
            <div className="flex items-center justify-between mt-2 pt-2 border-t">
              {lead.expected_amount
                ? <span className="text-xs font-bold text-gray-700">{fmt(lead.expected_amount)}</span>
                : <span />
              }
              <div className="flex items-center gap-1">
                <div className="w-12 bg-gray-100 rounded-full h-1.5">
                  <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${lead.probability}%` }} />
                </div>
                <span className="text-xs text-gray-400">{lead.probability}%</span>
              </div>
            </div>
            {lead.expected_close_date && (
              <div className={`text-xs mt-1 flex items-center gap-1 ${
                new Date(lead.expected_close_date) < new Date() && !['won','lost'].includes(lead.stage)
                  ? 'text-red-500' : 'text-gray-400'
              }`}>
                <Calendar size={10} /> {fmtDate(lead.expected_close_date)}
              </div>
            )}

            {/* Boutons move sur hover */}
            {stage.key !== 'won' && stage.key !== 'lost' && (
              <div className="hidden group-hover:flex gap-1 mt-2 pt-2 border-t" onClick={e => e.stopPropagation()}>
                {STAGES.filter(s => s.key !== stage.key && s.key !== 'lost').map(s => (
                  <button key={s.key} onClick={() => onMoveStage(lead.id, s.key)}
                    className={`flex-1 text-xs py-1 rounded-lg ${s.bg} ${s.color} hover:opacity-80`}
                    title={s.label}>
                    →
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE PRINCIPALE
// ═══════════════════════════════════════════════════════════════════════════════

type ViewMode = 'kanban' | 'list'

export default function CrmPage() {
  const { activeStore } = useActiveStoreStore()
  const { user } = useAuthStore()
  const storeId = activeStore?.id ?? (user?.store_id ?? undefined)
  const qc = useQueryClient()

  const [view, setView]             = useState<ViewMode>('kanban')
  const [search, setSearch]         = useState('')
  const [stageFilter, setStageFilter] = useState('')
  const [selected, setSelected]     = useState<Lead | null>(null)
  const [showForm, setShowForm]     = useState(false)

  // ── Données ────────────────────────────────────────────────────────────────

  const { data: stats } = useQuery<Stats>({
    queryKey: ['crm-stats', storeId],
    queryFn: () => api.get('/crm/stats', { params: { store_id: storeId } }).then(r => r.data),
    enabled: !!storeId,
    staleTime: 30_000,
  })

  const { data: kanbanData = {} } = useQuery<Record<Stage, Lead[]>>({
    queryKey: ['crm-leads', 'kanban', storeId],
    queryFn: () => api.get('/crm/leads', { params: { store_id: storeId, kanban: 1 } }).then(r => r.data),
    enabled: !!storeId && view === 'kanban',
    staleTime: 30_000,
  })

  const { data: listData } = useQuery<{ data: Lead[] }>({
    queryKey: ['crm-leads', 'list', storeId, stageFilter, search],
    queryFn: () => api.get('/crm/leads', {
      params: { store_id: storeId, stage: stageFilter || undefined, search: search || undefined, per_page: 50 }
    }).then(r => r.data),
    enabled: !!storeId && view === 'list',
    staleTime: 30_000,
  })

  const { data: users = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ['users-list'],
    queryFn: () => api.get('/users').then(r => r.data.data ?? r.data),
    staleTime: 300_000,
  })

  const moveStageMut = useMutation({
    mutationFn: ({ id, stage }: { id: number; stage: Stage }) =>
      api.post(`/crm/leads/${id}/move-stage`, { stage }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-leads'] })
      qc.invalidateQueries({ queryKey: ['crm-stats'] })
    },
  })

  const handleRefresh = () => {
    qc.invalidateQueries({ queryKey: ['crm-leads'] })
    qc.invalidateQueries({ queryKey: ['crm-stats'] })
  }

  const leads = listData?.data ?? []

  return (
    <div className="p-6 max-w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">CRM — Pipeline commercial</h1>
          <p className="text-sm text-gray-500 mt-0.5">Suivi des prospects et opportunités</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Toggle vue */}
          <div className="flex bg-gray-100 rounded-xl p-1">
            <button onClick={() => setView('kanban')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                view === 'kanban' ? 'bg-white shadow text-gray-800' : 'text-gray-500'}`}>
              <Kanban size={15} /> Kanban
            </button>
            <button onClick={() => setView('list')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                view === 'list' ? 'bg-white shadow text-gray-800' : 'text-gray-500'}`}>
              <List size={15} /> Liste
            </button>
          </div>
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition">
            <Plus size={15} /> Nouveau lead
          </button>
        </div>
      </div>

      {/* KPIs */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">
          <div className="bg-white border rounded-2xl p-4 shadow-sm">
            <div className="text-xs text-gray-500 mb-1">Pipeline total</div>
            <div className="text-lg font-bold text-gray-900">{fmt(stats.pipeline_value ?? 0)}</div>
            <div className="text-xs text-gray-400 mt-0.5">{stats.total} leads</div>
          </div>
          <div className="bg-white border rounded-2xl p-4 shadow-sm">
            <div className="text-xs text-green-600 mb-1">Gagnés</div>
            <div className="text-lg font-bold text-green-700">{fmt(stats.won_value ?? 0)}</div>
            <div className="text-xs text-gray-400 mt-0.5">{stats.won_count} deals</div>
          </div>
          <div className="bg-white border rounded-2xl p-4 shadow-sm">
            <div className="text-xs text-blue-600 mb-1">Nouveaux</div>
            <div className="text-lg font-bold text-blue-700">{stats.by_stage?.new?.count ?? 0}</div>
          </div>
          <div className="bg-white border rounded-2xl p-4 shadow-sm">
            <div className="text-xs text-purple-600 mb-1">Propositions</div>
            <div className="text-lg font-bold text-purple-700">{stats.by_stage?.proposal?.count ?? 0}</div>
          </div>
          <div className="bg-white border rounded-2xl p-4 shadow-sm">
            <div className="text-xs text-orange-600 mb-1">Tâches en retard</div>
            <div className="text-lg font-bold text-orange-700">{stats.overdue_tasks ?? 0}</div>
          </div>
          <div className="bg-white border rounded-2xl p-4 shadow-sm">
            <div className="text-xs text-gray-500 mb-1">Activités aujourd'hui</div>
            <div className="text-lg font-bold text-gray-700">{stats.activities_today ?? 0}</div>
          </div>
        </div>
      )}

      {/* ── VUE KANBAN ────────────────────────────────────────────────────── */}
      {view === 'kanban' && (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {STAGES.filter(s => s.key !== 'lost').map(s => (
            <KanbanColumn
              key={s.key}
              stage={s}
              leads={kanbanData[s.key] ?? []}
              onSelect={setSelected}
              onMoveStage={(id, stage) => moveStageMut.mutate({ id, stage })}
            />
          ))}
          {/* Colonne Perdus séparée */}
          <KanbanColumn
            stage={STAGES.find(s => s.key === 'lost')!}
            leads={kanbanData['lost'] ?? []}
            onSelect={setSelected}
            onMoveStage={(id, stage) => moveStageMut.mutate({ id, stage })}
          />
        </div>
      )}

      {/* ── VUE LISTE ─────────────────────────────────────────────────────── */}
      {view === 'list' && (
        <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
          {/* Filtres */}
          <div className="flex gap-3 px-4 py-3 border-b bg-gray-50">
            <div className="relative flex-1 max-w-xs">
              <input type="text" placeholder="Rechercher..." value={search} onChange={e => setSearch(e.target.value)}
                className="w-full pl-3 pr-3 py-2 rounded-lg border text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
            </div>
            <select value={stageFilter} onChange={e => setStageFilter(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500">
              <option value="">Tous les stages</option>
              {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>

          {leads.length === 0 ? (
            <div className="p-16 text-center">
              <TrendingUp size={48} className="text-gray-200 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">Aucun lead</p>
              <p className="text-gray-400 text-sm mt-1">Créez votre premier prospect</p>
            </div>
          ) : (
            <div className="divide-y">
              {leads.map(lead => {
                const st = STAGES.find(s => s.key === lead.stage) ?? STAGES[0]
                return (
                  <div key={lead.id} className="flex items-center gap-4 px-4 py-3 hover:bg-gray-50 cursor-pointer"
                    onClick={() => setSelected(lead)}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-gray-800">{lead.title}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.bg} ${st.color}`}>
                          {st.label}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {lead.display_name}
                        {lead.display_phone && ` · ${lead.display_phone}`}
                      </div>
                    </div>
                    <div className="hidden sm:block text-right">
                      {lead.expected_amount && (
                        <div className="text-sm font-bold text-gray-800">{fmt(lead.expected_amount)}</div>
                      )}
                      <div className="text-xs text-gray-400">{lead.probability}%</div>
                    </div>
                    <div className="hidden md:block text-xs text-gray-400 w-24 text-right">
                      {fmtDate(lead.expected_close_date)}
                    </div>
                    <ChevronRight size={14} className="text-gray-300" />
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Modal nouveau lead */}
      {showForm && (
        <LeadFormModal
          storeId={storeId!}
          users={users}
          onClose={() => setShowForm(false)}
          onSaved={handleRefresh}
        />
      )}

      {/* Panel détail */}
      {selected && (
        <LeadDetail
          lead={selected}
          users={users}
          onClose={() => setSelected(null)}
          onRefresh={handleRefresh}
        />
      )}
    </div>
  )
}
