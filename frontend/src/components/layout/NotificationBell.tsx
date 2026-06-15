import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Bell, AlertTriangle, TrendingDown, Clock, Package,
  Target, XCircle, ChevronRight, X, RefreshCw,
} from 'lucide-react'
import api from '../../lib/api'

// ── Types ──────────────────────────────────────────────────────────────────────

interface NotifItem {
  id: number
  name: string
  code: string | null
  qty: number | null
  text: string
}

interface NotifGroup {
  type: string
  label: string
  icon: string
  color: string
  count: number
  link: string
  items: NotifItem[]
}

interface NotifSummary {
  total: number
  groups: NotifGroup[]
}

// ── Icon map ───────────────────────────────────────────────────────────────────

const ICONS: Record<string, React.ReactNode> = {
  'alert-triangle': <AlertTriangle size={14} />,
  'trending-down':  <TrendingDown size={14} />,
  'clock':          <Clock size={14} />,
  'x-circle':       <XCircle size={14} />,
  'package':        <Package size={14} />,
  'target':         <Target size={14} />,
}

const COLOR_CLASSES: Record<string, { badge: string; dot: string; header: string; text: string }> = {
  red:    { badge: 'bg-red-500',    dot: 'bg-red-500',    header: 'bg-red-50 border-red-100',    text: 'text-red-700' },
  orange: { badge: 'bg-orange-500', dot: 'bg-orange-400', header: 'bg-orange-50 border-orange-100', text: 'text-orange-700' },
  yellow: { badge: 'bg-yellow-500', dot: 'bg-yellow-400', header: 'bg-yellow-50 border-yellow-100', text: 'text-yellow-700' },
  green:  { badge: 'bg-green-500',  dot: 'bg-green-500',  header: 'bg-green-50 border-green-100',  text: 'text-green-700' },
  blue:   { badge: 'bg-blue-500',   dot: 'bg-blue-500',   header: 'bg-blue-50 border-blue-100',    text: 'text-blue-700' },
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  const { data, isLoading, refetch, dataUpdatedAt } = useQuery<NotifSummary>({
    queryKey: ['notifications-summary'],
    queryFn:  () => api.get('/notifications/summary').then(r => r.data),
    refetchInterval: 2 * 60 * 1000, // refresh every 2 min
    staleTime: 60 * 1000,
  })

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const total = data?.total ?? 0
  const groups = data?.groups ?? []
  const hasNew = total > 0

  const handleNavigate = (link: string) => {
    navigate(link)
    setOpen(false)
  }

  const lastUpdated = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <div className="relative" ref={panelRef}>
      {/* ── Bell button ── */}
      <button
        onClick={() => setOpen(v => !v)}
        className="relative flex items-center justify-center w-8 h-8 rounded-lg text-gray-500 hover:text-brand hover:bg-gray-100 transition-colors"
        title="Notifications"
      >
        <Bell size={18} className={hasNew ? 'animate-[wiggle_1s_ease-in-out_3]' : ''} />
        {hasNew && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full leading-none">
            {total > 99 ? '99+' : total}
          </span>
        )}
      </button>

      {/* ── Dropdown panel ── */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-96 bg-white rounded-2xl shadow-2xl border border-gray-100 z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-brand border-b border-brand-700">
            <div className="flex items-center gap-2">
              <Bell size={16} className="text-white" />
              <span className="text-sm font-semibold text-white">Notifications</span>
              {hasNew && (
                <span className="bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                  {total}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => refetch()}
                className="p-1.5 rounded-lg text-brand-300 hover:text-white hover:bg-brand-700 transition-colors"
                title="Actualiser"
              >
                <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
              </button>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg text-brand-300 hover:text-white hover:bg-brand-700 transition-colors"
              >
                <X size={13} />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="max-h-[480px] overflow-y-auto">
            {isLoading && (
              <div className="flex items-center justify-center py-12 text-gray-400">
                <RefreshCw size={20} className="animate-spin mr-2" />
                <span className="text-sm">Chargement…</span>
              </div>
            )}

            {!isLoading && groups.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                <Bell size={32} className="mb-3 opacity-30" />
                <p className="text-sm font-medium">Aucune notification</p>
                <p className="text-xs mt-1 opacity-70">Tout est en ordre !</p>
              </div>
            )}

            {!isLoading && groups.map(group => {
              const colors = COLOR_CLASSES[group.color] ?? COLOR_CLASSES.blue
              const isExpanded = expandedGroup === group.type
              const icon = ICONS[group.icon] ?? <Bell size={14} />

              return (
                <div key={group.type} className="border-b border-gray-50 last:border-0">
                  {/* Group header */}
                  <button
                    onClick={() => setExpandedGroup(isExpanded ? null : group.type)}
                    className={`w-full flex items-center gap-3 px-4 py-3 border-l-4 ${colors.header} ${colors.text} hover:brightness-95 transition-all text-left`}
                    style={{ borderLeftColor: undefined }}
                  >
                    <span className={`flex items-center justify-center w-7 h-7 rounded-lg ${colors.badge} text-white flex-shrink-0`}>
                      {icon}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold">{group.label}</span>
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${colors.badge} text-white ml-2`}>
                          {group.count}
                        </span>
                      </div>
                    </div>
                    <ChevronRight
                      size={14}
                      className={`flex-shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                    />
                  </button>

                  {/* Items (expanded) */}
                  {isExpanded && (
                    <div className="bg-gray-50">
                      {group.items.map((item, idx) => (
                        <button
                          key={`${item.id}-${idx}`}
                          onClick={() => handleNavigate(group.link)}
                          className="w-full flex items-start gap-3 px-4 py-2.5 hover:bg-white transition-colors text-left border-b border-gray-100 last:border-0"
                        >
                          <span className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${colors.dot}`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-gray-800 truncate">{item.name}</p>
                            {item.code && (
                              <p className="text-[10px] text-gray-400 font-mono">{item.code}</p>
                            )}
                            <p className="text-[11px] text-gray-500 mt-0.5">{item.text}</p>
                          </div>
                          {item.qty !== null && (
                            <span className="text-[11px] font-bold text-gray-600 flex-shrink-0">
                              {item.qty}
                            </span>
                          )}
                        </button>
                      ))}
                      {/* "See all" link */}
                      <button
                        onClick={() => handleNavigate(group.link)}
                        className={`w-full flex items-center justify-center gap-1 py-2 text-[11px] font-semibold ${colors.text} hover:underline`}
                      >
                        Voir tout
                        <ChevronRight size={11} />
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Footer */}
          {lastUpdated && (
            <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 text-[10px] text-gray-400 text-right">
              Dernière mise à jour : {lastUpdated} · Actualisation auto. toutes les 2 min
            </div>
          )}
        </div>
      )}
    </div>
  )
}
