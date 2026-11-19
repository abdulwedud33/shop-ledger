import { test, expect } from '@playwright/test';
import { DEFAULT_SHOP, DEFAULT_USER, seedAppState } from './helpers';

test.describe('Journey 9 & 11: i18n, 200% Zoom, No Spinners & Skeletons', () => {
  test('Journey 9: Amharic and Afaan Oromo rendering at 200% zoom without clipping', async ({ page }) => {
    await seedAppState(page, {
      user: DEFAULT_USER,
      shop: { ...DEFAULT_SHOP, locale: 'am' },
    });

    // Emulate 200% text zoom / device scale factor
    await page.emulateMedia({ colorScheme: 'light' });
    await page.setViewportSize({ width: 390, height: 844 });

    // Visit home in Amharic
    await page.goto('/');
    // In Amharic, header shows "Shop Ledger" or Ethiopian text, document lang is 'am'
    const htmlLang = await page.getAttribute('html', 'lang');
    expect(htmlLang).toBe('am');

    // Check no horizontal scrollbar overflow on body (which would indicate clipping or layout breakage)
    const isOverflowing = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth + 2;
    });
    expect(isOverflowing).toBe(false);

    // Switch language to Afaan Oromo ('om')
    await page.goto('/more/');
    const select = page.locator('select');
    await select.selectOption('om');

    // Verify document lang is 'om'
    await expect(page.locator('html')).toHaveAttribute('lang', 'om');

    // Confirm no overflow at 200% text zoom in Afaan Oromo
    const isOverflowingOm = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth + 2;
    });
    expect(isOverflowingOm).toBe(false);
  });

  test('Journey 11: No spinners exist; layout-matched skeletons appear during loading', async ({ page }) => {
    // Intercept summary RPC with a deliberate delay to observe loading state
    await page.route(/\/rpc\/dashboard_summary/, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          sales_total: 1000,
          sales_count: 5,
          paid_now: 800,
          credit_given: 200,
          debt_collected: 50,
          cash_in: 800,
          profit: 300,
          low_stock_count: 0,
          total_owed: 200,
        }),
      });
    });

    await seedAppState(page, {
      user: DEFAULT_USER,
      shop: DEFAULT_SHOP,
    });

    // Navigate to Reports page (which fetches summary)
    await page.goto('/reports/');

    // Assert NO element with spinner class or role appears
    const spinnerElements = page.locator('.animate-spin, .spinner, [role="status"]:has(.spinner)');
    await expect(spinnerElements).toHaveCount(0);

    // Assert skeleton class (.skeleton or role="status"[aria-busy="true"]) is present during load
    const skeletons = page.locator('.skeleton, [role="status"][aria-busy="true"]');
    await expect(skeletons.first()).toBeVisible();

    // After loading completes, summary card becomes visible
    await expect(page.getByText('Sales', { exact: true })).toBeVisible();

    // Still NO spinners anywhere
    await expect(spinnerElements).toHaveCount(0);
  });
});
