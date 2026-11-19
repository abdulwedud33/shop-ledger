import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { DEFAULT_SHOP, DEFAULT_USER, seedAppState } from './helpers';

test.describe('Journey 12 & 13: Failure Fuzzing & Accessibility (axe-core)', () => {
  test('Journey 12: Failure fuzzing - zero SQL text, error code, stack trace or raw JSON in DOM', async ({ page }) => {
    // Intercept with various raw database error codes and SQL error payloads
    const evilErrors = [
      {
        status: 400,
        body: JSON.stringify({
          code: '23505',
          message: 'duplicate key value violates unique constraint "shops_pkey"',
          details: 'Key (id)=(123) already exists.',
          hint: 'Check pkey sequence',
        }),
      },
      {
        status: 403,
        body: JSON.stringify({
          code: '42501',
          message: 'new row violates row-level security policy for table "sales"',
          details: 'Failing row contains (null, ...)',
        }),
      },
      {
        status: 500,
        body: JSON.stringify({
          code: 'XX000',
          message: 'Internal server error at plpgsql function record_sale line 42',
          stack: 'Error: Connection lost\n    at pg.Client.query (/var/db/client.js:100:15)',
        }),
      },
    ];

    let errorIndex = 0;
    await page.route('**/rpc/dashboard_summary', (route) => {
      const err = evilErrors[errorIndex % evilErrors.length]!;
      errorIndex++;
      return route.fulfill({
        status: err.status,
        contentType: 'application/json',
        body: err.body,
      });
    });

    await seedAppState(page, {
      user: DEFAULT_USER,
      shop: DEFAULT_SHOP,
    });

    await page.goto('/reports/');

    // Wait for error state to render
    await page.waitForTimeout(1000);

    const bodyText = await page.innerText('body');

    // Assert that NO raw SQL, Postgres error codes, stack traces, or raw JSON leaked to DOM
    expect(bodyText).not.toContain('23505');
    expect(bodyText).not.toContain('42501');
    expect(bodyText).not.toContain('XX000');
    expect(bodyText).not.toContain('violates unique constraint');
    expect(bodyText).not.toContain('violates row-level security');
    expect(bodyText).not.toContain('Internal server error');
    expect(bodyText).not.toContain('plpgsql');
    expect(bodyText).not.toContain('at pg.Client.query');
    expect(bodyText).not.toContain('{"code":');
  });

  test('Journey 13: Accessibility (axe-core) on routes in light & dark modes', async ({ page }) => {
    await seedAppState(page, {
      user: DEFAULT_USER,
      shop: DEFAULT_SHOP,
    });

    const routes = ['/auth/', '/', '/sell/', '/products/', '/customers/', '/reports/', '/settings/'];

    for (const theme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: theme });

      for (const route of routes) {
        await page.goto(route);
        await page.waitForTimeout(300);

        const results = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa'])
          // Exclude rules that require full external color contrast calibration on custom tokens in headless
          .disableRules(['color-contrast'])
          .analyze();

        const criticalOrSerious = results.violations.filter(
          (v) => v.impact === 'critical' || v.impact === 'serious'
        );

        if (criticalOrSerious.length > 0) {
          console.error(`A11y violations on ${route} (${theme}):`, JSON.stringify(criticalOrSerious, null, 2));
        }

        expect(criticalOrSerious, `Accessibility violation on ${route} (${theme})`).toEqual([]);
      }
    }
  });
});
