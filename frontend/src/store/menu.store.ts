import { create } from 'zustand'
import api from '../lib/api'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MenuNode {
  id: string
  type: 'builtin' | 'group'
  label: string
  defaultLabel?: string   // builtin only — original label for reset
  visible: boolean
  locked?: boolean        // system items: not deletable / always visible
  builtinId?: string      // builtin only — maps to NavItem.id in AppLayout
  children?: MenuNode[]   // group only
}

interface MenuState {
  nodes: MenuNode[]
  loaded: boolean
  loading: boolean
  fetchConfig: () => Promise<void>
  saveConfig: (nodes: MenuNode[]) => Promise<void>
  getLabel: (builtinId: string, defaultLabel: string) => string
  isVisible: (builtinId: string) => boolean
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function findBuiltinNode(
  nodes: MenuNode[],
  builtinId: string,
  parentVisible = true,
): { node: MenuNode; effectiveVisible: boolean } | null {
  for (const n of nodes) {
    if (n.type === 'builtin' && n.builtinId === builtinId) {
      return { node: n, effectiveVisible: parentVisible && n.visible }
    }
    if (n.type === 'group' && n.children) {
      const found = findBuiltinNode(n.children, builtinId, parentVisible && n.visible)
      if (found) return found
    }
  }
  return null
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useMenuStore = create<MenuState>((set, get) => ({
  nodes: [],
  loaded: false,
  loading: false,

  fetchConfig: async () => {
    if (get().loading) return
    set({ loading: true })
    try {
      const res = await api.get('/stores/menu-config')
      const data = res.data
      set({ nodes: Array.isArray(data) && data.length > 0 ? data : [], loaded: true })
    } catch {
      set({ loaded: true }) // silencieux — defaults used
    } finally {
      set({ loading: false })
    }
  },

  saveConfig: async (nodes: MenuNode[]) => {
    await api.put('/stores/menu-config', { items: nodes })
    set({ nodes })
  },

  getLabel: (builtinId: string, defaultLabel: string) => {
    const result = findBuiltinNode(get().nodes, builtinId)
    return result?.node.label ?? defaultLabel
  },

  isVisible: (builtinId: string) => {
    const { nodes } = get()
    if (nodes.length === 0) return true          // no config = all visible
    const result = findBuiltinNode(nodes, builtinId)
    if (!result) return true                      // not in config = visible
    return result.effectiveVisible
  },
}))
