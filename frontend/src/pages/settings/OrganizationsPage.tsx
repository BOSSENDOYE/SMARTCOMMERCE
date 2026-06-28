import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api, { storageUrl } from '../../lib/api'
import toast from 'react-hot-toast'
import {
  Building2, Plus, Pencil, Trash2, X, Store,
  Users, Phone, Mail, MapPin, FileText, CheckCircle, XCircle,
  Upload, Camera, Search, ChevronRight, Package, ShoppingCart,
  ExternalLink, Loader2, User, Shield,
} from 'lucide-react'
import { useConfirm } from '../../hooks/useConfirm'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Org {
  id: number
  name: string
  code: string
  ninea: string | null
  rc: string | null
  address: string | null
  phone: string | null
  email: string | null
  logo: string | null
  description: string | null
  is_active: boolean
  stores_count: number
  users_count: number
  created_at: string
}

interface StoreDetail {
  id: number
  name: string
  code: string
  business_type: string
  address: string | null
  phone: string | null
  is_active: boolean
  is_central: boolean
  users_count: number
  clients_count: number
  sales_count: number
}

interface UserDetail {
  id: number
  name: string
  email: string
  role: string | null
  is_active: boolean
  last_login_at: string | null
  store_id: number | null
}

interface OrgDetail extends Org {
  stock_value: number
  stores: StoreDetail[]
  users: UserDetail[]
}

interface OrgForm {
  name: string; code: string; ninea: string; rc: string
  address: string; phone: string; email: string; description: string
}

const emptyForm: OrgForm = { name: '', code: '', ninea: '', rc: '', address: '', phone: '', email: '', description: '' }

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin', gerant: 'Gérant', caissier: 'Caissier',
  serveur: 'Serveur', cuisinier: 'Cuisinier', magasinier: 'Magasinier',
  comptable: 'Comptable', proprietaire: 'Propriétaire',
}

const BT_LABELS: Record<string, string> = {
  grande_surface: 'Grande Surface', restaurant: 'Restaurant',
  depot: 'Dépôt', mixte: 'Mixte',
}

// ── Logo Upload ───────────────────────────────────────────────────────────────

function LogoUpload({ currentLogo, preview, onFileChange }: {
  currentLogo?: string | null; preview: string | null; onFileChange: (f: File) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const displayed = preview ?? currentLogo
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">Logo</label>
      <div className="flex items-center gap-4">
        <div onClick={() => inputRef.current?.click()}
          className="w-20 h-20 rounded-2xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all overflow-hidden flex-shrink-0 relative group">
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
              <span className="text-[10px] text-gray-400 text-center">Cliquer</span>
            </>
          )}
        </div>
        <div className="text-xs text-gray-500 space-y-1">
          <p>PNG ou SVG carré — max 2 Mo</p>
          <button type="button" onClick={() => inputRef.current?.click()}
            className="flex items-center gap-1.5 text-primary hover:underline font-medium">
            <Upload size={12} /> {displayed ? 'Changer' : 'Choisir'}
          </button>
        </div>
      </div>
      <input ref={inputRef} type="file" accept="image/*" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) onFileChange(f) }} />
    </div>
  )
}

// ── Form Modal ────────────────────────────────────────────────────────────────

function OrgFormModal({ org, onClose }: { org: Org | null; onClose: () => void }) {
  const [form, setForm] = useState<OrgForm>(org ? {
    name: org.name, code: org.code, ninea: org.ninea ?? '', rc: org.rc ?? '',
    address: org.address ?? '', phone: org.phone ?? '',
    email: org.email ?? '', description: org.description ?? '',
  } : emptyForm)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string[]>>({})
  const qc = useQueryClient()

  const uploadLogo = async (orgId: number) => {
    if (!logoFile) return
    const fd = new FormData(); fd.append('logo', logoFile)
    await api.post(`/organizations/${orgId}/logo`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
  }

  const save = useMutation({
    mutationFn: async (data: OrgForm) => {
      const saved: Org = org
        ? await api.put(`/organizations/${org.id}`, data).then(r => r.data)
        : await api.post('/organizations', data).then(r => r.data)
      await uploadLogo(saved.id)
      return saved
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['organizations'] })
      toast.success(org ? 'Organisation mise à jour' : 'Organisation créée')
      onClose()
    },
    onError: (e: { response?: { data?: { errors?: Record<string, string[]>; message?: string } } }) => {
      if (e.response?.data?.errors) setErrors(e.response.data.errors)
      else toast.error(e.response?.data?.message ?? 'Erreur')
    },
  })

  const set = (k: keyof OrgForm, v: string) => {
    setForm(f => ({ ...f, [k]: v }))
    if (errors[k]) setErrors(e => ({ ...e, [k]: [] }))
  }

  const Field = ({ label, k, placeholder, type = 'text', col2 = false }: {
    label: string; k: keyof OrgForm; placeholder?: string; type?: string; col2?: boolean
  }) => (
    <div className={col2 ? 'col-span-2' : ''}>
      <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
      <input type={type} value={form[k]} onChange={e => set(k, e.target.value)} placeholder={placeholder}
        className={`w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none ${errors[k]?.length ? 'border-red-400' : 'border-gray-200'}`} />
      {errors[k]?.map(err => <p key={err} className="text-xs text-red-500 mt-0.5">{err}</p>)}
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b">
          <div className="flex items-center gap-2">
            <Building2 size={20} className="text-primary" />
            <h2 className="font-semibold text-gray-800">{org ? 'Modifier' : 'Nouvelle organisation'}</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <LogoUpload currentLogo={org?.logo} preview={logoPreview}
            onFileChange={f => { setLogoFile(f); setLogoPreview(URL.createObjectURL(f)) }} />
          <div className="grid grid-cols-2 gap-4">
            <Field label="Nom *" k="name" placeholder="ex: Groupe BAMBA" col2 />
            <Field label="Code *" k="code" placeholder="ex: BAMBA" />
            <Field label="NINEA" k="ninea" placeholder="Numéro fiscal" />
            <Field label="RC" k="rc" placeholder="Registre de commerce" />
            <Field label="Téléphone" k="phone" type="tel" placeholder="+221 77 000 00 00" />
            <Field label="Email" k="email" type="email" placeholder="contact@bamba.sn" col2 />
            <Field label="Adresse" k="address" placeholder="Adresse du siège" col2 />
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
              <textarea rows={3} value={form.description} onChange={e => set('description', e.target.value)}
                placeholder="Description optionnelle…"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none resize-none" />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-3 p-5 border-t">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Annuler</button>
          <button onClick={() => save.mutate(form)} disabled={save.isPending}
            className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50">
            {save.isPending ? 'Enregistrement…' : org ? 'Mettre à jour' : 'Créer'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Detail Drawer ─────────────────────────────────────────────────────────────

function OrgDetailDrawer({ org, onClose, onEdit }: { org: Org; onClose: () => void; onEdit: () => void }) {
  const { data, isLoading } = useQuery<OrgDetail>({
    queryKey: ['org-detail', org.id],
    queryFn: () => api.get(`/organizations/${org.id}`).then(r => r.data),
  })

  const mapsUrl = org.address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(org.address)}`
    : null

  return (
    <div className="fixed inset-0 z-40 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/30" onClick={onClose} />

      {/* Panel */}
      <div className="w-full max-w-xl bg-white shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b bg-gray-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl overflow-hidden bg-primary/10 flex items-center justify-center flex-shrink-0">
              {org.logo
                ? <img src={storageUrl(org.logo)} alt={org.name} className="w-full h-full object-cover" />
                : <Building2 size={20} className="text-primary" />}
            </div>
            <div>
              <h2 className="font-bold text-gray-900">{org.name}</h2>
              <span className="text-xs font-mono bg-gray-200 px-2 py-0.5 rounded text-gray-500">{org.code}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onEdit}
              className="flex items-center gap-1.5 text-xs text-primary border border-primary/30 px-3 py-1.5 rounded-lg hover:bg-primary/5">
              <Pencil size={12} /> Modifier
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 ml-1"><X size={18} /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 size={24} className="animate-spin text-primary" />
            </div>
          ) : data ? (
            <div className="p-5 space-y-6">

              {/* KPIs */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-blue-50 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-blue-700">{data.stores_count}</p>
                  <p className="text-xs text-blue-500 mt-0.5">Magasins</p>
                </div>
                <div className="bg-purple-50 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-purple-700">{data.users_count}</p>
                  <p className="text-xs text-purple-500 mt-0.5">Utilisateurs</p>
                </div>
                <div className="bg-green-50 rounded-xl p-3 text-center">
                  <p className="text-sm font-bold text-green-700">
                    {data.stock_value.toLocaleString('fr-FR')}
                  </p>
                  <p className="text-xs text-green-500 mt-0.5">Stock (XOF)</p>
                </div>
              </div>

              {/* Coordonnées */}
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Coordonnées</h3>
                <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
                  {data.phone && <p className="flex items-center gap-2 text-gray-700"><Phone size={14} className="text-gray-400" />{data.phone}</p>}
                  {data.email && <p className="flex items-center gap-2 text-gray-700"><Mail size={14} className="text-gray-400" />{data.email}</p>}
                  {data.address && (
                    <div className="flex items-start gap-2">
                      <MapPin size={14} className="text-gray-400 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-gray-700">{data.address}</p>
                        {mapsUrl && (
                          <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1">
                            <ExternalLink size={11} /> Voir sur Google Maps
                          </a>
                        )}
                      </div>
                    </div>
                  )}
                  {data.ninea && <p className="flex items-center gap-2 text-gray-700"><FileText size={14} className="text-gray-400" />NINEA : {data.ninea}{data.rc && <> · RC : {data.rc}</>}</p>}
                  {!data.phone && !data.email && !data.address && !data.ninea && (
                    <p className="text-gray-400 text-xs">Aucune coordonnée renseignée</p>
                  )}
                </div>
              </div>

              {/* Magasins */}
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                  <Store size={13} /> Magasins ({data.stores.length})
                </h3>
                {data.stores.length === 0 ? (
                  <p className="text-sm text-gray-400 italic">Aucun magasin</p>
                ) : (
                  <div className="space-y-2">
                    {data.stores.map(s => (
                      <div key={s.id} className="bg-gray-50 rounded-xl p-4 flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm text-gray-900">{s.name}</span>
                            {s.is_central && (
                              <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-medium">Central</span>
                            )}
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${s.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'}`}>
                              {s.is_active ? 'Actif' : 'Inactif'}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5 font-mono">{s.code} · {BT_LABELS[s.business_type] ?? s.business_type}</p>
                          {s.address && <p className="text-xs text-gray-400 mt-1 flex items-center gap-1"><MapPin size={11} />{s.address}</p>}
                        </div>
                        <div className="flex flex-col items-end gap-1 text-xs text-gray-500 flex-shrink-0">
                          <span className="flex items-center gap-1"><Users size={11} />{s.users_count}</span>
                          <span className="flex items-center gap-1"><Package size={11} />{s.clients_count}</span>
                          <span className="flex items-center gap-1"><ShoppingCart size={11} />{s.sales_count}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Utilisateurs */}
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                  <Users size={13} /> Utilisateurs ({data.users.length})
                </h3>
                {data.users.length === 0 ? (
                  <p className="text-sm text-gray-400 italic">Aucun utilisateur</p>
                ) : (
                  <div className="space-y-1.5">
                    {data.users.map(u => (
                      <div key={u.id} className="flex items-center gap-3 bg-gray-50 rounded-xl p-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <User size={14} className="text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{u.name}</p>
                          <p className="text-xs text-gray-500 truncate">{u.email}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          {u.role && (
                            <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-medium flex items-center gap-0.5">
                              <Shield size={9} />{ROLE_LABELS[u.role] ?? u.role}
                            </span>
                          )}
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${u.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'}`}>
                            {u.is_active ? 'Actif' : 'Inactif'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

// ── Org Card ──────────────────────────────────────────────────────────────────

function OrgCard({ org, onEdit, onDelete, onToggle, onView }: {
  org: Org; onEdit: () => void; onDelete: () => void; onToggle: () => void; onView: () => void
}) {
  return (
    <div className={`bg-white rounded-2xl border shadow-sm p-5 flex flex-col gap-4 cursor-pointer hover:border-primary/30 hover:shadow-md transition-all ${!org.is_active ? 'opacity-60' : ''}`}
      onClick={onView}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl overflow-hidden flex-shrink-0 bg-primary/10 flex items-center justify-center">
            {org.logo
              ? <img src={storageUrl(org.logo)} alt={org.name} className="w-full h-full object-cover" />
              : <Building2 size={22} className="text-primary" />}
          </div>
          <div>
            <p className="font-semibold text-gray-900 line-clamp-1">{org.name}</p>
            <span className="text-xs font-mono bg-gray-100 px-2 py-0.5 rounded text-gray-500">{org.code}</span>
          </div>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${org.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
          {org.is_active ? 'Active' : 'Inactive'}
        </span>
      </div>

      <div className="flex gap-4 text-sm text-gray-600">
        <span className="flex items-center gap-1"><Store size={14} className="text-gray-400" />{org.stores_count} magasin{org.stores_count !== 1 ? 's' : ''}</span>
        <span className="flex items-center gap-1"><Users size={14} className="text-gray-400" />{org.users_count} utilisateur{org.users_count !== 1 ? 's' : ''}</span>
      </div>

      {(org.phone || org.email || org.address) && (
        <div className="text-xs text-gray-500 space-y-1">
          {org.phone && <p className="flex items-center gap-1.5"><Phone size={12} />{org.phone}</p>}
          {org.email && <p className="flex items-center gap-1.5 truncate"><Mail size={12} />{org.email}</p>}
          {org.address && <p className="flex items-center gap-1.5 line-clamp-1"><MapPin size={12} />{org.address}</p>}
        </div>
      )}

      <div className="flex items-center gap-2 pt-2 border-t" onClick={e => e.stopPropagation()}>
        <button onClick={onView}
          className="flex items-center gap-1 text-xs text-primary hover:bg-primary/5 px-2 py-1.5 rounded-lg transition-colors">
          <ChevronRight size={13} /> Voir détails
        </button>
        <button onClick={onEdit}
          className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-primary px-2 py-1.5 rounded-lg hover:bg-primary/5 transition-colors">
          <Pencil size={13} /> Modifier
        </button>
        <button onClick={onToggle}
          className={`flex items-center gap-1.5 text-xs px-2 py-1.5 rounded-lg transition-colors ${org.is_active ? 'text-orange-600 hover:bg-orange-50' : 'text-green-600 hover:bg-green-50'}`}>
          {org.is_active ? <><XCircle size={13} /> Désactiver</> : <><CheckCircle size={13} /> Activer</>}
        </button>
        {org.stores_count === 0 && (
          <button onClick={onDelete}
            className="flex items-center gap-1.5 text-xs text-red-600 hover:bg-red-50 px-2 py-1.5 rounded-lg transition-colors ml-auto">
            <Trash2 size={13} /> Supprimer
          </button>
        )}
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function OrganizationsPage() {
  const [modalOrg, setModalOrg] = useState<Org | null | 'new'>()
  const [detailOrg, setDetailOrg] = useState<Org | null>(null)
  const [search, setSearch] = useState('')
  const qc = useQueryClient()
  const confirm = useConfirm()

  const { data: orgs = [], isLoading } = useQuery<Org[]>({
    queryKey: ['organizations'],
    queryFn: () => api.get('/organizations').then(r => r.data),
  })

  // Filtre côté client
  const filtered = search.trim()
    ? orgs.filter(o => o.name.toLowerCase().includes(search.toLowerCase()) || o.code.toLowerCase().includes(search.toLowerCase()))
    : orgs

  const toggle = useMutation({
    mutationFn: (org: Org) => api.put(`/organizations/${org.id}`, { is_active: !org.is_active }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['organizations'] }); toast.success('Statut mis à jour') },
  })

  const remove = useMutation({
    mutationFn: (org: Org) => api.delete(`/organizations/${org.id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['organizations'] }); toast.success('Organisation supprimée') },
    onError: (e: { response?: { data?: { message?: string } } }) => toast.error(e.response?.data?.message ?? 'Erreur'),
  })

  const handleDelete = async (org: Org) => {
    if (await confirm(`Supprimer l'organisation "${org.name}" ?`, { danger: true })) remove.mutate(org)
  }

  return (
    <div className="p-3 sm:p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Building2 size={22} className="text-primary" /> Organisations
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">{orgs.length} organisation{orgs.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => setModalOrg('new')}
          className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-xl text-sm font-medium hover:opacity-90 transition-colors">
          <Plus size={16} /> Nouvelle organisation
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-5">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher par nom ou code…"
          className="w-full pl-9 pr-4 py-2.5 border rounded-xl text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            <X size={15} />
          </button>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 size={28} className="animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Building2 size={48} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">{search ? 'Aucun résultat pour « ' + search + ' »' : 'Aucune organisation'}</p>
          {!search && (
            <button onClick={() => setModalOrg('new')} className="mt-4 bg-primary text-white px-4 py-2 rounded-xl text-sm hover:opacity-90">
              <Plus size={14} className="inline mr-1" /> Créer une organisation
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(org => (
            <OrgCard key={org.id} org={org}
              onView={() => setDetailOrg(org)}
              onEdit={() => { setDetailOrg(null); setModalOrg(org) }}
              onDelete={() => handleDelete(org)}
              onToggle={() => toggle.mutate(org)}
            />
          ))}
        </div>
      )}

      {/* Form Modal */}
      {modalOrg !== undefined && (
        <OrgFormModal org={modalOrg === 'new' ? null : modalOrg} onClose={() => setModalOrg(undefined)} />
      )}

      {/* Detail Drawer */}
      {detailOrg && (
        <OrgDetailDrawer
          org={detailOrg}
          onClose={() => setDetailOrg(null)}
          onEdit={() => { setModalOrg(detailOrg); setDetailOrg(null) }}
        />
      )}
    </div>
  )
}
