export function formatCurrency(amount: number | string | null | undefined): string {
  const n = typeof amount === 'string' ? parseFloat(amount) : (amount ?? 0)
  return new Intl.NumberFormat('fr-SN', {
    style: 'currency',
    currency: 'XOF',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n)
}

export function formatNumber(n: number | string | null | undefined, decimals = 0): string {
  const v = typeof n === 'string' ? parseFloat(n) : (n ?? 0)
  return new Intl.NumberFormat('fr-SN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(v)
}

export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '—'
  return new Intl.DateTimeFormat('fr-SN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(new Date(date))
}

export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return '—'
  return new Intl.DateTimeFormat('fr-SN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(date))
}

export function formatPercent(n: number | null | undefined, decimals = 1): string {
  return `${(n ?? 0).toFixed(decimals)}%`
}

export function classNames(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ')
}

const API_BASE = (import.meta as any).env?.VITE_API_URL ?? 'http://localhost:8000'

/**
 * Converts a backend image path (/storage/...) to a fully qualified URL.
 * Returns null if no path provided.
 */
export function imageUrl(path?: string | null): string | null {
  if (!path) return null
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  return `${API_BASE}${path}`
}

/**
 * Télécharge un PDF depuis le backend (avec authentification Bearer).
 * @param path  - chemin relatif API, ex: '/pdf/invoices/42'
 * @param filename - nom du fichier téléchargé
 * @param params   - query params optionnels
 */
async function fetchPdfBlob(
  path: string,
  params?: Record<string, string>,
): Promise<Blob> {
  const token = localStorage.getItem('sc_token')
  const url = new URL(`${API_BASE}/api/v1${path}`)
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  }

  const headers: Record<string, string> = { 'Accept': 'application/pdf' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  try {
    const scActiveStore = localStorage.getItem('sc-active-store')
    if (scActiveStore) {
      const { state } = JSON.parse(scActiveStore)
      if (state?.activeStore?.id) headers['X-Store-Id'] = String(state.activeStore.id)
    }
  } catch { /* ignore */ }

  const res = await fetch(url.toString(), { headers })
  if (!res.ok) throw new Error(`Erreur PDF (${res.status})`)
  return res.blob()
}

/** Télécharge un PDF depuis le backend. */
export async function downloadPdf(
  path: string,
  filename: string,
  params?: Record<string, string>,
): Promise<void> {
  const blob = await fetchPdfBlob(path, params)
  const blobUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = blobUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(blobUrl)
}

/** Ouvre un PDF dans un nouvel onglet pour visualisation et impression. */
export async function openPdf(
  path: string,
  params?: Record<string, string>,
): Promise<void> {
  const blob = await fetchPdfBlob(path, params)
  const blobUrl = URL.createObjectURL(blob)
  const win = window.open(blobUrl, '_blank')
  if (win) {
    win.addEventListener('load', () => URL.revokeObjectURL(blobUrl), { once: true })
  }
}
