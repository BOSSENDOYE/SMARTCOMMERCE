import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import api from '../../lib/api'
import { formatDate } from '../../lib/format'

// ── Types ─────────────────────────────────────────────────────────────────────

type AssetStatus = 'active' | 'fully_depreciated' | 'sold' | 'scrapped'
type DepreciationMethod = 'linear' | 'declining'

interface Account { id: number; code: string; name: string }

interface FixedAssetDepreciation {
  id: number
  period_year: number
  period_month: number
  depreciation_date: string
  amount: string
  accumulated: string
  net_book_value: string
  posted: boolean
  journal_entry?: { reference: string }
}

interface FixedAsset {
  id: number
  reference: string
  name: string
  description?: string
  acquisition_date: string
  acquisition_cost: string
  residual_value: string
  depreciation_method: DepreciationMethod
  useful_life_years: number
  status: AssetStatus
  notes?: string
  asset_account?: Account
  depreciation_account?: Account
  accumulated_account?: Account
  depreciations?: FixedAssetDepreciation[]
}

interface AssetSummary {
  gross_value: number
  accumulated: number
  net_book_value: number
  count_active: number
  count_total: number
}

// ── Constantes ────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<AssetStatus, string> = {
  active:             'Actif',
  fully_depreciated:  'Amorti',
  sold:               'Cédé',
  scrapped:           'Mis au rebut',
}
const STATUS_COLORS: Record<AssetStatus, string> = {
  active:             'bg-green-100 text-green-700',
  fully_depreciated:  'bg-blue-100 text-blue-700',
  sold:               'bg-gray-100 text-gray-700',
  scrapped:           'bg-red-100 text-red-700',
}

const MONTHS = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc']

// ── Composant principal ───────────────────────────────────────────────────────

export default function FixedAssetsPage() {
  const qc = useQueryClient()

  const [statusFilter, setStatusFilter] = useState<string>('')
  const [search, setSearch]             = useState('')
  const [showForm, setShowForm]         = useState(false)
  const [selected, setSelected]         = useState<FixedAsset | null>(null)
  const [showSchedule, setShowSchedule] = useState<FixedAsset | null>(null)
  const [showSell, setShowSell]         = useState<FixedAsset | null>(null)
  const [showScrap, setShowScrap]       = useState<FixedAsset | null>(null)

  const [form, setForm] = useState({
    name: '',
    description: '',
    acquisition_date: new Date().toISOString().split('T')[0],
    acquisition_cost: '',
    residual_value: '0',
    depreciation_method: 'linear' as DepreciationMethod,
    useful_life_years: '5',
    asset_account_id: '',
    depreciation_account_id: '',
    accumulated_account_id: '',
    notes: '',
  })

  const [sellForm, setSellForm] = useState({ sold_at: '', sale_price: '' })
  const [scrapForm, setScrapForm] = useState({ scrapped_at: '', notes: '' })

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: summary } = useQuery<AssetSummary>({
    queryKey: ['fixed-assets-summary'],
    queryFn: () => api.get('/fixed-assets/summary').then(r => r.data),
  })

  const params = new URLSearchParams()
  if (statusFilter) params.set('status', statusFilter)
  if (search) params.set('search', search)

  const { data, isLoading } = useQuery({
    queryKey: ['fixed-assets', statusFilter, search],
    queryFn: () => api.get(`/fixed-assets?${params}`).then(r => r.data),
  })

  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: ['accounting-accounts'],
    queryFn: () => api.get('/accounting/accounts').then(r => r.data),
  })

  const { data: detail } = useQuery<FixedAsset>({
    queryKey: ['fixed-asset', selected?.id],
    queryFn: () => api.get(`/fixed-assets/${selected!.id}`).then(r => r.data),
    enabled: !!selected?.id,
  })

  const { data: scheduleData } = useQuery<FixedAssetDepreciation[]>({
    queryKey: ['fixed-asset-schedule', showSchedule?.id],
    queryFn: () => api.get(`/fixed-assets/${showSchedule!.id}/schedule`).then(r => r.data),
    enabled: !!showSchedule?.id,
  })

  // ── Mutations ──────────────────────────────────────────────────────────────

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['fixed-assets'] })
    qc.invalidateQueries({ queryKey: ['fixed-assets-summary'] })
  }

  const createMut = useMutation({
    mutationFn: (payload: typeof form) => api.post('/fixed-assets', payload).then(r => r.data),
    onSuccess: () => { toast.success('Immobilisation créée'); setShowForm(false); resetForm(); invalidate() },
    onError:   (e: any) => toast.error(e.response?.data?.message ?? 'Erreur'),
  })

  const postDepMut = useMutation({
    mutationFn: ({ id, year, month }: { id: number; year: number; month: number }) =>
      api.post(`/fixed-assets/${id}/post-depreciation`, { period_year: year, period_month: month }).then(r => r.data),
    onSuccess: () => { toast.success('Dotation passée'); qc.invalidateQueries({ queryKey: ['fixed-asset'] }); invalidate() },
    onError:   (e: any) => toast.error(e.response?.data?.message ?? 'Erreur'),
  })

  const postAllMut = useMutation({
    mutationFn: () => api.post('/fixed-assets/post-all-due').then(r => r.data),
    onSuccess: (data) => { toast.success(`${data.posted} dotation(s) passée(s)`); invalidate() },
    onError:   (e: any) => toast.error(e.response?.data?.message ?? 'Erreur'),
  })

  const sellMut = useMutation({
    mutationFn: ({ id, ...payload }: { id: number; sold_at: string; sale_price: string }) =>
      api.post(`/fixed-assets/${id}/sell`, payload).then(r => r.data),
    onSuccess: (data) => {
      const gl = data.gain_loss
      toast.success(`Cession enregistrée — ${gl >= 0 ? 'Plus-value' : 'Moins-value'}: ${Math.abs(gl).toLocaleString()} FCFA`)
      setShowSell(null)
      invalidate()
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'Erreur'),
  })

  const scrapMut = useMutation({
    mutationFn: ({ id, ...payload }: { id: number; scrapped_at: string; notes: string }) =>
      api.post(`/fixed-assets/${id}/scrap`, payload).then(r => r.data),
    onSuccess: () => { toast.success('Mise au rebut enregistrée'); setShowScrap(null); invalidate() },
    onError:   (e: any) => toast.error(e.response?.data?.message ?? 'Erreur'),
  })

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete(`/fixed-assets/${id}`),
    onSuccess: () => { toast.success('Immobilisation supprimée'); invalidate() },
    onError:   (e: any) => toast.error(e.response?.data?.message ?? 'Erreur'),
  })

  function resetForm() {
    setForm({ name: '', description: '', acquisition_date: new Date().toISOString().split('T')[0], acquisition_cost: '', residual_value: '0', depreciation_method: 'linear', useful_life_years: '5', asset_account_id: '', depreciation_account_id: '', accumulated_account_id: '', notes: '' })
  }

  const fmt = (v: string | number) => parseFloat(String(v)).toLocaleString('fr-FR')
  const assets: FixedAsset[] = data?.data ?? []

  const isDue = (dep: FixedAssetDepreciation) => {
    const now = new Date()
    return dep.period_year < now.getFullYear() ||
      (dep.period_year === now.getFullYear() && dep.period_month <= now.getMonth() + 1)
  }

  // ── Rendu ──────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Immobilisations</h1>
          <p className="text-sm text-gray-500">Actifs fixes et amortissements</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => postAllMut.mutate()}
            disabled={postAllMut.isPending}
            className="px-3 py-2 border text-gray-700 rounded-lg text-sm hover:bg-gray-50"
          >
            {postAllMut.isPending ? '...' : 'Passer dotations dues'}
          </button>
          <button
            onClick={() => setShowForm(true)}
            className="bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            + Nouvelle immobilisation
          </button>
        </div>
      </div>

      {/* Stats */}
      {summary && (
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: 'Valeur brute', value: fmt(summary.gross_value) + ' FCFA', color: 'text-gray-900' },
            { label: 'Amortissements', value: fmt(summary.accumulated) + ' FCFA', color: 'text-orange-600' },
            { label: 'Valeur nette (VNC)', value: fmt(summary.net_book_value) + ' FCFA', color: 'text-primary' },
            { label: 'Actifs en cours', value: String(summary.count_active), color: 'text-green-600' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl border p-4">
              <p className="text-xs text-gray-500 mb-1">{s.label}</p>
              <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filtres */}
      <div className="flex gap-3 flex-wrap">
        <input
          type="text"
          placeholder="Rechercher..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm w-56"
        />
        <div className="flex gap-2">
          {(['', 'active', 'fully_depreciated', 'sold', 'scrapped'] as const).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1 rounded-full text-xs border ${statusFilter === s ? 'bg-primary text-white' : 'text-gray-600'}`}
            >
              {s === '' ? 'Tous' : STATUS_LABELS[s as AssetStatus]}
            </button>
          ))}
        </div>
      </div>

      {/* Tableau */}
      <div className="bg-white rounded-xl border overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Chargement...</div>
        ) : assets.length === 0 ? (
          <div className="p-8 text-center text-gray-400">Aucune immobilisation</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Référence</th>
                <th className="px-4 py-3 text-left">Nom</th>
                <th className="px-4 py-3 text-center">Méthode</th>
                <th className="px-4 py-3 text-right">Coût acquisition</th>
                <th className="px-4 py-3 text-right">VNC</th>
                <th className="px-4 py-3 text-center">Statut</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {assets.map((asset: any) => {
                const accumulated = parseFloat(asset.accumulated ?? '0')
                const cost = parseFloat(asset.acquisition_cost)
                const vnc = cost - accumulated
                return (
                  <tr key={asset.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-primary font-medium">{asset.reference}</td>
                    <td className="px-4 py-3 text-gray-700">{asset.name}</td>
                    <td className="px-4 py-3 text-center text-xs text-gray-500 capitalize">{asset.depreciation_method === 'linear' ? 'Linéaire' : 'Dégressif'}</td>
                    <td className="px-4 py-3 text-right">{fmt(cost)}</td>
                    <td className="px-4 py-3 text-right font-medium">{fmt(vnc)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[asset.status as AssetStatus]}`}>
                        {STATUS_LABELS[asset.status as AssetStatus]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => setSelected(asset)} className="text-primary hover:underline text-xs mr-2">Voir</button>
                      <button onClick={() => setShowSchedule(asset)} className="text-gray-600 hover:underline text-xs mr-2">Plan</button>
                      {['active', 'fully_depreciated'].includes(asset.status) && (
                        <>
                          <button onClick={() => { setShowSell(asset); setSellForm({ sold_at: '', sale_price: '' }) }} className="text-orange-600 hover:underline text-xs mr-2">Céder</button>
                          <button onClick={() => { setShowScrap(asset); setScrapForm({ scrapped_at: '', notes: '' }) }} className="text-red-500 hover:underline text-xs">Rebut</button>
                        </>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal Plan amortissement */}
      {showSchedule && scheduleData && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b flex justify-between">
              <h2 className="text-lg font-bold">Plan d'amortissement — {showSchedule.name}</h2>
              <button onClick={() => setShowSchedule(null)} className="text-gray-400">✕</button>
            </div>
            <div className="p-4">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left">Période</th>
                    <th className="px-3 py-2 text-right">Dotation</th>
                    <th className="px-3 py-2 text-right">Cumulé</th>
                    <th className="px-3 py-2 text-right">VNC</th>
                    <th className="px-3 py-2 text-center">Statut</th>
                    <th className="px-3 py-2 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {scheduleData.map(dep => (
                    <tr key={dep.id} className={dep.posted ? 'bg-gray-50' : ''}>
                      <td className="px-3 py-2 text-gray-700">
                        {MONTHS[dep.period_month - 1]} {dep.period_year}
                      </td>
                      <td className="px-3 py-2 text-right">{fmt(dep.amount)}</td>
                      <td className="px-3 py-2 text-right text-orange-600">{fmt(dep.accumulated)}</td>
                      <td className="px-3 py-2 text-right font-medium text-primary">{fmt(dep.net_book_value)}</td>
                      <td className="px-3 py-2 text-center">
                        {dep.posted
                          ? <span className="text-green-600 text-xs">✓ Passé</span>
                          : isDue(dep)
                            ? <span className="text-orange-500 text-xs">À passer</span>
                            : <span className="text-gray-400 text-xs">En attente</span>
                        }
                      </td>
                      <td className="px-3 py-2 text-center">
                        {!dep.posted && isDue(dep) && (
                          <button
                            onClick={() => postDepMut.mutate({ id: showSchedule.id, year: dep.period_year, month: dep.period_month })}
                            disabled={postDepMut.isPending}
                            className="text-xs text-primary hover:underline"
                          >
                            Passer
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Modal Cession */}
      {showSell && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="p-6 border-b flex justify-between">
              <h2 className="text-lg font-bold">Cession — {showSell.name}</h2>
              <button onClick={() => setShowSell(null)} className="text-gray-400">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date de cession</label>
                <input type="date" value={sellForm.sold_at} onChange={e => setSellForm(f => ({ ...f, sold_at: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Prix de cession (FCFA)</label>
                <input type="number" value={sellForm.sale_price} onChange={e => setSellForm(f => ({ ...f, sale_price: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm text-right" placeholder="0" />
              </div>
            </div>
            <div className="p-6 border-t flex justify-end gap-3">
              <button onClick={() => setShowSell(null)} className="px-4 py-2 border rounded-lg text-sm">Annuler</button>
              <button
                onClick={() => sellMut.mutate({ id: showSell.id, ...sellForm })}
                disabled={sellMut.isPending || !sellForm.sold_at}
                className="px-4 py-2 bg-orange-500 text-white rounded-lg text-sm disabled:opacity-50"
              >
                {sellMut.isPending ? '...' : 'Enregistrer la cession'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Rebut */}
      {showScrap && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="p-6 border-b flex justify-between">
              <h2 className="text-lg font-bold">Mise au rebut — {showScrap.name}</h2>
              <button onClick={() => setShowScrap(null)} className="text-gray-400">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date de mise au rebut</label>
                <input type="date" value={scrapForm.scrapped_at} onChange={e => setScrapForm(f => ({ ...f, scrapped_at: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea value={scrapForm.notes} onChange={e => setScrapForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm" rows={3} placeholder="Raison du rebut..." />
              </div>
            </div>
            <div className="p-6 border-t flex justify-end gap-3">
              <button onClick={() => setShowScrap(null)} className="px-4 py-2 border rounded-lg text-sm">Annuler</button>
              <button
                onClick={() => scrapMut.mutate({ id: showScrap.id, ...scrapForm })}
                disabled={scrapMut.isPending || !scrapForm.scrapped_at}
                className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm disabled:opacity-50"
              >
                {scrapMut.isPending ? '...' : 'Mettre au rebut'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Création */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b flex justify-between">
              <h2 className="text-lg font-bold">Nouvelle immobilisation</h2>
              <button onClick={() => { setShowForm(false); resetForm() }} className="text-gray-400">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nom</label>
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Ex: Ordinateur portable Dell" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date d'acquisition</label>
                  <input type="date" value={form.acquisition_date} onChange={e => setForm(f => ({ ...f, acquisition_date: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Coût d'acquisition (FCFA)</label>
                  <input type="number" value={form.acquisition_cost} onChange={e => setForm(f => ({ ...f, acquisition_cost: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm text-right" placeholder="0" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Valeur résiduelle (FCFA)</label>
                  <input type="number" value={form.residual_value} onChange={e => setForm(f => ({ ...f, residual_value: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm text-right" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Durée de vie (années)</label>
                  <input type="number" value={form.useful_life_years} onChange={e => setForm(f => ({ ...f, useful_life_years: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm text-right" min={1} max={50} />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Méthode d'amortissement</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="radio" value="linear" checked={form.depreciation_method === 'linear'} onChange={() => setForm(f => ({ ...f, depreciation_method: 'linear' }))} />
                    Linéaire
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="radio" value="declining" checked={form.depreciation_method === 'declining'} onChange={() => setForm(f => ({ ...f, depreciation_method: 'declining' }))} />
                    Dégressif (SYSCOHADA)
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: "Compte d'actif (Cl.2)", field: 'asset_account_id', hint: '231, 241...' },
                  { label: 'Compte dotations (Cl.6)', field: 'depreciation_account_id', hint: '681, 6813...' },
                  { label: 'Compte amort. cumulés', field: 'accumulated_account_id', hint: '283, 284...' },
                ].map(({ label, field, hint }) => (
                  <div key={field}>
                    <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
                    <select
                      value={(form as any)[field]}
                      onChange={e => setForm(f => ({ ...f, [field]: Number(e.target.value) || '' }))}
                      className="w-full border rounded-lg px-2 py-2 text-xs"
                    >
                      <option value="">-- {hint} --</option>
                      {accounts.map((a: Account) => (
                        <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  rows={2} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Notes..." />
              </div>
            </div>

            <div className="p-6 border-t flex justify-end gap-3">
              <button onClick={() => { setShowForm(false); resetForm() }} className="px-4 py-2 border rounded-lg text-sm">Annuler</button>
              <button
                onClick={() => createMut.mutate(form)}
                disabled={createMut.isPending || !form.name || !form.acquisition_cost}
                className="px-4 py-2 bg-primary text-white rounded-lg text-sm disabled:opacity-50"
              >
                {createMut.isPending ? 'Création...' : 'Créer l\'immobilisation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
