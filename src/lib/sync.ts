import { db, getMeta, setMeta, type LocalProduct, type LocalSale, type LocalSaleItem } from './db';
import {
  fetchCosts, fetchCustomers, fetchDebts, fetchProducts, fetchRecentSales, sendOutboxItem,
  type AdjustPayload, type CustomerPayload, type PaymentPayload, type ProductPayload, type SalePayload, type StockInPayload, type VoidPayload,
} from './api';
import {
  applyResult, markSyncing, newItem, pickNext, purgeable, recoverStuck, type OutboxKind,
} from '../domain/outbox';
import { translateError } from '../domain/errors';
import { cartTotal, effectiveMethod, type Cart, type PayMethod } from '../domain/cart';
import type { Milli, Minor } from '../domain/money';

const uuid = (): string => crypto.randomUUID();

// ---------- enqueue helpers: update the local cache instantly, then queue the server call ----------
async function put(shopId: string, id: string, kind: OutboxKind, payload: unknown): Promise<void> {
  await db.outbox.put(newItem({ id, shopId, kind, payload }, Date.now()));
}

export interface SaleInput {
  shopId: string; cart: Cart; paid: Minor; method: Exclude<PayMethod, 'credit'>;
  customerId: string | null; customerName: string | null;
}

/** Records a sale on this phone first. Returns the sale so the receipt can show immediately. */
export async function queueSale(input: SaleInput): Promise<LocalSale> {
  const id = uuid();
  const total = cartTotal(input.cart);
  const method = effectiveMethod(input.paid, input.method);
  const items: LocalSaleItem[] = input.cart.lines.map((l) => ({ productId: l.productId, name: l.name, unit: l.unit, qty: l.qty, unitPrice: l.unitPrice }));
  const sale: LocalSale = {
    id, shopId: input.shopId, total, paid: input.paid, method, customerId: input.customerId, customerName: input.customerName,
    status: 'completed', createdAt: new Date().toISOString(), items, sync: 'pending',
  };
  const payload: SalePayload = {
    customerId: input.customerId, paid: input.paid, method,
    items: input.cart.lines.map((l) => ({ productId: l.productId, qty: l.qty, unitPrice: l.unitPrice })),
  };
  await db.transaction('rw', db.sales, db.products, db.balances, db.outbox, async () => {
    await db.sales.put(sale);
    for (const l of items) {
      const p = await db.products.get(l.productId);
      if (p) await db.products.put({ ...p, stockQty: p.stockQty - l.qty });
    }
    const credit = total - input.paid;
    if (credit > 0 && input.customerId) await bumpBalance(input.shopId, input.customerId, credit);
    await put(input.shopId, id, 'sale', payload);
  });
  kick(input.shopId);
  return sale;
}

async function bumpBalance(shopId: string, customerId: string, delta: Minor): Promise<void> {
  const cur = await db.balances.get(customerId);
  const balance = (cur?.balance ?? 0) + delta;
  if (balance <= 0) await db.balances.delete(customerId);
  else await db.balances.put({ customerId, shopId, balance, oldestOpenAt: cur?.oldestOpenAt ?? new Date().toISOString(), daysOpen: cur?.daysOpen ?? 0, overdue: cur?.overdue ?? false });
}

export async function queuePayment(shopId: string, p: PaymentPayload): Promise<void> {
  const id = uuid();
  await db.transaction('rw', db.ledger, db.balances, db.outbox, async () => {
    await db.ledger.put({ id, shopId, customerId: p.customerId, type: 'payment', amount: -p.amount, note: p.note ?? null, createdAt: new Date().toISOString(), pending: true });
    await bumpBalance(shopId, p.customerId, -p.amount);
    await put(shopId, id, 'payment', p);
  });
  kick(shopId);
}

export async function queueStockIn(shopId: string, p: StockInPayload): Promise<void> {
  await db.transaction('rw', db.products, db.outbox, async () => {
    const prod = await db.products.get(p.productId);
    if (prod) await db.products.put({ ...prod, stockQty: prod.stockQty + p.qty, costPrice: p.unitCost ?? prod.costPrice });
    await put(shopId, uuid(), 'stock_in', p);
  });
  if (p.unitCost !== null) await setMeta(`costs-stale:${shopId}`, true);
  kick(shopId);
}

export async function queueAdjust(shopId: string, p: AdjustPayload): Promise<void> {
  await db.transaction('rw', db.products, db.outbox, async () => {
    const prod = await db.products.get(p.productId);
    if (prod) await db.products.put({ ...prod, stockQty: prod.stockQty + p.qtyDelta });
    await put(shopId, uuid(), 'adjust_stock', p);
  });
  kick(shopId);
}

export async function queueCustomer(shopId: string, p: CustomerPayload): Promise<string> {
  const id = uuid();
  await db.transaction('rw', db.customers, db.outbox, async () => {
    await db.customers.put({ id, shopId, name: p.name, phone: p.phone, creditLimit: p.creditLimit, archived: 0, updatedAt: new Date().toISOString(), pending: true });
    await put(shopId, id, 'customer', p);
  });
  kick(shopId);
  return id;
}

export async function queueProduct(shopId: string, p: ProductPayload): Promise<string> {
  const id = uuid();
  const local: LocalProduct = {
    id, shopId, name: p.name, unit: p.unit, sellPrice: p.sellPrice, stockQty: p.openingQty, reorderLevel: p.reorderLevel,
    archived: 0, updatedAt: new Date().toISOString(), costPrice: p.costPrice, pending: true,
  };
  await db.transaction('rw', db.products, db.outbox, async () => {
    await db.products.put(local);
    await put(shopId, id, 'product', p);
  });
  kick(shopId);
  return id;
}

/** Void needs the server's sale id, so only already-synced sales can be voided. */
export async function queueVoid(shopId: string, sale: LocalSale, reason: string): Promise<void> {
  if (!sale.serverId) throw new Error('NOT_FOUND');
  const payload: VoidPayload = { saleServerId: sale.serverId, reason };
  await db.transaction('rw', db.sales, db.products, db.balances, db.outbox, async () => {
    await db.sales.put({ ...sale, status: 'voided' });
    for (const l of sale.items) {
      const p = await db.products.get(l.productId);
      if (p) await db.products.put({ ...p, stockQty: p.stockQty + l.qty });
    }
    const credit = sale.total - sale.paid;
    if (credit > 0 && sale.customerId) await bumpBalance(shopId, sale.customerId, -credit);
    await put(shopId, uuid(), 'void_sale', payload);
  });
  kick(shopId);
}

// ---------- outbox runner (single flight) ----------
let draining: Promise<void> | null = null;

export function kick(shopId: string): void {
  void drainOutbox(shopId);
}

export function drainOutbox(shopId: string): Promise<void> {
  if (draining) return draining;
  draining = (async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      const stuck = recoverStuck(await db.outbox.where('shopId').equals(shopId).toArray(), Date.now());
      await db.outbox.bulkPut(stuck);
      for (let guard = 0; guard < 500; guard++) {
        const items = await db.outbox.where('shopId').equals(shopId).toArray();
        const next = pickNext(items, Date.now());
        if (!next) break;
        await db.outbox.put(markSyncing(next, Date.now()));
        let result: { ok: true } | { ok: false; code: ReturnType<typeof translateError>['code'] };
        try {
          await sendOutboxItem(next);
          result = { ok: true };
        } catch (e) {
          result = { ok: false, code: translateError(e).code };
        }
        const updated = applyResult(next, result, Date.now());
        await db.outbox.put(updated);
        if (updated.status === 'synced' && next.kind === 'sale') {
          await db.sales.update(next.id, { sync: 'synced' });
        } else if (updated.status === 'failed' && next.kind === 'sale') {
          await db.sales.update(next.id, { sync: 'failed' });
        }
        if (!result.ok && result.code === 'OFFLINE') break; // stop hammering while offline
      }
      await db.outbox.bulkDelete(purgeable(await db.outbox.toArray(), Date.now()).map((i) => i.id));
      await pullAll(shopId);
    } finally {
      draining = null;
    }
  })();
  return draining;
}

/** Throws away a failed item and refreshes from the server so local numbers match again. */
export async function discardItem(shopId: string, id: string): Promise<void> {
  const item = await db.outbox.get(id);
  await db.outbox.delete(id);
  if (item?.kind === 'sale') await db.sales.delete(id);
  if (item?.kind === 'payment') await db.ledger.delete(id);
  await pullAll(shopId, { force: true });
}

export async function retryItem(shopId: string, id: string): Promise<void> {
  const item = await db.outbox.get(id);
  if (!item) return;
  await db.outbox.put({ ...item, status: 'pending', attempts: 0, nextAttemptAt: Date.now() });
  kick(shopId);
}

// ---------- pull: server -> local cache (only when nothing is waiting to be sent) ----------
const COSTS_MAX_AGE_MS = 10 * 60_000;
let pulling: Promise<void> | null = null;

export function pullAll(shopId: string, opts: { force?: boolean; owner?: boolean } = {}): Promise<void> {
  if (pulling) return pulling;
  pulling = (async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      const open = await db.outbox.where('shopId').equals(shopId).filter((i) => i.status === 'pending' || i.status === 'syncing').count();
      if (open > 0) return; // do not overwrite optimistic numbers while changes are in flight

      const prodCursor = opts.force ? undefined : await getMeta<string>(`cursor:products:${shopId}`);
      const products = await fetchProducts(shopId, prodCursor);
      if (products.length) {
        const existing = await db.products.bulkGet(products.map((p) => p.id));
        await db.products.bulkPut(products.map((p, i) => ({ ...p, costPrice: existing[i]?.costPrice ?? null })));
        await setMeta(`cursor:products:${shopId}`, products[products.length - 1]!.updatedAt);
      }

      const isOwner = opts.owner ?? (await getMeta<string>('role')) === 'owner';
      const costsAt = (await getMeta<number>(`costs-at:${shopId}`)) ?? 0;
      if (isOwner && (opts.force || Date.now() - costsAt > COSTS_MAX_AGE_MS || (await getMeta<boolean>(`costs-stale:${shopId}`)))) {
        const costs = await fetchCosts(shopId);
        const all = await db.products.where('shopId').equals(shopId).toArray();
        await db.products.bulkPut(all.map((p) => ({ ...p, costPrice: costs.get(p.id) ?? null })));
        await setMeta(`costs-at:${shopId}`, Date.now());
        await setMeta(`costs-stale:${shopId}`, false);
      }

      const custCursor = opts.force ? undefined : await getMeta<string>(`cursor:customers:${shopId}`);
      const customers = await fetchCustomers(shopId, custCursor);
      if (customers.length) {
        await db.customers.bulkPut(customers);
        await setMeta(`cursor:customers:${shopId}`, customers[customers.length - 1]!.updatedAt);
      }

      const debts = await fetchDebts(shopId);
      await db.transaction('rw', db.balances, async () => {
        await db.balances.where('shopId').equals(shopId).delete();
        await db.balances.bulkPut(debts);
      });

      const prodNames = new Map((await db.products.where('shopId').equals(shopId).toArray()).map((p) => [p.id, { name: p.name, unit: p.unit }]));
      const custNames = new Map((await db.customers.where('shopId').equals(shopId).toArray()).map((c) => [c.id, c.name]));
      const sales = await fetchRecentSales(shopId, prodNames, custNames);
      await db.transaction('rw', db.sales, async () => {
        await db.sales.where('shopId').equals(shopId).filter((s) => s.sync === 'synced').delete();
        await db.sales.bulkPut(sales);
      });
      await setMeta(`pulled-at:${shopId}`, Date.now());
    } catch {
      // Pull problems are silent: the app keeps working from the local cache.
    } finally {
      pulling = null;
    }
  })();
  return pulling;
}

// ---------- lifecycle ----------
export function startSync(shopId: string, role: 'owner' | 'cashier'): () => void {
  void setMeta('role', role);
  const run = () => { void drainOutbox(shopId); };
  const onVisible = () => { if (document.visibilityState === 'visible') run(); };
  window.addEventListener('online', run);
  document.addEventListener('visibilitychange', onVisible);
  const timer = window.setInterval(run, 20_000);
  void pullAll(shopId, { force: false, owner: role === 'owner' }).then(run);
  return () => {
    window.removeEventListener('online', run);
    document.removeEventListener('visibilitychange', onVisible);
    window.clearInterval(timer);
  };
}

export type { Milli };
