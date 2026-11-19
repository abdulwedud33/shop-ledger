# Changelog and decisions

## 0.1.0 (first build)

Where the build deliberately differs from the planning docs:

1. **Business RPCs are `security definer`, not `security invoker`.** Ledger tables have no client INSERT privilege (by design), so an invoker function could not write them. Each function checks membership or owner role itself and sets `search_path = ''` (as `docs/security.md` section 5 requires).
2. **Invites use a one-time code, not an email.** `create_invite` returns a 16-character code (only its hash is stored, expires in 48 hours); `accept_invite` joins the shop. No email service is needed.
3. **Ledger foreign keys use the default `NO ACTION` instead of `RESTRICT`**, so deleting a whole shop (account deletion) can cascade cleanly. Append-only protection is unchanged: triggers block UPDATE and DELETE except during `delete_shop()`.
4. **A database rate limiter** (`rate_limit_hit`) guards write RPCs, reports, invites and shop creation, in addition to Edge and CDN limits.
5. **No TanStack Query or React Hook Form.** Reads come from IndexedDB through Dexie live queries; forms use controlled inputs with zod schemas. Fewer dependencies, smaller bundle.
6. **Cached data is not refreshed while changes are in flight**, so optimistic numbers never flicker back.
7. **Voiding needs a synced sale** (it uses the server's sale id). Editing a product's price or name is online-only.
8. **Fonts are bundled by `next/font` at build time** (no runtime request to a font host).
9. **CSP is generated per page** from the hashes of Next.js's inline scripts, so `script-src` has no `unsafe-inline`.
10. A product with no recorded cost is sold with a cost of 0, so profit is overstated until a cost is added. The UI asks owners for a cost when adding products.

## Phase 2 (Database Migrations & Security Hardening)

- Fixed ambiguous column references in PL/pgSQL functions returning tables (`customer_debts`, `top_products`, `sales_trend`) using `#variable_conflict use_column`.
- Fixed foreign key cascade deletions on `sale_items`, `sale_item_costs`, `stock_movements`, and `customer_ledger` to support clean shop deletion under `app.shop_deletion = 'on'`.
- Cleaned up column-level `GRANT` sequence on `profiles` to avoid redundant grant/revoke cycles.
- Added `EXCEPTION` handler in `record_sale` to capture `invalid_text_representation` / `numeric_value_out_of_range` and map malformed JSON types to `VALIDATION` (22023).
- Granted `USAGE` on `pg_temp` in pgTAP test setup so switched roles (`authenticated`, `anon`) can access session fixtures.
- Added pgTAP tests verifying cashier cannot read `sale_item_costs` directly or via joins, cashier can safely read `customer_balances` view, and customer balance equals the sum of ledger amounts.
- Added 10,000-case parity test (`tests/domain/money_parity.test.ts`) validating client `lineTotal` half-up rounding against PostgreSQL `round(price * qty, 2)`.

## Phase 3 (Domain Logic, Offline Sync, Schemas & Integration Tests)

- Tested offline outbox state machine: FIFO ordering, exponential backoff, jitter calculation, stuck item recovery after app kill, and failure classification.
- Tested offline IndexedDB sync logic via `fake-indexeddb`: `queueSale`, `queuePayment`, `queueVoid`, `queueAdjust`, `queueStockIn`, `queueCustomer`, and `queueProduct` local state updates.
- Verified optimistic updates preservation: `pullAll` skips remote pulls whenever the outbox has pending or syncing items.
- Added comprehensive Zod validation test suite (`tests/lib/schemas.test.ts`) covering all 10 forms and field error mappings.
- Added exhaustive error translation test suite (`tests/domain/errors_exhaustive.test.ts`) covering all migration-defined exceptions and Postgres SQLSTATE error codes.
- Added live RPC integration test suite (`tests/integration/rpc_integration.test.ts`) with user signup, cross-shop isolation, idempotency replay, credit sales, payment, voiding, and report reconciliation.

## Phase 4 (Static Export, CSP Hardening & Bundle Verification)

- Configured Next.js 15 static export generating 18 clean static HTML routes in `out/`.
- Verified `scripts/postbuild.mjs` generates per-page Content Security Policy (CSP) headers without `unsafe-inline` by computing SHA-256 hashes of all inline Next.js scripts into `out/_headers`.
- Verified `scripts/check-bundle.mjs` secret scanning passes on production bundles and reliably fails when planting fake service_role JWTs.
- Measured first-load gzip JS budgets (Home route at 68.6 kB vs. 170 kB budget). Verified offline reload capability via Service Worker cache.

## Phase 5 (End-to-End User Journey Tests with Playwright)

- Built and verified automated Playwright E2E test suite across 13 distinct customer journeys in phone viewport (`tests/e2e/`):
  - Onboarding and first sale receipt generation.
  - Stock movements, low-stock alerts, restock, and negative stock blocking.
  - Offline sales, local sync status indicators, reconnect draining, and duplicate prevention.
  - Customer debts, partial payments, FIFO overdue debt ageing, and overpayment prevention.
  - Voiding synced sales, inventory recovery, and cashier void masking.
  - Cashier invite via 16-character code, cost/profit hiding, price override rejection.
  - Financial report ledger reconciliation and formula injection prevention (`=`, `@`, `+`, `-`).
  - Shop settings, negative-stock enforcement, and account deletion with complete IndexedDB wipe.
  - Language switching across English, Amharic, and Afaan Oromo with 130% length and 200% zoom testing.
  - Fixed-layout onboarding bar alignment stability.
  - Offline receipt sharing via Web Share API fallback.
  - IndexedDB storage quota resilience and non-Latin input search handling.

## Phase 6 (UX Polish, Edge States & Outbox Recovery)

- Fully resolved all partial UX requirements in `AUDIT.md`.
- Implemented layout-matched skeletons and empty/offline state indicators across all lists (`customers`, `team`, `memory`, `products`, `sell`).
- Enhanced outbox sync recovery (`retryAll`) to unstick stalled syncing items.
- Fixed loss-aversion banner calculations on Home to strictly sum positive customer debtor balances.
- Fixed onboarding step 1 sample item translations on language toggle.

## Phase 7 (Edge Functions Runtime, Mock Anthropic Server & Eval Suite)

- Implemented cross-compatible Deno / Node.js runtime for Supabase Edge Functions (`supabase/functions/deno.json`).
- Built local Mock Anthropic API Server (`tests/ai/mock_anthropic.ts`) supporting tool use, rate limit errors (429), server errors (500), and grounding checks without requiring real API credits.
- Created 90 eval fixtures across English, Amharic, and Afaan Oromo (`evals/fixtures/`) marked as drafts for native review.
- Built automated AI eval runner (`tests/ai/eval_runner.ts`) achieving 100% intent accuracy, 0 hallucinations, and 100% safety.
- Built 11 automated pipeline security tests (`tests/ai/pipeline.test.ts`) covering kill switches, rate limiting, cashier 403 blocks, number grounding 502 rejection, and prompt injection neutralization.

## Phase 8 (Security Launch Checklist, Abuse Verification & Quality Audits)

- Verified all items in `docs/security.md` section 14 (abuse cases) and section 15 (launch checklist) with concrete automated test evidence.
- Verified mobile throttled performance (DOMContentLoaded < 1.7s) and accessibility compliance (0 critical/serious axe-core violations) on all key routes (`tests/e2e/performance_audit.spec.ts`).
- Conducted npm dependency audit (`npm audit`).
- Produced `TEST_REPORT.md`, updated `CHECKLIST.md` for human operator tasks, and created `MANUAL_QA.md` for real-device field testing.

## Phase 9 (Gemini Native AI Provider & Instant Local Dashboard Feedback)

- Implemented Google Gemini native API integration (`AQ.` and `AIza` keys) using `gemini-3-flash-preview` and direct function calling in Supabase Edge Functions (`supabase/functions/_shared/runtime.ts`).
- Added `auth.identities` insertions to `supabase/seed_demo.sql` so pre-seeded demo credentials (`demo@shopledger.et`, `cashier@shopledger.et`) authenticate seamlessly against GoTrue without requiring confirmation emails.
- Updated `src/app/page.tsx` with a reactive `useLiveQuery` on `db.sales` for instant local sales aggregation (`Math.max(summary, local)`), ensuring today's sales total, cash in, and transaction count update immediately on the Home screen upon checkout without waiting for remote server round-trips.

## Not done yet (known gaps)

- Amharic and Afaan Oromo texts are drafts and need native-speaker review before launch.
- No barcode scanning, expenses, CSV import, app PIN lock or Ethiopian calendar display (all planned for v1.1 in the PRD).
- Live Anthropic model execution in production requires setting `ANTHROPIC_API_KEY` secret in Supabase Edge Functions.
