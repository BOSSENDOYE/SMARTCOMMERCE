import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import api from '../../lib/api'
import { formatDate } from '../../lib/format'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Account { id: number; code: string; name: string }

interface JournalLine {
  id: number
  account_id: number
  label: string
  debit: string
  credit: string
  reconciliation_id: number | null
  journal_entry?: { id: number; reference: string; entry_date: string; description: string }
}

interface Reconciliation {
  id: number
  reference: string
  account: Account
  lettered_at: string
  amount_debit: string
  amount_credit: string
  difference: string
  notes?: string
  lettered_by?: { name: string }
  lines?: JournalLine[]
}

// ── Composant principal ───────────────────────────────────────────────────────

export default function ReconciliationPage() {
  const qc = useQueryClient()

  const [accountId, setAccountId]       = useState<number | null>(null)
  const [selectedLines, setSelectedLines] = useState<Set<number>>(new Set())
  const [notes, setNotes]               = useState('')
  const [expanded, setExpanded]         = useState<number | null>(null)

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: accounts } = useQuery<Account[]>({
    queryKey: ['accounting-accounts'],
    queryFn: () => api.get('/accounting/accounts').then(r => r.data),
  })

  const { data: reconciliations, isLoading: loadingRecs } = useQuery<{ data: Reconciliation[] }>({
    queryKey: ['reconciliations', accountId],
    queryFn: () => api.get(`/reconciliations${accountId ? `?account_id=${accountId}` : ''}`).then(r => r.data),
  })

  const { data: availableLines, isLoading: loadingLines } = useQuery<JournalLine[]>({
    queryKey: ['reconciliation-lines', accountId],
    queryFn: () => api.get(`/reconciliations/available-lines?account_id=${accountId}`).then(r => r.data),
    enabled: !!accountId,
  })

  const { data: recDetail } = useQuery<Reconciliation>({
    queryKey: ['reconciliation', expanded],
    queryFn: () => api.get(`/reconciliations/${expanded}`).then(r => r.data),
    enabled: !!expanded,
  })

  // ── Mutations ──────────────────────────────────────────────────────────────

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['reconciliations'] })
    qc.invalidateQueries({ queryKey: ['reconciliation-lines'] })
  }

  const letterMut = useMutation({
    mutationFn: () => api.post('/reconciliations', {
      account_id: accountId,
      line_ids: Array.from(selectedLines),
      notes: notes || undefined,
    }).then(r => r.data),
    onSuccess: (data) => {
      if (data.warning) toast(data.warning, { icon: '⚠️' })
      else toast.success('Lettrage effectué')
      setSelectedLines(new Set())
      setNotes('')
      invalidate()
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Erreur'),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete(`/reconciliations/${id}`),
    onSuccess: () => { toast.success('Lettrage annulé'); invalidate() },
    onError:   (e: any) => toast.error(e.response?.data?.message ?? 'Erreur'),
  })

  // ── Calculs ────────────────────────────────────────────────────────────────

  const lines = availableLines ?? []
  const selLines = lines.filter(l => selectedLines.has(l.id))
  const selDebit  = selLines.reduce((s, l) => s + parseFloat(l.debit || '0'), 0)
  const selCredit = selLines.reduce((s, l) => s + parseFloat(l.credit || '0'), 0)
  const selDiff   = Math.abs(selDebit - selCredit)

  function toggleLine(id: number) {
    setSelectedLines(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const recs: Reconciliation[] = reconciliations?.data ?? []

  // ── Rendu ──────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Lettrage comptable</h1>
        <p className="text-sm text-gray-500">Rapprocher les débits et crédits d'un même compte</p>
      </div>

      {/* Sélecteur de compte */}
      <div className="bg-white rounded-xl border p-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">Compte à lettrer</label>
        <select
          value={accountId ?? ''}
          onChange={e => { setAccountId(Number(e.target.value) || null); setSelectedLines(new Set()) }}
          className="border rounded-lg px-3 py-2 text-sm w-80"
        >
          <option value="">-- Sélectionner un compte --</option>
          {accounts?.filter(a => ['4', '5'].includes(a.code[0])).map(a => (
            <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
          ))}
        </select>
      </div>

      {/* Zone de lettrage */}
      {accountId && (
        <div className="bg-white rounded-xl border">
          <div className="p-4 border-b">
            <h2 className="font-semibold text-gray-800">Lignes disponibles (non lettrées)</h2>
          </div>

          {loadingLines ? (
            <div className="p-6 text-center text-gray-400">Chargement...</div>
          ) : lines.length === 0 ? (
            <div className="p-6 text-center text-gray-400">Toutes les lignes sont lettrées</div>
          ) : (
            <>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                  <tr>
                    <th className="px-4 py-3 w-8">
                      <input type="checkbox"
                        checked={selectedLines.size === lines.length && lines.length > 0}
                        onChange={e => setSelectedLines(e.target.checked ? new Set(lines.map(l => l.id)) : new Set())}
                      />
                    </th>
                    <th className="px-4 py-3 text-left">Date</th>
                    <th className="px-4 py-3 text-left">Pièce</th>
                    <th className="px-4 py-3 text-left">Libellé</th>
                    <th className="px-4 py-3 text-right">Débit</th>
                    <th className="px-4 py-3 text-right">Crédit</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {lines.map(line => (
                    <tr
                      key={line.id}
                      className={`cursor-pointer hover:bg-blue-50 ${selectedLines.has(line.id) ? 'bg-blue-50' : ''}`}
                      onClick={() => toggleLine(line.id)}
                    >
                      <td className="px-4 py-2">
                        <input type="checkbox" checked={selectedLines.has(line.id)} onChange={() => {}} />
                      </td>
                      <td className="px-4 py-2 text-gray-600">
                        {line.journal_entry?.entry_date ? formatDate(line.journal_entry.entry_date) : '—'}
                      </td>
                      <td className="px-4 py-2 font-mono text-xs text-primary">{line.journal_entry?.reference}</td>
                      <td className="px-4 py-2 text-gray-700">{line.label}</td>
                      <td className="px-4 py-2 text-right font-medium text-green-700">
                        {parseFloat(line.debit) > 0 ? parseFloat(line.debit).toLocaleString() : '—'}
                      </td>
                      <td className="px-4 py-2 text-right font-medium text-red-700">
                        {parseFloat(line.credit) > 0 ? parseFloat(line.credit).toLocaleString() : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Barre de lettrage */}
              {selectedLines.size >= 2 && (
                <div className="p-4 border-t bg-blue-50 flex items-center gap-4 flex-wrap">
                  <div className="text-sm">
                    <span className="text-gray-600">{selectedLines.size} lignes sélectionnées</span>
                    <span className="ml-4 text-green-700">Débit: {selDebit.toLocaleString()}</span>
                    <span className="ml-2 text-red-700">Crédit: {selCredit.toLocaleString()}</span>
                    {selDiff > 0.01 && (
                      <span className="ml-2 text-orange-600 font-medium">Écart: {selDiff.toLocaleString()}</span>
                    )}
                    {selDiff <= 0.01 && (
                      <span className="ml-2 text-green-600 font-medium">✓ Équilibré</span>
                    )}
                  </div>
                  <input
                    type="text"
                    placeholder="Notes (optionnel)"
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    className="border rounded px-3 py-1 text-sm flex-1 max-w-xs"
                  />
                  <button
                    onClick={() => letterMut.mutate()}
                    disabled={letterMut.isPending}
                    className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium"
                  >
                    {letterMut.isPending ? '...' : 'Lettrer la sélection'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Lettrages existants */}
      <div className="bg-white rounded-xl border">
        <div className="p-4 border-b">
          <h2 className="font-semibold text-gray-800">Lettrages existants</h2>
        </div>

        {loadingRecs ? (
          <div className="p-6 text-center text-gray-400">Chargement...</div>
        ) : recs.length === 0 ? (
          <div className="p-6 text-center text-gray-400">Aucun lettrage{accountId ? ' pour ce compte' : ''}</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Référence</th>
                <th className="px-4 py-3 text-left">Compte</th>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-right">Débit</th>
                <th className="px-4 py-3 text-right">Crédit</th>
                <th className="px-4 py-3 text-right">Écart</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {recs.map(rec => (
                <>
                  <tr key={rec.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-primary font-medium">{rec.reference}</td>
                    <td className="px-4 py-3 text-gray-700">{rec.account?.code} — {rec.account?.name}</td>
                    <td className="px-4 py-3 text-gray-600">{formatDate(rec.lettered_at)}</td>
                    <td className="px-4 py-3 text-right text-green-700">{parseFloat(rec.amount_debit).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-red-700">{parseFloat(rec.amount_credit).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right">
                      {parseFloat(rec.difference) > 0.01
                        ? <span className="text-orange-600 font-medium">{parseFloat(rec.difference).toLocaleString()}</span>
                        : <span className="text-green-600">✓</span>
                      }
                    </td>
                    <td className="px-4 py-3 text-right flex gap-2 justify-end">
                      <button
                        onClick={() => setExpanded(expanded === rec.id ? null : rec.id)}
                        className="text-primary hover:underline text-xs"
                      >
                        {expanded === rec.id ? 'Fermer' : 'Voir'}
                      </button>
                      <button
                        onClick={() => deleteMut.mutate(rec.id)}
                        className="text-red-500 hover:underline text-xs"
                      >
                        Délettrer
                      </button>
                    </td>
                  </tr>

                  {expanded === rec.id && recDetail && (
                    <tr key={`detail-${rec.id}`}>
                      <td colSpan={7} className="bg-blue-50 px-4 py-3">
                        <div className="text-xs text-gray-600 space-y-1">
                          {recDetail.lines?.map(l => (
                            <div key={l.id} className="flex gap-4">
                              <span className="font-mono">{l.journal_entry?.reference}</span>
                              <span>{l.label}</span>
                              {parseFloat(l.debit) > 0 && <span className="text-green-700">D: {parseFloat(l.debit).toLocaleString()}</span>}
                              {parseFloat(l.credit) > 0 && <span className="text-red-700">C: {parseFloat(l.credit).toLocaleString()}</span>}
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
