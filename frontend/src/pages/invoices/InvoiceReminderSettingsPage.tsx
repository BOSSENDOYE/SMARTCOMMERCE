import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../lib/api'
import toast from 'react-hot-toast'
import { useActiveStoreStore } from '../../store/active-store.store'
import { useAuthStore } from '../../store/auth.store'
import {
  Bell, Plus, Trash2, Edit2, Check, X, MessageCircle, Mail, Smartphone,
  ChevronRight, Info, RefreshCw, ToggleLeft, ToggleRight, Phone,
  Wifi, WifiOff, Send, AlertTriangle, CheckCircle2, Loader2,
} from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

type RuleType = 'before_due' | 'on_due' | 'after_due' | 'fixed_monthly'

interface ReminderRule {
  id: number
  type: RuleType
  offset_days: number | null
  day_of_month: number | null
  send_whatsapp: boolean
  send_sms: boolean
  send_email: boolean
  message_template: string | null
  is_active: boolean
  sort_order: number
}

interface RuleFormState {
  type: RuleType
  offset_days: string
  day_of_month_type: 'fixed' | 'before_end'
  day_of_month_fixed: string
  day_of_month_before_end: string
  send_whatsapp: boolean
  send_sms: boolean
  send_email: boolean
  message_template: string
  is_active: boolean
}

interface TwilioStatus {
  configured: boolean
  has_sms: boolean
  has_whatsapp: boolean
  from_sms: string | null
  from_whatsapp: string | null
}

interface MailStatus {
  configured: boolean
  mailer: string
  host: string | null
  port: number | null
  from: string | null
  from_name: string | null
}

const RULE_DESCRIPTIONS: Record<RuleType, string> = {
  before_due:    'Relance X jours avant la date d\'échéance',
  on_due:        'Relance le jour J de l\'échéance',
  after_due:     'Relance X jours après la date d\'échéance (facture impayée)',
  fixed_monthly: 'Relance à une date fixe chaque mois pour toutes les factures impayées',
}

function ruleLabel(rule: ReminderRule): string {
  switch (rule.type) {
    case 'before_due':    return `${rule.offset_days} jour(s) avant l'échéance`
    case 'on_due':        return "Le jour de l'échéance"
    case 'after_due':     return `${rule.offset_days} jour(s) après l'échéance`
    case 'fixed_monthly':
      if (!rule.day_of_month) return 'Date fixe mensuelle'
      return rule.day_of_month > 0
        ? `Le ${rule.day_of_month} de chaque mois`
        : `${Math.abs(rule.day_of_month)} jour(s) avant la fin du mois`
    default: return 'Règle'
  }
}

function ruleChannels(rule: ReminderRule) {
  return [
    rule.send_whatsapp && { icon: <MessageCircle size={11} />, label: 'WhatsApp', color: 'text-green-600 bg-green-50' },
    rule.send_sms      && { icon: <Smartphone size={11} />,    label: 'SMS',       color: 'text-purple-600 bg-purple-50' },
    rule.send_email    && { icon: <Mail size={11} />,          label: 'Email',    color: 'text-blue-600 bg-blue-50' },
  ].filter(Boolean) as { icon: React.ReactNode; label: string; color: string }[]
}

// ── Variables helper ──────────────────────────────────────────────────────────

const TEMPLATE_VARS = [
  { var: '{client}',    desc: 'Nom du client' },
  { var: '{reference}', desc: 'Référence facture' },
  { var: '{amount}',    desc: 'Montant total TTC' },
  { var: '{balance}',   desc: 'Solde restant dû' },
  { var: '{due_date}',  desc: "Date d'échéance" },
  { var: '{store}',     desc: 'Nom du magasin' },
]

// ── Rule Form Modal ───────────────────────────────────────────────────────────

function RuleFormModal({
  rule,
  defaultTemplate,
  onClose,
  storeId,
}: {
  rule?: ReminderRule
  defaultTemplate: string
  onClose: () => void
  storeId: number
}) {
  const qc    = useQueryClient()
  const isEdit = !!rule

  const [form, setForm] = useState<RuleFormState>({
    type:                    rule?.type ?? 'before_due',
    offset_days:             rule?.offset_days != null ? String(rule.offset_days) : '3',
    day_of_month_type:       (rule?.day_of_month != null && rule.day_of_month < 0) ? 'before_end' : 'fixed',
    day_of_month_fixed:      rule?.day_of_month != null && rule.day_of_month > 0 ? String(rule.day_of_month) : '5',
    day_of_month_before_end: rule?.day_of_month != null && rule.day_of_month < 0 ? String(Math.abs(rule.day_of_month)) : '2',
    send_whatsapp:           rule?.send_whatsapp ?? true,
    send_sms:                rule?.send_sms ?? false,
    send_email:              rule?.send_email ?? false,
    message_template:        rule?.message_template ?? defaultTemplate,
    is_active:               rule?.is_active ?? true,
  })

  const buildPayload = () => {
    let day_of_month: number | null = null
    let offset_days:  number | null = null

    if (form.type === 'fixed_monthly') {
      day_of_month = form.day_of_month_type === 'fixed'
        ? parseInt(form.day_of_month_fixed)
        : -Math.abs(parseInt(form.day_of_month_before_end))
    } else if (form.type !== 'on_due') {
      offset_days = parseInt(form.offset_days) || 0
    }

    return {
      type:             form.type,
      offset_days,
      day_of_month,
      send_whatsapp:    form.send_whatsapp,
      send_sms:         form.send_sms,
      send_email:       form.send_email,
      message_template: form.message_template || null,
      is_active:        form.is_active,
    }
  }

  const mutation = useMutation({
    mutationFn: (payload: object) =>
      isEdit
        ? api.put(`/invoice-reminder-rules/${rule!.id}`, payload)
        : api.post('/invoice-reminder-rules', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoice-reminder-rules', storeId] })
      toast.success(isEdit ? 'Règle mise à jour' : 'Règle créée')
      onClose()
    },
    onError: () => toast.error('Erreur lors de la sauvegarde'),
  })

  const insertVar = (v: string) => {
    setForm(f => ({ ...f, message_template: f.message_template + v }))
  }

  const hasChannel = form.send_whatsapp || form.send_sms || form.send_email

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[92vh] flex flex-col">
        <div className="p-5 border-b flex items-center justify-between flex-shrink-0">
          <h2 className="font-bold text-lg flex items-center gap-2">
            <Bell size={18} className="text-primary" />
            {isEdit ? 'Modifier la règle' : 'Nouvelle règle de relance'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Type */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Type de déclenchement</label>
            <div className="space-y-2">
              {(['before_due', 'on_due', 'after_due', 'fixed_monthly'] as RuleType[]).map(t => (
                <label key={t} className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${form.type === t ? 'border-primary bg-primary/5' : 'border-gray-200 hover:border-gray-300'}`}>
                  <input
                    type="radio"
                    checked={form.type === t}
                    onChange={() => setForm(f => ({ ...f, type: t }))}
                    className="mt-0.5 accent-primary"
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-800">
                      {{ before_due: "Avant l'échéance", on_due: "Le jour de l'échéance", after_due: "Après l'échéance", fixed_monthly: 'Date fixe mensuelle' }[t]}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">{RULE_DESCRIPTIONS[t]}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Offset or Day of Month */}
          {(form.type === 'before_due' || form.type === 'after_due') && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                {form.type === 'before_due' ? "Nombre de jours avant l'échéance" : "Nombre de jours après l'échéance"}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number" min="1" max="365"
                  value={form.offset_days}
                  onChange={e => setForm(f => ({ ...f, offset_days: e.target.value }))}
                  className="input w-24 text-center font-mono"
                />
                <span className="text-sm text-gray-500">jours</span>
              </div>
            </div>
          )}

          {form.type === 'fixed_monthly' && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Date de déclenchement</label>
              <div className="space-y-2">
                <label className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer ${form.day_of_month_type === 'fixed' ? 'border-primary bg-primary/5' : 'border-gray-200'}`}>
                  <input type="radio" checked={form.day_of_month_type === 'fixed'} onChange={() => setForm(f => ({ ...f, day_of_month_type: 'fixed' }))} className="accent-primary" />
                  <span className="text-sm text-gray-700 flex items-center gap-2">
                    Le
                    <input type="number" min="1" max="28" value={form.day_of_month_fixed}
                      onChange={e => setForm(f => ({ ...f, day_of_month_fixed: e.target.value }))}
                      onClick={() => setForm(f => ({ ...f, day_of_month_type: 'fixed' }))}
                      className="input w-16 text-center font-mono py-1" />
                    de chaque mois
                  </span>
                </label>
                <label className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer ${form.day_of_month_type === 'before_end' ? 'border-primary bg-primary/5' : 'border-gray-200'}`}>
                  <input type="radio" checked={form.day_of_month_type === 'before_end'} onChange={() => setForm(f => ({ ...f, day_of_month_type: 'before_end' }))} className="accent-primary" />
                  <span className="text-sm text-gray-700 flex items-center gap-2">
                    <input type="number" min="1" max="28" value={form.day_of_month_before_end}
                      onChange={e => setForm(f => ({ ...f, day_of_month_before_end: e.target.value }))}
                      onClick={() => setForm(f => ({ ...f, day_of_month_type: 'before_end' }))}
                      className="input w-16 text-center font-mono py-1" />
                    jours avant la fin du mois
                  </span>
                </label>
              </div>
            </div>
          )}

          {/* Channels */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Canaux d'envoi</label>
            <div className="flex flex-wrap gap-3">
              <label className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 cursor-pointer transition-all ${form.send_whatsapp ? 'border-green-400 bg-green-50' : 'border-gray-200'}`}>
                <input type="checkbox" checked={form.send_whatsapp} onChange={e => setForm(f => ({ ...f, send_whatsapp: e.target.checked }))} className="accent-green-600" />
                <MessageCircle size={14} className="text-green-600" />
                <span className="text-sm font-medium text-gray-700">WhatsApp</span>
              </label>
              <label className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 cursor-pointer transition-all ${form.send_sms ? 'border-purple-400 bg-purple-50' : 'border-gray-200'}`}>
                <input type="checkbox" checked={form.send_sms} onChange={e => setForm(f => ({ ...f, send_sms: e.target.checked }))} className="accent-purple-600" />
                <Smartphone size={14} className="text-purple-600" />
                <span className="text-sm font-medium text-gray-700">SMS</span>
              </label>
              <label className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 cursor-pointer transition-all ${form.send_email ? 'border-blue-400 bg-blue-50' : 'border-gray-200'}`}>
                <input type="checkbox" checked={form.send_email} onChange={e => setForm(f => ({ ...f, send_email: e.target.checked }))} className="accent-blue-600" />
                <Mail size={14} className="text-blue-600" />
                <span className="text-sm font-medium text-gray-700">Email</span>
              </label>
            </div>
          </div>

          {/* Active */}
          <label className="flex items-center gap-3 cursor-pointer">
            <button type="button" onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}>
              {form.is_active ? <ToggleRight size={26} className="text-primary" /> : <ToggleLeft size={26} className="text-gray-300" />}
            </button>
            <span className="text-sm font-medium text-gray-700">Règle active</span>
          </label>

          {/* Message template */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-semibold text-gray-700">Message</label>
              <button type="button" onClick={() => setForm(f => ({ ...f, message_template: defaultTemplate }))} className="text-xs text-primary hover:underline flex items-center gap-1">
                <RefreshCw size={10} /> Modèle par défaut
              </button>
            </div>
            <textarea
              value={form.message_template}
              onChange={e => setForm(f => ({ ...f, message_template: e.target.value }))}
              rows={6}
              className="input resize-none text-sm font-mono"
              placeholder="Message de relance..."
            />
            <div className="flex flex-wrap gap-1.5 mt-2">
              {TEMPLATE_VARS.map(v => (
                <button key={v.var} type="button" title={v.desc} onClick={() => insertVar(v.var)}
                  className="text-xs px-2 py-1 bg-gray-100 hover:bg-primary/10 text-gray-600 hover:text-primary rounded-lg font-mono transition-colors">
                  {v.var}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
              <Info size={10} /> Cliquez sur une variable pour l'insérer. *texte* = gras, _texte_ = italique (WhatsApp)
            </p>
          </div>
        </div>

        <div className="p-5 border-t flex gap-3 flex-shrink-0">
          <button onClick={onClose} className="btn-secondary flex-1">Annuler</button>
          <button
            onClick={() => mutation.mutate(buildPayload())}
            disabled={mutation.isPending || !hasChannel}
            className="btn-primary flex-1 flex items-center justify-center gap-2"
          >
            <Check size={15} />
            {mutation.isPending ? 'Enregistrement...' : (isEdit ? 'Mettre à jour' : 'Créer la règle')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Twilio Config Section ─────────────────────────────────────────────────────

function TwilioConfigSection() {
  const [testPhone, setTestPhone]     = useState('')
  const [testChannel, setTestChannel] = useState<'sms' | 'whatsapp'>('sms')
  const [testResult, setTestResult]   = useState<{ success: boolean; message: string } | null>(null)

  const { data: status, refetch: refetchStatus } = useQuery<TwilioStatus>({
    queryKey: ['twilio-status'],
    queryFn: () => api.get('/twilio/status').then(r => r.data),
    staleTime: 60_000,
  })

  const testConnection = useMutation({
    mutationFn: () => api.post('/twilio/test').then(r => r.data),
    onSuccess: (d: { success: boolean; account_name?: string; error?: string }) => {
      if (d.success) {
        toast.success(`Twilio connecté : ${d.account_name}`)
      } else {
        toast.error(d.error ?? 'Connexion échouée')
      }
    },
    onError: (e: { response?: { data?: { error?: string } } }) => {
      toast.error(e.response?.data?.error ?? 'Erreur de connexion')
    },
  })

  const sendTest = useMutation({
    mutationFn: () => api.post('/twilio/send-test', { to: testPhone, channel: testChannel }).then(r => r.data),
    onSuccess: (d: { success: boolean; sid?: string; error?: string }) => {
      if (d.success) {
        setTestResult({ success: true, message: `Message envoyé ! SID: ${d.sid ?? '—'}` })
        toast.success('Message de test envoyé')
      } else {
        setTestResult({ success: false, message: d.error ?? 'Échec' })
        toast.error(d.error ?? 'Échec d\'envoi')
      }
    },
    onError: (e: { response?: { data?: { error?: string } } }) => {
      const msg = e.response?.data?.error ?? 'Erreur'
      setTestResult({ success: false, message: msg })
      toast.error(msg)
    },
  })

  return (
    <div className="bg-white rounded-2xl border shadow-sm p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-gray-900 flex items-center gap-2">
          <Send size={17} className="text-purple-600" />
          Configuration Twilio
        </h2>
        {status && (
          <span className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full ${status.configured ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
            {status.configured ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
            {status.configured ? 'Connecté' : 'Non configuré'}
          </span>
        )}
      </div>

      {/* Status cards */}
      {status && (
        <div className="grid grid-cols-2 gap-3">
          <div className={`flex items-center gap-3 p-3 rounded-xl border ${status.has_sms ? 'bg-purple-50 border-purple-200' : 'bg-gray-50 border-gray-200'}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${status.has_sms ? 'bg-purple-100' : 'bg-gray-200'}`}>
              <Smartphone size={14} className={status.has_sms ? 'text-purple-600' : 'text-gray-400'} />
            </div>
            <div>
              <p className={`text-xs font-semibold ${status.has_sms ? 'text-purple-700' : 'text-gray-500'}`}>SMS</p>
              <p className="text-xs text-gray-500 font-mono">{status.from_sms ?? 'Non configuré'}</p>
            </div>
            {status.has_sms ? <CheckCircle2 size={14} className="ml-auto text-purple-500" /> : <WifiOff size={14} className="ml-auto text-gray-300" />}
          </div>
          <div className={`flex items-center gap-3 p-3 rounded-xl border ${status.has_whatsapp ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${status.has_whatsapp ? 'bg-green-100' : 'bg-gray-200'}`}>
              <MessageCircle size={14} className={status.has_whatsapp ? 'text-green-600' : 'text-gray-400'} />
            </div>
            <div>
              <p className={`text-xs font-semibold ${status.has_whatsapp ? 'text-green-700' : 'text-gray-500'}`}>WhatsApp</p>
              <p className="text-xs text-gray-500 font-mono">{status.from_whatsapp ?? 'Non configuré'}</p>
            </div>
            {status.has_whatsapp ? <CheckCircle2 size={14} className="ml-auto text-green-500" /> : <WifiOff size={14} className="ml-auto text-gray-300" />}
          </div>
        </div>
      )}

      {/* .env instructions */}
      <div className="bg-gray-900 rounded-xl p-4 text-xs font-mono text-green-400 space-y-1">
        <p className="text-gray-500 mb-2"># Ajoutez ces variables dans votre fichier .env :</p>
        <p>TWILIO_SID=<span className="text-yellow-400">ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx</span></p>
        <p>TWILIO_AUTH_TOKEN=<span className="text-yellow-400">votre_auth_token</span></p>
        <p>TWILIO_FROM_SMS=<span className="text-yellow-400">+221XXXXXXXXX</span></p>
        <p>TWILIO_FROM_WHATSAPP=<span className="text-yellow-400">whatsapp:+221XXXXXXXXX</span></p>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={() => testConnection.mutate()}
          disabled={testConnection.isPending || !status?.configured}
          className="flex items-center gap-2 px-4 py-2 border rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 transition"
        >
          {testConnection.isPending ? <Loader2 size={14} className="animate-spin" /> : <Wifi size={14} />}
          Tester la connexion
        </button>
        <button
          onClick={() => refetchStatus()}
          className="flex items-center gap-2 px-3 py-2 border rounded-xl text-sm text-gray-500 hover:bg-gray-50 transition"
        >
          <RefreshCw size={13} /> Actualiser
        </button>
      </div>

      {/* Send test message */}
      {status?.configured && (
        <div className="border-t pt-4">
          <p className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <Send size={13} /> Envoyer un message de test
          </p>
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Phone size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="tel"
                value={testPhone}
                onChange={e => setTestPhone(e.target.value)}
                placeholder="+221 77 000 00 00"
                className="input pl-9 font-mono text-sm"
              />
            </div>
            <select
              value={testChannel}
              onChange={e => setTestChannel(e.target.value as 'sms' | 'whatsapp')}
              className="input w-36 text-sm"
            >
              {status.has_sms      && <option value="sms">SMS</option>}
              {status.has_whatsapp && <option value="whatsapp">WhatsApp</option>}
            </select>
            <button
              onClick={() => { setTestResult(null); sendTest.mutate() }}
              disabled={sendTest.isPending || !testPhone.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-sm font-semibold disabled:opacity-40 transition"
            >
              {sendTest.isPending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
              Envoyer
            </button>
          </div>
          {testResult && (
            <div className={`mt-2 flex items-center gap-2 text-xs px-3 py-2 rounded-lg ${testResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
              {testResult.success ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
              {testResult.message}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Email Config Section ──────────────────────────────────────────────────────

function EmailConfigSection() {
  const [testEmail, setTestEmail]   = useState('')
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)

  const { data: status, refetch: refetchStatus } = useQuery<MailStatus>({
    queryKey: ['mail-status'],
    queryFn: () => api.get('/mail/status').then(r => r.data),
    staleTime: 60_000,
  })

  const testConnection = useMutation({
    mutationFn: () => api.post('/mail/test').then(r => r.data),
    onSuccess: (d: { success: boolean; from?: string; error?: string }) => {
      if (d.success) {
        toast.success(`Email SMTP connecté — test envoyé à ${d.from}`)
        refetchStatus()
      } else {
        toast.error(d.error ?? 'Connexion échouée')
      }
    },
    onError: (e: { response?: { data?: { error?: string } } }) => {
      toast.error(e.response?.data?.error ?? 'Erreur de connexion')
    },
  })

  const sendTest = useMutation({
    mutationFn: () => api.post('/mail/send-test', { to: testEmail }).then(r => r.data),
    onSuccess: (d: { success: boolean; error?: string }) => {
      if (d.success) {
        setTestResult({ success: true, message: `Email de test envoyé à ${testEmail}` })
        toast.success('Email de test envoyé')
      } else {
        setTestResult({ success: false, message: d.error ?? 'Échec' })
        toast.error(d.error ?? 'Échec d\'envoi')
      }
    },
    onError: (e: { response?: { data?: { error?: string } } }) => {
      const msg = e.response?.data?.error ?? 'Erreur'
      setTestResult({ success: false, message: msg })
      toast.error(msg)
    },
  })

  return (
    <div className="bg-white rounded-2xl border shadow-sm p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-gray-900 flex items-center gap-2">
          <Mail size={17} className="text-blue-600" />
          Configuration Email (SMTP)
        </h2>
        {status && (
          <span className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full ${status.configured ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
            {status.configured ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
            {status.configured ? 'Connecté' : 'Non configuré'}
          </span>
        )}
      </div>

      {/* Status details */}
      {status && (
        <div className="grid grid-cols-2 gap-3">
          <div className={`flex items-center gap-3 p-3 rounded-xl border ${status.configured ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200'}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${status.configured ? 'bg-blue-100' : 'bg-gray-200'}`}>
              <Mail size={14} className={status.configured ? 'text-blue-600' : 'text-gray-400'} />
            </div>
            <div className="min-w-0">
              <p className={`text-xs font-semibold truncate ${status.configured ? 'text-blue-700' : 'text-gray-500'}`}>
                {status.mailer ? status.mailer.toUpperCase() : 'Non défini'}
              </p>
              <p className="text-xs text-gray-500 font-mono truncate">{status.from ?? 'hello@example.com'}</p>
            </div>
            {status.configured ? <CheckCircle2 size={14} className="ml-auto flex-shrink-0 text-blue-500" /> : <WifiOff size={14} className="ml-auto flex-shrink-0 text-gray-300" />}
          </div>
          <div className="flex items-center gap-3 p-3 rounded-xl border bg-gray-50 border-gray-200">
            <div className="w-8 h-8 rounded-full flex items-center justify-center bg-gray-200">
              <Wifi size={14} className="text-gray-400" />
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500">Serveur SMTP</p>
              <p className="text-xs text-gray-500 font-mono">{status.host ? `${status.host}:${status.port ?? '587'}` : 'Non configuré'}</p>
            </div>
          </div>
        </div>
      )}

      {/* .env instructions */}
      <div className="bg-gray-900 rounded-xl p-4 text-xs font-mono text-green-400 space-y-1">
        <p className="text-gray-500 mb-2"># Configurez SMTP dans votre fichier .env :</p>
        <p>MAIL_MAILER=<span className="text-yellow-400">smtp</span></p>
        <p>MAIL_HOST=<span className="text-yellow-400">smtp.gmail.com</span></p>
        <p>MAIL_PORT=<span className="text-yellow-400">587</span></p>
        <p>MAIL_USERNAME=<span className="text-yellow-400">votre@email.com</span></p>
        <p>MAIL_PASSWORD=<span className="text-yellow-400">votre_mot_de_passe</span></p>
        <p>MAIL_ENCRYPTION=<span className="text-yellow-400">tls</span></p>
        <p>MAIL_FROM_ADDRESS=<span className="text-yellow-400">votre@email.com</span></p>
        <p>MAIL_FROM_NAME=<span className="text-yellow-400">"SMARTCOMMERCE"</span></p>
      </div>

      <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-700 flex items-start gap-2">
        <Info size={13} className="mt-0.5 flex-shrink-0" />
        <span>
          Pour Gmail : activez <strong>l'authentification à 2 facteurs</strong> puis générez un <strong>mot de passe d'application</strong> dans les paramètres de sécurité Google.
          Pour Sendinblue/Brevo, Mailgun ou autre service transactionnel, utilisez leurs identifiants SMTP.
        </span>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={() => testConnection.mutate()}
          disabled={testConnection.isPending || !status?.configured}
          className="flex items-center gap-2 px-4 py-2 border rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 transition"
        >
          {testConnection.isPending ? <Loader2 size={14} className="animate-spin" /> : <Wifi size={14} />}
          Tester la connexion
        </button>
        <button
          onClick={() => refetchStatus()}
          className="flex items-center gap-2 px-3 py-2 border rounded-xl text-sm text-gray-500 hover:bg-gray-50 transition"
        >
          <RefreshCw size={13} /> Actualiser
        </button>
      </div>

      {/* Send test email */}
      {status?.configured && (
        <div className="border-t pt-4">
          <p className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <Send size={13} /> Envoyer un email de test
          </p>
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Mail size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="email"
                value={testEmail}
                onChange={e => setTestEmail(e.target.value)}
                placeholder="destinataire@email.com"
                className="input pl-9 text-sm"
              />
            </div>
            <button
              onClick={() => { setTestResult(null); sendTest.mutate() }}
              disabled={sendTest.isPending || !testEmail.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold disabled:opacity-40 transition"
            >
              {sendTest.isPending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
              Envoyer
            </button>
          </div>
          {testResult && (
            <div className={`mt-2 flex items-center gap-2 text-xs px-3 py-2 rounded-lg ${testResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
              {testResult.success ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
              {testResult.message}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function InvoiceReminderSettingsPage() {
  const { activeStore } = useActiveStoreStore()
  const { user }        = useAuthStore()
  const qc              = useQueryClient()

  const storeId   = activeStore?.id ?? (user?.store_id ?? 0)
  const storeName = activeStore?.name ?? user?.store?.name ?? ''

  const [showRuleForm, setShowRuleForm] = useState(false)
  const [editRule, setEditRule]         = useState<ReminderRule | undefined>()
  const [whatsappInput, setWhatsappInput] = useState('')
  const [whatsappSaved, setWhatsappSaved] = useState(false)

  // Store info (for whatsapp_number)
  const { data: storeInfo } = useQuery<{ whatsapp_number?: string | null }>({
    queryKey: ['store-info', storeId],
    queryFn: () => api.get(`/stores/${storeId}`).then(r => r.data),
    enabled: !!storeId,
  })

  useEffect(() => {
    if (storeInfo?.whatsapp_number != null) {
      setWhatsappInput(storeInfo.whatsapp_number ?? '')
    }
  }, [storeInfo])

  // Default template
  const { data: defaultTemplateData } = useQuery<{ template: string }>({
    queryKey: ['reminder-default-template'],
    queryFn: () => api.get('/invoice-reminder-rules/default-template').then(r => r.data),
    staleTime: Infinity,
  })

  // Rules
  const { data: rules = [], isLoading } = useQuery<ReminderRule[]>({
    queryKey: ['invoice-reminder-rules', storeId],
    queryFn: () => api.get('/invoice-reminder-rules').then(r => r.data),
    enabled: !!storeId,
  })

  // Save whatsapp
  const saveWhatsapp = useMutation({
    mutationFn: () => api.put(`/stores/${storeId}`, { whatsapp_number: whatsappInput }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['store-info', storeId] })
      setWhatsappSaved(true)
      toast.success('Numéro WhatsApp enregistré')
      setTimeout(() => setWhatsappSaved(false), 3000)
    },
    onError: () => toast.error('Erreur lors de la sauvegarde'),
  })

  // Toggle active
  const toggleActive = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) =>
      api.put(`/invoice-reminder-rules/${id}`, { is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invoice-reminder-rules', storeId] }),
    onError: () => toast.error('Erreur'),
  })

  // Delete rule
  const deleteRule = useMutation({
    mutationFn: (id: number) => api.delete(`/invoice-reminder-rules/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoice-reminder-rules', storeId] })
      toast.success('Règle supprimée')
    },
    onError: () => toast.error('Erreur lors de la suppression'),
  })

  // Process queue manually
  const processQueue = useMutation({
    mutationFn: () => api.post('/invoice-reminder-queue/process'),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['invoice-reminder-queue'] })
      toast.success(r.data.message || 'File générée')
    },
    onError: () => toast.error('Erreur lors du traitement'),
  })

  const defaultTemplate = defaultTemplateData?.template ?? ''

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Bell size={22} className="text-primary" />
          Configuration des relances
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          Définissez quand et comment relancer vos clients pour les factures impayées — {storeName}
        </p>
      </div>

      {/* Twilio Configuration */}
      <TwilioConfigSection />

      {/* Email Configuration */}
      <EmailConfigSection />

      {/* WhatsApp Number */}
      <div className="bg-white rounded-2xl border shadow-sm p-6">
        <h2 className="font-bold text-gray-900 flex items-center gap-2 mb-4">
          <MessageCircle size={17} className="text-green-600" />
          Numéro WhatsApp du magasin
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          Numéro WhatsApp Business enregistré dans Twilio (expéditeur pour les relances WhatsApp). Incluez l'indicatif pays.
        </p>
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="tel"
              value={whatsappInput}
              onChange={e => setWhatsappInput(e.target.value)}
              placeholder="+221 77 000 00 00"
              className="input pl-9 font-mono"
            />
          </div>
          <button
            onClick={() => saveWhatsapp.mutate()}
            disabled={saveWhatsapp.isPending || !whatsappInput.trim()}
            className="btn-primary flex items-center gap-2 px-5"
          >
            <Check size={15} />
            {saveWhatsapp.isPending ? 'Enregistrement...' : whatsappSaved ? 'Enregistré !' : 'Enregistrer'}
          </button>
        </div>
        {storeInfo?.whatsapp_number && (
          <p className="text-xs text-gray-400 mt-2 flex items-center gap-1">
            <Check size={10} className="text-green-500" />
            Actuel : {storeInfo.whatsapp_number}
          </p>
        )}
      </div>

      {/* Rules */}
      <div className="bg-white rounded-2xl border shadow-sm p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-bold text-gray-900 flex items-center gap-2">
            <Bell size={17} className="text-primary" />
            Règles de relance
            <span className="text-xs font-normal text-gray-400 ml-1">
              ({rules.filter(r => r.is_active).length} actives / {rules.length} total)
            </span>
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => processQueue.mutate()}
              disabled={processQueue.isPending}
              title="Générer la file d'attente maintenant (normalement automatique à 08h00)"
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-primary border rounded-lg px-3 py-1.5 hover:border-primary transition-colors"
            >
              <RefreshCw size={12} className={processQueue.isPending ? 'animate-spin' : ''} />
              Générer maintenant
            </button>
            <button
              onClick={() => { setEditRule(undefined); setShowRuleForm(true) }}
              className="btn-primary flex items-center gap-2 text-sm px-4 py-2"
            >
              <Plus size={14} /> Ajouter une règle
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-8 text-gray-400">Chargement...</div>
        ) : rules.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <Bell size={36} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">Aucune règle configurée</p>
            <p className="text-xs mt-1">Ajoutez votre première règle de relance</p>
          </div>
        ) : (
          <div className="space-y-3">
            {rules.map(rule => (
              <div
                key={rule.id}
                className={`flex items-center gap-4 p-4 rounded-xl border transition-all ${rule.is_active ? 'border-gray-200 bg-white' : 'border-dashed border-gray-200 bg-gray-50 opacity-60'}`}
              >
                <button onClick={() => toggleActive.mutate({ id: rule.id, is_active: !rule.is_active })}>
                  {rule.is_active ? <ToggleRight size={24} className="text-primary" /> : <ToggleLeft size={24} className="text-gray-300" />}
                </button>

                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 text-sm">{ruleLabel(rule)}</p>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    {ruleChannels(rule).map(ch => (
                      <span key={ch.label} className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${ch.color}`}>
                        {ch.icon}{ch.label}
                      </span>
                    ))}
                    <ChevronRight size={10} className="text-gray-300" />
                    <span className="text-xs text-gray-400">
                      {{ before_due: 'Avant échéance', on_due: 'Jour J', after_due: 'Après échéance', fixed_monthly: 'Mensuel' }[rule.type]}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => { setEditRule(rule); setShowRuleForm(true) }} className="p-1.5 text-gray-400 hover:text-primary hover:bg-gray-100 rounded-lg transition-colors">
                    <Edit2 size={14} />
                  </button>
                  <button
                    onClick={() => { if (confirm('Supprimer cette règle ?')) deleteRule.mutate(rule.id) }}
                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-5 p-4 bg-blue-50 border border-blue-100 rounded-xl flex items-start gap-3 text-sm text-blue-700">
          <Info size={15} className="mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-semibold text-sm">Comment ça fonctionne</p>
            <p className="text-xs text-blue-600 mt-0.5">
              Chaque jour à 08h00, le système génère automatiquement la file des relances.
              Avec Twilio configuré, cliquer sur <strong>Envoyer</strong> dans l'onglet Relances déclenche l'envoi réel du SMS ou message WhatsApp.
              Sans Twilio, un lien wa.me est utilisé comme alternative.
            </p>
          </div>
        </div>
      </div>

      {showRuleForm && defaultTemplate && (
        <RuleFormModal
          rule={editRule}
          defaultTemplate={defaultTemplate}
          storeId={storeId}
          onClose={() => { setShowRuleForm(false); setEditRule(undefined) }}
        />
      )}
    </div>
  )
}
