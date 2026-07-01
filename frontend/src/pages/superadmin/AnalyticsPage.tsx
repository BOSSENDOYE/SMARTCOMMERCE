import { useQuery } from '@tanstack/react-query'
import {
  Users, Activity, TrendingUp, Calendar,
  Building2, RefreshCw, Wifi
} from 'lucide-react'
import axios from 'axios'
import { useSuperAdminStore } from '../../store/superAdmin.store'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Cell,
} from 'recharts'

// ── API ───────────────────────────────────────────────────────────────────────

const saApi = axios.create({
  baseURL: (import.meta.env.VITE_API_URL ?? 'http://localhost:8000') + '/api/v1',
  headers: { Accept: 'application/json' },
})
saApi.interceptors.request.use(cfg => {
  const token = useSuperAdminStore.getState().token
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

// ── Types ─────────────────────────────────────────────────────────────────────

interface ActiveUser {
  id: number
  name: string
  store_id: number
  last_used_at: string
}

interface DayStats {
  day: string
  sessions: number
  unique_users: number
}

interface OrgStats {
  org_name: string
  sessions: number
  users: number
}

interface Analytics {
  active_now: ActiveUser[]
  active_now_count: number
  today_sessions: number
  today_unique_users: number
  sessions_by_day: DayStats[]
  top_orgs: OrgStats[]
  total_users: number
  total_sessions_30d: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDay(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short' }).format(d)
}

function minutesAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'à l\'instant'
  if (mins < 60) return `il y a ${mins} min`
  return `il y a ${Math.floor(mins / 60)}h`
}

const ORG_COLORS = ['#6366f1', '#8b5cf6', '#a78bfa', '#c4b5fd', '#ddd6fe', '#818cf8', '#4f46e5', '#7c3aed', '#9333ea', '#a855f7']

// ── Main ─────────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const { data, isLoading, refetch, isFetching } = useQuery<Analytics>({
    queryKey: ['superadmin-analytics'],
    queryFn: (): Promise<Analytics> => saApi.get('/superadmin/analytics').then(r => r.data),
    refetchInterval: 60_000,
  })

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Activity size={22} className="text-primary" /> Analytiques & Activité
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Suivi en temps réel des connexions et visites — actualisé toutes les 60s
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-50 transition-colors"
        >
          <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
          Actualiser
        </button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 bg-gray-100 animate-pulse rounded-2xl" />
          ))}
        </div>
      ) : (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              icon={<Wifi size={18} className="text-green-600" />}
              bg="bg-green-50"
              label="Connectés maintenant"
              value={data!.active_now_count}
              sub="dans les 30 dernières min"
              pulse={data!.active_now_count > 0}
            />
            <StatCard
              icon={<Calendar size={18} className="text-blue-600" />}
              bg="bg-blue-50"
              label="Utilisateurs aujourd'hui"
              value={data!.today_unique_users}
              sub={`${data!.today_sessions} sessions`}
            />
            <StatCard
              icon={<TrendingUp size={18} className="text-purple-600" />}
              bg="bg-purple-50"
              label="Sessions (30 jours)"
              value={data!.total_sessions_30d}
              sub="toutes organisations"
            />
            <StatCard
              icon={<Users size={18} className="text-orange-600" />}
              bg="bg-orange-50"
              label="Utilisateurs actifs"
              value={data!.total_users}
              sub="comptes activés"
            />
          </div>

          <div className="grid lg:grid-cols-3 gap-6">

            {/* Graphique connexions par jour */}
            <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 p-5">
              <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <TrendingUp size={15} className="text-primary" />
                Connexions par jour — 30 derniers jours
              </h2>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={data!.sessions_by_day} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                  <defs>
                    <linearGradient id="sessions" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="users" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis
                    dataKey="day"
                    tickFormatter={fmtDay}
                    tick={{ fontSize: 10, fill: '#9ca3af' }}
                    interval={4}
                  />
                  <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
                    labelFormatter={(label) => fmtDay(String(label))}
                    formatter={(val, name) => [
                      val,
                      name === 'sessions' ? 'Sessions' : 'Utilisateurs uniques',
                    ]}
                  />
                  <Area type="monotone" dataKey="sessions" stroke="#6366f1" strokeWidth={2} fill="url(#sessions)" dot={false} />
                  <Area type="monotone" dataKey="unique_users" stroke="#10b981" strokeWidth={2} fill="url(#users)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
              <div className="flex items-center gap-4 mt-2 justify-center">
                <span className="flex items-center gap-1.5 text-xs text-gray-500">
                  <span className="w-3 h-0.5 bg-indigo-500 inline-block rounded" /> Sessions
                </span>
                <span className="flex items-center gap-1.5 text-xs text-gray-500">
                  <span className="w-3 h-0.5 bg-emerald-500 inline-block rounded" /> Utilisateurs uniques
                </span>
              </div>
            </div>

            {/* Connectés maintenant */}
            <div className="bg-white rounded-2xl border border-gray-200 p-5 flex flex-col">
              <h2 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
                </span>
                En ligne maintenant ({data!.active_now_count})
              </h2>

              {data!.active_now.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
                  Aucun utilisateur actif
                </div>
              ) : (
                <div className="space-y-2 overflow-y-auto max-h-64">
                  {data!.active_now.map(u => (
                    <div key={u.id} className="flex items-center gap-2.5 p-2.5 bg-green-50 rounded-xl">
                      <div className="w-7 h-7 rounded-full bg-green-200 flex items-center justify-center text-green-700 text-xs font-bold flex-shrink-0">
                        {u.name?.[0]?.toUpperCase() ?? '?'}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-800 truncate">{u.name}</p>
                        <p className="text-xs text-gray-400">{minutesAgo(u.last_used_at)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Top organisations */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <Building2 size={15} className="text-gray-500" />
              Top organisations actives — 7 derniers jours
            </h2>
            {data!.top_orgs.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-6">Aucune donnée</p>
            ) : (
              <div className="grid lg:grid-cols-2 gap-6 items-center">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={data!.top_orgs.slice(0, 8)} layout="vertical" margin={{ left: 0, right: 20 }}>
                    <XAxis type="number" tick={{ fontSize: 10, fill: '#9ca3af' }} allowDecimals={false} />
                    <YAxis type="category" dataKey="org_name" tick={{ fontSize: 11, fill: '#374151' }} width={120} />
                    <Tooltip
                      contentStyle={{ fontSize: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
                      formatter={(val) => [val, 'Sessions']}
                    />
                    <Bar dataKey="sessions" radius={[0, 6, 6, 0]}>
                      {data!.top_orgs.slice(0, 8).map((_, i) => (
                        <Cell key={i} fill={ORG_COLORS[i % ORG_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>

                <div className="space-y-2">
                  {data!.top_orgs.slice(0, 8).map((org, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: ORG_COLORS[i % ORG_COLORS.length] }} />
                      <span className="text-sm text-gray-700 flex-1 truncate">{org.org_name}</span>
                      <span className="text-sm font-semibold text-gray-900">{org.sessions} sessions</span>
                      <span className="text-xs text-gray-400">{org.users} users</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatCard({ icon, bg, label, value, sub, pulse }: {
  icon: React.ReactNode; bg: string
  label: string; value: number; sub?: string; pulse?: boolean
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4 flex items-start gap-3">
      <div className={`${bg} p-2.5 rounded-xl relative`}>
        {icon}
        {pulse && (
          <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-green-400 animate-ping" />
        )}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-500 truncate">{label}</p>
        <p className="text-2xl font-bold text-gray-900">{value.toLocaleString('fr-FR')}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}
