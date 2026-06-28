import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../lib/api'
import toast from 'react-hot-toast'
import { Mail, Save, Send, Eye, EyeOff, CheckCircle, AlertCircle, Loader2, Trash2 } from 'lucide-react'

interface MailSettings {
  mail_host:         string | null
  mail_port:         number | null
  mail_username:     string | null
  mail_password:     string | null
  mail_encryption:   string | null
  mail_from_address: string | null
  mail_from_name:    string | null
  is_configured:     boolean
}

export default function MailSettingsPage() {
  const qc = useQueryClient()
  const [showPass, setShowPass] = useState(false)
  const [testEmail, setTestEmail] = useState('')

  const { data, isLoading } = useQuery<MailSettings>({
    queryKey: ['mail-settings'],
    queryFn: () => api.get('/mail-settings').then(r => r.data),
  })

  const [form, setForm] = useState<Partial<MailSettings>>({})

  const current = { ...data, ...form }

  const set = (k: keyof MailSettings, v: string | number | null) =>
    setForm(prev => ({ ...prev, [k]: v }))

  const saveMut = useMutation({
    mutationFn: () => api.put('/mail-settings', form),
    onSuccess: () => {
      toast.success('Configuration email sauvegardée')
      qc.invalidateQueries({ queryKey: ['mail-settings'] })
      setForm({})
    },
    onError: (e: { response?: { data?: { message?: string } } }) =>
      toast.error(e.response?.data?.message ?? 'Erreur'),
  })

  const testMut = useMutation({
    mutationFn: () => api.post('/mail-settings/test', { to: testEmail }),
    onSuccess: () => toast.success('Email de test envoyé ! Vérifiez votre boîte.'),
    onError: (e: { response?: { data?: { message?: string } } }) =>
      toast.error(e.response?.data?.message ?? 'Erreur SMTP'),
  })

  const clearMut = useMutation({
    mutationFn: () => api.put('/mail-settings', { mail_host: null }),
    onSuccess: () => {
      toast.success('Configuration supprimée — le SMTP système sera utilisé')
      qc.invalidateQueries({ queryKey: ['mail-settings'] })
      setForm({})
    },
  })

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center h-48">
        <Loader2 size={24} className="animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="p-3 sm:p-6 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-primary-100 rounded-xl flex items-center justify-center">
          <Mail size={20} className="text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Configuration Email</h1>
          <p className="text-sm text-gray-500">SMTP de votre organisation pour les envois (factures, relances…)</p>
        </div>
      </div>

      {/* Statut */}
      <div className={`flex items-center gap-3 p-4 rounded-xl border ${
        data?.is_configured
          ? 'bg-green-50 border-green-200'
          : 'bg-amber-50 border-amber-200'
      }`}>
        {data?.is_configured
          ? <CheckCircle size={18} className="text-green-600 flex-shrink-0" />
          : <AlertCircle size={18} className="text-amber-500 flex-shrink-0" />
        }
        <div className="text-sm">
          {data?.is_configured
            ? <><span className="font-semibold text-green-800">SMTP configuré</span> — vos emails sont envoyés via {data.mail_from_address || data.mail_username}</>
            : <><span className="font-semibold text-amber-700">Non configuré</span> — le SMTP système est utilisé par défaut</>
          }
        </div>
      </div>

      {/* Formulaire */}
      <div className="bg-white rounded-2xl border shadow-sm p-6 space-y-5">
        <h2 className="font-semibold text-gray-800">Paramètres SMTP</h2>

        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 sm:col-span-1">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Serveur SMTP (host)
            </label>
            <input
              type="text"
              value={current.mail_host ?? ''}
              onChange={e => set('mail_host', e.target.value || null)}
              placeholder="mail.mondomaine.com"
              className="w-full border rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Port
            </label>
            <input
              type="number"
              value={current.mail_port ?? ''}
              onChange={e => set('mail_port', e.target.value ? parseInt(e.target.value) : null)}
              placeholder="587"
              className="w-full border rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
            Chiffrement
          </label>
          <select
            value={current.mail_encryption ?? 'tls'}
            onChange={e => set('mail_encryption', e.target.value)}
            className="w-full border rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary"
          >
            <option value="tls">STARTTLS (port 587) — Recommandé</option>
            <option value="ssl">SSL (port 465)</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Identifiant (email)
            </label>
            <input
              type="email"
              value={current.mail_username ?? ''}
              onChange={e => set('mail_username', e.target.value || null)}
              placeholder="no-reply@mondomaine.com"
              className="w-full border rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Mot de passe SMTP
            </label>
            <div className="relative">
              <input
                type={showPass ? 'text' : 'password'}
                value={current.mail_password ?? ''}
                onChange={e => set('mail_password', e.target.value || null)}
                placeholder="••••••••"
                className="w-full border rounded-xl px-3 py-2.5 pr-10 text-sm focus:ring-2 focus:ring-primary focus:border-transparent"
              />
              <button
                type="button"
                onClick={() => setShowPass(v => !v)}
                className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
              >
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Email expéditeur
            </label>
            <input
              type="email"
              value={current.mail_from_address ?? ''}
              onChange={e => set('mail_from_address', e.target.value || null)}
              placeholder="contact@mondomaine.com"
              className="w-full border rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Nom expéditeur
            </label>
            <input
              type="text"
              value={current.mail_from_name ?? ''}
              onChange={e => set('mail_from_name', e.target.value || null)}
              placeholder="Mon Magasin"
              className="w-full border rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>
        </div>

        <div className="flex items-center gap-3 pt-2 border-t">
          <button
            onClick={() => saveMut.mutate()}
            disabled={saveMut.isPending || Object.keys(form).length === 0}
            className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:opacity-90 disabled:opacity-40 transition"
          >
            {saveMut.isPending ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            Enregistrer
          </button>

          {data?.is_configured && (
            <button
              onClick={() => clearMut.mutate()}
              disabled={clearMut.isPending}
              className="flex items-center gap-2 px-4 py-2.5 border border-red-200 text-red-600 rounded-xl text-sm font-medium hover:bg-red-50 transition"
            >
              <Trash2 size={14} /> Supprimer la config
            </button>
          )}
        </div>
      </div>

      {/* Test */}
      <div className="bg-white rounded-2xl border shadow-sm p-6">
        <h2 className="font-semibold text-gray-800 mb-4">Tester la configuration</h2>
        <div className="flex gap-3">
          <input
            type="email"
            value={testEmail}
            onChange={e => setTestEmail(e.target.value)}
            placeholder="votre@email.com"
            className="flex-1 border rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary focus:border-transparent"
          />
          <button
            onClick={() => testMut.mutate()}
            disabled={testMut.isPending || !testEmail}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:opacity-90 disabled:opacity-40 transition"
          >
            {testMut.isPending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            Envoyer un test
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-2">
          Un email de test sera envoyé pour vérifier que votre configuration SMTP fonctionne.
        </p>
      </div>
    </div>
  )
}
