import { test, expect } from '@playwright/test';
import { DEFAULT_USER, makeMockJwt } from './helpers';

test.describe('Journey 1 & 10: Onboarding and First Sale', () => {
  test('Journey 10: Fixed-layout onboarding elements do not shift or jump', async ({ page }) => {
    const token = makeMockJwt(DEFAULT_USER.id, DEFAULT_USER.email);
    const sessionObj = {
      access_token: token,
      refresh_token: 'fake-refresh',
      expires_in: 360000,
      expires_at: Math.floor(Date.now() / 1000) + 360000,
      token_type: 'bearer',
      user: {
        id: DEFAULT_USER.id,
        aud: 'authenticated',
        role: 'authenticated',
        email: DEFAULT_USER.email,
        app_metadata: { provider: 'email' },
        user_metadata: { full_name: DEFAULT_USER.name },
      },
    };

    await page.addInitScript(({ session }) => {
      window.localStorage.setItem('sb-uuqypwwpujibxqvvvywx-auth-token', JSON.stringify(session));
      window.localStorage.setItem('sl-locale', 'en');
    }, { session: sessionObj });

    await page.route('**/auth/v1/user*', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sessionObj.user) }));
    await page.route('**/rest/v1/shop_members*', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));

    await page.goto('/onboarding/');
    await expect(page.locator('h1')).toHaveText('Name your shop');

    // Measure progressbar box on Step 1
    const progress = page.locator('[role="progressbar"]');
    await expect(progress).toBeVisible();
    const box1 = await progress.boundingBox();
    expect(box1).not.toBeNull();

    // Trigger validation error on Step 1: click Next without entering shop name
    const nextBtn = page.getByRole('button', { name: 'Next' });
    await nextBtn.click();
    await expect(page.getByText('Required')).toBeVisible();

    // Measure progressbar box again after validation error appears
    const box1WithError = await progress.boundingBox();
    expect(box1WithError?.y).toBe(box1?.y);
    expect(box1WithError?.x).toBe(box1?.x);
    expect(box1WithError?.height).toBe(box1?.height);

    // Fill valid shop name and go to Step 2
    await page.getByLabel('Shop name').fill('Addis Supermarket');
    await nextBtn.click();
    await expect(page.locator('h1')).toHaveText('Add your first products');

    // Progress bar position on Step 2
    const box2 = await progress.boundingBox();
    expect(box2?.y).toBe(box1?.y);
    expect(box2?.x).toBe(box1?.x);

    // Go to Step 3
    await nextBtn.click();
    await expect(page.locator('h1')).toHaveText('How much do you have in stock?');

    // Progress bar position on Step 3
    const box3 = await progress.boundingBox();
    expect(box3?.y).toBe(box1?.y);
    expect(box3?.x).toBe(box1?.x);
  });

  test('Journey 1: Sign up -> onboarding -> first sale -> receipt', async ({ page }) => {
    let createdShopName = '';
    const userId = 'usr_marta_1';
    const userEmail = 'marta@test.com';
    const token = makeMockJwt(userId, userEmail);

    const userObj = {
      id: userId,
      aud: 'authenticated',
      role: 'authenticated',
      email: userEmail,
      app_metadata: { provider: 'email' },
      user_metadata: { full_name: 'Marta T' },
    };

    await page.route('**/auth/v1/signup*', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: token,
          token_type: 'bearer',
          expires_in: 360000,
          expires_at: Math.floor(Date.now() / 1000) + 360000,
          refresh_token: 'fake-refresh',
          user: userObj,
          session: {
            access_token: token,
            token_type: 'bearer',
            expires_in: 360000,
            expires_at: Math.floor(Date.now() / 1000) + 360000,
            refresh_token: 'fake-refresh',
            user: userObj,
          },
        }),
      })
    );

    await page.route('**/auth/v1/user*', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(userObj),
      })
    );

    await page.route('**/rest/v1/**', async (route) => {
      const url = route.request().url();
      if (url.includes('/rpc/create_shop')) {
        const body = route.request().postDataJSON();
        createdShopName = body.p_name;
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ id: 'shp_new_123', name: createdShopName }),
        });
      }
      if (url.includes('/shop_members')) {
        if (!createdShopName) {
          return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
        }
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              role: 'owner',
              shops: {
                id: 'shp_new_123',
                name: createdShopName,
                currency: 'ETB',
                locale: 'en',
                timezone: 'Africa/Addis_Ababa',
                allow_negative_stock: true,
                overdue_days: 30,
              },
            },
          ]),
        });
      }
      if (url.includes('/rpc/record_sale')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ id: 'sale_first_1', status: 'completed' }),
        });
      }
      return route.continue();
    });

    // 1. Visit auth page, switch to Sign Up
    await page.goto('/auth/');
    await page.getByRole('button', { name: 'New here? Create an account' }).click();
    await expect(page.locator('h2')).toHaveText('Create account');

    // 2. Fill sign up form
    await page.getByLabel('Your name').fill('Marta T');
    await page.getByLabel('Email').fill('marta@test.com');
    await page.getByLabel('Password').fill('secretPassword123');

    await page.getByRole('button', { name: 'Create account' }).click();

    // 3. Completes onboarding
    await expect(page).toHaveURL(/\/onboarding\//);
    await page.getByLabel('Shop name').fill('Marta Grocery');
    await page.getByRole('button', { name: 'Next' }).click(); // to step 2 (products)

    await expect(page.locator('h1')).toHaveText('Add your first products');
    await page.getByRole('button', { name: 'Next' }).click(); // to step 3 (stock)

    await expect(page.locator('h1')).toHaveText('How much do you have in stock?');
    await page.getByRole('button', { name: 'Record first sale' }).click();

    // 4. Navigates to Sell page
    await expect(page).toHaveURL(/\/sell\//);

    // 5. Select a product to add to cart
    // The sample items queued during onboarding include Sugar (120 ETB)
    const sugarItem = page.locator('button', { hasText: 'Sugar' }).first();
    await sugarItem.click();

    // Bottom cart bar appears showing "Charge" button
    const chargeBtn = page.getByRole('button', { name: /Charge/i });
    await expect(chargeBtn).toBeVisible();
    await chargeBtn.click();

    // 6. Payment sheet appears: Cash is preselected by default
    await expect(page.getByRole('dialog')).toBeVisible();
    const confirmBtn = page.getByRole('button', { name: /Confirm/i });
    await confirmBtn.click();

    // 7. Receipt is displayed
    await expect(page.getByRole('heading', { name: 'Sale recorded' })).toBeVisible();
    await expect(page.getByText('Saved on this phone')).toBeVisible();
    await expect(page.getByRole('button', { name: 'New sale' })).toBeVisible();
  });
});
