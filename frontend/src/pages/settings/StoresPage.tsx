import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../lib/api'
import { formatCurrency } from '../../lib/format'
import toast from 'react-hot-toast'
import {
  Store, Plus, X, Check, Edit2, Phone, Mail, MapPin,
  Users, ShoppingBag, Wallet, ToggleLeft, ToggleRight,
  Building2, AlertCircle, Upload, Camera, MessageCircle,
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

type BusinessType = 'grande_surface' | 'restaurant' | 'depot' | 'mixte'

const BUSINESS_TYPES: { value: BusinessType; label: string; desc: string; color: string }[] = [
  { value: 'grande_surface', label: 'Grande Surface',        desc: 'Supermarché, épicerie, boutique',        color: 'bg-blue-100 text-blue-700' },
  { value: 'restaurant',     label: 'Restaurant',            desc: 'Tables, cuisine, réservations',          color: 'bg-orange-100 text-orange-700' },
  { value: 'depot',          label: 'Dépôt / Entrepôt',     desc: 'Stockage et approvisionnement',          color: 'bg-gray-100 text-gray-700' },
  { value: 'mixte',          label: 'Mixte',                 desc: 'Grande surface + Restaurant',            color: 'bg-purple-100 text-purple-700' },
]

interface StoreData {
  id: number
  organization_id?: number | null
  organization?: { id: number; name: string; code: string } | null
  logo?: string | null
  name: string
  code: string
  business_type: BusinessType
  address?: string
  phone?: string
  email?: string
  ninea?: string
  rc?: string
  currency: string
  timezone: string
  license_grande_surface: boolean
  license_restaurant: boolean
  is_central: boolean
  is_active: boolean
  receipt_footer?: string
  whatsapp_number?: string
  users_count?: number
  clients_count?: number
  stock_value?: number
}

interface OrgOption { id: number; name: string; code: string }

// ─── Logo Upload ──────────────────────────────────────────────────────────────

function LogoUpload({
  currentLogo, preview, onFileChange,
}: {
  currentLogo?: string | null
  preview: string | null
  onFileChange: (file: File) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const displayed = preview ?? currentLogo

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">Logo du magasin</label>
      <div className="flex items-center gap-4">
        <div
          onClick={() => inputRef.current?.click()}
          className="w-20 h-20 rounded-2xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all overflow-hidden flex-shrink-0 relative group"
        >
          {displayed ? (
            <>
              <img src={displayed} alt="Logo" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <Camera size={16} className="text-white" />
              </div>
            </>
          ) : (
            <>
              <Upload size={18} className="text-gray-300 mb-1" />
              <span className="text-[10px] text-gray-400 text-center">Cliquer<br />pour choisir</span>
            </>
          )}
        </div>
        <div className="text-xs text-gray-500 space-y-1">
          <p>Format : PNG, JPG ou SVG</p>
          <p>Taille max : 2 Mo</p>
          <button type="button" onClick={() => inputRef.current?.click()}
            className="flex items-center gap-1.5 text-primary hover:underline font-medium text-xs">
            <Upload size={12} /> {displayed ? 'Changer le logo' : 'Choisir un fichier'}
          </button>
        </div>
      </div>
      <input ref={inputRef} type="file" accept="image/*" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) onFileChange(f) }} />
    </div>
  )
}

// ─── Store Form Modal ─────────────────────────────────────────────────────────

function StoreFormModal({ store, onClose }: { store?: StoreData; onClose: () => void }) {
  const qc = useQueryClient()
  const isEdit = !!store

  const { data: orgs = [] } = useQuery<OrgOption[]>({
    queryKey: ['organizations'],
    queryFn: () => api.get('/organizations').then(r => r.data),
  })

  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)

  const handleLogoChange = (file: File) => {
    setLogoFile(file)
    setLogoPreview(URL.createObjectURL(file))
  }

  const [form, setForm] = useState({
    organization_id: store?.organization_id ?? ('' as number | ''),
    name:             store?.name ?? '',
    code:             store?.code ?? '',
    business_type:    (store?.business_type ?? 'grande_surface') as BusinessType,
    address:          store?.address ?? '',
    phone:            store?.phone ?? '',
    whatsapp_number:  store?.whatsapp_number ?? '',
    email:            store?.email ?? '',
    ninea:            store?.ninea ?? '',
    rc:               store?.rc ?? '',
    currency:         store?.currency ?? 'XOF',
    timezone:         store?.timezone ?? 'Africa/Dakar',
    is_central:       store?.is_central ?? false,
    receipt_footer:   store?.receipt_footer ?? '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  const mutation = useMutation({
    mutationFn: async (payload: object) => {
      const res = isEdit
        ? await api.put(`/stores/${store!.id}`, payload)
        : await api.post('/stores', payload)
      if (logoFile) {
        const fd = new FormData()
        fd.append('logo', logoFile)
        await api.post(`/stores/${res.data.id}/logo`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      }
      return res
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stores'] })
      qc.invalidateQueries({ queryKey: ['stores-list'] })
      toast.success(isEdit ? 'Magasin mis à jour' : 'Magasin créé')
      onClose()
    },
    onError: (err: { response?: { data?: { errors?: Record<string, string[]>; message?: string } } }) => {
      if (err.response?.data?.errors) {
        const e: Record<string, string> = {}
        Object.entries(err.response.data.errors).forEach(([k, v]) => { e[k] = v[0] })
        setErrors(e)
      } else {
        toast.error(err.response?.data?.message ?? 'Erreur')
      }
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const errs: Record<string, string> = {}
    if (!form.name.trim()) errs.name = 'Nom requis'
    if (!isEdit && !form.code.trim()) errs.code = 'Code requis'
    if (Object.keys(errs).length) { setErrors(errs); return }
    mutation.mutate(form)
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const toggle = (k: 'is_central') =>
    setForm(f => ({ ...f, [k]: !f[k] }))

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl max-h-[92vh] flex flex-col">
        <div className="p-6 border-b flex items-center justify-between flex-shrink-0">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Store size={20} className="text-primary" />
            {isEdit ? 'Modifier le magasin' : 'Nouveau magasin'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Logo */}
          <LogoUpload
            currentLogo={store?.logo}
            preview={logoPreview}
            onFileChange={handleLogoChange}
          />

          {/* Name + Code */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nom du magasin *</label>
              <input value={form.name} onChange={set('name')} className="input" placeholder="Magasin Dakar Centre" />
              {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Code *</label>
              <input
                value={form.code}
                onChange={set('code')}
                className={`input font-mono uppercase ${isEdit ? 'bg-gray-50 text-gray-400' : ''}`}
                placeholder="DKR01"
                disabled={isEdit}
                maxLength={20}
              />
              {errors.code && <p className="text-red-500 text-xs mt-1">{errors.code}</p>}
              {!isEdit && <p className="text-xs text-gray-400 mt-1">Code unique, en majuscules, non modifiable</p>}
            </div>
          </div>

          {/* Organisation */}
          {orgs.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Organisation</label>
              <select
                value={form.organization_id}
                onChange={e => setForm(f => ({ ...f, organization_id: e.target.value ? Number(e.target.value) : '' }))}
                className="input"
              >
                <option value="">— Aucune organisation —</option>
                {orgs.map(o => (
                  <option key={o.id} value={o.id}>{o.name} ({o.code})</option>
                ))}
              </select>
            </div>
          )}

          {/* Contact */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Téléphone</label>
              <div className="relative">
                <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input value={form.phone} onChange={set('phone')} className="input pl-8" placeholder="+221 33 000 00 00" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <div className="relative">
                <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input value={form.email} onChange={set('email')} type="email" className="input pl-8" placeholder="magasin@entreprise.sn" />
              </div>
            </div>
          </div>

          {/* WhatsApp */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              WhatsApp <span className="text-red-500">*</span>
              <span className="ml-1.5 text-xs text-gray-400 font-normal">Requis pour les relances automatiques</span>
            </label>
            <div className="relative">
              <MessageCircle size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-green-500" />
              <input value={form.whatsapp_number} onChange={set('whatsapp_number')} className="input pl-8" placeholder="+221 77 000 00 00" />
            </div>
          </div>

          {/* Address */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Adresse</label>
            <div className="relative">
              <MapPin size={14} className="absolute left-3 top-3 text-gray-400" />
              <textarea value={form.address} onChange={set('address')} className="input pl-8 resize-none" rows={2} placeholder="Adresse complète" />
            </div>
          </div>

          {/* NINEA + RC */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">NINEA</label>
              <input value={form.ninea} onChange={set('ninea')} className="input font-mono" placeholder="007123456" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">RCCM</label>
              <input value={form.rc} onChange={set('rc')} className="input font-mono" placeholder="SN-DKR-2024-B-00001" />
            </div>
          </div>

          {/* Receipt footer */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Pied de ticket</label>
            <textarea value={form.receipt_footer} onChange={set('receipt_footer')} className="input resize-none" rows={2} placeholder="Message affiché sur les tickets..." />
          </div>

          {/* Type de magasin */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Type de magasin *</label>
            <div className="grid grid-cols-2 gap-2">
              {BUSINESS_TYPES.map(bt => (
                <button
                  key={bt.value}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, business_type: bt.value }))}
                  className={`flex flex-col items-start p-3 rounded-xl border-2 text-left transition-all ${
                    form.business_type === bt.value
                      ? 'border-primary bg-primary/5'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-md mb-1 ${bt.color}`}>{bt.label}</span>
                  <span className="text-xs text-gray-500">{bt.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Dépôt central */}
          <div className="space-y-3 pt-1">
            <label className="flex items-center gap-3 cursor-pointer bg-gray-50 rounded-xl p-3 hover:bg-gray-100 transition-colors">
              <button type="button" onClick={() => toggle('is_central')} className="flex-shrink-0">
                {form.is_central
                  ? <ToggleRight className="text-primary" size={26} />
                  : <ToggleLeft className="text-gray-300" size={26} />}
              </button>
              <div>
                <p className="text-sm font-medium text-gray-800">Dépôt central</p>
                <p className="text-xs text-gray-500">Magasin principal pouvant approvisionner les autres</p>
              </div>
            </label>
          </div>
        </form>

        <div className="p-6 border-t flex gap-3 flex-shrink-0">
          <button type="button" onClick={onClose} className="btn-secondary flex-1">Annuler</button>
          <button onClick={handleSubmit} disabled={mutation.isPending}
            className="btn-primary flex-1 flex items-center justify-center gap-2">
            <Check size={16} />
            {mutation.isPending ? 'Enregistrement...' : (isEdit ? 'Mettre à jour' : 'Créer le magasin')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Store Card ───────────────────────────────────────────────────────────────

function StoreCard({ store, onEdit, onToggle }: {
  store: StoreData
  onEdit: () => void
  onToggle: () => void
}) {
  return (
    <div className={`card p-5 flex flex-col gap-4 transition-all ${!store.is_active ? 'opacity-60' : ''}`}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-12 h-12 rounded-2xl overflow-hidden flex-shrink-0 ${
            store.logo ? '' : (store.is_central ? 'bg-gradient-to-br from-primary to-orange-600' : 'bg-gradient-to-br from-indigo-500 to-blue-600')
          } flex items-center justify-center text-white font-bold text-lg`}>
            {store.logo
              ? <img src={store.logo} alt={store.name} className="w-full h-full object-cover" />
              : store.name.charAt(0).toUpperCase()
            }
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-bold text-gray-900">{store.name}</h3>
              {store.is_central && (
                <span className="px-2 py-0.5 bg-primary/10 text-primary text-[10px] font-bold rounded-full uppercase tracking-wide">
                  Central
                </span>
              )}
              {(() => {
                const bt = BUSINESS_TYPES.find(b => b.value === store.business_type)
                return bt ? (
                  <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-full ${bt.color}`}>
                    {bt.label}
                  </span>
                ) : null
              })()}
            </div>
            <p className="text-xs font-mono text-gray-500">{store.code}</p>
            {store.organization && (
              <p className="text-[10px] text-indigo-500 flex items-center gap-1 mt-0.5">
                <Building2 size={9} /> {store.organization.name}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onEdit} className="p-1.5 text-gray-400 hover:text-primary hover:bg-gray-100 rounded-lg transition-colors">
            <Edit2 size={15} />
          </button>
          <button onClick={onToggle} className="transition-colors">
            {store.is_active
              ? <ToggleRight className="text-green-500" size={22} />
              : <ToggleLeft className="text-gray-300" size={22} />}
          </button>
        </div>
      </div>

      {/* Contact */}
      {(store.phone || store.address) && (
        <div className="space-y-1 text-xs text-gray-500">
          {store.phone && (
            <div className="flex items-center gap-1.5">
              <Phone size={11} className="text-gray-400" />{store.phone}
            </div>
          )}
          {store.address && (
            <div className="flex items-center gap-1.5">
              <MapPin size={11} className="text-gray-400" />{store.address}
            </div>
          )}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 pt-1 border-t border-gray-50">
        <div className="text-center">
          <p className="text-base font-bold text-gray-800">{store.users_count ?? 0}</p>
          <p className="text-[10px] text-gray-400 flex items-center justify-center gap-0.5">
            <Users size={9} /> Utilisateurs
          </p>
        </div>
        <div className="text-center">
          <p className="text-base font-bold text-gray-800">{store.clients_count ?? 0}</p>
          <p className="text-[10px] text-gray-400 flex items-center justify-center gap-0.5">
            <ShoppingBag size={9} /> Clients
          </p>
        </div>
        <div className="text-center">
          <p className="text-base font-bold text-gray-800 truncate">{formatCurrency(store.stock_value ?? 0)}</p>
          <p className="text-[10px] text-gray-400 flex items-center justify-center gap-0.5">
            <Wallet size={9} /> Stock
          </p>
        </div>
      </div>

      {/* Licenses */}
      {(store.license_grande_surface || store.license_restaurant) && (
        <div className="flex gap-1.5 flex-wrap">
          {store.license_grande_surface && (
            <span className="px-2 py-0.5 bg-blue-50 text-blue-600 text-[10px] font-medium rounded-full">
              Grande Surface
            </span>
          )}
          {store.license_restaurant && (
            <span className="px-2 py-0.5 bg-orange-50 text-orange-600 text-[10px] font-medium rounded-full">
              Restaurant
            </span>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function StoresPage() {
  const [showForm, setShowForm] = useState(false)
  const [editStore, setEditStore] = useState<StoreData | undefined>()
  const qc = useQueryClient()

  const { data: stores = [], isLoading } = useQuery<StoreData[]>({
    queryKey: ['stores'],
    queryFn: () => api.get('/stores').then(r => r.data),
  })

  const toggleActive = useMutation({
    mutationFn: (s: StoreData) => api.put(`/stores/${s.id}`, { is_active: !s.is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['stores'] }),
    onError: (err: { response?: { data?: { message?: string } } }) =>
      toast.error(err.response?.data?.message ?? 'Erreur'),
  })

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Store size={24} className="text-primary" /> Magasins
          </h1>
          <p className="text-gray-500 text-sm">{stores.length} magasin{stores.length > 1 ? 's' : ''} configuré{stores.length > 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => { setEditStore(undefined); setShowForm(true) }}
          className="btn-primary flex items-center gap-2">
          <Plus size={18} /> Nouveau magasin
        </button>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 p-4 bg-indigo-50 border border-indigo-100 rounded-2xl text-sm text-indigo-700">
        <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
        <div>
          <p className="font-semibold">Isolation des données par magasin</p>
          <p className="text-xs text-indigo-600 mt-0.5">
            Chaque utilisateur est rattaché à un magasin et ne voit que ses données (stock, clients, ventes).
            Le Super Admin peut voir et gérer tous les magasins via le sélecteur dans la barre latérale.
          </p>
        </div>
      </div>

      {/* Store cards grid */}
      {isLoading ? (
        <div className="text-center py-12 text-gray-400">Chargement...</div>
      ) : stores.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Store size={40} className="mx-auto mb-3 opacity-30" />
          <p>Aucun magasin configuré</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {stores
            .sort((a, b) => (b.is_central ? 1 : 0) - (a.is_central ? 1 : 0))
            .map(store => (
              <StoreCard
                key={store.id}
                store={store}
                onEdit={() => { setEditStore(store); setShowForm(true) }}
                onToggle={() => toggleActive.mutate(store)}
              />
            ))}
        </div>
      )}

      {/* Modal */}
      {showForm && (
        <StoreFormModal
          store={editStore}
          onClose={() => { setShowForm(false); setEditStore(undefined) }}
        />
      )}
    </div>
  )
}
