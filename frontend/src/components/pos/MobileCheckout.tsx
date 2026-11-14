import { useEffect, useState } from 'react'
import { ArrowLeft, Banknote, Check, CreditCard, Delete, X } from 'lucide-react'
import { formatCurrency } from '../../lib/format'
import type { PaymentEntry } from '../PaymentPanel'

// ─── Modes de paiement disponibles en caisse mobile ──────────────────────────
// (pas de crédit / compte client : la caisse mobile ne sélectionne pas de client)

interface Method {
  key: string
  label: string
  logo?: string
  icon?: React.ReactNode
}

const METHODS: Method[] = [
  { key: 'cash',         label: 'Espèces',      icon: <Banknote size={20} /> },
  { key: 'wave',         label: 'Wave',         logo: '/wave-logo.png' },
  { key: 'orange_money', label: 'Orange Money', logo: '/orange-money-logo.svg' },
  { key: 'free_money',   label: 'Free Money',   logo: '/free-money-logo.svg' },
  { key: 'card',         label: 'Carte',        icon: <CreditCard size={20} /> },
]
const methodOf = (key: string) => METHODS.find(m => m.key === key) ?? { key, label: key }

function MethodMark({ m, size = 20 }: { m: Method; size?: number }) {
  if (m.logo) {
    return <img src={m.logo} alt="" style={{ height: size, width: 'auto', maxWidth: size * 2.6, objectFit: 'contain' }} />
  }
  return <span className="text-gray-500">{m.icon}</span>
}

// Montants rapides : exact + arrondis supérieurs usuels (billets FCFA)
function quickAmounts(due: number): number[] {
  if (due <= 0) return []
  const out = [due]
  for (const step of [500, 1000, 2000, 5000, 10000]) {
    const v = Math.ceil(due / step) * step
    if (v > due && !out.includes(v)) out.push(v)
    if (out.length >= 4) break
  }
  return out
}

// ─── Composant ────────────────────────────────────────────────────────────────

interface Props {
  total: number
  itemCount: number
  value: PaymentEntry[]
  onChange: (v: PaymentEntry[]) => void
  onBack: () => void
  onConfirm: () => void
  processing: boolean
}

export default function MobileCheckout({ total, itemCount, value, onChange, onBack, onConfirm, processing }: Props) {
  const [active, setActive] = useState<string>(value[0]?.method ?? 'cash')
  // true = la prochaine touche remplace le montant (après sélection d'un mode)
  const [fresh, setFresh] = useState(true)

  const paid      = value.reduce((s, p) => s + (p.amount || 0), 0)
  const remaining = Math.max(0, total - paid)
  const change    = Math.max(0, paid - total)
  const ready     = value.length > 0 && paid >= total
  const activeAmt = value.find(p => p.method === active)?.amount ?? 0
  const dueForActive = Math.max(0, total - (paid - activeAmt))

  const setAmount = (method: string, amount: number) =>
    onChange(value.map(p => p.method === method ? { ...p, amount } : p))

  const selectMethod = (key: string) => {
    if (!value.some(p => p.method === key)) {
      onChange([...value, { method: key, amount: remaining }])
    }
    setActive(key)
    setFresh(true)
  }

  const removeMethod = (key: string) => {
    const next = value.filter(p => p.method !== key)
    onChange(next)
    if (active === key) setActive(next[0]?.method ?? '')
  }

  const press = (k: string) => {
    if (!value.some(p => p.method === active)) return
    const cur = fresh ? '' : String(activeAmt || '')
    let next: string
    if (k === 'back')       next = cur.slice(0, -1)
    else if (k === 'clear') next = ''
    else                    next = (cur + k).replace(/^0+/, '')
    if (next.length > 9) return
    setAmount(active, Number(next || 0))
    setFresh(false)
  }

  // Clavier physique (ordinateur / terminal avec clavier)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return
      if (/^\d$/.test(e.key))           { press(e.key); e.preventDefault() }
      else if (e.key === 'Backspace')   { press('back'); e.preventDefault() }
      else if (e.key === 'Delete')      { press('clear'); e.preventDefault() }
      else if (e.key === 'Escape')      onBack()
      else if (e.key === 'Enter' && ready && !processing) onConfirm()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const keys = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '00', '0', 'back']

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-50" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>

      {/* ── En-tête ── */}
      <header
        className="flex items-center gap-3 px-4 bg-white border-b border-gray-200 flex-shrink-0"
        style={{ paddingTop: 'max(12px, env(safe-area-inset-top))', paddingBottom: 12 }}
      >
        <button onClick={onBack} title="Retour au panier"
          className="w-9 h-9 flex items-center justify-center rounded-xl bg-gray-100 text-gray-600 hover:bg-gray-200 flex-shrink-0">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400">Encaissement</p>
          <p className="text-sm text-gray-600">{itemCount} article{itemCount > 1 ? 's' : ''}</p>
        </div>
        <div className="text-right">
          <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400">Total à payer</p>
          <p className="text-2xl font-bold text-gray-900 tabular-nums leading-tight">{formatCurrency(total)}</p>
        </div>
      </header>

      {/* ── Corps ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl p-3 sm:p-5 grid gap-4 md:grid-cols-[1fr_360px]">

          {/* Colonne gauche : modes + lignes + récap */}
          <div className="space-y-4">
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Mode de paiement</h3>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                {METHODS.map(m => {
                  const used = value.some(p => p.method === m.key)
                  const isActive = used && active === m.key
                  return (
                    <button key={m.key} type="button" onClick={() => selectMethod(m.key)}
                      className={`relative h-[68px] flex flex-col items-center justify-center gap-1.5 rounded-xl border bg-white transition-all ${
                        isActive ? 'border-primary ring-2 ring-primary/20'
                        : used    ? 'border-primary/40'
                                  : 'border-gray-200 hover:border-gray-300'
                      }`}>
                      <MethodMark m={m} />
                      <span className="text-[11px] font-medium text-gray-700 leading-none">{m.label}</span>
                      {used && (
                        <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-primary text-white flex items-center justify-center">
                          <Check size={10} strokeWidth={3} />
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </section>

            {value.length > 0 && (
              <section className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
                {value.map(p => {
                  const m = methodOf(p.method)
                  const isActive = active === p.method
                  return (
                    <div key={p.method}
                      onClick={() => { setActive(p.method); setFresh(true) }}
                      className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors ${isActive ? 'bg-primary/5' : 'hover:bg-gray-50'}`}>
                      <span className={`w-1 self-stretch rounded-full ${isActive ? 'bg-primary' : 'bg-transparent'}`} />
                      <span className="w-12 flex justify-center"><MethodMark m={m} size={18} /></span>
                      <span className="flex-1 text-sm font-medium text-gray-700">{m.label}</span>
                      <span className={`text-base font-semibold tabular-nums ${isActive ? 'text-primary' : 'text-gray-900'}`}>
                        {formatCurrency(p.amount)}
                      </span>
                      <button type="button" title="Retirer"
                        onClick={e => { e.stopPropagation(); removeMethod(p.method) }}
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50">
                        <X size={14} />
                      </button>
                    </div>
                  )
                })}
              </section>
            )}

            <section className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Total</span>
                <span className="font-semibold text-gray-900 tabular-nums">{formatCurrency(total)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Reçu</span>
                <span className="font-semibold text-gray-900 tabular-nums">{formatCurrency(paid)}</span>
              </div>
              <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                <div className={`h-full rounded-full transition-all duration-300 ${ready ? 'bg-emerald-500' : 'bg-primary'}`}
                  style={{ width: `${total > 0 ? Math.min(100, (paid / total) * 100) : 0}%` }} />
              </div>
              <div className="flex justify-between items-baseline pt-1">
                {change > 0 ? (
                  <>
                    <span className="text-sm font-semibold text-emerald-700">Monnaie à rendre</span>
                    <span className="text-2xl font-bold text-emerald-600 tabular-nums">{formatCurrency(change)}</span>
                  </>
                ) : remaining > 0 ? (
                  <>
                    <span className="text-sm font-semibold text-red-600">Reste à payer</span>
                    <span className="text-2xl font-bold text-red-600 tabular-nums">{formatCurrency(remaining)}</span>
                  </>
                ) : (
                  <>
                    <span className="text-sm font-semibold text-emerald-700 flex items-center gap-1.5"><Check size={15} /> Compte exact</span>
                    <span className="text-2xl font-bold text-emerald-600 tabular-nums">0</span>
                  </>
                )}
              </div>
            </section>
          </div>

          {/* Colonne droite : pavé numérique */}
          <section className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4 flex flex-col gap-3 md:sticky md:top-0 self-start w-full">
            <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-3">
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>Montant {active ? `· ${methodOf(active).label}` : ''}</span>
                {fresh && activeAmt > 0 && <span className="text-[10px] text-gray-400">la saisie remplace</span>}
              </div>
              <div className="text-right text-3xl font-bold tabular-nums text-gray-900 mt-1 truncate">
                {formatCurrency(activeAmt)}
              </div>
            </div>

            {active && (
              <div className="grid grid-cols-4 gap-1.5">
                {quickAmounts(dueForActive).map((a, i) => (
                  <button key={a} type="button"
                    onClick={() => { setAmount(active, a); setFresh(true) }}
                    className={`h-9 rounded-lg text-xs font-semibold tabular-nums border transition-colors ${
                      activeAmt === a ? 'bg-primary text-white border-primary' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                    }`}>
                    {i === 0 ? 'Exact' : new Intl.NumberFormat('fr-FR').format(a)}
                  </button>
                ))}
              </div>
            )}

            <div className="grid grid-cols-3 gap-1.5">
              {keys.map(k => (
                <button key={k} type="button" onClick={() => press(k)} disabled={!active}
                  className={`h-14 sm:h-[60px] rounded-xl text-xl font-semibold select-none transition-colors disabled:opacity-40 ${
                    k === 'back'
                      ? 'bg-gray-100 text-gray-600 hover:bg-gray-200 active:bg-gray-300 flex items-center justify-center'
                      : 'bg-white border border-gray-200 text-gray-900 hover:bg-gray-50 active:bg-gray-100'
                  }`}>
                  {k === 'back' ? <Delete size={22} /> : k}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => press('clear')} disabled={!active}
              className="h-10 rounded-xl text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 disabled:opacity-40">
              Effacer
            </button>
          </section>
        </div>
      </div>

      {/* ── Pied ── */}
      <footer className="flex-shrink-0 bg-white border-t border-gray-200">
        <div className="mx-auto max-w-5xl px-3 sm:px-5 py-3 flex gap-3">
          <button type="button" onClick={onBack}
            className="px-5 py-3.5 rounded-xl border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50">
            Retour
          </button>
          <button type="button" onClick={onConfirm} disabled={!ready || processing}
            className="flex-1 py-3.5 rounded-xl bg-primary text-white text-sm font-bold flex items-center justify-center gap-2 shadow-sm hover:bg-primary-600 disabled:opacity-40 disabled:cursor-not-allowed">
            <Check size={18} />
            {processing ? 'Traitement…' : ready
              ? `Valider la vente${change > 0 ? ` · rendre ${formatCurrency(change)}` : ''}`
              : `Reste ${formatCurrency(remaining)}`}
          </button>
        </div>
      </footer>
    </div>
  )
}
