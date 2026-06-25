import { useQuery } from '@tanstack/react-query'
import { TrendingUp, Building2, Key, AlertCircle, CheckCircle, Clock, XCircle } from 'lucide-react'
import axios from 'axios'
import { useSuperAdminStore } from '../../store/superAdmin.store'

const API_URL = import.meta.env.VITE_API_URL || ''

function superAdminApi() {
  const token = localStorage.getItem('sc_superadmin_token')
  return axios.create({
    baseURL: API_URL ? `${API_URL}/api/v1/superadmin` : '/api/v1/superadmin',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  })
}

interface Stats {
  tenants_active: number
  tenants_trial: number
  tenants_expired: number
  requests_pending: number
  mrr: number
  arr: number
  licences_expiring_soon: number
}

function StatCard({ label, value, icon: Icon, color }: {
  label: string; value: string | number; icon: React.ElementType; color: string
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-gray-400">{label}</p>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${color}`}>
          <Icon className="w-4 h-4 text-white" />
        </div>
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
    </div>
  )
}

export default function SuperAdminDashboard() {
  const admin = useSuperAdminStore(s => s.admin)

  const { data: stats } = useQuery<Stats>({
    queryKey: ['superadmin-stats'],
    queryFn: () => superAdminApi().get('/stats').then(r => r.data),
    staleTime: 60_000,
  })

  const s = stats ?? {
    tenants_active: 0, tenants_trial: 0, tenants_expired: 0,
    requests_pending: 0, mrr: 0, arr: 0, licences_expiring_soon: 0,
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Bonjour, {admin?.name} 👋</h1>
        <p className="text-gray-400 text-sm mt-0.5">Vue d'ensemble de la plateforme</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Tenants actifs"        value={s.tenants_active}          icon={Building2}    color="bg-green-600" />
        <StatCard label="En période d'essai"    value={s.tenants_trial}           icon={Clock}        color="bg-blue-600" />
        <StatCard label="Expirés"               value={s.tenants_expired}         icon={XCircle}      color="bg-red-600" />
        <StatCard label="Demandes en attente"   value={s.requests_pending}        icon={AlertCircle}  color="bg-amber-600" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <StatCard label="MRR (FCFA)"            value={s.mrr.toLocaleString('fr-FR')}   icon={TrendingUp}   color="bg-indigo-600" />
        <StatCard label="ARR (FCFA)"            value={s.arr.toLocaleString('fr-FR')}   icon={TrendingUp}   color="bg-purple-600" />
        <StatCard label="Licences expirant ≤30j" value={s.licences_expiring_soon}       icon={Key}          color="bg-orange-600" />
      </div>

      {s.requests_pending > 0 && (
        <div className="bg-amber-600/10 border border-amber-600/30 rounded-xl p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />
          <p className="text-amber-200 text-sm">
            <span className="font-semibold">{s.requests_pending} demande(s)</span> en attente d'approbation.{' '}
            <a href="/superadmin/requests" className="underline hover:text-white">Traiter maintenant →</a>
          </p>
        </div>
      )}

      {s.licences_expiring_soon > 0 && (
        <div className="bg-orange-600/10 border border-orange-600/30 rounded-xl p-4 flex items-center gap-3">
          <Key className="w-5 h-5 text-orange-500 shrink-0" />
          <p className="text-orange-200 text-sm">
            <span className="font-semibold">{s.licences_expiring_soon} licence(s)</span> expirent dans les 30 jours.{' '}
            <a href="/superadmin/licences" className="underline hover:text-white">Voir les licences →</a>
          </p>
        </div>
      )}

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <CheckCircle className="w-4 h-4 text-green-500" />
          <h2 className="text-sm font-semibold text-white">Statut plateforme</h2>
        </div>
        <div className="space-y-2">
          {[
            { label: 'API Backend',         status: 'Opérationnel' },
            { label: 'Base de données',     status: 'Opérationnel' },
            { label: 'File de jobs',        status: 'Opérationnel' },
            { label: 'Emails transactionnels', status: 'Opérationnel' },
          ].map(row => (
            <div key={row.label} className="flex items-center justify-between text-sm">
              <span className="text-gray-400">{row.label}</span>
              <span className="text-green-400 font-medium">{row.status}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
