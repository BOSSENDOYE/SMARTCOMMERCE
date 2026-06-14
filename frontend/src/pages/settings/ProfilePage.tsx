import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import api from '../../lib/api'
import { useAuthStore } from '../../store/auth.store'
import toast from 'react-hot-toast'
import {
  User, Lock, Hash, Shield, Check, Eye, EyeOff, Store as StoreIcon,
} from 'lucide-react'

const ROLE_META: Record<string, { label: string; color: string }> = {
  super_admin:  { label: 'Super Administrateur', color: 'bg-yellow-100 text-yellow-800' },
  gerant:       { label: 'Gérant',               color: 'bg-blue-100 text-blue-800' },
  caissier:     { label: 'Caissier',             color: 'bg-green-100 text-green-800' },
  serveur:      { label: 'Serveur',              color: 'bg-purple-100 text-purple-800' },
  cuisinier:    { label: 'Cuisinier',            color: 'bg-orange-100 text-orange-800' },
  magasinier:   { label: 'Magasinier',           color: 'bg-teal-100 text-teal-800' },
  comptable:    { label: 'Comptable',            color: 'bg-indigo-100 text-indigo-800' },
  proprietaire: { label: 'Propriétaire',         color: 'bg-pink-100 text-pink-800' },
}

const ALL_PERMISSIONS: Record<string, string> = {
  view_dashboard: 'Tableau de bord',
  view_reports: 'Rapports',
  view_margins: 'Marges',
  create_sales: 'Créer des ventes',
  cancel_sales: 'Annuler des ventes',
  apply_discounts: 'Appliquer des remises',
  apply_discount_over_limit: 'Remises sans limite',
  manage_products: 'Gérer les produits',
  manage_categories: 'Gérer les catégories',
  import_export: 'Import / Export',
  manage_suppliers: 'Gérer les fournisseurs',
  create_purchase_orders: 'Créer des achats',
  validate_purchases: 'Valider les achats',
  view_stock: 'Voir le stock',
  adjust_stock: 'Ajuster le stock',
  manage_inventory: 'Inventaire',
  manage_clients: 'Gérer les clients',
  manage_loyalty: 'Programme fidélité',
  manage_promotions: 'Promotions',
  open_cash_drawer: 'Ouvrir le tiroir-caisse',
  manage_cash_sessions: 'Sessions de caisse',
  view_cash_reports: 'Rapports de caisse',
  manage_users: 'Gérer les utilisateurs',
  manage_roles: 'Gérer les rôles',
  view_audit_logs: 'Journal d\'audit',
  manage_stores: 'Gérer les magasins',
  manage_settings: 'Paramètres système',
  restaurant_orders: 'Commandes restaurant',
  restaurant_kds: 'Écran cuisine (KDS)',
  restaurant_reservations: 'Réservations',
  manage_losses: 'Gérer les pertes',
  validate_losses: 'Valider les pertes',
  manage_transfers: 'Transferts',
  view_accounting: 'Voir la comptabilité',
  manage_accounting: 'Gérer la comptabilité',
}

// ─── Section Card ─────────────────────────────────────────────────────────────

function SectionCard({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border p-6 space-y-4">
      <h2 className="font-semibold text-gray-800 flex items-center gap-2 text-base">
        {icon} {title}
      </h2>
      {children}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const { user, setAuth, token } = useAuthStore()

  // ── Profile info form ────────────────────────────────────────────────────
  const [name, setName] = useState(user?.name ?? '')
  const [nameError, setNameError] = useState('')

  const profileMut = useMutation({
    mutationFn: (data: { name: string }) => api.put('/profile', data),
    onSuccess: (res) => {
      toast.success('Profil mis à jour')
      setNameError('')
      // Update local auth state with new name
      if (user && token) {
        setAuth({ ...user, name: res.data.name }, token)
      }
    },
    onError: (e: any) => {
      setNameError(e.response?.data?.errors?.name?.[0] ?? 'Erreur')
    },
  })

  // ── Password form ────────────────────────────────────────────────────────
  const [pwd, setPwd] = useState({ password: '', password_confirmation: '' })
  const [showPwd, setShowPwd] = useState(false)
  const [pwdErrors, setPwdErrors] = useState<Record<string, string>>({})

  const pwdMut = useMutation({
    mutationFn: (data: typeof pwd) => api.put('/profile', data),
    onSuccess: () => {
      toast.success('Mot de passe modifié')
      setPwd({ password: '', password_confirmation: '' })
      setPwdErrors({})
    },
    onError: (e: any) => {
      const errs = e.response?.data?.errors ?? {}
      const mapped: Record<string, string> = {}
      Object.entries(errs).forEach(([k, v]) => { mapped[k] = (v as string[])[0] })
      setPwdErrors(mapped)
    },
  })

  // ── PIN form ─────────────────────────────────────────────────────────────
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState('')

  const pinMut = useMutation({
    mutationFn: () => api.put('/profile', { pin }),
    onSuccess: () => {
      toast.success('PIN mis à jour')
      setPin('')
      setPinError('')
    },
    onError: (e: any) => {
      setPinError(e.response?.data?.errors?.pin?.[0] ?? 'Erreur')
    },
  })

  const roleName = user?.roles?.[0] ?? ''
  const roleMeta = ROLE_META[roleName] ?? { label: roleName, color: 'bg-gray-100 text-gray-700' }
  const permissions = user?.permissions ?? []
  const isSuperAdmin = user?.roles?.includes('super_admin')

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-white text-2xl font-bold ${
          isSuperAdmin ? 'bg-yellow-500' : 'bg-primary'
        }`}>
          {user?.name?.charAt(0)?.toUpperCase()}
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{user?.name}</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${roleMeta.color}`}>
              {roleMeta.label}
            </span>
            {user?.store && (
              <span className="text-xs text-gray-500 flex items-center gap-1">
                <StoreIcon size={11} /> {user.store.name}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-400 mt-0.5">{user?.email}</p>
        </div>
      </div>

      {/* Profile info */}
      <SectionCard icon={<User size={16} className="text-primary" />} title="Informations personnelles">
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Nom complet</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              className={`input ${nameError ? 'border-red-400' : ''}`}
            />
            {nameError && <p className="text-xs text-red-500 mt-0.5">{nameError}</p>}
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Email</label>
            <input value={user?.email ?? ''} className="input bg-gray-50" readOnly />
            <p className="text-xs text-gray-400 mt-0.5">L'email ne peut pas être modifié</p>
          </div>
          <button
            onClick={() => profileMut.mutate({ name })}
            disabled={profileMut.isPending || name === user?.name || !name.trim()}
            className="btn-primary flex items-center gap-2 disabled:opacity-50"
          >
            <Check size={15} />
            {profileMut.isPending ? 'Enregistrement...' : 'Mettre à jour le profil'}
          </button>
        </div>
      </SectionCard>

      {/* Password */}
      <SectionCard icon={<Lock size={16} className="text-red-500" />} title="Changer le mot de passe">
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Nouveau mot de passe</label>
            <div className="relative">
              <input
                type={showPwd ? 'text' : 'password'}
                value={pwd.password}
                onChange={e => setPwd(p => ({ ...p, password: e.target.value }))}
                placeholder="Minimum 8 caractères"
                className={`input pr-9 ${pwdErrors.password ? 'border-red-400' : ''}`}
              />
              <button type="button" onClick={() => setShowPwd(s => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            {pwdErrors.password && <p className="text-xs text-red-500 mt-0.5">{pwdErrors.password}</p>}
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Confirmer le mot de passe</label>
            <input
              type={showPwd ? 'text' : 'password'}
              value={pwd.password_confirmation}
              onChange={e => setPwd(p => ({ ...p, password_confirmation: e.target.value }))}
              placeholder="Répétez le mot de passe"
              className={`input ${pwdErrors.password_confirmation ? 'border-red-400' : ''}`}
            />
            {pwdErrors.password_confirmation && <p className="text-xs text-red-500 mt-0.5">{pwdErrors.password_confirmation}</p>}
          </div>
          <button
            onClick={() => pwdMut.mutate(pwd)}
            disabled={pwdMut.isPending || !pwd.password || pwd.password !== pwd.password_confirmation}
            className="btn-primary flex items-center gap-2 disabled:opacity-50"
          >
            <Check size={15} />
            {pwdMut.isPending ? 'Modification...' : 'Changer le mot de passe'}
          </button>
        </div>
      </SectionCard>

      {/* PIN */}
      <SectionCard icon={<Hash size={16} className="text-amber-500" />} title="PIN caisse">
        <p className="text-sm text-gray-500">
          Le PIN à 4 chiffres permet une connexion rapide au POS sans saisir votre mot de passe.
        </p>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Nouveau PIN</label>
            <input
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="• • • •"
              className={`input text-center text-xl tracking-[0.5em] font-mono w-40 ${pinError ? 'border-red-400' : ''}`}
            />
            {pinError && <p className="text-xs text-red-500 mt-0.5">{pinError}</p>}
          </div>
          <button
            onClick={() => pinMut.mutate()}
            disabled={pinMut.isPending || pin.length !== 4}
            className="btn-primary flex items-center gap-2 disabled:opacity-50"
          >
            <Check size={15} />
            {pinMut.isPending ? 'Enregistrement...' : 'Mettre à jour le PIN'}
          </button>
        </div>
      </SectionCard>

      {/* Permissions */}
      <SectionCard icon={<Shield size={16} className="text-purple-600" />} title="Mes permissions">
        {isSuperAdmin ? (
          <div className="flex items-center gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-xl">
            <Shield size={16} className="text-yellow-600" />
            <p className="text-sm text-yellow-700 font-medium">Super Administrateur — toutes les permissions</p>
          </div>
        ) : permissions.length === 0 ? (
          <p className="text-sm text-gray-400">Aucune permission accordée</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {permissions.map(perm => (
              <div key={perm} className="flex items-center gap-1.5 text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-2 border">
                <Check size={11} className="text-green-500 flex-shrink-0" />
                {ALL_PERMISSIONS[perm] ?? perm}
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  )
}
