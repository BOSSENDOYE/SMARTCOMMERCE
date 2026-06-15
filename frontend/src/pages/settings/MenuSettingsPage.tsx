import { useState, useEffect, useRef } from 'react'
import { useMutation } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  LayoutDashboard, ShoppingCart, Package, Truck, Users, BarChart3,
  Settings, Utensils, ClipboardList, ArrowLeftRight, Percent, TrendingDown,
  Boxes, BookOpen, FileText, Store, Receipt, UtensilsCrossed, UserCircle,
  FilePlus2, Target, Eye, EyeOff, RotateCcw, Check, GripVertical, Menu,
  ChevronDown, ChevronRight, FolderOpen, Folder, Plus, X, Indent, Outdent,
  ChevronUp,
} from 'lucide-react'
import { useMenuStore, type MenuNode } from '../../store/menu.store'

// ─── Canonical nav item definitions ──────────────────────────────────────────

export interface NavItemDef {
  id: string
  defaultLabel: string
  icon: React.ReactNode
  description: string
  locked?: boolean
}

export const NAV_ITEM_DEFS: NavItemDef[] = [
  { id: 'dashboard',        defaultLabel: 'Tableau de bord', icon: <LayoutDashboard size={16} />, description: 'Page d\'accueil et KPIs',              locked: true },
  { id: 'pos',              defaultLabel: 'Caisse (POS)',    icon: <ShoppingCart size={16} />,    description: 'Point de vente tactile' },
  { id: 'sales',            defaultLabel: 'Vente Comptoir',  icon: <FileText size={16} />,        description: 'Ventes et historique' },
  { id: 'products',         defaultLabel: 'Catalogue',       icon: <Package size={16} />,         description: 'Produits et catégories' },
  { id: 'restaurant-menu',  defaultLabel: 'Menu Restaurant', icon: <UtensilsCrossed size={16} />, description: 'Carte et articles restaurant' },
  { id: 'stock',            defaultLabel: 'Stocks',          icon: <Boxes size={16} />,           description: 'Niveaux de stock' },
  { id: 'inventory',        defaultLabel: 'Inventaire',      icon: <ClipboardList size={16} />,   description: 'Sessions d\'inventaire' },
  { id: 'suppliers',        defaultLabel: 'Fournisseurs',    icon: <Truck size={16} />,           description: 'Gestion des fournisseurs' },
  { id: 'purchases',        defaultLabel: 'Achats',          icon: <ArrowLeftRight size={16} />,  description: 'Commandes d\'achat' },
  { id: 'clients',          defaultLabel: 'Clients',         icon: <Users size={16} />,           description: 'Base clients et fidélité' },
  { id: 'invoices',         defaultLabel: 'Facturation',     icon: <FilePlus2 size={16} />,       description: 'Factures et devis' },
  { id: 'crm',              defaultLabel: 'CRM / Leads',     icon: <Target size={16} />,          description: 'Pipeline commercial' },
  { id: 'users',            defaultLabel: 'Utilisateurs',    icon: <UserCircle size={16} />,      description: 'Gestion des utilisateurs' },
  { id: 'promotions',       defaultLabel: 'Promotions',      icon: <Percent size={16} />,         description: 'Remises et promotions' },
  { id: 'losses',           defaultLabel: 'Pertes',          icon: <TrendingDown size={16} />,    description: 'Gestion des pertes' },
  { id: 'expenses',         defaultLabel: 'Dépenses',        icon: <Receipt size={16} />,         description: 'Dépenses et charges' },
  { id: 'transfers',        defaultLabel: 'Transferts',      icon: <ArrowLeftRight size={16} />,  description: 'Transferts inter-magasins' },
  { id: 'stores',           defaultLabel: 'Magasins',        icon: <Store size={16} />,           description: 'Gestion des magasins' },
  { id: 'restaurant',       defaultLabel: 'Restaurant',      icon: <Utensils size={16} />,        description: 'Salle, tables et commandes' },
  { id: 'reports',          defaultLabel: 'Rapports',        icon: <BarChart3 size={16} />,       description: 'Statistiques et rapports' },
  { id: 'accounting',       defaultLabel: 'Comptabilité',    icon: <BookOpen size={16} />,        description: 'Journal et plan comptable' },
  { id: 'settings',         defaultLabel: 'Paramètres',      icon: <Settings size={16} />,        description: 'Configuration système',      locked: true },
]

const navDefMap = new Map(NAV_ITEM_DEFS.map(d => [d.id, d]))

// ─── Tree helpers (all immutable) ────────────────────────────────────────────

function updateNode(nodes: MenuNode[], id: string, updater: (n: MenuNode) => MenuNode): MenuNode[] {
  return nodes.map(n => {
    if (n.id === id) return updater(n)
    if (n.children) return { ...n, children: updateNode(n.children, id, updater) }
    return n
  })
}

function removeNode(nodes: MenuNode[], id: string): [MenuNode[], MenuNode | null] {
  let removed: MenuNode | null = null
  const result = nodes.reduce<MenuNode[]>((acc, n) => {
    if (n.id === id) { removed = n; return acc }
    if (n.children) {
      const [newChildren, r] = removeNode(n.children, id)
      if (r) removed = r
      acc.push({ ...n, children: newChildren })
    } else {
      acc.push(n)
    }
    return acc
  }, [])
  return [result, removed]
}

/** Move a node up (-1) or down (+1) within its sibling list */
function moveSibling(nodes: MenuNode[], id: string, dir: -1 | 1): MenuNode[] {
  const idx = nodes.findIndex(n => n.id === id)
  if (idx !== -1) {
    const target = idx + dir
    if (target < 0 || target >= nodes.length) return nodes
    const result = [...nodes]
    ;[result[idx], result[target]] = [result[target], result[idx]]
    return result
  }
  return nodes.map(n => n.children ? { ...n, children: moveSibling(n.children, id, dir) } : n)
}

/** Move node into the nearest group above it at the same sibling level */
function indentNode(nodes: MenuNode[], id: string): MenuNode[] {
  const idx = nodes.findIndex(n => n.id === id)
  if (idx !== -1) {
    // Find nearest group above
    for (let i = idx - 1; i >= 0; i--) {
      if (nodes[i].type === 'group') {
        const node = nodes[idx]
        const filtered = nodes.filter((_, j) => j !== idx)
        const groupIdx = filtered.findIndex(n => n.id === nodes[i].id)
        filtered[groupIdx] = {
          ...filtered[groupIdx],
          children: [...(filtered[groupIdx].children ?? []), node],
        }
        return filtered
      }
    }
    return nodes // no group above
  }
  return nodes.map(n => n.children ? { ...n, children: indentNode(n.children, id) } : n)
}

/** Move node out of its parent group to the parent's level (after the group) */
function dedentNode(nodes: MenuNode[], id: string): MenuNode[] {
  const result: MenuNode[] = []
  for (const n of nodes) {
    if (n.type === 'group' && n.children) {
      const childIdx = n.children.findIndex(c => c.id === id)
      if (childIdx !== -1) {
        const dedented = n.children[childIdx]
        result.push({ ...n, children: n.children.filter((_, j) => j !== childIdx) })
        result.push(dedented) // appears right after the group
        continue
      }
      result.push({ ...n, children: dedentNode(n.children, id) })
    } else {
      result.push(n)
    }
  }
  return result
}

/** Collect all builtinIds used in the tree */
function collectUsedIds(nodes: MenuNode[], acc = new Set<string>()): Set<string> {
  for (const n of nodes) {
    if (n.type === 'builtin' && n.builtinId) acc.add(n.builtinId)
    if (n.children) collectUsedIds(n.children, acc)
  }
  return acc
}

/** Flatten tree for rendering, skipping children of collapsed groups */
interface FlatEntry {
  node: MenuNode
  depth: number
  parentId: string | null
  siblingIdx: number
  siblingsLen: number
}

function flattenTree(
  nodes: MenuNode[],
  collapsed: Set<string>,
  depth = 0,
  parentId: string | null = null,
): FlatEntry[] {
  const result: FlatEntry[] = []
  nodes.forEach((node, i) => {
    result.push({ node, depth, parentId, siblingIdx: i, siblingsLen: nodes.length })
    if (node.type === 'group' && node.children && !collapsed.has(node.id)) {
      result.push(...flattenTree(node.children, collapsed, depth + 1, node.id))
    }
  })
  return result
}

/** Can the node be indented? (there's a group directly above it in siblings) */
function canIndentNode(nodes: MenuNode[], id: string): boolean {
  const idx = nodes.findIndex(n => n.id === id)
  if (idx !== -1) {
    for (let i = idx - 1; i >= 0; i--) {
      if (nodes[i].type === 'group') return true
    }
    return false
  }
  for (const n of nodes) {
    if (n.children && canIndentNode(n.children, id)) return true
  }
  return false
}

// ─── Default tree builder ─────────────────────────────────────────────────────

function buildDefaultTree(): MenuNode[] {
  return NAV_ITEM_DEFS.map(def => ({
    id: def.id,
    type: 'builtin' as const,
    label: def.defaultLabel,
    defaultLabel: def.defaultLabel,
    visible: true,
    locked: def.locked,
    builtinId: def.id,
  }))
}

// ─── Add Item Dropdown ────────────────────────────────────────────────────────

function AddItemDropdown({
  unusedDefs,
  onAdd,
  label = 'Ajouter un item',
}: {
  unusedDefs: NavItemDef[]
  onAdd: (def: NavItemDef) => void
  label?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  if (unusedDefs.length === 0) return null

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 text-xs text-primary hover:text-primary-600 px-2 py-1 rounded-lg hover:bg-primary/10 border border-dashed border-primary/30 transition-colors"
      >
        <Plus size={12} /> {label}
      </button>
      {open && (
        <div className="absolute top-full mt-1 left-0 z-50 bg-white border border-gray-200 rounded-xl shadow-xl py-1 w-56 max-h-64 overflow-y-auto">
          {unusedDefs.map(def => (
            <button
              key={def.id}
              onClick={() => { onAdd(def); setOpen(false) }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left"
            >
              <span className="text-gray-400 flex-shrink-0">{def.icon}</span>
              <div className="min-w-0">
                <p className="font-medium text-xs">{def.defaultLabel}</p>
                <p className="text-[10px] text-gray-400 truncate">{def.description}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MenuSettingsPage() {
  const { nodes, fetchConfig, saveConfig, loaded } = useMenuStore()
  const [items, setItems] = useState<MenuNode[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [dirty, setDirty] = useState(false)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())

  // Load config on mount
  useEffect(() => {
    if (!loaded) fetchConfig()
  }, [loaded, fetchConfig])

  // Sync from store
  useEffect(() => {
    setItems(nodes.length > 0 ? nodes : buildDefaultTree())
    setDirty(false)
  }, [nodes])

  const saveMut = useMutation({
    mutationFn: (list: MenuNode[]) => saveConfig(list),
    onSuccess: () => { toast.success('Menu sauvegardé'); setDirty(false) },
    onError: () => toast.error('Erreur lors de la sauvegarde'),
  })

  // ── Derived ────────────────────────────────────────────────────────────────

  const usedIds = collectUsedIds(items)
  const unusedDefs = NAV_ITEM_DEFS.filter(d => !usedIds.has(d.id))
  const flatList = flattenTree(items, collapsedGroups)

  // ── Actions ────────────────────────────────────────────────────────────────

  const mutate = (fn: (prev: MenuNode[]) => MenuNode[]) => {
    setItems(fn)
    setDirty(true)
  }

  const startEdit = (node: MenuNode) => {
    setEditingId(node.id)
    setEditValue(node.label)
  }

  const commitEdit = (id: string) => {
    const trimmed = editValue.trim()
    if (trimmed) {
      mutate(prev => updateNode(prev, id, n => ({ ...n, label: trimmed })))
    }
    setEditingId(null)
  }

  const toggleGroupCollapse = (id: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const addGroup = () => {
    const id = `group_${Date.now()}`
    const newGroup: MenuNode = {
      id,
      type: 'group',
      label: 'Nouveau groupe',
      visible: true,
      children: [],
    }
    mutate(prev => [...prev, newGroup])
    setEditingId(id)
    setEditValue('Nouveau groupe')
  }

  const addBuiltinToGroup = (groupId: string, def: NavItemDef) => {
    const newNode: MenuNode = {
      id: def.id,
      type: 'builtin',
      label: def.defaultLabel,
      defaultLabel: def.defaultLabel,
      visible: true,
      locked: def.locked,
      builtinId: def.id,
    }
    mutate(prev => updateNode(prev, groupId, g => ({
      ...g,
      children: [...(g.children ?? []), newNode],
    })))
  }

  const addBuiltinToRoot = (def: NavItemDef) => {
    const newNode: MenuNode = {
      id: def.id,
      type: 'builtin',
      label: def.defaultLabel,
      defaultLabel: def.defaultLabel,
      visible: true,
      locked: def.locked,
      builtinId: def.id,
    }
    mutate(prev => [...prev, newNode])
  }

  const deleteNode = (id: string) => {
    mutate(prev => {
      const [result] = removeNode(prev, id)
      return result
    })
  }

  const resetAll = () => {
    setItems(nodes.length > 0 ? nodes : buildDefaultTree())
    setDirty(false)
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Menu size={20} className="text-primary" /> Personnalisation du menu
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Renommez les items, créez des groupes, réorganisez par glisser (▲▼) ou indentez (→ ←).
            Les droits d'accès restent appliqués indépendamment.
          </p>
        </div>
        <button
          onClick={resetAll}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors flex-shrink-0"
        >
          <RotateCcw size={13} /> Annuler
        </button>
      </div>

      {/* Tree */}
      <div className="space-y-1">
        {flatList.map(entry => {
          const { node, depth, parentId, siblingIdx, siblingsLen } = entry
          const isEditing = editingId === node.id
          const isGroupCollapsed = node.type === 'group' && collapsedGroups.has(node.id)
          const isHidden = !node.visible
          const navDef = node.type === 'builtin' ? navDefMap.get(node.builtinId ?? '') : null
          const canIndent = !isEditing && canIndentNode(items, node.id)
          const canDedent = !isEditing && parentId !== null

          return (
            <div
              key={node.id}
              style={{ paddingLeft: `${depth * 20}px` }}
              className={`group flex items-center gap-2 p-2.5 rounded-xl border transition-all ${
                isHidden
                  ? 'bg-gray-50 border-gray-100 opacity-60'
                  : node.type === 'group'
                  ? 'bg-indigo-50/60 border-indigo-100 hover:border-indigo-200'
                  : 'bg-white border-gray-200 hover:border-primary/30 hover:shadow-sm'
              }`}
            >
              {/* Grip */}
              <span className="text-gray-300 flex-shrink-0 cursor-grab">
                <GripVertical size={13} />
              </span>

              {/* Icon */}
              {node.type === 'group' ? (
                <button
                  onClick={() => toggleGroupCollapse(node.id)}
                  className="flex-shrink-0 text-indigo-400 hover:text-indigo-600"
                >
                  {isGroupCollapsed ? <Folder size={15} /> : <FolderOpen size={15} />}
                </button>
              ) : (
                <span className={`flex-shrink-0 ${isHidden ? 'text-gray-400' : 'text-primary'}`}>
                  {navDef?.icon}
                </span>
              )}

              {/* Label */}
              <div className="flex-1 min-w-0">
                {isEditing ? (
                  <div className="flex items-center gap-2">
                    <input
                      autoFocus
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      onBlur={() => commitEdit(node.id)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') commitEdit(node.id)
                        if (e.key === 'Escape') setEditingId(null)
                      }}
                      className="flex-1 text-sm border border-primary rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary"
                      placeholder={node.defaultLabel ?? 'Nom du groupe'}
                    />
                    <button onMouseDown={() => commitEdit(node.id)} className="p-1 text-green-600 hover:bg-green-50 rounded">
                      <Check size={13} />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => !node.locked && startEdit(node)}
                    className={`text-sm font-medium text-left w-full truncate ${
                      node.locked ? 'cursor-default' : 'hover:text-primary cursor-text'
                    } ${isHidden ? 'line-through text-gray-400' : node.type === 'group' ? 'text-indigo-700' : 'text-gray-800'}`}
                    title={node.locked ? 'Item système' : 'Cliquer pour renommer'}
                  >
                    {node.label}
                    {node.type === 'group' && (
                      <span className="ml-2 text-[10px] font-normal text-indigo-400">
                        ({node.children?.length ?? 0} item{(node.children?.length ?? 0) !== 1 ? 's' : ''})
                      </span>
                    )}
                    {node.locked && (
                      <span className="ml-2 text-[10px] bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded-full">système</span>
                    )}
                  </button>
                )}
                {!isEditing && navDef?.description && (
                  <p className="text-[10px] text-gray-400 mt-0.5 truncate">{navDef.description}</p>
                )}
              </div>

              {/* Controls */}
              <div className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">

                {/* Indent → */}
                {canIndent && (
                  <button
                    onClick={() => mutate(prev => indentNode(prev, node.id))}
                    className="p-1 text-gray-300 hover:text-indigo-500 rounded transition-colors"
                    title="Déplacer dans le groupe au-dessus (→)"
                  >
                    <Indent size={13} />
                  </button>
                )}

                {/* Dedent ← */}
                {canDedent && (
                  <button
                    onClick={() => mutate(prev => dedentNode(prev, node.id))}
                    className="p-1 text-gray-300 hover:text-indigo-500 rounded transition-colors"
                    title="Sortir du groupe (←)"
                  >
                    <Outdent size={13} />
                  </button>
                )}

                {/* Add item to group */}
                {node.type === 'group' && !isEditing && (
                  <AddItemDropdown
                    unusedDefs={unusedDefs}
                    onAdd={def => addBuiltinToGroup(node.id, def)}
                    label=""
                  />
                )}

                {/* Toggle visibility */}
                {!node.locked && (
                  <button
                    onClick={() => mutate(prev => updateNode(prev, node.id, n => ({ ...n, visible: !n.visible })))}
                    className={`p-1.5 rounded transition-colors ${
                      isHidden ? 'text-gray-400 hover:text-gray-600' : 'text-gray-400 hover:text-primary'
                    }`}
                    title={isHidden ? 'Afficher' : 'Masquer'}
                  >
                    {isHidden ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                )}

                {/* Up / Down */}
                <div className="flex flex-col">
                  <button
                    onClick={() => mutate(prev => moveSibling(prev, node.id, -1))}
                    disabled={siblingIdx === 0}
                    className="p-0.5 text-gray-300 hover:text-gray-600 disabled:opacity-20 transition-colors"
                    title="Monter"
                  >
                    <ChevronUp size={13} />
                  </button>
                  <button
                    onClick={() => mutate(prev => moveSibling(prev, node.id, 1))}
                    disabled={siblingIdx === siblingsLen - 1}
                    className="p-0.5 text-gray-300 hover:text-gray-600 disabled:opacity-20 transition-colors"
                    title="Descendre"
                  >
                    <ChevronDown size={13} />
                  </button>
                </div>

                {/* Delete */}
                {!node.locked && (
                  <button
                    onClick={() => {
                      if (node.type === 'group' && (node.children?.length ?? 0) > 0) {
                        if (!window.confirm(`Supprimer le groupe "${node.label}" et retirer ses ${node.children!.length} items ?`)) return
                      }
                      deleteNode(node.id)
                    }}
                    className="p-1 text-gray-300 hover:text-red-400 rounded transition-colors"
                    title="Supprimer"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Bottom actions */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button
          onClick={addGroup}
          className="flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-700 px-3 py-1.5 rounded-lg border border-dashed border-indigo-200 hover:bg-indigo-50 transition-colors"
        >
          <Folder size={14} /> Ajouter un groupe
        </button>

        {unusedDefs.length > 0 && (
          <AddItemDropdown
            unusedDefs={unusedDefs}
            onAdd={addBuiltinToRoot}
            label={`Ajouter un item (${unusedDefs.length} disponible${unusedDefs.length > 1 ? 's' : ''})`}
          />
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-gray-400 px-1">
        <span className="flex items-center gap-1"><Indent size={11} /> Mettre dans le groupe au-dessus</span>
        <span className="flex items-center gap-1"><Outdent size={11} /> Sortir du groupe</span>
        <span className="flex items-center gap-1"><ChevronRight size={11} /> Cliquer sur le nom pour renommer</span>
      </div>

      {/* Sticky save bar */}
      {dirty && (
        <div className="sticky bottom-4 flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl px-5 py-3 shadow-lg">
          <p className="text-sm text-amber-700 font-medium">Modifications non enregistrées</p>
          <div className="flex gap-2">
            <button
              onClick={resetAll}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Annuler
            </button>
            <button
              onClick={() => saveMut.mutate(items)}
              disabled={saveMut.isPending}
              className="px-4 py-1.5 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary-600 disabled:opacity-50 flex items-center gap-1.5"
            >
              <Check size={14} />
              {saveMut.isPending ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
