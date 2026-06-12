import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../../lib/api'
import { formatCurrency } from '../../lib/format'
import { Users, Search, Plus } from 'lucide-react'

interface Client {
  id: number; name: string; phone?: string; email?: string
  type: string; credit_balance: number; loyalty_points: number; is_active: boolean
}

export default function ClientsPage() {
  const [search, setSearch] = useState('')
  const { data } = useQuery({
    queryKey: ['clients', search],
    queryFn: () => api.get('/clients', { params: { search, per_page: 30 } }).then(r => r.data),
  })

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Users size={24} /> Clients</h1>
        <button className="btn-primary flex items-center gap-2"><Plus size={18} /> Nouveau client</button>
      </div>
      <div className="card p-4">
        <div className="relative">
          <input value={search} onChange={e => setSearch(e.target.value)} className="input pl-10" placeholder="Nom, téléphone..." />
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
        </div>
      </div>
      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              {['Client', 'Téléphone', 'Type', 'Crédit en cours', 'Points fidélité', 'Statut'].map(h => (
                <th key={h} className="text-left px-4 py-3 font-medium text-gray-600">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {(data?.data ?? []).map((c: Client) => (
              <tr key={c.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{c.name}</td>
                <td className="px-4 py-3 text-gray-500">{c.phone ?? '—'}</td>
                <td className="px-4 py-3"><span className={`badge-${c.type === 'company' ? 'info' : 'gray'}`}>{c.type === 'company' ? 'Entreprise' : 'Particulier'}</span></td>
                <td className={`px-4 py-3 font-semibold ${c.credit_balance > 0 ? 'text-orange-600' : 'text-gray-700'}`}>{formatCurrency(c.credit_balance)}</td>
                <td className="px-4 py-3 text-blue-600 font-medium">{c.loyalty_points} pts</td>
                <td className="px-4 py-3"><span className={`badge-${c.is_active ? 'success' : 'gray'}`}>{c.is_active ? 'Actif' : 'Inactif'}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
