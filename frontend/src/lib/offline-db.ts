import Dexie, { type Table } from 'dexie'

export interface OfflineSale {
  id?: number
  offline_id: string
  store_id: number
  user_id: number
  cash_session_id?: number
  client_id?: number
  items: OfflineSaleItem[]
  payments: OfflinePayment[]
  total_ttc: number
  status: 'pending' | 'syncing' | 'synced' | 'failed'
  created_at: string
  error?: string
}

export interface OfflineSaleItem {
  product_id: number
  product_name: string
  qty: number
  unit_price_ttc: number
  discount_pct: number
  total_ttc: number
  vat_rate: number
}

export interface OfflinePayment {
  payment_method: string
  amount: number
  reference?: string
}

export interface CachedProduct {
  id: number
  internal_code: string
  name: string
  short_name?: string
  sale_price_ttc: number
  vat_rate: number
  is_weight_based: boolean
  category_id?: number
  category_name?: string
  stock_qty: number
  barcodes: string[]
  updated_at: string
}

export interface AppSettings {
  key: string
  value: unknown
}

class BaobabDB extends Dexie {
  offlineSales!: Table<OfflineSale>
  cachedProducts!: Table<CachedProduct>
  settings!: Table<AppSettings>

  constructor() {
    super('BaobabDB')
    this.version(1).stores({
      offlineSales: '++id, offline_id, status, created_at',
      cachedProducts: 'id, internal_code, *barcodes, category_id',
      settings: 'key',
    })
  }
}

export const db = new BaobabDB()

export async function findProductByBarcode(barcode: string): Promise<CachedProduct | undefined> {
  return db.cachedProducts.where('barcodes').equals(barcode).first()
}

export async function searchProductsOffline(query: string): Promise<CachedProduct[]> {
  const q = query.toLowerCase()
  return db.cachedProducts
    .filter(p => p.name.toLowerCase().includes(q) || p.internal_code.toLowerCase().includes(q))
    .limit(20)
    .toArray()
}

export async function savePendingSale(sale: Omit<OfflineSale, 'id'>): Promise<number> {
  return db.offlineSales.add(sale)
}

export async function getPendingSales(): Promise<OfflineSale[]> {
  return db.offlineSales.where('status').equals('pending').toArray()
}

export async function markSaleSynced(offlineId: string): Promise<void> {
  await db.offlineSales.where('offline_id').equals(offlineId).modify({ status: 'synced' })
}

export async function cacheProducts(products: CachedProduct[]): Promise<void> {
  await db.cachedProducts.bulkPut(products)
}
