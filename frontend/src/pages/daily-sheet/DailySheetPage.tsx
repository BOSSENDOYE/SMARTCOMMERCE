import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import api from '../../lib/api'
import { formatCurrency, formatNumber, openPdf } from '../../lib/format'
import { useAuthStore } from '../../store/auth.store'
import { useConfirm } from '../../hooks/useConfirm'
import {
  ClipboardList, Printer, FileText, Settings2, Play, Lock, LockOpen, Plus, Minus, AlertTriangle, CheckCircle2,
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

type ShiftKey = 'matin' | 'soir' | 'nuit'

interface SheetLine {
  product_id: number
  name: string
  category?: string
  unsold_end_of_day: boolean
  unit_price: number
  opening: number
  added: number
  sold: number
  other: number
  expected: number
  remaining: number | null
  gap: number | null
  over_tolerance: boolean
}

interface Shift {
  id?: number
  shift: ShiftKey
  label: string
  position: number
  status: 'not_started' | 'open' | 'closed'
  responsible?: { id: number; name: string }
  closed_by?: { id: number; name: string }
  opened_at?: string
  closed_at?: string
  can_fill?: boolean
  lines?: SheetLine[]
  totals?: { added: number; sold: number; sold_value: number; gap_qty: number; gap_value: number; over_tolerance: number }
}

interface SheetData {
  date: string
  shifts: Shift[]
  pending: Record<string, number>
  can_manage: boolean
  can_fill: boolean
  tolerance: { pct: number; qty: number }
}

type ApiErr = { response?: { data?: { message?: string; errors?: Record<string, string[]> } } }
const apiError = (err: unknown): string => {
  const data = (err as ApiErr)?.response?.data
  if (data?.errors) return Object.values(data.errors).flat().join('\n')
  return data?.message ?? 'Une erreur est survenue'
}

const isoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const hhmm = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '')
const hasActivity = (l: SheetLine) => Math.abs(l.opening) + Math.abs(l.added) + Math.abs(l.sold) + Math.abs(l.other) > 0
const print = (url: string) => openPdf(url).catch(() => toast.error("Impossible d'ouvrir la fiche"))

const STATUS_STYLE: Record<Shift['status'], { label: string; cls: string }> = {
  not_started: { label: 'Non commencée', cls: 'bg-gray-100 text-gray-500' },
  open:        { label: 'En cours',      cls: 'bg-amber-100 text-amber-800' },
  closed:      { label: 'Clôturée',      cls: 'bg-green-100 text-green-700' },
}

const Modal = ({ title, subtitle, onClose, children, footer, wide }: {
  title: string; subtitle?: React.ReactNode; onClose: () => void; children: React.ReactNode; footer: React.ReactNode; wide?: boolean
}) => (
  <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
    <div className={`bg-white rounded-2xl shadow-2xl w-full ${wide ? 'max-w-3xl' : 'max-w-md'} max-h-[90vh] flex flex-col`}>
      <div className="flex items-center justify-between p-5 border-b">
        <div>
          <h2 className="text-lg font-bold text-gray-900">{title}</h2>
          {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
      </div>
      <div className="p-5 space-y-4 overflow-auto">{children}</div>
      <div className="flex flex-wrap gap-2 justify-end p-5 border-t">{footer}</div>
    </div>
  </div>
)

// ─── Ouverture d'une équipe ──────────────────────────────────────────────────

function OpenShiftModal({ shift, date, canManage, onClose, onDone }: {
  shift: Shift; date: string; canManage: boolean; onClose: () => void; onDone: () => void
}) {
  const me = useAuthStore(s => s.user)
  const [responsibleId, setResponsibleId] = useState<number>(me?.id ?? 0)

  const { data: people = [] } = useQuery({
    queryKey: ['sheet-responsibles'],
    queryFn: () => api.get('/daily-sheets/responsibles').then(r => r.data as { id: number; name: string }[]),
    enabled: canManage,
  })

  const { mutate, isPending } = useMutation({
    mutationFn: () => api.post('/daily-sheets/shifts', { date, shift: shift.shift, responsible_id: responsibleId }),
    onSuccess: () => { toast.success(`Équipe ${shift.label} ouverte`); onDone(); onClose() },
    onError: (err) => toast.error(apiError(err)),
  })

  return (
    <Modal
      title={`Ouvrir l'équipe ${shift.label}`}
      subtitle="Le départ de chaque produit est relevé sur le stock actuel du point de vente."
      onClose={onClose}
      footer={<>
        <button className="btn-secondary" onClick={onClose}>Annuler</button>
        <button className="btn-primary" disabled={isPending || !responsibleId} onClick={() => mutate()}>{isPending ? 'Ouverture…' : 'Ouvrir'}</button>
      </>}
    >
      <label className="block text-sm font-medium text-gray-700 mb-1">Responsable de l'équipe</label>
      {canManage ? (
        <select className="input w-full" value={responsibleId} onChange={e => setResponsibleId(Number(e.target.value))}>
          {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      ) : (
        <p className="input w-full bg-gray-50">{me?.name} (vous)</p>
      )}
    </Modal>
  )
}

// ─── Clôture d'une équipe ────────────────────────────────────────────────────

function CloseShiftModal({ shift, tolerance, onClose, onDone }: {
  shift: Shift; tolerance: SheetData['tolerance']; onClose: () => void; onDone: () => void
}) {
  const lines = (shift.lines ?? []).filter(hasActivity)
  const [counts, setCounts] = useState<Record<number, string>>({})
  const [destination, setDestination] = useState('waste')
  const isNight = shift.shift === 'nuit'

  const rows = lines.map(l => {
    const raw = counts[l.product_id]
    const remaining = raw === undefined || raw === '' ? null : parseFloat(raw)
    const gap = remaining === null ? null : Math.round((l.expected - remaining) * 1000) / 1000
    const allowed = Math.max(tolerance.qty, Math.max(0, l.opening + l.added) * tolerance.pct / 100)
    const invalid = remaining !== null && (remaining < 0 || remaining > Math.max(0, l.expected))
    return { ...l, remaining, gap, flagged: gap !== null && gap > allowed, invalid }
  })
  const missing = rows.filter(r => r.remaining === null).length
  const invalid = rows.some(r => r.invalid)
  const gapValue = rows.reduce((s, r) => s + Math.max(0, r.gap ?? 0) * r.unit_price, 0)
  const breadLeft = rows.filter(r => r.unsold_end_of_day && (r.remaining ?? 0) > 0)

  const { mutate, isPending } = useMutation({
    mutationFn: () => api.post(`/daily-sheets/shifts/${shift.id}/close`, {
      counts: Object.fromEntries(rows.map(r => [r.product_id, r.remaining ?? 0])),
      unsold_destination: isNight ? destination : undefined,
    }),
    onSuccess: () => { toast.success(`Équipe ${shift.label} clôturée`); onDone(); onClose() },
    onError: (err) => toast.error(apiError(err)),
  })

  return (
    <Modal
      wide
      title={`Clôturer l'équipe ${shift.label}`}
      subtitle="Saisissez le reste réellement compté sur l'étal pour chaque produit."
      onClose={onClose}
      footer={<>
        <p className="flex-1 self-center text-sm">
          {missing > 0 ? <span className="text-amber-700">{missing} reste(s) à saisir</span>
            : gapValue > 0 ? <span className="text-red-600 font-semibold">Manquant : {formatCurrency(gapValue)}</span>
            : <span className="text-green-700">Aucun manquant</span>}
        </p>
        <button className="btn-secondary" onClick={onClose}>Annuler</button>
        <button className="btn-primary" disabled={isPending || missing > 0 || invalid} onClick={() => mutate()}>
          {isPending ? 'Clôture…' : 'Valider la clôture'}
        </button>
      </>}
    >
      <table className="w-full text-sm">
        <thead className="text-xs text-gray-500 uppercase">
          <tr>
            <th className="text-left py-2">Produit</th>
            <th className="text-right py-2">Attendu</th>
            <th className="text-right py-2">Reste compté</th>
            <th className="text-right py-2">Écart</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map(r => (
            <tr key={r.product_id} className={r.flagged ? 'bg-red-50' : ''}>
              <td className="py-1.5">
                {r.name}
                {isNight && r.unsold_end_of_day && <span className="ml-2 badge bg-amber-100 text-amber-800">pain → invendu</span>}
              </td>
              <td className="py-1.5 text-right">{formatNumber(r.expected)}</td>
              <td className="py-1.5 text-right">
                <input
                  type="number" min="0" max={Math.max(0, r.expected)}
                  className={`input w-24 text-right ${r.invalid ? 'border-red-500' : ''}`}
                  value={counts[r.product_id] ?? ''}
                  onChange={e => setCounts(prev => ({ ...prev, [r.product_id]: e.target.value }))}
                />
              </td>
              <td className={`py-1.5 text-right font-semibold ${r.flagged ? 'text-red-600' : (r.gap ?? 0) > 0 ? 'text-amber-700' : 'text-gray-400'}`}>
                {r.gap === null ? '—' : formatNumber(r.gap)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.some(r => r.invalid) && <p className="text-sm text-red-600">Un reste ne peut pas dépasser l'attendu ni être négatif.</p>}
      <p className="text-xs text-gray-500">
        Tolérance : {formatNumber(tolerance.pct, 1)} % ou {formatNumber(tolerance.qty)} pièce(s). Au-delà, l'écart est signalé en rouge au responsable.
        À la validation, le stock du point de vente est recalé sur votre comptage.
      </p>

      {isNight && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm space-y-2">
          <p className="font-semibold text-amber-900">Fin de journée</p>
          <p className="text-amber-800">
            Le reste des pains passe en invendus{breadLeft.length > 0 ? ` (${breadLeft.map(r => `${formatNumber(r.remaining ?? 0)} ${r.name}`).join(', ')})` : ''}.
            Les autres produits sont reportés au matin suivant.
          </p>
          <label className="flex items-center gap-2 text-amber-900">
            Destination des pains restants :
            <select className="input w-40" value={destination} onChange={e => setDestination(e.target.value)}>
              <option value="waste">Jeté</option>
              <option value="donation">Don</option>
              <option value="staff">Personnel</option>
            </select>
          </label>
        </div>
      )}
    </Modal>
  )
}

// ─── Tolérance (gérant) ──────────────────────────────────────────────────────

function ToleranceModal({ tolerance, onClose, onDone }: { tolerance: SheetData['tolerance']; onClose: () => void; onDone: () => void }) {
  const [pct, setPct] = useState(String(tolerance.pct))
  const [qty, setQty] = useState(String(tolerance.qty))

  const { mutate, isPending } = useMutation({
    mutationFn: () => api.put('/daily-sheets/settings', { tolerance_pct: parseFloat(pct) || 0, tolerance_qty: parseFloat(qty) || 0 }),
    onSuccess: () => { toast.success('Tolérance enregistrée'); onDone(); onClose() },
    onError: (err) => toast.error(apiError(err)),
  })

  return (
    <Modal
      title="Tolérance d'écart"
      subtitle="Un écart est signalé seulement s'il dépasse le plus grand des deux seuils."
      onClose={onClose}
      footer={<>
        <button className="btn-secondary" onClick={onClose}>Annuler</button>
        <button className="btn-primary" disabled={isPending} onClick={() => mutate()}>Enregistrer</button>
      </>}
    >
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Pourcentage</label>
          <div className="flex items-center gap-2"><input type="number" min="0" max="100" step="0.5" className="input w-full" value={pct} onChange={e => setPct(e.target.value)} /> %</div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Ou nombre de pièces</label>
          <input type="number" min="0" className="input w-full" value={qty} onChange={e => setQty(e.target.value)} />
        </div>
      </div>
      <p className="text-xs text-gray-500">Exemple : 2 % ou 2 pièces → sur 100 baguettes, un écart de 2 est toléré, 3 est signalé.</p>
    </Modal>
  )
}

// ─── Saisie « Ajouté » ───────────────────────────────────────────────────────

function AddCell({ shift, line, pending, onDone }: { shift: Shift; line: SheetLine; pending: number; onDone: () => void }) {
  const [qty, setQty] = useState('')
  const value = parseFloat(qty) || 0

  const { mutate, isPending } = useMutation({
    mutationFn: (sign: 1 | -1) => api.post(`/daily-sheets/shifts/${shift.id}/${sign > 0 ? 'add' : 'remove'}`, { product_id: line.product_id, qty: value }),
    onSuccess: (_, sign) => { toast.success(sign > 0 ? `+${value} ${line.name}` : `−${value} ${line.name} (remis en production)`); setQty(''); onDone() },
    onError: (err) => toast.error(apiError(err)),
  })

  return (
    <div className="flex items-center justify-end gap-1">
      <span className="w-10 text-right font-semibold">{formatNumber(line.added)}</span>
      <input
        type="number" min="0" className="input w-16 text-right py-1 px-1.5 text-sm" placeholder={pending > 0 ? `≤${formatNumber(pending)}` : '0'}
        value={qty} onChange={e => setQty(e.target.value)}
      />
      <button title={`Ajouter (production disponible : ${formatNumber(pending)})`} disabled={isPending || value <= 0} onClick={() => mutate(1)} className="p-1 rounded bg-primary text-white disabled:opacity-40"><Plus size={14} /></button>
      <button title="Corriger : retirer une saisie" disabled={isPending || value <= 0 || value > line.added} onClick={() => mutate(-1)} className="p-1 rounded border text-gray-600 disabled:opacity-30"><Minus size={14} /></button>
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function DailySheetPage() {
  const qc = useQueryClient()
  const confirm = useConfirm()
  const [date, setDate] = useState(() => isoDate(new Date()))
  const [selected, setSelected] = useState<ShiftKey | null>(null)
  const [hideEmpty, setHideEmpty] = useState(true)
  const [modal, setModal] = useState<null | 'open' | 'close' | 'tolerance'>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['daily-sheet', date],
    queryFn: () => api.get('/daily-sheets', { params: { date } }).then(r => r.data as SheetData),
    refetchInterval: 30_000,
  })
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['daily-sheet'] })
    qc.invalidateQueries({ queryKey: ['distribution-pending'] })
    qc.invalidateQueries({ queryKey: ['bakery-day'] })
  }

  const shifts = useMemo(() => data?.shifts ?? [], [data])
  // Par défaut : l'équipe en cours, sinon la dernière commencée, sinon le matin
  const current: Shift | undefined = useMemo(() => {
    if (selected) return shifts.find(s => s.shift === selected)
    return shifts.find(s => s.status === 'open') ?? [...shifts].reverse().find(s => s.status === 'closed') ?? shifts[0]
  }, [shifts, selected])

  const { mutate: reopen } = useMutation({
    mutationFn: (id: number) => api.post(`/daily-sheets/shifts/${id}/reopen`),
    onSuccess: () => { toast.success('Équipe rouverte : écarts et invendus annulés'); refresh() },
    onError: (err) => toast.error(apiError(err)),
  })

  const canOpen = (s: Shift) => s.status === 'not_started' && !!data?.can_fill
    && (s.position === 1 || shifts.find(x => x.position === s.position - 1)?.status === 'closed')
    && !shifts.some(x => x.status === 'open')

  const lines = (current?.lines ?? []).filter(l => !hideEmpty || hasActivity(l) || (data?.pending[l.product_id] ?? 0) > 0)
  const editable = current?.status === 'open' && current.can_fill

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="p-2 bg-amber-100 rounded-xl"><ClipboardList className="text-amber-700" size={24} /></div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">Fiche journalière</h1>
          <p className="text-sm text-gray-500">Équipes matin, soir et nuit — contrôle par la caisse</p>
        </div>
        <input type="date" className="input w-44" value={date} onChange={e => { setDate(e.target.value); setSelected(null) }} />
        <button className="btn-secondary flex items-center gap-2" onClick={() => print(`/pdf/daily-sheets?blank=1&date=${date}`)}><FileText size={16} /> Fiche vierge</button>
        <button className="btn-secondary flex items-center gap-2" onClick={() => print(`/pdf/daily-sheets?date=${date}`)}><Printer size={16} /> Imprimer</button>
        {data?.can_manage && (
          <button className="btn-secondary flex items-center gap-2" onClick={() => setModal('tolerance')} title="Tolérance d'écart">
            <Settings2 size={16} /> {formatNumber(data.tolerance.pct, 1)} % / {formatNumber(data.tolerance.qty)} pc
          </button>
        )}
      </div>

      {isLoading || !data ? <p className="text-center text-gray-400 py-10">Chargement…</p> : (
        <>
          {/* Équipes */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {shifts.map(s => (
              <button
                key={s.shift}
                onClick={() => setSelected(s.shift)}
                className={`card p-4 text-left space-y-2 border-2 transition ${current?.shift === s.shift ? 'border-primary' : 'border-transparent'}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-lg font-bold text-gray-900">{s.label}</span>
                  <span className={`badge ${STATUS_STYLE[s.status].cls}`}>{STATUS_STYLE[s.status].label}</span>
                </div>
                {s.status !== 'not_started' ? (
                  <>
                    <p className="text-sm text-gray-600">{s.responsible?.name} · {hhmm(s.opened_at)}{s.closed_at ? ` → ${hhmm(s.closed_at)}` : ''}</p>
                    <div className="flex flex-wrap gap-x-4 text-sm">
                      <span>Ajouté <b>{formatNumber(s.totals?.added ?? 0)}</b></span>
                      <span>Vendu <b>{formatNumber(s.totals?.sold ?? 0)}</b></span>
                      {s.status === 'closed' && (
                        (s.totals?.gap_value ?? 0) > 0
                          ? <span className={(s.totals?.over_tolerance ?? 0) > 0 ? 'text-red-600 font-semibold' : 'text-amber-700'}>
                              Manquant {formatCurrency(s.totals?.gap_value ?? 0)}
                            </span>
                          : <span className="text-green-700 flex items-center gap-1"><CheckCircle2 size={14} /> Sans écart</span>
                      )}
                    </div>
                  </>
                ) : <p className="text-sm text-gray-400">Pas encore ouverte</p>}
              </button>
            ))}
          </div>

          {current && (
            <div className="card">
              <div className="flex flex-wrap items-center gap-3 p-4 border-b">
                <h2 className="font-semibold text-gray-900 flex-1">Équipe {current.label}</h2>
                <label className="flex items-center gap-2 text-sm text-gray-600">
                  <input type="checkbox" checked={hideEmpty} onChange={e => setHideEmpty(e.target.checked)} /> Masquer les produits sans mouvement
                </label>
                {canOpen(current) && (
                  <button className="btn-primary flex items-center gap-2" onClick={() => setModal('open')}><Play size={16} /> Ouvrir l'équipe</button>
                )}
                {editable && (
                  <button className="btn-primary flex items-center gap-2" onClick={() => setModal('close')}><Lock size={16} /> Clôturer</button>
                )}
                {current.status === 'closed' && data.can_manage && (
                  <button
                    className="btn-secondary flex items-center gap-2"
                    onClick={async () => {
                      if (await confirm(`Rouvrir l'équipe ${current.label} ? Le recalage du stock et les invendus générés seront annulés.`, { danger: true })) reopen(current.id!)
                    }}
                  >
                    <LockOpen size={16} /> Rouvrir
                  </button>
                )}
              </div>

              {current.status === 'not_started' ? (
                <p className="p-10 text-center text-gray-400">
                  {canOpen(current) ? 'Ouvrez l\'équipe pour commencer la saisie.' : shifts.some(x => x.status === 'open') ? 'Une autre équipe est en cours.' : 'Clôturez d\'abord l\'équipe précédente.'}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                      <tr>
                        <th className="text-left px-4 py-2">Produit</th>
                        <th className="text-right px-3 py-2">Prix</th>
                        <th className="text-right px-3 py-2">Départ</th>
                        <th className="text-right px-3 py-2">Ajouté</th>
                        <th className="text-right px-3 py-2">Vendu caisse</th>
                        <th className="text-right px-3 py-2" title="Retours livreurs, pertes, transferts…">Autres</th>
                        <th className="text-right px-3 py-2">Attendu</th>
                        <th className="text-right px-3 py-2">Reste</th>
                        <th className="text-right px-3 py-2">Écart</th>
                        <th className="text-right px-4 py-2">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {lines.length === 0 && <tr><td colSpan={10} className="text-center py-8 text-gray-400">Aucun produit</td></tr>}
                      {lines.map(l => (
                        <tr key={l.product_id} className={l.over_tolerance ? 'bg-red-50' : 'hover:bg-gray-50'}>
                          <td className="px-4 py-2">
                            <p className="font-medium text-gray-900">{l.name}</p>
                            <p className="text-[11px] text-gray-400">{l.category}</p>
                          </td>
                          <td className="px-3 py-2 text-right text-gray-500">{formatNumber(l.unit_price)}</td>
                          <td className="px-3 py-2 text-right">{formatNumber(l.opening)}</td>
                          <td className="px-3 py-2 text-right">
                            {editable
                              ? <AddCell shift={current} line={l} pending={data.pending[l.product_id] ?? 0} onDone={refresh} />
                              : formatNumber(l.added)}
                          </td>
                          <td className="px-3 py-2 text-right">{formatNumber(l.sold)}</td>
                          <td className="px-3 py-2 text-right text-gray-500">{l.other ? formatNumber(l.other) : '—'}</td>
                          <td className="px-3 py-2 text-right font-semibold">{formatNumber(l.expected)}</td>
                          <td className="px-3 py-2 text-right">{l.remaining === null ? '—' : formatNumber(l.remaining)}</td>
                          <td className={`px-3 py-2 text-right font-semibold ${l.over_tolerance ? 'text-red-600' : (l.gap ?? 0) > 0 ? 'text-amber-700' : 'text-gray-400'}`}>
                            {l.gap === null ? '—' : (
                              <span className="inline-flex items-center gap-1">{l.over_tolerance && <AlertTriangle size={13} />}{formatNumber(l.gap)}</span>
                            )}
                          </td>
                          <td className="px-4 py-2" />
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {modal === 'open' && current && <OpenShiftModal shift={current} date={date} canManage={data.can_manage} onClose={() => setModal(null)} onDone={refresh} />}
          {modal === 'close' && current && <CloseShiftModal shift={current} tolerance={data.tolerance} onClose={() => setModal(null)} onDone={refresh} />}
          {modal === 'tolerance' && <ToleranceModal tolerance={data.tolerance} onClose={() => setModal(null)} onDone={refresh} />}
        </>
      )}
    </div>
  )
}
