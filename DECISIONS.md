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
