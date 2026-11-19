# Phase 3 Report: Domain Logic, Offline Sync, Schemas & Integration Testing

## Done
1. **Strengthened Offline Outbox & Sync Testing ([tests/lib/sync_offline.test.ts](file:///c:/Users/abdul/OneDrive/Documents/shop-ledger/tests/lib/sync_offline.test.ts)):**
   - Configured in-memory Dexie IndexedDB testing with `fake-indexeddb/auto`.
   - Verified that `queueSale` decrements product stock immediately, records pending local sale, and updates customer balance if credit was extended.
   - Verified that `queuePayment` adds a pending ledger row with negative amount and reduces/clears customer balances.
   - Verified that `queueVoid` throws if called on an unsynced sale (no `serverId`), and on synced sales restores product stock, reverses customer credit, and marks the sale voided.
   - Verified `queueStockIn`, `queueAdjust`, `queueCustomer`, and `queueProduct` local optimistic updates.
   - Verified the critical cache rule: `pullAll` skips remote pulls whenever there are pending or syncing items in the outbox, preventing optimistic local updates from being overwritten.
2. **Form Validation Schemas Test Suite ([tests/lib/schemas.test.ts](file:///c:/Users/abdul/OneDrive/Documents/shop-ledger/tests/lib/schemas.test.ts)):**
   - Verified all 10 Zod schemas in `src/lib/schemas.ts`: `signInSchema`, `signUpSchema`, `shopNameSchema`, `productSchema`, `customerSchema`, `paymentSchema`, `restockSchema`, `adjustSchema`, `reasonSchema`, and `inviteCodeSchema`.
   - Validated boundary inputs, negative money handling, quantity formatting (commas and periods), string trimming, and translation key error mappings (`v.required`, `v.number`, `v.too_long`, `v.email`, `v.password`).
3. **Exhaustive Error Translation Tests ([tests/domain/errors_exhaustive.test.ts](file:///c:/Users/abdul/OneDrive/Documents/shop-ledger/tests/domain/errors_exhaustive.test.ts)):**
   - Tested that every exception code raised in SQL migrations 0001–0009 (`VALIDATION`, `RATE_LIMITED`, `LEDGER_IMMUTABLE`, `FORBIDDEN`, `LIMIT_EXCEEDED`, `NOT_FOUND`, `PRICE_CHANGED`, `STOCK_LOW`, `OVERPAYMENT`, `CUSTOMER_REQUIRED`, `SESSION_EXPIRED`) maps to a recognized `ErrorCode`.
   - Tested standard Postgres SQLSTATE error codes (`22023`, `22P02`, `22003`, `23502`, `23514`, `23505`, `23503`, `42501`) and PostgREST status codes.
   - Verified that every `ErrorCode` has non-empty, user-safe translations in all three languages (`en.ts`, `am.ts`, `om.ts`) without leaking database internals or SQL fragments.
4. **End-to-End RPC Integration Test Suite ([tests/integration/rpc_integration.test.ts](file:///c:/Users/abdul/OneDrive/Documents/shop-ledger/tests/integration/rpc_integration.test.ts)):**
   - Implemented multi-user integration test using `@supabase/supabase-js`.
   - Tests: signing up two users, creating isolated shops, verifying User B cannot write or read Shop A data (`FORBIDDEN`), running product creation, recording sales with idempotency replay, credit sales, debt payments, sale voiding, and report reconciliation via `dashboard_summary`.

---

## Verified
- **Test Suite:** `npm test` -> **74 tests (73 passed, 0 failed, 1 skipped)** in `12.18s`.
  - 50 domain and utility tests passing
  - 10 Zod schema validation tests passing
  - 10 offline sync and Dexie queue tests passing
  - 3 exhaustive error mapping and i18n tests passing
  - 1 live integration test (gracefully skips when remote cloud email confirmations are active)
- **TypeScript Typecheck:** `npm run typecheck` (`tsc --noEmit`) -> **0 errors**.
- **ESLint:** `npm run lint` (`next lint`) -> **✔ No ESLint warnings or errors**.

---

## Found and Fixed

| File | Problem | Fix |
| :--- | :--- | :--- |
| `src/lib/db.ts` | `db` was instantiated only when `typeof window !== 'undefined'`, causing Dexie to be `null` in Node.js test runs | Updated instantiation to `(typeof window === 'undefined' && typeof indexedDB === 'undefined') ? null : new ShopDB()` so importing `fake-indexeddb/auto` initializes `db` in Node tests while keeping static build SSR safe |
| `src/lib/db.ts` | `ShopDB` class was not exported | Added `export` to `class ShopDB extends Dexie` |
| `src/domain/errors.ts` | SQLSTATE code `22023` (invalid parameter value) was not in the database error mapping list | Added `dbCode === '22023'` mapping to `'VALIDATION'` |
| `tests/lib/sync_offline.test.ts` | Test isolation: shared shop ID caused background outbox draining from previous tests to affect subsequent assertions | Created `setupShop()` helper generating a unique UUID for each test |

---

## Still Broken or Not Verified
- **Cloud Live Integration Execution:**
  - Supabase Cloud enables email confirmations by default on new projects and rate limits email sends (4 emails/hr). When `enable_confirmations` is active in the remote dashboard, `signUp()` requires the user to click an email link before obtaining a session token, causing live programmatic signup in the integration test to skip.
  - To execute the live integration test against the remote cloud DB, email confirmations must be toggled off in the Supabase Dashboard (Authentication -> Providers -> Email -> uncheck "Confirm email").

---

## Decisions
- Maintained static build SSR safety in `src/lib/db.ts` while allowing in-memory `fake-indexeddb` initialization for Node tests.
- Documented decisions in `DECISIONS.md` and `CHANGELOG.md`.

---

## What I Must Do Myself
- **(Optional) To enable live remote integration tests against your Supabase Cloud project:**
  1. Go to your project dashboard: [https://supabase.com/dashboard/project/uuqypwwpujibxqvvvywx](https://supabase.com/dashboard/project/uuqypwwpujibxqvvvywx)
  2. Navigate to **Authentication** -> **Providers** -> **Email**.
  3. Toggle **Confirm email** to **OFF** and save.
  4. Running `npm test` will then execute the live RPC flow against the remote database.

---

## Next
- Proceed to **Phase 4**: Playwright end-to-end tests, failure-fuzz tests, visual regression, accessibility (axe), and build verification. Ready when you paste the Phase 4 prompt!
