import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { useSuperAdminStore } from '../../store/superAdmin.store'
import toast from 'react-hot-toast'
import {
  Users, Plus, Pencil, Trash2, X, Search, Loader2,
  Building2, Store, Shield, CheckCircle, XCircle,
  Eye, EyeOff, RefreshCw, UserCheck, UserX, ChevronDown,
} from 'lucide-react'

// ── SA axios ──────────────────────────────────────────────────────────────────

const saApi = axios.create({
  baseURL: (import.meta.env.VITE_API_URL ?? 'http://localhost:8000') + '/api/v1',
  headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
})
saApi.interceptors.request.use(cfg => {
  const token = useSuperAdminStore.getState().token
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

// ── Types ─────────────────────────────────────────────────────────────────────

interface Org { id: number; name: string; code: string; is_active: boolean }
interface StoreMin { id: number; name: string; code: string; is_active: boolean; is_central: boolean }
interface TenantUser {
  id: number; name: string; email: string; role: string | null
  is_active: boolean; store_id: number | null
  store: { id: number; name: string; code: string } | null
  last_login_at: string | null; created_at: string
}

interface TenantUsersData {
  users: TenantUser[]
  stores: StoreMin[]
  roles: string[]
}

interface UserForm {
  name: string; email: string; password: string
  role: string; store_id: string; is_active: boolean
}

const emptyForm: UserForm = { name: '', email: '', password: '', role: '', store_id: '', is_active: true }

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin', gerant: 'Gérant', caissier: 'Caissier',
  serveur: 'Serveur', cuisinier: 'Cuisinier', magasinier: 'Magasinier',
  comptable: 'Comptable', proprietaire: 'Propriétaire',
}

const ROLE_COLORS: Record<string, string> = {
  super_admin: 'bg-red-100 text-red-700',
  gerant: 'bg-blue-100 text-blue-700',
  caissier: 'bg-green-100 text-green-700',
  serveur: 'bg-yellow-100 text-yellow-700',
  cuisinier: 'bg-orange-100 text-orange-700',
  magasinier: 'bg-purple-100 text-purple-700',
  comptable: 'bg-teal-100 text-teal-700',
  proprietaire: 'bg-indigo-100 text-indigo-700',
}

// ── User Form Modal ───────────────────────────────────────────────────────────

function UserFormModal({ orgId, user, stores, roles, onClose }: {
  orgId: number; user: TenantUser | null; stores: StoreMin[]; roles: string[]; onClose: () => void
}) {
  const qc = useQueryClient()
  const [form, setForm] = useState<UserForm>(user ? {
    name: user.name, email: user.email, password: '',
    role: user.role ?? '', store_id: String(user.store_id ?? ''), is_active: user.is_active,
  } : emptyForm)
  const [showPass, setShowPass] = useState(false)
  const [generatedPass, setGeneratedPass] = useState<string | null>(null)

  const set = (k: keyof UserForm, v: string | boolean) => setForm(f => ({ ...f, [k]: v }))

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        store_id: parseInt(form.store_id),
        password: form.password || undefined,
      }
      if (user) {
        return saApi.put(`/superadmin/tenants/${orgId}/users/${user.id}`, payload).then(r => r.data)
      }
      return saApi.post(`/superadmin/tenants/${orgId}/users`, payload).then(r => r.data)
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['tenant-users', orgId] })
      if (data.generated_password) {
        setGeneratedPass(data.generated_password)
      } else {
        toast.success(user ? 'Utilisateur mis à jour' : 'Utilisateur créé')
        onClose()
      }
    },
    onError: (e: { response?: { data?: { message?: string; errors?: Record<string, string[]> } } }) => {
      const msg = e.response?.data?.message ?? 'Erreur'
      const errs = e.response?.data?.errors
      if (errs) toast.error(Object.values(errs).flat()[0] ?? msg)
      else toast.error(msg)
    },
  })

  if (generatedPass) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
          <div className="text-center">
            <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <UserCheck size={28} className="text-green-600" />
            </div>
            <h2 className="text-lg font-bold text-gray-900">Utilisateur créé !</h2>
            <p className="text-sm text-gray-500 mt-1">Communiquez ces identifiants à l'utilisateur</p>
          </div>
          <div className="bg-gray-900 rounded-xl p-4 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Email</span>
              <span className="text-white font-mono">{form.email}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Mot de passe</span>
              <span className="text-white font-mono font-bold">{generatedPass}</span>
            </div>
          </div>
          <p className="text-xs text-amber-600 bg-amber-50 p-3 rounded-lg">
            ⚠️ Notez ce mot de passe maintenant — il ne sera plus affiché.
          </p>
          <button onClick={onClose}
            className="w-full bg-primary text-white py-2.5 rounded-xl font-semibold hover:opacity-90">
            Fermer
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-5 border-b">
          <div className="flex items-center gap-2">
            <Users size={18} className="text-primary" />
            <h2 className="font-semibold text-gray-800">{user ? 'Modifier utilisateur' : 'Nouvel utilisateur'}</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Nom */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Nom complet *</label>
            <input type="text" value={form.name} onChange={e => set('name', e.target.value)}
              placeholder="ex: Amadou Diallo"
              className="w-full border rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary focus:border-transparent" />
          </div>

          {/* Email */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Email *</label>
            <input type="email" value={form.email} onChange={e => set('email', e.target.value)}
              placeholder="amadou@exemple.com"
              className="w-full border rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary focus:border-transparent" />
          </div>

          {/* Mot de passe */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">
              Mot de passe {user ? '(laisser vide pour ne pas changer)' : '(vide = généré automatiquement)'}
            </label>
            <div className="relative">
              <input type={showPass ? 'text' : 'password'} value={form.password}
                onChange={e => set('password', e.target.value)}
                placeholder={user ? '••••••••' : 'Laisser vide pour générer'}
                className="w-full border rounded-xl px-3 py-2.5 pr-10 text-sm focus:ring-2 focus:ring-primary focus:border-transparent" />
              <button type="button" onClick={() => setShowPass(v => !v)}
                className="absolute right-3 top-2.5 text-gray-400">
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Rôle */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Rôle *</label>
            <div className="relative">
              <select value={form.role} onChange={e => set('role', e.target.value)}
                className="w-full border rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary appearance-none">
                <option value="">-- Choisir un rôle --</option>
                {roles.map(r => (
                  <option key={r} value={r}>{ROLE_LABELS[r] ?? r}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-3 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {/* Magasin */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Magasin assigné *</label>
            <div className="relative">
              <select value={form.store_id} onChange={e => set('store_id', e.target.value)}
                className="w-full border rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary appearance-none">
                <option value="">-- Choisir un magasin --</option>
                {stores.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.code}){s.is_central ? ' — Central' : ''}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-3 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {/* Statut */}
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
            <div>
              <p className="text-sm font-medium text-gray-700">Compte actif</p>
              <p className="text-xs text-gray-500">L'utilisateur peut se connecter</p>
            </div>
            <button type="button" onClick={() => set('is_active', !form.is_active)}
              className={`relative w-11 h-6 rounded-full transition-colors ${form.is_active ? 'bg-primary' : 'bg-gray-300'}`}>
              <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.is_active ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>
        </div>

        <div className="flex gap-3 p-5 border-t">
          <button onClick={onClose} className="flex-1 border rounded-xl py-2.5 text-sm text-gray-600 hover:bg-gray-50">Annuler</button>
          <button onClick={() => save.mutate()} disabled={save.isPending || !form.name || !form.email || !form.role || !form.store_id}
            className="flex-1 bg-primary text-white rounded-xl py-2.5 text-sm font-semibold hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-2">
            {save.isPending ? <Loader2 size={15} className="animate-spin" /> : null}
            {user ? 'Mettre à jour' : 'Créer'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function TenantUsersPage() {
  const qc = useQueryClient()
  const [selectedOrgId, setSelectedOrgId] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [modalUser, setModalUser] = useState<TenantUser | null | 'new'>()

  // Charger les organisations
  const { data: orgs = [] } = useQuery<Org[]>({
    queryKey: ['sa-orgs'],
    queryFn: () => saApi.get('/superadmin/tenants').then(r => r.data.data ?? r.data),
  })

  // Charger les utilisateurs de l'org sélectionnée
  const { data, isLoading } = useQuery<TenantUsersData>({
    queryKey: ['tenant-users', selectedOrgId],
    queryFn: () => saApi.get(`/superadmin/tenants/${selectedOrgId}/users`).then(r => r.data),
    enabled: !!selectedOrgId,
  })

  const users = (data?.users ?? []).filter(u =>
    !search || u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  )
  const stores = data?.stores ?? []
  const roles  = data?.roles ?? []

  const toggle = useMutation({
    mutationFn: (u: TenantUser) => saApi.patch(`/superadmin/tenants/${selectedOrgId}/users/${u.id}/toggle`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tenant-users', selectedOrgId] }); toast.success('Statut mis à jour') },
  })

  const remove = useMutation({
    mutationFn: (u: TenantUser) => saApi.delete(`/superadmin/tenants/${selectedOrgId}/users/${u.id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tenant-users', selectedOrgId] }); toast.success('Utilisateur supprimé') },
    onError: () => toast.error('Erreur lors de la suppression'),
  })

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Users size={22} className="text-primary" /> Gestion des utilisateurs
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Créer et affecter des utilisateurs aux organisations</p>
        </div>
        {selectedOrgId && (
          <button onClick={() => setModalUser('new')}
            className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-xl text-sm font-semibold hover:opacity-90">
            <Plus size={16} /> Nouvel utilisateur
          </button>
        )}
      </div>

      {/* Organisation selector */}
      <div className="bg-white rounded-2xl border shadow-sm p-5">
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          <Building2 size={12} className="inline mr-1" /> Sélectionner une organisation
        </label>
        <div className="relative">
          <select value={selectedOrgId ?? ''} onChange={e => { setSelectedOrgId(Number(e.target.value) || null); setSearch('') }}
            className="w-full border rounded-xl px-3 py-3 text-sm focus:ring-2 focus:ring-primary appearance-none bg-white">
            <option value="">-- Choisir une organisation --</option>
            {orgs.map((o: Org) => (
              <option key={o.id} value={o.id}>{o.name} ({o.code})</option>
            ))}
          </select>
          <ChevronDown size={16} className="absolute right-3 top-3.5 text-gray-400 pointer-events-none" />
        </div>
      </div>

      {/* Users list */}
      {selectedOrgId && (
        <div className="bg-white rounded-2xl border shadow-sm">
          {/* Toolbar */}
          <div className="p-4 border-b flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-48">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Rechercher un utilisateur…"
                className="w-full pl-9 pr-3 py-2 border rounded-xl text-sm focus:ring-2 focus:ring-primary focus:border-transparent" />
            </div>
            <button onClick={() => qc.invalidateQueries({ queryKey: ['tenant-users', selectedOrgId] })}
              className="p-2 text-gray-400 hover:text-primary border rounded-xl hover:border-primary/30">
              <RefreshCw size={15} />
            </button>
            <span className="text-sm text-gray-500">{users.length} utilisateur{users.length !== 1 ? 's' : ''}</span>
          </div>

          {/* Content */}
          {isLoading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 size={24} className="animate-spin text-primary" />
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <Users size={40} className="mx-auto mb-3 opacity-30" />
              <p className="font-medium">{search ? 'Aucun résultat' : 'Aucun utilisateur dans cette organisation'}</p>
              {!search && (
                <button onClick={() => setModalUser('new')}
                  className="mt-3 text-primary text-sm hover:underline flex items-center gap-1 mx-auto">
                  <Plus size={14} /> Créer le premier utilisateur
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y">
              {users.map(u => (
                <div key={u.id} className="flex items-center gap-4 p-4 hover:bg-gray-50 transition-colors">
                  {/* Avatar */}
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${u.is_active ? 'bg-primary/10 text-primary' : 'bg-gray-100 text-gray-400'}`}>
                    {u.name.charAt(0).toUpperCase()}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900 text-sm">{u.name}</span>
                      {u.role && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium flex items-center gap-0.5 ${ROLE_COLORS[u.role] ?? 'bg-gray-100 text-gray-600'}`}>
                          <Shield size={9} /> {ROLE_LABELS[u.role] ?? u.role}
                        </span>
                      )}
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${u.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {u.is_active ? 'Actif' : 'Inactif'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{u.email}</p>
                    {u.store && (
                      <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                        <Store size={10} /> {u.store.name} <span className="font-mono">({u.store.code})</span>
                      </p>
                    )}
                  </div>

                  {/* Last login */}
                  <div className="text-xs text-gray-400 text-right hidden sm:block flex-shrink-0">
                    {u.last_login_at
                      ? <>Connecté<br />{new Date(u.last_login_at).toLocaleDateString('fr-FR')}</>
                      : <span className="italic">Jamais connecté</span>}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => setModalUser(u)} title="Modifier"
                      className="p-2 text-gray-400 hover:text-primary hover:bg-primary/5 rounded-lg transition-colors">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => toggle.mutate(u)} title={u.is_active ? 'Désactiver' : 'Activer'}
                      className={`p-2 rounded-lg transition-colors ${u.is_active ? 'text-orange-400 hover:bg-orange-50' : 'text-green-500 hover:bg-green-50'}`}>
                      {u.is_active ? <UserX size={14} /> : <UserCheck size={14} />}
                    </button>
                    <button onClick={() => { if (confirm(`Supprimer ${u.name} ?`)) remove.mutate(u) }}
                      title="Supprimer"
                      className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal */}
      {modalUser !== undefined && selectedOrgId && (
        <UserFormModal
          orgId={selectedOrgId}
          user={modalUser === 'new' ? null : modalUser}
          stores={stores}
          roles={roles}
          onClose={() => setModalUser(undefined)}
        />
      )}
    </div>
  )
}
