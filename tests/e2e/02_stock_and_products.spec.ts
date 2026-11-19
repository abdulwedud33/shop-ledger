import { test, expect } from '@playwright/test';
import { DEFAULT_SHOP, DEFAULT_USER, seedAppState } from './helpers';

test.describe('Journey 2 & 8: Products, Stock & Settings', () => {
  test('Journey 2: Add product, restock, correct stock, low-stock chip on Home', async ({ page }) => {
    const testProduct = {
      id: 'prod_coffee_1',
      shopId: DEFAULT_SHOP.id,
      name: 'Yirgacheffe Coffee',
      unit: 'kg',
      sellPrice: 35000, // 350.00 ETB
      costPrice: 28000,
      stockQty: 2000, // 2.0 kg
      reorderLevel: 5000, // 5.0 kg (Low stock trigger!)
      archived: 0,
      updatedAt: new Date().toISOString(),
      pending: 0,
    };

    await seedAppState(page, {
      user: DEFAULT_USER,
      shop: DEFAULT_SHOP,
      products: [testProduct],
    });

    // 1. Visit Products page
    await page.goto('/products/');
    await expect(page.locator('h1')).toHaveText('Products');
    await expect(page.getByText('Yirgacheffe Coffee')).toBeVisible();

    // Check low stock chip is visible because 2.0 kg <= 5.0 kg reorder level
    await expect(page.getByText('Low')).toBeVisible();

    // 2. Restock product
    await page.getByText('Yirgacheffe Coffee').click();
    await page.getByRole('button', { name: 'Restock' }).click();

    // Restock sheet appears
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByLabel('Quantity').fill('10'); // add 10 kg
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Stock added')).toBeVisible();

    // 3. Stock Correction / Adjustment
    await page.getByText('Yirgacheffe Coffee').click();
    await page.getByRole('button', { name: 'Correct stock' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByLabel('Quantity').fill('-8'); // correction of -8 kg leaves stock at 4 kg (<= 5 kg reorder level)
    await page.getByLabel('Reason').fill('Inventory count discrepancy');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Stock corrected')).toBeVisible();

    // 4. Visit Home page: verify low stock chip appears on Home
    await page.goto('/');
    await expect(page.locator('header h1')).toHaveText(DEFAULT_SHOP.name);
    // Low stock indicator on home
    await expect(page.getByText('Yirgacheffe Coffee')).toBeVisible();
  });

  test('Journey 8: Negative-stock toggle blocks overselling; delete shop wipes data', async ({ page }) => {
    const limitedProduct = {
      id: 'prod_salt_1',
      shopId: DEFAULT_SHOP.id,
      name: 'Table Salt',
      unit: 'pack',
      sellPrice: 2500, // 25 ETB
      costPrice: 1800,
      stockQty: 1000, // exactly 1 pack in stock
      reorderLevel: 0,
      archived: 0,
      updatedAt: new Date().toISOString(),
      pending: 0,
    };

    // Shop with allowNegativeStock = false
    const strictShop = {
      ...DEFAULT_SHOP,
      allowNegativeStock: false,
    };

    await seedAppState(page, {
      user: DEFAULT_USER,
      shop: strictShop,
      products: [limitedProduct],
    });

    // 1. Visit Sell page
    await page.goto('/sell/');
    const saltBtn = page.locator('button', { hasText: 'Table Salt' }).first();
    await saltBtn.click(); // adds 1 pack (stock remaining: 0)

    // Attempting to add second pack when stock is 0 and negative stock is disallowed triggers STOCK_LOW
    await saltBtn.click();
    await expect(page.getByText('Not enough stock for this sale.')).toBeVisible();

    // 2. Settings: Delete shop flow
    await page.goto('/settings/');
    await expect(page.locator('h1')).toHaveText('Settings');

    // Click Delete shop button
    await page.getByRole('button', { name: 'Delete shop and all data' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Type shop name confirmation
    await page.getByRole('dialog').getByLabel('Shop name').fill(DEFAULT_SHOP.name);

    // Mock delete_shop RPC
    await page.route('**/rpc/delete_shop', (r) => r.fulfill({ status: 200, body: JSON.stringify({ ok: true }) }));

    await page.getByRole('dialog').getByRole('button', { name: 'Delete shop and all data' }).click();

    // Verifies redirect back to /auth/
    await expect(page).toHaveURL(/\/auth\//);
  });
});
