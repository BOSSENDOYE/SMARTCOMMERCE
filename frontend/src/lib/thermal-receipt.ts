/**
 * Générateurs de tickets ESC/POS pour SmartCommerce
 * Ticket de caisse (POS) + Facture/Devis
 */

import { EscPosBuilder, fmtAmount, fmtQty, type PaperWidth } from './escpos'

export interface ThermalConfig {
  paperWidth: PaperWidth
  autoCut: boolean
  openCashDrawer: boolean
}

export const DEFAULT_THERMAL_CONFIG: ThermalConfig = {
  paperWidth: 80,
  autoCut: true,
  openCashDrawer: false,
}

// ── Ticket de caisse POS ─────────────────────────────────────────────────────

export interface ReceiptData {
  reference: string
  created_at: string
  store?: { name?: string; address?: string; phone?: string; ninea?: string }
  user?: { name?: string }
  client?: { name?: string; phone?: string }
  items: {
    description?: string
    name?: string
    qty: number
    unit_price_ttc: number
    discount_pct?: number
  }[]
  payments: { payment_method: string; amount: number }[]
  subtotal_ht: number
  vat_amount: number
  discount_amount: number
  total_ttc: number
  paid_amount: number
  change_amount: number
  loyalty_points_earned?: number
}

const PAYMENT_LABELS: Record<string, string> = {
  cash:          'Espèces',
  mobile_money:  'Mobile Money',
  wave:          'Wave',
  orange_money:  'Orange Money',
  free_money:    'Free Money',
  card:          'Carte bancaire',
  credit:        'Crédit client',
}

export function buildPosReceipt(data: ReceiptData, cfg: ThermalConfig): Uint8Array {
  const p = new EscPosBuilder(cfg.paperWidth)
  const now = new Date(data.created_at)
  const dateStr = now.toLocaleDateString('fr-SN')
  const timeStr = now.toLocaleTimeString('fr-SN', { hour: '2-digit', minute: '2-digit' })

  // Ouvrir tiroir-caisse avant ticket si activé
  if (cfg.openCashDrawer) p.cashDrawer()

  // ── En-tête magasin ────────────────────────────────────────────────────────
  p.align('center')
  p.size('big').bold(true)
  p.centerLine(data.store?.name ?? 'SmartCommerce')
  p.size('normal').bold(false)

  if (data.store?.address) p.centerLine(data.store.address)
  if (data.store?.phone)   p.centerLine('Tel: ' + data.store.phone)
  if (data.store?.ninea)   p.centerLine('NINEA: ' + data.store.ninea)
  p.lf()

  // ── Infos ticket ──────────────────────────────────────────────────────────
  p.align('left')
  p.separator()
  p.twoCol('Ticket:', data.reference)
  p.twoCol('Date:', `${dateStr} ${timeStr}`)
  if (data.user?.name) p.twoCol('Caissier:', data.user.name)
  if (data.client?.name) p.twoCol('Client:', data.client.name)
  p.separator()

  // ── Lignes articles ───────────────────────────────────────────────────────
  for (const item of data.items) {
    const label = item.description ?? item.name ?? '—'
    const lineTotal = item.qty * item.unit_price_ttc * (1 - (item.discount_pct ?? 0) / 100)

    // Nom du produit (peut dépasser → retour à la ligne)
    const threshold = cfg.paperWidth === 80 ? 38 : 26
    if (label.length > threshold) {
      p.line(label)
      p.threeCol('', `x${fmtQty(item.qty)}`, fmtAmount(lineTotal))
    } else {
      p.threeCol(label, `x${fmtQty(item.qty)}`, fmtAmount(lineTotal))
    }

    if (item.discount_pct && item.discount_pct > 0) {
      p.align('right').line(`Remise -${item.discount_pct}%`).align('left')
    }
  }

  p.separator()

  // ── Totaux ────────────────────────────────────────────────────────────────
  if (data.discount_amount > 0) {
    p.twoCol('Remises:', '-' + fmtAmount(data.discount_amount))
  }
  p.twoCol('Sous-total HT:', fmtAmount(data.subtotal_ht))
  p.twoCol('TVA (18%):', fmtAmount(data.vat_amount))

  p.separator()
  p.bold(true).size('tall')
  p.twoCol('TOTAL TTC:', fmtAmount(data.total_ttc))
  p.size('normal').bold(false)
  p.separator()

  // ── Paiements ─────────────────────────────────────────────────────────────
  for (const pay of data.payments) {
    const label = PAYMENT_LABELS[pay.payment_method] ?? pay.payment_method
    p.twoCol(label + ':', fmtAmount(pay.amount))
  }

  if (data.change_amount > 0) {
    p.bold(true)
    p.twoCol('MONNAIE:', fmtAmount(data.change_amount))
    p.bold(false)
  }

  if (data.loyalty_points_earned && data.loyalty_points_earned > 0) {
    p.separator('-')
    p.centerLine(`+${data.loyalty_points_earned} pts fidelite`)
  }

  // ── Pied de page ──────────────────────────────────────────────────────────
  p.separator('=')
  p.align('center')
  p.centerLine('Merci de votre visite !')
  p.centerLine('A bientot chez ' + (data.store?.name ?? 'nous'))
  p.centerLine('Baobab SmartCommerce')
  p.lf(2)

  if (cfg.autoCut) p.cut()

  return p.buffer
}

// ── Facture / Devis (format A6 réduit) ───────────────────────────────────────

export interface InvoicePrintData {
  reference: string
  type: 'invoice' | 'quote'
  issue_date: string
  due_date?: string
  valid_until?: string
  object?: string
  store?: { name?: string; address?: string; phone?: string; ninea?: string }
  client?: { name?: string; phone?: string; email?: string }
  items: {
    description: string
    quantity: number
    unit: string
    unit_price: number
    discount_percent: number
    vat_rate: number
    total_ttc: number
  }[]
  subtotal_ht: number
  vat_amount: number
  discount_amount: number
  total_ttc: number
  paid_amount?: number
  notes?: string
  terms?: string
}

export function buildInvoiceReceipt(data: InvoicePrintData, cfg: ThermalConfig): Uint8Array {
  const p = new EscPosBuilder(cfg.paperWidth)
  const typeLabel = data.type === 'invoice' ? 'FACTURE' : 'DEVIS'

  // ── En-tête ───────────────────────────────────────────────────────────────
  p.align('center')
  p.size('big').bold(true)
  p.centerLine(data.store?.name ?? 'SmartCommerce')
  p.size('normal').bold(false)
  if (data.store?.address) p.centerLine(data.store.address)
  if (data.store?.phone)   p.centerLine('Tel: ' + data.store.phone)
  if (data.store?.ninea)   p.centerLine('NINEA: ' + data.store.ninea)
  p.lf()

  p.separator('=')
  p.align('center').bold(true).size('tall')
  p.centerLine(typeLabel)
  p.size('normal').bold(false)
  p.centerLine(data.reference)
  p.separator('=')

  // ── Infos document ────────────────────────────────────────────────────────
  p.align('left')
  p.twoCol("Date d'emission:", new Date(data.issue_date).toLocaleDateString('fr-SN'))
  if (data.due_date)    p.twoCol('Echeance:', new Date(data.due_date).toLocaleDateString('fr-SN'))
  if (data.valid_until) p.twoCol('Valide jusqu\'au:', new Date(data.valid_until).toLocaleDateString('fr-SN'))
  if (data.object)      p.twoCol('Objet:', data.object.slice(0, 20))

  // ── Client ────────────────────────────────────────────────────────────────
  if (data.client) {
    p.separator('-')
    p.bold(true).line('DESTINATAIRE').bold(false)
    p.line(data.client.name ?? '')
    if (data.client.phone) p.line('Tel: ' + data.client.phone)
    if (data.client.email) p.line(data.client.email)
  }

  // ── Lignes ────────────────────────────────────────────────────────────────
  p.separator()
  p.bold(true)
  p.twoCol('DESIGNATION', 'MONTANT TTC')
  p.bold(false)
  p.separator('-')

  for (const it of data.items) {
    // Ligne description
    p.line(it.description.slice(0, cfg.paperWidth === 80 ? 46 : 30))
    // Détail qté × prix
    const detail = `${fmtQty(it.quantity)} ${it.unit} x ${fmtAmount(it.unit_price)} HT`
    p.twoCol('  ' + detail.slice(0, cfg.paperWidth === 80 ? 36 : 20), fmtAmount(it.total_ttc))
    if (it.discount_percent > 0) {
      p.align('right').line(`Remise -${it.discount_percent}%`).align('left')
    }
  }

  p.separator()

  // ── Totaux ────────────────────────────────────────────────────────────────
  if (data.discount_amount > 0) {
    p.twoCol('Remises totales:', '-' + fmtAmount(data.discount_amount))
  }
  p.twoCol('Sous-total HT:', fmtAmount(data.subtotal_ht))
  p.twoCol('TVA:', fmtAmount(data.vat_amount))
  p.separator()
  p.bold(true).size('tall')
  p.twoCol('TOTAL TTC:', fmtAmount(data.total_ttc))
  p.size('normal').bold(false)

  // Solde restant si facture partielle
  if (data.paid_amount !== undefined && data.paid_amount < data.total_ttc) {
    p.twoCol('Deja paye:', fmtAmount(data.paid_amount))
    p.bold(true)
    p.twoCol('SOLDE DU:', fmtAmount(data.total_ttc - data.paid_amount))
    p.bold(false)
  }

  // ── Notes / Conditions ────────────────────────────────────────────────────
  if (data.terms) {
    p.separator('-')
    p.bold(true).line('Conditions:').bold(false)
    // Découper les conditions en lignes de cols caractères
    const words = data.terms.split(' ')
    let cur = ''
    for (const w of words) {
      if ((cur + ' ' + w).length > cfg.paperWidth - 2) {
        if (cur) p.line(cur)
        cur = w
      } else {
        cur = cur ? cur + ' ' + w : w
      }
    }
    if (cur) p.line(cur)
  }

  // ── Pied ─────────────────────────────────────────────────────────────────
  p.separator('=')
  p.align('center')
  p.centerLine('Baobab SmartCommerce')
  p.lf(2)

  if (cfg.autoCut) p.cut()

  return p.buffer
}
