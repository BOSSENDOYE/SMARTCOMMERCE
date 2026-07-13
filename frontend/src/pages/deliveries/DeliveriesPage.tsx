import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import api from '../../lib/api'
import { formatCurrency, formatDate } from '../../lib/format'

// ── Types ─────────────────────────────────────────────────────────────────────

type DeliveryStatus = 'draft' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled'

interface DeliveryItem {
  id?: number
  product_id?: number | null
  description: string
  quantity: number
  unit: string
  unit_cost: number
  sort_order?: number
}

interface Delivery {
  id: number
  reference: string
  status: DeliveryStatus
  delivery_date?: string
  shipped_at?: string
  delivered_at?: string
  shipping_address?: string
  notes?: string
  total_qty: number
  client?: { id: number; name: string }
  invoice?: { id: number; reference: string }
  sale?: { id: number; reference: string }
  created_by?: { id: number; name: string }
  items?: DeliveryItem[]
  created_at: string
}

// ── Constantes ────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<DeliveryStatus, string> = {
  draft:     'Brouillon',
  confirmed: 'Confirmé',
  shipped:   'Expédié',
  delivered: 'Livré',
  cancelled: 'Annulé',
}

const STATUS_COLORS: Record<DeliveryStatus, string> = {
  draft:     'bg-gray-100 text-gray-700',
  confirmed: 'bg-blue-100 text-blue-700',
  shipped:   'bg-orange-100 text-orange-700',
  delivered: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
}

const EMPTY_ITEM: DeliveryItem = { description: '', quantity: 1, unit: 'U', unit_cost: 0 }

// ── Composant principal ───────────────────────────────────────────────────────

export default function DeliveriesPage() {
  const qc = useQueryClient()

  const [statusFilter, setStatusFilter]   = useState<string>('')
  const [search, setSearch]               = useState('')
  const [showForm, setShowForm]           = useState(false)
  const [selected, setSelected]           = useState<Delivery | null>(null)
  const [page, setPage]                   = useState(1)

  // Form state
  const [form, setForm] = useState({
    client_id: '',
    invoice_id: '',
    delivery_date: '',
    shipping_address: '',
    notes: '',
    items: [{ ...EMPTY_ITEM }] as DeliveryItem[],
  })

  // ── Queries ────────────────────────────────────────────────────────────────

  const params = new URLSearchParams({ page: String(page), per_page: '15' })
  if (statusFilter) params.set('status', statusFilter)
  if (search)       params.set('search', search)

  const { data, isLoading } = useQuery({
    queryKey: ['deliveries', statusFilter, search, page],
    queryFn: () => api.get(`/deliveries?${params}`).then(r => r.data),
  })

  const { data: detail } = useQuery({
    queryKey: ['delivery', selected?.id],
    queryFn: () => api.get(`/deliveries/${selected!.id}`).then(r => r.data),
    enabled: !!selected?.id,
  })

  // ── Mutations ──────────────────────────────────────────────────────────────

  const invalidate = () => qc.invalidateQueries({ queryKey: ['deliveries'] })

  const createMut = useMutation({
    mutationFn: (payload: typeof form) => api.post('/deliveries', payload).then(r => r.data),
    onSuccess: () => { toast.success('BL créé'); setShowForm(false); resetForm(); invalidate() },
    onError:   (e: any) => toast.error(e.response?.data?.message ?? 'Erreur'),
  })

  const actionMut = useMutation({
    mutationFn: ({ id, action }: { id: number; action: string }) =>
      api.post(`/deliveries/${id}/${action}`).then(r => r.data),
    onSuccess: () => { toast.success('Action effectuée'); invalidate(); setSelected(null) },
    onError:   (e: any) => toast.error(e.response?.data?.message ?? 'Erreur'),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete(`/deliveries/${id}`),
    onSuccess: () => { toast.success('BL supprimé'); invalidate(); setSelected(null) },
    onError:   (e: any) => toast.error(e.response?.data?.message ?? 'Erreur'),
  })

  // ── Helpers ────────────────────────────────────────────────────────────────

  function resetForm() {
    setForm({ client_id: '', invoice_id: '', delivery_date: '', shipping_address: '', notes: '', items: [{ ...EMPTY_ITEM }] })
  }

  function addItem() {
    setForm(f => ({ ...f, items: [...f.items, { ...EMPTY_ITEM }] }))
  }

  function removeItem(i: number) {
    setForm(f => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }))
  }

  function updateItem(i: number, field: keyof DeliveryItem, value: any) {
    setForm(f => {
      const items = [...f.items]
      items[i] = { ...items[i], [field]: value }
      return { ...f, items }
    })
  }

  const deliveries: Delivery[] = data?.data ?? []

  // ── Rendu ──────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Livraisons</h1>
          <p className="text-sm text-gray-500">Bons de livraison clients</p>
        </div>
        <button
          onClick={() => { setShowForm(true); setSelected(null) }}
          className="bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90"
        >
          + Nouveau BL
        </button>
      </div>

      {/* Filtres */}
      <div className="flex gap-3 flex-wrap">
        <input
          type="text"
          placeholder="Rechercher référence, client..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
          className="border rounded-lg px-3 py-2 text-sm w-64"
        />
        <div className="flex gap-2">
          {(['', 'draft', 'confirmed', 'shipped', 'delivered', 'cancelled'] as const).map(s => (
            <button
              key={s}
              onClick={() => { setStatusFilter(s); setPage(1) }}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition ${
                statusFilter === s ? 'bg-primary text-white border-primary' : 'bg-white text-gray-600 border-gray-300'
              }`}
            >
              {s === '' ? 'Tous' : STATUS_LABELS[s as DeliveryStatus]}
            </button>
          ))}
        </div>
      </div>

      {/* Tableau */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Chargement...</div>
        ) : deliveries.length === 0 ? (
          <div className="p-8 text-center text-gray-400">Aucun bon de livraison trouvé</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Référence</th>
                <th className="px-4 py-3 text-left">Client</th>
                <th className="px-4 py-3 text-left">Date prévue</th>
                <th className="px-4 py-3 text-center">Statut</th>
                <th className="px-4 py-3 text-right">Qté totale</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {deliveries.map(d => (
                <tr key={d.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono font-medium text-primary">{d.reference}</td>
                  <td className="px-4 py-3 text-gray-700">{d.client?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{d.delivery_date ? formatDate(d.delivery_date) : '—'}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[d.status]}`}>
                      {STATUS_LABELS[d.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700">{d.total_qty}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setSelected(d)}
                      className="text-primary hover:underline text-xs mr-2"
                    >
                      Voir
                    </button>
                    {d.status === 'draft' && (
                      <button
                        onClick={() => deleteMut.mutate(d.id)}
                        className="text-red-500 hover:underline text-xs"
                      >
                        Supprimer
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {data && data.last_page > 1 && (
        <div className="flex justify-center gap-2">
          {Array.from({ length: data.last_page }, (_, i) => i + 1).map(p => (
            <button
              key={p}
              onClick={() => setPage(p)}
              className={`w-8 h-8 rounded text-sm ${page === p ? 'bg-primary text-white' : 'bg-white border text-gray-600'}`}
            >
              {p}
            </button>
          ))}
        </div>
      )}

      {/* Modal: Nouveau BL */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b flex justify-between items-center">
              <h2 className="text-lg font-bold">Nouveau bon de livraison</h2>
              <button onClick={() => { setShowForm(false); resetForm() }} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date prévue</label>
                  <input type="date" value={form.delivery_date} onChange={e => setForm(f => ({ ...f, delivery_date: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Référence facture (optionnel)</label>
                  <input type="number" placeholder="ID facture" value={form.invoice_id} onChange={e => setForm(f => ({ ...f, invoice_id: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Adresse de livraison</label>
                <textarea value={form.shipping_address} onChange={e => setForm(f => ({ ...f, shipping_address: e.target.value }))}
                  rows={2} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Adresse..." />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  rows={2} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Notes..." />
              </div>

              {/* Lignes */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-sm font-medium text-gray-700">Articles</label>
                  <button onClick={addItem} className="text-xs text-primary hover:underline">+ Ajouter une ligne</button>
                </div>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-xs text-gray-500">
                      <tr>
                        <th className="px-3 py-2 text-left">Description</th>
                        <th className="px-3 py-2 text-right w-24">Quantité</th>
                        <th className="px-3 py-2 text-center w-16">Unité</th>
                        <th className="px-3 py-2 w-8"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {form.items.map((item, i) => (
                        <tr key={i}>
                          <td className="px-3 py-1">
                            <input value={item.description} onChange={e => updateItem(i, 'description', e.target.value)}
                              className="w-full border-0 focus:ring-0 text-sm p-1" placeholder="Description..." />
                          </td>
                          <td className="px-3 py-1">
                            <input type="number" step="0.001" value={item.quantity} onChange={e => updateItem(i, 'quantity', parseFloat(e.target.value) || 0)}
                              className="w-full border-0 focus:ring-0 text-sm p-1 text-right" />
                          </td>
                          <td className="px-3 py-1">
                            <input value={item.unit} onChange={e => updateItem(i, 'unit', e.target.value)}
                              className="w-full border-0 focus:ring-0 text-sm p-1 text-center" />
                          </td>
                          <td className="px-3 py-1">
                            {form.items.length > 1 && (
                              <button onClick={() => removeItem(i)} className="text-red-400 hover:text-red-600">✕</button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="p-6 border-t flex justify-end gap-3">
              <button onClick={() => { setShowForm(false); resetForm() }} className="px-4 py-2 border rounded-lg text-sm">Annuler</button>
              <button
                onClick={() => createMut.mutate(form)}
                disabled={createMut.isPending || form.items.every(i => !i.description)}
                className="px-4 py-2 bg-primary text-white rounded-lg text-sm disabled:opacity-50"
              >
                {createMut.isPending ? 'Création...' : 'Créer le BL'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Détail BL */}
      {selected && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b flex justify-between items-center">
              <div>
                <h2 className="text-lg font-bold font-mono">{selected.reference}</h2>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[selected.status]}`}>
                  {STATUS_LABELS[selected.status]}
                </span>
              </div>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>

            <div className="p-6 space-y-4">
              {detail && (
                <>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div><span className="text-gray-500">Client:</span> <span className="font-medium">{detail.client?.name ?? '—'}</span></div>
                    <div><span className="text-gray-500">Date prévue:</span> <span className="font-medium">{detail.delivery_date ? formatDate(detail.delivery_date) : '—'}</span></div>
                    {detail.invoice && <div><span className="text-gray-500">Facture:</span> <span className="font-medium">{detail.invoice.reference}</span></div>}
                    {detail.shipped_at && <div><span className="text-gray-500">Expédié:</span> <span className="font-medium">{formatDate(detail.shipped_at)}</span></div>}
                    {detail.delivered_at && <div><span className="text-gray-500">Livré:</span> <span className="font-medium">{formatDate(detail.delivered_at)}</span></div>}
                  </div>

                  {detail.shipping_address && (
                    <div className="text-sm bg-gray-50 p-3 rounded-lg">
                      <span className="text-gray-500 block mb-1">Adresse de livraison:</span>
                      <span>{detail.shipping_address}</span>
                    </div>
                  )}

                  <table className="w-full text-sm border rounded-lg overflow-hidden">
                    <thead className="bg-gray-50 text-xs text-gray-500">
                      <tr>
                        <th className="px-3 py-2 text-left">Description</th>
                        <th className="px-3 py-2 text-right">Quantité</th>
                        <th className="px-3 py-2 text-center">Unité</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {detail.items?.map((item: DeliveryItem, i: number) => (
                        <tr key={i}>
                          <td className="px-3 py-2">{item.description}</td>
                          <td className="px-3 py-2 text-right font-medium">{item.quantity}</td>
                          <td className="px-3 py-2 text-center text-gray-500">{item.unit}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Boutons d'action selon statut */}
                  <div className="flex gap-2 flex-wrap">
                    {detail.status === 'draft' && (
                      <button
                        onClick={() => actionMut.mutate({ id: detail.id, action: 'confirm' })}
                        disabled={actionMut.isPending}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm"
                      >
                        Confirmer
                      </button>
                    )}
                    {detail.status === 'confirmed' && (
                      <button
                        onClick={() => actionMut.mutate({ id: detail.id, action: 'ship' })}
                        disabled={actionMut.isPending}
                        className="px-4 py-2 bg-orange-500 text-white rounded-lg text-sm"
                      >
                        Marquer expédié
                      </button>
                    )}
                    {detail.status === 'shipped' && (
                      <button
                        onClick={() => actionMut.mutate({ id: detail.id, action: 'deliver' })}
                        disabled={actionMut.isPending}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm"
                      >
                        Marquer livré
                      </button>
                    )}
                    {!['delivered', 'cancelled'].includes(detail.status) && (
                      <button
                        onClick={() => actionMut.mutate({ id: detail.id, action: 'cancel' })}
                        disabled={actionMut.isPending}
                        className="px-4 py-2 bg-red-100 text-red-700 rounded-lg text-sm"
                      >
                        Annuler
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
