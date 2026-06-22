import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../lib/api'
import toast from 'react-hot-toast'
import { Users, Plus, Pencil, Trash2, Check, X, Star } from 'lucide-react'
import { useConfirm } from '../../hooks/useConfirm'

interface ClientCategory {
  id: number
  name: string
  code?: string
  color: string
  sort_order: number
  is_pos_default: boolean
  is_active: boolean
}

const COLORS = [
  '#3b82f6', '#8b5cf6', '#22c55e', '#ef4444', '#f97316',
  '#eab308', '#14b8a6', '#ec4899', '#6366f1', '#64748b',
]

function CategoryFormModal({ cat, onClose }: { cat?: ClientCategory | null; onClose: () => void }) {
  const qc = useQueryClient()
  const [name, setName] = useState(cat?.name ?? '')
  const [code, setCode] = useState(cat?.code ?? '')
  const [color, setColor] = useState(cat?.color ?? COLORS[0])
  const [sortOrder, setSortOrder] = useState(cat?.sort_order?.toString() ?? '0')
  const [isPosDefault, setIsPosDefault] = useState(cat?.is_pos_default ?? false)

  const mut = useMutation({
    mutationFn: (data: object) =>
      cat ? api.put(`/client-categories/${cat.id}`, data) : api.post('/client-categories', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['client-categories'] })
      toast.success(cat ? 'Catégorie mise à jour' : 'Catégorie créée')
      onClose()
    },
    onError: (e: { response?: { data?: { message?: string } } }) =>
      toast.error(e.response?.data?.message ?? 'Erreur'),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    mut.mutate({
      name: name.trim(),
      code: code.trim() || null,
      color,
      sort_order: Number(sortOrder) || 0,
      is_pos_default: isPosDefault,
    })
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        <div className="p-5 border-b flex items-center justify-between">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Users size={18} className="text-primary" />
            {cat ? 'Modifier la catégorie' : 'Nouvelle catégorie'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Nom *</label>
              <input value={name} onChange={e => setName(e.target.value)} className="input" placeholder="ex: Gros" autoFocus />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Code</label>
              <input value={code} onChange={e => setCode(e.target.value)} className="input" placeholder="GROS" maxLength={20} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">Couleur</label>
            <div className="flex flex-wrap gap-2">
              {COLORS.map(c => (
                <button key={c} type="button" onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-full transition-transform hover:scale-110 ${color === c ? 'ring-2 ring-offset-2 ring-gray-400 scale-110' : ''}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-600 mb-1">Ordre d'affichage</label>
              <input type="number" value={sortOrder} onChange={e => setSortOrder(e.target.value)} className="input" min={0} />
            </div>
            <label className="flex items-center gap-2 cursor-pointer mt-4">
              <input type="checkbox" checked={isPosDefault} onChange={e => setIsPosDefault(e.target.checked)} className="rounded" />
              <span className="text-sm font-medium text-gray-700 flex items-center gap-1">
                <Star size={13} className="text-amber-500" /> Défaut POS
              </span>
            </label>
          </div>

          {/* Aperçu */}
          <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
              style={{ backgroundColor: color }}>
              {name.charAt(0).toUpperCase() || '?'}
            </div>
            <div>
              <p className="font-semibold text-gray-900">{name || 'Nom de la catégorie'}</p>
              {code && <p className="text-xs text-gray-400 font-mono">{code}</p>}
              {isPosDefault && <p className="text-xs text-amber-600 font-medium">Prix affiché au POS</p>}
            </div>
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Annuler</button>
            <button type="submit" disabled={mut.isPending || !name.trim()} className="btn-primary flex-1 flex items-center justify-center gap-2">
              <Check size={15} />
              {mut.isPending ? 'Enregistrement...' : (cat ? 'Modifier' : 'Créer')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function ClientCategoriesPage() {
  const qc = useQueryClient()
  const confirm = useConfirm()
  const [editCat, setEditCat] = useState<ClientCategory | null | undefined>(undefined)

  const { data: categories = [], isLoading } = useQuery<ClientCategory[]>({
    queryKey: ['client-categories'],
    queryFn: () => api.get('/client-categories').then(r => r.data),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete(`/client-categories/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['client-categories'] })
      toast.success('Catégorie supprimée')
    },
    onError: (e: { response?: { data?: { message?: string } } }) =>
      toast.error(e.response?.data?.message ?? 'Erreur'),
  })

  const setDefaultMut = useMutation({
    mutationFn: (id: number) => api.put(`/client-categories/${id}`, { is_pos_default: true }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['client-categories'] })
      toast.success('Catégorie par défaut POS mise à jour')
    },
  })

  const handleDelete = async (cat: ClientCategory) => {
    if (!(await confirm(`Supprimer la catégorie "${cat.name}" ?`, { danger: true }))) return
    deleteMut.mutate(cat.id)
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Users size={22} className="text-primary" /> Catégories clients
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Définit les types de clients et les niveaux de prix associés (Gros, Demi-Gros, Détail…)
          </p>
        </div>
        <button onClick={() => setEditCat(null)} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> Nouvelle catégorie
        </button>
      </div>

      <div className="card p-0 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Chargement...</div>
        ) : categories.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <Users size={40} className="mx-auto mb-3 opacity-30" />
            <p className="font-medium">Aucune catégorie</p>
            <button onClick={() => setEditCat(null)} className="mt-2 text-primary text-sm hover:underline">
              Créer la première catégorie
            </button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Catégorie</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Code</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Défaut POS</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Ordre</th>
                <th className="px-4 py-3 w-24" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {categories.map(cat => (
                <tr key={cat.id} className="hover:bg-gray-50 group">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                        style={{ backgroundColor: cat.color }}>
                        {cat.name.charAt(0)}
                      </div>
                      <span className="font-medium text-gray-900">{cat.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-gray-500 text-xs">{cat.code ?? '—'}</td>
                  <td className="px-4 py-3 text-center">
                    {cat.is_pos_default ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-medium">
                        <Star size={10} /> Défaut
                      </span>
                    ) : (
                      <button onClick={() => setDefaultMut.mutate(cat.id)}
                        className="text-xs text-gray-400 hover:text-amber-500 transition-colors opacity-0 group-hover:opacity-100">
                        Définir
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center text-gray-500">{cat.sort_order}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => setEditCat(cat)}
                        className="p-1.5 rounded-lg hover:bg-primary-50 text-gray-400 hover:text-primary transition-colors">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => handleDelete(cat)}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="bg-blue-50 rounded-xl p-4 text-sm text-blue-700">
        <p className="font-semibold mb-1">Comment ça fonctionne</p>
        <ul className="list-disc pl-4 space-y-1 text-blue-600">
          <li>Chaque produit peut avoir un prix différent par catégorie (dans sa fiche produit)</li>
          <li>La catégorie marquée <strong>Défaut POS</strong> est le prix affiché en caisse par défaut</li>
          <li>Assignez une catégorie à un client pour qu'il bénéficie automatiquement de son tarif</li>
        </ul>
      </div>

      {editCat !== undefined && (
        <CategoryFormModal cat={editCat} onClose={() => setEditCat(undefined)} />
      )}
    </div>
  )
}
