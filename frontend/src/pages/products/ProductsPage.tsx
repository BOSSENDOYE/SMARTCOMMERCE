import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../lib/api'
import { formatCurrency, formatNumber } from '../../lib/format'
import toast from 'react-hot-toast'
import {
  Plus, Search, Edit2, ToggleLeft, ToggleRight, ChevronLeft, ChevronRight,
  Package, AlertTriangle, X, Check, Tag, Layers, BarChart2, TrendingUp,
  Eye, Filter, ChevronDown, Trash2, History, Barcode, FolderTree,
  ChevronRight as ChevronRightIcon, Pencil, FolderPlus, Camera, Printer,
  Box, ArrowRightLeft,
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

interface ProductStats {
  total: number
  active: number
  low_stock: number
  out_of_stock: number
}

interface Category { id: number; name: string; type?: string; parent_id?: number | null; children?: Category[] }
interface Brand { id: number; name: string }
interface Unit { id: number; name: string; abbreviation: string }

interface Container {
  id?: number
  unit_id: number
  unit?: Unit
  label?: string
  conversion_factor: number
  is_purchase_unit: boolean
  is_sale_unit: boolean
  is_stock_unit: boolean
  price_a?: number | null
  price_b?: number | null
  price_c?: number | null
  barcode?: string | null
  sort_order?: number
}

interface PriceHistoryItem {
  id: number
  old_price_ttc: number
  new_price_ttc: number
  old_purchase_price: number
  new_purchase_price: number
  created_at: string
  user?: { name: string }
}

interface Product {
  id: number
  internal_code: string
  name: string
  short_name?: string
  description?: string
  image?: string | null
  category?: { id: number; name: string }
  brand?: { id: number; name: string }
  unit?: { id: number; name: string; abbreviation: string }
  purchase_price_ht: number
  sale_price_ttc: number
  vat_rate: number
  is_active: boolean
  is_weight_based: boolean
  track_expiry: boolean
  min_stock?: number
  max_stock?: number
  stock_appro?: number
  alert_stock?: number
  containers?: Container[]
  stock_level?: { qty_on_hand: number; avg_cost: number }
  barcodes?: { barcode: string; is_primary: boolean; type: string }[]
  priceHistory?: PriceHistoryItem[]
}

interface ContainerForm {
  _key: string
  id?: number
  unit_id: string
  label: string
  conversion_factor: string
  is_purchase_unit: boolean
  is_sale_unit: boolean
  is_stock_unit: boolean
  price_a: string
  price_b: string
  price_c: string
  barcode: string
}

interface Paginated<T> { data: T[]; total: number; current_page: number; last_page: number }

type StatusFilter = 'all' | 'active' | 'inactive' | 'low_stock'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function KpiCard({ icon, label, value, color }: {
  icon: React.ReactNode; label: string; value: number | string; color: string
}) {
  return (
    <div className="card p-4 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color}`}>
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-xs text-gray-500 mt-0.5">{label}</p>
      </div>
    </div>
  )
}

function flattenCategories(cats: Category[]): Category[] {
  return cats.flatMap(c => [c, ...(c.children ? flattenCategories(c.children) : [])])
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const TYPE_LABELS: Record<string, string> = {
  common: 'Commun',
  grande_surface: 'Grande surface',
  restaurant: 'Restaurant',
}

function newContainerRow(): ContainerForm {
  return {
    _key: `${Date.now()}-${Math.random()}`,
    unit_id: '', label: '', conversion_factor: '1',
    is_purchase_unit: false, is_sale_unit: false, is_stock_unit: false,
    price_a: '', price_b: '', price_c: '', barcode: '',
  }
}

// ─── Barcode Print ────────────────────────────────────────────────────────────

function printBarcode(value: string, label: string) {
  if (!value.trim()) { toast.error('Code-barres vide'); return }
  const win = window.open('', '_blank', 'width=520,height=380')
  if (!win) { toast.error('Popup bloquée'); return }
  win.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Code-barres — ${label}</title>
  <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"></script>
  <style>
    body { font-family: sans-serif; text-align: center; padding: 30px; background: #fff; }
    p { margin: 0 0 8px; font-size: 14px; font-weight: 600; }
    svg { max-width: 360px; }
  </style>
</head>
<body>
  <p>${label}</p>
  <svg id="bc"></svg>
  <script>
    try {
      JsBarcode('#bc', '${value.replace(/'/g, "\\'")}', {
        format: 'CODE128', displayValue: true, fontSize: 14, width: 2, height: 80
      });
    } catch(e) {
      document.body.innerHTML += '<p style="color:red">Erreur: ' + e.message + '</p>';
    }
    setTimeout(function(){ window.print(); }, 600);
  </script>
</body>
</html>`)
  win.document.close()
}

function printQr(value: string, label: string) {
  if (!value.trim()) { toast.error('Valeur vide'); return }
  const win = window.open('', '_blank', 'width=400,height=380')
  if (!win) { toast.error('Popup bloquée'); return }
  win.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>QR — ${label}</title>
  <script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.4/build/qrcode.min.js"></script>
  <style>
    body { font-family: sans-serif; text-align: center; padding: 30px; background: #fff; }
    p { margin: 0 0 10px; font-size: 14px; font-weight: 600; }
  </style>
</head>
<body>
  <p>${label}</p>
  <canvas id="qr"></canvas>
  <script>
    QRCode.toCanvas(document.getElementById('qr'), '${value.replace(/'/g, "\\'")}',
      { width: 200, margin: 2 }, function(err){
        if(err) document.body.innerHTML += '<p style=color:red>' + err + '</p>';
      });
    setTimeout(function(){ window.print(); }, 600);
  </script>
</body>
</html>`)
  win.document.close()
}

// ─── Containers Section ───────────────────────────────────────────────────────

function ContainersSection({
  containers, units, onChange,
}: {
  containers: ContainerForm[]
  units: Unit[]
  onChange: (c: ContainerForm[]) => void
}) {
  const set = (key: string, idx: number, val: string | boolean) => {
    onChange(containers.map((c, i) => i === idx ? { ...c, [key]: val } : c))
  }

  // Ensure exactly one is_stock_unit
  const setStockUnit = (idx: number) => {
    onChange(containers.map((c, i) => ({ ...c, is_stock_unit: i === idx })))
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
          <Box size={14} /> Contenances &amp; conversions
        </h3>
        <button type="button"
          onClick={() => onChange([...containers, newContainerRow()])}
          className="text-xs text-primary hover:underline flex items-center gap-1">
          <Plus size={12} /> Ajouter
        </button>
      </div>

      {containers.length === 0 && (
        <p className="text-xs text-gray-400 italic py-2">
          Aucune contenance définie. Cliquez sur "Ajouter" pour créer le premier niveau (ex: Pièce, Douzaine, Carton...).
        </p>
      )}

      {containers.map((c, i) => (
        <div key={c._key} className="border border-gray-200 rounded-xl p-3 space-y-2 bg-gray-50/50">
          <div className="flex items-start gap-2">
            {/* Unité + libellé */}
            <div className="flex-1 grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Unité *</label>
                <select value={c.unit_id} onChange={e => set('unit_id', i, e.target.value)} className="input text-sm">
                  <option value="">— Choisir —</option>
                  {units.map(u => <option key={u.id} value={u.id}>{u.name} ({u.abbreviation})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Libellé (facultatif)</label>
                <input value={c.label} onChange={e => set('label', i, e.target.value)}
                  className="input text-sm" placeholder="ex: Carton de 5 doz." />
              </div>
            </div>
            <button type="button" onClick={() => onChange(containers.filter((_, j) => j !== i))}
              className="mt-5 text-gray-400 hover:text-red-500 transition-colors flex-shrink-0">
              <Trash2 size={14} />
            </button>
          </div>

          {/* Facteur de conversion + flags */}
          <div className="grid grid-cols-4 gap-2 items-end">
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                Facteur conversion
                <span className="text-gray-400 ml-1 font-normal">(= nb d'unités de base)</span>
              </label>
              <input type="number" value={c.conversion_factor}
                onChange={e => set('conversion_factor', i, e.target.value)}
                className="input text-sm" min={0.0001} step="any" />
            </div>
            <div className="flex flex-col gap-1 pt-1">
              <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                <input type="checkbox" checked={c.is_purchase_unit}
                  onChange={e => set('is_purchase_unit', i, e.target.checked)} className="rounded" />
                Unité d'achat
              </label>
              <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                <input type="checkbox" checked={c.is_sale_unit}
                  onChange={e => set('is_sale_unit', i, e.target.checked)} className="rounded" />
                Unité de vente
              </label>
              <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                <input type="radio" name={`stock_unit_${containers[0]?._key}`}
                  checked={c.is_stock_unit} onChange={() => setStockUnit(i)} className="rounded-full" />
                <span className="font-semibold text-primary">Unité de stock</span>
              </label>
            </div>
            {/* Prix A / B / C */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">Prix A</label>
              <input type="number" value={c.price_a} onChange={e => set('price_a', i, e.target.value)}
                className="input text-sm" min={0} step="any" placeholder="0" />
              <label className="block text-xs text-gray-500 mb-1 mt-1">Prix B</label>
              <input type="number" value={c.price_b} onChange={e => set('price_b', i, e.target.value)}
                className="input text-sm" min={0} step="any" placeholder="0" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Prix C</label>
              <input type="number" value={c.price_c} onChange={e => set('price_c', i, e.target.value)}
                className="input text-sm" min={0} step="any" placeholder="0" />
              <label className="block text-xs text-gray-500 mb-1 mt-1">Code-barres contenance</label>
              <div className="flex gap-1">
                <input value={c.barcode} onChange={e => set('barcode', i, e.target.value)}
                  className="input text-sm flex-1" placeholder="EAN / interne" />
                {c.barcode && (
                  <button type="button" onClick={() => printBarcode(c.barcode, c.label || `Contenance ${i + 1}`)}
                    className="p-2 rounded-lg border border-gray-200 hover:bg-gray-100 text-gray-500"
                    title="Imprimer code-barres">
                    <Printer size={13} />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}

      {containers.length >= 2 && (
        <div className="text-xs text-gray-500 bg-blue-50 rounded-lg p-2.5 flex items-start gap-2">
          <ArrowRightLeft size={13} className="mt-0.5 text-blue-500 flex-shrink-0" />
          <span>
            L'unité de stock (radio) est la base de conversion. Toutes les autres unités utilisent leur facteur de conversion par rapport à celle-ci.
          </span>
        </div>
      )}
    </div>
  )
}

// ─── Product Form Modal ───────────────────────────────────────────────────────

interface BarcodeEntry { barcode: string; type: 'ean13' | 'ean8' | 'internal' | 'weight_variable' }

function ProductFormModal({ product, onClose }: { product?: Product; onClose: () => void }) {
  const qc = useQueryClient()

  const { data: rawCategories = [] } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: () => api.get('/categories').then(r => r.data),
  })
  const { data: brands = [] } = useQuery<Brand[]>({
    queryKey: ['brands'],
    queryFn: () => api.get('/brands').then(r => r.data),
  })
  const { data: units = [] } = useQuery<Unit[]>({
    queryKey: ['units'],
    queryFn: () => api.get('/units').then(r => r.data),
  })

  const flatCats = flattenCategories(rawCategories)

  // Inline category creation
  const [showNewCatForm, setShowNewCatForm] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [newCatParentId, setNewCatParentId] = useState('')

  const createCatMutation = useMutation({
    mutationFn: (payload: object) => api.post('/categories', payload),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['categories'] })
      setForm(f => ({ ...f, category_id: String(res.data.id) }))
      setShowNewCatForm(false); setNewCatName(''); setNewCatParentId('')
      toast.success('Catégorie créée')
    },
    onError: () => toast.error('Erreur lors de la création de la catégorie'),
  })

  const handleCreateCategory = () => {
    if (!newCatName.trim()) return
    createCatMutation.mutate({ name: newCatName.trim(), parent_id: newCatParentId ? Number(newCatParentId) : null })
  }

  // Inline brand creation
  const [showNewBrandForm, setShowNewBrandForm] = useState(false)
  const [newBrandName, setNewBrandName] = useState('')

  const createBrandMutation = useMutation({
    mutationFn: (payload: object) => api.post('/brands', payload),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['brands'] })
      setForm(f => ({ ...f, brand_id: String(res.data.id) }))
      setShowNewBrandForm(false); setNewBrandName('')
      toast.success('Marque créée')
    },
    onError: () => toast.error('Erreur lors de la création de la marque'),
  })

  const handleCreateBrand = () => {
    if (!newBrandName.trim()) return
    createBrandMutation.mutate({ name: newBrandName.trim() })
  }

  const [form, setForm] = useState({
    name: product?.name ?? '',
    short_name: product?.short_name ?? '',
    category_id: product?.category?.id?.toString() ?? '',
    brand_id: product?.brand?.id?.toString() ?? '',
    unit_id: product?.unit?.id?.toString() ?? '',
    purchase_price_ht: product?.purchase_price_ht?.toString() ?? '0',
    sale_price_ttc: product?.sale_price_ttc?.toString() ?? '0',
    vat_rate: product?.vat_rate?.toString() ?? '18',
    min_stock: product?.min_stock?.toString() ?? '',
    max_stock: product?.max_stock?.toString() ?? '',
    stock_appro: product?.stock_appro?.toString() ?? '',
    alert_stock: product?.alert_stock?.toString() ?? '',
    is_weight_based: product?.is_weight_based ?? false,
    track_expiry: product?.track_expiry ?? false,
  })

  const [barcodes, setBarcodes] = useState<BarcodeEntry[]>(
    product?.barcodes?.map(b => ({ barcode: b.barcode, type: b.type as BarcodeEntry['type'] })) ?? [{ barcode: '', type: 'ean13' }]
  )

  const [containers, setContainers] = useState<ContainerForm[]>(
    product?.containers?.map(c => ({
      _key: `${c.id ?? Date.now()}-${Math.random()}`,
      id: c.id,
      unit_id: String(c.unit_id),
      label: c.label ?? '',
      conversion_factor: String(c.conversion_factor),
      is_purchase_unit: c.is_purchase_unit,
      is_sale_unit: c.is_sale_unit,
      is_stock_unit: c.is_stock_unit,
      price_a: c.price_a != null ? String(c.price_a) : '',
      price_b: c.price_b != null ? String(c.price_b) : '',
      price_c: c.price_c != null ? String(c.price_c) : '',
      barcode: c.barcode ?? '',
    })) ?? []
  )

  // Photo upload
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(product?.image ?? null)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    setImageFile(f)
    const reader = new FileReader()
    reader.onload = () => setImagePreview(reader.result as string)
    reader.readAsDataURL(f)
  }

  const [errors, setErrors] = useState<Record<string, string>>({})

  const mutation = useMutation({
    mutationFn: (payload: object) =>
      product ? api.put(`/products/${product.id}`, payload) : api.post('/products', payload),
    onSuccess: async (res) => {
      // Upload image separately if selected
      if (imageFile) {
        const fd = new FormData()
        fd.append('image', imageFile)
        await api.post(`/products/${res.data.id}/image`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        }).catch(() => toast.error('Produit sauvegardé mais erreur upload photo'))
      }
      qc.invalidateQueries({ queryKey: ['products'] })
      qc.invalidateQueries({ queryKey: ['product-stats'] })
      toast.success(product ? 'Produit mis à jour' : 'Produit créé')
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
    if (!form.purchase_price_ht) errs.purchase_price_ht = 'Prix achat requis'
    if (!form.sale_price_ttc) errs.sale_price_ttc = 'Prix vente requis'
    if (Object.keys(errs).length) { setErrors(errs); return }

    const validBarcodes = barcodes.filter(b => b.barcode.trim())
    const validContainers = containers
      .filter(c => c.unit_id)
      .map(c => ({
        unit_id: Number(c.unit_id),
        label: c.label || undefined,
        conversion_factor: Number(c.conversion_factor) || 1,
        is_purchase_unit: c.is_purchase_unit,
        is_sale_unit: c.is_sale_unit,
        is_stock_unit: c.is_stock_unit,
        price_a: c.price_a ? Number(c.price_a) : undefined,
        price_b: c.price_b ? Number(c.price_b) : undefined,
        price_c: c.price_c ? Number(c.price_c) : undefined,
        barcode: c.barcode || undefined,
      }))

    mutation.mutate({
      name: form.name,
      short_name: form.short_name || undefined,
      category_id: form.category_id ? Number(form.category_id) : undefined,
      brand_id: form.brand_id ? Number(form.brand_id) : undefined,
      unit_id: form.unit_id ? Number(form.unit_id) : undefined,
      purchase_price_ht: Number(form.purchase_price_ht),
      sale_price_ttc: Number(form.sale_price_ttc),
      vat_rate: Number(form.vat_rate),
      min_stock: form.min_stock ? Number(form.min_stock) : undefined,
      max_stock: form.max_stock ? Number(form.max_stock) : undefined,
      stock_appro: form.stock_appro ? Number(form.stock_appro) : undefined,
      alert_stock: form.alert_stock ? Number(form.alert_stock) : undefined,
      is_weight_based: form.is_weight_based,
      track_expiry: form.track_expiry,
      barcodes: validBarcodes.length ? validBarcodes : undefined,
      containers: validContainers,
    })
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const marginPct = (() => {
    const ht = Number(form.sale_price_ttc) / (1 + Number(form.vat_rate) / 100)
    const buy = Number(form.purchase_price_ht)
    if (!buy || !ht) return null
    return Math.round(((ht - buy) / buy) * 100)
  })()

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl max-h-[92vh] flex flex-col">
        <div className="p-6 border-b flex items-center justify-between flex-shrink-0">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Package size={20} className="text-primary" />
            {product ? 'Modifier le produit' : 'Nouvel article'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">

          {/* Photo + désignation */}
          <div className="flex gap-4">
            {/* Photo */}
            <div className="flex-shrink-0">
              <div
                onClick={() => fileRef.current?.click()}
                className="w-20 h-20 rounded-xl border-2 border-dashed border-gray-300 hover:border-primary cursor-pointer flex items-center justify-center overflow-hidden bg-gray-50 transition-colors"
                title="Cliquer pour changer la photo">
                {imagePreview
                  ? <img src={imagePreview} alt="product" className="w-full h-full object-cover" />
                  : <Camera size={24} className="text-gray-300" />}
              </div>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
              <p className="text-xs text-center text-gray-400 mt-1">Photo</p>
            </div>

            {/* Désignation */}
            <div className="flex-1 space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Désignation *</label>
                <input value={form.name} onChange={set('name')} className="input" placeholder="Nom complet du produit" />
                {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nom court (ticket)</label>
                <input value={form.short_name} onChange={set('short_name')} className="input" placeholder="Ex: COCA 33CL" maxLength={60} />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Catégorie */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Catégorie</label>
              {showNewCatForm ? (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input value={newCatName} onChange={e => setNewCatName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleCreateCategory())}
                      className="input flex-1" placeholder="Nom de la catégorie" autoFocus />
                    <button type="button" onClick={handleCreateCategory}
                      disabled={createCatMutation.isPending || !newCatName.trim()}
                      className="px-3 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-600 disabled:opacity-50">
                      <Check size={14} />
                    </button>
                    <button type="button" onClick={() => { setShowNewCatForm(false); setNewCatName(''); setNewCatParentId('') }}
                      className="px-3 py-2 border rounded-lg text-sm hover:bg-gray-50"><X size={14} /></button>
                  </div>
                  <select value={newCatParentId} onChange={e => setNewCatParentId(e.target.value)} className="input text-sm">
                    <option value="">Catégorie racine (sans parent)</option>
                    {flatCats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              ) : (
                <div className="flex gap-2">
                  <select value={form.category_id} onChange={set('category_id')} className="input flex-1">
                    <option value="">— Sélectionner —</option>
                    {flatCats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <button type="button" onClick={() => setShowNewCatForm(true)}
                    className="px-3 py-2 border border-dashed border-primary-300 text-primary rounded-lg text-sm hover:bg-primary-50 flex items-center gap-1 whitespace-nowrap">
                    <Plus size={13} /> Nouvelle
                  </button>
                </div>
              )}
            </div>

            {/* Marque */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Marque</label>
              {showNewBrandForm ? (
                <div className="flex gap-2">
                  <input value={newBrandName} onChange={e => setNewBrandName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleCreateBrand())}
                    className="input flex-1" placeholder="Nom de la marque" autoFocus />
                  <button type="button" onClick={handleCreateBrand}
                    disabled={createBrandMutation.isPending || !newBrandName.trim()}
                    className="px-3 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary-600 disabled:opacity-50">
                    <Check size={14} />
                  </button>
                  <button type="button" onClick={() => { setShowNewBrandForm(false); setNewBrandName('') }}
                    className="px-3 py-2 border rounded-lg text-sm hover:bg-gray-50"><X size={14} /></button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <select value={form.brand_id} onChange={set('brand_id')} className="input flex-1">
                    <option value="">— Sélectionner —</option>
                    {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                  <button type="button" onClick={() => setShowNewBrandForm(true)}
                    className="px-3 py-2 border border-dashed border-primary-300 text-primary rounded-lg text-sm hover:bg-primary-50 flex items-center gap-1 whitespace-nowrap">
                    <Plus size={13} /> Nouvelle
                  </button>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Unité par défaut</label>
              <select value={form.unit_id} onChange={set('unit_id')} className="input">
                <option value="">— Sélectionner —</option>
                {units.map(u => <option key={u.id} value={u.id}>{u.name} ({u.abbreviation})</option>)}
              </select>
            </div>
          </div>

          {/* Prix */}
          <div className="bg-gray-50 rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2"><TrendingUp size={14} /> Tarification de base</h3>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Prix achat HT *</label>
                <input type="number" value={form.purchase_price_ht} onChange={set('purchase_price_ht')} className="input" min={0} step={1} />
                {errors.purchase_price_ht && <p className="text-red-500 text-xs mt-1">{errors.purchase_price_ht}</p>}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Prix vente TTC *</label>
                <input type="number" value={form.sale_price_ttc} onChange={set('sale_price_ttc')} className="input" min={0} step={1} />
                {errors.sale_price_ttc && <p className="text-red-500 text-xs mt-1">{errors.sale_price_ttc}</p>}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">TVA</label>
                <select value={form.vat_rate} onChange={set('vat_rate')} className="input">
                  <option value={18}>18% standard</option>
                  <option value={0}>Exonéré 0%</option>
                </select>
              </div>
            </div>
            {marginPct !== null && (
              <div className={`text-sm font-medium ${marginPct >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                Marge : {marginPct >= 0 ? '+' : ''}{marginPct}%
              </div>
            )}
          </div>

          {/* Niveaux de stock */}
          <div className="bg-gray-50 rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2"><Layers size={14} /> Niveaux de stock</h3>
            <div className="grid grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Niveau minimum</label>
                <input type="number" value={form.min_stock} onChange={set('min_stock')} className="input" min={0} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Niveau maximum</label>
                <input type="number" value={form.max_stock} onChange={set('max_stock')} className="input" min={0} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Niveau d'appro.</label>
                <input type="number" value={form.stock_appro} onChange={set('stock_appro')} className="input" min={0} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Seuil d'alerte</label>
                <input type="number" value={form.alert_stock} onChange={set('alert_stock')} className="input" min={0} />
              </div>
            </div>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form.is_weight_based}
                  onChange={e => setForm(f => ({ ...f, is_weight_based: e.target.checked }))} className="rounded" />
                Vendu au poids
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form.track_expiry}
                  onChange={e => setForm(f => ({ ...f, track_expiry: e.target.checked }))} className="rounded" />
                Suivi DLC
              </label>
            </div>
          </div>

          {/* Contenances */}
          <div className="bg-gray-50 rounded-xl p-4">
            <ContainersSection containers={containers} units={units} onChange={setContainers} />
          </div>

          {/* Codes-barres */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2"><Barcode size={14} /> Codes-barres principaux</h3>
              <button type="button"
                onClick={() => setBarcodes(b => [...b, { barcode: '', type: 'ean13' }])}
                className="text-xs text-primary hover:underline flex items-center gap-1">
                <Plus size={12} /> Ajouter
              </button>
            </div>
            {barcodes.map((bc, i) => (
              <div key={i} className="flex gap-2 items-center">
                <input
                  value={bc.barcode}
                  onChange={e => setBarcodes(arr => arr.map((a, j) => j === i ? { ...a, barcode: e.target.value } : a))}
                  className="input flex-1" placeholder="Code-barres" />
                <select
                  value={bc.type}
                  onChange={e => setBarcodes(arr => arr.map((a, j) => j === i ? { ...a, type: e.target.value as BarcodeEntry['type'] } : a))}
                  className="input w-32">
                  <option value="ean13">EAN-13</option>
                  <option value="ean8">EAN-8</option>
                  <option value="internal">Interne</option>
                </select>
                <div className="flex gap-1">
                  {bc.barcode && (
                    <>
                      <button type="button" onClick={() => printBarcode(bc.barcode, form.name || 'Produit')}
                        className="p-2 rounded-lg border border-gray-200 hover:bg-gray-100 text-gray-500"
                        title="Imprimer code-barres"><Printer size={13} /></button>
                      <button type="button" onClick={() => printQr(bc.barcode, form.name || 'Produit')}
                        className="p-2 rounded-lg border border-gray-200 hover:bg-gray-100 text-gray-500"
                        title="Imprimer QR code"><BarChart2 size={13} /></button>
                    </>
                  )}
                  {i === 0 && <span className="text-xs text-primary w-16 text-center self-center">Principal</span>}
                  {i > 0 && (
                    <button type="button" onClick={() => setBarcodes(arr => arr.filter((_, j) => j !== i))}
                      className="text-gray-400 hover:text-red-500 w-16 flex justify-center">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </form>

        <div className="p-6 border-t flex gap-3 flex-shrink-0">
          <button type="button" onClick={onClose} className="btn-secondary flex-1">Annuler</button>
          <button
            onClick={handleSubmit}
            disabled={mutation.isPending}
            className="btn-primary flex-1 flex items-center justify-center gap-2">
            <Check size={16} />
            {mutation.isPending ? 'Enregistrement...' : (product ? 'Mettre à jour' : 'Créer l\'article')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Product Detail Modal ─────────────────────────────────────────────────────

function ProductDetailModal({ product, onClose, onEdit }: {
  product: Product; onClose: () => void; onEdit: () => void
}) {
  const { data: detail } = useQuery<Product>({
    queryKey: ['product', product.id],
    queryFn: () => api.get(`/products/${product.id}`).then(r => r.data),
  })

  const p = detail ?? product
  const stock = p.stock_level?.qty_on_hand ?? 0

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl max-h-[92vh] flex flex-col">
        <div className="p-6 border-b flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-4">
            {p.image && (
              <img src={p.image} alt={p.name} className="w-14 h-14 rounded-xl object-cover border" />
            )}
            <div>
              <h2 className="text-xl font-bold">{p.name}</h2>
              <p className="text-sm text-gray-500 font-mono">{p.internal_code}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={onEdit}
              className="flex items-center gap-1 px-3 py-1.5 bg-primary-50 text-primary rounded-lg text-sm hover:bg-primary-100">
              <Edit2 size={14} /> Modifier
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="bg-gray-50 rounded-xl p-4 space-y-2">
              <p className="font-semibold text-gray-700">Tarification</p>
              <div className="flex justify-between"><span className="text-gray-500">Prix achat HT</span><span className="font-medium">{formatCurrency(p.purchase_price_ht)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Prix vente TTC</span><span className="font-bold text-primary">{formatCurrency(p.sale_price_ttc)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">TVA</span><span>{p.vat_rate}%</span></div>
            </div>
            <div className="bg-gray-50 rounded-xl p-4 space-y-2">
              <p className="font-semibold text-gray-700">Stock</p>
              <div className="flex justify-between"><span className="text-gray-500">Disponible</span>
                <span className={`font-bold ${stock <= 0 ? 'text-red-600' : stock <= (p.alert_stock ?? 5) ? 'text-amber-600' : 'text-green-600'}`}>
                  {formatNumber(stock, 0)} {p.unit?.abbreviation ?? ''}
                </span>
              </div>
              {p.min_stock != null && <div className="flex justify-between"><span className="text-gray-500">Minimum</span><span>{p.min_stock}</span></div>}
              {p.stock_appro != null && <div className="flex justify-between"><span className="text-gray-500">Appro.</span><span>{p.stock_appro}</span></div>}
              {p.alert_stock != null && <div className="flex justify-between"><span className="text-gray-500">Seuil alerte</span><span>{p.alert_stock}</span></div>}
              {p.stock_level?.avg_cost != null && <div className="flex justify-between"><span className="text-gray-500">Coût moyen</span><span>{formatCurrency(p.stock_level!.avg_cost)}</span></div>}
            </div>
          </div>

          {/* Contenances */}
          {(p.containers ?? []).length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2"><Box size={14} /> Contenances</h3>
              <div className="overflow-hidden rounded-xl border">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Unité</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Libellé</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600">Facteur</th>
                      <th className="text-center px-3 py-2 font-medium text-gray-600">Achat</th>
                      <th className="text-center px-3 py-2 font-medium text-gray-600">Vente</th>
                      <th className="text-center px-3 py-2 font-medium text-gray-600">Stock</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600">Prix A</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600">Prix B</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600">Prix C</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {p.containers!.map((c, i) => (
                      <tr key={i}>
                        <td className="px-3 py-2 font-medium">{c.unit?.name ?? c.unit_id}</td>
                        <td className="px-3 py-2 text-gray-500">{c.label ?? '—'}</td>
                        <td className="px-3 py-2 text-right">×{c.conversion_factor}</td>
                        <td className="px-3 py-2 text-center">{c.is_purchase_unit ? '✓' : ''}</td>
                        <td className="px-3 py-2 text-center">{c.is_sale_unit ? '✓' : ''}</td>
                        <td className="px-3 py-2 text-center">{c.is_stock_unit ? <span className="text-primary font-semibold">Base</span> : ''}</td>
                        <td className="px-3 py-2 text-right">{c.price_a != null ? formatCurrency(c.price_a) : '—'}</td>
                        <td className="px-3 py-2 text-right">{c.price_b != null ? formatCurrency(c.price_b) : '—'}</td>
                        <td className="px-3 py-2 text-right">{c.price_c != null ? formatCurrency(c.price_c) : '—'}</td>
                        <td className="px-3 py-2">
                          {c.barcode && (
                            <div className="flex gap-1">
                              <button onClick={() => printBarcode(c.barcode!, c.label || c.unit?.name || '')}
                                className="text-gray-400 hover:text-gray-700" title="Imprimer code-barres">
                                <Printer size={12} />
                              </button>
                              <button onClick={() => printQr(c.barcode!, c.label || c.unit?.name || '')}
                                className="text-gray-400 hover:text-gray-700" title="Imprimer QR code">
                                <BarChart2 size={12} />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {(p.barcodes ?? []).length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2"><Barcode size={14} /> Codes-barres</h3>
              <div className="flex flex-wrap gap-2">
                {p.barcodes!.map((b, i) => (
                  <div key={i} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${b.is_primary ? 'bg-primary-50 border-primary-200' : 'bg-gray-50 border-gray-200'}`}>
                    <span className="text-sm font-mono">{b.barcode}</span>
                    {b.is_primary && <span className="text-xs text-primary">(principal)</span>}
                    <button onClick={() => printBarcode(b.barcode, p.name)}
                      className="text-gray-400 hover:text-gray-700" title="Imprimer code-barres">
                      <Printer size={12} />
                    </button>
                    <button onClick={() => printQr(b.barcode, p.name)}
                      className="text-gray-400 hover:text-gray-700" title="Imprimer QR code">
                      <BarChart2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(p.priceHistory ?? []).length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2"><History size={14} /> Historique des prix</h3>
              <table className="w-full text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Date</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-600">Ancien TTC</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-600">Nouveau TTC</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-600">Var.</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Par</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {p.priceHistory!.map(h => {
                    const delta = h.new_price_ttc - h.old_price_ttc
                    return (
                      <tr key={h.id}>
                        <td className="px-3 py-2 text-gray-500">{fmtDate(h.created_at)}</td>
                        <td className="px-3 py-2 text-right text-gray-500 line-through">{formatCurrency(h.old_price_ttc)}</td>
                        <td className="px-3 py-2 text-right font-medium">{formatCurrency(h.new_price_ttc)}</td>
                        <td className={`px-3 py-2 text-right font-medium ${delta > 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {delta > 0 ? '+' : ''}{formatCurrency(delta)}
                        </td>
                        <td className="px-3 py-2 text-gray-500">{h.user?.name ?? '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Categories Tab ───────────────────────────────────────────────────────────

function CategoryRow({ cat, depth, onEdit, onDelete }: {
  cat: Category
  depth: number
  onEdit: (cat: Category) => void
  onDelete: (cat: Category) => void
}) {
  const [expanded, setExpanded] = useState(true)
  const hasChildren = (cat.children ?? []).length > 0

  return (
    <>
      <tr className="hover:bg-gray-50 group">
        <td className="px-4 py-3">
          <div className="flex items-center gap-1" style={{ paddingLeft: depth * 20 }}>
            {hasChildren ? (
              <button onClick={() => setExpanded(e => !e)} className="text-gray-400 hover:text-gray-600 w-5 flex-shrink-0">
                <ChevronRightIcon size={14} className={`transition-transform ${expanded ? 'rotate-90' : ''}`} />
              </button>
            ) : (
              <span className="w-5 flex-shrink-0" />
            )}
            <Tag size={14} className={depth === 0 ? 'text-primary' : 'text-gray-400'} />
            <span className={`ml-1 font-medium ${depth === 0 ? 'text-gray-900' : 'text-gray-600'}`}>{cat.name}</span>
          </div>
        </td>
        <td className="px-4 py-3 text-sm text-gray-500">
          {cat.type ? (
            <span className="px-2 py-0.5 bg-gray-100 rounded-full text-xs">{TYPE_LABELS[cat.type] ?? cat.type}</span>
          ) : '—'}
        </td>
        <td className="px-4 py-3 text-sm text-gray-400">
          {hasChildren ? `${cat.children!.length} sous-catégorie(s)` : '—'}
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={() => onEdit(cat)}
              className="p-1.5 rounded-lg hover:bg-primary-50 text-gray-400 hover:text-primary transition-colors"
              title="Modifier">
              <Pencil size={14} />
            </button>
            <button onClick={() => onDelete(cat)}
              className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
              title="Supprimer">
              <Trash2 size={14} />
            </button>
          </div>
        </td>
      </tr>
      {hasChildren && expanded && cat.children!.map(child => (
        <CategoryRow key={child.id} cat={child} depth={depth + 1} onEdit={onEdit} onDelete={onDelete} />
      ))}
    </>
  )
}

function CategoryEditModal({ cat, categories, onClose }: {
  cat: Category | null
  categories: Category[]
  onClose: () => void
}) {
  const qc = useQueryClient()
  const flatCats = flattenCategories(categories).filter(c => c.id !== cat?.id)

  const [name, setName] = useState(cat?.name ?? '')
  const [parentId, setParentId] = useState(cat?.parent_id?.toString() ?? '')
  const [type, setType] = useState(cat?.type ?? '')

  const mutation = useMutation({
    mutationFn: (payload: object) =>
      cat ? api.put(`/categories/${cat.id}`, payload) : api.post('/categories', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categories'] })
      toast.success(cat ? 'Catégorie mise à jour' : 'Catégorie créée')
      onClose()
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message ?? 'Erreur')
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    mutation.mutate({ name: name.trim(), parent_id: parentId ? Number(parentId) : null, type: type || null })
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        <div className="p-6 border-b flex items-center justify-between">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <FolderPlus size={18} className="text-primary" />
            {cat ? 'Modifier la catégorie' : 'Nouvelle catégorie'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nom *</label>
            <input value={name} onChange={e => setName(e.target.value)} className="input" placeholder="Ex : Boissons" autoFocus />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Catégorie parente</label>
            <select value={parentId} onChange={e => setParentId(e.target.value)} className="input">
              <option value="">Aucune (catégorie racine)</option>
              {flatCats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <select value={type} onChange={e => setType(e.target.value)} className="input">
              <option value="">Commun (tous)</option>
              <option value="grande_surface">Grande surface uniquement</option>
              <option value="restaurant">Restaurant uniquement</option>
            </select>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Annuler</button>
            <button type="submit" disabled={mutation.isPending || !name.trim()} className="btn-primary flex-1 flex items-center justify-center gap-2">
              <Check size={15} />
              {mutation.isPending ? 'Enregistrement...' : (cat ? 'Mettre à jour' : 'Créer')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function CategoriesTab() {
  const qc = useQueryClient()
  const [editCat, setEditCat] = useState<Category | null | undefined>(undefined)

  const { data: categories = [], isLoading } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: () => api.get('/categories').then(r => r.data),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/categories/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categories'] })
      toast.success('Catégorie supprimée')
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      toast.error(err.response?.data?.message ?? 'Erreur lors de la suppression')
    },
  })

  const handleDelete = (cat: Category) => {
    if (!window.confirm(`Supprimer la catégorie "${cat.name}" ?`)) return
    deleteMutation.mutate(cat.id)
  }

  const total = flattenCategories(categories).length
  const rootCount = categories.length
  const subCount = total - rootCount

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 text-sm text-gray-500">
          <span className="flex items-center gap-1.5">
            <FolderTree size={15} className="text-primary" />
            <span><strong className="text-gray-900">{rootCount}</strong> catégories racines</span>
          </span>
          <span>·</span>
          <span><strong className="text-gray-900">{subCount}</strong> sous-catégories</span>
          <span>·</span>
          <span><strong className="text-gray-900">{total}</strong> au total</span>
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
            <FolderTree size={40} className="mx-auto mb-3 opacity-30" />
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
                <th className="text-left px-4 py-3 font-medium text-gray-600">Type</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Sous-catégories</th>
                <th className="px-4 py-3 w-24" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {categories.map(cat => (
                <CategoryRow key={cat.id} cat={cat} depth={0} onEdit={c => setEditCat(c)} onDelete={handleDelete} />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editCat !== undefined && (
        <CategoryEditModal cat={editCat} categories={categories} onClose={() => setEditCat(undefined)} />
      )}
    </div>
  )
}

// ─── Articles Tab ─────────────────────────────────────────────────────────────

function ArticlesTab() {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | ''>('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [showForm, setShowForm] = useState(false)
  const [editProduct, setEditProduct] = useState<Product | undefined>()
  const [viewProduct, setViewProduct] = useState<Product | undefined>()
  const [showStatusMenu, setShowStatusMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const qc = useQueryClient()

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowStatusMenu(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const { data: stats } = useQuery<ProductStats>({
    queryKey: ['product-stats'],
    queryFn: () => api.get('/products/stats').then(r => r.data),
  })

  const { data: rawCategories = [] } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: () => api.get('/categories').then(r => r.data),
  })

  const flatCats = flattenCategories(rawCategories)

  const queryParams = {
    search: search || undefined,
    page,
    per_page: 25,
    category_id: selectedCategoryId || undefined,
    is_active: statusFilter === 'active' ? true : statusFilter === 'inactive' ? false : undefined,
    low_stock: statusFilter === 'low_stock' ? true : undefined,
  }

  const { data, isLoading } = useQuery<Paginated<Product>>({
    queryKey: ['products', queryParams],
    queryFn: () => api.get('/products', { params: queryParams }).then(r => r.data),
    placeholderData: prev => prev,
  })

  const toggleActive = useMutation({
    mutationFn: (p: Product) => api.put(`/products/${p.id}`, { is_active: !p.is_active }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] })
      qc.invalidateQueries({ queryKey: ['product-stats'] })
    },
  })

  const STATUS_LABELS: Record<StatusFilter, string> = {
    all: 'Tous les articles',
    active: 'Actifs uniquement',
    inactive: 'Inactifs uniquement',
    low_stock: 'Stock faible',
  }

  const resetFilters = () => {
    setSearch(''); setSelectedCategoryId(''); setStatusFilter('all'); setPage(1)
  }

  const hasFilters = search || selectedCategoryId !== '' || statusFilter !== 'all'

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-4 gap-4">
        <KpiCard icon={<Package size={20} className="text-white" />} label="Total articles" value={stats?.total ?? 0} color="bg-primary" />
        <KpiCard icon={<Check size={20} className="text-white" />} label="Articles actifs" value={stats?.active ?? 0} color="bg-green-500" />
        <KpiCard icon={<AlertTriangle size={20} className="text-white" />} label="Stock faible" value={stats?.low_stock ?? 0} color="bg-amber-500" />
        <KpiCard icon={<X size={20} className="text-white" />} label="En rupture" value={stats?.out_of_stock ?? 0} color="bg-red-500" />
      </div>

      <div className="card p-4 space-y-3">
        <div className="flex gap-3">
          <div className="relative flex-1">
            <input type="text" value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              className="input pl-10" placeholder="Rechercher par nom, code interne ou code-barres..." />
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          </div>

          <div className="relative" ref={menuRef}>
            <button onClick={() => setShowStatusMenu(s => !s)}
              className="flex items-center gap-2 px-4 py-2 border rounded-lg text-sm hover:bg-gray-50 bg-white border-gray-200 whitespace-nowrap">
              <Filter size={15} className="text-gray-500" />
              {STATUS_LABELS[statusFilter]}
              <ChevronDown size={14} className="text-gray-400" />
            </button>
            {showStatusMenu && (
              <div className="absolute right-0 top-full mt-1 w-44 bg-white border border-gray-200 rounded-xl shadow-lg z-10 py-1">
                {(Object.keys(STATUS_LABELS) as StatusFilter[]).map(k => (
                  <button key={k}
                    onClick={() => { setStatusFilter(k); setPage(1); setShowStatusMenu(false) }}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 ${statusFilter === k ? 'text-primary font-medium' : 'text-gray-700'}`}>
                    {STATUS_LABELS[k]}
                  </button>
                ))}
              </div>
            )}
          </div>

          {hasFilters && (
            <button onClick={resetFilters}
              className="flex items-center gap-1 px-3 py-2 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50">
              <X size={14} /> Réinitialiser
            </button>
          )}
        </div>

        {flatCats.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => { setSelectedCategoryId(''); setPage(1) }}
              className={`px-3 py-1 rounded-full text-sm border transition-colors ${selectedCategoryId === '' ? 'bg-primary text-white border-primary' : 'bg-white text-gray-600 border-gray-200 hover:border-primary-300'}`}>
              Toutes
            </button>
            {flatCats.map(c => (
              <button key={c.id}
                onClick={() => { setSelectedCategoryId(c.id); setPage(1) }}
                className={`px-3 py-1 rounded-full text-sm border transition-colors ${selectedCategoryId === c.id ? 'bg-primary text-white border-primary' : 'bg-white text-gray-600 border-gray-200 hover:border-primary-300'}`}>
                {c.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="card p-0 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Chargement...</div>
        ) : (data?.data ?? []).length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <Package size={40} className="mx-auto mb-3 opacity-30" />
            <p className="font-medium">Aucun article trouvé</p>
            {hasFilters && <button onClick={resetFilters} className="mt-2 text-primary text-sm hover:underline">Réinitialiser les filtres</button>}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Code</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Désignation</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Catégorie</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Achat HT</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Vente TTC</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Marge</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Stock</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">TVA</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Statut</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {(data?.data ?? []).map((p: Product) => {
                const stock = p.stock_level?.qty_on_hand ?? 0
                const htVente = p.sale_price_ttc / (1 + p.vat_rate / 100)
                const margin = p.purchase_price_ht > 0
                  ? Math.round(((htVente - p.purchase_price_ht) / p.purchase_price_ht) * 100)
                  : null

                return (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors group">
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{p.internal_code}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => setViewProduct(p)} className="text-left hover:text-primary transition-colors flex items-center gap-2">
                        {p.image && <img src={p.image} alt="" className="w-8 h-8 rounded-lg object-cover border flex-shrink-0" />}
                        <div>
                          <p className="font-medium text-gray-900">{p.name}</p>
                          {p.barcodes?.find(b => b.is_primary) && (
                            <p className="text-xs text-gray-400 font-mono">{p.barcodes.find(b => b.is_primary)?.barcode}</p>
                          )}
                        </div>
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      {p.category && (
                        <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs">{p.category.name}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">{formatCurrency(p.purchase_price_ht)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">{formatCurrency(p.sale_price_ttc)}</td>
                    <td className="px-4 py-3 text-right">
                      {margin !== null && (
                        <span className={`text-xs font-medium ${margin >= 20 ? 'text-green-600' : margin >= 0 ? 'text-amber-600' : 'text-red-600'}`}>
                          {margin >= 0 ? '+' : ''}{margin}%
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={stock <= 0 ? 'text-red-600 font-semibold' : stock <= (p.alert_stock ?? 5) ? 'text-amber-600 font-semibold' : 'text-gray-700'}>
                        {formatNumber(stock, 0)} {p.unit?.abbreviation ?? ''}
                        {stock <= 0 && <AlertTriangle size={12} className="inline ml-1" />}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${p.vat_rate > 0 ? 'bg-primary-50 text-primary-600' : 'bg-gray-100 text-gray-500'}`}>
                        {p.vat_rate}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => toggleActive.mutate(p)} className="transition-colors" title={p.is_active ? 'Désactiver' : 'Activer'}>
                        {p.is_active
                          ? <ToggleRight className="text-green-500" size={22} />
                          : <ToggleLeft className="text-gray-300" size={22} />}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => setViewProduct(p)} title="Voir le détail"
                          className="text-gray-400 hover:text-primary transition-colors">
                          <Eye size={15} />
                        </button>
                        <button onClick={() => { setEditProduct(p); setShowForm(true) }} title="Modifier"
                          className="text-gray-400 hover:text-primary transition-colors">
                          <Edit2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}

        {data && data.last_page > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50">
            <p className="text-sm text-gray-500">
              Page {data.current_page} / {data.last_page} · {data.total} articles
            </p>
            <div className="flex gap-1">
              <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
                className="p-1.5 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-100">
                <ChevronLeft size={16} />
              </button>
              {Array.from({ length: Math.min(data.last_page, 7) }, (_, i) => {
                const p = i + 1
                return (
                  <button key={p} onClick={() => setPage(p)}
                    className={`px-3 py-1 rounded border text-sm ${page === p ? 'bg-primary text-white border-primary' : 'border-gray-200 hover:bg-gray-100'}`}>
                    {p}
                  </button>
                )
              })}
              <button disabled={page === data.last_page} onClick={() => setPage(p => p + 1)}
                className="p-1.5 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-100">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {showForm && (
        <ProductFormModal
          product={editProduct}
          onClose={() => { setShowForm(false); setEditProduct(undefined) }}
        />
      )}
      {viewProduct && !showForm && (
        <ProductDetailModal
          product={viewProduct}
          onClose={() => setViewProduct(undefined)}
          onEdit={() => { setEditProduct(viewProduct); setViewProduct(undefined); setShowForm(true) }}
        />
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type Tab = 'articles' | 'categories'

export default function ProductsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('articles')
  const [showForm, setShowForm] = useState(false)

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'articles', label: 'Articles', icon: <Package size={16} /> },
    { id: 'categories', label: 'Catégories', icon: <FolderTree size={16} /> },
  ]

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Package size={24} className="text-primary" /> Catalogue
          </h1>
          <p className="text-gray-500 text-sm">Gestion des articles, contenances et catégories</p>
        </div>
        {activeTab === 'articles' && (
          <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2">
            <Plus size={18} /> Nouvel article
          </button>
        )}
      </div>

      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'articles' ? <ArticlesTab /> : <CategoriesTab />}

      {showForm && activeTab === 'articles' && (
        <ProductFormModal onClose={() => setShowForm(false)} />
      )}
    </div>
  )
}
