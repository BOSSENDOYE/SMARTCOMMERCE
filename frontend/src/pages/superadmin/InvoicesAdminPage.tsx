import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { FileText, CheckCircle, Clock, XCircle, Search, RefreshCw, Download } from 'lucide-react'
import axios from 'axios'
import toast from 'react-hot-toast'
import { useSuperAdminStore } from '../../store/superAdmin.store'

const saApi = axios.create({
  baseURL: (import.meta.env.VITE_API_URL ?? 'http://localhost:8000') + '/api/v1',
  headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
})

saApi.interceptors.request.use(cfg => {
  const token = useSuperAdminStore.getState().token
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

interface Invoice {
  id: number
  invoice_number: string
  organization_id: number
  organization_name: string
  plan_name: string
  amount: number
  billing_cycle: string
  status: 'pending' | 'paid' | 'cancelled' | 'overdue'
  period_start: string
  period_end: string
  paid_at: string | null
  created_at: string
  notes: string | null
}

const STATUS_CONFIG = {
  pending:   { label: 'En attente',  color: 'bg-amber-100 text-amber-700',  icon: <Clock size={12} /> },
  paid:      { label: 'Payée',       color: 'bg-green-100 text-green-700',  icon: <CheckCircle size={12} /> },
  cancelled: { label: 'Annulée',     color: 'bg-gray-100 text-gray-600',    icon: <XCircle size={12} /> },
  overdue:   { label: 'En retard',   color: 'bg-red-100 text-red-700',      icon: <XCircle size={12} /> },
}

const CYCLE_LABEL: Record<string, string> = {
  monthly: 'Mensuel', quarterly: 'Trimestriel', yearly: 'Annuel',
}

function fmt(n: number) {
  return new Intl.NumberFormat('fr-SN', { style: 'currency', currency: 'XOF', maximumFractionDigits: 0 }).format(n)
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function InvoicesAdminPage() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['sa-invoices', statusFilter],
    queryFn: () => saApi.get('/superadmin/invoices', {
      params: { status: statusFilter !== 'all' ? statusFilter : undefined, per_page: 100 }
    }).then(r => r.data),
  })

  const markPaid = useMutation({
    mutationFn: (id: number) => saApi.post(`/superadmin/invoices/${id}/mark-paid`),
    onSuccess: () => {
      toast.success('Facture marquée comme payée')
      qc.invalidateQueries({ queryKey: ['sa-invoices'] })
      setSelectedInvoice(null)
    },
    onError: () => toast.error('Erreur lors de la mise à jour'),
  })

  const invoices: Invoice[] = data?.data ?? []
  const filtered = invoices.filter(inv =>
    !search || inv.invoice_number.toLowerCase().includes(search.toLowerCase()) ||
    inv.organization_name?.toLowerCase().includes(search.toLowerCase())
  )

  const totals = {
    total: invoices.reduce((s, i) => s + i.amount, 0),
    paid: invoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.amount, 0),
    pending: invoices.filter(i => i.status === 'pending').reduce((s, i) => s + i.amount, 0),
    overdue: invoices.filter(i => i.status === 'overdue').length,
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Facturation</h1>
          <p className="text-sm text-gray-500 mt-0.5">Suivi des factures et paiements de la plateforme</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 font-medium">Total facturé</p>
          <p className="text-xl font-bold text-gray-900 mt-1">{fmt(totals.total)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 font-medium">Encaissé</p>
          <p className="text-xl font-bold text-green-600 mt-1">{fmt(totals.paid)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 font-medium">En attente</p>
          <p className="text-xl font-bold text-amber-600 mt-1">{fmt(totals.pending)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 font-medium">En retard</p>
          <p className="text-xl font-bold text-red-600 mt-1">{totals.overdue}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher par numéro ou organisation…"
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div className="flex gap-2">
            {(['all', 'pending', 'paid', 'overdue', 'cancelled'] as const).map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  statusFilter === s
                    ? 'bg-brand text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {s === 'all' ? 'Toutes' : STATUS_CONFIG[s].label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <RefreshCw size={24} className="animate-spin text-gray-300" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <FileText size={40} className="mb-3 opacity-30" />
            <p className="text-sm">Aucune facture trouvée</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">N° Facture</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Organisation</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase hidden md:table-cell">Plan</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Montant</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Statut</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase hidden lg:table-cell">Date</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(inv => {
                const cfg = STATUS_CONFIG[inv.status] ?? STATUS_CONFIG.pending
                return (
                  <tr key={inv.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setSelectedInvoice(inv)}>
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-brand">{inv.invoice_number}</td>
                    <td className="px-4 py-3 font-medium text-gray-800">{inv.organization_name}</td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="text-xs bg-primary/10 text-primary font-semibold px-2 py-0.5 rounded-full">
                        {inv.plan_name} · {CYCLE_LABEL[inv.billing_cycle] ?? inv.billing_cycle}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-gray-900">{fmt(inv.amount)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${cfg.color}`}>
                        {cfg.icon} {cfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 hidden lg:table-cell">{fmtDate(inv.created_at)}</td>
                    <td className="px-4 py-3">
                      <button className="text-gray-400 hover:text-brand transition-colors">
                        <Download size={14} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Invoice detail modal */}
      {selectedInvoice && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelectedInvoice(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500 font-medium">Facture</p>
                  <h2 className="text-xl font-bold text-brand font-mono">{selectedInvoice.invoice_number}</h2>
                </div>
                {(() => {
                  const cfg = STATUS_CONFIG[selectedInvoice.status] ?? STATUS_CONFIG.pending
                  return (
                    <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-semibold ${cfg.color}`}>
                      {cfg.icon} {cfg.label}
                    </span>
                  )
                })()}
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs text-gray-500">Organisation</p>
                  <p className="font-semibold">{selectedInvoice.organization_name}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Plan</p>
                  <p className="font-semibold">{selectedInvoice.plan_name} · {CYCLE_LABEL[selectedInvoice.billing_cycle]}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Montant</p>
                  <p className="font-bold text-xl text-gray-900">{fmt(selectedInvoice.amount)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Date d'émission</p>
                  <p className="font-semibold">{fmtDate(selectedInvoice.created_at)}</p>
                </div>
                {selectedInvoice.period_start && (
                  <div>
                    <p className="text-xs text-gray-500">Période</p>
                    <p className="font-semibold">{fmtDate(selectedInvoice.period_start)} → {fmtDate(selectedInvoice.period_end)}</p>
                  </div>
                )}
                {selectedInvoice.paid_at && (
                  <div>
                    <p className="text-xs text-gray-500">Payée le</p>
                    <p className="font-semibold text-green-600">{fmtDate(selectedInvoice.paid_at)}</p>
                  </div>
                )}
              </div>
              {selectedInvoice.notes && (
                <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600">
                  {selectedInvoice.notes}
                </div>
              )}
            </div>
            <div className="p-6 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setSelectedInvoice(null)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
                Fermer
              </button>
              {selectedInvoice.status === 'pending' || selectedInvoice.status === 'overdue' ? (
                <button
                  onClick={() => markPaid.mutate(selectedInvoice.id)}
                  disabled={markPaid.isPending}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-lg flex items-center gap-2 disabled:opacity-50"
                >
                  <CheckCircle size={14} />
                  Marquer comme payée
                </button>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
