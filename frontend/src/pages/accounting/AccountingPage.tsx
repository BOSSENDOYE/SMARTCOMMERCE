import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../lib/api'
import { formatCurrency, formatDate, downloadPdf } from '../../lib/format'
import { BookOpen, Plus, RefreshCw, CheckCircle, ChevronRight, AlertCircle, TrendingUp, TrendingDown, Download } from 'lucide-react'
import toast from 'react-hot-toast'
import { useConfirm } from '../../hooks/useConfirm'

// ─── Types ────────────────────────────────────────────────────────────────────

type AccountingTab = 'plan' | 'journal' | 'ledger' | 'balance' | 'resultat' | 'bilan'

interface Account {
  id: number
  code: string
  name: string
  class: string
  nature: 'actif' | 'passif' | 'charge' | 'produit' | 'tresorerie'
  is_system: boolean
  is_active: boolean
}

interface JournalLine {
  account_id: number
  label: string
  debit: number
  credit: number
}

interface JournalEntryLine extends JournalLine {
  id: number
  account?: Account
}

interface JournalEntry {
  id: number
  reference: string
  entry_date: string
  description: string
  type: string
  status: 'brouillon' | 'valide'
  created_by?: { name: string }
  lines: JournalEntryLine[]
}

interface BalanceRow {
  id: number
  code: string
  name: string
  class: string
  nature: string
  total_debit: number
  total_credit: number
  solde: number
}

interface LedgerLine {
  id: number
  date: string
  reference: string
  description: string
  type: string
  debit: number
  credit: number
  solde: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  vente: 'Vente', achat: 'Achat', paiement: 'Paiement', charge: 'Charge',
  ajustement: 'Ajustement', perte: 'Perte', autre: 'Autre',
}

const CLASS_LABELS: Record<string, string> = {
  '1': 'Cl. 1 — Ressources durables',
  '2': 'Cl. 2 — Actif immobilisé',
  '3': 'Cl. 3 — Stocks',
  '4': 'Cl. 4 — Tiers',
  '5': 'Cl. 5 — Trésorerie',
  '6': 'Cl. 6 — Charges',
  '7': 'Cl. 7 — Produits',
}

function statusBadge(status: string) {
  return status === 'valide'
    ? <span className="badge-success">Validé</span>
    : <span className="badge-warning">Brouillon</span>
}

function ExportPdf({ path, filename, params }: {
  path: string
  filename: string
  params?: Record<string, string>
}) {
  const [loading, setLoading] = useState(false)
  const handle = async () => {
    setLoading(true)
    try { await downloadPdf(path, filename, params) }
    catch { toast.error('Erreur lors de la génération du PDF') }
    finally { setLoading(false) }
  }
  return (
    <button onClick={handle} disabled={loading} className="btn-secondary flex items-center gap-2 text-sm">
      <Download size={14} className={loading ? 'animate-spin' : ''} />
      {loading ? 'Génération…' : 'Exporter PDF'}
    </button>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AccountingPage() {
  const [tab, setTab] = useState<AccountingTab>('plan')
  const [dateFrom, setDateFrom] = useState(new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10))
  const [dateTo,   setDateTo]   = useState(new Date().toISOString().slice(0, 10))
  const qc = useQueryClient()

  const tabs: { id: AccountingTab; label: string }[] = [
    { id: 'plan',     label: 'Plan comptable' },
    { id: 'journal',  label: 'Journal' },
    { id: 'ledger',   label: 'Grand livre' },
    { id: 'balance',  label: 'Balance' },
    { id: 'resultat', label: 'Résultat' },
    { id: 'bilan',    label: 'Bilan OHADA' },
  ]

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <BookOpen size={24} /> Comptabilité
        </h1>
      </div>

      {/* Date filter (partagé entre tous les onglets sauf plan) */}
      {tab !== 'plan' && (
        <div className="card p-4 flex flex-wrap items-center gap-4">
          <span className="text-sm text-gray-500 font-medium">Période :</span>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">Du</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="input w-40" />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">au</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="input w-40" />
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b overflow-x-auto">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              tab === t.id ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === 'plan'     && <PlanComptable qc={qc} />}
      {tab === 'journal'  && <Journal dateFrom={dateFrom} dateTo={dateTo} qc={qc} />}
      {tab === 'ledger'   && <GrandLivre dateFrom={dateFrom} dateTo={dateTo} />}
      {tab === 'balance'  && <Balance dateFrom={dateFrom} dateTo={dateTo} />}
      {tab === 'resultat' && <Resultat dateFrom={dateFrom} dateTo={dateTo} />}
      {tab === 'bilan'    && <Bilan dateTo={dateTo} />}
    </div>
  )
}

// ─── Plan Comptable ────────────────────────────────────────────────────────────

function PlanComptable({ qc }: { qc: ReturnType<typeof useQueryClient> }) {
  const confirm = useConfirm()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm]         = useState({ code: '', name: '', class: '7', nature: 'produit' as Account['nature'] })

  const { data: accounts = [], isLoading } = useQuery<Account[]>({
    queryKey: ['accounting-accounts'],
    queryFn: () => api.get('/accounting/accounts').then(r => r.data),
  })

  const initMut = useMutation({
    mutationFn: () => api.post('/accounting/accounts/init'),
    onSuccess: (r) => { toast.success(r.data.message); qc.invalidateQueries({ queryKey: ['accounting-accounts'] }) },
    onError:   () => toast.error('Erreur lors de l\'initialisation'),
  })

  const createMut = useMutation({
    mutationFn: (data: typeof form) => api.post('/accounting/accounts', data),
    onSuccess: () => { toast.success('Compte créé'); qc.invalidateQueries({ queryKey: ['accounting-accounts'] }); setShowForm(false); setForm({ code: '', name: '', class: '7', nature: 'produit' }) },
    onError:   (e: { response?: { data?: { message?: string } } }) => toast.error(e.response?.data?.message ?? 'Erreur'),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete(`/accounting/accounts/${id}`),
    onSuccess: () => { toast.success('Compte supprimé'); qc.invalidateQueries({ queryKey: ['accounting-accounts'] }) },
    onError:   (e: { response?: { data?: { message?: string } } }) => toast.error(e.response?.data?.message ?? 'Erreur'),
  })

  // Grouper par classe
  const grouped = accounts.reduce<Record<string, Account[]>>((acc, a) => {
    (acc[a.class] ??= []).push(a)
    return acc
  }, {})

  return (
    <div className="space-y-4">
      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        {accounts.length === 0 && (
          <button
            onClick={() => initMut.mutate()}
            disabled={initMut.isPending}
            className="btn-primary flex items-center gap-2"
          >
            <RefreshCw size={16} className={initMut.isPending ? 'animate-spin' : ''} />
            Initialiser SYSCOHADA
          </button>
        )}
        <button onClick={() => setShowForm(!showForm)} className="btn-secondary flex items-center gap-2">
          <Plus size={16} /> Nouveau compte
        </button>
      </div>

      {/* Formulaire */}
      {showForm && (
        <div className="card p-4 space-y-3 border-l-4 border-primary">
          <h3 className="font-semibold text-gray-800">Nouveau compte</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Code *</label>
              <input className="input" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} placeholder="ex: 612" />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-gray-500 mb-1 block">Intitulé *</label>
              <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="ex: Frais téléphone" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Classe</label>
              <select className="input" value={form.class} onChange={e => setForm(f => ({ ...f, class: e.target.value }))}>
                {['1','2','3','4','5','6','7'].map(c => <option key={c} value={c}>Classe {c}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-3 mt-1">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Nature</label>
              <select className="input w-40" value={form.nature} onChange={e => setForm(f => ({ ...f, nature: e.target.value as Account['nature'] }))}>
                <option value="actif">Actif</option>
                <option value="passif">Passif</option>
                <option value="charge">Charge</option>
                <option value="produit">Produit</option>
                <option value="tresorerie">Trésorerie</option>
              </select>
            </div>
            <div className="flex items-end gap-2">
              <button onClick={() => createMut.mutate(form)} disabled={createMut.isPending || !form.code || !form.name} className="btn-primary">
                Créer
              </button>
              <button onClick={() => setShowForm(false)} className="btn-secondary">Annuler</button>
            </div>
          </div>
        </div>
      )}

      {isLoading && <div className="text-center py-8 text-gray-400">Chargement…</div>}

      {accounts.length === 0 && !isLoading && (
        <div className="card p-8 text-center text-gray-400">
          <BookOpen size={40} className="mx-auto mb-3 opacity-40" />
          <p className="font-medium">Plan comptable vide</p>
          <p className="text-sm mt-1">Cliquez sur "Initialiser SYSCOHADA" pour charger le plan de base.</p>
        </div>
      )}

      {/* Comptes groupés */}
      {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([cls, items]) => (
        <div key={cls} className="card p-0 overflow-hidden">
          <div className="bg-gray-50 px-4 py-2 border-b">
            <span className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
              {CLASS_LABELS[cls] ?? `Classe ${cls}`}
            </span>
          </div>
          <table className="w-full text-sm">
            <tbody className="divide-y">
              {items.map(a => (
                <tr key={a.id} className={`hover:bg-gray-50 ${!a.is_active ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-2.5 font-mono text-gray-600 w-24">{a.code}</td>
                  <td className="px-4 py-2.5 font-medium text-gray-900">{a.name}</td>
                  <td className="px-4 py-2.5">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 capitalize">{a.nature}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {a.is_system
                      ? <span className="text-xs text-gray-400">Système</span>
                      : (
                        <button
                          onClick={async () => { if (await confirm(`Supprimer le compte ${a.code} ?`, { danger: true })) deleteMut.mutate(a.id) }}
                          className="text-xs text-red-500 hover:text-red-700"
                        >
                          Supprimer
                        </button>
                      )
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}

// ─── Journal ──────────────────────────────────────────────────────────────────

function Journal({
  dateFrom, dateTo, qc,
}: { dateFrom: string; dateTo: string; qc: ReturnType<typeof useQueryClient> }) {
  const [expanded, setExpanded]   = useState<number | null>(null)
  const [showForm,  setShowForm]  = useState(false)
  const [genDate,   setGenDate]   = useState({ from: dateFrom, to: dateTo })

  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: ['accounting-accounts'],
    queryFn: () => api.get('/accounting/accounts').then(r => r.data),
  })

  const { data: journal, isLoading } = useQuery({
    queryKey: ['journal', dateFrom, dateTo],
    queryFn: () => api.get('/accounting/journal', { params: { date_from: dateFrom, date_to: dateTo, per_page: 100 } }).then(r => r.data),
  })

  const entries: JournalEntry[] = journal?.data ?? []

  const validateMut = useMutation({
    mutationFn: (id: number) => api.post(`/accounting/journal/${id}/validate`),
    onSuccess: () => { toast.success('Écriture validée'); qc.invalidateQueries({ queryKey: ['journal'] }) },
    onError:   (e: { response?: { data?: { message?: string } } }) => toast.error(e.response?.data?.message ?? 'Erreur'),
  })

  const genSalesMut = useMutation({
    mutationFn: () => api.post('/accounting/generate/sales', { date_from: genDate.from, date_to: genDate.to }),
    onSuccess: (r) => { toast.success(r.data.message); qc.invalidateQueries({ queryKey: ['journal'] }) },
    onError:   (e: { response?: { data?: { message?: string } } }) => toast.error(e.response?.data?.message ?? 'Erreur génération'),
  })

  const genPurchMut = useMutation({
    mutationFn: () => api.post('/accounting/generate/purchases', { date_from: genDate.from, date_to: genDate.to }),
    onSuccess: (r) => { toast.success(r.data.message); qc.invalidateQueries({ queryKey: ['journal'] }) },
    onError:   (e: { response?: { data?: { message?: string } } }) => toast.error(e.response?.data?.message ?? 'Erreur génération'),
  })

  const genExpMut = useMutation({
    mutationFn: () => api.post('/accounting/generate/expenses', { date_from: genDate.from, date_to: genDate.to }),
    onSuccess: (r) => { toast.success(r.data.message); qc.invalidateQueries({ queryKey: ['journal'] }) },
    onError:   (e: { response?: { data?: { message?: string } } }) => toast.error(e.response?.data?.message ?? 'Erreur génération'),
  })

  return (
    <div className="space-y-4">
      {/* Actions */}
      <div className="card p-4 space-y-3">
        <p className="text-sm font-medium text-gray-700">Générer les écritures automatiquement</p>
        <div className="flex flex-wrap gap-3 items-center">
          <input type="date" value={genDate.from} onChange={e => setGenDate(d => ({ ...d, from: e.target.value }))} className="input w-36" />
          <span className="text-gray-400 text-sm">→</span>
          <input type="date" value={genDate.to}   onChange={e => setGenDate(d => ({ ...d, to: e.target.value }))}   className="input w-36" />
          <button onClick={() => genSalesMut.mutate()} disabled={genSalesMut.isPending} className="btn-primary flex items-center gap-2 text-sm">
            <RefreshCw size={14} className={genSalesMut.isPending ? 'animate-spin' : ''} /> Ventes
          </button>
          <button onClick={() => genPurchMut.mutate()} disabled={genPurchMut.isPending} className="btn-secondary flex items-center gap-2 text-sm">
            <RefreshCw size={14} className={genPurchMut.isPending ? 'animate-spin' : ''} /> Achats fournisseurs
          </button>
          <button onClick={() => genExpMut.mutate()} disabled={genExpMut.isPending} className="btn-secondary flex items-center gap-2 text-sm">
            <RefreshCw size={14} className={genExpMut.isPending ? 'animate-spin' : ''} /> Dépenses
          </button>
          <div className="ml-auto flex items-center gap-2">
            <ExportPdf
              path="/pdf/accounting/journal"
              filename={`Journal-${dateFrom}-${dateTo}.pdf`}
              params={{ date_from: dateFrom, date_to: dateTo }}
            />
            <button onClick={() => setShowForm(!showForm)} className="btn-secondary flex items-center gap-2 text-sm">
              <Plus size={14} /> Écriture manuelle
            </button>
          </div>
        </div>
      </div>

      {/* Formulaire écriture manuelle */}
      {showForm && (
        <ManualEntryForm accounts={accounts} onClose={() => setShowForm(false)} qc={qc} />
      )}

      {isLoading && <div className="text-center py-8 text-gray-400">Chargement…</div>}

      {/* Liste des écritures */}
      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-600 w-8"></th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Référence</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Date</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Libellé</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Type</th>
              <th className="px-4 py-3 text-right font-medium text-gray-600">Total débit</th>
              <th className="px-4 py-3 text-center font-medium text-gray-600">Statut</th>
              <th className="px-4 py-3 text-right font-medium text-gray-600">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {entries.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">Aucune écriture sur cette période.</td></tr>
            )}
            {entries.map(entry => (
              <>
                <tr key={entry.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => setExpanded(expanded === entry.id ? null : entry.id)} className="text-gray-400 hover:text-gray-700">
                      <ChevronRight size={14} className={`transition-transform ${expanded === entry.id ? 'rotate-90' : ''}`} />
                    </button>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">{entry.reference}</td>
                  <td className="px-4 py-3 text-gray-700">{formatDate(entry.entry_date)}</td>
                  <td className="px-4 py-3 font-medium text-gray-900 max-w-xs truncate">{entry.description}</td>
                  <td className="px-4 py-3 text-gray-500">{TYPE_LABELS[entry.type] ?? entry.type}</td>
                  <td className="px-4 py-3 text-right font-semibold text-primary">{formatCurrency(entry.lines?.reduce((s, l) => s + l.debit, 0) ?? 0)}</td>
                  <td className="px-4 py-3 text-center">{statusBadge(entry.status)}</td>
                  <td className="px-4 py-3 text-right">
                    {entry.status === 'brouillon' && (
                      <button
                        onClick={() => validateMut.mutate(entry.id)}
                        disabled={validateMut.isPending}
                        className="text-xs flex items-center gap-1 text-green-600 hover:text-green-800 ml-auto"
                      >
                        <CheckCircle size={13} /> Valider
                      </button>
                    )}
                  </td>
                </tr>
                {expanded === entry.id && (
                  <tr key={`${entry.id}-detail`}>
                    <td></td>
                    <td colSpan={7} className="px-4 pb-3">
                      <table className="w-full text-xs border rounded-lg overflow-hidden">
                        <thead className="bg-gray-100">
                          <tr>
                            <th className="text-left px-3 py-2 font-medium text-gray-600">Compte</th>
                            <th className="text-left px-3 py-2 font-medium text-gray-600">Libellé</th>
                            <th className="text-right px-3 py-2 font-medium text-gray-600">Débit</th>
                            <th className="text-right px-3 py-2 font-medium text-gray-600">Crédit</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {entry.lines?.map(line => (
                            <tr key={line.id} className="bg-white">
                              <td className="px-3 py-1.5 font-mono text-gray-500">
                                {line.account?.code} — {line.account?.name}
                              </td>
                              <td className="px-3 py-1.5 text-gray-700">{line.label}</td>
                              <td className="px-3 py-1.5 text-right text-blue-700">{line.debit > 0 ? formatCurrency(line.debit) : '—'}</td>
                              <td className="px-3 py-1.5 text-right text-orange-600">{line.credit > 0 ? formatCurrency(line.credit) : '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Formulaire écriture manuelle ─────────────────────────────────────────────

function ManualEntryForm({
  accounts, onClose, qc,
}: { accounts: Account[]; onClose: () => void; qc: ReturnType<typeof useQueryClient> }) {
  const [description, setDescription] = useState('')
  const [date,        setDate]        = useState(new Date().toISOString().slice(0, 10))
  const [type,        setType]        = useState('autre')
  const [lines, setLines] = useState<JournalLine[]>([
    { account_id: 0, label: '', debit: 0, credit: 0 },
    { account_id: 0, label: '', debit: 0, credit: 0 },
  ])

  const totalDebit  = lines.reduce((s, l) => s + (l.debit  || 0), 0)
  const totalCredit = lines.reduce((s, l) => s + (l.credit || 0), 0)
  const isBalanced  = Math.abs(totalDebit - totalCredit) < 0.01

  const createMut = useMutation({
    mutationFn: () => api.post('/accounting/journal', { entry_date: date, description, type, lines }),
    onSuccess: () => { toast.success('Écriture créée'); qc.invalidateQueries({ queryKey: ['journal'] }); onClose() },
    onError:   (e: { response?: { data?: { message?: string } } }) => toast.error(e.response?.data?.message ?? 'Erreur'),
  })

  const updateLine = (i: number, field: keyof JournalLine, value: string | number) => {
    setLines(prev => prev.map((l, idx) => idx === i ? { ...l, [field]: value } : l))
  }

  return (
    <div className="card p-4 border-l-4 border-primary space-y-3">
      <h3 className="font-semibold text-gray-800">Écriture manuelle</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Date</label>
          <input type="date" className="input" value={date} onChange={e => setDate(e.target.value)} />
        </div>
        <div className="md:col-span-2">
          <label className="text-xs text-gray-500 mb-1 block">Libellé *</label>
          <input className="input" placeholder="Description de l'écriture" value={description} onChange={e => setDescription(e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Type</label>
          <select className="input" value={type} onChange={e => setType(e.target.value)}>
            {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
      </div>

      {/* Lignes */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm border rounded-lg overflow-hidden">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-3 py-2 font-medium text-gray-600">Compte</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600">Libellé ligne</th>
              <th className="text-right px-3 py-2 font-medium text-gray-600 w-32">Débit</th>
              <th className="text-right px-3 py-2 font-medium text-gray-600 w-32">Crédit</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {lines.map((line, i) => (
              <tr key={i}>
                <td className="px-3 py-1.5">
                  <select className="input text-xs" value={line.account_id} onChange={e => updateLine(i, 'account_id', Number(e.target.value))}>
                    <option value={0}>— Choisir —</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                  </select>
                </td>
                <td className="px-3 py-1.5">
                  <input className="input text-xs" value={line.label} onChange={e => updateLine(i, 'label', e.target.value)} placeholder="Libellé" />
                </td>
                <td className="px-3 py-1.5">
                  <input type="number" className="input text-xs text-right" min={0} value={line.debit || ''} onChange={e => updateLine(i, 'debit', parseFloat(e.target.value) || 0)} />
                </td>
                <td className="px-3 py-1.5">
                  <input type="number" className="input text-xs text-right" min={0} value={line.credit || ''} onChange={e => updateLine(i, 'credit', parseFloat(e.target.value) || 0)} />
                </td>
                <td className="px-3 py-1.5 text-center">
                  {lines.length > 2 && (
                    <button onClick={() => setLines(prev => prev.filter((_, idx) => idx !== i))} className="text-red-400 hover:text-red-600 text-xs">✕</button>
                  )}
                </td>
              </tr>
            ))}
            {/* Totaux */}
            <tr className="bg-gray-50 font-semibold text-sm">
              <td colSpan={2} className="px-3 py-2 text-right text-gray-600">Totaux</td>
              <td className="px-3 py-2 text-right text-blue-700">{formatCurrency(totalDebit)}</td>
              <td className="px-3 py-2 text-right text-orange-600">{formatCurrency(totalCredit)}</td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </div>

      {!isBalanced && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
          <AlertCircle size={14} />
          L'écriture n'est pas équilibrée — écart : {formatCurrency(Math.abs(totalDebit - totalCredit))}
        </div>
      )}

      <div className="flex gap-2">
        <button onClick={() => setLines(prev => [...prev, { account_id: 0, label: '', debit: 0, credit: 0 }])} className="btn-secondary text-sm">+ Ligne</button>
        <button
          onClick={() => createMut.mutate()}
          disabled={createMut.isPending || !description || !isBalanced || lines.some(l => !l.account_id)}
          className="btn-primary text-sm"
        >
          Enregistrer
        </button>
        <button onClick={onClose} className="btn-secondary text-sm">Annuler</button>
      </div>
    </div>
  )
}

// ─── Grand Livre ──────────────────────────────────────────────────────────────

function GrandLivre({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: ['accounting-accounts'],
    queryFn: () => api.get('/accounting/accounts').then(r => r.data),
  })

  const { data: ledger, isLoading } = useQuery({
    queryKey: ['ledger', selectedId, dateFrom, dateTo],
    queryFn: () => api.get(`/accounting/ledger/${selectedId}`, { params: { date_from: dateFrom, date_to: dateTo } }).then(r => r.data),
    enabled: !!selectedId,
  })

  const lines: LedgerLine[] = ledger?.lines ?? []
  const totals = ledger?.totals

  return (
    <div className="space-y-4">
      {/* Sélection du compte */}
      <div className="card p-4">
        <label className="text-sm font-medium text-gray-700 block mb-2">Sélectionner un compte</label>
        <select
          className="input max-w-sm"
          value={selectedId ?? ''}
          onChange={e => setSelectedId(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">— Choisir un compte —</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
        </select>
      </div>

      {!selectedId && (
        <div className="text-center py-8 text-gray-400">Sélectionnez un compte pour afficher son grand livre.</div>
      )}

      {selectedId && isLoading && <div className="text-center py-8 text-gray-400">Chargement…</div>}

      {selectedId && !isLoading && (
        <div className="card p-0 overflow-hidden">
          <div className="bg-gray-50 px-4 py-3 border-b flex items-center justify-between">
            <span className="font-semibold text-gray-700">{ledger?.account?.code} — {ledger?.account?.name}</span>
            {totals && (
              <div className="flex gap-6 text-sm">
                <span className="text-blue-700 font-medium">Débit : {formatCurrency(totals.debit)}</span>
                <span className="text-orange-600 font-medium">Crédit : {formatCurrency(totals.credit)}</span>
                <span className={`font-bold ${totals.solde >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                  Solde : {formatCurrency(Math.abs(totals.solde))} {totals.solde >= 0 ? 'D' : 'C'}
                </span>
              </div>
            )}
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Date</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Réf.</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Libellé</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">Débit</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">Crédit</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">Solde</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {lines.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">Aucun mouvement sur cette période.</td></tr>
              )}
              {lines.map(line => (
                <tr key={line.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 text-gray-600">{formatDate(line.date)}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{line.reference}</td>
                  <td className="px-4 py-2.5 text-gray-800">{line.description}</td>
                  <td className="px-4 py-2.5 text-right text-blue-700">{line.debit > 0 ? formatCurrency(line.debit) : ''}</td>
                  <td className="px-4 py-2.5 text-right text-orange-600">{line.credit > 0 ? formatCurrency(line.credit) : ''}</td>
                  <td className={`px-4 py-2.5 text-right font-semibold ${line.solde >= 0 ? 'text-gray-800' : 'text-red-600'}`}>
                    {formatCurrency(Math.abs(line.solde))} {line.solde >= 0 ? 'D' : 'C'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Balance des comptes ──────────────────────────────────────────────────────

function Balance({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['trial-balance', dateFrom, dateTo],
    queryFn: () => api.get('/accounting/trial-balance', { params: { date_from: dateFrom, date_to: dateTo } }).then(r => r.data),
  })

  const rows: BalanceRow[] = data?.data ?? []
  const totals = data?.totals

  // Grouper par classe
  const grouped = rows.reduce<Record<string, BalanceRow[]>>((acc, r) => {
    (acc[r.class] ??= []).push(r)
    return acc
  }, {})

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <ExportPdf
          path="/pdf/accounting/balance"
          filename={`Balance-${dateFrom}-${dateTo}.pdf`}
          params={{ date_from: dateFrom, date_to: dateTo }}
        />
      </div>
      {isLoading && <div className="text-center py-8 text-gray-400">Chargement…</div>}

      {totals && (
        <div className="grid grid-cols-2 gap-4">
          <div className="card p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
              <TrendingUp size={18} className="text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Total Débit</p>
              <p className="text-lg font-bold text-blue-700">{formatCurrency(totals.debit)}</p>
            </div>
          </div>
          <div className="card p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center">
              <TrendingDown size={18} className="text-orange-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Total Crédit</p>
              <p className="text-lg font-bold text-orange-600">{formatCurrency(totals.credit)}</p>
            </div>
          </div>
        </div>
      )}

      {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([cls, items]) => (
        <div key={cls} className="card p-0 overflow-hidden">
          <div className="bg-gray-50 px-4 py-2 border-b">
            <span className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
              {CLASS_LABELS[cls] ?? `Classe ${cls}`}
            </span>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b text-xs">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-gray-500">Code</th>
                <th className="px-4 py-2 text-left font-medium text-gray-500">Intitulé</th>
                <th className="px-4 py-2 text-right font-medium text-gray-500">Débit</th>
                <th className="px-4 py-2 text-right font-medium text-gray-500">Crédit</th>
                <th className="px-4 py-2 text-right font-medium text-gray-500">Solde</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map(row => (
                <tr key={row.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{row.code}</td>
                  <td className="px-4 py-2.5 text-gray-800">{row.name}</td>
                  <td className="px-4 py-2.5 text-right text-blue-700">{row.total_debit > 0 ? formatCurrency(row.total_debit) : '—'}</td>
                  <td className="px-4 py-2.5 text-right text-orange-600">{row.total_credit > 0 ? formatCurrency(row.total_credit) : '—'}</td>
                  <td className={`px-4 py-2.5 text-right font-semibold ${row.solde >= 0 ? 'text-gray-800' : 'text-red-600'}`}>
                    {row.total_debit === 0 && row.total_credit === 0 ? '—' : `${formatCurrency(Math.abs(row.solde))} ${row.solde >= 0 ? 'D' : 'C'}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}

// ─── Bilan OHADA ─────────────────────────────────────────────────────────────

interface BilanRow { id: number; code: string; name: string; solde: number; montant?: number }

interface BilanData {
  actif: {
    immobilise: BilanRow[]; stocks: BilanRow[]; creances: BilanRow[]
    tresorerie: BilanRow[]; perte_exercice: number; total: number
  }
  passif: {
    capitaux: BilanRow[]; resultat: number; dettes: BilanRow[]; total: number
  }
  resultat: number
  equilibre: boolean
  date_to: string
}

function BilanSection({ title, color, rows, extra, extraLabel }: {
  title: string; color: string
  rows: BilanRow[]; extra?: number; extraLabel?: string
}) {
  const total = rows.reduce((s, r) => s + (r.montant ?? r.solde), 0) + (extra ?? 0)
  if (total === 0 && rows.length === 0) return null
  return (
    <div className="mb-3">
      <div className={`px-3 py-1.5 text-xs font-semibold uppercase tracking-wider ${color}`}>
        {title}
      </div>
      <table className="w-full text-sm">
        <tbody className="divide-y divide-gray-100">
          {rows.map(r => (
            <tr key={r.id} className="hover:bg-gray-50">
              <td className="px-3 py-2 font-mono text-xs text-gray-400 w-20">{r.code}</td>
              <td className="px-3 py-2 text-gray-700">{r.name}</td>
              <td className="px-3 py-2 text-right font-medium text-gray-900">
                {formatCurrency(r.montant ?? r.solde)}
              </td>
            </tr>
          ))}
          {extra != null && extra > 0 && (
            <tr className="hover:bg-gray-50 italic">
              <td className="px-3 py-2 font-mono text-xs text-gray-400">—</td>
              <td className="px-3 py-2 text-gray-600">{extraLabel}</td>
              <td className="px-3 py-2 text-right font-medium text-gray-900">{formatCurrency(extra)}</td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr className={`${color} font-semibold text-sm`}>
            <td colSpan={2} className="px-3 py-2">Sous-total {title}</td>
            <td className="px-3 py-2 text-right">{formatCurrency(total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

function Bilan({ dateTo }: { dateTo: string }) {
  const { data, isLoading } = useQuery<BilanData>({
    queryKey: ['bilan', dateTo],
    queryFn: () => api.get('/accounting/bilan', { params: { date_to: dateTo } }).then(r => r.data),
  })

  if (isLoading) return <div className="text-center py-12 text-gray-400">Chargement du bilan…</div>
  if (!data) return null

  const { actif, passif, resultat, equilibre } = data

  return (
    <div className="space-y-4">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Bilan SYSCOHADA</h2>
          <p className="text-xs text-gray-400">Arrêté au {new Date(dateTo).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
        </div>
        <div className="flex items-center gap-3">
          <ExportPdf
            path="/pdf/accounting/bilan"
            filename={`Bilan-OHADA-${dateTo}.pdf`}
            params={{ date_to: dateTo }}
          />
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold ${
            equilibre ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
          }`}>
            {equilibre ? <CheckCircle size={13} /> : <AlertCircle size={13} />}
            {equilibre ? 'Bilan équilibré' : 'Déséquilibre détecté'}
          </div>
        </div>
      </div>

      {/* Résultat KPI */}
      <div className={`card p-4 border-l-4 flex items-center justify-between ${
        resultat >= 0 ? 'border-green-500 bg-green-50' : 'border-red-500 bg-red-50'
      }`}>
        <div className="flex items-center gap-3">
          {resultat >= 0
            ? <TrendingUp size={22} className="text-green-600" />
            : <TrendingDown size={22} className="text-red-500" />}
          <div>
            <p className="text-xs text-gray-500">Résultat de l'exercice</p>
            <p className={`text-2xl font-bold ${resultat >= 0 ? 'text-green-700' : 'text-red-600'}`}>
              {resultat >= 0 ? '+' : ''}{formatCurrency(resultat)}
            </p>
          </div>
        </div>
        <span className={`px-3 py-1 rounded-full text-sm font-bold ${
          resultat >= 0 ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-800'
        }`}>
          {resultat >= 0 ? 'BÉNÉFICE' : 'PERTE'}
        </span>
      </div>

      {/* Colonnes Actif / Passif */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* ── ACTIF ── */}
        <div className="card p-0 overflow-hidden">
          <div className="bg-blue-600 text-white px-4 py-3 flex items-center justify-between">
            <span className="font-bold text-sm tracking-wide">ACTIF</span>
            <span className="text-blue-100 text-sm font-semibold">{formatCurrency(actif.total)}</span>
          </div>

          <BilanSection
            title="Actif immobilisé (Cl. 2)"
            color="bg-blue-50 text-blue-700"
            rows={actif.immobilise}
          />
          <BilanSection
            title="Stocks (Cl. 3)"
            color="bg-indigo-50 text-indigo-700"
            rows={actif.stocks}
          />
          <BilanSection
            title="Créances (Cl. 4)"
            color="bg-violet-50 text-violet-700"
            rows={actif.creances}
          />
          <BilanSection
            title="Trésorerie (Cl. 5)"
            color="bg-cyan-50 text-cyan-700"
            rows={actif.tresorerie}
          />
          {actif.perte_exercice > 0 && (
            <div className="px-3 py-2 flex justify-between items-center bg-red-50 text-red-700 text-sm italic border-t">
              <span>Perte de l'exercice</span>
              <span className="font-semibold">{formatCurrency(actif.perte_exercice)}</span>
            </div>
          )}

          {/* Total Actif */}
          <div className="bg-blue-600 text-white px-4 py-3 flex justify-between font-bold text-sm mt-auto">
            <span>TOTAL ACTIF</span>
            <span>{formatCurrency(actif.total)}</span>
          </div>
        </div>

        {/* ── PASSIF ── */}
        <div className="card p-0 overflow-hidden">
          <div className="bg-emerald-600 text-white px-4 py-3 flex items-center justify-between">
            <span className="font-bold text-sm tracking-wide">PASSIF</span>
            <span className="text-emerald-100 text-sm font-semibold">{formatCurrency(passif.total)}</span>
          </div>

          <BilanSection
            title="Capitaux propres (Cl. 1)"
            color="bg-emerald-50 text-emerald-700"
            rows={passif.capitaux}
            extra={passif.resultat}
            extraLabel="Résultat de l'exercice (bénéfice)"
          />
          <BilanSection
            title="Dettes (Cl. 4)"
            color="bg-orange-50 text-orange-700"
            rows={passif.dettes}
          />

          {/* Total Passif */}
          <div className="bg-emerald-600 text-white px-4 py-3 flex justify-between font-bold text-sm mt-auto">
            <span>TOTAL PASSIF</span>
            <span>{formatCurrency(passif.total)}</span>
          </div>
        </div>
      </div>

      {/* Avertissement si données insuffisantes */}
      {actif.total === 0 && passif.total === 0 && (
        <div className="card p-6 text-center text-gray-400 space-y-2">
          <AlertCircle size={32} className="mx-auto text-amber-400" />
          <p className="font-medium text-gray-600">Aucune donnée comptable</p>
          <p className="text-sm">Initialisez le plan comptable et générez les écritures depuis l'onglet <strong>Journal</strong>.</p>
        </div>
      )}
    </div>
  )
}

// ─── Compte de résultat ───────────────────────────────────────────────────────

function Resultat({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['income-statement', dateFrom, dateTo],
    queryFn: () => api.get('/accounting/income-statement', { params: { date_from: dateFrom, date_to: dateTo } }).then(r => r.data),
  })

  if (isLoading) return <div className="text-center py-8 text-gray-400">Chargement…</div>
  if (!data) return null

  const { produits, charges, total_produits, total_charges, resultat } = data

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex justify-end">
        <ExportPdf
          path="/pdf/accounting/resultat"
          filename={`Resultat-${dateFrom}-${dateTo}.pdf`}
          params={{ date_from: dateFrom, date_to: dateTo }}
        />
      </div>
      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card p-4 text-center">
          <p className="text-xs text-gray-500 mb-1">Produits</p>
          <p className="text-xl font-bold text-green-700">{formatCurrency(total_produits)}</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-xs text-gray-500 mb-1">Charges</p>
          <p className="text-xl font-bold text-red-600">{formatCurrency(total_charges)}</p>
        </div>
        <div className={`card p-4 text-center border-2 ${resultat >= 0 ? 'border-green-400' : 'border-red-400'}`}>
          <p className="text-xs text-gray-500 mb-1">Résultat net</p>
          <p className={`text-xl font-bold ${resultat >= 0 ? 'text-green-700' : 'text-red-600'}`}>
            {resultat >= 0 ? '+' : ''}{formatCurrency(resultat)}
          </p>
          <p className="text-xs mt-1 text-gray-400">{resultat >= 0 ? 'Bénéfice' : 'Déficit'}</p>
        </div>
      </div>

      {/* Produits */}
      <div className="card p-0 overflow-hidden">
        <div className="bg-green-50 px-4 py-2.5 border-b border-green-100">
          <span className="text-sm font-semibold text-green-800">Produits — Classe 7</span>
        </div>
        <table className="w-full text-sm">
          <tbody className="divide-y">
            {produits.length === 0 && (
              <tr><td colSpan={3} className="px-4 py-4 text-center text-gray-400">Aucun produit enregistré.</td></tr>
            )}
            {produits.map((p: { code: string; name: string; total_credit: number; total_debit: number }) => (
              <tr key={p.code} className="hover:bg-gray-50">
                <td className="px-4 py-2.5 font-mono text-xs text-gray-500 w-20">{p.code}</td>
                <td className="px-4 py-2.5 text-gray-800">{p.name}</td>
                <td className="px-4 py-2.5 text-right font-semibold text-green-700">{formatCurrency(p.total_credit - p.total_debit)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-green-50 border-t">
            <tr>
              <td colSpan={2} className="px-4 py-2.5 font-bold text-gray-700">Total produits</td>
              <td className="px-4 py-2.5 text-right font-bold text-green-700">{formatCurrency(total_produits)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Charges */}
      <div className="card p-0 overflow-hidden">
        <div className="bg-red-50 px-4 py-2.5 border-b border-red-100">
          <span className="text-sm font-semibold text-red-800">Charges — Classe 6</span>
        </div>
        <table className="w-full text-sm">
          <tbody className="divide-y">
            {charges.length === 0 && (
              <tr><td colSpan={3} className="px-4 py-4 text-center text-gray-400">Aucune charge enregistrée.</td></tr>
            )}
            {charges.map((c: { code: string; name: string; total_debit: number; total_credit: number }) => (
              <tr key={c.code} className="hover:bg-gray-50">
                <td className="px-4 py-2.5 font-mono text-xs text-gray-500 w-20">{c.code}</td>
                <td className="px-4 py-2.5 text-gray-800">{c.name}</td>
                <td className="px-4 py-2.5 text-right font-semibold text-red-600">{formatCurrency(c.total_debit - c.total_credit)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-red-50 border-t">
            <tr>
              <td colSpan={2} className="px-4 py-2.5 font-bold text-gray-700">Total charges</td>
              <td className="px-4 py-2.5 text-right font-bold text-red-600">{formatCurrency(total_charges)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
