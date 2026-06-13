import { useState, useEffect } from 'react'
import {
  Banknote, Smartphone, CreditCard, Wallet, ShoppingBag,
  Check, TrendingDown, X, Zap,
} from 'lucide-react'
import { formatCurrency } from '../lib/format'

// ─── Method config ────────────────────────────────────────────────────────────

export interface PaymentEntry {
  method: string
  amount: number
}

interface MethodConfig {
  key: string
  label: string
  shortLabel: string
  icon: React.ReactNode
  gradient: string
  ring: string
  badge: string
  textColor: string
}

const ALL_METHODS: MethodConfig[] = [
  {
    key: 'cash', label: 'Espèces', shortLabel: 'Cash',
    icon: <Banknote size={22} />,
    gradient: 'from-emerald-500 to-green-600',
    ring: 'ring-emerald-400',
    badge: 'bg-emerald-100 text-emerald-700',
    textColor: 'text-emerald-600',
  },
  {
    key: 'wave', label: 'Wave', shortLabel: 'Wave',
    icon: <Smartphone size={22} />,
    gradient: 'from-sky-500 to-blue-600',
    ring: 'ring-sky-400',
    badge: 'bg-sky-100 text-sky-700',
    textColor: 'text-sky-600',
  },
  {
    key: 'orange_money', label: 'Orange Money', shortLabel: 'Orange',
    icon: <Smartphone size={22} />,
    gradient: 'from-orange-500 to-amber-600',
    ring: 'ring-orange-400',
    badge: 'bg-orange-100 text-orange-700',
    textColor: 'text-orange-600',
  },
  {
    key: 'free_money', label: 'Free Money', shortLabel: 'Free',
    icon: <Smartphone size={22} />,
    gradient: 'from-red-500 to-rose-600',
    ring: 'ring-red-400',
    badge: 'bg-red-100 text-red-700',
    textColor: 'text-red-600',
  },
  {
    key: 'card', label: 'Carte bancaire', shortLabel: 'Carte',
    icon: <CreditCard size={22} />,
    gradient: 'from-violet-500 to-purple-600',
    ring: 'ring-violet-400',
    badge: 'bg-violet-100 text-violet-700',
    textColor: 'text-violet-600',
  },
  {
    key: 'account', label: 'Compte client', shortLabel: 'Compte',
    icon: <Wallet size={22} />,
    gradient: 'from-indigo-500 to-blue-700',
    ring: 'ring-indigo-400',
    badge: 'bg-indigo-100 text-indigo-700',
    textColor: 'text-indigo-600',
  },
  {
    key: 'credit', label: 'Crédit client', shortLabel: 'Crédit',
    icon: <ShoppingBag size={22} />,
    gradient: 'from-amber-500 to-yellow-600',
    ring: 'ring-amber-400',
    badge: 'bg-amber-100 text-amber-700',
    textColor: 'text-amber-600',
  },
]

// ─── Quick amount chips ───────────────────────────────────────────────────────

const QUICK_AMOUNTS = [500, 1000, 2000, 5000, 10000, 20000, 50000]

function quickChips(total: number, current: number) {
  // Show exact + round-up options that make sense
  const chips: number[] = []
  // Exact
  if (!chips.includes(total)) chips.push(total)
  // Round up to next 500/1000/5000/10000
  const roundUps = [500, 1000, 2000, 5000, 10000, 20000, 50000]
  for (const r of roundUps) {
    const rounded = Math.ceil(total / r) * r
    if (rounded !== total && rounded > total && chips.length < 5) {
      if (!chips.includes(rounded)) chips.push(rounded)
    }
  }
  // Add some standard amounts bigger than what's been entered
  for (const a of QUICK_AMOUNTS) {
    if (a >= total && chips.length < 5 && !chips.includes(a)) chips.push(a)
  }
  return chips.slice(0, 5)
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface PaymentPanelProps {
  total: number
  /** If provided, show account method and display balance */
  clientAccountBalance?: number
  clientName?: string
  /** Controlled value */
  value: PaymentEntry[]
  onChange: (entries: PaymentEntry[]) => void
  /** When true, show compact layout (for inline use in SalesPage) */
  compact?: boolean
  /** Don't show "credit" method (some contexts don't need it) */
  hideCredit?: boolean
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PaymentPanel({
  total,
  clientAccountBalance,
  clientName,
  value,
  onChange,
  compact = false,
  hideCredit = false,
}: PaymentPanelProps) {

  const hasClient = clientAccountBalance !== undefined

  const methods = ALL_METHODS.filter(m => {
    if (m.key === 'account' && !hasClient) return false
    if (m.key === 'credit' && hideCredit) return false
    return true
  })

  const totalPaid = value.reduce((s, p) => s + (p.amount || 0), 0)
  const remaining = Math.max(0, total - totalPaid)
  const change    = Math.max(0, totalPaid - total)
  const progress  = Math.min(100, (totalPaid / total) * 100)
  const isValid   = totalPaid >= total || value.some(p => p.method === 'credit')

  // Select a method (toggle)
  const toggleMethod = (key: string) => {
    const exists = value.find(p => p.method === key)
    if (exists) {
      // Remove
      onChange(value.filter(p => p.method !== key))
    } else {
      // Add with remaining amount
      const rem = Math.max(0, total - value.filter(p => p.method !== 'credit').reduce((s, p) => s + p.amount, 0))
      if (key === 'credit') {
        // credit = remaining total (no manual amount)
        onChange([...value, { method: 'credit', amount: remaining > 0 ? remaining : total }])
      } else if (key === 'account' && clientAccountBalance !== undefined) {
        const autoAmt = Math.min(Math.max(clientAccountBalance, 0), rem)
        onChange([...value, { method: 'account', amount: autoAmt }])
      } else {
        onChange([...value, { method: key, amount: rem }])
      }
    }
  }

  const updateAmount = (key: string, amount: number) => {
    onChange(value.map(p => p.method === key ? { ...p, amount } : p))
  }

  const isSelected = (key: string) => value.some(p => p.method === key)

  // Cols: 3 when < 6 methods, else 4
  const colClass = methods.length <= 6 ? 'grid-cols-3' : 'grid-cols-4'

  return (
    <div className={`space-y-${compact ? '3' : '4'}`}>

      {/* ── Method cards ── */}
      <div className={`grid ${colClass} gap-2`}>
        {methods.map(m => {
          const selected = isSelected(m.key)
          const isCredit  = m.key === 'credit'
          const isAccount = m.key === 'account'
          const acctBal   = clientAccountBalance ?? 0

          return (
            <button
              key={m.key}
              type="button"
              onClick={() => toggleMethod(m.key)}
              className={`
                relative flex flex-col items-center justify-center gap-1.5
                rounded-2xl border-2 p-3 transition-all duration-200 select-none
                ${selected
                  ? `bg-gradient-to-br ${m.gradient} text-white border-transparent shadow-lg scale-[1.02] ring-2 ring-offset-1 ${m.ring}`
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50 hover:shadow-sm'
                }
                ${compact ? 'py-2.5' : 'py-4'}
              `}
            >
              {/* Icon */}
              <span className={selected ? 'text-white' : 'text-gray-400'}>
                {m.icon}
              </span>
              {/* Label */}
              <span className={`text-xs font-semibold text-center leading-tight ${selected ? 'text-white' : 'text-gray-700'}`}>
                {compact ? m.shortLabel : m.label}
              </span>
              {/* Account balance badge */}
              {isAccount && !selected && (
                <span className={`text-[10px] font-medium ${acctBal >= 0 ? 'text-indigo-600' : 'text-red-500'}`}>
                  {acctBal >= 0 ? `+${formatCurrency(acctBal)}` : `-${formatCurrency(Math.abs(acctBal))}`}
                </span>
              )}
              {isAccount && selected && (
                <span className="text-[10px] text-indigo-100">
                  {acctBal >= 0 ? `Avoir: ${formatCurrency(acctBal)}` : `Doit: ${formatCurrency(Math.abs(acctBal))}`}
                </span>
              )}
              {/* Credit label */}
              {isCredit && selected && (
                <span className="text-[10px] text-amber-100">À crédit</span>
              )}
              {/* Check mark */}
              {selected && (
                <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-white/30 rounded-full flex items-center justify-center">
                  <Check size={10} className="text-white" strokeWidth={3} />
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* ── Amount inputs for selected methods ── */}
      {value.length > 0 && (
        <div className="space-y-2">
          {value.map(p => {
            const m = ALL_METHODS.find(x => x.key === p.method)
            if (!m) return null
            const isCredit  = p.method === 'credit'
            const isAccount = p.method === 'account'
            const chips = p.method === 'cash' ? quickChips(total, p.amount) : []

            return (
              <div key={p.method} className={`rounded-xl border-2 p-3 space-y-2 transition-all ${m.ring.replace('ring-', 'border-')}`}
                style={{ borderColor: 'transparent' }}
              >
                <div className="flex items-center gap-2">
                  {/* Method badge */}
                  <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold ${m.badge}`}>
                    {m.icon} {m.label}
                  </span>
                  <div className="flex-1" />
                  {/* Remove */}
                  <button
                    type="button"
                    onClick={() => onChange(value.filter(x => x.method !== p.method))}
                    className="text-gray-300 hover:text-red-400 transition-colors"
                  >
                    <X size={14} />
                  </button>
                </div>

                {isCredit ? (
                  <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 rounded-lg border border-amber-200">
                    <ShoppingBag size={14} className="text-amber-500" />
                    <span className="text-sm text-amber-700">
                      <strong>{formatCurrency(p.amount)}</strong> sera porté au crédit du client
                    </span>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={p.amount || ''}
                        onChange={e => updateAmount(p.method, parseFloat(e.target.value) || 0)}
                        placeholder="Montant"
                        min={0}
                        step={100}
                        className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-mono text-right focus:outline-none focus:ring-2 focus:ring-primary/30 bg-gray-50"
                      />
                      <span className="text-xs text-gray-400 font-medium">FCFA</span>
                    </div>
                    {/* Quick chips for cash */}
                    {chips.length > 0 && (
                      <div className="flex gap-1.5 flex-wrap">
                        {chips.map(c => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => updateAmount(p.method, c)}
                            className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all ${
                              p.amount === c
                                ? 'bg-emerald-500 text-white border-emerald-500'
                                : 'bg-white text-gray-600 border-gray-200 hover:border-emerald-300 hover:text-emerald-700'
                            }`}
                          >
                            {c === total && <Zap size={10} />}
                            {formatCurrency(c)}
                          </button>
                        ))}
                      </div>
                    )}
                    {/* Account info */}
                    {isAccount && clientAccountBalance !== undefined && (
                      <div className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg ${
                        clientAccountBalance >= p.amount
                          ? 'text-indigo-600 bg-indigo-50'
                          : 'text-red-600 bg-red-50'
                      }`}>
                        <Wallet size={11} />
                        Solde compte : {formatCurrency(clientAccountBalance)}
                        {clientAccountBalance < p.amount && ' — solde insuffisant, le reste sera en dette'}
                      </div>
                    )}
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Summary strip ── */}
      <div className="rounded-2xl overflow-hidden border border-gray-200 shadow-sm">
        {/* Progress bar */}
        <div className="h-2 bg-gray-100">
          <div
            className={`h-full transition-all duration-500 rounded-full ${
              progress >= 100 ? 'bg-gradient-to-r from-emerald-400 to-green-500' : 'bg-gradient-to-r from-primary to-blue-500'
            }`}
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
        </div>

        <div className="p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Total à encaisser</span>
            <span className="font-bold text-gray-800 font-mono">{formatCurrency(total)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Total encaissé</span>
            <span className={`font-bold font-mono ${totalPaid >= total ? 'text-emerald-600' : 'text-red-500'}`}>
              {formatCurrency(totalPaid)}
            </span>
          </div>

          {/* Remaining or change */}
          {change > 0 ? (
            <div className="flex justify-between items-center pt-2 mt-1 border-t border-gray-100">
              <span className="text-sm font-semibold text-emerald-700 flex items-center gap-1.5">
                <Check size={14} /> Monnaie à rendre
              </span>
              <span className="text-xl font-bold text-emerald-600 font-mono">{formatCurrency(change)}</span>
            </div>
          ) : remaining > 0 && !value.some(p => p.method === 'credit') ? (
            <div className="flex justify-between items-center pt-2 mt-1 border-t border-gray-100">
              <span className="text-sm font-semibold text-red-600 flex items-center gap-1.5">
                <TrendingDown size={14} /> Reste à payer
              </span>
              <span className="text-xl font-bold text-red-600 font-mono">{formatCurrency(remaining)}</span>
            </div>
          ) : isValid && (
            <div className="flex items-center justify-center gap-2 pt-2 mt-1 border-t border-gray-100">
              <Check size={16} className="text-emerald-500" />
              <span className="text-sm font-semibold text-emerald-600">Paiement complet</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
