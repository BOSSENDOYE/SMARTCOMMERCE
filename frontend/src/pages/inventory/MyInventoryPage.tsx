import { useState, useRef, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import api from '../../lib/api'
import { formatNumber } from '../../lib/format'
import {
  ClipboardList, CheckCircle2, Loader2, X, Search,
  Camera, Keyboard, AlertTriangle, Package, ChevronDown,
  ChevronUp, QrCode, RefreshCw,
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

interface ActiveSession {
  id: number
  name: string
  status: string
  sales_blocked: boolean
}

interface SheetItem {
  id: number
  product_id: number
  counted_qty: string | number | null
  theoretical_qty: string | number
  variance_value: string | number | null
  product: {
    id: number
    name: string
    internal_code: string
    barcode?: string
    unit?: { abbreviation: string }
  }
  countedBy?: { name: string }
}

interface Sheet {
  id: number
  name: string
  type: 'section' | 'free'
  status: 'draft' | 'counting' | 'validated' | 'cancelled'
  section?: { id: number; name: string; color: string; icon: string }
  items: SheetItem[]
  items_count: number
  counted_count: number
}

interface MyData {
  session: ActiveSession | null
  sheets: Sheet[]
}

// ─── Barcode scanner hook (camera) ───────────────────────────────────────────

function useBarcodeScanner(onDetect: (barcode: string) => void) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [active, setActive] = useState(false)
  const [error, setError]   = useState<string | null>(null)
  const streamRef           = useRef<MediaStream | null>(null)
  const rafRef              = useRef<number>(0)

  const stop = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    setActive(false)
  }, [])

  const start = useCallback(async () => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setActive(true)

      // BarcodeDetector API (Chrome 83+, Safari 17.4+)
      if ('BarcodeDetector' in window) {
        // @ts-ignore
        const detector = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'code_128', 'qr_code', 'upc_a', 'upc_e', 'code_39'] })
        const scan = async () => {
          if (!videoRef.current || videoRef.current.readyState < 2) {
            rafRef.current = requestAnimationFrame(scan)
            return
          }
          try {
            // @ts-ignore
            const barcodes = await detector.detect(videoRef.current)
            if (barcodes.length > 0) {
              onDetect(barcodes[0].rawValue)
              return
            }
          } catch {}
          rafRef.current = requestAnimationFrame(scan)
        }
        rafRef.current = requestAnimationFrame(scan)
      } else {
        setError('Scanner non supporté sur ce navigateur. Utilisez Chrome ou Safari 17.4+.')
      }
    } catch (e: any) {
      setError("Accès à la caméra refusé. Autorisez l'accès dans les paramètres.")
      setActive(false)
    }
  }, [onDetect])

  useEffect(() => () => stop(), [stop])

  return { videoRef, active, error, start, stop }
}

// ─── Item Row ─────────────────────────────────────────────────────────────────

function ItemRow({
  item, sessionId, sheetId, onUpdated,
}: {
  item: SheetItem
  sessionId: number
  sheetId: number
  onUpdated: () => void
}) {
  const [val, setVal]     = useState(item.counted_qty !== null ? String(item.counted_qty) : '')
  const [editing, setEditing] = useState(false)
  const inputRef          = useRef<HTMLInputElement>(null)
  const qc                = useQueryClient()

  const counted = item.counted_qty !== null && item.counted_qty !== undefined

  const mutation = useMutation({
    mutationFn: (qty: number) =>
      api.post(`/inventory-sessions/${sessionId}/sheets/${sheetId}/items`, {
        product_id: item.product_id,
        counted_qty: qty,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-inventory'] })
      setEditing(false)
      onUpdated()
    },
    onError: (err: any) => toast.error(err?.response?.data?.message ?? 'Erreur'),
  })

  const commit = () => {
    const n = parseFloat(val)
    if (!isNaN(n) && n >= 0) mutation.mutate(n)
  }

  const theoretical = parseFloat(String(item.theoretical_qty))
  const countedNum  = counted ? parseFloat(String(item.counted_qty)) : null
  const diff        = countedNum !== null ? countedNum - theoretical : null

  return (
    <div className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${counted ? 'border-emerald-200 bg-emerald-50' : 'border-gray-200 bg-white'}`}>
      {/* Status dot */}
      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${counted ? 'bg-emerald-500' : 'bg-gray-300'}`} />

      {/* Product info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 truncate">{item.product.name}</p>
        <p className="text-xs text-gray-500">{item.product.internal_code}</p>
      </div>

      {/* Theoretical */}
      <div className="text-right flex-shrink-0">
        <p className="text-xs text-gray-400">Théorique</p>
        <p className="text-xs font-medium text-gray-600">
          {formatNumber(theoretical, 3)} {item.product.unit?.abbreviation ?? ''}
        </p>
      </div>

      {/* Count input */}
      <div className="flex-shrink-0">
        {editing ? (
          <div className="flex items-center gap-1">
            <input
              ref={inputRef}
              type="number" min="0" step="0.001"
              value={val}
              onChange={e => setVal(e.target.value)}
              onBlur={commit}
              onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
              className="w-20 text-right border border-primary-400 rounded-lg px-2 py-1.5 text-sm font-bold bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
              autoFocus
            />
            {mutation.isPending && <Loader2 size={14} className="animate-spin text-primary" />}
          </div>
        ) : (
          <button
            onClick={() => { setEditing(true); setTimeout(() => inputRef.current?.select(), 50) }}
            className={`min-w-[72px] text-right px-3 py-1.5 rounded-lg text-sm font-bold border transition-colors ${
              counted
                ? 'border-emerald-300 text-emerald-700 bg-white hover:bg-emerald-50'
                : 'border-dashed border-gray-300 text-gray-400 hover:border-primary hover:text-primary'
            }`}
          >
            {countedNum !== null
              ? `${formatNumber(countedNum, 3)} ${item.product.unit?.abbreviation ?? ''}`
              : <span className="text-xs italic">Saisir</span>
            }
          </button>
        )}
      </div>

      {/* Variance badge */}
      {diff !== null && (
        <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-md flex-shrink-0 ${
          Math.abs(diff) < 0.001 ? 'bg-gray-100 text-gray-500' :
          diff > 0 ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'
        }`}>
          {diff > 0 ? '+' : ''}{formatNumber(diff, 3)}
        </span>
      )}
    </div>
  )
}

// ─── Sheet Card ───────────────────────────────────────────────────────────────

function SheetCard({
  sheet, sessionId, scannerActive, onScanRequest,
}: {
  sheet: Sheet
  sessionId: number
  scannerActive: boolean
  onScanRequest: (sheetId: number) => void
}) {
  const [expanded, setExpanded] = useState(sheet.status !== 'validated')
  const [search, setSearch]     = useState('')
  const qc                      = useQueryClient()

  const totalItems   = sheet.items.length
  const countedItems = sheet.items.filter(i => i.counted_qty !== null).length
  const progress     = totalItems > 0 ? Math.round((countedItems / totalItems) * 100) : 0

  const filtered = sheet.items.filter(item => {
    if (!search) return true
    const q = search.toLowerCase()
    return item.product.name.toLowerCase().includes(q) ||
      (item.product.internal_code ?? '').toLowerCase().includes(q)
  })

  const validateMutation = useMutation({
    mutationFn: () =>
      api.post(`/inventory-sessions/${sessionId}/sheets/${sheet.id}/validate`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-inventory'] })
      toast.success('Fiche validée !')
    },
    onError: (err: any) => toast.error(err?.response?.data?.message ?? 'Erreur lors de la validation'),
  })

  const statusColor = {
    draft:     'bg-gray-100 text-gray-600',
    counting:  'bg-blue-100 text-blue-700',
    validated: 'bg-emerald-100 text-emerald-700',
    cancelled: 'bg-red-100 text-red-600',
  }[sheet.status] ?? 'bg-gray-100 text-gray-600'

  const statusLabel = {
    draft:     'En attente',
    counting:  'En cours',
    validated: 'Validée',
    cancelled: 'Annulée',
  }[sheet.status] ?? sheet.status

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => setExpanded(v => !v)}
      >
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0`}
          style={{ backgroundColor: sheet.section?.color ? sheet.section.color + '20' : '#f3f4f6' }}>
          <ClipboardList size={16} style={{ color: sheet.section?.color ?? '#6b7280' }} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-bold text-gray-900 truncate">{sheet.name}</p>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusColor}`}>
              {statusLabel}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-xs text-gray-500 flex-shrink-0">
              {countedItems}/{totalItems}
            </span>
          </div>
        </div>

        {expanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
      </div>

      {expanded && sheet.status !== 'validated' && sheet.status !== 'cancelled' && (
        <div className="border-t border-gray-100">
          {/* Toolbar */}
          <div className="flex items-center gap-2 px-4 py-2 bg-gray-50">
            <div className="relative flex-1">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Rechercher..."
                className="w-full pl-7 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <button
              onClick={() => onScanRequest(sheet.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                scannerActive
                  ? 'bg-red-100 text-red-600 hover:bg-red-200'
                  : 'bg-primary-50 text-primary-600 hover:bg-primary-100'
              }`}
            >
              <Camera size={13} />
              {scannerActive ? 'Arrêter' : 'Scanner'}
            </button>
          </div>

          {/* Items list */}
          <div className="px-4 pb-3 space-y-2 max-h-96 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-center text-sm text-gray-400 py-6">Aucun article</p>
            ) : (
              filtered.map(item => (
                <ItemRow
                  key={item.id}
                  item={item}
                  sessionId={sessionId}
                  sheetId={sheet.id}
                  onUpdated={() => {}}
                />
              ))
            )}
          </div>

          {/* Validate button */}
          {countedItems === totalItems && totalItems > 0 && (
            <div className="px-4 pb-4">
              <button
                onClick={() => validateMutation.mutate()}
                disabled={validateMutation.isPending}
                className="w-full btn-primary flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {validateMutation.isPending
                  ? <><Loader2 size={16} className="animate-spin" /> Validation...</>
                  : <><CheckCircle2 size={16} /> Valider cette fiche</>
                }
              </button>
            </div>
          )}
        </div>
      )}

      {expanded && sheet.status === 'validated' && (
        <div className="border-t border-gray-100 px-4 py-4 flex items-center gap-2 text-emerald-600 text-sm">
          <CheckCircle2 size={16} />
          <span className="font-medium">Fiche validée — {countedItems} articles comptés</span>
        </div>
      )}
    </div>
  )
}

// ─── Scanner Overlay ──────────────────────────────────────────────────────────

function ScannerOverlay({
  sessionId, sheetId, onClose, onProductFound,
}: {
  sessionId: number
  sheetId: number
  onClose: () => void
  onProductFound: (item: SheetItem) => void
}) {
  const [manualBarcode, setManualBarcode] = useState('')
  const [searching, setSearching]         = useState(false)
  const [mode, setMode]                   = useState<'camera' | 'manual'>('camera')
  const lastDetected = useRef('')

  const handleBarcode = useCallback(async (barcode: string) => {
    if (barcode === lastDetected.current) return
    lastDetected.current = barcode
    setTimeout(() => { lastDetected.current = '' }, 2000) // debounce 2s

    setSearching(true)
    try {
      const res = await api.get('/products/barcode', { params: { barcode } })
      const product = res.data
      if (product) {
        // Add to sheet with qty 1 (or increment)
        await api.post(`/inventory-sessions/${sessionId}/sheets/${sheetId}/items`, {
          product_id: product.id,
          counted_qty: 1,
        })
        toast.success(`${product.name} — 1 comptée`)
        onProductFound(product)
      } else {
        toast.error('Produit non trouvé pour ce code-barres')
      }
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Erreur lors de la recherche')
    } finally {
      setSearching(false)
    }
  }, [sessionId, sheetId, onProductFound])

  const { videoRef, active, error, start, stop } = useBarcodeScanner(handleBarcode)

  useEffect(() => {
    if (mode === 'camera') start()
    return () => stop()
  }, [mode, start, stop])

  return (
    <div className="fixed inset-0 bg-black/90 z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <div className="flex items-center gap-2">
          <QrCode size={20} />
          <span className="font-semibold">Scanner un produit</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMode(m => m === 'camera' ? 'manual' : 'camera')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 text-sm text-white hover:bg-white/20"
          >
            {mode === 'camera' ? <Keyboard size={14} /> : <Camera size={14} />}
            {mode === 'camera' ? 'Manuel' : 'Caméra'}
          </button>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/10 text-white">
            <X size={20} />
          </button>
        </div>
      </div>

      {mode === 'camera' ? (
        <div className="flex-1 relative">
          <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
          {/* Aiming reticle */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-64 h-40 border-2 border-white/70 rounded-xl relative">
              <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-primary rounded-tl-xl" />
              <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-primary rounded-tr-xl" />
              <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-primary rounded-bl-xl" />
              <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-primary rounded-br-xl" />
              {/* Scanning line */}
              {active && (
                <div className="absolute left-0 right-0 h-0.5 bg-primary/80 animate-[scan_2s_ease-in-out_infinite]" />
              )}
            </div>
          </div>
          {searching && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
              <div className="bg-white rounded-2xl px-6 py-4 flex items-center gap-3">
                <Loader2 size={20} className="animate-spin text-primary" />
                <span className="text-sm font-medium">Recherche...</span>
              </div>
            </div>
          )}
          {error && (
            <div className="absolute bottom-20 left-4 right-4 bg-red-900/80 text-white text-sm rounded-xl px-4 py-3 text-center">
              {error}
            </div>
          )}
          <p className="absolute bottom-8 left-0 right-0 text-center text-white/60 text-sm">
            Pointez la caméra vers le code-barres
          </p>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center px-6 gap-4">
          <Package size={48} className="text-white/30" />
          <p className="text-white text-center">Saisissez ou scannez manuellement le code-barres</p>
          <div className="flex gap-2 w-full max-w-sm">
            <input
              type="text"
              value={manualBarcode}
              onChange={e => setManualBarcode(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && manualBarcode.trim()) { handleBarcode(manualBarcode.trim()); setManualBarcode('') } }}
              placeholder="Code-barres..."
              className="flex-1 px-4 py-3 rounded-xl text-sm border-2 border-white/20 bg-white/10 text-white placeholder-white/40 focus:outline-none focus:border-primary"
              autoFocus
            />
            <button
              onClick={() => { if (manualBarcode.trim()) { handleBarcode(manualBarcode.trim()); setManualBarcode('') } }}
              disabled={searching || !manualBarcode.trim()}
              className="px-4 py-3 rounded-xl bg-primary text-white font-semibold disabled:opacity-50"
            >
              {searching ? <Loader2 size={18} className="animate-spin" /> : 'OK'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MyInventoryPage() {
  const [activeSheetId, setActiveSheetId] = useState<number | null>(null)
  const qc = useQueryClient()

  const { data, isLoading, isError, refetch } = useQuery<MyData>({
    queryKey: ['my-inventory'],
    queryFn: () => api.get('/inventory-sessions/my-sheets').then(r => r.data),
    refetchInterval: 60_000,
  })

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-primary" />
      </div>
    )
  }

  if (isError || !data?.session) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
        <AlertTriangle size={48} className="text-gray-300" />
        <h2 className="text-lg font-semibold text-gray-700">Aucun inventaire actif</h2>
        <p className="text-sm text-gray-500">Vous n'avez pas de fiches d'inventaire en cours.</p>
        <button onClick={() => refetch()} className="btn-secondary flex items-center gap-2">
          <RefreshCw size={14} /> Actualiser
        </button>
      </div>
    )
  }

  const { session, sheets } = data
  const totalSheets    = sheets.length
  const validatedCount = sheets.filter(s => s.status === 'validated').length
  const allDone        = totalSheets > 0 && validatedCount === totalSheets

  return (
    <div className="min-h-screen bg-gray-50 pb-8">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4 sticky top-0 z-10 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <ClipboardList size={18} className="text-primary" />
              Mon inventaire
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">{session.name}</p>
          </div>
          <button onClick={() => refetch()} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400">
            <RefreshCw size={16} />
          </button>
        </div>

        {/* Progress bar */}
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
            <span>{validatedCount}/{totalSheets} fiches validées</span>
            <span>{totalSheets > 0 ? Math.round((validatedCount / totalSheets) * 100) : 0}%</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all"
              style={{ width: `${totalSheets > 0 ? (validatedCount / totalSheets) * 100 : 0}%` }}
            />
          </div>
        </div>

        {/* Sales blocked banner */}
        {session.sales_blocked && (
          <div className="mt-3 flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-medium">
            <AlertTriangle size={13} />
            Les ventes sont bloquées pendant cet inventaire
          </div>
        )}
      </div>

      {/* Content */}
      <div className="px-4 py-4 space-y-3 max-w-lg mx-auto">
        {allDone && (
          <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-2xl">
            <CheckCircle2 size={24} className="text-emerald-500 flex-shrink-0" />
            <div>
              <p className="text-sm font-bold text-emerald-800">Toutes vos fiches sont validées !</p>
              <p className="text-xs text-emerald-600 mt-0.5">
                L'administrateur peut maintenant transmettre l'inventaire au stock.
              </p>
            </div>
          </div>
        )}

        {sheets.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <Package size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">Aucune fiche ne vous est assignée</p>
          </div>
        ) : (
          sheets.map(sheet => (
            <SheetCard
              key={sheet.id}
              sheet={sheet}
              sessionId={session.id}
              scannerActive={activeSheetId === sheet.id}
              onScanRequest={(sheetId) =>
                setActiveSheetId(activeSheetId === sheetId ? null : sheetId)
              }
            />
          ))
        )}
      </div>

      {/* Scanner overlay */}
      {activeSheetId !== null && (
        <ScannerOverlay
          sessionId={session.id}
          sheetId={activeSheetId}
          onClose={() => setActiveSheetId(null)}
          onProductFound={() => {
            qc.invalidateQueries({ queryKey: ['my-inventory'] })
          }}
        />
      )}
    </div>
  )
}
