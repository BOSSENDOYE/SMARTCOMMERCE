import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../lib/api'
import toast from 'react-hot-toast'
import {
  Building2, Plus, Pencil, Trash2, X, Store,
  Users, Phone, Mail, MapPin, FileText, CheckCircle, XCircle,
  Upload, Camera,
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

interface OrgForm {
  name: string
  code: string
  ninea: string
  rc: string
  address: string
  phone: string
  email: string
  description: string
}

const emptyForm: OrgForm = {
  name: '', code: '', ninea: '', rc: '',
  address: '', phone: '', email: '', description: '',
}

// ── Logo Upload Zone ──────────────────────────────────────────────────────────

function LogoUpload({
  currentLogo,
  preview,
  onFileChange,
}: {
  currentLogo?: string | null
  preview: string | null
  onFileChange: (file: File) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const displayed = preview ?? currentLogo

  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">Logo</label>
      <div className="flex items-center gap-4">
        {/* Preview */}
        <div
          onClick={() => inputRef.current?.click()}
          className="w-20 h-20 rounded-2xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all overflow-hidden flex-shrink-0 relative group"
        >
          {displayed ? (
            <>
              <img
                src={displayed}
                alt="Logo"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <Camera size={16} className="text-white" />
              </div>
            </>
          ) : (
            <>
              <Upload size={18} className="text-gray-300 mb-1" />
              <span className="text-[10px] text-gray-400 text-center">Cliquer pour<br />choisir</span>
            </>
          )}
        </div>

        <div className="text-xs text-gray-500 space-y-1">
          <p>Format recommandé : PNG ou SVG carré</p>
          <p>Taille max : 2 Mo</p>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex items-center gap-1.5 text-primary hover:underline font-medium"
          >
            <Upload size={12} /> {displayed ? 'Changer le logo' : 'Choisir un fichier'}
          </button>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0]
          if (file) onFileChange(file)
        }}
      />
    </div>
  )
}

// ── Field (outside modal to avoid remount on every keystroke) ─────────────────

function OrgField({
  label, k, placeholder, type = 'text', form, errors, onChange,
}: {
  label: string
  k: keyof OrgForm
  placeholder?: string
  type?: string
  form: OrgForm
  errors: Record<string, string[]>
  onChange: (k: keyof OrgForm, v: string) => void
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
      <input
        type={type}
        value={form[k]}
        onChange={e => onChange(k, e.target.value)}
        placeholder={placeholder}
        className={`w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none ${
          errors[k]?.length ? 'border-red-400' : 'border-gray-200'
        }`}
      />
      {errors[k]?.map(err => (
        <p key={err} className="text-xs text-red-500 mt-0.5">{err}</p>
      ))}
    </div>
  )
}

// ── Form Modal ────────────────────────────────────────────────────────────────

function OrgFormModal({
  org,
  onClose,
}: {
  org: Org | null
  onClose: () => void
}) {
  const [form, setForm] = useState<OrgForm>(
    org
      ? {
          name: org.name, code: org.code,
          ninea: org.ninea ?? '', rc: org.rc ?? '',
          address: org.address ?? '', phone: org.phone ?? '',
          email: org.email ?? '', description: org.description ?? '',
        }
      : emptyForm
  )
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string[]>>({})
  const qc = useQueryClient()

  const handleLogoChange = (file: File) => {
    setLogoFile(file)
    setLogoPreview(URL.createObjectURL(file))
  }

  const uploadLogo = async (orgId: number) => {
    if (!logoFile) return
    const fd = new FormData()
    fd.append('logo', logoFile)
    await api.post(`/organizations/${orgId}/logo`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  }

  const save = useMutation({
    mutationFn: async (data: OrgForm) => {
      let saved: Org
      if (org) {
        saved = await api.put(`/organizations/${org.id}`, data).then(r => r.data)
      } else {
        saved = await api.post('/organizations', data).then(r => r.data)
      }
      await uploadLogo(saved.id)
      return saved
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['organizations'] })
      toast.success(org ? 'Organisation mise à jour' : 'Organisation créée')
      onClose()
    },
    onError: (e: any) => {
      if (e.response?.data?.errors) setErrors(e.response.data.errors)
      else toast.error(e.response?.data?.message ?? 'Erreur')
    },
  })

  const set = (k: keyof OrgForm, v: string) => {
    setForm(f => ({ ...f, [k]: v }))
    if (errors[k]) setErrors(e => ({ ...e, [k]: [] }))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b">
          <div className="flex items-center gap-2">
            <Building2 size={20} className="text-primary" />
            <h2 className="font-semibold text-gray-800">
              {org ? 'Modifier l\'organisation' : 'Nouvelle organisation'}
            </h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Logo */}
          <LogoUpload
            currentLogo={org?.logo}
            preview={logoPreview}
            onFileChange={handleLogoChange}
          />

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <OrgField label="Nom de l'organisation *" k="name" placeholder="ex: Groupe BAMBA" form={form} errors={errors} onChange={set} />
            </div>
            <OrgField label="Code *" k="code" placeholder="ex: BAMBA (MAJUSCULES)" form={form} errors={errors} onChange={set} />
            <OrgField label="NINEA" k="ninea" placeholder="Numéro fiscal" form={form} errors={errors} onChange={set} />
            <OrgField label="RC" k="rc" placeholder="Registre de commerce" form={form} errors={errors} onChange={set} />
            <OrgField label="Téléphone" k="phone" type="tel" placeholder="+221 77 000 00 00" form={form} errors={errors} onChange={set} />
            <div className="col-span-2">
              <OrgField label="Email" k="email" type="email" placeholder="contact@bamba.sn" form={form} errors={errors} onChange={set} />
            </div>
            <div className="col-span-2">
              <OrgField label="Adresse" k="address" placeholder="Adresse du siège" form={form} errors={errors} onChange={set} />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
              <textarea
                rows={3}
                value={form.description}
                onChange={e => set('description', e.target.value)}
                placeholder="Description optionnelle..."
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none resize-none"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-5 border-t">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            Annuler
          </button>
          <button
            onClick={() => save.mutate(form)}
            disabled={save.isPending}
            className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50"
          >
            {save.isPending ? 'Enregistrement…' : org ? 'Mettre à jour' : 'Créer'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Org Card ──────────────────────────────────────────────────────────────────

function OrgCard({
  org,
  onEdit,
  onDelete,
  onToggle,
}: {
  org: Org
  onEdit: () => void
  onDelete: () => void
  onToggle: () => void
}) {
  return (
    <div className={`bg-white rounded-2xl border shadow-sm p-5 flex flex-col gap-4 ${
      !org.is_active ? 'opacity-60' : ''
    }`}>
      {/* Top row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          {/* Logo or placeholder */}
          <div className="w-11 h-11 rounded-xl overflow-hidden flex-shrink-0 bg-primary/10 flex items-center justify-center">
            {org.logo ? (
              <img src={org.logo} alt={org.name} className="w-full h-full object-cover" />
            ) : (
              <Building2 size={22} className="text-primary" />
            )}
          </div>
          <div>
            <p className="font-semibold text-gray-900">{org.name}</p>
            <span className="text-xs font-mono bg-gray-100 px-2 py-0.5 rounded text-gray-500">
              {org.code}
            </span>
          </div>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
          org.is_active
            ? 'bg-green-100 text-green-700'
            : 'bg-gray-100 text-gray-500'
        }`}>
          {org.is_active ? 'Active' : 'Inactive'}
        </span>
      </div>

      {/* Stats */}
      <div className="flex gap-4 text-sm text-gray-600">
        <span className="flex items-center gap-1">
          <Store size={14} className="text-gray-400" />
          {org.stores_count} magasin{org.stores_count !== 1 ? 's' : ''}
        </span>
        <span className="flex items-center gap-1">
          <Users size={14} className="text-gray-400" />
          {org.users_count} utilisateur{org.users_count !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Contact */}
      {(org.phone || org.email || org.address) && (
        <div className="text-xs text-gray-500 space-y-1">
          {org.phone && (
            <p className="flex items-center gap-1.5">
              <Phone size={12} /> {org.phone}
            </p>
          )}
          {org.email && (
            <p className="flex items-center gap-1.5">
              <Mail size={12} /> {org.email}
            </p>
          )}
          {org.address && (
            <p className="flex items-center gap-1.5">
              <MapPin size={12} /> {org.address}
            </p>
          )}
        </div>
      )}

      {org.ninea && (
        <p className="text-xs text-gray-400 flex items-center gap-1.5">
          <FileText size={12} /> NINEA : {org.ninea}
          {org.rc && <> &nbsp;·&nbsp; RC : {org.rc}</>}
        </p>
      )}

      {org.description && (
        <p className="text-xs text-gray-500 italic line-clamp-2">{org.description}</p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-2 border-t">
        <button
          onClick={onEdit}
          className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-primary px-2 py-1.5 rounded-lg hover:bg-primary/5 transition-colors"
        >
          <Pencil size={13} /> Modifier
        </button>
        <button
          onClick={onToggle}
          className={`flex items-center gap-1.5 text-xs px-2 py-1.5 rounded-lg transition-colors ${
            org.is_active
              ? 'text-orange-600 hover:bg-orange-50'
              : 'text-green-600 hover:bg-green-50'
          }`}
        >
          {org.is_active
            ? <><XCircle size={13} /> Désactiver</>
            : <><CheckCircle size={13} /> Activer</>}
        </button>
        {org.stores_count === 0 && (
          <button
            onClick={onDelete}
            className="flex items-center gap-1.5 text-xs text-red-600 hover:bg-red-50 px-2 py-1.5 rounded-lg transition-colors ml-auto"
          >
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
  const qc = useQueryClient()
  const confirm = useConfirm()

  const { data: orgs = [], isLoading } = useQuery<Org[]>({
    queryKey: ['organizations'],
    queryFn: () => api.get('/organizations').then(r => r.data),
  })

  const toggle = useMutation({
    mutationFn: (org: Org) =>
      api.put(`/organizations/${org.id}`, { is_active: !org.is_active }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['organizations'] })
      toast.success('Statut mis à jour')
    },
  })

  const remove = useMutation({
    mutationFn: (org: Org) => api.delete(`/organizations/${org.id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['organizations'] })
      toast.success('Organisation supprimée')
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Erreur'),
  })

  const handleDelete = async (org: Org) => {
    if (await confirm(`Supprimer l'organisation "${org.name}" ?`, { danger: true })) {
      remove.mutate(org)
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Building2 size={22} className="text-primary" />
            Organisations
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Gérez vos organisations mères qui regroupent vos magasins
          </p>
        </div>
        <button
          onClick={() => setModalOrg('new')}
          className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus size={16} />
          Nouvelle organisation
        </button>
      </div>

      {/* Info banner */}
      <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-700">
        <p className="font-medium mb-1">Comment ça fonctionne ?</p>
        <ul className="list-disc list-inside space-y-0.5 text-xs text-blue-600">
          <li>Une <strong>organisation</strong> regroupe plusieurs magasins (ex: Groupe BAMBA avec 5 points de vente)</li>
          <li>Chaque magasin appartient à une organisation et possède son propre stock, ses clients, ses ventes</li>
          <li>Le <strong>super-admin</strong> de l'organisation peut voir et switcher entre tous ses magasins</li>
          <li>Les transferts inter-magasins se font entre magasins de la même organisation</li>
        </ul>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : orgs.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Building2 size={48} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">Aucune organisation</p>
          <p className="text-sm mt-1">Créez votre première organisation pour commencer</p>
          <button
            onClick={() => setModalOrg('new')}
            className="mt-4 bg-primary text-white px-4 py-2 rounded-xl text-sm hover:bg-primary/90"
          >
            <Plus size={14} className="inline mr-1" />
            Créer une organisation
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {orgs.map(org => (
            <OrgCard
              key={org.id}
              org={org}
              onEdit={() => setModalOrg(org)}
              onDelete={() => handleDelete(org)}
              onToggle={() => toggle.mutate(org)}
            />
          ))}
        </div>
      )}

      {/* Modal */}
      {modalOrg !== undefined && (
        <OrgFormModal
          org={modalOrg === 'new' ? null : modalOrg}
          onClose={() => setModalOrg(undefined)}
        />
      )}
    </div>
  )
}
