import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Store, Truck } from 'lucide-react'
import api from '../../lib/api'
import { formatCurrency, formatNumber } from '../../lib/format'

export interface PendingOrder {
  id: number
  reference: string
  qty_produced: number
  qty_allocated: number
  qty_pending: number
  produced_at: string
  product?: { id: number; name: string; sale_price_ttc?: number; courier_price?: number | null; unit?: { abbreviation: string } }
}

interface CourierRow { id: number; name: string; zone?: string; is_active: boolean; open_round?: { qty_out: number } | null }

type ApiErr = { response?: { data?: { message?: string; errors?: Record<string, string[]> } } }
const apiError = (err: unknown): string => {
  const data = (err as ApiErr)?.response?.data
  if (data?.errors) return Object.values(data.errors).flat().join('\n')
  return data?.message ?? 'Une erreur est survenue'
}

/**
 * Répartition d'une production entre le point de vente et les livreurs.
 * Le total ne peut pas dépasser la quantité en attente ; le reste reste « en attente de répartition ».
 */
export default function AllocationModal({ order, onClose }: { order: PendingOrder; onClose: () => void }) {
  const qc = useQueryClient()
  const [pos, setPos] = useState('')
  const [byCourier, setByCourier] = useState<Record<number, string>>({})

  const { data: couriers = [] } = useQuery({
    queryKey: ['couriers'],
    queryFn: () => api.get('/distribution/couriers').then(r => r.data as CourierRow[]),
  })
  const active = couriers.filter(c => c.is_active)

  const unit = order.product?.unit?.abbreviation ?? ''
  const courierPrice = Number(order.product?.courier_price ?? order.product?.sale_price_ttc ?? 0)
  const num = (v: string | undefined) => parseFloat(v ?? '') || 0
  const total = num(pos) + active.reduce((s, c) => s + num(byCourier[c.id]), 0)
  const remaining = Math.round((order.qty_pending - total) * 1000) / 1000
  const over = remaining < 0

  const { mutate: save, isPending } = useMutation({
    mutationFn: () => api.post(`/distribution/orders/${order.id}/allocate`, {
      lines: [
        ...(num(pos) > 0 ? [{ destination: 'pos', qty: num(pos) }] : []),
        ...active.filter(c => num(byCourier[c.id]) > 0).map(c => ({ destination: 'courier', courier_id: c.id, qty: num(byCourier[c.id]) })),
      ],
    }),
    onSuccess: () => {
      toast.success(remaining > 0 ? `Répartition enregistrée — ${formatNumber(remaining)} restent en attente` : 'Production entièrement répartie')
      for (const key of ['distribution-pending', 'distribution-stats', 'couriers', 'courier-rounds', 'distribution-movements', 'production-orders', 'production-recipes']) {
        qc.invalidateQueries({ queryKey: [key] })
      }
      onClose()
    },
    onError: (err) => toast.error(apiError(err)),
  })

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Répartir la production</h2>
            <p className="text-sm text-gray-500">
              {order.reference} · {order.product?.name} · <b>{formatNumber(order.qty_pending)} {unit}</b> en attente
              {order.qty_allocated > 0 && <> (sur {formatNumber(order.qty_produced)})</>}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        <div className="p-5 space-y-3 overflow-auto">
          <div className="flex items-center gap-3 p-3 rounded-xl border border-primary/30 bg-primary/5">
            <Store size={18} className="text-primary flex-shrink-0" />
            <div className="flex-1">
              <p className="font-semibold text-gray-900">Point de vente</p>
              <p className="text-xs text-gray-500">Alimente le stock de la caisse</p>
            </div>
            <input
              type="number" min="0" className="input w-28 text-right" placeholder="0"
              value={pos} onChange={e => setPos(e.target.value)}
            />
          </div>

          {active.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-2">Aucun livreur actif — ajoutez-en dans Distribution → Livreurs.</p>
          )}
          {active.map(c => (
            <div key={c.id} className="flex items-center gap-3 p-3 rounded-xl border border-gray-200">
              <Truck size={18} className="text-amber-600 flex-shrink-0" />
              <div className="flex-1">
                <p className="font-semibold text-gray-900">{c.name}</p>
                <p className="text-xs text-gray-500">
                  {c.zone ?? 'Livreur'}{c.open_round ? ` · déjà ${formatNumber(c.open_round.qty_out)} en tournée` : ''}
                </p>
              </div>
              <div className="text-right">
                <input
                  type="number" min="0" className="input w-28 text-right" placeholder="0"
                  value={byCourier[c.id] ?? ''} onChange={e => setByCourier(prev => ({ ...prev, [c.id]: e.target.value }))}
                />
                {num(byCourier[c.id]) > 0 && (
                  <p className="text-[11px] text-gray-400 mt-0.5">dotation {formatCurrency(num(byCourier[c.id]) * courierPrice)}</p>
                )}
              </div>
            </div>
          ))}

          <div className={`flex items-center justify-between rounded-xl px-4 py-3 text-sm ${over ? 'bg-red-50 text-red-700' : remaining > 0 ? 'bg-amber-50 text-amber-800' : 'bg-green-50 text-green-700'}`}>
            <span>Total réparti : <b>{formatNumber(total)}</b> / {formatNumber(order.qty_pending)}</span>
            <span>
              {over ? `Dépassement de ${formatNumber(-remaining)}` : remaining > 0 ? `${formatNumber(remaining)} restent en attente` : 'Tout est réparti'}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 p-5 border-t">
          <button
            type="button" className="btn-secondary"
            onClick={() => { setPos(String(order.qty_pending)); setByCourier({}) }}
          >
            Tout au point de vente
          </button>
          <div className="flex-1" />
          <button type="button" onClick={onClose} className="btn-secondary">Plus tard</button>
          <button type="button" disabled={isPending || total <= 0 || over} onClick={() => save()} className="btn-primary">
            {isPending ? 'Enregistrement…' : 'Valider la répartition'}
          </button>
        </div>
      </div>
    </div>
  )
}
