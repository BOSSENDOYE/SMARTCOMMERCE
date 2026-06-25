import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { FileText, Download, CheckCircle, Clock, AlertCircle, Search } from 'lucide-react'
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

type InvStatus = 'draft' | 'sent' | 'paid' | 'overdue'

const statusCfg: Record<InvStatus, { label: string; color: string; icon: React.ElementType }> = {
  draft:   { label: 'Brouillon', color: 'text-gray-400 bg-gray-500/10 border-gray-500/30',    icon: FileText },
  sent:    { label: 'Envoyée',   color: 'text-blue-400 bg-blue-500/10 border-blue-500/30',    icon: Clock },
  paid:    { label: 'Payée',     color: 'text-green-400 bg-green-500/10 border-green-500/30', icon: CheckCircle },
  overdue: { label: 'En retard', color: 'text-red-400 bg-red-500/10 border-red-500/30',       icon: AlertCircle },
}

interface Invoice {
  id: number
  number: string
  organization_name: string
  amount: number
  currency: string
  status: InvStatus
  issued_at: string
  due_at: string
  paid_at: string | null
}

export default function InvoicesAdminPage() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<InvStatus | 'all'>('all')

  const { data: invoices = [], isLoading } = useQuery<Invoice[]>({
    queryKey: ['sa-invoices', filter],
    queryFn: () => saApi().get(`/platform-invoices?status=${filter}`).then(r => r.data),
  })

  const markPaidMutation = useMutation({
    mutationFn: (id: number) => saApi().post(`/platform-invoices/${id}/mark-paid`),
    onSuccess: () => { toast.success('Facture marquée comme payée'); qc.invalidateQueries({ queryKey: ['sa-invoices'] }) },
    onError: () => toast.error('Erreur'),
  })

  const filtered = invoices.filter(i =>
    i.organization_name.toLowerCase().includes(search.toLowerCase()) ||
    i.number.toLowerCase().includes(search.toLowerCase())
  )

  const total = (s: InvStatus) => invoices.filter(i => i.status === s).reduce((acc, i) => acc + i.amount, 0)

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-white">Facturation plateforme</h1>
        <p className="text-gray-400 text-sm">Factures émises aux clients</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {(['draft', 'sent', 'paid', 'overdue'] as InvStatus[]).map(s => {
          const cfg = statusCfg[s]
          const Icon = cfg.icon
          return (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`bg-gray-900 border rounded-xl p-4 text-left transition hover:border-indigo-500 ${filter === s ? 'border-indigo-500' : 'border-gray-800'}`}
            >
              <div className={`inline-flex items-center gap-1 border px-2 py-0.5 rounded-full text-xs mb-2 ${cfg.color}`}>
                <Icon className="w-3 h-3" />
                {cfg.label}
              </div>
              <p className="text-sm font-bold text-white">{total(s).toLocaleString('fr-FR')} FCFA</p>
              <p className="text-xs text-gray-500">{invoices.filter(i => i.status === s).length} facture(s)</p>
            </button>
          )
        })}
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher..."
            className="w-full pl-9 pr-3 py-2 bg-gray-900 border border-gray-800 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
          />
        </div>
        <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-lg p-1">
          {(['all', 'draft', 'sent', 'paid', 'overdue'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${filter === f ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'}`}>
              {f === 'all' ? 'Toutes' : statusCfg[f]?.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-400 text-xs">
                <th className="text-left px-4 py-3 font-medium">N°</th>
                <th className="text-left px-4 py-3 font-medium">Client</th>
                <th className="text-left px-4 py-3 font-medium">Montant</th>
                <th className="text-left px-4 py-3 font-medium">Statut</th>
                <th className="text-left px-4 py-3 font-medium">Émise le</th>
                <th className="text-left px-4 py-3 font-medium">Échéance</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map(inv => {
                const cfg = statusCfg[inv.status]
                const Icon = cfg.icon
                return (
                  <tr key={inv.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition">
                    <td className="px-4 py-3 font-mono text-gray-300 text-xs">{inv.number}</td>
                    <td className="px-4 py-3 text-white">{inv.organization_name}</td>
                    <td className="px-4 py-3 font-medium text-white">{inv.amount.toLocaleString('fr-FR')} {inv.currency}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 border px-2 py-0.5 rounded-full text-xs ${cfg.color}`}>
                        <Icon className="w-3 h-3" />{cfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{new Date(inv.issued_at).toLocaleDateString('fr-FR')}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{new Date(inv.due_at).toLocaleDateString('fr-FR')}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition" title="Télécharger PDF">
                          <Download className="w-3.5 h-3.5" />
                        </button>
                        {inv.status === 'sent' && (
                          <button
                            onClick={() => markPaidMutation.mutate(inv.id)}
                            className="px-2.5 py-1 bg-green-700 hover:bg-green-600 rounded-lg text-xs text-white transition"
                          >
                            Marquer payée
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {filtered.length === 0 && <div className="text-center py-12 text-gray-500">Aucune facture</div>}
        </div>
      )}
    </div>
  )
}
