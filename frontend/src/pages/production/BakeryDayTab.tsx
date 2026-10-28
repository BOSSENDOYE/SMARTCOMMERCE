import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import api from '../../lib/api'
import { formatCurrency, formatNumber } from '../../lib/format'
import { Factory, Store, Truck, PackageX, Wallet, CakeSlice, Hourglass, Banknote } from 'lucide-react'

export interface BakeryDaySummary {
  produced_qty: number
  production_cost: number
  to_pos: number
  to_couriers: number
  pending_qty: number
  pending_all_qty: number
  sold_pos_qty: number
  sold_couriers_qty: number
  unsold_qty: number
  unsold_cost: number
  unsold_rate: number | null
  revenue_total: number
  revenue_couriers: number
  revenue_counter: number
  couriers_gap_day: number
  couriers_debt: number
  orders_pickup: number
  orders_delivered: number
}

interface ProductRow {
  product_id: number
  name: string
  unit?: string
  produced: number
  to_pos: number
  to_couriers: number
  pending: number
  sold_pos: number
  sold_couriers: number
  unsold: number
  stock_pos: number
}

interface CourierRow {
  id: number
  name: string
  in_round: number
  sold: number
  returned: number
  amount_due: number
  amount_paid: number
  debt: number
}

interface ShiftRow {
  shift: string
  label: string
  status: 'open' | 'closed'
  responsible?: string
  sold: number
  gap_qty: number
  gap_value: number
  over_tolerance: number
}

export interface BakeryDay {
  date: string
  summary: BakeryDaySummary
  products: ProductRow[]
  couriers: CourierRow[]
  shifts: ShiftRow[]
}

const isoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

function Kpi({ label, value, sub, icon, tone, to }: {
  label: string; value: string; sub?: string; icon: React.ReactNode; tone: string; to?: string
}) {
  const body = (
    <div className="card p-4 flex items-start gap-3 h-full hover:shadow-md transition-shadow">
      <div className={`p-2.5 rounded-xl ${tone}`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-[11px] text-gray-500 uppercase tracking-wide">{label}</p>
        <p className="text-lg font-bold text-gray-900">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
  return to ? <Link to={to}>{body}</Link> : body
}

/** Indicateurs clés de la journée — réutilisés sur le tableau de bord d'accueil. */
export function BakeryDayKpis({ s }: { s: BakeryDaySummary }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <Kpi
        label="Produit" value={formatNumber(s.produced_qty)} icon={<Factory size={18} className="text-amber-700" />} tone="bg-amber-100"
        sub={s.pending_qty > 0 ? `${formatNumber(s.pending_qty)} à répartir` : `coût ${formatCurrency(s.production_cost)}`}
        to={s.pending_qty > 0 ? '/distribution/pending' : '/production/orders'}
      />
      <Kpi
        label="Vendu caisse" value={formatNumber(s.sold_pos_qty)} icon={<Store size={18} className="text-blue-700" />} tone="bg-blue-100"
        sub={`${formatNumber(s.to_pos)} mis au point de vente`}
      />
      <Kpi
        label="Vendu livreurs" value={formatNumber(s.sold_couriers_qty)} icon={<Truck size={18} className="text-orange-700" />} tone="bg-orange-100"
        sub={`${formatNumber(s.to_couriers)} confiés`} to="/distribution/rounds"
      />
      <Kpi
        label="Invendus" value={s.unsold_rate != null ? `${s.unsold_rate.toFixed(1)} %` : formatNumber(s.unsold_qty)}
        icon={<PackageX size={18} className="text-red-700" />} tone="bg-red-100"
        sub={`${formatNumber(s.unsold_qty)} · ${formatCurrency(s.unsold_cost)}`} to="/production/unsold"
      />
      <Kpi
        label="Chiffre d'affaires" value={formatCurrency(s.revenue_total)} icon={<Banknote size={18} className="text-green-700" />} tone="bg-green-100"
        sub={`comptoir ${formatCurrency(s.revenue_counter)} · livreurs ${formatCurrency(s.revenue_couriers)}`}
      />
      <Kpi
        label="Manquants livreurs" value={formatCurrency(s.couriers_debt)} icon={<Wallet size={18} className="text-rose-700" />} tone="bg-rose-100"
        sub={s.couriers_gap_day > 0 ? `dont ${formatCurrency(s.couriers_gap_day)} aujourd'hui` : 'cumul à récupérer'} to="/distribution/couriers"
      />
      <Kpi
        label="Commandes à retirer" value={formatNumber(s.orders_pickup)} icon={<CakeSlice size={18} className="text-pink-700" />} tone="bg-pink-100"
        sub={`${formatNumber(s.orders_delivered)} livrée(s)`} to="/customer-orders"
      />
      <Kpi
        label="En attente de répartition" value={formatNumber(s.pending_all_qty)} icon={<Hourglass size={18} className={s.pending_all_qty > 0 ? 'text-amber-700' : 'text-gray-600'} />}
        tone={s.pending_all_qty > 0 ? 'bg-amber-100' : 'bg-gray-100'}
        sub="toutes productions, à ce jour" to="/distribution/pending"
      />
    </div>
  )
}

export default function BakeryDayTab() {
  const [date, setDate] = useState(() => isoDate(new Date()))

  const { data, isLoading } = useQuery({
    queryKey: ['bakery-day', date],
    queryFn: () => api.get('/production/day', { params: { date } }).then(r => r.data as BakeryDay),
    refetchInterval: 60_000,
  })

  return (
    <div className="space-y-5">
      <div className="card p-4 flex flex-wrap items-center gap-3">
        <label className="text-sm font-medium text-gray-700">Journée du</label>
        <input type="date" className="input w-44" value={date} onChange={e => setDate(e.target.value)} />
        <p className="text-xs text-gray-400">Les ventes livreurs comptent le jour de la clôture de leur tournée.</p>
      </div>

      {isLoading || !data ? (
        <p className="text-center text-gray-400 py-10">Chargement…</p>
      ) : (
        <>
          <BakeryDayKpis s={data.summary} />

          <div className="card overflow-x-auto">
            <div className="px-4 pt-4 pb-2">
              <h3 className="font-semibold text-gray-900">Par produit</h3>
              <p className="text-xs text-gray-500">Où est passée chaque fournée</p>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                <tr>
                  <th className="text-left px-4 py-2">Produit</th>
                  <th className="text-right px-4 py-2">Produit</th>
                  <th className="text-right px-4 py-2">→ Caisse</th>
                  <th className="text-right px-4 py-2">→ Livreurs</th>
                  <th className="text-right px-4 py-2">En attente</th>
                  <th className="text-right px-4 py-2">Vendu caisse</th>
                  <th className="text-right px-4 py-2">Vendu livreurs</th>
                  <th className="text-right px-4 py-2">Invendus</th>
                  <th className="text-right px-4 py-2">Stock caisse</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.products.length === 0 && (
                  <tr><td colSpan={9} className="text-center py-8 text-gray-400">Aucune activité ce jour-là</td></tr>
                )}
                {data.products.map(p => (
                  <tr key={p.product_id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium text-gray-900">{p.name}</td>
                    <td className="px-4 py-2 text-right font-semibold">{formatNumber(p.produced)}</td>
                    <td className="px-4 py-2 text-right">{formatNumber(p.to_pos)}</td>
                    <td className="px-4 py-2 text-right">{formatNumber(p.to_couriers)}</td>
                    <td className={`px-4 py-2 text-right ${p.pending > 0 ? 'text-amber-700 font-semibold' : 'text-gray-400'}`}>{formatNumber(p.pending)}</td>
                    <td className="px-4 py-2 text-right">{formatNumber(p.sold_pos)}</td>
                    <td className="px-4 py-2 text-right">{formatNumber(p.sold_couriers)}</td>
                    <td className={`px-4 py-2 text-right ${p.unsold > 0 ? 'text-red-600' : 'text-gray-400'}`}>{formatNumber(p.unsold)}</td>
                    <td className="px-4 py-2 text-right text-gray-500">{formatNumber(p.stock_pos)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {data.shifts.length > 0 && (
            <div className="card overflow-x-auto">
              <div className="px-4 pt-4 pb-2 flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900">Équipes (fiche journalière)</h3>
                  <p className="text-xs text-gray-500">Manquants signalés au responsable de chaque équipe</p>
                </div>
                <Link to="/daily-sheet" className="text-xs font-medium text-primary hover:underline">Ouvrir la fiche →</Link>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                  <tr>
                    <th className="text-left px-4 py-2">Équipe</th>
                    <th className="text-left px-4 py-2">Responsable</th>
                    <th className="text-right px-4 py-2">Vendu caisse</th>
                    <th className="text-right px-4 py-2">Écart (pièces)</th>
                    <th className="text-right px-4 py-2">Manquant</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.shifts.map(s => (
                    <tr key={s.shift}>
                      <td className="px-4 py-2 font-medium">{s.label}{s.status === 'open' && <span className="ml-2 badge bg-amber-100 text-amber-800">en cours</span>}</td>
                      <td className="px-4 py-2 text-gray-600">{s.responsible ?? '—'}</td>
                      <td className="px-4 py-2 text-right">{formatNumber(s.sold)}</td>
                      <td className="px-4 py-2 text-right">{s.status === 'closed' ? formatNumber(s.gap_qty) : '—'}</td>
                      <td className={`px-4 py-2 text-right font-semibold ${s.over_tolerance > 0 ? 'text-red-600' : s.gap_value > 0 ? 'text-amber-700' : 'text-gray-400'}`}>
                        {s.status === 'closed' ? formatCurrency(s.gap_value) : '—'}
                        {s.over_tolerance > 0 && <span className="block text-[11px] font-normal">{s.over_tolerance} produit(s) hors tolérance</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="card overflow-x-auto">
            <div className="px-4 pt-4 pb-2">
              <h3 className="font-semibold text-gray-900">Livreurs</h3>
              <p className="text-xs text-gray-500">Tournées clôturées ce jour-là et marchandise encore en circulation</p>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                <tr>
                  <th className="text-left px-4 py-2">Livreur</th>
                  <th className="text-right px-4 py-2">En tournée</th>
                  <th className="text-right px-4 py-2">Vendu</th>
                  <th className="text-right px-4 py-2">Rendu</th>
                  <th className="text-right px-4 py-2">Dû</th>
                  <th className="text-right px-4 py-2">Versé</th>
                  <th className="text-right px-4 py-2">Manquant cumulé</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.couriers.length === 0 && (
                  <tr><td colSpan={7} className="text-center py-8 text-gray-400">Aucun livreur actif</td></tr>
                )}
                {data.couriers.map(c => (
                  <tr key={c.id}>
                    <td className="px-4 py-2 font-medium">{c.name}</td>
                    <td className="px-4 py-2 text-right">{c.in_round > 0 ? formatNumber(c.in_round) : '—'}</td>
                    <td className="px-4 py-2 text-right">{formatNumber(c.sold)}</td>
                    <td className="px-4 py-2 text-right">{formatNumber(c.returned)}</td>
                    <td className="px-4 py-2 text-right">{formatCurrency(c.amount_due)}</td>
                    <td className="px-4 py-2 text-right">{formatCurrency(c.amount_paid)}</td>
                    <td className={`px-4 py-2 text-right font-semibold ${c.debt > 0 ? 'text-red-600' : 'text-gray-400'}`}>{formatCurrency(c.debt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
