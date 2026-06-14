import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import api from '../../lib/api'
import { useAuthStore } from '../../store/auth.store'
import toast from 'react-hot-toast'
import {
  Users, Plus, Search, Edit2, Trash2, X, Check, Eye, EyeOff,
  UserCheck, UserX, Shield, Store as StoreIcon, Clock,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface UserEntry {
  id: number
  name: string
  email: string
  is_active: boolean
  store_id: number | null
  store?: { id: number; name: string; code: string }
  roles: { name: string }[]
  last_login_at: string | null
  created_at: string
}

interface RoleEntry {
  id: number
  name: string
}

interface StoreEntry {
  id: number
  name: string
  code: string
  is_active: boolean
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ROLE_META: Record<string, { label: string; color: string }> = {
  super_admin:  { label: 'Super Admin',   color: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  gerant:       { label: 'Gérant',        color: 'bg-blue-100 text-blue-800 border-blue-200' },
  caissier:     { label: 'Caissier',      color: 'bg-green-100 text-green-800 border-green-200' },
  serveur:      { label: 'Serveur',       color: 'bg-purple-100 text-purple-800 border-purple-200' },
  cuisinier:    { label: 'Cuisinier',     color: 'bg-orange-100 text-orange-800 border-orange-200' },
  magasinier:   { label: 'Magasinier',    color: 'bg-teal-100 text-teal-800 border-teal-200' },
  comptable:    { label: 'Comptable',     color: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
  proprietaire: { label: 'Propriétaire',  color: 'bg-pink-100 text-pink-800 border-pink-200' },
}

function RoleBadge({ role }: { role: string }) {
  const meta = ROLE_META[role] ?? { label: role, color: 'bg-gray-100 text-gray-700 border-gray-200' }
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${meta.color}`}>
      <Shield size={10} />
      {meta.label}
    </span>
  )
}

// ─── User Form Modal ──────────────────────────────────────────────────────────

interface UserFormProps {
  user?: UserEntry | null
  roles: RoleEntry[]
  stores: StoreEntry[]
  isSuperAdmin: boolean
  currentStoreId: number | null
  onClose: () => void
  onSaved: () => void
}

function UserFormModal({ user, roles, stores, isSuperAdmin, currentStoreId, onClose, onSaved }: UserFormProps) {
  const isEdit = !!user

  const [form, setForm] = useState({
    name:      user?.name ?? '',
    email:     user?.email ?? '',
    password:  '',
    pin:       '',
    role:      user?.roles?.[0]?.name ?? '',
    store_id:  user?.store_id?.toString() ?? (currentStoreId?.toString() ?? ''),
    is_active: user?.is_active ?? true,
  })
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const qc = useQueryClient()

  const mutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      isEdit
        ? api.put(`/users/${user!.id}`, data)
        : api.post('/users', data),
    onSuccess: () => {
      toast.success(isEdit ? 'Utilisateur modifié' : 'Utilisateur créé')
      qc.invalidateQueries({ queryKey: ['users'] })
      onSaved()
      onClose()
    },
    onError: (e: any) => {
      const errData = e.response?.data?.errors
      if (errData) {
        const mapped: Record<string, string> = {}
        Object.entries(errData).forEach(([k, v]) => { mapped[k] = (v as string[])[0] })
        setErrors(mapped)
      } else {
        toast.error(e.response?.data?.message ?? 'Erreur lors de la sauvegarde')
      }
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setErrors({})
    const payload: Record<string, unknown> = {
      name: form.name,
      role: form.role,
    }
    if (!isEdit) {
      payload.email = form.email
      payload.password = form.password
      payload.pin = form.pin
    }
    if (isEdit) {
      if (form.password) payload.password = form.password
      if (form.pin)      payload.pin = form.pin
      payload.is_active = form.is_active
    }
    if (isSuperAdmin) payload.store_id = parseInt(form.store_id)
    mutation.mutate(payload)
  }

  const field = (label: string, key: keyof typeof form, type = 'text', required = false, hint?: string) => (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {type === 'password' ? (
        <div className="relative">
          <input
            type={showPassword ? 'text' : 'password'}
            value={form[key] as string}
            onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
            className={`input pr-9 ${errors[key] ? 'border-red-400' : ''}`}
            placeholder={isEdit ? '(laisser vide pour ne pas changer)' : undefined}
          />
          <button type="button" onClick={() => setShowPassword(s => !s)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
            {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
      ) : (
        <input
          type={type}
          value={form[key] as string}
          onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
          className={`input ${errors[key] ? 'border-red-400' : ''}`}
          disabled={isEdit && (key === 'email')}
          readOnly={isEdit && (key === 'email')}
        />
      )}
      {hint && <p className="text-xs text-gray-400 mt-0.5">{hint}</p>}
      {errors[key] && <p className="text-xs text-red-500 mt-0.5">{errors[key]}</p>}
    </div>
  )

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-primary/10 rounded-xl flex items-center justify-center">
              <Users size={17} className="text-primary" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900">{isEdit ? 'Modifier l\'utilisateur' : 'Nouvel utilisateur'}</h2>
              {isEdit && <p className="text-xs text-gray-400">{user!.email}</p>}
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Name */}
          {field('Nom complet', 'name', 'text', true)}

          {/* Email (create only) */}
          {!isEdit && field('Adresse email', 'email', 'email', true)}

          {/* Role */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              Rôle <span className="text-red-500">*</span>
            </label>
            <select
              value={form.role}
              onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
              className={`input ${errors.role ? 'border-red-400' : ''}`}
              required
            >
              <option value="">-- Sélectionner un rôle --</option>
              {roles.map(r => (
                <option key={r.id} value={r.name}>
                  {ROLE_META[r.name]?.label ?? r.name}
                </option>
              ))}
            </select>
            {errors.role && <p className="text-xs text-red-500 mt-0.5">{errors.role}</p>}
          </div>

          {/* Store (super_admin only) */}
          {isSuperAdmin && (
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">
                Magasin <span className="text-red-500">*</span>
              </label>
              <select
                value={form.store_id}
                onChange={e => setForm(f => ({ ...f, store_id: e.target.value }))}
                className={`input ${errors.store_id ? 'border-red-400' : ''}`}
                required
              >
                <option value="">-- Sélectionner un magasin --</option>
                {stores.filter(s => s.is_active).map(s => (
                  <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                ))}
              </select>
              {errors.store_id && <p className="text-xs text-red-500 mt-0.5">{errors.store_id}</p>}
            </div>
          )}

          {/* Password */}
          {field(
            isEdit ? 'Nouveau mot de passe' : 'Mot de passe',
            'password', 'password', !isEdit,
            isEdit ? undefined : 'Minimum 8 caractères'
          )}

          {/* PIN */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              PIN caisse {!isEdit && <span className="text-red-500">*</span>}
            </label>
            <input
              type="password"
              value={form.pin}
              onChange={e => setForm(f => ({ ...f, pin: e.target.value.slice(0, 4) }))}
              maxLength={4}
              placeholder={isEdit ? '(laisser vide pour ne pas changer)' : '4 chiffres'}
              className={`input tracking-widest font-mono ${errors.pin ? 'border-red-400' : ''}`}
            />
            <p className="text-xs text-gray-400 mt-0.5">4 chiffres — utilisé pour la connexion rapide au POS</p>
            {errors.pin && <p className="text-xs text-red-500 mt-0.5">{errors.pin}</p>}
          </div>

          {/* Active toggle (edit only) */}
          {isEdit && (
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
              <div>
                <p className="text-sm font-medium text-gray-700">Compte actif</p>
                <p className="text-xs text-gray-400">Un compte inactif ne peut plus se connecter</p>
              </div>
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}
                className={`w-11 h-6 rounded-full transition-colors relative ${form.is_active ? 'bg-primary' : 'bg-gray-300'}`}
              >
                <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${form.is_active ? 'left-5.5 translate-x-0.5' : 'left-0.5'}`} />
              </button>
            </div>
          )}
        </form>

        <div className="flex gap-3 px-6 pb-6">
          <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
            Annuler
          </button>
          <button
            onClick={handleSubmit as any}
            disabled={mutation.isPending}
            className="flex-1 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary-600 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Check size={15} />
            {mutation.isPending ? 'Enregistrement...' : isEdit ? 'Modifier' : 'Créer'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Delete Confirmation ──────────────────────────────────────────────────────

function DeleteModal({ user, onClose, onDeleted }: { user: UserEntry; onClose: () => void; onDeleted: () => void }) {
  const qc = useQueryClient()
  const mutation = useMutation({
    mutationFn: () => api.delete(`/users/${user.id}`),
    onSuccess: () => {
      toast.success('Utilisateur supprimé')
      qc.invalidateQueries({ queryKey: ['users'] })
      onDeleted()
      onClose()
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Erreur lors de la suppression'),
  })

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <Trash2 size={18} className="text-red-600" />
          </div>
          <div>
            <h3 className="font-bold text-gray-900">Supprimer l'utilisateur</h3>
            <p className="text-sm text-gray-500">{user.name}</p>
          </div>
        </div>
        <p className="text-sm text-gray-600">
          Cette action est irréversible. L'utilisateur ne pourra plus se connecter.
        </p>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
            Annuler
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 disabled:opacity-50"
          >
            {mutation.isPending ? 'Suppression...' : 'Supprimer'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function UsersPage() {
  const { user: me, can } = useAuthStore()
  const navigate = useNavigate()
  const isSuperAdmin = me?.roles?.includes('super_admin') && !me?.store_id
  const canManage = isSuperAdmin || can('manage_users')
  const canManageRoles = can('manage_roles')

  const [search, setSearch] = useState('')
  const [filterRole, setFilterRole] = useState('')
  const [filterActive, setFilterActive] = useState<'' | 'true' | 'false'>('')
  const [showForm, setShowForm] = useState(false)
  const [editTarget, setEditTarget] = useState<UserEntry | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<UserEntry | null>(null)

  const qc = useQueryClient()

  const { data: users = [], isLoading } = useQuery<UserEntry[]>({
    queryKey: ['users'],
    queryFn: () => api.get('/users').then(r => r.data),
    staleTime: 30_000,
  })

  const { data: roles = [] } = useQuery<RoleEntry[]>({
    queryKey: ['roles'],
    queryFn: () => api.get('/roles').then(r => r.data),
    staleTime: 300_000,
  })

  const { data: stores = [] } = useQuery<StoreEntry[]>({
    queryKey: ['stores-list'],
    queryFn: () => api.get('/stores').then(r => r.data),
    enabled: isSuperAdmin,
    staleTime: 60_000,
  })

  // Toggle active status
  const toggleActive = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) =>
      api.put(`/users/${id}`, { is_active }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
      toast.success('Statut mis à jour')
    },
    onError: () => toast.error('Erreur lors de la mise à jour'),
  })

  // ── Derived data ──────────────────────────────────────────────────────────
  const filtered = users.filter(u => {
    if (search && !u.name.toLowerCase().includes(search.toLowerCase()) &&
        !u.email.toLowerCase().includes(search.toLowerCase())) return false
    if (filterRole && !u.roles.some(r => r.name === filterRole)) return false
    if (filterActive === 'true' && !u.is_active) return false
    if (filterActive === 'false' && u.is_active) return false
    return true
  })

  const totalActive   = users.filter(u => u.is_active).length
  const totalInactive = users.filter(u => !u.is_active).length

  const formatDate = (d: string | null) => {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Users size={24} /> Utilisateurs & Rôles
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Gérez les comptes, rôles et accès</p>
        </div>
        <div className="flex items-center gap-2">
          {canManageRoles && (
            <button
              onClick={() => navigate('/roles')}
              className="flex items-center gap-2 px-4 py-2 border border-primary/30 text-primary bg-primary/5 rounded-xl text-sm font-medium hover:bg-primary/10 transition-colors"
            >
              <Shield size={15} /> Gérer les rôles
            </button>
          )}
          {canManage && (
            <button
              onClick={() => { setEditTarget(null); setShowForm(true) }}
              className="btn-primary flex items-center gap-2"
            >
              <Plus size={16} /> Nouvel utilisateur
            </button>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total', value: users.length, color: 'text-gray-900', bg: 'bg-white' },
          { label: 'Actifs', value: totalActive, color: 'text-green-700', bg: 'bg-green-50' },
          { label: 'Inactifs', value: totalInactive, color: 'text-red-600', bg: 'bg-red-50' },
          { label: 'Rôles', value: roles.length, color: 'text-primary', bg: 'bg-primary/5' },
        ].map(kpi => (
          <div key={kpi.label} className={`${kpi.bg} rounded-2xl border p-4`}>
            <p className="text-xs text-gray-500">{kpi.label}</p>
            <p className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher par nom ou email..."
            className="input pl-9"
          />
        </div>
        <select
          value={filterRole}
          onChange={e => setFilterRole(e.target.value)}
          className="input w-full sm:w-44"
        >
          <option value="">Tous les rôles</option>
          {roles.map(r => (
            <option key={r.id} value={r.name}>{ROLE_META[r.name]?.label ?? r.name}</option>
          ))}
        </select>
        <select
          value={filterActive}
          onChange={e => setFilterActive(e.target.value as any)}
          className="input w-full sm:w-36"
        >
          <option value="">Tous</option>
          <option value="true">Actifs</option>
          <option value="false">Inactifs</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <div className="w-7 h-7 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-300">
            <Users size={48} className="mb-3" />
            <p className="font-medium text-gray-500">Aucun utilisateur trouvé</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-xs text-gray-500 font-semibold">
                <th className="text-left px-5 py-3">Utilisateur</th>
                <th className="text-left px-4 py-3">Rôle</th>
                {isSuperAdmin && <th className="text-left px-4 py-3">Magasin</th>}
                <th className="text-left px-4 py-3 hidden md:table-cell">Dernière connexion</th>
                <th className="text-center px-4 py-3">Statut</th>
                {canManage && <th className="text-center px-4 py-3">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(u => {
                const initial = u.name.charAt(0).toUpperCase()
                const roleName = u.roles?.[0]?.name ?? ''
                const isMe = u.id === me?.id

                return (
                  <tr key={u.id} className={`hover:bg-gray-50 transition-colors ${!u.is_active ? 'opacity-60' : ''}`}>
                    {/* User info */}
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0 ${
                          roleName === 'super_admin' ? 'bg-yellow-500' : 'bg-primary'
                        }`}>
                          {initial}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">
                            {u.name}
                            {isMe && <span className="ml-2 text-[10px] text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">Moi</span>}
                          </p>
                          <p className="text-xs text-gray-400">{u.email}</p>
                        </div>
                      </div>
                    </td>

                    {/* Role */}
                    <td className="px-4 py-3">
                      {roleName ? <RoleBadge role={roleName} /> : <span className="text-gray-300 text-xs">—</span>}
                    </td>

                    {/* Store (super_admin only) */}
                    {isSuperAdmin && (
                      <td className="px-4 py-3">
                        {u.store ? (
                          <div className="flex items-center gap-1.5 text-xs text-gray-600">
                            <StoreIcon size={12} className="text-gray-400" />
                            <span>{u.store.name}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-yellow-600 bg-yellow-50 px-2 py-0.5 rounded-full">Global</span>
                        )}
                      </td>
                    )}

                    {/* Last login */}
                    <td className="px-4 py-3 hidden md:table-cell">
                      <div className="flex items-center gap-1.5 text-xs text-gray-400">
                        <Clock size={11} />
                        {formatDate(u.last_login_at)}
                      </div>
                    </td>

                    {/* Status toggle */}
                    <td className="px-4 py-3 text-center">
                      {canManage && !isMe ? (
                        <button
                          onClick={() => toggleActive.mutate({ id: u.id, is_active: !u.is_active })}
                          disabled={toggleActive.isPending}
                          title={u.is_active ? 'Désactiver' : 'Activer'}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                            u.is_active
                              ? 'bg-green-50 text-green-700 border-green-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200'
                              : 'bg-red-50 text-red-600 border-red-200 hover:bg-green-50 hover:text-green-700 hover:border-green-200'
                          }`}
                        >
                          {u.is_active ? <><UserCheck size={11} /> Actif</> : <><UserX size={11} /> Inactif</>}
                        </button>
                      ) : (
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${
                          u.is_active ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-600 border-red-200'
                        }`}>
                          {u.is_active ? <><UserCheck size={11} /> Actif</> : <><UserX size={11} /> Inactif</>}
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    {canManage && (
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => { setEditTarget(u); setShowForm(true) }}
                            className="p-1.5 text-gray-400 hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                            title="Modifier"
                          >
                            <Edit2 size={14} />
                          </button>
                          {!isMe && (
                            <button
                              onClick={() => setDeleteTarget(u)}
                              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Supprimer"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}

        {/* Footer count */}
        {!isLoading && filtered.length > 0 && (
          <div className="px-5 py-3 border-t bg-gray-50 text-xs text-gray-400">
            {filtered.length} utilisateur{filtered.length > 1 ? 's' : ''}
            {filtered.length !== users.length && ` (sur ${users.length})`}
          </div>
        )}
      </div>

      {/* Roles legend */}
      <div className="bg-white rounded-2xl border p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <Shield size={15} /> Rôles disponibles
          </h3>
          {canManageRoles && (
            <button
              onClick={() => navigate('/roles')}
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              Gérer les droits →
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {roles.map(r => (
            <div key={r.id} className="flex items-center gap-2 px-3 py-1.5 rounded-xl border bg-gray-50 text-xs">
              <RoleBadge role={r.name} />
            </div>
          ))}
        </div>
      </div>

      {/* Modals */}
      {showForm && (
        <UserFormModal
          user={editTarget}
          roles={roles}
          stores={stores}
          isSuperAdmin={!!isSuperAdmin}
          currentStoreId={me?.store_id ?? null}
          onClose={() => { setShowForm(false); setEditTarget(null) }}
          onSaved={() => {}}
        />
      )}
      {deleteTarget && (
        <DeleteModal
          user={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}
