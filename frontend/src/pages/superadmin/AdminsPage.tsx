import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Users, Plus, Trash2, Shield, Headphones, CreditCard } from 'lucide-react'
import axios from 'axios'
import toast from 'react-hot-toast'

const API_URL = import.meta.env.VITE_API_URL || ''
function saApi() {
  const token = localStorage.getItem('sc_superadmin_token')
  return axios.create({
    baseURL: API_URL ? `${API_URL}/api/v1/superadmin` : '/api/v1/superadmin',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' },
  })
}

type AdminRole = 'super_admin' | 'support' | 'billing'

const roleCfg: Record<AdminRole, { label: string; icon: React.ElementType; color: string }> = {
  super_admin: { label: 'Super Admin', icon: Shield,      color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/30' },
  support:     { label: 'Support',     icon: Headphones,  color: 'text-blue-400 bg-blue-500/10 border-blue-500/30' },
  billing:     { label: 'Facturation', icon: CreditCard,  color: 'text-amber-400 bg-amber-500/10 border-amber-500/30' },
}

interface Admin {
  id: number
  name: string
  email: string
  role: AdminRole
  last_login_at: string | null
  created_at: string
}

const emptyForm = { name: '', email: '', password: '', role: 'support' as AdminRole }

export default function AdminsPage() {
  const qc = useQueryClient()
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(emptyForm)

  const { data: admins = [], isLoading } = useQuery<Admin[]>({
    queryKey: ['sa-admins'],
    queryFn: () => saApi().get('/admins').then(r => r.data),
  })

  const createMutation = useMutation({
    mutationFn: (data: typeof emptyForm) => saApi().post('/admins', data),
    onSuccess: () => { toast.success('Admin créé'); qc.invalidateQueries({ queryKey: ['sa-admins'] }); setModal(false); setForm(emptyForm) },
    onError: () => toast.error('Erreur lors de la création'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => saApi().delete(`/admins/${id}`),
    onSuccess: () => { toast.success('Admin supprimé'); qc.invalidateQueries({ queryKey: ['sa-admins'] }) },
    onError: () => toast.error('Impossible de supprimer'),
  })

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Administrateurs</h1>
          <p className="text-gray-400 text-sm">Comptes d'accès à l'espace SuperAdmin</p>
        </div>
        <button
          onClick={() => setModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm text-white transition"
        >
          <Plus className="w-4 h-4" /> Nouvel admin
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {admins.map(admin => {
            const cfg = roleCfg[admin.role]
            const Icon = cfg.icon
            return (
              <div key={admin.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-10 h-10 bg-gray-800 rounded-full flex items-center justify-center shrink-0 text-sm font-bold text-white">
                    {admin.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-white text-sm">{admin.name}</p>
                      <span className={`inline-flex items-center gap-1 border px-2 py-0.5 rounded-full text-xs ${cfg.color}`}>
                        <Icon className="w-3 h-3" />{cfg.label}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 truncate mt-0.5">{admin.email}</p>
                    <p className="text-xs text-gray-600 mt-0.5">
                      Dernière connexion : {admin.last_login_at ? new Date(admin.last_login_at).toLocaleDateString('fr-FR') : 'jamais'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => deleteMutation.mutate(admin.id)}
                  className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-900/20 rounded-lg transition shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-sm p-6 space-y-4">
            <h2 className="text-lg font-bold text-white">Nouvel administrateur</h2>
            {([
              ['name',     'Nom complet',    'text'],
              ['email',    'Email',          'email'],
              ['password', 'Mot de passe',   'password'],
            ] as [keyof typeof emptyForm, string, string][]).map(([field, label, type]) => (
              <div key={field}>
                <label className="block text-xs text-gray-400 mb-1">{label}</label>
                <input
                  type={type}
                  value={form[field]}
                  onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
            ))}
            <div>
              <label className="block text-xs text-gray-400 mb-1">Rôle</label>
              <select
                value={form.role}
                onChange={e => setForm(f => ({ ...f, role: e.target.value as AdminRole }))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="super_admin">Super Admin</option>
                <option value="support">Support</option>
                <option value="billing">Facturation</option>
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setModal(false)} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm text-gray-300 transition">Annuler</button>
              <button
                onClick={() => createMutation.mutate(form)}
                disabled={createMutation.isPending}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm text-white transition disabled:opacity-50"
              >
                {createMutation.isPending ? 'Création...' : 'Créer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
