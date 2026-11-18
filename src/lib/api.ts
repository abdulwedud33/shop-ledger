import { supabase } from './supabase';
import { numberToQty, toMinor, qtyToNumber, type Milli, type Minor } from '../domain/money';
import type { PayMethod } from '../domain/cart';
import type { LocalBalance, LocalCustomer, LocalLedger, LocalProduct, LocalSale } from './db';
import type { OutboxItem } from '../domain/outbox';
import { translateError, type ErrorCode } from '../domain/errors';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
const PAGE = 50; // matches max_rows in supabase/config.toml

function unwrap<T>(res: { data: T | null; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data as T;
}

/** Reads every page (the API caps responses at 50 rows). */
async function pageAll(build: (from: number, to: number) => PromiseLike<{ data: Row[] | null; error: unknown }>, maxRows = 5000): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; from < maxRows; from += PAGE) {
    const rows = unwrap(await build(from, from + PAGE - 1)) ?? [];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

const n = (v: unknown): number => Number(v ?? 0);

// ---------- identity ----------
export interface ShopInfo {
  id: string; name: string; currency: string; locale: 'en' | 'am' | 'om'; timezone: string;
  allowNegativeStock: boolean; overdueDays: number; role: 'owner' | 'cashier';
}

export async function fetchMyShop(userId: string): Promise<ShopInfo | null> {
  const rows = unwrap(await supabase
    .from('shop_members')
    .select('role, shops(id, name, currency, locale, timezone, allow_negative_stock, overdue_days)')
    .eq('user_id', userId)
    .limit(1)) as Row[] | null;
  const row = rows?.[0];
  const s = Array.isArray(row?.shops) ? row?.shops[0] : row?.shops;
  if (!row || !s) return null;
  return {
    id: s.id, name: s.name, currency: s.currency, locale: s.locale, timezone: s.timezone,
    allowNegativeStock: s.allow_negative_stock, overdueDays: s.overdue_days, role: row.role,
  };
}

export async function createShop(name: string, locale: string): Promise<string> {
  const row = unwrap(await supabase.rpc('create_shop', { p_name: name, p_currency: 'ETB', p_locale: locale, p_timezone: 'Africa/Addis_Ababa' })) as Row;
  return row.id as string;
}

export async function updateShop(shopId: string, patch: { name?: string; locale?: string; allow_negative_stock?: boolean; overdue_days?: number }): Promise<void> {
  unwrap(await supabase.from('shops').update(patch).eq('id', shopId).select('id'));
}

export async function deleteShop(shopId: string): Promise<void> {
  unwrap(await supabase.rpc('delete_shop', { p_shop: shopId }));
}

export async function createInvite(shopId: string): Promise<string> {
  return unwrap(await supabase.rpc('create_invite', { p_shop: shopId, p_role: 'cashier' })) as string;
}

export async function acceptInvite(code: string): Promise<string> {
  return unwrap(await supabase.rpc('accept_invite', { p_code: code })) as string;
}

export interface MemberRow { userId: string; role: 'owner' | 'cashier'; createdAt: string }
export async function fetchMembers(shopId: string): Promise<MemberRow[]> {
  const rows = unwrap(await supabase.from('shop_members').select('user_id, role, created_at').eq('shop_id', shopId).order('created_at')) as Row[];
  return rows.map((r) => ({ userId: r.user_id, role: r.role, createdAt: r.created_at }));
}

export async function removeMember(shopId: string, userId: string): Promise<void> {
  unwrap(await supabase.from('shop_members').delete().eq('shop_id', shopId).eq('user_id', userId).select('user_id'));
}

// ---------- pulls (read models for the local cache) ----------
const rowToProduct = (shopId: string, r: Row): LocalProduct => ({
  id: r.id, shopId, name: r.name, unit: r.unit, sellPrice: toMinor(r.sell_price), stockQty: numberToQty(r.stock_qty),
  reorderLevel: numberToQty(r.reorder_level), barcode: r.barcode ?? null, archived: r.archived_at ? 1 : 0, updatedAt: r.updated_at,
});

export async function fetchProducts(shopId: string, since?: string): Promise<LocalProduct[]> {
  const rows = await pageAll((from, to) => {
    let q = supabase.from('products').select('id, name, unit, sell_price, stock_qty, reorder_level, barcode, archived_at, updated_at')
      .eq('shop_id', shopId).order('updated_at', { ascending: true }).order('id', { ascending: true });
    if (since) q = q.gt('updated_at', since);
    return q.range(from, to);
  });
  return rows.map((r) => rowToProduct(shopId, r));
}

export async function fetchCosts(shopId: string): Promise<Map<string, Minor>> {
  const rows = await pageAll((from, to) => supabase.from('product_costs').select('product_id, cost_price').eq('shop_id', shopId).order('product_id').range(from, to));
  return new Map(rows.map((r) => [r.product_id as string, toMinor(r.cost_price)]));
}

export async function fetchCustomers(shopId: string, since?: string): Promise<LocalCustomer[]> {
  const rows = await pageAll((from, to) => {
    let q = supabase.from('customers').select('id, name, phone, credit_limit, archived_at, updated_at')
      .eq('shop_id', shopId).order('updated_at', { ascending: true }).order('id', { ascending: true });
    if (since) q = q.gt('updated_at', since);
    return q.range(from, to);
  });
  return rows.map((r) => ({
    id: r.id, shopId, name: r.name, phone: r.phone ?? null, creditLimit: r.credit_limit === null ? null : toMinor(r.credit_limit),
    archived: r.archived_at ? 1 : 0, updatedAt: r.updated_at,
  }));
}

export async function fetchDebts(shopId: string): Promise<LocalBalance[]> {
  const rows = await pageAll((from, to) => supabase.rpc('customer_debts', { p_shop: shopId }).range(from, to));
  return rows.map((r) => ({
    customerId: r.customer_id, shopId, balance: toMinor(r.balance), oldestOpenAt: r.oldest_open_at ?? null,
    daysOpen: n(r.days_open), overdue: Boolean(r.is_overdue),
  }));
}

export async function fetchRecentSales(shopId: string, names: Map<string, { name: string; unit: string }>, customerNames: Map<string, string>): Promise<LocalSale[]> {
  const rows = unwrap(await supabase.from('sales')
    .select('id, client_id, total, paid_amount, method, status, customer_id, created_at, sale_items(product_id, qty, unit_price)')
    .eq('shop_id', shopId).order('created_at', { ascending: false }).limit(PAGE)) as Row[];
  return rows.map((r) => ({
    id: r.client_id, serverId: r.id, shopId, total: toMinor(r.total), paid: toMinor(r.paid_amount), method: r.method as PayMethod,
    customerId: r.customer_id ?? null, customerName: r.customer_id ? customerNames.get(r.customer_id) ?? null : null,
    status: r.status, createdAt: r.created_at, sync: 'synced' as const,
    items: ((r.sale_items ?? []) as Row[]).map((i) => ({
      productId: i.product_id, name: names.get(i.product_id)?.name ?? '', unit: names.get(i.product_id)?.unit ?? '',
      qty: numberToQty(i.qty), unitPrice: toMinor(i.unit_price),
    })),
  }));
}

export async function fetchLedger(shopId: string, customerId: string): Promise<LocalLedger[]> {
  const rows = await pageAll((from, to) => supabase.from('customer_ledger').select('id, type, amount, note, created_at')
    .eq('shop_id', shopId).eq('customer_id', customerId).order('created_at', { ascending: false }).order('id').range(from, to), 500);
  return rows.map((r) => ({ id: r.id, shopId, customerId, type: r.type, amount: toMinor(r.amount), note: r.note ?? null, createdAt: r.created_at }));
}

// ---------- direct edits (online) ----------
export async function updateProduct(id: string, patch: { name?: string; unit?: string; sell_price?: number; reorder_level?: number; archived_at?: string | null }): Promise<void> {
  unwrap(await supabase.from('products').update(patch).eq('id', id).select('id'));
}
export async function setProductCost(shopId: string, productId: string, cost: number): Promise<void> {
  unwrap(await supabase.from('product_costs').upsert({ product_id: productId, shop_id: shopId, cost_price: cost }));
}
export async function updateCustomer(id: string, patch: { name?: string; phone?: string | null; credit_limit?: number | null; archived_at?: string | null }): Promise<void> {
  unwrap(await supabase.from('customers').update(patch).eq('id', id).select('id'));
}

// ---------- reports ----------
export interface Summary {
  salesTotal: Minor; salesCount: number; paidNow: Minor; creditGiven: Minor; debtCollected: Minor; cashIn: Minor;
  profit: Minor | null; lowStockCount: number; totalOwed: Minor;
}
export async function fetchSummary(shopId: string, from: string, to: string): Promise<Summary> {
  const r = unwrap(await supabase.rpc('dashboard_summary', { p_shop: shopId, p_from: from, p_to: to })) as Row;
  return {
    salesTotal: toMinor(r.sales_total), salesCount: n(r.sales_count), paidNow: toMinor(r.paid_now), creditGiven: toMinor(r.credit_given),
    debtCollected: toMinor(r.debt_collected), cashIn: toMinor(r.cash_in), profit: r.profit === null || r.profit === undefined ? null : toMinor(r.profit),
    lowStockCount: n(r.low_stock_count), totalOwed: toMinor(r.total_owed),
  };
}
export interface TopProduct { productId: string; name: string; unit: string; qty: Milli; revenue: Minor }
export async function fetchTopProducts(shopId: string, from: string, to: string): Promise<TopProduct[]> {
  const rows = unwrap(await supabase.rpc('top_products', { p_shop: shopId, p_from: from, p_to: to, p_limit: 5 })) as Row[];
  return rows.map((r) => ({ productId: r.product_id, name: r.name, unit: r.unit, qty: numberToQty(r.qty), revenue: toMinor(r.revenue) }));
}
export async function fetchSalesForExport(shopId: string, from: string, to: string): Promise<Row[]> {
  return pageAll((a, b) => supabase.from('sales').select('created_at, total, paid_amount, method, status, customer_id')
    .eq('shop_id', shopId).gte('created_at', from).lt('created_at', to).order('created_at').order('id').range(a, b), 5000);
}

// ---------- outbox sender: one business action = one RPC ----------
export interface SalePayload { customerId: string | null; items: { productId: string; qty: Milli; unitPrice: Minor | null }[]; paid: Minor; method: PayMethod }
export interface PaymentPayload { customerId: string; amount: Minor; method: Exclude<PayMethod, 'credit'>; note?: string | null }
export interface StockInPayload { productId: string; qty: Milli; unitCost: Minor | null }
export interface CustomerPayload { name: string; phone: string | null; creditLimit: Minor | null }
export interface ProductPayload { name: string; unit: string; sellPrice: Minor; costPrice: Minor | null; openingQty: Milli; reorderLevel: Milli }
export interface VoidPayload { saleServerId: string; reason: string }
export interface AdjustPayload { productId: string; qtyDelta: Milli; reason: string; type: 'adjustment' | 'damage' }

const money = (m: Minor) => m / 100;

/** Sends one outbox item. Throws on failure; the caller maps it with translateError. */
export async function sendOutboxItem(item: OutboxItem): Promise<void> {
  const shop = item.shopId;
  switch (item.kind) {
    case 'sale': {
      const p = item.payload as SalePayload;
      unwrap(await supabase.rpc('record_sale', {
        p_shop: shop, p_client_id: item.id, p_customer: p.customerId, p_paid: money(p.paid), p_method: p.method,
        p_items: p.items.map((i) => ({ product_id: i.productId, qty: qtyToNumber(i.qty), ...(i.unitPrice === null ? {} : { unit_price: money(i.unitPrice) }) })),
      }));
      return;
    }
    case 'payment': {
      const p = item.payload as PaymentPayload;
      unwrap(await supabase.rpc('record_payment', { p_shop: shop, p_client_id: item.id, p_customer: p.customerId, p_amount: money(p.amount), p_method: p.method, p_note: p.note ?? null }));
      return;
    }
    case 'stock_in': {
      const p = item.payload as StockInPayload;
      unwrap(await supabase.rpc('record_stock_in', { p_shop: shop, p_client_id: item.id, p_product: p.productId, p_qty: qtyToNumber(p.qty), p_unit_cost: p.unitCost === null ? null : money(p.unitCost) }));
      return;
    }
    case 'customer': {
      const p = item.payload as CustomerPayload;
      const res = await supabase.from('customers').insert({ id: item.id, shop_id: shop, name: p.name, phone: p.phone, credit_limit: p.creditLimit === null ? null : money(p.creditLimit) });
      if (res.error && res.error.code !== '23505') throw res.error; // 23505 = already saved (replay)
      return;
    }
    case 'product': {
      const p = item.payload as ProductPayload;
      unwrap(await supabase.rpc('create_product', {
        p_shop: shop, p_id: item.id, p_name: p.name, p_unit: p.unit, p_sell_price: money(p.sellPrice),
        p_cost_price: p.costPrice === null ? null : money(p.costPrice), p_opening_qty: qtyToNumber(p.openingQty), p_reorder_level: qtyToNumber(p.reorderLevel),
      }));
      return;
    }
    case 'void_sale': {
      const p = item.payload as VoidPayload;
      unwrap(await supabase.rpc('void_sale', { p_shop: shop, p_sale: p.saleServerId, p_reason: p.reason }));
      return;
    }
    case 'adjust_stock': {
      const p = item.payload as AdjustPayload;
      unwrap(await supabase.rpc('adjust_stock', { p_shop: shop, p_client_id: item.id, p_product: p.productId, p_qty_delta: qtyToNumber(p.qtyDelta), p_reason: p.reason, p_type: p.type }));
      return;
    }
  }
}

/** Maps any thrown value to a coded, user-safe error. The raw error never reaches the UI. */
export function codeOf(e: unknown): ErrorCode { return translateError(e).code; }

// ---------- AI (Edge Functions; keys never leave the server) ----------
export async function callAi<T>(fn: 'ai-parse-entry' | 'ai-insights' | 'ai-reminder', body: unknown): Promise<T> {
  const res = await supabase.functions.invoke(fn, { body: body as Record<string, unknown> });
  if (res.error) throw res.error;
  return res.data as T;
}

// ---------- assistant memory ----------
export interface MemoryRow { id: string; kind: string; key: string; value: string }
export async function fetchMemory(shopId: string): Promise<MemoryRow[]> {
  const rows = unwrap(await supabase.from('shop_memory').select('id, kind, key, value').eq('shop_id', shopId).order('created_at').limit(PAGE)) as Row[];
  return rows.map((r) => ({ id: r.id, kind: r.kind, key: r.key, value: r.value }));
}
export async function saveMemory(shopId: string, kind: 'alias' | 'preference' | 'fact', key: string, value: string): Promise<void> {
  const ins = await supabase.from('shop_memory').insert({ shop_id: shopId, kind, key, value });
  if (!ins.error) return;
  if (ins.error.code !== '23505') throw ins.error;       // already there: update only the value (column grant)
  unwrap(await supabase.from('shop_memory').update({ value }).eq('shop_id', shopId).eq('kind', kind).eq('key', key).select('id'));
}
export async function deleteMemory(id: string): Promise<void> {
  unwrap(await supabase.from('shop_memory').delete().eq('id', id).select('id'));
}
