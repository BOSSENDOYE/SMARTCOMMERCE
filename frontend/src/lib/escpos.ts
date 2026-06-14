/**
 * ESC/POS command builder — imprimantes thermiques 58mm / 80mm
 * Protocole standard compatible Epson, Star, Bixolon, Xprinter, etc.
 */

// ── Constantes ESC/POS ──────────────────────────────────────────────────────

const ESC = 0x1b
const GS  = 0x1d

export const CMD = {
  INIT:            [ESC, 0x40],             // Réinitialiser
  FEED_N:          (n: number) => [ESC, 0x64, n], // Avancer n lignes
  ALIGN_LEFT:      [ESC, 0x61, 0x00],
  ALIGN_CENTER:    [ESC, 0x61, 0x01],
  ALIGN_RIGHT:     [ESC, 0x61, 0x02],
  BOLD_ON:         [ESC, 0x45, 0x01],
  BOLD_OFF:        [ESC, 0x45, 0x00],
  UNDERLINE_ON:    [ESC, 0x2d, 0x02],
  UNDERLINE_OFF:   [ESC, 0x2d, 0x00],
  SIZE_NORMAL:     [ESC, 0x21, 0x00],
  SIZE_TALL:       [ESC, 0x21, 0x10],       // Double hauteur
  SIZE_WIDE:       [ESC, 0x21, 0x20],       // Double largeur
  SIZE_BIG:        [ESC, 0x21, 0x30],       // Double hauteur + largeur
  CUT_PARTIAL:     [GS, 0x56, 0x41, 0x05], // Coupe partielle (laisse 5mm)
  CUT_FULL:        [GS, 0x56, 0x00],        // Coupe totale
  CASH_DRAWER:     [ESC, 0x70, 0x00, 0x19, 0xff], // Ouvrir tiroir-caisse
  CHARSET_CP858:   [ESC, 0x74, 0x13],       // Latin + €
}

// ── Largeur papier ───────────────────────────────────────────────────────────

export type PaperWidth = 58 | 80

const CHARS_PER_LINE: Record<PaperWidth, number> = {
  58: 32,
  80: 48,
}

// ── Builder ──────────────────────────────────────────────────────────────────

export class EscPosBuilder {
  private bytes: number[] = []
  private readonly cols: number

  constructor(paperWidth: PaperWidth = 80) {
    this.cols = CHARS_PER_LINE[paperWidth]
    this.push(...CMD.INIT)
    this.push(...CMD.CHARSET_CP858)
  }

  // ── Bas-niveau ─────────────────────────────────────────────────────────────

  private push(...bytes: number[]): this {
    this.bytes.push(...bytes)
    return this
  }

  private text(str: string): this {
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i)
      this.bytes.push(c < 256 ? c : 0x3f) // '?' pour char non-ASCII
    }
    return this
  }

  // ── Primitives ─────────────────────────────────────────────────────────────

  align(a: 'left' | 'center' | 'right'): this {
    if (a === 'left')   return this.push(...CMD.ALIGN_LEFT)
    if (a === 'center') return this.push(...CMD.ALIGN_CENTER)
    return this.push(...CMD.ALIGN_RIGHT)
  }

  bold(on: boolean): this {
    return this.push(...(on ? CMD.BOLD_ON : CMD.BOLD_OFF))
  }

  size(s: 'normal' | 'tall' | 'wide' | 'big'): this {
    const m = { normal: CMD.SIZE_NORMAL, tall: CMD.SIZE_TALL, wide: CMD.SIZE_WIDE, big: CMD.SIZE_BIG }
    return this.push(...m[s])
  }

  lf(n = 1): this {
    for (let i = 0; i < n; i++) this.bytes.push(0x0a)
    return this
  }

  feed(n = 3): this {
    return this.push(...CMD.FEED_N(n))
  }

  cut(full = false): this {
    return this.push(...(full ? CMD.CUT_FULL : CMD.CUT_PARTIAL))
  }

  cashDrawer(): this {
    return this.push(...CMD.CASH_DRAWER)
  }

  // ── Helpers texte ─────────────────────────────────────────────────────────

  line(str: string): this {
    return this.text(str).lf()
  }

  separator(char = '-'): this {
    return this.line(char.repeat(this.cols))
  }

  /** Ligne centrée, tronquée si trop longue */
  centerLine(str: string): this {
    const s = str.slice(0, this.cols)
    const pad = Math.max(0, Math.floor((this.cols - s.length) / 2))
    return this.line(' '.repeat(pad) + s)
  }

  /** Deux colonnes gauche/droite sur une même ligne */
  twoCol(left: string, right: string): this {
    const avail = this.cols - right.length
    const l = left.slice(0, Math.max(0, avail - 1)).padEnd(avail)
    return this.line(l + right)
  }

  /** Trois colonnes : label | qté | montant */
  threeCol(label: string, mid: string, right: string): this {
    const midW   = mid.length + 2
    const rightW = right.length
    const leftW  = this.cols - midW - rightW
    const l = label.slice(0, leftW).padEnd(leftW)
    const m = mid.padStart(midW - 1).padEnd(midW)
    return this.line(l + m + right)
  }

  // ── Utilitaires ────────────────────────────────────────────────────────────

  get buffer(): Uint8Array {
    return new Uint8Array(this.bytes)
  }
}

// ── Formatage nombres ────────────────────────────────────────────────────────

export function fmtAmount(n: number): string {
  return Math.round(n).toLocaleString('fr-SN') + ' F'
}

export function fmtQty(n: number): string {
  const v = Number(n)
  return v % 1 === 0 ? String(v) : v.toFixed(2)
}
