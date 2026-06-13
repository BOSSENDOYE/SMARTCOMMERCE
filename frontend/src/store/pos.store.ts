import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'

export interface CartItem {
  product_id: number
  restaurant_item_id?: number
  product_name: string
  barcode?: string
  qty: number
  unit_price_ttc: number
  discount_pct: number
  discount_amount: number
  total_ttc: number
  vat_rate: number
  is_weight_based: boolean
  lot_id?: number
  promotion_applied?: { id: number; name: string } | null
}

export interface Payment {
  payment_method: string
  amount: number
  reference?: string
}

interface PosState {
  items: CartItem[]
  payments: Payment[]
  client_id: number | null
  client_name: string | null
  client_account_balance: number | null
  cash_session_id: number | null
  on_hold_carts: { id: string; items: CartItem[]; client_id: number | null; held_at: string }[]
  is_offline: boolean

  addItem: (item: Omit<CartItem, 'discount_amount' | 'total_ttc'>) => void
  updateQty: (productId: number, qty: number) => void
  updateDiscount: (productId: number, discountPct: number) => void
  removeItem: (productId: number) => void
  clearCart: () => void
  setClient: (id: number | null, name: string | null, accountBalance?: number | null) => void
  setCashSession: (id: number | null) => void
  addPayment: (payment: Payment) => void
  clearPayments: () => void
  holdCart: () => string
  recallCart: (id: string) => void
  setOffline: (offline: boolean) => void

  get subtotalHt(): number
  get vatAmount(): number
  get totalTtc(): number
  get totalDiscount(): number
  get totalPaid(): number
  get changeAmount(): number
}

function calcItem(item: Omit<CartItem, 'discount_amount' | 'total_ttc'>): CartItem {
  const discountAmount = parseFloat((item.unit_price_ttc * item.qty * item.discount_pct / 100).toFixed(2))
  const totalTtc = parseFloat((item.unit_price_ttc * item.qty - discountAmount).toFixed(2))
  return { ...item, discount_amount: discountAmount, total_ttc: totalTtc }
}

export const usePosStore = create<PosState>((set, get) => ({
  items: [],
  payments: [],
  client_id: null,
  client_name: null,
  client_account_balance: null,
  cash_session_id: null,
  on_hold_carts: [],
  is_offline: false,

  addItem: (rawItem) => {
    const items = [...get().items]
    const existing = items.find(i => i.product_id === rawItem.product_id)
    if (existing) {
      existing.qty += rawItem.qty
      existing.discount_amount = parseFloat((existing.unit_price_ttc * existing.qty * existing.discount_pct / 100).toFixed(2))
      existing.total_ttc = parseFloat((existing.unit_price_ttc * existing.qty - existing.discount_amount).toFixed(2))
      set({ items })
    } else {
      set({ items: [...items, calcItem(rawItem)] })
    }
  },

  updateQty: (productId, qty) => {
    if (qty <= 0) {
      set({ items: get().items.filter(i => i.product_id !== productId) })
      return
    }
    set({
      items: get().items.map(i =>
        i.product_id === productId ? calcItem({ ...i, qty }) : i
      ),
    })
  },

  updateDiscount: (productId, discountPct) => {
    set({
      items: get().items.map(i =>
        i.product_id === productId ? calcItem({ ...i, discount_pct: discountPct }) : i
      ),
    })
  },

  removeItem: (productId) => {
    set({ items: get().items.filter(i => i.product_id !== productId) })
  },

  clearCart: () => set({ items: [], payments: [], client_id: null, client_name: null, client_account_balance: null }),

  setClient: (id, name, accountBalance = null) => set({ client_id: id, client_name: name, client_account_balance: accountBalance }),

  setCashSession: (id) => set({ cash_session_id: id }),

  addPayment: (payment) => set({ payments: [...get().payments, payment] }),

  clearPayments: () => set({ payments: [] }),

  holdCart: () => {
    const id = uuidv4().slice(0, 8).toUpperCase()
    set({
      on_hold_carts: [
        ...get().on_hold_carts,
        { id, items: get().items, client_id: get().client_id, held_at: new Date().toISOString() },
      ],
      items: [],
      payments: [],
      client_id: null,
      client_name: null,
      client_account_balance: null,
    })
    return id
  },

  recallCart: (id) => {
    const cart = get().on_hold_carts.find(c => c.id === id)
    if (!cart) return
    set({
      items: cart.items,
      client_id: cart.client_id,
      on_hold_carts: get().on_hold_carts.filter(c => c.id !== id),
    })
  },

  setOffline: (offline) => set({ is_offline: offline }),

  get subtotalHt() {
    return get().items.reduce((sum, i) => sum + i.total_ttc / (1 + i.vat_rate / 100), 0)
  },

  get vatAmount() {
    return get().items.reduce((sum, i) => {
      const ht = i.total_ttc / (1 + i.vat_rate / 100)
      return sum + (i.total_ttc - ht)
    }, 0)
  },

  get totalTtc() {
    return get().items.reduce((sum, i) => sum + i.total_ttc, 0)
  },

  get totalDiscount() {
    return get().items.reduce((sum, i) => sum + i.discount_amount, 0)
  },

  get totalPaid() {
    return get().payments.reduce((sum, p) => sum + p.amount, 0)
  },

  get changeAmount() {
    return Math.max(0, get().totalPaid - get().totalTtc)
  },
}))
