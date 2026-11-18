import Dexie, { type Table } from 'dexie';
import type { OutboxItem } from '../domain/outbox';
import type { Milli, Minor } from '../domain/money';
import type { PayMethod } from '../domain/cart';

export interface LocalProduct {
  id: string; shopId: string; name: string; unit: string; sellPrice: Minor; stockQty: Milli; reorderLevel: Milli;
  barcode?: string | null; archived: 0 | 1; updatedAt: string; costPrice?: Minor | null; pending?: boolean;
}
export interface LocalCustomer {
  id: string; shopId: string; name: string; phone?: string | null; creditLimit?: Minor | null; archived: 0 | 1;
  updatedAt: string; pending?: boolean;
}
export interface LocalBalance {
  customerId: string; shopId: string; balance: Minor; oldestOpenAt: string | null; daysOpen: number; overdue: boolean;
}
export interface LocalSaleItem { productId: string; name: string; unit: string; qty: Milli; unitPrice: Minor }
export interface LocalSale {
  id: string; // the client_id (idempotency key)
  shopId: string; serverId?: string; total: Minor; paid: Minor; method: PayMethod; customerId?: string | null;
  customerName?: string | null; status: 'completed' | 'voided'; createdAt: string; items: LocalSaleItem[];
  sync: 'pending' | 'synced' | 'failed';
}
export interface LocalLedger {
  id: string; shopId: string; customerId: string; type: 'charge' | 'payment' | 'adjustment' | 'void_reversal';
  amount: Minor; note?: string | null; createdAt: string; pending?: boolean;
}
export interface MetaRow { key: string; value: unknown }

class ShopDB extends Dexie {
  meta!: Table<MetaRow, string>;
  products!: Table<LocalProduct, string>;
  customers!: Table<LocalCustomer, string>;
  balances!: Table<LocalBalance, string>;
  sales!: Table<LocalSale, string>;
  ledger!: Table<LocalLedger, string>;
  outbox!: Table<OutboxItem, string>;

  constructor() {
    super('shop-ledger');
    this.version(1).stores({
      meta: 'key',
      products: 'id, shopId, archived, name, updatedAt',
      customers: 'id, shopId, archived, name, updatedAt',
      balances: 'customerId, shopId',
      sales: 'id, shopId, createdAt',
      ledger: 'id, customerId, shopId, createdAt',
      outbox: 'id, shopId, status, createdAt',
    });
  }
}

/** Created in the browser only. Pages render after the auth gate, so it is never touched during the static build. */
export const db: ShopDB = typeof window === 'undefined' ? (null as unknown as ShopDB) : new ShopDB();

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await db.meta.get(key))?.value as T | undefined;
}
export async function setMeta(key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value });
}

/** Sign out or account switch: nothing of the shop may remain on the device (docs/security.md section 10). */
export async function wipeLocalData(): Promise<void> {
  await Promise.all([
    db.meta.clear(), db.products.clear(), db.customers.clear(), db.balances.clear(),
    db.sales.clear(), db.ledger.clear(), db.outbox.clear(),
  ]);
  if (typeof caches !== 'undefined') {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n.startsWith('sl-data')).map((n) => caches.delete(n)));
  }
}
