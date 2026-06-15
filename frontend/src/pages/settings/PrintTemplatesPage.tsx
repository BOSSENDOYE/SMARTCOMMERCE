import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../lib/api'
import toast from 'react-hot-toast'
import {
  Printer, Plus, Pencil, Trash2, X, Star, Copy,
  CheckCircle, Eye, ChevronDown, ChevronUp, Settings2,
} from 'lucide-react'
import { useConfirm } from '../../hooks/useConfirm'

// ── Types ─────────────────────────────────────────────────────────────────────

export type DocType = 'receipt' | 'invoice' | 'delivery_note' | 'purchase_order' | 'label'

export interface PrintConfig {
  header: {
    show_logo: boolean
    show_store_name: boolean
    store_name_override: string
    show_address: boolean
    show_phone: boolean
    show_email: boolean
    show_ninea: boolean
    show_rc: boolean
    slogan: string
  }
  body: {
    columns: {
      ref: boolean
      name: boolean
      qty: boolean
      unit_price: boolean
      discount: boolean
      total: boolean
    }
    show_vat_detail: boolean
    show_lot: boolean
    show_cashier: boolean
    show_client: boolean
    show_payment_method: boolean
  }
  footer: {
    message: string
    show_qr: boolean
    qr_content: string
    show_return_policy: boolean
    return_policy: string
  }
  typography: {
    font: 'courier' | 'arial' | 'helvetica' | 'times'
    base_size: number
    title_size: number
  }
  layout: {
    paper_format: '58mm' | '80mm' | 'a5' | 'a4'
    copies: number
    show_separator: boolean
  }
}

interface PrintTemplate {
  id: number
  document_type: DocType
  name: string
  config: PrintConfig
  is_default: boolean
  is_active: boolean
}

const DOC_TYPES: { type: DocType; label: string; desc: string; icon: string }[] = [
  { type: 'receipt',       label: 'Ticket de caisse',     desc: 'Format thermique (POS)',     icon: '🧾' },
  { type: 'invoice',       label: 'Facture',              desc: 'Document de facturation A4', icon: '📄' },
  { type: 'delivery_note', label: 'Bon de livraison',     desc: 'Accompagnement colis',       icon: '📦' },
  { type: 'purchase_order',label: 'Bon de commande',      desc: 'Commande fournisseur',       icon: '🛒' },
  { type: 'label',         label: 'Étiquette produit',    desc: 'Code-barre + prix',          icon: '🏷️' },
]

const defaultConfig = (): PrintConfig => ({
  header: {
    show_logo: true, show_store_name: true, store_name_override: '',
    show_address: true, show_phone: true, show_email: false,
    show_ninea: true, show_rc: false, slogan: '',
  },
  body: {
    columns: { ref: false, name: true, qty: true, unit_price: true, discount: true, total: true },
    show_vat_detail: true, show_lot: false, show_cashier: true,
    show_client: true, show_payment_method: true,
  },
  footer: {
    message: 'Merci pour votre achat !',
    show_qr: false, qr_content: '',
    show_return_policy: false, return_policy: 'Échange dans les 7 jours sur présentation du ticket.',
  },
  typography: { font: 'courier', base_size: 11, title_size: 14 },
  layout: { paper_format: '80mm', copies: 1, show_separator: true },
})

// ── Live Preview ──────────────────────────────────────────────────────────────

function ReceiptPreview({ config, storeName }: { config: PrintConfig; storeName?: string }) {
  const fontMap: Record<string, string> = {
    courier: "'Courier New', Courier, monospace",
    arial: 'Arial, sans-serif',
    helvetica: 'Helvetica, Arial, sans-serif',
    times: "'Times New Roman', Times, serif",
  }
  const font = fontMap[config.typography.font] ?? fontMap.courier
  const baseSize = config.typography.base_size
  const titleSize = config.typography.title_size

  const paperWidth: Record<string, number> = { '58mm': 200, '80mm': 280, a5: 340, a4: 420 }
  const width = paperWidth[config.layout.paper_format] ?? 280

  const sep = config.layout.show_separator ? (
    <div style={{ borderBottom: '1px dashed #aaa', margin: '4px 0' }} />
  ) : null

  const cols = config.body.columns
  const colList = [
    cols.ref && { label: 'Réf', w: '14%' },
    cols.name && { label: 'Désignation', w: cols.ref ? '36%' : '50%' },
    cols.qty && { label: 'Qté', w: '10%' },
    cols.unit_price && { label: 'P.U.', w: '14%' },
    cols.discount && { label: 'Rem', w: '10%' },
    cols.total && { label: 'Total', w: '16%' },
  ].filter(Boolean) as { label: string; w: string }[]

  return (
    <div
      style={{
        width,
        fontFamily: font,
        fontSize: baseSize,
        backgroundColor: '#fff',
        padding: 12,
        border: '1px solid #e5e7eb',
        borderRadius: 8,
        boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
        minHeight: 200,
        lineHeight: 1.5,
      }}
    >
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 6 }}>
        {config.header.show_logo && (
          <div style={{ fontSize: 20, marginBottom: 2 }}>🏪</div>
        )}
        {config.header.show_store_name && (
          <div style={{ fontWeight: 'bold', fontSize: titleSize }}>
            {config.header.store_name_override || storeName || 'MON MAGASIN'}
          </div>
        )}
        {config.header.slogan && (
          <div style={{ fontSize: baseSize - 1, fontStyle: 'italic' }}>{config.header.slogan}</div>
        )}
        {config.header.show_address && (
          <div style={{ fontSize: baseSize - 1 }}>Rue 12, Dakar</div>
        )}
        {config.header.show_phone && (
          <div style={{ fontSize: baseSize - 1 }}>Tél: +221 33 000 00 00</div>
        )}
        {config.header.show_email && (
          <div style={{ fontSize: baseSize - 1 }}>info@magasin.sn</div>
        )}
        {config.header.show_ninea && (
          <div style={{ fontSize: baseSize - 1 }}>NINEA: 007123456</div>
        )}
        {config.header.show_rc && (
          <div style={{ fontSize: baseSize - 1 }}>RC: SN-DKR-2024-B-00001</div>
        )}
      </div>

      {sep}

      {/* Ticket info */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: baseSize - 1 }}>
        <span>Ticket #0042</span>
        <span>13/06/2026 10:35</span>
      </div>
      {config.body.show_cashier && (
        <div style={{ fontSize: baseSize - 1 }}>Caissier: Ali Diop</div>
      )}
      {config.body.show_client && (
        <div style={{ fontSize: baseSize - 1 }}>Client: Mamadou Ba</div>
      )}

      {sep}

      {/* Columns header */}
      {colList.length > 0 && (
        <div style={{ display: 'flex', fontWeight: 'bold', fontSize: baseSize - 1, borderBottom: '1px solid #333', paddingBottom: 2 }}>
          {colList.map(c => (
            <div key={c.label} style={{ width: c.w, flexShrink: 0 }}>{c.label}</div>
          ))}
        </div>
      )}

      {/* Sample rows */}
      {[
        { ref: 'P001', name: 'Riz Basmati 1kg', qty: '2', up: '1 500', dis: '5%', tot: '2 850' },
        { ref: 'P002', name: 'Huile Végétale 1L', qty: '1', up: '950', dis: '-', tot: '950' },
      ].map((row, i) => (
        <div key={i} style={{ display: 'flex', fontSize: baseSize - 1, borderBottom: '1px dotted #ddd', paddingBottom: 1, paddingTop: 1 }}>
          {cols.ref        && <div style={{ width: '14%', flexShrink: 0 }}>{row.ref}</div>}
          {cols.name       && <div style={{ width: cols.ref ? '36%' : '50%', flexShrink: 0 }}>{row.name}</div>}
          {cols.qty        && <div style={{ width: '10%', flexShrink: 0 }}>{row.qty}</div>}
          {cols.unit_price && <div style={{ width: '14%', flexShrink: 0 }}>{row.up}</div>}
          {cols.discount   && <div style={{ width: '10%', flexShrink: 0 }}>{row.dis}</div>}
          {cols.total      && <div style={{ width: '16%', flexShrink: 0, textAlign: 'right' }}>{row.tot}</div>}
        </div>
      ))}

      {sep}

      {/* Totals */}
      <div style={{ fontSize: baseSize - 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Sous-total HT</span><span>3 619 F</span>
        </div>
        {config.body.show_vat_detail && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>TVA (18%)</span><span>651 F</span>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: baseSize }}>
          <span>TOTAL TTC</span><span>3 800 F</span>
        </div>
        {config.body.show_payment_method && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Espèces</span><span>4 000 F</span>
          </div>
        )}
        {config.body.show_payment_method && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Rendu</span><span>200 F</span>
          </div>
        )}
      </div>

      {sep}

      {/* Footer */}
      {config.footer.message && (
        <div style={{ textAlign: 'center', fontStyle: 'italic', fontSize: baseSize - 1 }}>
          {config.footer.message}
        </div>
      )}
      {config.footer.show_return_policy && config.footer.return_policy && (
        <div style={{ textAlign: 'center', fontSize: baseSize - 2, color: '#555', marginTop: 4 }}>
          {config.footer.return_policy}
        </div>
      )}
      {config.footer.show_qr && (
        <div style={{ textAlign: 'center', marginTop: 6, fontSize: 28 }}>▣</div>
      )}

      {config.layout.copies > 1 && (
        <div style={{ textAlign: 'center', fontSize: baseSize - 2, color: '#888', marginTop: 4 }}>
          Copies : {config.layout.copies}
        </div>
      )}
    </div>
  )
}

// ── Config Editor ─────────────────────────────────────────────────────────────

function Section({ title, open, onToggle, children }: {
  title: string; open: boolean; onToggle: () => void; children: React.ReactNode
}) {
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-sm font-semibold text-gray-700"
      >
        {title}
        {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
      </button>
      {open && <div className="p-4 space-y-3">{children}</div>}
    </div>
  )
}

function Toggle({ label, checked, onChange }: {
  label: string; checked: boolean; onChange: (v: boolean) => void
}) {
  return (
    <label className="flex items-center gap-3 cursor-pointer select-none">
      <div
        onClick={() => onChange(!checked)}
        className={`w-9 h-5 rounded-full transition-colors flex-shrink-0 ${checked ? 'bg-primary' : 'bg-gray-300'} relative`}
      >
        <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'}`} />
      </div>
      <span className="text-sm text-gray-700">{label}</span>
    </label>
  )
}

function ConfigEditor({
  config, onChange,
}: {
  config: PrintConfig
  onChange: (c: PrintConfig) => void
}) {
  const [sections, setSections] = useState({ header: true, body: false, footer: false, typo: false, layout: false })
  const toggleSection = (k: keyof typeof sections) => setSections(s => ({ ...s, [k]: !s[k] }))

  const set = <K extends keyof PrintConfig>(section: K, patch: Partial<PrintConfig[K]>) =>
    onChange({ ...config, [section]: { ...config[section], ...patch } })

  const setCol = (col: keyof PrintConfig['body']['columns'], v: boolean) =>
    onChange({ ...config, body: { ...config.body, columns: { ...config.body.columns, [col]: v } } })

  return (
    <div className="space-y-3">
      {/* HEADER */}
      <Section title="Entête" open={sections.header} onToggle={() => toggleSection('header')}>
        <Toggle label="Afficher le logo" checked={config.header.show_logo} onChange={v => set('header', { show_logo: v })} />
        <Toggle label="Afficher le nom du magasin" checked={config.header.show_store_name} onChange={v => set('header', { show_store_name: v })} />
        {config.header.show_store_name && (
          <div>
            <label className="block text-xs text-gray-500 mb-1">Nom personnalisé (laissez vide pour le nom du magasin)</label>
            <input
              className="input text-sm"
              placeholder="ex: Baobab Distribution SARL"
              value={config.header.store_name_override}
              onChange={e => set('header', { store_name_override: e.target.value })}
            />
          </div>
        )}
        <div>
          <label className="block text-xs text-gray-500 mb-1">Slogan / message d'accueil</label>
          <input className="input text-sm" placeholder="ex: Toujours au meilleur prix !"
            value={config.header.slogan} onChange={e => set('header', { slogan: e.target.value })} />
        </div>
        <Toggle label="Afficher l'adresse" checked={config.header.show_address} onChange={v => set('header', { show_address: v })} />
        <Toggle label="Afficher le téléphone" checked={config.header.show_phone} onChange={v => set('header', { show_phone: v })} />
        <Toggle label="Afficher l'email" checked={config.header.show_email} onChange={v => set('header', { show_email: v })} />
        <Toggle label="Afficher le NINEA" checked={config.header.show_ninea} onChange={v => set('header', { show_ninea: v })} />
        <Toggle label="Afficher le RC" checked={config.header.show_rc} onChange={v => set('header', { show_rc: v })} />
      </Section>

      {/* BODY */}
      <Section title="Contenu — Colonnes & détails" open={sections.body} onToggle={() => toggleSection('body')}>
        <p className="text-xs text-gray-500 font-medium">Colonnes du tableau :</p>
        <div className="grid grid-cols-2 gap-2">
          {([
            ['ref', 'Référence'], ['name', 'Désignation'], ['qty', 'Quantité'],
            ['unit_price', 'Prix unitaire'], ['discount', 'Remise'], ['total', 'Total ligne'],
          ] as [keyof PrintConfig['body']['columns'], string][]).map(([col, label]) => (
            <Toggle key={col} label={label} checked={config.body.columns[col]}
              onChange={v => setCol(col, v)} />
          ))}
        </div>
        <hr className="border-gray-100" />
        <Toggle label="Détail TVA" checked={config.body.show_vat_detail} onChange={v => set('body', { show_vat_detail: v })} />
        <Toggle label="N° de lot" checked={config.body.show_lot} onChange={v => set('body', { show_lot: v })} />
        <Toggle label="Nom du caissier" checked={config.body.show_cashier} onChange={v => set('body', { show_cashier: v })} />
        <Toggle label="Nom du client" checked={config.body.show_client} onChange={v => set('body', { show_client: v })} />
        <Toggle label="Mode de paiement" checked={config.body.show_payment_method} onChange={v => set('body', { show_payment_method: v })} />
      </Section>

      {/* FOOTER */}
      <Section title="Pied de page" open={sections.footer} onToggle={() => toggleSection('footer')}>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Message de remerciement</label>
          <input className="input text-sm" placeholder="ex: Merci pour votre achat !"
            value={config.footer.message} onChange={e => set('footer', { message: e.target.value })} />
        </div>
        <Toggle label="Afficher la politique de retour" checked={config.footer.show_return_policy}
          onChange={v => set('footer', { show_return_policy: v })} />
        {config.footer.show_return_policy && (
          <textarea className="input text-sm resize-none" rows={2}
            placeholder="ex: Échange dans les 7 jours..."
            value={config.footer.return_policy}
            onChange={e => set('footer', { return_policy: e.target.value })} />
        )}
        <Toggle label="Afficher un QR code" checked={config.footer.show_qr}
          onChange={v => set('footer', { show_qr: v })} />
        {config.footer.show_qr && (
          <div>
            <label className="block text-xs text-gray-500 mb-1">Contenu du QR code (URL ou texte)</label>
            <input className="input text-sm" placeholder="https://mon-magasin.sn"
              value={config.footer.qr_content} onChange={e => set('footer', { qr_content: e.target.value })} />
          </div>
        )}
      </Section>

      {/* TYPOGRAPHY */}
      <Section title="Typographie" open={sections.typo} onToggle={() => toggleSection('typo')}>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Police</label>
          <select className="input text-sm"
            value={config.typography.font}
            onChange={e => set('typography', { font: e.target.value as PrintConfig['typography']['font'] })}>
            <option value="courier">Courier (thermique)</option>
            <option value="arial">Arial (moderne)</option>
            <option value="helvetica">Helvetica (neutre)</option>
            <option value="times">Times New Roman (classique)</option>
          </select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Taille de base (pt)</label>
            <input type="number" min={8} max={16} className="input text-sm"
              value={config.typography.base_size}
              onChange={e => set('typography', { base_size: Number(e.target.value) })} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Taille du titre (pt)</label>
            <input type="number" min={10} max={24} className="input text-sm"
              value={config.typography.title_size}
              onChange={e => set('typography', { title_size: Number(e.target.value) })} />
          </div>
        </div>
      </Section>

      {/* LAYOUT */}
      <Section title="Mise en page" open={sections.layout} onToggle={() => toggleSection('layout')}>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Format papier</label>
          <select className="input text-sm"
            value={config.layout.paper_format}
            onChange={e => set('layout', { paper_format: e.target.value as PrintConfig['layout']['paper_format'] })}>
            <option value="58mm">58 mm (thermique petit)</option>
            <option value="80mm">80 mm (thermique standard)</option>
            <option value="a5">A5 (demi-feuille)</option>
            <option value="a4">A4 (feuille entière)</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Nombre de copies par défaut</label>
          <input type="number" min={1} max={5} className="input text-sm"
            value={config.layout.copies}
            onChange={e => set('layout', { copies: Number(e.target.value) })} />
        </div>
        <Toggle label="Afficher les séparateurs" checked={config.layout.show_separator}
          onChange={v => set('layout', { show_separator: v })} />
      </Section>
    </div>
  )
}

// ── Template Form Modal ───────────────────────────────────────────────────────

function TemplateModal({
  template,
  docType,
  onClose,
}: {
  template?: PrintTemplate
  docType: DocType
  onClose: () => void
}) {
  const qc = useQueryClient()
  const isEdit = !!template
  const [name, setName] = useState(template?.name ?? '')
  const [isDefault, setIsDefault] = useState(template?.is_default ?? false)
  const [config, setConfig] = useState<PrintConfig>(template?.config ?? defaultConfig())
  const [showPreview, setShowPreview] = useState(false)

  const docLabel = DOC_TYPES.find(d => d.type === docType)?.label ?? docType

  const save = useMutation({
    mutationFn: (data: object) =>
      template
        ? api.put(`/print-templates/${template.id}`, data).then(r => r.data)
        : api.post('/print-templates', data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['print-templates'] })
      toast.success(template ? 'Modèle mis à jour' : 'Modèle créé')
      onClose()
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Erreur'),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/50 overflow-y-auto">
      <div className={`bg-white rounded-2xl shadow-2xl w-full ${showPreview ? 'max-w-5xl' : 'max-w-xl'} my-4`}>
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white rounded-t-2xl z-10">
          <div className="flex items-center gap-2">
            <Settings2 size={20} className="text-primary" />
            <div>
              <h2 className="font-semibold text-gray-800">
                {isEdit ? 'Modifier' : 'Nouveau modèle'} — {docLabel}
              </h2>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowPreview(p => !p)}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                showPreview ? 'bg-primary/10 border-primary/30 text-primary' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Eye size={13} /> Aperçu
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className={`flex ${showPreview ? 'gap-0' : ''}`}>
          {/* Form */}
          <div className={`p-5 space-y-4 ${showPreview ? 'w-1/2 border-r overflow-y-auto max-h-[80vh]' : 'w-full'}`}>
            {/* Name */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Nom du modèle *</label>
              <input
                className="input text-sm"
                placeholder="ex: Ticket standard 80mm"
                value={name}
                onChange={e => setName(e.target.value)}
              />
            </div>

            {/* Default */}
            <Toggle
              label="Définir comme modèle par défaut pour ce type"
              checked={isDefault}
              onChange={setIsDefault}
            />

            {/* Config */}
            <ConfigEditor config={config} onChange={setConfig} />
          </div>

          {/* Preview */}
          {showPreview && (
            <div className="w-1/2 p-5 bg-gray-50 overflow-y-auto max-h-[80vh]">
              <p className="text-xs font-medium text-gray-500 mb-3 flex items-center gap-1.5">
                <Eye size={12} /> Aperçu en temps réel
              </p>
              <div className="overflow-x-auto">
                <ReceiptPreview config={config} storeName={name || 'MON MAGASIN'} />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-5 border-t bg-white rounded-b-2xl">
          <button onClick={onClose}
            className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">
            Annuler
          </button>
          <button
            disabled={!name.trim() || save.isPending}
            onClick={() => save.mutate({ name, document_type: docType, config, is_default: isDefault })}
            className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50"
          >
            {save.isPending ? 'Enregistrement…' : isEdit ? 'Mettre à jour' : 'Créer le modèle'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Template Card ─────────────────────────────────────────────────────────────

function TemplateCard({ tpl, onEdit, onDelete, onSetDefault }: {
  tpl: PrintTemplate
  onEdit: () => void
  onDelete: () => void
  onSetDefault: () => void
}) {
  return (
    <div className={`bg-white border rounded-xl p-4 flex items-center justify-between gap-3 ${
      tpl.is_default ? 'border-primary/40 bg-primary/5' : 'border-gray-200'
    }`}>
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
          <Printer size={18} className={tpl.is_default ? 'text-primary' : 'text-gray-400'} />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-gray-900">{tpl.name}</p>
            {tpl.is_default && (
              <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
                Par défaut
              </span>
            )}
            {!tpl.is_active && (
              <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                Inactif
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500">
            Police : {tpl.config.typography.font} · {tpl.config.layout.paper_format} · {tpl.config.layout.copies} copie{tpl.config.layout.copies > 1 ? 's' : ''}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1 flex-shrink-0">
        {!tpl.is_default && (
          <button onClick={onSetDefault}
            className="p-1.5 text-gray-400 hover:text-primary hover:bg-primary/5 rounded-lg transition-colors"
            title="Définir par défaut">
            <Star size={14} />
          </button>
        )}
        <button onClick={onEdit}
          className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
          <Pencil size={14} />
        </button>
        {!tpl.is_default && (
          <button onClick={onDelete}
            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function PrintTemplatesPage() {
  const qc = useQueryClient()
  const confirm = useConfirm()
  const [modal, setModal] = useState<{ tpl?: PrintTemplate; docType: DocType } | null>(null)
  const [activeTab, setActiveTab] = useState<DocType>('receipt')

  const { data: templates = [], isLoading } = useQuery<PrintTemplate[]>({
    queryKey: ['print-templates'],
    queryFn: () => api.get('/print-templates').then(r => r.data),
  })

  const setDefault = useMutation({
    mutationFn: (tpl: PrintTemplate) =>
      api.put(`/print-templates/${tpl.id}`, { is_default: true }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['print-templates'] })
      toast.success('Modèle défini par défaut')
    },
  })

  const remove = useMutation({
    mutationFn: (tpl: PrintTemplate) => api.delete(`/print-templates/${tpl.id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['print-templates'] })
      toast.success('Modèle supprimé')
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Erreur'),
  })

  const tabTemplates = templates.filter(t => t.document_type === activeTab)
  const activeDocType = DOC_TYPES.find(d => d.type === activeTab)!

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Printer size={22} className="text-primary" /> Modèles d'impression
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Personnalisez la mise en page de chaque type de document
          </p>
        </div>
        <button
          onClick={() => setModal({ docType: activeTab })}
          className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-primary/90"
        >
          <Plus size={16} /> Nouveau modèle
        </button>
      </div>

      {/* Doc type tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {DOC_TYPES.map(dt => (
          <button
            key={dt.type}
            onClick={() => setActiveTab(dt.type)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all flex-shrink-0 ${
              activeTab === dt.type
                ? 'bg-primary text-white shadow-sm'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            <span>{dt.icon}</span> {dt.label}
            {templates.filter(t => t.document_type === dt.type).length > 0 && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                activeTab === dt.type ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'
              }`}>
                {templates.filter(t => t.document_type === dt.type).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Info panel */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-700">
        <p className="font-medium flex items-center gap-2">
          <span>{activeDocType.icon}</span> {activeDocType.label} — {activeDocType.desc}
        </p>
        <p className="text-xs text-blue-600 mt-1">
          Le modèle <strong>par défaut</strong> est utilisé automatiquement lors de l'impression.
          Vous pouvez créer plusieurs variantes (ex: ticket promotionnel, facture pro forma…).
        </p>
      </div>

      {/* Templates list */}
      {isLoading ? (
        <div className="flex items-center justify-center h-32">
          <div className="w-7 h-7 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : tabTemplates.length === 0 ? (
        <div className="text-center py-14 bg-white rounded-2xl border border-dashed border-gray-200">
          <Printer size={40} className="mx-auto mb-3 text-gray-200" />
          <p className="text-gray-500 font-medium">Aucun modèle pour ce type</p>
          <p className="text-xs text-gray-400 mt-1">
            Sans modèle configuré, le système utilise les valeurs par défaut intégrées
          </p>
          <button
            onClick={() => setModal({ docType: activeTab })}
            className="mt-4 bg-primary text-white px-4 py-2 rounded-xl text-sm hover:bg-primary/90"
          >
            <Plus size={14} className="inline mr-1" /> Créer un modèle
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {tabTemplates
            .sort((a, b) => (b.is_default ? 1 : 0) - (a.is_default ? 1 : 0))
            .map(tpl => (
              <TemplateCard
                key={tpl.id}
                tpl={tpl}
                onEdit={() => setModal({ tpl, docType: tpl.document_type })}
                onDelete={async () => { if (await confirm(`Supprimer "${tpl.name}" ?`, { danger: true })) remove.mutate(tpl) }}
                onSetDefault={() => setDefault.mutate(tpl)}
              />
            ))}
        </div>
      )}

      {/* Info box */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
        <p className="text-xs font-semibold text-gray-600 mb-2 flex items-center gap-1.5">
          <CheckCircle size={13} className="text-green-500" /> Éléments configurables
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs text-gray-500">
          {[
            '✓ Logo de l\'entreprise', '✓ Nom & coordonnées', '✓ Slogan personnalisé',
            '✓ Colonnes du tableau', '✓ Détail TVA', '✓ Mode de paiement',
            '✓ Message de remerciement', '✓ Politique de retour', '✓ QR code',
            '✓ Police & taille', '✓ Format papier', '✓ Nombre de copies',
          ].map(item => <span key={item}>{item}</span>)}
        </div>
      </div>

      {/* Modal */}
      {modal && (
        <TemplateModal
          template={modal.tpl}
          docType={modal.docType}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}
