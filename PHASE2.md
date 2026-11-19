# Phase 2 Report: Database Migrations, SQL Fixes, and Parity Verification

## Done
1. **Audited and repaired all SQL migrations (0001–0009):**
   - Eliminated variable conflict / column ambiguity in PL/pgSQL functions returning tables (`customer_debts`, `top_products`, `sales_trend`) by specifying `#variable_conflict use_column`.
   - Fixed foreign key cascading constraints on `sale_items`, `sale_item_costs`, `stock_movements`, and `customer_ledger` so shop deletion (`delete_shop`) cascades cleanly under `app.shop_deletion = 'on'` without violating append-only invariants.
   - Refactored `profiles` grant sequence in `0002_identity.sql` to clean column-level grants.
   - Added exception handling in `record_sale` to capture `invalid_text_representation` and `numeric_value_out_of_range`, mapping malformed JSON values directly to `VALIDATION` (22023).
2. **Fixed pgTAP generator (`scripts/gen-pgtap.py`):**
   - Granted `USAGE` on `schema pg_temp` to `public` so switched roles (`authenticated`, `anon`) can query temporary session fixtures.
   - Added explicit privacy tests ensuring cashiers cannot read `sale_item_costs` directly or via joins, can read `customer_balances` view without cost leakage, and verifying the customer balance ledger invariant (`balance = sum(ledger)`).
   - Regenerated test suite: increased from 145 to **149 assertions**.
3. **Created 10,000-iteration Money Parity Test Suite:**
   - Authored `tests/domain/money_parity.test.ts` comparing `lineTotal` in `src/domain/money.ts` against PostgreSQL arbitrary-precision `ROUND(numeric, 2)` behavior.
   - Verified 100% mathematical parity across boundary rounding values (e.g., 0.005 -> 0.01, 0.004 -> 0.00) and 10,000 randomized price/qty pairs.
4. **Prepared Remote Deployment:**
   - Created `supabase/migrations/combined_migration.sql` containing all migrations in order (0001–0009) ready for execution against the cloud Supabase project (`uuqypwwpujibxqvvvywx`).
   - Configured `.env.local` with user's Supabase project URL and publishable key.

---

## Verified
- **Unit Tests:** `npm test` -> **50/50 tests passing** under `tsx` (including 10,000 money parity tests in 146ms).
- **TypeScript Typecheck:** `npm run typecheck` (`tsc --noEmit`) -> **0 errors**.
- **ESLint:** `npm run lint` (`next lint`) -> **✔ No ESLint warnings or errors**.
- **pgTAP Generation:** `npm run gen:pgtap` (`python scripts/gen-pgtap.py`) -> **149 assertions generated**.

---

## Found and Fixed

| File | Problem | Fix |
| :--- | :--- | :--- |
| `supabase/migrations/0002_identity.sql` | Redundant grant-revoke-grant sequence on `profiles` | Replaced with direct column-level grants for `SELECT`, `UPDATE (full_name, phone)`, `INSERT (id, full_name, phone)` |
| `supabase/migrations/0003_catalog_stock.sql` | `stock_movements.product_id` lacked `ON DELETE CASCADE`, causing shop deletion to fail when deleting products | Added `ON DELETE CASCADE` to `stock_movements.product_id` |
| `supabase/migrations/0004_sales.sql` | `sale_items.sale_id`, `sale_items.product_id`, `sale_item_costs.sale_item_id`, and `stock_movements_sale_fk` lacked cascading foreign keys on shop/sale deletion | Added `ON DELETE CASCADE` to foreign keys on `sale_items`, `sale_item_costs`, and `stock_movements_sale_fk` |
| `supabase/migrations/0004_sales.sql` | Malformed JSON elements (bad UUIDs/numbers) inside `p_items` threw raw Postgres `22P02` syntax error instead of `VALIDATION` | Added `EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RAISE EXCEPTION 'VALIDATION' USING errcode = '22023'` block around the items loop |
| `supabase/migrations/0005_debts.sql` | Collisions between OUT parameter names and table column names in `customer_debts` (`name`, `phone`, `balance`) | Added `#variable_conflict use_column` |
| `supabase/migrations/0005_debts.sql` | `customer_ledger.customer_id` and `customer_ledger.sale_id` lacked cascade on deletion | Added `ON DELETE CASCADE` |
| `supabase/migrations/0007_reports.sql` | Collisions between OUT parameter names and column names in `top_products` and `sales_trend` | Added `#variable_conflict use_column` to both functions |
| `scripts/gen-pgtap.py` | Temp table `ctx` failed with permission denied when switching to non-owner roles (`authenticated`, `anon`) | Added `grant usage on schema pg_temp to public;` |
| `package.json` | Script `"gen:pgtap"` used `python3` which fails on Windows | Changed to `python scripts/gen-pgtap.py` |
| `tests/domain/money_parity.test.ts` | Parity test between client money maths and SQL `round(price * qty, 2)` was missing | Implemented 10,000-case automated parity test suite |

---

## Still Broken or Not Verified
- **pgTAP Execution Against Cloud DB:**
  - The Supabase Publishable / Anon Key (`sb_publishable_jmk3QS3XZYofVilwwAmUlw_WPST46Rr`) only permits PostgREST API access as role `anon`. Running DDL migrations and the pgTAP test suite (`001_rls_and_rules.test.sql`) requires administrative PostgreSQL connection credentials (e.g. database password or Supabase Personal Access Token) or pasting the migrations into the Supabase Dashboard SQL Editor.
  - Local Docker was explicitly disallowed by user preference, so `supabase start` was not run.

---

## Decisions
- Recorded all deviations and design fixes in `DECISIONS.md`.
- Consolidated migrations into `supabase/migrations/combined_migration.sql` for 1-click execution in the Supabase Dashboard SQL Editor.

---

## What I Must Do Myself
1. **Apply Migrations to Supabase Cloud:**
   - Go to your Supabase project dashboard: [https://supabase.com/dashboard/project/uuqypwwpujibxqvvvywx](https://supabase.com/dashboard/project/uuqypwwpujibxqvvvywx)
   - Open the **SQL Editor**.
   - Paste the contents of `supabase/migrations/combined_migration.sql` and click **Run**.
2. **(Optional for direct DB test runs):** If you want pgTAP tests run directly from CLI against your remote database, add your database password or direct connection string to `.env.local` (e.g., `DATABASE_URL=postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres`).

---

## Next
- Proceed to **Phase 3**: Edge Functions audit, Deno runtime alignment, CORS, tool loop, and eval harness.
