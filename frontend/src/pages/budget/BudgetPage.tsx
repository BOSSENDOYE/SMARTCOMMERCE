import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import api from '../../lib/api'

// ── Types ─────────────────────────────────────────────────────────────────────

type BudgetStatus = 'draft' | 'active' | 'closed'
type PeriodType = 'monthly' | 'quarterly' | 'annual'

interface Account { id: number; code: string; name: string; class: string }

interface BudgetLine {
  id?: number
  account_id: number
  month?: number | null
  quarter?: number | null
  amount: number
  account?: Account
}

interface Budget {
  id: number
  name: string
  year: number
  period_type: PeriodType
  status: BudgetStatus
  notes?: string
  created_by?: { name: string }
  lines?: BudgetLine[]
}

interface ComparisonRow {
  account: { id: number; code: string; name: string; class: string }
  budget_line: { id: number; month: number | null; quarter: number | null }
  prevu: number
  realise: number
  ecart: number
  ecart_pct: number | null
}

// ── Constantes ────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<BudgetStatus, string> = { draft: 'Brouillon', active: 'Actif', closed: 'Clôturé' }
const STATUS_COLORS: Record<BudgetStatus, string> = {
  draft:  'bg-gray-100 text-gray-700',
  active: 'bg-green-100 text-green-700',
  closed: 'bg-blue-100 text-blue-700',
}

const MONTHS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc']

// ── Composant principal ───────────────────────────────────────────────────────

export default function BudgetPage() {
  const qc = useQueryClient()
  const currentYear = new Date().getFullYear()

  const [yearFilter, setYearFilter]     = useState(currentYear)
  const [showForm, setShowForm]         = useState(false)
  const [comparing, setComparing]       = useState<Budget | null>(null)
  const [compareMonth, setCompareMonth] = useState<number | null>(null)
  const [compareQ, setCompareQ]         = useState<number | null>(null)

  const [form, setForm] = useState({
    name: '',
    year: currentYear,
    period_type: 'monthly' as PeriodType,
    notes: '',
    lines: [] as BudgetLine[],
  })

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: budgets = [], isLoading } = useQuery<Budget[]>({
    queryKey: ['budgets', yearFilter],
    queryFn: () => api.get(`/budgets?year=${yearFilter}`).then(r => r.data),
  })

  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: ['accounting-accounts'],
    queryFn: () => api.get('/accounting/accounts').then(r => r.data),
  })

  const compParams = comparing
    ? `?${compareMonth ? `month=${compareMonth}` : compareQ ? `quarter=${compareQ}` : ''}`
    : ''
  const { data: comparison, isLoading: loadingComp } = useQuery({
    queryKey: ['budget-comparison', comparing?.id, compareMonth, compareQ],
    queryFn: () => api.get(`/budgets/${comparing!.id}/comparison${compParams}`).then(r => r.data),
    enabled: !!comparing,
  })

  // ── Mutations ──────────────────────────────────────────────────────────────

  const invalidate = () => qc.invalidateQueries({ queryKey: ['budgets'] })

  const createMut = useMutation({
    mutationFn: (payload: typeof form) => api.post('/budgets', payload).then(r => r.data),
    onSuccess: () => { toast.success('Budget créé'); setShowForm(false); resetForm(); invalidate() },
    onError:   (e: any) => toast.error(e.response?.data?.message ?? 'Erreur'),
  })

  const actionMut = useMutation({
    mutationFn: ({ id, action }: { id: number; action: string }) =>
      api.post(`/budgets/${id}/${action}`).then(r => r.data),
    onSuccess: (_, { action }) => { toast.success(action === 'activate' ? 'Budget activé' : 'Budget clôturé'); invalidate() },
    onError:   (e: any) => toast.error(e.response?.data?.message ?? 'Erreur'),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete(`/budgets/${id}`),
    onSuccess: () => { toast.success('Budget supprimé'); invalidate() },
    onError:   (e: any) => toast.error(e.response?.data?.message ?? 'Erreur'),
  })

  // ── Helpers ────────────────────────────────────────────────────────────────

  function resetForm() {
    setForm({ name: '', year: currentYear, period_type: 'monthly', notes: '', lines: [] })
  }

  function addLine() {
    setForm(f => ({ ...f, lines: [...f.lines, { account_id: 0, amount: 0 }] }))
  }

  function removeLine(i: number) {
    setForm(f => ({ ...f, lines: f.lines.filter((_, idx) => idx !== i) }))
  }

  function updateLine(i: number, field: keyof BudgetLine, value: any) {
    setForm(f => {
      const lines = [...f.lines]
      lines[i] = { ...lines[i], [field]: value }
      return { ...f, lines }
    })
  }

  function ecartColor(ecart: number, classAccount: string): string {
    if (classAccount === '6') return ecart <= 0 ? 'text-green-600' : 'text-red-600'
    return ecart >= 0 ? 'text-green-600' : 'text-red-600'
  }

  // ── Rendu ──────────────────────────────────────────────────────────────────

  if (comparing) {
    const rows: ComparisonRow[] = comparison?.rows ?? []
    const totals = comparison?.totals

    return (
      <div className="p-6 space-y-4">
        <div className="flex items-center gap-4">
          <button onClick={() => setComparing(null)} className="text-primary hover:underline text-sm">← Retour</button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Budget vs Réalisé</h1>
            <p className="text-sm text-gray-500">{comparing.name} — {comparing.year}</p>
          </div>
        </div>

        {/* Filtres période */}
        {comparing.period_type === 'monthly' && (
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setCompareMonth(null)}
              className={`px-3 py-1 rounded-full text-xs border ${!compareMonth ? 'bg-primary text-white' : 'text-gray-600'}`}
            >
              Annuel
            </button>
            {MONTHS.map((m, i) => (
              <button
                key={i}
                onClick={() => setCompareMonth(i + 1)}
                className={`px-3 py-1 rounded-full text-xs border ${compareMonth === i + 1 ? 'bg-primary text-white' : 'text-gray-600'}`}
              >
                {m}
              </button>
            ))}
          </div>
        )}

        {comparing.period_type === 'quarterly' && (
          <div className="flex gap-2">
            {[null, 1, 2, 3, 4].map(q => (
              <button
                key={q ?? 'all'}
                onClick={() => setCompareQ(q)}
                className={`px-3 py-1 rounded-full text-xs border ${compareQ === q ? 'bg-primary text-white' : 'text-gray-600'}`}
              >
                {q ? `T${q}` : 'Annuel'}
              </button>
            ))}
          </div>
        )}

        {/* Tableau comparaison */}
        {loadingComp ? (
          <div className="p-8 text-center text-gray-400">Chargement...</div>
        ) : (
          <div className="bg-white rounded-xl border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">Compte</th>
                  <th className="px-4 py-3 text-right">Prévu</th>
                  <th className="px-4 py-3 text-right">Réalisé</th>
                  <th className="px-4 py-3 text-right">Écart</th>
                  <th className="px-4 py-3 text-right">Écart %</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((row, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-gray-500 mr-2">{row.account.code}</span>
                      <span className="text-gray-700">{row.account.name}</span>
                    </td>
                    <td className="px-4 py-3 text-right">{row.prevu.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right font-medium">{row.realise.toLocaleString()}</td>
                    <td className={`px-4 py-3 text-right font-medium ${ecartColor(row.ecart, row.account.class)}`}>
                      {row.ecart > 0 ? '+' : ''}{row.ecart.toLocaleString()}
                    </td>
                    <td className={`px-4 py-3 text-right ${ecartColor(row.ecart, row.account.class)}`}>
                      {row.ecart_pct !== null ? `${row.ecart_pct > 0 ? '+' : ''}${row.ecart_pct}%` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
              {totals && (
                <tfoot className="bg-gray-900 text-white text-sm font-bold">
                  <tr>
                    <td className="px-4 py-3">TOTAL</td>
                    <td className="px-4 py-3 text-right">{totals.prevu.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right">{totals.realise.toLocaleString()}</td>
                    <td className={`px-4 py-3 text-right ${totals.ecart >= 0 ? 'text-green-300' : 'text-red-300'}`}>
                      {totals.ecart > 0 ? '+' : ''}{totals.ecart.toLocaleString()}
                    </td>
                    <td className={`px-4 py-3 text-right ${totals.ecart >= 0 ? 'text-green-300' : 'text-red-300'}`}>
                      {totals.ecart_pct !== null ? `${totals.ecart_pct > 0 ? '+' : ''}${totals.ecart_pct}%` : '—'}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Budgets</h1>
          <p className="text-sm text-gray-500">Gestion et suivi budgétaire</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium"
        >
          + Nouveau budget
        </button>
      </div>

      {/* Filtre année */}
      <div className="flex gap-2">
        {[currentYear - 1, currentYear, currentYear + 1].map(y => (
          <button
            key={y}
            onClick={() => setYearFilter(y)}
            className={`px-4 py-2 rounded-lg text-sm border ${yearFilter === y ? 'bg-primary text-white border-primary' : 'bg-white text-gray-600'}`}
          >
            {y}
          </button>
        ))}
      </div>

      {/* Liste budgets */}
      {isLoading ? (
        <div className="p-8 text-center text-gray-400">Chargement...</div>
      ) : budgets.length === 0 ? (
        <div className="p-8 text-center text-gray-400 bg-white rounded-xl border">Aucun budget pour {yearFilter}</div>
      ) : (
        <div className="grid gap-4">
          {budgets.map(b => (
            <div key={b.id} className="bg-white rounded-xl border p-4 flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-gray-900">{b.name}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[b.status]}`}>
                    {STATUS_LABELS[b.status]}
                  </span>
                  <span className="text-xs text-gray-400 capitalize">{b.period_type}</span>
                </div>
                <div className="text-sm text-gray-500">
                  {b.year} · {b.lines?.length ?? '?'} lignes
                  {b.notes && <span className="ml-2">· {b.notes}</span>}
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => { setComparing(b); setCompareMonth(null); setCompareQ(null) }}
                  className="px-3 py-1.5 border border-primary text-primary rounded-lg text-xs hover:bg-primary/5"
                >
                  Comparaison
                </button>
                {b.status === 'draft' && (
                  <>
                    <button
                      onClick={() => actionMut.mutate({ id: b.id, action: 'activate' })}
                      className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs"
                    >
                      Activer
                    </button>
                    <button
                      onClick={() => deleteMut.mutate(b.id)}
                      className="px-3 py-1.5 text-red-600 border border-red-200 rounded-lg text-xs"
                    >
                      Supprimer
                    </button>
                  </>
                )}
                {b.status === 'active' && (
                  <button
                    onClick={() => actionMut.mutate({ id: b.id, action: 'close' })}
                    className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs"
                  >
                    Clôturer
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal création */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b flex justify-between">
              <h2 className="text-lg font-bold">Nouveau budget</h2>
              <button onClick={() => { setShowForm(false); resetForm() }} className="text-gray-400">✕</button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nom du budget</label>
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Ex: Budget 2026" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Année</label>
                  <input type="number" value={form.year} onChange={e => setForm(f => ({ ...f, year: Number(e.target.value) }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type de période</label>
                <div className="flex gap-3">
                  {(['monthly', 'quarterly', 'annual'] as PeriodType[]).map(pt => (
                    <label key={pt} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="radio" value={pt} checked={form.period_type === pt} onChange={() => setForm(f => ({ ...f, period_type: pt }))} />
                      <span>{pt === 'monthly' ? 'Mensuel' : pt === 'quarterly' ? 'Trimestriel' : 'Annuel'}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Notes..." />
              </div>

              {/* Lignes budgétaires */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-sm font-medium text-gray-700">Lignes budgétaires</label>
                  <button onClick={addLine} className="text-xs text-primary hover:underline">+ Ajouter</button>
                </div>

                {form.lines.length === 0 ? (
                  <div className="text-center text-gray-400 text-sm py-4 border-dashed border-2 rounded-lg">
                    Aucune ligne — cliquez sur "Ajouter"
                  </div>
                ) : (
                  <div className="space-y-2">
                    {form.lines.map((line, i) => (
                      <div key={i} className="flex gap-2 items-center">
                        <select
                          value={line.account_id || ''}
                          onChange={e => updateLine(i, 'account_id', Number(e.target.value))}
                          className="flex-1 border rounded-lg px-3 py-2 text-sm"
                        >
                          <option value="">-- Compte --</option>
                          {accounts.map(a => (
                            <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                          ))}
                        </select>
                        {form.period_type === 'monthly' && (
                          <select
                            value={line.month ?? ''}
                            onChange={e => updateLine(i, 'month', Number(e.target.value) || null)}
                            className="border rounded-lg px-2 py-2 text-sm w-24"
                          >
                            <option value="">Tous</option>
                            {MONTHS.map((m, mi) => (
                              <option key={mi} value={mi + 1}>{m}</option>
                            ))}
                          </select>
                        )}
                        <input
                          type="number"
                          placeholder="Montant"
                          value={line.amount || ''}
                          onChange={e => updateLine(i, 'amount', Number(e.target.value))}
                          className="border rounded-lg px-3 py-2 text-sm w-32 text-right"
                        />
                        <button onClick={() => removeLine(i)} className="text-red-400 hover:text-red-600">✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="p-6 border-t flex justify-end gap-3">
              <button onClick={() => { setShowForm(false); resetForm() }} className="px-4 py-2 border rounded-lg text-sm">Annuler</button>
              <button
                onClick={() => createMut.mutate(form)}
                disabled={createMut.isPending || !form.name || form.lines.length === 0}
                className="px-4 py-2 bg-primary text-white rounded-lg text-sm disabled:opacity-50"
              >
                {createMut.isPending ? 'Création...' : 'Créer le budget'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
