import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../lib/api'
import { formatCurrency } from '../../lib/format'
import toast from 'react-hot-toast'
import {
  Search, X, Check, AlertTriangle, CheckCircle2, Banknote,
  Loader2, CreditCard, Wallet, Phone, User, ChevronRight,
  History, FileText, Calendar, UserCheck,
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

interface ClientSearchResult {
  id: number
  name: string
  phone?: string
  credit_balance: number
  account_balance: number
}

interface EncourItem {
  id: number
  type: 'invoice' | 'sale'
  reference: string
  label: string
  date: string
  due_date: string | null
  total_ttc: number
  paid_amount: number
  balance: number
  status: string
  is_overdue: boolean
}

interface EncourHistoryItem {
  id: number
  type: 'sale' | 'invoice'
  reference: string | null
  client_name: string | null
  client_id: number | null
  amount: number
  method: string
  paid_at: string
  notes: string | null
  recorder: { id: number; name: string } | null
}

interface EncourData {
  client: { id: number; name: string; phone: string; credit_balance: number; account_balance: number }
  items: EncourItem[]
  total_due: number
  history: EncourHistoryItem[]
}

interface GlobalHistoryData {
  data: EncourHistoryItem[]
  total: number
  count: number
}

const PAYMENT_METHODS = [
  { value: 'cash',          label: 'Espèces' },
  { value: 'mobile_money',  label: 'Mobile Money' },
  { value: 'bank_transfer', label: 'Virement' },
  { value: 'check',         label: 'Chèque' },
  { value: 'other',         label: 'Autre' },
]

const METHOD_LABELS: Record<string, string> = {
  cash: 'Espèces', card: 'Carte', wave: 'Wave', orange_money: 'Orange Money',
  free_money: 'Free Money', mobile_money: 'Mobile Money', bank_transfer: 'Virement',
  check: 'Chèque', credit: 'Crédit', other: 'Autre',
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function EncourPage() {
  const [activePage, setActivePage] = useState<'encours' | 'historique'>('encours')

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Banknote size={24} className="text-primary" />
          Encaissements
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Gérez les paiements d'encours et consultez l'historique des encaissements.
        </p>
      </div>

      {/* Page-level tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        <button
          onClick={() => setActivePage('encours')}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold transition-all border-b-2 -mb-px ${
            activePage === 'encours'
              ? 'border-primary text-primary'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Banknote size={16} />
          Paiement des encours
        </button>
        <button
          onClick={() => setActivePage('historique')}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold transition-all border-b-2 -mb-px ${
            activePage === 'historique'
              ? 'border-primary text-primary'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <History size={16} />
          Historique des encaissements
        </button>
      </div>

      {activePage === 'encours'    && <EncourTab />}
      {activePage === 'historique' && <HistoriqueTab />}
    </div>
  )
}

// ─── Tab 1 : Paiement des encours ─────────────────────────────────────────────

function EncourTab() {
  const [query, setQuery] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const [selectedClient, setSelectedClient] = useState<ClientSearchResult | null>(null)
  const searchRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!searchRef.current?.contains(e.target as Node)) setShowDropdown(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const { data: searchResults = [], isFetching: searching } = useQuery<ClientSearchResult[]>({
    queryKey: ['client-search-encour', query],
    queryFn: () => api.get('/clients/search', { params: { q: query } }).then(r => r.data),
    enabled: query.trim().length >= 2,
    staleTime: 10_000,
  })

  const handleSelect = (client: ClientSearchResult) => {
    setSelectedClient(client)
    setQuery(client.name)
    setShowDropdown(false)
  }

  const handleClear = () => {
    setSelectedClient(null)
    setQuery('')
  }

  return (
    <div className="space-y-6">
      {/* Search */}
      <div ref={searchRef} className="relative">
        <div className="flex items-center gap-2 border border-gray-200 rounded-2xl px-4 py-3 shadow-sm bg-white focus-within:ring-2 focus-within:ring-primary/30 focus-within:border-primary transition-all">
          {searching
            ? <Loader2 size={18} className="text-gray-400 animate-spin flex-shrink-0" />
            : <Search size={18} className="text-gray-400 flex-shrink-0" />
          }
          <input
            value={query}
            onChange={e => { setQuery(e.target.value); setShowDropdown(true) }}
            onFocus={() => query.trim().length >= 2 && setShowDropdown(true)}
            placeholder="Rechercher un client par nom ou téléphone..."
            className="flex-1 text-sm bg-transparent outline-none placeholder-gray-400"
          />
          {query && (
            <button onClick={handleClear} className="text-gray-400 hover:text-gray-600 flex-shrink-0">
              <X size={16} />
            </button>
          )}
        </div>

        {showDropdown && searchResults.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden">
            {searchResults.map(c => (
              <button
                key={c.id}
                onClick={() => handleSelect(c)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-primary/5 text-left transition-colors border-b border-gray-50 last:border-0"
              >
                <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <User size={16} className="text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 text-sm truncate">{c.name}</p>
                  {c.phone && <p className="text-xs text-gray-400 flex items-center gap-1"><Phone size={10} />{c.phone}</p>}
                </div>
                <div className="text-right flex-shrink-0">
                  {c.credit_balance > 0 && (
                    <p className="text-xs font-semibold text-orange-600">
                      Crédit dû : {formatCurrency(c.credit_balance)}
                    </p>
                  )}
                </div>
                <ChevronRight size={14} className="text-gray-300 flex-shrink-0" />
              </button>
            ))}
          </div>
        )}

        {showDropdown && query.trim().length >= 2 && !searching && searchResults.length === 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-50 px-4 py-3 text-sm text-gray-400 text-center">
            Aucun client trouvé pour « {query} »
          </div>
        )}
      </div>

      {selectedClient && <EncourPanel client={selectedClient} onReset={handleClear} />}

      {!selectedClient && (
        <div className="text-center py-20 text-gray-300">
          <Banknote size={56} className="mx-auto mb-3 opacity-30" />
          <p className="text-base font-medium text-gray-400">Recherchez un client pour commencer</p>
          <p className="text-sm text-gray-300 mt-1">Tapez au moins 2 caractères (nom ou téléphone)</p>
        </div>
      )}
    </div>
  )
}

// ─── Tab 2 : Historique global ────────────────────────────────────────────────

function HistoriqueTab() {
  const [search, setSearch] = useState('')
  const [from, setFrom]     = useState('')
  const [to, setTo]         = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  const { data, isLoading } = useQuery<GlobalHistoryData>({
    queryKey: ['encours-global-history', debouncedSearch, from, to],
    queryFn: () =>
      api.get('/encours/history', {
        params: {
          search: debouncedSearch || undefined,
          from:   from || undefined,
          to:     to   || undefined,
        },
      }).then(r => r.data),
    staleTime: 30_000,
  })

  const items = data?.data ?? []

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="flex-1 min-w-56 flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2 bg-white focus-within:ring-2 focus-within:ring-primary/30 focus-within:border-primary transition-all">
          <Search size={15} className="text-gray-400 flex-shrink-0" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher : client, référence, utilisateur..."
            className="flex-1 text-sm bg-transparent outline-none placeholder-gray-400"
          />
          {search && (
            <button onClick={() => setSearch('')} className="text-gray-400 hover:text-gray-600">
              <X size={14} />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500 font-medium">Du</label>
          <input
            type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500 font-medium">Au</label>
          <input
            type="date" value={to} onChange={e => setTo(e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        {(from || to || search) && (
          <button
            onClick={() => { setSearch(''); setFrom(''); setTo('') }}
            className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1 px-3 py-2 border border-gray-200 rounded-xl hover:bg-gray-50">
            <X size={12} /> Réinitialiser
          </button>
        )}
      </div>

      {/* Summary */}
      {data && (
        <div className="flex items-center gap-6 px-4 py-3 bg-emerald-50 border border-emerald-100 rounded-xl">
          <div>
            <p className="text-xs text-emerald-600 font-medium">{data.count} encaissement{data.count > 1 ? 's' : ''}</p>
          </div>
          <div className="ml-auto">
            <p className="text-xs text-emerald-600">Total encaissé</p>
            <p className="text-lg font-bold text-emerald-700">{formatCurrency(data.total)}</p>
          </div>
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
          <Loader2 size={20} className="animate-spin" /> Chargement de l'historique...
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16">
          <History size={40} className="mx-auto mb-2 text-gray-200" />
          <p className="text-sm text-gray-400 font-medium">
            {search || from || to ? 'Aucun résultat pour ces critères' : 'Aucun encaissement enregistré'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(h => (
            <div key={`${h.type}-${h.id}`}
              className="border border-gray-100 rounded-xl p-4 bg-white hover:bg-gray-50/60 transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <FileText size={15} className="text-emerald-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    {/* Client + ref */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {h.client_name && (
                        <span className="font-semibold text-gray-900 text-sm">{h.client_name}</span>
                      )}
                      {h.reference && (
                        <span className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">{h.reference}</span>
                      )}
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                        h.type === 'invoice' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'
                      }`}>
                        {h.type === 'invoice' ? 'Facture' : 'Vente crédit'}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">
                        {METHOD_LABELS[h.method] ?? h.method}
                      </span>
                    </div>
                    {/* Meta */}
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      <span className="flex items-center gap-1 text-xs text-gray-400">
                        <Calendar size={10} />
                        {new Date(h.paid_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}
                        {' à '}
                        {new Date(h.paid_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {h.recorder && (
                        <span className="flex items-center gap-1 text-xs text-gray-400">
                          <UserCheck size={10} />
                          {h.recorder.name}
                        </span>
                      )}
                    </div>
                    {h.notes && (
                      <p className="text-xs text-gray-400 mt-1 italic">{h.notes}</p>
                    )}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-base font-bold text-emerald-600">+{formatCurrency(h.amount)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Encour Panel (inside Tab 1) ──────────────────────────────────────────────

function EncourPanel({ client, onReset }: { client: ClientSearchResult; onReset: () => void }) {
  const queryClient = useQueryClient()
  const [method, setMethod]       = useState('cash')
  const [reference, setReference] = useState('')
  const [note, setNote]           = useState('')
  const [advance, setAdvance]     = useState('')
  const [selected, setSelected]   = useState<Set<string>>(new Set())
  const [amounts, setAmounts]     = useState<Record<string, string>>({})
  const [paid, setPaid]           = useState(false)

  const { data, isLoading, refetch } = useQuery<EncourData>({
    queryKey: ['encours', client.id],
    queryFn: () => api.get(`/clients/${client.id}/encours`).then(r => r.data),
  })

  const itemsKey = data?.items?.map(i => `${i.type}-${i.id}`).join(',') ?? ''
  useEffect(() => {
    if (!data?.items?.length) return
    const s = new Set<string>()
    const a: Record<string, string> = {}
    data.items.forEach(item => {
      const key = `${item.type}-${item.id}`
      s.add(key)
      a[key] = String(item.balance)
    })
    setSelected(s)
    setAmounts(a)
    setPaid(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsKey])

  const totalSelected = Array.from(selected).reduce((sum, key) => {
    return sum + (parseFloat(amounts[key] || '0') || 0)
  }, 0)
  const totalWithAdvance = totalSelected + (parseFloat(advance) || 0)

  const mutation = useMutation({
    mutationFn: (payload: object) =>
      api.post(`/clients/${client.id}/payer-encours`, payload).then(r => r.data),
    onSuccess: () => {
      toast.success('Paiement enregistré avec succès !')
      queryClient.invalidateQueries({ queryKey: ['encours', client.id] })
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      queryClient.invalidateQueries({ queryKey: ['encours-global-history'] })
      setAdvance('')
      setReference('')
      setNote('')
      setPaid(true)
      refetch()
    },
    onError: (err: unknown) => {
      const d = (err as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } })?.response?.data
      const fieldErrors = d?.errors ? Object.values(d.errors).flat() as string[] : []
      toast.error(fieldErrors[0] ?? d?.message ?? 'Erreur lors du paiement')
    },
  })

  const handleSubmit = () => {
    const payments = Array.from(selected)
      .filter(key => (parseFloat(amounts[key] || '0') || 0) > 0)
      .map(key => {
        const dashIdx = key.indexOf('-')
        return {
          type:   key.slice(0, dashIdx),
          id:     parseInt(key.slice(dashIdx + 1)),
          amount: parseFloat(amounts[key]),
        }
      })
    const advanceAmount = parseFloat(advance) || 0
    if (payments.length === 0 && advanceAmount <= 0) {
      toast.error('Sélectionnez au moins un encours ou saisissez une avance')
      return
    }
    mutation.mutate({
      method,
      reference: reference || undefined,
      note:      note      || undefined,
      payments:  payments.length > 0 ? payments : undefined,
      advance:   advanceAmount > 0   ? advanceAmount : undefined,
    })
  }

  const toggleItem = (key: string) => {
    const next = new Set(selected)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setSelected(next)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
        <Loader2 size={20} className="animate-spin" /> Chargement des encours...
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Client header */}
      <div className="px-6 py-4 bg-gray-50 border-b flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary text-white flex items-center justify-center font-bold text-lg flex-shrink-0">
            {client.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="font-bold text-gray-900">{client.name}</p>
            {client.phone && <p className="text-xs text-gray-400 flex items-center gap-1"><Phone size={10} />{client.phone}</p>}
          </div>
        </div>
        <div className="flex items-center gap-4">
          {data.client.credit_balance > 0 && (
            <div className="text-right">
              <p className="text-[10px] text-gray-400 flex items-center gap-1 justify-end"><CreditCard size={10} /> Crédit dû</p>
              <p className="text-sm font-bold text-orange-600">{formatCurrency(data.client.credit_balance)}</p>
            </div>
          )}
          {data.client.account_balance !== 0 && (
            <div className="text-right">
              <p className="text-[10px] text-gray-400 flex items-center gap-1 justify-end"><Wallet size={10} /> Compte</p>
              <p className={`text-sm font-bold ${data.client.account_balance > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                {data.client.account_balance >= 0 ? '+' : '−'}{formatCurrency(Math.abs(data.client.account_balance))}
              </p>
            </div>
          )}
          <button onClick={onReset} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100">
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="p-6 space-y-5">
        {paid && data.total_due === 0 && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
            <CheckCircle2 size={20} className="text-green-500 flex-shrink-0" />
            <div>
              <p className="font-semibold text-green-700">Tous les encours sont soldés !</p>
              <p className="text-sm text-green-600">Le client n'a plus de montants en attente.</p>
            </div>
          </div>
        )}

        {data.total_due > 0 ? (
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle size={16} className="text-orange-500" />
              <span className="font-semibold text-orange-700">Total des encours</span>
            </div>
            <span className="text-xl font-bold text-orange-700">{formatCurrency(data.total_due)}</span>
          </div>
        ) : !paid && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-2">
            <CheckCircle2 size={16} className="text-green-500" />
            <span className="text-sm text-green-700 font-medium">Ce client n'a aucun encours — il est à jour.</span>
          </div>
        )}

        {/* Moyen de paiement */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Moyen de paiement</label>
          <div className="flex gap-2 flex-wrap">
            {PAYMENT_METHODS.map(m => (
              <button key={m.value} onClick={() => setMethod(m.value)}
                className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all border ${
                  method === m.value
                    ? 'bg-primary text-white border-primary shadow-sm'
                    : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                }`}>
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Référence</label>
            <input value={reference} onChange={e => setReference(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="N° chèque, transaction..." />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Note</label>
            <input value={note} onChange={e => setNote(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="Remarque..." />
          </div>
        </div>

        {/* Liste des encours */}
        {data.items.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Encours à régler</label>
              <div className="flex gap-3 text-xs">
                <button onClick={() => setSelected(new Set(data.items.map(i => `${i.type}-${i.id}`)))}
                  className="text-primary font-semibold hover:underline">Tout sélectionner</button>
                <span className="text-gray-300">·</span>
                <button onClick={() => setSelected(new Set())}
                  className="text-gray-400 font-semibold hover:underline">Aucun</button>
              </div>
            </div>

            <div className="space-y-2">
              {data.items.map(item => {
                const key = `${item.type}-${item.id}`
                const isChecked = selected.has(key)
                return (
                  <div key={key}
                    className={`border rounded-xl p-4 transition-all ${isChecked ? 'border-primary/30 bg-primary/5' : 'border-gray-200 bg-gray-50'}`}>
                    <div className="flex items-start gap-3">
                      <button onClick={() => toggleItem(key)} className="mt-0.5 flex-shrink-0">
                        {isChecked
                          ? <div className="w-5 h-5 rounded-md bg-primary flex items-center justify-center shadow-sm"><Check size={11} className="text-white" /></div>
                          : <div className="w-5 h-5 rounded-md border-2 border-gray-300 bg-white" />
                        }
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-gray-900">{item.reference}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                            item.type === 'invoice' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'
                          }`}>
                            {item.type === 'invoice' ? 'Facture' : 'Vente crédit'}
                          </span>
                          {item.is_overdue && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 font-medium">En retard</span>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-xs text-gray-400 mt-1 flex-wrap">
                          <span>{new Date(item.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}</span>
                          {item.due_date && <span>Échéance : {new Date(item.due_date).toLocaleDateString('fr-FR')}</span>}
                          {item.paid_amount > 0 && (
                            <span className="text-emerald-600 font-medium">Déjà encaissé : {formatCurrency(item.paid_amount)}</span>
                          )}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs text-gray-400">Total</p>
                        <p className="text-sm text-gray-500">{formatCurrency(item.total_ttc)}</p>
                        <p className="text-xs text-gray-400 mt-1">Reste dû</p>
                        <p className="text-base font-bold text-orange-600">{formatCurrency(item.balance)}</p>
                      </div>
                    </div>

                    {isChecked && (
                      <div className="mt-3 ml-8 flex items-center gap-3">
                        <label className="text-sm text-gray-600 flex-shrink-0 font-medium">Montant à encaisser :</label>
                        <input
                          type="number" min="0" max={item.balance}
                          value={amounts[key] ?? String(item.balance)}
                          onChange={e => setAmounts(prev => ({ ...prev, [key]: e.target.value }))}
                          className="w-40 border border-gray-200 rounded-xl px-3 py-2 text-sm text-right font-semibold focus:outline-none focus:ring-2 focus:ring-primary/30"
                        />
                        <span className="text-sm text-gray-500">FCFA</span>
                        <button
                          onClick={() => setAmounts(prev => ({ ...prev, [key]: String(item.balance) }))}
                          className="text-xs text-primary font-semibold hover:underline">
                          Solde total
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Avance sur compte */}
        <div className="border border-dashed border-gray-200 rounded-xl p-4 bg-gray-50/50">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Avance sur compte
            <span className="ml-1 text-gray-400 font-normal normal-case">(crédite le solde compte du client)</span>
          </label>
          <div className="flex items-center gap-3">
            <input
              type="number" min="0"
              value={advance}
              onChange={e => setAdvance(e.target.value)}
              className="w-48 border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white"
              placeholder="0"
            />
            <span className="text-sm text-gray-500">FCFA</span>
          </div>
          {data.client.account_balance !== 0 && (
            <p className="text-xs mt-1.5 text-gray-400">
              Solde actuel :{' '}
              <span className={`font-semibold ${data.client.account_balance > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                {data.client.account_balance >= 0 ? '+' : '−'}{formatCurrency(Math.abs(data.client.account_balance))}
              </span>
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="pt-2 border-t">
          <div className="flex items-center justify-between mb-4">
            <span className="text-gray-600 font-medium">Total à encaisser</span>
            <span className="text-3xl font-bold text-gray-900">{formatCurrency(totalWithAdvance)}</span>
          </div>
          <button
            onClick={handleSubmit}
            disabled={mutation.isPending || totalWithAdvance <= 0}
            className="w-full py-3.5 rounded-2xl bg-primary text-white font-bold text-base hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2 transition-all shadow-sm">
            {mutation.isPending
              ? <><Loader2 size={18} className="animate-spin" /> Traitement en cours...</>
              : <><Banknote size={18} /> Confirmer l'encaissement</>
            }
          </button>
        </div>
      </div>
    </div>
  )
}
