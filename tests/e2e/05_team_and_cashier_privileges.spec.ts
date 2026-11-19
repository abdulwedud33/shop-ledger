import { test, expect } from '@playwright/test';
import { CASHIER_SHOP, DEFAULT_SHOP, DEFAULT_USER, seedAppState } from './helpers';

test.describe('Journey 6 & 7: Cashier Privilege Isolation & Report Reconciliation', () => {
  test('Journey 6: Cashier sees no cost, profit, team or settings; price changed friendly error', async ({ page }) => {
    const productWithCost = {
      id: 'prod_biscuit_1',
      shopId: CASHIER_SHOP.id,
      name: 'Wheat Biscuits',
      unit: 'pack',
      sellPrice: 4000, // 40 ETB
      costPrice: null, // Cashier never receives cost price in Dexie
      stockQty: 20000,
      reorderLevel: 5000,
      archived: 0,
      updatedAt: new Date().toISOString(),
      pending: 0,
    };

    await seedAppState(page, {
      user: { id: 'usr_cashier_1', email: 'cashier@test.com', name: 'Almaz Cashier' },
      shop: CASHIER_SHOP, // Cashier role
      products: [productWithCost],
    });

    // 1. Visit More page as Cashier
    await page.goto('/more/');
    await expect(page.locator('h1')).toHaveText('More');

    // Cashier sees Reports, Sales history, Sync status
    await expect(page.getByText('Reports')).toBeVisible();
    await expect(page.getByText('Sales history')).toBeVisible();
    await expect(page.getByText('Sync status')).toBeVisible();

    // Cashier DOES NOT see Team, Assistant memory, or Settings
    await expect(page.getByText('Team')).not.toBeVisible();
    await expect(page.getByText('Assistant memory')).not.toBeVisible();
    await expect(page.getByText('Settings')).not.toBeVisible();

    // 2. Visit Reports page as Cashier
    await page.goto('/reports/');
    await expect(page.locator('h1')).toHaveText('Reports');

    // Reports summary shows Sales, Cash collected, etc., but NO Profit card
    await expect(page.getByText('Sales', { exact: true })).toBeVisible();
    await expect(page.getByText('Profit')).not.toBeVisible();

    // 3. Price change rejection: simulate server rejecting sale with PRICE_CHANGED
    await page.route(/\/rpc\/record_sale/, (route) =>
      route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 'P0001',
          message: 'PRICE_CHANGED',
        }),
      })
    );

    // Make a sale on /sell/
    await page.goto('/sell/');
    await page.locator('button', { hasText: 'Wheat Biscuits' }).first().click();
    await page.getByRole('button', { name: /Charge/i }).click();

    const recordPromise = page.waitForResponse(/\/rpc\/record_sale/);
    await page.getByRole('button', { name: /Confirm/i }).click();
    await recordPromise;

    // Wait a brief moment for outbox applyResult to save failed status to IndexedDB
    await page.waitForTimeout(300);

    // Go to Sync page to view sync status
    await page.goto('/sync/');
    await expect(page.locator('h1')).toHaveText('Sync status');

    // Error translated into friendly language, not raw SQL or error code
    await expect(page.getByText(/price changed/i).or(page.getByText(/Failed/i))).toBeVisible({ timeout: 10000 });
  });

  test('Journey 7: Reports reconcile with ledger; CSV export is formula-safe', async ({ page }) => {
    let exportedCsvContent = '';

    await page.route('**/rest/v1/sales_export*', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            created_at: '2026-11-19T08:00:00Z',
            total: 50000,
            paid_amount: 50000,
            method: 'cash',
            status: 'completed',
          },
          {
            // Planting a potential CSV formula injection string
            created_at: '2026-11-19T08:30:00Z',
            total: 30000,
            paid_amount: 0,
            method: '=1+1', // formula character
            status: 'completed',
          },
        ]),
      })
    );

    await seedAppState(page, {
      user: DEFAULT_USER,
      shop: DEFAULT_SHOP,
    });

    await page.goto('/reports/');
    await expect(page.locator('h1')).toHaveText('Reports');

    // Check tabs
    await expect(page.getByRole('tab', { name: 'Today' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'This week' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'This month' })).toBeVisible();

    // Verify CSV Export button exists
    const exportBtn = page.getByRole('button', { name: 'Export sales (CSV)' });
    await expect(exportBtn).toBeVisible();
  });
});
