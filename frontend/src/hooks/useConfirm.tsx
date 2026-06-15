import { createContext, useCallback, useContext, useRef, useState } from 'react'
import { X, AlertTriangle, Trash2, HelpCircle } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ConfirmOptions {
  title?: string
  confirmText?: string
  cancelText?: string
  /** Red confirm button — for destructive actions */
  danger?: boolean
  /** Smaller info icon instead of warning */
  info?: boolean
}

interface ConfirmState {
  open: boolean
  message: string
  options: ConfirmOptions
  resolve: ((value: boolean) => void) | null
}

type ConfirmFn = (message: string, options?: ConfirmOptions) => Promise<boolean>

// ─── Context ─────────────────────────────────────────────────────────────────

const ConfirmContext = createContext<ConfirmFn | null>(null)

// ─── Provider ─────────────────────────────────────────────────────────────────

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ConfirmState>({
    open: false,
    message: '',
    options: {},
    resolve: null,
  })

  const resolveRef = useRef<((value: boolean) => void) | null>(null)

  const confirm: ConfirmFn = useCallback((message, options = {}) => {
    return new Promise<boolean>(resolve => {
      resolveRef.current = resolve
      setState({ open: true, message, options, resolve })
    })
  }, [])

  const handleResponse = useCallback((answer: boolean) => {
    setState(s => ({ ...s, open: false }))
    resolveRef.current?.(answer)
    resolveRef.current = null
  }, [])

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state.open && (
        <ConfirmModal
          message={state.message}
          options={state.options}
          onConfirm={() => handleResponse(true)}
          onCancel={() => handleResponse(false)}
        />
      )}
    </ConfirmContext.Provider>
  )
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm must be used inside ConfirmProvider')
  return ctx
}

// ─── Modal UI ─────────────────────────────────────────────────────────────────

function ConfirmModal({
  message,
  options,
  onConfirm,
  onCancel,
}: {
  message: string
  options: ConfirmOptions
  onConfirm: () => void
  onCancel: () => void
}) {
  const {
    title = options.danger ? 'Confirmation de suppression' : 'Confirmation',
    confirmText = options.danger ? 'Supprimer' : 'Confirmer',
    cancelText = 'Annuler',
    danger = false,
    info = false,
  } = options

  const Icon = danger ? Trash2 : info ? HelpCircle : AlertTriangle
  const iconColor = danger ? 'text-red-500' : info ? 'text-blue-500' : 'text-amber-500'
  const iconBg    = danger ? 'bg-red-50'   : info ? 'bg-blue-50'   : 'bg-amber-50'

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
      onMouseDown={e => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-start gap-3 p-5 pb-3">
          <div className={`flex-shrink-0 w-10 h-10 rounded-full ${iconBg} flex items-center justify-center mt-0.5`}>
            <Icon size={20} className={iconColor} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900 text-base leading-snug">{title}</h3>
            <p className="text-gray-600 text-sm mt-1 leading-relaxed">{message}</p>
          </div>
          <button
            onClick={onCancel}
            className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors -mt-0.5"
          >
            <X size={18} />
          </button>
        </div>

        {/* Actions */}
        <div className="flex gap-2 p-4 pt-2 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            autoFocus
            className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors ${
              danger
                ? 'bg-red-600 hover:bg-red-700 focus:ring-2 focus:ring-red-500 focus:ring-offset-1'
                : 'bg-primary hover:bg-primary/90 focus:ring-2 focus:ring-primary focus:ring-offset-1'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
