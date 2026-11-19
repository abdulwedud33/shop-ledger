import type { Page } from '@playwright/test';

export interface MockUser {
  id: string;
  email: string;
  name: string;
}

export interface MockShop {
  id: string;
  name: string;
  currency: string;
  locale: 'en' | 'am' | 'om';
  timezone: string;
  allowNegativeStock: boolean;
  overdueDays: number;
  role: 'owner' | 'cashier';
}

export interface MockData {
  user?: MockUser;
  shop?: MockShop;
  products?: any[];
  customers?: any[];
  balances?: any[];
  sales?: any[];
  ledger?: any[];
  outbox?: any[];
}

export const DEFAULT_USER: MockUser = {
  id: 'usr_test_owner_001',
  email: 'owner@test.com',
  name: 'Abebe Owner',
};

export const DEFAULT_SHOP: MockShop = {
  id: 'shp_test_001',
  name: 'Abebe Store',
  currency: 'ETB',
  locale: 'en',
  timezone: 'Africa/Addis_Ababa',
  allowNegativeStock: true,
  overdueDays: 30,
  role: 'owner',
};

export const CASHIER_SHOP: MockShop = {
  ...DEFAULT_SHOP,
  role: 'cashier',
};

export function makeMockJwt(userId: string, email: string) {
  const b64 = (obj: any) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const header = b64({ alg: 'HS256', typ: 'JWT' });
  const payload = b64({
    sub: userId,
    email: email,
    aud: 'authenticated',
    role: 'authenticated',
    exp: Math.floor(Date.now() / 1000) + 86400 * 365,
    user_metadata: { full_name: 'Test User' },
    app_metadata: { provider: 'email' },
  });
  return `${header}.${payload}.mock-sig`;
}

/**
 * Pre-populates localStorage auth session and Dexie IndexedDB records
 * before the page loads, properly closing the connection so Dexie can attach.
 */
export async function seedAppState(page: Page, data: MockData = {}) {
  const user = data.user ?? DEFAULT_USER;
  const shop = data.shop ?? DEFAULT_SHOP;
  const token = makeMockJwt(user.id, user.email);

  const sessionObj = {
    access_token: token,
    refresh_token: 'fake-refresh-token',
    expires_in: 360000,
    expires_at: Math.floor(Date.now() / 1000) + 360000,
    token_type: 'bearer',
    user: {
      id: user.id,
      aud: 'authenticated',
      role: 'authenticated',
      email: user.email,
      email_confirmed_at: '2026-01-01T00:00:00Z',
      phone: '',
      confirmed_at: '2026-01-01T00:00:00Z',
      last_sign_in_at: '2026-01-01T00:00:00Z',
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: { full_name: user.name },
      identities: [],
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
  };

  await page.addInitScript(
    ({ session, shop, products, customers, balances, sales, ledger, outbox }) => {
      if (typeof window !== 'undefined' && window.sessionStorage.getItem('__wiped__')) return;

      // 1. Set Supabase session in localStorage
      window.localStorage.setItem('sb-uuqypwwpujibxqvvvywx-auth-token', JSON.stringify(session));
      window.localStorage.setItem('sl-locale', shop.locale || 'en');

      // 2. Open IndexedDB with exact Dexie ShopDB version (version 1)
      const req = indexedDB.open('shop-ledger', 1);
      req.onupgradeneeded = (e) => {
        const db = (e.target as any).result;
        const tables = [
          ['meta', 'key'],
          ['products', 'id, shopId, archived, name, updatedAt'],
          ['customers', 'id, shopId, archived, name, updatedAt'],
          ['balances', 'customerId, shopId'],
          ['sales', 'id, shopId, createdAt'],
          ['ledger', 'id, customerId, shopId, createdAt'],
          ['outbox', 'id, shopId, status, createdAt'],
        ];
        for (const [name, keyPath] of tables) {
          if (!name || !keyPath) continue;
          if (!db.objectStoreNames.contains(name)) {
            const parts = keyPath.split(', ');
            const primaryKey = parts[0] || 'id';
            const store = db.createObjectStore(name, { keyPath: primaryKey });
            for (const idx of parts.slice(1)) {
              store.createIndex(idx, idx);
            }
          }
        }
      };

      req.onsuccess = (e) => {
        const db = (e.target as any).result;
        const tx = db.transaction(
          ['meta', 'products', 'customers', 'balances', 'sales', 'ledger', 'outbox'],
          'readwrite'
        );

        const metaStore = tx.objectStore('meta');
        metaStore.put({ key: 'userId', value: session.user.id });
        metaStore.put({ key: 'shop', value: shop });
        metaStore.put({ key: `pulled-at:${shop.id}`, value: Date.now() });

        if (products && products.length > 0) {
          const store = tx.objectStore('products');
          for (const p of products) store.put(p);
        }
        if (customers && customers.length > 0) {
          const store = tx.objectStore('customers');
          for (const c of customers) store.put(c);
        }
        if (balances && balances.length > 0) {
          const store = tx.objectStore('balances');
          for (const b of balances) {
            // balances keyPath is customerId
            store.put({ customerId: b.id || b.customerId, ...b });
          }
        }
        if (sales && sales.length > 0) {
          const store = tx.objectStore('sales');
          for (const s of sales) store.put(s);
        }
        if (ledger && ledger.length > 0) {
          const store = tx.objectStore('ledger');
          for (const l of ledger) store.put(l);
        }
        if (outbox && outbox.length > 0) {
          const store = tx.objectStore('outbox');
          for (const o of outbox) store.put(o);
        }

        // IMPORTANT: Close connection after write so Dexie can open without blockage
        tx.oncomplete = () => {
          db.close();
        };
      };
    },
    {
      session: sessionObj,
      shop,
      products: data.products ?? [],
      customers: data.customers ?? [],
      balances: data.balances ?? [],
      sales: data.sales ?? [],
      ledger: data.ledger ?? [],
      outbox: data.outbox ?? [],
    }
  );

  // Setup default route interceptor for Supabase API calls
  await page.route('**/auth/v1/user*', (r) =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(sessionObj.user),
    })
  );

  await page.route('**/rest/v1/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes('/shop_members') && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            role: shop.role,
            shops: {
              id: shop.id,
              name: shop.name,
              currency: shop.currency,
              locale: shop.locale,
              timezone: shop.timezone,
              allow_negative_stock: shop.allowNegativeStock,
              overdue_days: shop.overdueDays,
            },
          },
        ]),
      });
    }

    if (url.includes('/rpc/dashboard_summary')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          sales_total: 1500,
          sales_count: 5,
          paid_now: 1200,
          credit_given: 300,
          debt_collected: 100,
          cash_in: 1200,
          profit: shop.role === 'owner' ? 450 : null,
          low_stock_count: 1,
          total_owed: 500,
        }),
      });
    }

    if (url.includes('/rpc/top_products')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { product_id: 'p1', name: 'Sugar', unit: 'kg', qty: 25, revenue: 300 },
          { product_id: 'p2', name: 'Cooking Oil', unit: 'l', qty: 10, revenue: 250 },
        ]),
      });
    }

    if (url.includes('/rpc/record_sale')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'srv_sale_123', status: 'completed' }),
      });
    }

    if (url.includes('/rpc/void_sale')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      });
    }

    if (url.includes('/rpc/record_payment')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      });
    }

    if (url.includes('/rpc/record_stock_in')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      });
    }

    if (url.includes('/rpc/adjust_stock')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      });
    }

    if (url.includes('/rpc/create_product')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      });
    }

    if (url.includes('/rpc/create_invite')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify('INV-9999'),
      });
    }

    if (url.includes('/rpc/accept_invite')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(shop.id),
      });
    }

    if (url.includes('/rpc/customer_debts')) {
      const debts = (data.balances ?? []).map((b: any) => ({
        customer_id: b.customerId || b.id,
        balance: (b.balance ?? 0) / 100,
        oldest_open_at: b.oldestOpenAt ?? null,
        days_open: b.daysOpen ?? 0,
        is_overdue: Boolean(b.overdue),
      }));
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(debts),
      });
    }

    if (url.includes('/products') && method === 'GET') {
      const prods = (data.products ?? []).map((p: any) => ({
        id: p.id,
        name: p.name,
        unit: p.unit,
        sell_price: (p.sellPrice ?? 0) / 100,
        stock_qty: (p.stockQty ?? 0) / 1000,
        reorder_level: (p.reorderLevel ?? 0) / 1000,
        barcode: p.barcode ?? null,
        archived_at: p.archived ? '2026-01-01T00:00:00Z' : null,
        updated_at: p.updatedAt || new Date().toISOString(),
      }));
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(prods),
      });
    }

    if (url.includes('/product_costs') && method === 'GET') {
      const costs = (data.products ?? []).map((p: any) => ({
        product_id: p.id,
        cost_price: (p.costPrice ?? 0) / 100,
      }));
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(costs),
      });
    }

    if (url.includes('/customers') && method === 'GET') {
      const custs = (data.customers ?? []).map((c: any) => ({
        id: c.id,
        name: c.name,
        phone: c.phone ?? null,
        credit_limit: c.creditLimit !== null && c.creditLimit !== undefined ? c.creditLimit / 100 : null,
        archived_at: c.archived ? '2026-01-01T00:00:00Z' : null,
        updated_at: c.updatedAt || new Date().toISOString(),
      }));
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(custs),
      });
    }

    if (url.includes('/sales') && method === 'GET') {
      const sales = (data.sales ?? []).map((s: any) => ({
        id: s.serverId || 'srv_' + s.id,
        client_id: s.id,
        shop_id: shop.id,
        total: (s.total ?? 0) / 100,
        paid_amount: (s.paid ?? 0) / 100,
        method: s.method,
        status: s.status,
        customer_id: s.customerId ?? null,
        created_at: s.createdAt,
        sale_items: (s.items ?? []).map((i: any) => ({
          product_id: i.productId,
          qty: (i.qty ?? 0) / 1000,
          unit_price: (i.unitPrice ?? 0) / 100,
        })),
      }));
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(sales),
      });
    }

    if (url.includes('/customer_ledger') && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    }

    return route.continue();
  });
}
