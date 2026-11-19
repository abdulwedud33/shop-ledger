import { test, expect } from '@playwright/test';
import { CASHIER_SHOP, DEFAULT_SHOP, DEFAULT_USER, seedAppState } from './helpers';

test.describe('Journey 4 & 5: Debts, Aging, Payments and Void Privileges', () => {
  test('Journey 4: Credit sale to new customer, partial payment, balance, overpayment blocked', async ({ page }) => {
    const riceProduct = {
      id: 'prod_rice_1',
      shopId: DEFAULT_SHOP.id,
      name: 'Basmati Rice',
      unit: 'kg',
      sellPrice: 15000, // 150.00 ETB
      costPrice: 11000,
      stockQty: 50000,
      reorderLevel: 5000,
      archived: 0,
      updatedAt: new Date().toISOString(),
      pending: 0,
    };

    const existingCustomer = {
      id: 'cust_tariku_1',
      shopId: DEFAULT_SHOP.id,
      name: 'Tariku Bekele',
      phone: '+251911223344',
      creditLimit: 500000, // 5,000 ETB limit
      archived: 0,
      updatedAt: new Date().toISOString(),
      pending: 0,
    };

    const existingBalance = {
      id: existingCustomer.id,
      shopId: DEFAULT_SHOP.id,
      balance: 10000, // owes 100.00 ETB
      overdue: false,
      updatedAt: new Date().toISOString(),
    };

    const existingLedger = [
      {
        id: 'led_1',
        shopId: DEFAULT_SHOP.id,
        customerId: existingCustomer.id,
        amount: 10000,
        type: 'charge',
        referenceId: 'sale_prev',
        createdAt: new Date().toISOString(),
        pending: 0,
      },
    ];

    await seedAppState(page, {
      user: DEFAULT_USER,
      shop: DEFAULT_SHOP,
      products: [riceProduct],
      customers: [existingCustomer],
      balances: [existingBalance],
      ledger: existingLedger,
    });

    // 1. Visit Customer Detail page
    await page.goto(`/customers/detail/?id=${existingCustomer.id}`);
    await expect(page.locator('h1')).toHaveText('Tariku Bekele');

    // Customer owes 100.00 ETB
    await expect(page.getByText('Owes')).toBeVisible();
    await expect(page.getByText('Br 100')).toBeVisible();

    // 2. Click Pay to open payment sheet
    await page.getByRole('button', { name: 'Record payment' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // 3. Test overpayment rejection: try paying 150.00 ETB (exceeds balance of 100.00 ETB)
    await page.getByLabel('Amount').fill('150');
    await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();

    // Friendly validation error shown
    await expect(page.getByText('That is more than the amount owed.')).toBeVisible();

    // 4. Pay partial amount: 40.00 ETB
    await page.getByLabel('Amount').fill('40');
    await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();

    // Payment recorded toast appears
    await expect(page.getByText('Payment recorded')).toBeVisible();
  });

  test('Journey 5: Void a synced sale as owner; cashier cannot see Void button', async ({ page }) => {
    const saleToVoid = {
      id: 'local_sale_void_1',
      serverId: 'srv_sale_void_1',
      shopId: DEFAULT_SHOP.id,
      total: 25000, // 250 ETB
      paid: 25000,
      method: 'cash',
      customerId: null,
      customerName: null,
      status: 'completed',
      sync: 'synced',
      createdAt: new Date().toISOString(),
      items: [
        {
          productId: 'prod_oil_1',
          name: 'Sunflower Oil',
          unit: 'l',
          unitPrice: 25000,
          qty: 1000,
        },
      ],
    };

    // --- Scenario A: Owner views sale ---
    await seedAppState(page, {
      user: DEFAULT_USER,
      shop: DEFAULT_SHOP, // Owner role
      sales: [saleToVoid],
    });

    await page.goto('/sales/');
    await expect(page.locator('h1')).toHaveText('Sales');
    await page.locator('button', { hasText: 'Br 250' }).first().click();

    // Owner sees the Void sale button
    await expect(page.getByRole('dialog')).toBeVisible();
    const voidBtn = page.getByRole('dialog').getByRole('button', { name: 'Void sale' });
    await expect(voidBtn).toBeVisible();

    // Click void -> preset reasons appear -> confirm void
    await voidBtn.click();
    await page.getByRole('button', { name: 'Void sale' }).click();
    await expect(page.getByText('Sale voided')).toBeVisible();

    // --- Scenario B: Cashier views sale ---
    const activeSale = { ...saleToVoid, id: 'sale_cashier_view_1', status: 'completed' as const };
    await seedAppState(page, {
      user: { id: 'usr_cashier_1', email: 'cashier@test.com', name: 'Cashier User' },
      shop: { ...DEFAULT_SHOP, role: 'cashier' }, // Cashier in same shop
      sales: [activeSale],
    });

    await page.goto('/sales/');
    await page.locator('button', { hasText: 'Br 250' }).first().click();

    // Cashier opens sale dialog: Void button is NOT visible
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('dialog').getByRole('button', { name: 'Void sale' })).not.toBeVisible();
  });
});
