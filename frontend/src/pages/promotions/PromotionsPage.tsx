import { useQuery } from '@tanstack/react-query'
import api from '../../lib/api'
import { formatCurrency, formatDate } from '../../lib/format'
import { Percent, Plus } from 'lucide-react'

const TYPE_LABELS: Record<string, string> = {
  percentage: 'Pourcentage', fixed_amount: 'Montant fixe', special_price: 'Prix spécial',
  buy_x_get_y: 'X acheté Y offert', tiered: 'Par palier', happy_hour: 'Happy Hour',
}

export default function PromotionsPage() {
  const { data } = useQuery({
    queryKey: ['promotions-all'],
    queryFn: () => api.get('/promotions').then(r => r.data),
  })

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Percent size={24} /> Promotions</h1>
        <button className="btn-primary flex items-center gap-2"><Plus size={18} /> Nouvelle promotion</button>
      </div>
      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              {['Nom', 'Type', 'Valeur', 'Début', 'Fin', 'Statut'].map(h => (
                <th key={h} className="text-left px-4 py-3 font-medium text-gray-600">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {(data?.data ?? []).map((p: { id: number; name: string; type: string; value: number; starts_at?: string; ends_at?: string; is_active: boolean }) => (
              <tr key={p.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{p.name}</td>
                <td className="px-4 py-3"><span className="badge-info">{TYPE_LABELS[p.type]}</span></td>
                <td className="px-4 py-3 font-semibold text-gray-900">
                  {p.type === 'percentage' ? `${p.value}%` : formatCurrency(p.value)}
                </td>
                <td className="px-4 py-3 text-gray-500">{p.starts_at ? formatDate(p.starts_at) : '—'}</td>
                <td className="px-4 py-3 text-gray-500">{p.ends_at ? formatDate(p.ends_at) : '—'}</td>
                <td className="px-4 py-3">
                  <span className={`badge-${p.is_active ? 'success' : 'gray'}`}>{p.is_active ? 'Active' : 'Inactive'}</span>
                </td>
              </tr>
            ))}
            {(data?.data ?? []).length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Aucune promotion enregistrée</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
