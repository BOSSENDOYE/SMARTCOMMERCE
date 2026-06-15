import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../lib/api'
import { useAuthStore } from '../../store/auth.store'
import toast from 'react-hot-toast'
import {
  Shield, Plus, Trash2, X, Check, Users, ChevronRight,
  SquareCheck, Square, Minus,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Permission {
  id: number
  name: string
}

interface RoleEntry {
  id: number
  name: string
  guard_name: string
  users_count: number
  permissions: Permission[]
}

// ─── Permission Groups ────────────────────────────────────────────────────────

const PERMISSION_GROUPS: { label: string; icon: string; perms: { name: string; label: string }[] }[] = [
  {
    label: 'Général & Rapports', icon: '📊',
    perms: [
      { name: 'view_dashboard',   label: 'Voir le tableau de bord' },
      { name: 'view_reports',     label: 'Voir les rapports' },
      { name: 'view_margins',     label: 'Voir les marges' },
    ],
  },
  {
    label: 'Ventes', icon: '🧾',
    perms: [
      { name: 'create_sales',               label: 'Créer des ventes (POS & comptoir)' },
      { name: 'cancel_sales',               label: 'Annuler des ventes' },
      { name: 'apply_discounts',            label: 'Appliquer des remises' },
      { name: 'apply_discount_over_limit',  label: 'Remises sans limite' },
    ],
  },
  {
    label: 'Produits & Catalogue', icon: '📦',
    perms: [
      { name: 'manage_products',    label: 'Gérer les produits' },
      { name: 'manage_categories',  label: 'Gérer les catégories' },
      { name: 'import_export',      label: 'Import / Export' },
    ],
  },
  {
    label: 'Achats & Fournisseurs', icon: '🚚',
    perms: [
      { name: 'manage_suppliers',       label: 'Gérer les fournisseurs' },
      { name: 'create_purchase_orders', label: 'Créer des bons d\'achat' },
      { name: 'validate_purchases',     label: 'Valider les achats' },
    ],
  },
  {
    label: 'Stock & Inventaire', icon: '🏪',
    perms: [
      { name: 'view_stock',       label: 'Voir le stock' },
      { name: 'adjust_stock',     label: 'Ajuster le stock' },
      { name: 'manage_inventory', label: 'Gérer les inventaires' },
    ],
  },
  {
    label: 'Clients & Fidélité', icon: '👥',
    perms: [
      { name: 'manage_clients',    label: 'Gérer les clients' },
      { name: 'manage_loyalty',    label: 'Programme de fidélité' },
      { name: 'manage_promotions', label: 'Gérer les promotions' },
      { name: 'manage_invoices',   label: 'Gérer la facturation' },
      { name: 'manage_crm',        label: 'CRM / Gestion des leads' },
    ],
  },
  {
    label: 'Caisse', icon: '💰',
    perms: [
      { name: 'open_cash_drawer',    label: 'Ouvrir le tiroir-caisse' },
      { name: 'manage_cash_sessions', label: 'Sessions de caisse' },
      { name: 'view_cash_reports',   label: 'Rapports de caisse' },
    ],
  },
  {
    label: 'Restaurant', icon: '🍽️',
    perms: [
      { name: 'restaurant_orders',       label: 'Commandes restaurant' },
      { name: 'restaurant_kds',          label: 'Écran cuisine (KDS)' },
      { name: 'restaurant_reservations', label: 'Réservations' },
    ],
  },
  {
    label: 'Pertes & Transferts', icon: '📉',
    perms: [
      { name: 'manage_losses',   label: 'Gérer les pertes' },
      { name: 'validate_losses', label: 'Valider les pertes' },
      { name: 'manage_transfers', label: 'Transferts inter-magasins' },
    ],
  },
  {
    label: 'Comptabilité & Dépenses', icon: '📒',
    perms: [
      { name: 'view_accounting',   label: 'Voir la comptabilité' },
      { name: 'manage_accounting', label: 'Gérer la comptabilité' },
      { name: 'manage_expenses',   label: 'Gérer les dépenses' },
    ],
  },
  {
    label: 'Administration', icon: '⚙️',
    perms: [
      { name: 'manage_users',    label: 'Gérer les utilisateurs' },
      { name: 'manage_roles',    label: 'Gérer les rôles & droits' },
      { name: 'view_audit_logs', label: 'Journal d\'audit' },
      { name: 'manage_stores',   label: 'Gérer les magasins' },
      { name: 'manage_settings', label: 'Paramètres système' },
    ],
  },
]

const ALL_PERM_NAMES = PERMISSION_GROUPS.flatMap(g => g.perms.map(p => p.name))

const ROLE_META: Record<string, { label: string; color: string }> = {
  super_admin:  { label: 'Super Admin',   color: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
  gerant:       { label: 'Gérant',        color: 'bg-blue-100 text-blue-800 border-blue-300' },
  caissier:     { label: 'Caissier',      color: 'bg-green-100 text-green-800 border-green-300' },
  serveur:      { label: 'Serveur',       color: 'bg-purple-100 text-purple-800 border-purple-300' },
  cuisinier:    { label: 'Cuisinier',     color: 'bg-orange-100 text-orange-800 border-orange-300' },
  magasinier:   { label: 'Magasinier',    color: 'bg-teal-100 text-teal-800 border-teal-300' },
  comptable:    { label: 'Comptable',     color: 'bg-indigo-100 text-indigo-800 border-indigo-300' },
  proprietaire: { label: 'Propriétaire',  color: 'bg-pink-100 text-pink-800 border-pink-300' },
}

function roleMeta(name: string) {
  return ROLE_META[name] ?? { label: name, color: 'bg-gray-100 text-gray-700 border-gray-300' }
}

// ─── Create Role Modal ────────────────────────────────────────────────────────

function CreateRoleModal({ onClose, onCreated }: { onClose: () => void; onCreated: (r: RoleEntry) => void }) {
  const [name, setName] = useState('')
  const [error, setError] = useState('')

  const qc = useQueryClient()
  const mut = useMutation({
    mutationFn: () => api.post('/roles', { name: name.toLowerCase().replace(/\s+/g, '_') }),
    onSuccess: (res) => {
      const newRole: RoleEntry = res.data
      // Inject immediately into both caches so the role appears without waiting for refetch
      const insertSorted = (list: RoleEntry[] | undefined) =>
        [...(list ?? []), newRole].sort((a, b) => a.name.localeCompare(b.name))
      qc.setQueryData<RoleEntry[]>(['roles-permissions'], insertSorted)
      qc.setQueryData<RoleEntry[]>(['roles'], insertSorted)
      toast.success(`Rôle "${newRole.name}" créé`)
      onCreated(newRole)
      onClose()
    },
    onError: (e: any) => {
      setError(e.response?.data?.errors?.name?.[0] ?? e.response?.data?.message ?? 'Erreur')
    },
  })

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-gray-900 flex items-center gap-2">
            <Shield size={17} className="text-primary" /> Nouveau rôle
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">
            Nom du rôle <span className="text-red-500">*</span>
          </label>
          <input
            autoFocus
            value={name}
            onChange={e => { setName(e.target.value); setError('') }}
            placeholder="ex: responsable stock"
            className={`input ${error ? 'border-red-400' : ''}`}
          />
          {name.trim() && (
            <p className="text-xs text-primary mt-1 font-mono">
              → sera enregistré comme : <strong>{name.toLowerCase().replace(/\s+/g, '_')}</strong>
            </p>
          )}
          {!name.trim() && <p className="text-xs text-gray-400 mt-1">Espaces autorisés (convertis en _)</p>}
          {error && <p className="text-xs text-red-500 mt-0.5">{error}</p>}
        </div>

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
            Annuler
          </button>
          <button
            onClick={() => mut.mutate()}
            disabled={mut.isPending || !name.trim()}
            className="flex-1 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary-600 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Check size={14} /> {mut.isPending ? 'Création...' : 'Créer'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Permission Matrix Editor ─────────────────────────────────────────────────

function PermissionEditor({
  role,
  onSaved,
}: {
  role: RoleEntry
  onSaved: () => void
}) {
  const [selected, setSelected] = useState<Set<string>>(
    new Set(role.permissions.map(p => p.name))
  )
  const [dirty, setDirty] = useState(false)

  // Sync when role changes
  useEffect(() => {
    setSelected(new Set(role.permissions.map(p => p.name)))
    setDirty(false)
  }, [role.id])

  const qc = useQueryClient()
  const saveMut = useMutation({
    mutationFn: () => api.put(`/roles/${role.id}`, { permissions: Array.from(selected) }),
    onSuccess: () => {
      toast.success(`Droits de "${roleMeta(role.name).label}" mis à jour`)
      qc.invalidateQueries({ queryKey: ['roles-permissions'] })
      qc.invalidateQueries({ queryKey: ['roles'] })
      setDirty(false)
      onSaved()
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Erreur'),
  })

  const toggle = (perm: string) => {
    if (role.name === 'super_admin') return  // super_admin always has all perms
    setSelected(prev => {
      const next = new Set(prev)
      next.has(perm) ? next.delete(perm) : next.add(perm)
      return next
    })
    setDirty(true)
  }

  const toggleGroup = (perms: string[]) => {
    if (role.name === 'super_admin') return
    const allChecked = perms.every(p => selected.has(p))
    setSelected(prev => {
      const next = new Set(prev)
      if (allChecked) perms.forEach(p => next.delete(p))
      else perms.forEach(p => next.add(p))
      return next
    })
    setDirty(true)
  }

  const selectAll = () => {
    if (role.name === 'super_admin') return
    setSelected(new Set(ALL_PERM_NAMES))
    setDirty(true)
  }

  const clearAll = () => {
    if (role.name === 'super_admin') return
    setSelected(new Set())
    setDirty(true)
  }

  const isSuperAdmin = role.name === 'super_admin'
  const totalSelected = isSuperAdmin ? ALL_PERM_NAMES.length : selected.size

  return (
    <div className="flex flex-col h-full">
      {/* Editor header */}
      <div className="flex items-center justify-between px-6 py-4 border-b bg-gray-50 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className={`text-xs px-2.5 py-1 rounded-full font-semibold border ${roleMeta(role.name).color}`}>
                {roleMeta(role.name).label}
              </span>
              <span className="text-xs text-gray-400 flex items-center gap-1">
                <Users size={11} /> {role.users_count} utilisateur{role.users_count !== 1 ? 's' : ''}
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              {totalSelected} permission{totalSelected !== 1 ? 's' : ''} accordée{totalSelected !== 1 ? 's' : ''}
              {isSuperAdmin && ' (toutes — non modifiable)'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!isSuperAdmin && (
            <>
              <button onClick={selectAll} className="text-xs text-primary hover:underline">Tout sélectionner</button>
              <span className="text-gray-300">·</span>
              <button onClick={clearAll} className="text-xs text-gray-500 hover:underline">Tout vider</button>
            </>
          )}
          {dirty && (
            <button
              onClick={() => saveMut.mutate()}
              disabled={saveMut.isPending}
              className="ml-2 flex items-center gap-1.5 px-4 py-2 bg-primary text-white text-sm font-semibold rounded-xl hover:bg-primary-600 disabled:opacity-50 transition-colors"
            >
              <Check size={14} />
              {saveMut.isPending ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          )}
        </div>
      </div>

      {/* Permission groups */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
        {PERMISSION_GROUPS.map(group => {
          const groupPerms = group.perms.map(p => p.name)
          const checkedCount = isSuperAdmin
            ? groupPerms.length
            : groupPerms.filter(p => selected.has(p)).length
          const allChecked = checkedCount === groupPerms.length
          const someChecked = checkedCount > 0 && checkedCount < groupPerms.length

          return (
            <div key={group.label} className="border rounded-xl overflow-hidden">
              {/* Group header */}
              <button
                onClick={() => toggleGroup(groupPerms)}
                disabled={isSuperAdmin}
                className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors disabled:cursor-default"
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-base leading-none">{group.icon}</span>
                  <span className="text-sm font-semibold text-gray-800">{group.label}</span>
                  <span className="text-xs text-gray-400">({checkedCount}/{groupPerms.length})</span>
                </div>
                {isSuperAdmin ? (
                  <SquareCheck size={16} className="text-primary flex-shrink-0" />
                ) : allChecked ? (
                  <SquareCheck size={16} className="text-primary flex-shrink-0" />
                ) : someChecked ? (
                  <Minus size={16} className="text-amber-500 flex-shrink-0" />
                ) : (
                  <Square size={16} className="text-gray-300 flex-shrink-0" />
                )}
              </button>

              {/* Permissions list */}
              <div className="divide-y divide-gray-100">
                {group.perms.map(perm => {
                  const isChecked = isSuperAdmin || selected.has(perm.name)
                  return (
                    <label
                      key={perm.name}
                      className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${
                        isSuperAdmin ? 'cursor-default' : 'cursor-pointer hover:bg-primary/5'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggle(perm.name)}
                        disabled={isSuperAdmin}
                        className="w-4 h-4 rounded accent-primary flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm text-gray-800">{perm.label}</span>
                        <span className="ml-2 text-xs text-gray-400 font-mono">{perm.name}</span>
                      </div>
                      {isChecked && (
                        <Check size={13} className="text-green-500 flex-shrink-0" />
                      )}
                    </label>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {/* Sticky save bar */}
      {dirty && (
        <div className="border-t bg-amber-50 px-6 py-3 flex items-center justify-between flex-shrink-0">
          <p className="text-sm text-amber-700 font-medium">
            Modifications non enregistrées
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => { setSelected(new Set(role.permissions.map(p => p.name))); setDirty(false) }}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-100"
            >
              Annuler
            </button>
            <button
              onClick={() => saveMut.mutate()}
              disabled={saveMut.isPending}
              className="px-4 py-1.5 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary-600 disabled:opacity-50 flex items-center gap-1.5"
            >
              <Check size={13} />
              {saveMut.isPending ? 'Enregistrement...' : 'Enregistrer les modifications'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function RolesPage() {
  const { can } = useAuthStore()
  const canManage = can('manage_roles')

  const qc = useQueryClient()
  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null)
  const [newlyCreatedId, setNewlyCreatedId] = useState<number | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<RoleEntry | null>(null)
  const selectedItemRef = useRef<HTMLDivElement | null>(null)

  const { data: roles = [], isLoading } = useQuery<RoleEntry[]>({
    queryKey: ['roles-permissions'],
    queryFn: () => api.get('/roles').then(r => r.data),
    staleTime: 30_000,
  })

  // Auto-select first role
  useEffect(() => {
    if (roles.length > 0 && selectedRoleId === null) {
      setSelectedRoleId(roles[0].id)
    }
  }, [roles, selectedRoleId])

  // Scroll selected role into view whenever selection changes
  useEffect(() => {
    if (selectedItemRef.current) {
      selectedItemRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [selectedRoleId])

  // Clear "newly created" highlight after 2.5 s
  useEffect(() => {
    if (newlyCreatedId === null) return
    const t = setTimeout(() => setNewlyCreatedId(null), 2500)
    return () => clearTimeout(t)
  }, [newlyCreatedId])

  const selectedRole = roles.find(r => r.id === selectedRoleId) ?? null

  // Delete role
  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete(`/roles/${id}`),
    onSuccess: (_, id) => {
      toast.success('Rôle supprimé')
      const remove = (list: RoleEntry[] | undefined) => (list ?? []).filter(r => r.id !== id)
      qc.setQueryData<RoleEntry[]>(['roles-permissions'], remove)
      qc.setQueryData<RoleEntry[]>(['roles'], remove)
      const nextId = roles.find(r => r.id !== id)?.id ?? null
      setSelectedRoleId(nextId)
      setDeleteTarget(null)
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Erreur'),
  })

  return (
    <div className="flex h-[calc(100vh-0px)] overflow-hidden">

      {/* ── Left: Role List ── */}
      <div className="w-72 flex-shrink-0 bg-white border-r flex flex-col">
        <div className="p-4 border-b">
          <div className="flex items-center justify-between mb-0.5">
            <h2 className="font-bold text-gray-900 flex items-center gap-2 text-sm">
              <Shield size={16} className="text-primary" /> Liste des rôles
            </h2>
            {canManage && (
              <button
                onClick={() => setShowCreate(true)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-primary/10 text-primary rounded-lg hover:bg-primary/20 text-xs font-semibold transition-colors"
                title="Créer un nouveau rôle"
              >
                <Plus size={13} /> Nouveau
              </button>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-1">Cliquez sur un rôle pour modifier ses permissions</p>
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            roles.map(role => {
              const meta = roleMeta(role.name)
              const isSelected = role.id === selectedRoleId
              const isNew = role.id === newlyCreatedId
              return (
                <div
                  key={role.id}
                  ref={isSelected ? selectedItemRef : null}
                  onClick={() => setSelectedRoleId(role.id)}
                  className={`group flex items-center gap-2 px-3 py-3 mx-1 my-0.5 rounded-xl cursor-pointer transition-all ${
                    isNew
                      ? 'bg-green-50 border border-green-300 ring-1 ring-green-200'
                      : isSelected
                        ? 'bg-primary/10 border border-primary/20'
                        : 'hover:bg-gray-50 border border-transparent'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold border ${meta.color}`}>
                        {meta.label}
                      </span>
                      {role.name === 'super_admin' && <span className="text-xs">🔒</span>}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {role.permissions.length} permission{role.permissions.length !== 1 ? 's' : ''} · {role.users_count} util.
                    </p>
                  </div>

                  {isSelected
                    ? <ChevronRight size={13} className="text-primary flex-shrink-0" />
                    : canManage && role.name !== 'super_admin' && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeleteTarget(role) }}
                        className="opacity-0 group-hover:opacity-100 p-1 text-gray-300 hover:text-red-500 rounded transition-all"
                        title="Supprimer"
                      >
                        <Trash2 size={12} />
                      </button>
                    )
                  }
                </div>
              )
            })
          )}
        </div>

        {/* Legend */}
        <div className="border-t p-3">
          <p className="text-xs text-gray-500 font-medium">{roles.length} rôle{roles.length !== 1 ? 's' : ''} au total</p>
          <p className="text-xs text-gray-400 mt-0.5">{roles.reduce((s, r) => s + r.users_count, 0)} utilisateur{roles.reduce((s, r) => s + r.users_count, 0) !== 1 ? 's' : ''} assigné{roles.reduce((s, r) => s + r.users_count, 0) !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* ── Right: Permission Editor ── */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {selectedRole ? (
          canManage ? (
            <PermissionEditor
              key={selectedRole.id}
              role={selectedRole}
              onSaved={() => {}}
            />
          ) : (
            /* Read-only view */
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              <div className="flex items-center gap-3 mb-4">
                <span className={`text-sm px-3 py-1.5 rounded-full font-semibold border ${roleMeta(selectedRole.name).color}`}>
                  {roleMeta(selectedRole.name).label}
                </span>
                <span className="text-sm text-gray-400">
                  {selectedRole.permissions.length} permissions — lecture seule
                </span>
              </div>
              {PERMISSION_GROUPS.map(group => {
                const hasAny = group.perms.some(p =>
                  selectedRole.name === 'super_admin' || selectedRole.permissions.some(rp => rp.name === p.name)
                )
                return (
                  <div key={group.label} className={`border rounded-xl overflow-hidden ${!hasAny ? 'opacity-40' : ''}`}>
                    <div className="flex items-center gap-2 px-4 py-3 bg-gray-50">
                      <span>{group.icon}</span>
                      <span className="text-sm font-semibold text-gray-800">{group.label}</span>
                    </div>
                    <div className="divide-y divide-gray-100">
                      {group.perms.map(perm => {
                        const has = selectedRole.name === 'super_admin' || selectedRole.permissions.some(p => p.name === perm.name)
                        return (
                          <div key={perm.name} className={`flex items-center gap-3 px-4 py-2.5 ${has ? '' : 'opacity-40'}`}>
                            {has
                              ? <Check size={14} className="text-green-500 flex-shrink-0" />
                              : <X size={14} className="text-gray-300 flex-shrink-0" />}
                            <span className="text-sm text-gray-800">{perm.label}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-300">
            <Shield size={56} className="mb-4" />
            <p className="font-medium text-gray-500">Sélectionnez un rôle</p>
            <p className="text-sm text-gray-400">pour voir et modifier ses permissions</p>
          </div>
        )}
      </div>

      {/* Create Role Modal */}
      {showCreate && (
        <CreateRoleModal
          onClose={() => setShowCreate(false)}
          onCreated={(r) => { setSelectedRoleId(r.id); setNewlyCreatedId(r.id) }}
        />
      )}

      {/* Delete Confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
                <Trash2 size={18} className="text-red-600" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900">Supprimer le rôle</h3>
                <p className="text-sm text-gray-500">{roleMeta(deleteTarget.name).label}</p>
              </div>
            </div>
            {deleteTarget.users_count > 0 && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                Ce rôle est assigné à {deleteTarget.users_count} utilisateur{deleteTarget.users_count > 1 ? 's' : ''}.
                Réassignez-les d'abord dans Utilisateurs.
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm hover:bg-gray-50"
              >
                Annuler
              </button>
              <button
                onClick={() => deleteMut.mutate(deleteTarget.id)}
                disabled={deleteMut.isPending || deleteTarget.users_count > 0}
                className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 disabled:opacity-50"
              >
                {deleteMut.isPending ? 'Suppression...' : 'Supprimer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
