# Phase 5: End-to-End User Journeys and Verification

**Date:** 2026-11-19  
**Status:** Completed  
**Verification:** Automated test suite with 14 Playwright E2E tests covering all 13 required user journeys.

---

## 1. Overview & Setup

In Phase 5, comprehensive automated end-to-end tests were implemented in `@playwright/test` targeting the phone-sized viewport (390x844, matching Pixel 5 / iPhone mobile form factor) against the statically exported production site (`out/`) served via `scripts/serve-out.mjs`.

### Test Architecture
- **Config:** `playwright.config.ts` running single-worker to prevent IndexedDB lock collisions, targeting `http://127.0.0.1:4173` with webServer lifecycle.
- **Fixtures & State Seeding:** `tests/e2e/helpers.ts` seeds IndexedDB `shop-ledger` stores (`meta`, `products`, `customers`, `balances`, `sales`, `ledger`, `outbox`) alongside localStorage auth sessions, immediately closing initialization connections to prevent Dexie version upgrade blockage.
- **Network Interception:** Route mocks for Supabase auth, PostgREST tables (`products`, `customers`, `product_costs`, `sales`, `customer_ledger`, `shop_members`) and RPCs (`record_sale`, `void_sale`, `record_payment`, `record_stock_in`, `adjust_stock`, `create_product`, `create_invite`, `accept_invite`, `customer_debts`, `dashboard_summary`, `top_products`).

---

## 2. All 13 User Journeys Verified

| Journey | Spec Requirements | Test File | Result |
|---|---|---|---|
| **1** | Sign up -> 3-step onboarding (queued sample products) -> first sale -> receipt | `01_onboarding_and_first_sale.spec.ts` | **PASS** |
| **2** | Add a product, restock, correct stock; low-stock chip appears on Home | `02_stock_and_products.spec.ts` | **PASS** |
| **3** | Sell offline: saved on phone, "Saved on this phone" mark, reconnect, exactly 1 sale on server, stock correct, no duplicate on second reconnect | `03_offline_sync.spec.ts` | **PASS** |
| **4** | Credit sale to new customer, partial payment, balance & FIFO overdue ageing, payment cannot exceed balance | `04_debts_and_void.spec.ts` | **PASS** |
| **5** | Void synced sale as owner: stock restored, debt reversed; cashier cannot see Void button | `04_debts_and_void.spec.ts` | **PASS** |
| **6** | Cashier invite via code: cashier sees no cost, profit, team or settings; price override rejected (PRICE_CHANGED) as friendly message | `05_team_and_cashier_privileges.spec.ts` | **PASS** |
| **7** | Reports reconcile with ledger; CSV export is formula-safe (leading `=`, `+`, `-`, `@` escaped) | `05_team_and_cashier_privileges.spec.ts` | **PASS** |
| **8** | Settings: negative-stock toggle blocks overselling; delete shop wipes data & local storage, redirects to `/auth/` | `02_stock_and_products.spec.ts` | **PASS** |
| **9** | Language switch to Amharic and Afaan Oromo: renders without clipping at 130% string length and 200% text zoom | `06_i18n_zoom_and_skeletons.spec.ts` | **PASS** |
| **10** | Fixed-layout onboarding: progress bar and action bar do not shift, resize, or jump when validation messages appear | `01_onboarding_and_first_sale.spec.ts` | **PASS** |
| **11** | No spinners: zero elements with spinner role/class; layout-matched skeletons appear during load | `06_i18n_zoom_and_skeletons.spec.ts` | **PASS** |
| **12** | Failure fuzz: force server failures; assert zero SQL text, error codes, stack traces, or raw JSON in DOM | `07_failure_fuzz_and_a11y.spec.ts` | **PASS** |
| **13** | Accessibility: axe-core WCAG 2.1 AA across all routes in light and dark mode with zero critical/serious issues | `07_failure_fuzz_and_a11y.spec.ts` | **PASS** |

---

## 3. Root Cause Bugs Found & Fixed in App Code

1. **Async IIFE Variable Assignment Trap in `drainOutbox` and `pullAll` (`src/lib/sync.ts`):**
   - **Problem:** `draining = (async () => { try { if (navigator.onLine === false) return; ... } finally { draining = null; } })();`
     When offline, synchronous execution returned immediately inside the function, executing `finally { draining = null; }` *before* the outer expression assigned the resolved promise back to `draining`. As a result, `draining` was permanently bound to a fulfilled Promise and never cleared, locking all future `drainOutbox` calls out of executing.
   - **Fix:** Check `navigator.onLine === false` *before* instantiating the promise assignment (`if (typeof navigator !== 'undefined' && navigator.onLine === false) return Promise.resolve();`), and store the promise in a local variable before assigning (`const p = ...; draining = p; return p;`).
2. **Duplicate DOM ID in Settings (`src/app/settings/page.tsx`):**
   - **Problem:** Both the shop name settings field and the delete confirmation dialog generated `id="f-shop-name"`, causing accessibility label collisions.
   - **Fix:** Assigned `id="confirm-shop-name"` to the delete confirmation field.
3. **Missing Fields in `dashboard_summary` RPC Mock (`tests/e2e/helpers.ts`):**
   - **Problem:** `dashboard_summary` response was missing `paid_now`, causing `toMinor(r.paid_now)` to receive `undefined` and throw `Error: invalid money value`, resulting in `<Empty title="Something went wrong" />` in reports.
   - **Fix:** Provided complete response schema including `paid_now`, `sales_count`, `low_stock_count`, and `total_owed`.
4. **Data Isolation Security Verification on Multi-User Switch (`src/lib/session.tsx`):**
   - **Verified:** When signing in as a different user on the same device, `loadShop` automatically runs `wipeLocalData()`, guaranteeing that previous customer and shop data cannot leak to unauthorized operators.

---

## 4. Final Test Suite Results

```text
Running 14 tests using 1 worker

  ok  1 [Mobile Chrome] › tests/e2e/01_onboarding_and_first_sale.spec.ts:5:3 › Journey 10: Fixed-layout onboarding (1.9s)
  ok  2 [Mobile Chrome] › tests/e2e/01_onboarding_and_first_sale.spec.ts:71:3 › Journey 1: Sign up -> onboarding -> first sale -> receipt (4.2s)
  ok  3 [Mobile Chrome] › tests/e2e/02_stock_and_products.spec.ts:5:3 › Journey 2: Add product, restock, correct stock, low-stock chip (4.9s)
  ok  4 [Mobile Chrome] › tests/e2e/02_stock_and_products.spec.ts:60:3 › Journey 8: Negative-stock toggle & delete shop wipes data (5.1s)
  ok  5 [Mobile Chrome] › tests/e2e/03_offline_sync.spec.ts:5:3 › Journey 3: Sell offline -> local save -> reconnect -> single sync (5.4s)
  ok  6 [Mobile Chrome] › tests/e2e/04_debts_and_void.spec.ts:5:3 › Journey 4: Credit sale, partial payment, balance, overpayment blocked (1.5s)
  ok  7 [Mobile Chrome] › tests/e2e/04_debts_and_void.spec.ts:88:3 › Journey 5: Void synced sale as owner; cashier cannot see Void button (2.4s)
  ok  8 [Mobile Chrome] › tests/e2e/05_team_and_cashier_privileges.spec.ts:5:3 › Journey 6: Cashier privilege isolation & friendly price error (4.2s)
  ok  9 [Mobile Chrome] › tests/e2e/05_team_and_cashier_privileges.spec.ts:80:3 › Journey 7: Reports reconcile with ledger; CSV export formula-safe (1.8s)
  ok 10 [Mobile Chrome] › tests/e2e/06_i18n_zoom_and_skeletons.spec.ts:5:3 › Journey 9: Amharic and Afaan Oromo at 200% zoom without clipping (2.6s)
  ok 11 [Mobile Chrome] › tests/e2e/06_i18n_zoom_and_skeletons.spec.ts:42:3 › Journey 11: No spinners exist; layout-matched skeletons appear (2.7s)
  ok 12 [Mobile Chrome] › tests/e2e/07_failure_fuzz_and_a11y.spec.ts:6:3 › Journey 12: Failure fuzzing - zero SQL text/stack trace in DOM (1.8s)
  ok 13 [Mobile Chrome] › tests/e2e/07_failure_fuzz_and_a11y.spec.ts:71:3 › Journey 13: Accessibility (axe-core) on routes in light & dark modes (29.1s)
  ok 14 [Mobile Chrome] › tests/e2e/sanity.spec.ts:3:1 › auth page loads and has accessible form (2.8s)

  14 passed (1.3m)
```
