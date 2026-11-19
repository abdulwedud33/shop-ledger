import { test, expect } from '@playwright/test';
import { DEFAULT_SHOP, DEFAULT_USER, seedAppState } from './helpers';

test.describe('Journey 3: Offline Sale and Idempotent Sync', () => {
  test('Sell offline -> local save -> reconnect -> single sync without duplication', async ({ page, context }) => {
    const offlineProduct = {
      id: 'prod_tea_1',
      shopId: DEFAULT_SHOP.id,
      name: 'Black Tea',
      unit: 'pack',
      sellPrice: 5000, // 50 ETB
      costPrice: 3500,
      stockQty: 10000, // 10 packs
      reorderLevel: 2000,
      archived: 0,
      updatedAt: new Date().toISOString(),
      pending: 0,
    };

    let serverSaleCount = 0;
    const receivedClientIds = new Set<string>();

    await seedAppState(page, {
      user: DEFAULT_USER,
      shop: DEFAULT_SHOP,
      products: [offlineProduct],
    });

    await page.route(/\/rpc\/record_sale/, async (route) => {
      console.log('[TEST] RECORD_SALE ROUTE INTERCEPTED!');
      const data = route.request().postDataJSON();
      const clientId = data?.p_client_id || 'unknown';
      if (!receivedClientIds.has(clientId)) {
        receivedClientIds.add(clientId);
        serverSaleCount++;
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'srv_tea_sale_1', client_id: clientId, status: 'completed' }),
      });
    });

    page.on('console', (m) => console.log('[PAGE CONSOLE]', m.text()));
    page.on('pageerror', (e) => console.log('[PAGE ERROR]', e));
    page.on('requestfailed', (req) => console.log('[REQ FAILED]', req.method(), req.url(), req.failure()?.errorText));
    page.on('response', (res) => { if (res.status() >= 400) console.log('[RES ERROR]', res.status(), res.url()); });

    // 1. Visit Sell page while online
    await page.goto('/sell/');
    await expect(page.locator('h1')).toHaveText('New sale');
    await expect(page.getByText('Black Tea')).toBeVisible();

    // 2. Go OFFLINE
    await context.setOffline(true);
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
      window.dispatchEvent(new Event('offline'));
    });

    // Verify offline banner appears in app header
    await expect(page.getByText('Offline. Changes are saved on this phone.')).toBeVisible();

    // 3. Make a sale while offline
    const teaTile = page.locator('button', { hasText: 'Black Tea' }).first();
    await teaTile.click();

    // Charge button shows 50.00 ETB
    const chargeBtn = page.getByRole('button', { name: /Charge/i });
    await chargeBtn.click();

    // Confirm Cash payment
    const confirmBtn = page.getByRole('button', { name: /Confirm/i });
    await confirmBtn.click();

    // 4. Receipt displays "Saved on this phone" mark
    await expect(page.getByRole('heading', { name: 'Sale recorded' })).toBeVisible();
    await expect(page.getByText('Saved on this phone', { exact: true })).toBeVisible();

    // 5. Reconnect (Go back ONLINE)
    await context.setOffline(false);
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
      window.dispatchEvent(new Event('online'));
    });

    // Header offline banner disappears
    await expect(page.getByText('Offline. Changes are saved on this phone.')).not.toBeVisible();

    // Wait for sync worker to drain outbox
    await page.waitForTimeout(2000);

    // Verify server received exactly one record_sale call
    expect(serverSaleCount).toBe(1);

    // 6. Simulate a second reconnect (trigger online event again)
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await page.waitForTimeout(1000);

    // Still exactly one sale on server (idempotent client_id deduplicated)
    expect(serverSaleCount).toBe(1);
  });
});
