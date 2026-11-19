# Phase 6: AUDIT.md Completion & Polish

**Date:** 2026-11-19  
**Status:** Completed  
**Verification:** Full clean check suite (`npm run check` with typecheck, lint, 74 tests, Next.js static build, postbuild CSP, secret bundle scan) and all 14 Playwright E2E tests passing.

---

## 1. Overview of Phase 6 Goals

In Phase 6, all items marked `Partial` or `Missing` in `AUDIT.md` across the v1 scope were reviewed, implemented, and verified against the specification in priority order:
1. **Security & Correctness First**:
   - Owner/Cashier privilege isolation (cashier never accesses cost, profit, team, or settings).
   - Strict validation and server-side authority.
   - Shop deletion cascading with full local data and auth storage wiping.
2. **Data-Loss & State Handling Risks**:
   - Stuck outbox recovery when navigation interrupts in-flight sync requests.
   - Forced retry and stuck recovery via `retryAll()` on `/sync/`.
3. **UX Polish & Guidelines (docs/03-app-flow.md Section 10)**:
   - **Home loss-aversion alerts**: Real numbers only, filtering strictly positive customer debts (`balance > 0`) for total owed and count of debtors.
   - **Smart defaults**: Cash preselected on checkout, full sale total prefilled, full/half shortcuts on debt payment, last cost prefilled on restock, sample items pre-populated on onboarding.
   - **Language switch responsiveness**: Dynamically re-translates sample items in onboarding Step 1 upon locale switch.
   - **Empty and offline states across all lists and screens**:
     - Customer statement / ledger: empty state message when no transactions exist.
     - Team management: offline state banner when offline without cache.
     - Assistant memory: offline state banner when offline without cache.
     - Search empty states: clear feedback across products, customers, and sell screens when query yields no matches.
   - **Goal-gradient indicators**: 3-step fixed-layout onboarding progress bar, customer debt repayment progress towards zero.

---

## 2. Changes & Fixes Implemented

### 1. `src/app/page.tsx` (Home Loss-Aversion Alerts)
- **Problem:** `balances` map includes customers who have settled debts (balance = 0). Sorting without filtering included settled accounts in `debts.length` and debt alert calculations.
- **Fix:** Filtered `debts = [...(balances?.values() ?? [])].filter((d) => d.balance > 0).sort((a, b) => b.balance - a.balance)`. Home alert chips now only display real debtors with positive balances.

### 2. `src/app/onboarding/page.tsx` (Dynamic Sample Items on Language Switch)
- **Problem:** `rows` state was initialized once on mount; changing locale on Step 1 left sample product names in the previous language.
- **Fix:** Added `useEffect` syncing sample items on Step 1 when `locale` changes, ensuring Amharic or Afaan Oromo sample items show when those languages are chosen.

### 3. `src/app/customers/detail/page.tsx` (Empty Ledger State)
- **Problem:** When a customer had zero ledger entries, an empty `<ul>` was rendered with no feedback.
- **Fix:** Added empty state `ledger.length === 0 ? <p className="px-4 py-6 text-center text-slate">{t('sales.empty')}</p> : ...`.

### 4. `src/app/team/page.tsx` & `src/app/memory/page.tsx` (Offline States)
- **Problem:** When navigating to Team or Assistant Memory while offline without pre-cached records, screens remained in skeleton loading indefinitely.
- **Fix:** Added offline checks rendering `<Empty title={t('err.OFFLINE')} />` when `!online` and records are null.

### 5. `src/app/products/page.tsx`, `src/app/customers/page.tsx`, `src/app/sell/page.tsx` (Search Empty States)
- **Problem:** Searching with a non-matching keyword displayed a blank area with no visual indication.
- **Fix:** Added zero-match empty feedback (`cust.not_found`) when query filters list to zero results.

### 6. `src/lib/sync.ts` & `src/app/sync/page.tsx` (`retryAll` & Stuck Item Recovery)
- **Problem:** If a page was unloaded while an outbox sync was in flight, the item remained marked `syncing` for up to 60 seconds. The top "Try again" button only called `kick()`, which ignored `syncing` items.
- **Fix:** Implemented `retryAll(shopId)` resetting any failed or stalled `syncing` items directly to `pending` and kicking the queue.

### 7. `src/lib/session.tsx` & `src/app/settings/page.tsx` (Shop Deletion Data Wipe)
- **Problem:** `remove()` in settings called `supabase.auth.signOut()` directly without clearing the cached session token in `localStorage`, causing subsequent navigations to resurrect the auth session.
- **Fix:** Updated `signOut()` in `session.tsx` to clear `localStorage` and `sessionStorage`, and updated `remove()` in `settings/page.tsx` to invoke `signOut()`.

---

## 3. AUDIT.md Matrix Status Updates

Every functional requirement for v1 has now been updated from **Partial** to **Implemented**:
- **FR-4.1.1** (Products CRUD): **Implemented**
- **FR-4.1.2** (Movement ledgers): **Implemented**
- **FR-4.1.3** (Low-stock list & alerts): **Implemented**
- **FR-4.1.4** (Restock): **Implemented**
- **FR-4.2.1** (Fast sale & tiles): **Implemented**
- **FR-4.2.2** (Payment methods & smart defaults): **Implemented**
- **FR-4.2.3** (Immutability & void): **Implemented**
- **FR-4.2.4** (Receipts): **Implemented**
- **FR-4.3.1** (Customer directory): **Implemented**
- **FR-4.3.2** (Customer ledger & FIFO ageing): **Implemented**
- **FR-4.3.3** (Two-tap repayments): **Implemented**
- **FR-4.3.4** (Overdue view): **Implemented**
- **FR-4.3.5** (Statement & reminder): **Implemented**
- **FR-4.4.1** (Today dashboard): **Implemented**
- **FR-4.4.2** (Trends & top products): **Implemented**
- **FR-4.4.3** (Debts & debtors): **Implemented**
- **FR-4.6.1** (Authentication & session wipe): **Implemented**
- **FR-4.6.2** (Roles & invites): **Implemented**
- **FR-4.6.3** (Shop deletion): **Implemented**
- **NFR-PERF-3** (Bundle budget < 170 KB gzip): **Implemented**
- **NFR-OFFLINE-3** (Idempotent replay): **Implemented**
- **NFR-SEC-1** (RLS on all tables): **Implemented**
- **NFR-SEC-2** (Zero bundle secrets): **Implemented**
- **NFR-A11Y-1** (WCAG 2.1 AA axe-core): **Implemented**
- **NFR-A11Y-2** (Skeletons everywhere, no spinners): **Implemented**
- **NFR-A11Y-3** (Fixed layout onboarding): **Implemented**
- **NFR-I18N-3** (200% zoom & 130% expansion): **Implemented**

*(Only FR-4.5.1, FR-4.5.2, FR-4.5.3 remain Partial, dedicated to Phase 7 Edge Function & eval testing).*

---

## 4. Verification Results

1. **Static Validation & Unit Tests (`npm run check`)**:
   - `tsc --noEmit`: 0 errors.
   - `next lint`: 0 warnings or errors.
   - `tsx --test tests/*/*.test.ts`: 74 unit tests (73 passed, 1 skipped).
   - `next build`: 18 static HTML pages exported successfully.
   - `scripts/postbuild.mjs`: `_headers` CSP hashes written.
   - `scripts/check-bundle.mjs`: Bundle secret scan passed.

2. **Playwright E2E Suite (`npx playwright test`)**:
   - All 14 tests across 13 user journeys passed in 1.0 minute.
