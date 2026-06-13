import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../lib/api'
import toast from 'react-hot-toast'
import {
  Plus, Search, Edit2, Trash2, ChefHat, Clock, DollarSign,
  ToggleLeft, ToggleRight, X, Save, AlertTriangle, Package,
  UtensilsCrossed, Star, Coffee, Soup, IceCream,
} from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

type Course = 'starter' | 'main' | 'dessert' | 'drink' | 'other'

interface Station { id: number; name: string; type: string }

interface RestaurantItem {
  id: number
  name: string
  description: string | null
  station_id: number | null
  station?: Station
  course: Course
  price_ht: number
  vat_rate: number
  price_ttc: number
  cost_price: number
  preparation_time_minutes: number | null
  image: string | null
  is_available: boolean
  is_active: boolean
  sort_order: number
  notes: string | null
}

interface Stats {
  total: number
  available: number
  avg_price: number
  by_course: Record<Course, number>
}

// ── Constantes ────────────────────────────────────────────────────────────────

const COURSES: { value: Course; label: string; icon: React.ReactNode; color: string }[] = [
  { value: 'starter',  label: 'Entrée',   icon: <Soup size={14} />,        color: 'bg-orange-100 text-orange-700' },
  { value: 'main',     label: 'Plat',     icon: <UtensilsCrossed size={14} />, color: 'bg-blue-100 text-blue-700' },
  { value: 'dessert',  label: 'Dessert',  icon: <IceCream size={14} />,    color: 'bg-pink-100 text-pink-700' },
  { value: 'drink',    label: 'Boisson',  icon: <Coffee size={14} />,      color: 'bg-green-100 text-green-700' },
  { value: 'other',    label: 'Autre',    icon: <Star size={14} />,        color: 'bg-gray-100 text-gray-700' },
]

function CourseBadge({ course }: { course: Course }) {
  const c = COURSES.find(x => x.value === course)!
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${c.color}`}>
      {c.icon} {c.label}
    </span>
  )
}

function AvailBadge({ available }: { available: boolean }) {
  return available
    ? <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Disponible</span>
    : <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">Indisponible</span>
}

// ── Formulaire ────────────────────────────────────────────────────────────────

const EMPTY: Partial<RestaurantItem> = {
  name: '', description: '', course: 'main',
  price_ht: 0, vat_rate: 0, price_ttc: 0, cost_price: 0,
  preparation_time_minutes: undefined, station_id: undefined,
  is_available: true, sort_order: 0, notes: '',
}

interface FormProps {
  initial?: RestaurantItem | null
  stations: Station[]
  onClose: () => void
}

function ItemForm({ initial, stations, onClose }: FormProps) {
  const qc = useQueryClient()
  const isEdit = !!initial

  const [form, setForm] = useState<Partial<RestaurantItem>>(
    initial ? { ...initial } : { ...EMPTY }
  )

  const set = (k: keyof RestaurantItem, v: unknown) => setForm(f => {
    const next = { ...f, [k]: v }
    // Recalc TTC
    if (k === 'price_ht' || k === 'vat_rate') {
      const ht  = k === 'price_ht'  ? Number(v) : (f.price_ht  ?? 0)
      const tva = k === 'vat_rate'  ? Number(v) : (f.vat_rate  ?? 0)
      next.price_ttc = Math.round(ht * (1 + tva / 100) * 100) / 100
    }
    return next
  })

  const mut = useMutation({
    mutationFn: (data: Partial<RestaurantItem>) =>
      isEdit
        ? api.put(`/restaurant-items/${initial!.id}`, data).then(r => r.data)
        : api.post('/restaurant-items', data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['restaurant-items'] })
      qc.invalidateQueries({ queryKey: ['restaurant-items-stats'] })
      toast.success(isEdit ? 'Article modifié' : 'Article créé')
      onClose()
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Erreur'),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name?.trim()) { toast.error('Le nom est obligatoire'); return }
    if (!form.course) { toast.error('La catégorie est obligatoire'); return }
    mut.mutate(form)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-lg font-bold">{isEdit ? 'Modifier l\'article' : 'Nouvel article'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Nom */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nom *</label>
            <input
              value={form.name ?? ''}
              onChange={e => set('name', e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
              placeholder="Ex : Thiéboudiène royal"
            />
          </div>

          {/* Catégorie + Station */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Catégorie *</label>
              <select
                value={form.course ?? 'main'}
                onChange={e => set('course', e.target.value as Course)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary/30 outline-none"
              >
                {COURSES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Station de production</label>
              <select
                value={form.station_id ?? ''}
                onChange={e => set('station_id', e.target.value ? Number(e.target.value) : undefined)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary/30 outline-none"
              >
                <option value="">— Aucune —</option>
                {stations.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>

          {/* Prix */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Prix HT *</label>
              <input
                type="number" min="0" step="1"
                value={form.price_ht ?? 0}
                onChange={e => set('price_ht', Number(e.target.value))}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary/30 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">TVA (%)</label>
              <input
                type="number" min="0" max="100" step="0.5"
                value={form.vat_rate ?? 0}
                onChange={e => set('vat_rate', Number(e.target.value))}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary/30 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Prix TTC</label>
              <input
                type="number" readOnly
                value={form.price_ttc ?? 0}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-500"
              />
            </div>
          </div>

          {/* Coût + Temps de préparation */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Coût estimé</label>
              <input
                type="number" min="0" step="1"
                value={form.cost_price ?? 0}
                onChange={e => set('cost_price', Number(e.target.value))}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary/30 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Temps de préparation (min)</label>
              <input
                type="number" min="0"
                value={form.preparation_time_minutes ?? ''}
                onChange={e => set('preparation_time_minutes', e.target.value ? Number(e.target.value) : undefined)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary/30 outline-none"
                placeholder="Ex : 15"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              rows={2}
              value={form.description ?? ''}
              onChange={e => set('description', e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary/30 outline-none resize-none"
              placeholder="Ingrédients, accompagnements..."
            />
          </div>

          {/* Disponibilité + Ordre */}
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.is_available ?? true}
                onChange={e => set('is_available', e.target.checked)}
                className="w-4 h-4 accent-primary"
              />
              <span className="text-sm font-medium text-gray-700">Disponible à la commande</span>
            </label>
            <div className="flex items-center gap-2 ml-auto">
              <label className="text-sm font-medium text-gray-700">Ordre :</label>
              <input
                type="number" min="0"
                value={form.sort_order ?? 0}
                onChange={e => set('sort_order', Number(e.target.value))}
                className="w-16 border rounded-lg px-2 py-1 text-sm focus:ring-2 focus:ring-primary/30 outline-none"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2 border-t">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors">
              Annuler
            </button>
            <button
              type="submit"
              disabled={mut.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              <Save size={15} />
              {mut.isPending ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Modal confirmation suppression ────────────────────────────────────────────

function DeleteModal({ item, onClose }: { item: RestaurantItem; onClose: () => void }) {
  const qc = useQueryClient()
  const mut = useMutation({
    mutationFn: () => api.delete(`/restaurant-items/${item.id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['restaurant-items'] })
      qc.invalidateQueries({ queryKey: ['restaurant-items-stats'] })
      toast.success('Article désactivé')
      onClose()
    },
  })

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
            <AlertTriangle size={18} className="text-red-600" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">Désactiver l'article</h3>
            <p className="text-sm text-gray-500">Cette action est réversible</p>
          </div>
        </div>
        <p className="text-sm text-gray-600 mb-5">
          L'article <strong>"{item.name}"</strong> sera masqué du menu mais conservé dans l'historique des commandes.
        </p>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Annuler</button>
          <button
            onClick={() => mut.mutate()}
            disabled={mut.isPending}
            className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50"
          >
            {mut.isPending ? 'Désactivation...' : 'Désactiver'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Page principale ───────────────────────────────────────────────────────────

export default function RestaurantMenuPage() {
  const qc = useQueryClient()

  const [search, setSearch]         = useState('')
  const [filterCourse, setFilterCourse] = useState<Course | ''>('')
  const [filterAvail, setFilterAvail]   = useState<'' | 'true' | 'false'>('')
  const [showForm, setShowForm]     = useState(false)
  const [editItem, setEditItem]     = useState<RestaurantItem | null>(null)
  const [deleteItem, setDeleteItem] = useState<RestaurantItem | null>(null)

  const { data: stats } = useQuery<Stats>({
    queryKey: ['restaurant-items-stats'],
    queryFn: () => api.get('/restaurant-items/stats').then(r => r.data),
    staleTime: 30_000,
  })

  const { data: stations = [] } = useQuery<Station[]>({
    queryKey: ['restaurant-stations'],
    queryFn: () => api.get('/restaurant-items/stations').then(r => r.data),
    staleTime: 60_000,
  })

  const { data: items = [], isLoading } = useQuery<RestaurantItem[]>({
    queryKey: ['restaurant-items', filterCourse, filterAvail],
    queryFn: () => {
      const params: Record<string, string> = {}
      if (filterCourse) params.course = filterCourse
      if (filterAvail)  params.available = filterAvail
      return api.get('/restaurant-items', { params }).then(r => r.data)
    },
    staleTime: 30_000,
  })

  const toggleMut = useMutation({
    mutationFn: (id: number) => api.post(`/restaurant-items/${id}/toggle-availability`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['restaurant-items'] })
      qc.invalidateQueries({ queryKey: ['restaurant-items-stats'] })
    },
  })

  const filtered = items.filter(i =>
    !search || i.name.toLowerCase().includes(search.toLowerCase())
  )

  const openEdit = (item: RestaurantItem) => { setEditItem(item); setShowForm(true) }
  const closeForm = () => { setShowForm(false); setEditItem(null) }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <UtensilsCrossed size={24} className="text-primary" />
            Menu Restaurant
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Gérez les articles de votre carte</p>
        </div>
        <button
          onClick={() => { setEditItem(null); setShowForm(true) }}
          className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors shadow-sm"
        >
          <Plus size={16} /> Nouvel article
        </button>
      </div>

      {/* KPIs */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border p-4">
            <p className="text-xs text-gray-500">Total articles</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{stats.total}</p>
          </div>
          <div className="bg-white rounded-xl border p-4">
            <p className="text-xs text-gray-500">Disponibles</p>
            <p className="text-2xl font-bold text-green-600 mt-1">{stats.available}</p>
          </div>
          <div className="bg-white rounded-xl border p-4">
            <p className="text-xs text-gray-500">Prix moyen TTC</p>
            <p className="text-2xl font-bold text-primary mt-1">
              {stats.avg_price.toLocaleString('fr-FR')} <span className="text-xs font-normal">FCFA</span>
            </p>
          </div>
          <div className="bg-white rounded-xl border p-4">
            <p className="text-xs text-gray-500 mb-2">Par catégorie</p>
            <div className="flex flex-wrap gap-1">
              {COURSES.map(c => (
                stats.by_course[c.value] > 0 && (
                  <span key={c.value} className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${c.color}`}>
                    {c.label}: {stats.by_course[c.value]}
                  </span>
                )
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Filtres */}
      <div className="bg-white rounded-xl border p-4 flex flex-wrap gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-[180px] border rounded-lg px-3 py-2">
          <Search size={15} className="text-gray-400 flex-shrink-0" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher un article..."
            className="flex-1 text-sm outline-none bg-transparent"
          />
          {search && <button onClick={() => setSearch('')}><X size={13} className="text-gray-400" /></button>}
        </div>

        <select
          value={filterCourse}
          onChange={e => setFilterCourse(e.target.value as Course | '')}
          className="border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary/30 outline-none"
        >
          <option value="">Toutes catégories</option>
          {COURSES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>

        <select
          value={filterAvail}
          onChange={e => setFilterAvail(e.target.value as '' | 'true' | 'false')}
          className="border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary/30 outline-none"
        >
          <option value="">Tous les états</option>
          <option value="true">Disponible</option>
          <option value="false">Indisponible</option>
        </select>

        {(filterCourse || filterAvail || search) && (
          <button
            onClick={() => { setSearch(''); setFilterCourse(''); setFilterAvail('') }}
            className="text-xs text-gray-500 hover:text-gray-700 px-2 underline"
          >
            Réinitialiser
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-48">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-400">
            <Package size={36} className="mb-2 opacity-40" />
            <p className="text-sm">Aucun article trouvé</p>
            <button
              onClick={() => { setEditItem(null); setShowForm(true) }}
              className="mt-3 text-sm text-primary hover:underline"
            >
              Créer le premier article
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Article</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Catégorie</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-700">Prix TTC</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-700">Coût</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-700">
                    <Clock size={14} className="inline" />
                  </th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-700">Station</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-700">État</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map(item => {
                  const margin = item.cost_price > 0
                    ? ((item.price_ttc - item.cost_price) / item.price_ttc * 100).toFixed(0)
                    : null
                  return (
                    <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{item.name}</div>
                        {item.description && (
                          <div className="text-xs text-gray-400 truncate max-w-[200px]">{item.description}</div>
                        )}
                      </td>
                      <td className="px-4 py-3"><CourseBadge course={item.course} /></td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-semibold text-gray-900">
                          {item.price_ttc.toLocaleString('fr-FR')}
                        </span>
                        {item.vat_rate > 0 && (
                          <span className="text-xs text-gray-400 ml-1">TVA {item.vat_rate}%</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {item.cost_price > 0 ? (
                          <div>
                            <span className="text-gray-700">{item.cost_price.toLocaleString('fr-FR')}</span>
                            {margin && (
                              <span className="ml-1 text-xs text-green-600 font-medium">({margin}%)</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center text-gray-500">
                        {item.preparation_time_minutes ? `${item.preparation_time_minutes} min` : '—'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {item.station ? (
                          <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full">
                            <ChefHat size={10} className="inline mr-1" />{item.station.name}
                          </span>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => toggleMut.mutate(item.id)}
                          className="flex items-center gap-1 mx-auto hover:opacity-80 transition-opacity"
                          title="Basculer disponibilité"
                        >
                          {item.is_available
                            ? <ToggleRight size={20} className="text-green-500" />
                            : <ToggleLeft size={20} className="text-gray-400" />}
                          <AvailBadge available={item.is_available} />
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEdit(item)}
                            className="p-1.5 text-gray-400 hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                            title="Modifier"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            onClick={() => setDeleteItem(item)}
                            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            title="Désactiver"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer count */}
        {filtered.length > 0 && (
          <div className="px-4 py-3 border-t bg-gray-50 text-xs text-gray-500">
            {filtered.length} article{filtered.length > 1 ? 's' : ''}
            {search || filterCourse || filterAvail ? ' (filtré)' : ''}
          </div>
        )}
      </div>

      {/* Modals */}
      {showForm && (
        <ItemForm
          initial={editItem}
          stations={stations}
          onClose={closeForm}
        />
      )}
      {deleteItem && (
        <DeleteModal item={deleteItem} onClose={() => setDeleteItem(null)} />
      )}
    </div>
  )
}
