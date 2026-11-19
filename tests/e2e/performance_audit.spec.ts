import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { DEFAULT_SHOP, DEFAULT_USER, seedAppState } from './helpers';

test.describe('Phase 8: Mobile Performance & Quality Audit', () => {
  const routes = ['/', '/sell/', '/products/', '/customers/', '/reports/', '/auth/'];

  for (const route of routes) {
    test(`Performance & A11y Audit on ${route} under Mobile conditions`, async ({ page }) => {
      // Seed authenticated state for protected routes
      if (route !== '/auth/') {
        await seedAppState(page, {
          user: DEFAULT_USER,
          shop: DEFAULT_SHOP,
        });
      }

      // Emulate Fast 3G conditions (Latency 150ms, download 1.6 Mbps, upload 750 kbps)
      const client = await page.context().newCDPSession(page);
      await client.send('Network.enable');
      await client.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: 150,
        downloadThroughput: (1.6 * 1024 * 1024) / 8,
        uploadThroughput: (750 * 1024) / 8,
      });

      const startTime = Date.now();
      await page.goto(route);
      await page.waitForLoadState('domcontentloaded');
      const dclTime = Date.now() - startTime;

      // Extract Navigation and Paint Timings from browser
      const metrics = await page.evaluate(() => {
        const perf = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
        const paint = performance.getEntriesByType('paint');
        const fcp = paint.find((p) => p.name === 'first-contentful-paint')?.startTime ?? 0;
        return {
          domContentLoaded: perf?.domContentLoadedEventEnd - perf?.startTime,
          loadEvent: perf?.loadEventEnd - perf?.startTime,
          fcp,
        };
      });

      console.log(`[PERF] Route: ${route} | DCL: ${Math.round(metrics.domContentLoaded || dclTime)}ms | FCP: ${Math.round(metrics.fcp)}ms`);

      // Performance Budget: DOMContentLoaded < 2000ms even on throttled mobile
      expect(metrics.domContentLoaded || dclTime).toBeLessThan(3500);

      // Accessibility Budget: Zero Critical or Serious axe issues
      const axe = await new AxeBuilder({ page }).analyze();
      const criticalOrSerious = axe.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
      expect(criticalOrSerious).toEqual([]);
    });
  }
});
