import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../lib/api'
import { formatCurrency } from '../../lib/format'
import { Utensils, RotateCcw } from 'lucide-react'

interface Table {
  id: number; number: string; seats: number; status: string
  area?: { name: string }
}

const TABLE_STATUS_STYLES: Record<string, string> = {
  free: 'bg-green-100 border-green-300 text-green-800',
  occupied: 'bg-orange-100 border-orange-300 text-orange-800',
  ordered: 'bg-blue-100 border-blue-300 text-blue-800',
  served: 'bg-purple-100 border-purple-300 text-purple-800',
  bill_requested: 'bg-red-100 border-red-300 text-red-800',
  cleaning: 'bg-gray-100 border-gray-300 text-gray-600',
}

const TABLE_STATUS_LABELS: Record<string, string> = {
  free: 'Libre', occupied: 'Occupée', ordered: 'Commande envoyée',
  served: 'Servi', bill_requested: 'Addition demandée', cleaning: 'Nettoyage',
}

export default function RestaurantPage() {
  const { data: floorPlan } = useQuery({
    queryKey: ['floor-plan'],
    queryFn: () => api.get('/restaurant/floor-plan').then(r => r.data),
    refetchInterval: 15000,
  })

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Utensils size={24} /> Plan de salle</h1>
        <div className="flex items-center gap-2 flex-wrap">
          {Object.entries(TABLE_STATUS_LABELS).map(([k, v]) => (
            <div key={k} className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full border ${TABLE_STATUS_STYLES[k]}`}>
              {v}
            </div>
          ))}
        </div>
      </div>

      {(floorPlan ?? []).map((area: { id: number; name: string; tables: Table[] }) => (
        <div key={area.id} className="card">
          <h2 className="font-semibold text-gray-700 mb-4">{area.name}</h2>
          <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-3">
            {area.tables.map((table: Table) => (
              <button
                key={table.id}
                className={`aspect-square rounded-xl border-2 flex flex-col items-center justify-center text-sm font-bold transition-all hover:shadow-md ${TABLE_STATUS_STYLES[table.status] ?? 'bg-gray-100'}`}
              >
                <span className="text-lg">{table.number}</span>
                <span className="text-xs opacity-70">{table.seats} pers.</span>
              </button>
            ))}
          </div>
        </div>
      ))}

      {(floorPlan ?? []).length === 0 && (
        <div className="card flex flex-col items-center justify-center py-16 text-gray-400">
          <Utensils size={48} className="mb-4 opacity-30" />
          <p className="text-lg font-medium">Aucune zone configurée</p>
          <p className="text-sm">Créez des zones et des tables depuis les paramètres</p>
        </div>
      )}
    </div>
  )
}
