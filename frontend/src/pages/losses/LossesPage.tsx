import { useQuery } from '@tanstack/react-query'
import api from '../../lib/api'
import { formatCurrency, formatDate, formatNumber } from '../../lib/format'
import { TrendingDown, Plus } from 'lucide-react'

const LOSS_TYPES: Record<string, string> = {
  breakage: 'Casse', expiry: 'Péremption', theft: 'Vol',
  internal_use: 'Usage interne', commercial_gesture: 'Geste commercial', other: 'Autre',
}

export default function LossesPage() {
  const { data } = useQuery({
    queryKey: ['losses'],
    queryFn: () => api.get('/losses').then(r => r.data),
  })

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><TrendingDown size={24} /> Pertes & Démarque</h1>
        <button className="btn-primary flex items-center gap-2"><Plus size={18} /> Enregistrer une perte</button>
      </div>
      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              {['Référence', 'Produit', 'Type', 'Quantité', 'Valeur', 'Date', 'Statut'].map(h => (
                <th key={h} className="text-left px-4 py-3 font-medium text-gray-600">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {(data?.data ?? []).map((l: { id: number; reference: string; product?: { name: string }; type: string; qty: number; total_cost: number; created_at: string; status: string }) => (
              <tr key={l.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-xs text-gray-500">{l.reference}</td>
                <td className="px-4 py-3 font-medium text-gray-900">{l.product?.name ?? '—'}</td>
                <td className="px-4 py-3"><span className="badge-warning">{LOSS_TYPES[l.type] ?? l.type}</span></td>
                <td className="px-4 py-3">{formatNumber(l.qty, 2)}</td>
                <td className="px-4 py-3 font-semibold text-red-600">{formatCurrency(l.total_cost)}</td>
                <td className="px-4 py-3 text-gray-500">{formatDate(l.created_at)}</td>
                <td className="px-4 py-3">
                  <span className={`badge-${l.status === 'validated' ? 'success' : l.status === 'rejected' ? 'danger' : 'warning'}`}>
                    {l.status === 'validated' ? 'Validée' : l.status === 'rejected' ? 'Rejetée' : 'En attente'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
