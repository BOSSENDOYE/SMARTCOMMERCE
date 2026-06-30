import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Database, Cloud, Play, Trash2, CheckCircle, XCircle, Clock,
  HardDrive, RefreshCw, Settings, Shield, Zap, AlertTriangle,
  ChevronDown, ChevronUp, Info
} from 'lucide-react'
import axios from 'axios'
import toast from 'react-hot-toast'
import { useSuperAdminStore } from '../../store/superAdmin.store'

// ── API client ────────────────────────────────────────────────────────────────

const saApi = axios.create({
  baseURL: (import.meta.env.VITE_API_URL ?? 'http://localhost:8000') + '/api/v1',
  headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
})
saApi.interceptors.request.use(cfg => {
  const token = useSuperAdminStore.getState().token
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

// ── Types ─────────────────────────────────────────────────────────────────────

interface BackupSettings {
  schedule: 'never' | 'daily' | 'weekly' | 'monthly'
  schedule_time: string
  schedule_day: number
  retention_count: number
  drive_enabled: boolean
  drive_folder_id: string | null
  has_drive_credentials: boolean
  drive_service_account: string | null
  pg_dump_path: string | null
  last_run_at: string | null
  next_run_at: string | null
}

interface BackupLog {
  id: number
  filename: string
  size_bytes: number | null
  size_human: string
  status: 'running' | 'success' | 'failed'
  destinations: string[]
  error_message: string | null
  duration_seconds: number | null
  created_at: string
}

interface LogsResponse {
  logs: BackupLog[]
  total_size: number
  total_count: number
  last_success: string | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function humanSize(bytes: number): string {
  if (bytes >= 1_073_741_824) return (bytes / 1_073_741_824).toFixed(2) + ' GB'
  if (bytes >= 1_048_576)     return (bytes / 1_048_576).toFixed(2)     + ' MB'
  if (bytes >= 1024)          return (bytes / 1024).toFixed(2)           + ' KB'
  return bytes + ' B'
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso))
}

const SCHEDULE_LABELS: Record<string, string> = {
  never: 'Jamais', daily: 'Quotidien', weekly: 'Hebdomadaire', monthly: 'Mensuel',
}

const DAYS_WEEK = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']

// ── Main component ────────────────────────────────────────────────────────────

export default function BackupPage() {
  const qc = useQueryClient()
  const [showDriveForm, setShowDriveForm]     = useState(false)
  const [showAdvanced, setShowAdvanced]        = useState(false)
  const [driveCreds, setDriveCreds]            = useState('')
  const [driveFolderId, setDriveFolderId]      = useState('')
  const [optimizeOutput, setOptimizeOutput]    = useState('')
  const [form, setForm] = useState<Partial<BackupSettings>>({})

  // ── Queries ─────────────────────────────────────────────────────────────────

  const { data: settings, isLoading: settingsLoading } = useQuery<BackupSettings>({
    queryKey: ['backup-settings'],
    queryFn: () => saApi.get('/superadmin/backup/settings').then(r => r.data),
    onSuccess: (d) => {
      setForm(d)
      setDriveFolderId(d.drive_folder_id ?? '')
    },
  })

  const { data: logsData, isLoading: logsLoading } = useQuery<LogsResponse>({
    queryKey: ['backup-logs'],
    queryFn: () => saApi.get('/superadmin/backup/logs').then(r => r.data),
    refetchInterval: 15_000,
  })

  // ── Mutations ────────────────────────────────────────────────────────────────

  const saveMutation = useMutation({
    mutationFn: (data: Partial<BackupSettings>) =>
      saApi.put('/superadmin/backup/settings', data).then(r => r.data),
    onSuccess: () => {
      toast.success('Paramètres sauvegardés')
      qc.invalidateQueries({ queryKey: ['backup-settings'] })
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Erreur'),
  })

  const runMutation = useMutation({
    mutationFn: () => saApi.post('/superadmin/backup/run').then(r => r.data),
    onSuccess: (log: BackupLog) => {
      if (log.status === 'success') toast.success('Sauvegarde réussie !')
      else toast.error('Sauvegarde échouée : ' + log.error_message)
      qc.invalidateQueries({ queryKey: ['backup-logs'] })
      qc.invalidateQueries({ queryKey: ['backup-settings'] })
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Erreur lors du backup'),
  })

  const testDriveMutation = useMutation({
    mutationFn: () => saApi.post('/superadmin/backup/test-drive', {
      drive_folder_id:   driveFolderId,
      drive_credentials: driveCreds,
    }).then(r => r.data),
    onSuccess: (data) => {
      if (data.success) {
        toast.success(`Connexion réussie ! Compte : ${data.service_account}`)
      } else {
        toast.error(data.message)
      }
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Erreur'),
  })

  const saveDriveMutation = useMutation({
    mutationFn: () => saApi.put('/superadmin/backup/settings', {
      drive_folder_id:    driveFolderId || null,
      drive_credentials:  driveCreds   || undefined,
      drive_enabled:      form.drive_enabled,
    }).then(r => r.data),
    onSuccess: () => {
      toast.success('Configuration Drive sauvegardée')
      setDriveCreds('')
      setShowDriveForm(false)
      qc.invalidateQueries({ queryKey: ['backup-settings'] })
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Erreur'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => saApi.delete(`/superadmin/backup/logs/${id}`),
    onSuccess: () => {
      toast.success('Entrée supprimée')
      qc.invalidateQueries({ queryKey: ['backup-logs'] })
    },
    onError: () => toast.error('Erreur lors de la suppression'),
  })

  const optimizeMutation = useMutation({
    mutationFn: () => saApi.post('/superadmin/backup/optimize-indexes').then(r => r.data),
    onSuccess: (data) => {
      setOptimizeOutput(data.output ?? '')
      toast.success('Optimisation terminée')
    },
    onError: () => toast.error('Erreur lors de l\'optimisation'),
  })

  // ── Render ──────────────────────────────────────────────────────────────────

  const logs = logsData?.logs ?? []
  const totalSize = logsData?.total_size ?? 0

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Database size={22} className="text-primary" /> Sauvegardes & Maintenance
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Sauvegarde automatique de la base de données avec envoi vers Google Drive
          </p>
        </div>
        <button
          onClick={() => runMutation.mutate()}
          disabled={runMutation.isPending}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary-600 disabled:opacity-60 transition-colors"
        >
          {runMutation.isPending
            ? <><RefreshCw size={15} className="animate-spin" /> En cours…</>
            : <><Play size={15} /> Lancer un backup</>
          }
        </button>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<Clock size={18} className="text-blue-500" />}
          label="Dernière sauvegarde"
          value={fmtDate(settings?.last_run_at ?? null)}
          bg="bg-blue-50"
        />
        <StatCard
          icon={<RefreshCw size={18} className="text-purple-500" />}
          label="Prochaine sauvegarde"
          value={fmtDate(settings?.next_run_at ?? null)}
          bg="bg-purple-50"
        />
        <StatCard
          icon={<Database size={18} className="text-green-500" />}
          label="Sauvegardes conservées"
          value={`${logsData?.total_count ?? 0} fichiers`}
          bg="bg-green-50"
        />
        <StatCard
          icon={<HardDrive size={18} className="text-orange-500" />}
          label="Espace utilisé"
          value={humanSize(totalSize)}
          bg="bg-orange-50"
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">

        {/* Settings */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-5">
          <h2 className="font-semibold text-gray-800 flex items-center gap-2">
            <Settings size={16} className="text-gray-500" /> Configuration du planning
          </h2>

          {settingsLoading ? (
            <div className="h-32 flex items-center justify-center text-gray-400 text-sm">Chargement…</div>
          ) : (
            <>
              <div className="space-y-4">
                <Field label="Fréquence">
                  <select
                    value={form.schedule ?? 'daily'}
                    onChange={e => setForm(f => ({ ...f, schedule: e.target.value as any }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    {Object.entries(SCHEDULE_LABELS).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Heure d'exécution">
                    <input
                      type="time"
                      value={form.schedule_time ?? '02:00'}
                      onChange={e => setForm(f => ({ ...f, schedule_time: e.target.value }))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </Field>

                  {form.schedule === 'weekly' && (
                    <Field label="Jour de la semaine">
                      <select
                        value={form.schedule_day ?? 1}
                        onChange={e => setForm(f => ({ ...f, schedule_day: +e.target.value }))}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                      >
                        {DAYS_WEEK.map((d, i) => <option key={i} value={i}>{d}</option>)}
                      </select>
                    </Field>
                  )}

                  {form.schedule === 'monthly' && (
                    <Field label="Jour du mois">
                      <input
                        type="number" min={1} max={28}
                        value={form.schedule_day ?? 1}
                        onChange={e => setForm(f => ({ ...f, schedule_day: +e.target.value }))}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                      />
                    </Field>
                  )}
                </div>

                <Field label={`Rétention (garder les ${form.retention_count ?? 7} derniers backups)`}>
                  <input
                    type="range" min={1} max={60}
                    value={form.retention_count ?? 7}
                    onChange={e => setForm(f => ({ ...f, retention_count: +e.target.value }))}
                    className="w-full accent-primary"
                  />
                  <div className="flex justify-between text-xs text-gray-400 mt-1">
                    <span>1</span><span>30</span><span>60</span>
                  </div>
                </Field>

                {/* Advanced */}
                <button
                  onClick={() => setShowAdvanced(v => !v)}
                  className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600"
                >
                  {showAdvanced ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  Paramètres avancés
                </button>

                {showAdvanced && (
                  <Field label="Chemin vers pg_dump (optionnel, auto-détecté si vide)">
                    <input
                      type="text"
                      placeholder="Ex: C:\Program Files\PostgreSQL\16\bin\pg_dump.exe"
                      value={form.pg_dump_path ?? ''}
                      onChange={e => setForm(f => ({ ...f, pg_dump_path: e.target.value || null }))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </Field>
                )}
              </div>

              <button
                onClick={() => saveMutation.mutate(form)}
                disabled={saveMutation.isPending}
                className="w-full py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary-600 disabled:opacity-60 transition-colors"
              >
                {saveMutation.isPending ? 'Enregistrement…' : 'Sauvegarder la configuration'}
              </button>
            </>
          )}
        </div>

        {/* Google Drive */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-5">
          <h2 className="font-semibold text-gray-800 flex items-center gap-2">
            <Cloud size={16} className="text-blue-500" /> Google Drive
          </h2>

          {/* Status badge */}
          <div className={`flex items-center gap-3 p-3 rounded-xl ${
            settings?.drive_enabled && settings?.has_drive_credentials
              ? 'bg-green-50 border border-green-200'
              : 'bg-gray-50 border border-gray-200'
          }`}>
            <div className={`w-2.5 h-2.5 rounded-full ${
              settings?.drive_enabled && settings?.has_drive_credentials ? 'bg-green-500' : 'bg-gray-400'
            }`} />
            <div>
              <p className="text-sm font-medium text-gray-700">
                {settings?.drive_enabled && settings?.has_drive_credentials
                  ? 'Connecté et actif'
                  : settings?.has_drive_credentials
                    ? 'Configuré mais désactivé'
                    : 'Non configuré'
                }
              </p>
              {settings?.drive_service_account && (
                <p className="text-xs text-gray-500 font-mono truncate">{settings.drive_service_account}</p>
              )}
            </div>
          </div>

          {/* Enable toggle */}
          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-sm font-medium text-gray-700">Activer l'envoi vers Drive</span>
            <button
              onClick={() => saveMutation.mutate({ ...form, drive_enabled: !form.drive_enabled })}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                form.drive_enabled ? 'bg-primary' : 'bg-gray-300'
              }`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                form.drive_enabled ? 'translate-x-6' : 'translate-x-1'
              }`} />
            </button>
          </label>

          {/* Drive config form */}
          <div className="space-y-3">
            <Field label="ID du dossier Google Drive">
              <input
                type="text"
                placeholder="Ex: 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs"
                value={driveFolderId}
                onChange={e => setDriveFolderId(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                <Info size={10} /> Copiez l'ID depuis l'URL du dossier Drive
              </p>
            </Field>

            <button
              onClick={() => setShowDriveForm(v => !v)}
              className="flex items-center gap-1.5 text-sm text-primary hover:underline"
            >
              {showDriveForm ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              {settings?.has_drive_credentials
                ? 'Modifier les credentials Service Account'
                : 'Ajouter les credentials Service Account'
              }
            </button>

            {showDriveForm && (
              <div className="space-y-2">
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700 space-y-1">
                  <p className="font-semibold">Comment obtenir les credentials :</p>
                  <p>1. Google Cloud Console → APIs → Google Drive API → Activer</p>
                  <p>2. Identifiants → Compte de service → Créer</p>
                  <p>3. Télécharger le fichier JSON de clé</p>
                  <p>4. Partager le dossier Drive avec l'email du compte de service</p>
                </div>
                <textarea
                  rows={6}
                  placeholder={'Collez ici le contenu du fichier JSON :\n{\n  "type": "service_account",\n  "project_id": "...",\n  "private_key": "...",\n  "client_email": "...",\n  ...\n}'}
                  value={driveCreds}
                  onChange={e => setDriveCreds(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                />
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => testDriveMutation.mutate()}
                disabled={testDriveMutation.isPending || !driveFolderId || !driveCreds}
                className="flex-1 py-2 border border-primary text-primary rounded-xl text-sm font-semibold hover:bg-primary-50 disabled:opacity-40 transition-colors"
              >
                {testDriveMutation.isPending ? 'Test…' : 'Tester la connexion'}
              </button>
              <button
                onClick={() => saveDriveMutation.mutate()}
                disabled={saveDriveMutation.isPending || !driveFolderId}
                className="flex-1 py-2 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary-600 disabled:opacity-40 transition-colors"
              >
                {saveDriveMutation.isPending ? 'Enreg…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Index Optimization */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-semibold text-gray-800 flex items-center gap-2">
              <Zap size={16} className="text-yellow-500" /> Optimisation des Index PostgreSQL
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Analyse les tables et crée automatiquement les index manquants pour accélérer les requêtes
            </p>
          </div>
          <button
            onClick={() => optimizeMutation.mutate()}
            disabled={optimizeMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-yellow-50 border border-yellow-200 text-yellow-700 rounded-xl text-sm font-semibold hover:bg-yellow-100 disabled:opacity-60 transition-colors"
          >
            {optimizeMutation.isPending
              ? <><RefreshCw size={14} className="animate-spin" /> Analyse…</>
              : <><Zap size={14} /> Optimiser maintenant</>
            }
          </button>
        </div>
        {optimizeOutput && (
          <pre className="bg-gray-900 text-green-400 rounded-xl p-4 text-xs overflow-auto max-h-48 font-mono whitespace-pre-wrap">
            {optimizeOutput}
          </pre>
        )}
        {!optimizeOutput && (
          <p className="text-xs text-gray-400">
            Exécuté automatiquement chaque lundi à 03h00. Lancez manuellement pour optimiser immédiatement.
          </p>
        )}
      </div>

      {/* Backup history */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-800 flex items-center gap-2">
            <Shield size={16} className="text-gray-500" /> Historique des sauvegardes
          </h2>
          <span className="text-xs text-gray-400">{logs.length} entrée(s)</span>
        </div>

        {logsLoading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Chargement…</div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">Aucune sauvegarde enregistrée</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                <tr>
                  <th className="px-5 py-3 text-left">Date</th>
                  <th className="px-5 py-3 text-left">Fichier</th>
                  <th className="px-5 py-3 text-left">Taille</th>
                  <th className="px-5 py-3 text-left">Destinations</th>
                  <th className="px-5 py-3 text-left">Durée</th>
                  <th className="px-5 py-3 text-left">Statut</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {logs.map(log => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 text-gray-600 whitespace-nowrap">{fmtDate(log.created_at)}</td>
                    <td className="px-5 py-3 font-mono text-xs text-gray-500 max-w-xs truncate">{log.filename}</td>
                    <td className="px-5 py-3 text-gray-600">{log.size_bytes ? log.size_human : '—'}</td>
                    <td className="px-5 py-3">
                      <div className="flex gap-1">
                        {(log.destinations ?? []).includes('local') && (
                          <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-xs flex items-center gap-0.5">
                            <HardDrive size={10} /> Local
                          </span>
                        )}
                        {(log.destinations ?? []).includes('drive') && (
                          <span className="px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded text-xs flex items-center gap-0.5">
                            <Cloud size={10} /> Drive
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-gray-500">
                      {log.duration_seconds != null ? `${log.duration_seconds}s` : '—'}
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge status={log.status} errorMessage={log.error_message} />
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={() => { if (confirm('Supprimer cette entrée ?')) deleteMutation.mutate(log.id) }}
                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        title="Supprimer"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatCard({ icon, label, value, bg }: {
  icon: React.ReactNode; label: string; value: string; bg: string
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4 flex items-start gap-3">
      <div className={`${bg} p-2.5 rounded-xl`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-xs text-gray-500 truncate">{label}</p>
        <p className="text-sm font-semibold text-gray-800 mt-0.5 truncate">{value}</p>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1">{label}</label>
      {children}
    </div>
  )
}

function StatusBadge({ status, errorMessage }: { status: BackupLog['status']; errorMessage: string | null }) {
  if (status === 'success') return (
    <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
      <CheckCircle size={13} /> Succès
    </span>
  )
  if (status === 'failed') return (
    <span className="flex items-center gap-1 text-xs text-red-600 font-medium" title={errorMessage ?? ''}>
      <XCircle size={13} /> Échec
    </span>
  )
  return (
    <span className="flex items-center gap-1 text-xs text-blue-600 font-medium">
      <RefreshCw size={13} className="animate-spin" /> En cours
    </span>
  )
}
