import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Users, Plus, Edit, Power, RefreshCw, ShieldCheck, Headphones, DollarSign, X } from 'lucide-react'
import { useForm } from 'react-hook-form'
import axios from 'axios'
import toast from 'react-hot-toast'
import { useSuperAdminStore } from '../../store/superAdmin.store'

const saApi = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api/v1',
  headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
})

saApi.interceptors.request.use(cfg => {
  const token = useSuperAdminStore.getState().token
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

interface Admin {
  id: number
  name: string
  email: string
  role: 'super_admin' | 'support' | 'billing'
  is_active: boolean
  last_login_at: string | null
  created_at: string
}

interface AdminForm {
  name: string
  email: string
  password?: string
  role: 'super_admin' | 'support' | 'billing'
  is_active: boolean
}

const ROLE_CONFIG = {
  super_admin: { label: 'Super Admin', icon: <ShieldCheck size={12} />, color: 'bg-brand text-white' },
  support:     { label: 'Support',     icon: <Headphones size={12} />, color: 'bg-blue-100 text-blue-700' },
  billing:     { label: 'Facturation', icon: <DollarSign size={12} />, color: 'bg-green-100 text-green-700' },
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function AdminModal({ admin, onClose }: { admin: Admin | null; onClose: () => void }) {
  const qc = useQueryClient()
  const isEdit = !!admin

  const { register, handleSubmit, formState: { errors } } = useForm<AdminForm>({
    defaultValues: {
      name: admin?.name ?? '',
      email: admin?.email ?? '',
      role: admin?.role ?? 'support',
      is_active: admin?.is_active ?? true,
      password: '',
    },
  })

  const mutation = useMutation({
    mutationFn: (data: AdminForm) => {
      const payload = { ...data }
      if (!payload.password) delete payload.password
      if (isEdit) return saApi.put(`/superadmin/admins/${admin!.id}`, payload)
      return saApi.post('/superadmin/admins', payload)
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Administrateur mis à jour' : 'Administrateur créé')
      qc.invalidateQueries({ queryKey: ['sa-admins'] })
      onClose()
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message ?? 'Erreur')
    },
  })

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">
            {isEdit ? 'Modifier l\'administrateur' : 'Nouvel administrateur'}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit(d => mutation.mutate(d))} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nom complet</label>
            <input {...register('name', { required: 'Requis' })} className="input" placeholder="Prénom Nom" />
            {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Adresse e-mail</label>
            <input {...register('email', { required: 'Requis' })} type="email" className="input" placeholder="admin@baobab.sn" />
            {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {isEdit ? 'Nouveau mot de passe (laisser vide pour ne pas changer)' : 'Mot de passe'}
            </label>
            <input
              {...register('password', { required: !isEdit ? 'Requis' : false, minLength: { value: 8, message: '8 caractères minimum' } })}
              type="password" className="input" placeholder="••••••••"
            />
            {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Rôle</label>
            <select {...register('role')} className="input">
              <option value="support">Support</option>
              <option value="billing">Facturation</option>
              <option value="super_admin">Super Admin</option>
            </select>
          </div>
          <div className="flex items-center gap-3">
            <input {...register('is_active')} type="checkbox" id="is_active" className="w-4 h-4 accent-primary" />
            <label htmlFor="is_active" className="text-sm font-medium text-gray-700">Compte actif</label>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
              Annuler
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="px-4 py-2 bg-brand hover:bg-brand-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50"
            >
              {mutation.isPending ? 'Enregistrement…' : isEdit ? 'Mettre à jour' : 'Créer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function AdminsPage() {
  const qc = useQueryClient()
  const currentAdmin = useSuperAdminStore(s => s.admin)
  const [modalAdmin, setModalAdmin] = useState<Admin | null | undefined>(undefined)

  const { data, isLoading } = useQuery({
    queryKey: ['sa-admins'],
    queryFn: () => saApi.get('/superadmin/admins').then(r => r.data),
  })

  const toggleActive = useMutation({
    mutationFn: (a: Admin) => saApi.patch(`/superadmin/admins/${a.id}/toggle-active`),
    onSuccess: () => {
      toast.success('Statut mis à jour')
      qc.invalidateQueries({ queryKey: ['sa-admins'] })
    },
    onError: () => toast.error('Erreur'),
  })

  const admins: Admin[] = data ?? []

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Administrateurs</h1>
          <p className="text-sm text-gray-500 mt-0.5">Gestion des comptes administrateurs de la plateforme</p>
        </div>
        {currentAdmin?.role === 'super_admin' && (
          <button
            onClick={() => setModalAdmin(null)}
            className="flex items-center gap-2 bg-brand hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            <Plus size={16} /> Nouvel admin
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <RefreshCw size={24} className="animate-spin text-gray-300" />
          </div>
        ) : admins.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <Users size={40} className="mb-3 opacity-30" />
            <p className="text-sm">Aucun administrateur</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Administrateur</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Rôle</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase hidden md:table-cell">Dernière connexion</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Statut</th>
                {currentAdmin?.role === 'super_admin' && (
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {admins.map((admin: Admin) => {
                const role = ROLE_CONFIG[admin.role] ?? ROLE_CONFIG.support
                return (
                  <tr key={admin.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-brand flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                          {admin.name[0]?.toUpperCase()}
                        </div>
                        <div>
                          <div className="font-semibold text-gray-800">
                            {admin.name}
                            {admin.id === currentAdmin?.id && (
                              <span className="ml-2 text-[10px] bg-primary/10 text-primary font-bold px-1.5 py-0.5 rounded">Vous</span>
                            )}
                          </div>
                          <div className="text-xs text-gray-500">{admin.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${role.color}`}>
                        {role.icon} {role.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 hidden md:table-cell">{fmtDate(admin.last_login_at)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                        admin.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {admin.is_active ? '● Actif' : '● Inactif'}
                      </span>
                    </td>
                    {currentAdmin?.role === 'super_admin' && (
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setModalAdmin(admin)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-brand hover:bg-brand/10 transition-colors"
                            title="Modifier"
                          >
                            <Edit size={14} />
                          </button>
                          {admin.id !== currentAdmin?.id && (
                            <button
                              onClick={() => toggleActive.mutate(admin)}
                              className={`p-1.5 rounded-lg transition-colors ${
                                admin.is_active
                                  ? 'text-gray-400 hover:text-red-600 hover:bg-red-50'
                                  : 'text-gray-400 hover:text-green-600 hover:bg-green-50'
                              }`}
                              title={admin.is_active ? 'Désactiver' : 'Activer'}
                            >
                              <Power size={14} />
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
      </div>

      {/* Modal */}
      {modalAdmin !== undefined && (
        <AdminModal admin={modalAdmin} onClose={() => setModalAdmin(undefined)} />
      )}
    </div>
  )
}
