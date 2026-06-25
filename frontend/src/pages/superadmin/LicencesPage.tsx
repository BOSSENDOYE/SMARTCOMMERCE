import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Key, AlertTriangle, CheckCircle, XCircle, RefreshCw, Search } from 'lucide-react'
import axios from 'axios'
import toast from 'react-hot-toast'

const API_URL = import.meta.env.VITE_API_URL || ''
function saApi() {
  const token = localStorage.getItem('sc_superadmin_token')
  return axios.create({
    baseURL: API_URL ? `${API_URL}/api/v1/superadmin` : '/api/v1/superadmin',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' },
  })
}

interface Licence {
  id: number
  organization_id: number
  organization_name: string
  plan_name: string
  status: 'trial' | 'active' | 'suspended' | 'expired'
  billing_cycle: string
  starts_at: string
  ends_at: string
  grace_ends_at: string
  days_remaining: number
}

export default function LicencesPage() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'expiring' | 'expired'>('all')
  const [extending, setExtending] = useState<{ id: number; days: number } | null>(null)

  const { data: licences = [], isLoading } = useQuery<Licence[]>({
    queryKey: ['sa-licences', filter],
    queryFn: () => saApi().get(`/licences?filter=${filter}`).then(r => r.data),
  })

  const extendMutation = useMutation({
    mutationFn: ({ id, days }: { id: number; days: number }) =>
      saApi().post(`/licences/${id}/extend`, { days }),
    onSuccess: () => {
      toast.success('Licence prolongée')
      qc.invalidateQueries({ queryKey: ['sa-licences'] })
      setExtending(null)
    },
    onError: () => toast.error('Erreur lors de la prolongation'),
  })

  const renewMutation = useMutation({
    mutationFn: (id: number) => saApi().post(`/licences/${id}/renew`),
    onSuccess: () => { toast.success('Licence renouvelée'); qc.invalidateQueries({ queryKey: ['sa-licences'] }) },
    onError: () => toast.error('Erreur lors du renouvellement'),
  })

  const filtered = licences.filter(l =>
    l.organization_name.toLowerCase().includes(search.toLowerCase())
  )

  function daysColor(days: number, status: string) {
    if (status === 'expired') return 'text-red-400'
    if (days <= 7)  return 'text-red-400'
    if (days <= 30) return 'text-amber-400'
    return 'text-green-400'
  }

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-white">Licences</h1>
        <p className="text-gray-400 text-sm">Suivi des abonnements et dates d'expiration</p>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher un tenant..."
            className="w-full pl-9 pr-3 py-2 bg-gray-900 border border-gray-800 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
          />
        </div>
        <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-lg p-1">
          {([
            { v: 'all',      l: 'Toutes' },
            { v: 'expiring', l: '≤ 30 jours' },
            { v: 'expired',  l: 'Expirées' },
          ] as const).map(({ v, l }) => (
            <button key={v} onClick={() => setFilter(v)} className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${filter === v ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'}`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="space-y-2">
          {filtered.map(lic => (
            <div key={lic.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="w-8 h-8 bg-indigo-900/50 rounded-lg flex items-center justify-center shrink-0">
                  <Key className="w-4 h-4 text-indigo-400" />
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-white text-sm truncate">{lic.organization_name}</p>
                  <p className="text-xs text-gray-500">{lic.plan_name} · {lic.billing_cycle}</p>
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs text-gray-500">Expire le</p>
                <p className="text-sm text-gray-300">{new Date(lic.ends_at).toLocaleDateString('fr-FR')}</p>
              </div>
              <div className="text-right shrink-0 w-24">
                <p className={`text-lg font-bold ${daysColor(lic.days_remaining, lic.status)}`}>
                  {lic.status === 'expired' ? 'Expiré' : `J-${lic.days_remaining}`}
                </p>
                {lic.days_remaining <= 30 && lic.status !== 'expired' && (
                  <p className="text-xs text-amber-500 flex items-center justify-end gap-0.5">
                    <AlertTriangle className="w-3 h-3" /> Attention
                  </p>
                )}
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => setExtending({ id: lic.id, days: 30 })}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-700 hover:bg-indigo-600 rounded-lg text-xs text-white transition"
                >
                  <RefreshCw className="w-3 h-3" /> Prolonger
                </button>
                {lic.status === 'expired' && (
                  <button
                    onClick={() => renewMutation.mutate(lic.id)}
                    disabled={renewMutation.isPending}
                    className="px-3 py-1.5 bg-green-700 hover:bg-green-600 rounded-lg text-xs text-white transition disabled:opacity-50"
                  >
                    Renouveler
                  </button>
                )}
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="text-center py-12 text-gray-500">Aucune licence trouvée</div>
          )}
        </div>
      )}

      {extending && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-sm p-6 space-y-4">
            <h2 className="text-lg font-bold text-white">Prolonger la licence</h2>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Nombre de jours supplémentaires</label>
              <input
                type="number"
                min={1}
                value={extending.days}
                onChange={e => setExtending(x => x ? { ...x, days: Number(e.target.value) } : null)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500 text-sm"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setExtending(null)} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm text-gray-300 transition">Annuler</button>
              <button
                onClick={() => extendMutation.mutate(extending)}
                disabled={extendMutation.isPending}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm text-white transition disabled:opacity-50"
              >
                {extendMutation.isPending ? 'En cours...' : 'Confirmer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
