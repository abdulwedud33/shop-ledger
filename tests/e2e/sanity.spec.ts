import { test, expect } from '@playwright/test';

test('auth page loads and has accessible form', async ({ page }) => {
  await page.goto('/auth/');
  await expect(page.locator('h1')).toHaveText('Shop Ledger');
  await expect(page.locator('input[type="email"]')).toBeVisible();
  await expect(page.locator('input[type="password"]')).toBeVisible();
});
