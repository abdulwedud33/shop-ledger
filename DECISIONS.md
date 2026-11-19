# Architectural and Implementation Decisions

This document records deliberate deviations from the initial planning documents or specific implementation decisions made to preserve security, correctness, and reliability.

## Phase 1 Decisions

1. **Next.js 15 / React 19 Compatibility (`allowImportingTsExtensions`):**
   - Enabled `allowImportingTsExtensions: true` in `tsconfig.json` because unit test files import TypeScript helper modules directly from Edge Functions (`supabase/functions/_shared/*.ts`) which use explicit `.ts` extensions for Deno runtime compatibility.

2. **Strict ESLint 9 Configuration (`eslint.config.mjs`):**
   - Configured Flat ESLint using `@eslint/eslintrc` `FlatCompat` to extend `next/core-web-vitals` and `next/typescript`.
   - Explicitly configured `react/no-danger` (`'error'`) to forbid `dangerouslySetInnerHTML`.
   - Enabled `@typescript-eslint/no-unused-vars` and `react-hooks/exhaustive-deps`.

3. **IndexedDB Mocking for Tests:**
   - Added `fake-indexeddb` to `devDependencies` to support local-first unit and integration testing without requiring a browser runtime.

## Phase 2 Decisions

1. **Function OUT Parameter Name Collisions (`#variable_conflict use_column`):**
   - Functions returning tables (`customer_debts`, `top_products`, `sales_trend`) had column names matching PL/pgSQL OUT parameter names (`name`, `unit`, `balance`, `sales_total`, etc.), causing ambiguous column reference errors in PostgreSQL.
   - Added `#variable_conflict use_column` directive to each of these functions to instruct the PL/pgSQL compiler to resolve identifiers to table columns rather than OUT parameters.

2. **Foreign Key Cascade on Account Deletion (`delete_shop`):**
   - `sale_items.sale_id`, `sale_items.product_id`, `sale_item_costs.sale_item_id`, `stock_movements.product_id`, `customer_ledger.customer_id`, and `customer_ledger.sale_id` lacked explicit `ON DELETE CASCADE`.
   - During shop deletion, removing `shops` triggers cascade deletions across multiple tables simultaneously; without cascade on intermediate relations, foreign key violation errors occurred. Added `ON DELETE CASCADE` to these relationships, guarded by `app.shop_deletion = 'on'` in the append-only triggers.

3. **Explicit Profile Column Grants:**
   - Simplified `profiles` grant sequence in `0002_identity.sql` from grant-then-revoke-then-regrant to direct column-level grants (`grant select ...`, `grant update (full_name, phone) ...`, `grant insert (id, full_name, phone) ...`).

4. **JSONB Input Validation in `record_sale`:**
   - Wrapped the JSON item extraction loop in `record_sale` with an exception handler capturing `invalid_text_representation` and `numeric_value_out_of_range`, mapping any malformed types (e.g. invalid UUIDs or non-numeric strings) directly to error code `VALIDATION` (`22023`).

5. **Money and Rounding Parity:**
   - Client-side `lineTotal` uses integer minor and milli math with `BigInt((unitPrice * qty + 500n) / 1000n)`.
   - Verified exact parity against PostgreSQL's arbitrary-precision `ROUND(numeric, 2)` across 10,000 random inputs and critical decimal half-up boundaries (`tests/domain/money_parity.test.ts`).

6. **Remote Supabase Cloud Verification Mode:**
   - In accordance with the user's explicit directive to not use Docker and use their remote Supabase cloud project, local Docker CLI commands (`supabase start`, `supabase db reset`) are bypassed. Migrations are prepared as modular milestone files and a combined deployment script (`supabase/migrations/combined_migration.sql`).

## Phase 3 Decisions

1. **Dexie in Test vs Static Build Environments (`src/lib/db.ts`):**
   - Updated `db` instantiation condition to `(typeof window === 'undefined' && typeof indexedDB === 'undefined') ? (null as unknown as ShopDB) : new ShopDB();` and exported `ShopDB`. This preserves Next.js server-side static build isolation (where both window and indexedDB are undefined) while enabling in-memory Dexie testing via `fake-indexeddb` in Node.

2. **PostgreSQL Code 22023 Error Mapping (`src/domain/errors.ts`):**
   - Added explicit mapping for SQLSTATE `22023` (invalid parameter value) to `'VALIDATION'`, ensuring that any constraint or validation failure returning 22023 maps cleanly to user-safe validation messaging.

3. **Sync Engine Test Isolation:**
   - Offline sync tests dynamically generate isolated shops (`crypto.randomUUID()`) to prevent asynchronous background outbox drain actions from polluting subsequent test state.

4. **Live Integration Auth Adaptation:**
   - Supabase Cloud enables email confirmations and strict rate limits by default. The RPC integration test (`tests/integration/rpc_integration.test.ts`) detects unconfirmed session states and outputs clear skip diagnostics guiding the user to disable email confirmations in the dashboard when running against a cloud project.

## Post-Phase 8 Decisions

1. **Reporting Functions Volatility (`0007_reports.sql`):**
   - Marked `dashboard_summary`, `top_products`, and `sales_trend` as `volatile` rather than `stable` because each function invokes `perform public.rate_limit_hit(...)`, which performs an `INSERT` into `public.rate_limits`.
   - In PostgreSQL and PostgREST, invoking a `stable` function via RPC executes within a read-only transaction, which rejected the rate limit hit with SQLSTATE `25006` (`cannot execute INSERT in a read-only transaction`). Marking them `volatile` grants read-write transaction capability.

2. **Google Gemini Native Tool Calling Bridge in Edge Functions (`supabase/functions/_shared/runtime.ts`):**
   - Anthropic Claude requires paid API credits, and OpenAI-compatible endpoints on Google AI Studio experienced 503 rate/load limits.
   - Extended Edge Functions runtime to detect Gemini keys (prefixed with `AIza` or `AQ.`) and call Google's native `/v1beta/models/gemini-3-flash-preview:generateContent` API directly, translating JSON schemas into Gemini function declarations and converting function call responses back into unified tool output.

3. **Local-First Optimistic Home Dashboard Sales Aggregation (`src/app/page.tsx`):**
   - In a local-first PWA, sales recorded on device reside in local Dexie IndexedDB (`db.sales`) and sync outbox. Relying strictly on remote RPC `dashboard_summary` meant that home dashboard stats (today's sales total, sales count, and cash in) showed 0 or old numbers until a remote sync round-trip finished.
   - Updated `src/app/page.tsx` with a reactive `useLiveQuery` on `db.sales` for today's non-voided sales, computing `Math.max(summary?.salesTotal ?? 0, localSalesTotal)` so numbers update instantly on the home screen upon completing a sale.
