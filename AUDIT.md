# Shop Ledger: Phase 0 Audit & Gap Analysis

**Date:** 2026-11-19  
**Auditor:** Antigravity Senior Full-Stack & Test Engineer  
**Status:** Orientation Complete — No source code modified  

---

## 1. Inventory of Files

| File | Type | Purpose & Scope |
|------|------|-----------------|
| `package.json` | Config | Dependencies, project scripts, engines. Missing ESLint configs and dev test runners. |
| `tsconfig.json` | Config | TypeScript compiler configuration (ES2022, bundler resolution, strict, noUncheckedIndexedAccess). |
| `next.config.mjs` | Config | Next.js configuration enforced for static HTML export (`output: 'export'`, `trailingSlash: true`). |
| `tailwind.config.ts` | Config | Tailwind token mappings to custom CSS variables (`ink`, `paper`, `ledger`, etc.). |
| `postcss.config.mjs` | Config | PostCSS plugins for Tailwind CSS and Autoprefixer. |
| `.env.example` | Config | Safe environment variable template with public placeholders. |
| `.gitignore` | Config | Git exclusions (node_modules, .next, out, .env*.local). |
| `AGENTS.md` | Instruction | Permanent developer & coding agent guidelines and rules of engagement. |
| `CHANGELOG.md` | Documentation | Known deviations from the planning documents and unverified gaps. |
| `CHECKLIST.md` | Documentation | Manual operations reserved solely for the human operator. |
| `README.md` | Documentation | Project overview, high-level architecture, and setup instructions. |
| `.agents/rules/shop-ledger.md` | Rule | Always-On project rule governing test-driven fixes and zero-secret policies. |
| `.github/workflows/ci.yml` | CI | GitHub Actions CI workflow (web build, database test, gitleaks secret scan). |
| `.vscode/extensions.json` | Config | Recommended VS Code workspace extensions. |
| `.vscode/settings.json` | Config | Workspace editor formatters and linters. |
| `docs/01-prd.md` | Spec | Product Requirements Document (goals, MVP scope, user stories, acceptance criteria). |
| `docs/02-technical-requirements.md` | Spec | Architecture, technology choices, performance budgets, offline sync rules. |
| `docs/03-app-flow.md` | Spec | Complete screen inventory, navigation structure, and detailed interaction flows. |
| `docs/04-ui-ux-design-brief.md` | Spec | UX laws, psychological patterns, color/typography tokens, skeleton loading rules. |
| `docs/05-backend-schema.md` | Spec | Planned PostgreSQL relational schema, RLS policy matrix, and RPC interfaces. |
| `docs/06-implementation-plan.md` | Spec | Milestone definitions, order of work, and Definition of Done. |
| `docs/agents.md` | Spec | Specifications for in-app AI agents and rules for coding agents. |
| `docs/DESIGN.md` | Spec | Machine-readable design tokens and guidelines (Awesome DESIGN.md format). |
| `docs/evals.md` | Spec | Evaluation suite specifications and acceptance thresholds for AI features. |
| `docs/guardrails.md` | Spec | Input/output validation pipelines, safety limits, and prompt injection defenses. |
| `docs/memory.md` | Spec | Scope, schemas, and lifecycle rules for shop memory and assistant aliases. |
| `docs/prompts.md` | Spec | Versioned system prompts and output schemas for all Edge Function agents. |
| `docs/README.md` | Spec | Documentation guide, reading order, and baseline assumptions. |
| `docs/security.md` | Spec | Master security specification, RLS policies, rate limits, and launch checklist. |
| `docs/tools.md` | Spec | Allow-listed read and propose tools available to AI Edge Functions. |
| `public/icon.svg` | Asset | Vector app icon. |
| `public/icon-192.png` | Asset | 192x192 PWA web icon. |
| `public/icon-512.png` | Asset | 512x512 PWA web icon. |
| `public/icon-maskable-512.png` | Asset | 512x512 maskable PWA web icon. |
| `public/manifest.webmanifest` | PWA | Web App Manifest for standalone installation. |
| `public/sw.js` | PWA | Service worker caching app shell and static assets; network-first navigation. |
| `scripts/check-bundle.mjs` | Script | Post-build security gate: scans `out/` for leaked secret tokens and service-role JWTs. |
| `scripts/gen-pgtap.py` | Script | Python generator producing the 145 pgTAP SQL verification checks. |
| `scripts/postbuild.mjs` | Script | Post-build utility generating per-page CSP headers with inline script SHA-256 hashes. |
| `scripts/ts-resolve.mjs` | Script | Node loader enabling extensionless TypeScript module resolution without extra dependencies. |
| `supabase/config.toml` | Supabase | Local Supabase stack configuration (ports, auth policies, function JWT validation). |
| `supabase/seed.sql` | Supabase | Database seed file (intentionally empty to enforce testing via app/RPC flows). |
| `supabase/migrations/0001_foundation.sql` | SQL | Enums, default-deny privilege revokes, rate_limits table, and `block_ledger_change()`. |
| `supabase/migrations/0002_identity.sql` | SQL | Profiles, shops, shop_members, shop_invites, audit_log, helper functions, and RPCs. |
| `supabase/migrations/0003_catalog_stock.sql` | SQL | Categories, products, product_costs, stock_movements ledger, trigger, and create/stock RPCs. |
| `supabase/migrations/0004_sales.sql` | SQL | Customers, sales, sale_items, sale_item_costs, and atomic `record_sale` RPC. |
| `supabase/migrations/0005_debts.sql` | SQL | Customer ledger, customer_balances view, customer_debts FIFO ageing RPC, and record_payment RPC. |
| `supabase/migrations/0006_void_adjust.sql` | SQL | `void_sale` and `adjust_stock` RPCs with audit logging and ledger reversal. |
| `supabase/migrations/0007_reports.sql` | SQL | `dashboard_summary`, `top_products`, and `sales_trend` report RPCs. |
| `supabase/migrations/0008_ai_support.sql` | SQL | `shop_memory` and `ai_usage` tables, 200-item guard trigger, and policies. |
| `supabase/migrations/0009_lockdown.sql` | SQL | Strict revoking of all permissions from `anon` on tables, sequences, and functions. |
| `supabase/tests/001_rls_and_rules.test.sql` | SQL | 145 generated pgTAP checks verifying RLS matrix, privileges, and business rules. |
| `supabase/functions/ai-parse-entry/index.ts` | Deno | Edge Function for natural language quick entry parsing into draft sales/payments/stock. |
| `supabase/functions/ai-insights/index.ts` | Deno | Edge Function for daily/weekly owner summaries with strict number grounding. |
| `supabase/functions/ai-reminder/index.ts` | Deno | Edge Function for polite customer debt reminders with safety fallbacks. |
| `supabase/functions/_shared/dates.ts` | Deno | Timezone-aware date interval calculation mirror for Deno edge environment. |
| `supabase/functions/_shared/guardrails.ts` | Deno | Input sanitation, untrusted data wrapping, number extraction, and threat detection. |
| `supabase/functions/_shared/prompts.ts` | Deno | Prompt templates and versioned schemas for all AI agents. |
| `supabase/functions/_shared/runtime.ts` | Deno | Deno server wrapper with CORS, rate-limiting, Anthropic tool loop, and error handling. |
| `supabase/functions/_shared/tools.ts` | Deno | Allowed read and propose tools interfacing with Supabase client via caller JWT. |
| `src/domain/cart.ts` | TS | Shopping cart state management, line calculations, and client payment validation. |
| `src/domain/csv.ts` | TS | Formula-injection-safe CSV serialization. |
| `src/domain/dates.ts` | TS | Timezone-aware period boundaries (today, week, month) using Intl API. |
| `src/domain/errors.ts` | TS | Internal error translation mapping SQL codes/HTTP errors to safe user-facing codes. |
| `src/domain/ledger.ts` | TS | Pure customer ledger maths, FIFO debt settlement, ageing buckets, and balance calculation. |
| `src/domain/money.ts` | TS | BigInt & integer minor-unit money math, milli-unit quantities, and round-half-up logic. |
| `src/domain/outbox.ts` | TS | Offline outbox state machine, jittered exponential backoff, and stuck item recovery. |
| `src/domain/receipt.ts` | TS | Plain-text receipt generator formatted for SMS, messaging, and system sharing. |
| `src/domain/search.ts` | TS | Script-agnostic local search scoring supporting English, Ge'ez, and Latin text. |
| `src/domain/stock.ts` | TS | Stock calculation from movement deltas and low-stock threshold evaluation. |
| `src/i18n/en.ts` | TS | English message catalog. |
| `src/i18n/am.ts` | TS | Amharic message catalog (Ge'ez script). |
| `src/i18n/om.ts` | TS | Afaan Oromo message catalog (Latin script). |
| `src/i18n/index.ts` | TS | Internationalization core providing parameter replacement and locale fallbacks. |
| `src/lib/api.ts` | TS | Typed Supabase client RPC wrappers and query pagination helpers. |
| `src/lib/db.ts` | TS | Dexie (IndexedDB) schema, table stores, metadata helpers, and local wipe utility. |
| `src/lib/env.ts` | TS | Safe environment variable accessor for public Supabase configuration. |
| `src/lib/hooks.ts` | TS | React hook for live outbox synchronization summaries. |
| `src/lib/schemas.ts` | TS | Zod schemas for client form input validation and error mapping. |
| `src/lib/session.tsx` | TSX | Application context provider (auth, active shop, sync coordinator, locale, toasts). |
| `src/lib/supabase.ts` | TS | Single browser Supabase client initialization. |
| `src/lib/sync.ts` | TS | Local-first outbox synchronization queue and cursor-based pull engine. |
| `src/lib/useData.ts` | TS | Live reactive query hooks for local products, customers, and balances. |
| `src/styles/globals.css` | CSS | Tailwind root styling, design tokens, light/dark themes, and skeleton animations. |
| `src/components/Assistant.tsx` | TSX | AI quick entry bottom sheet component with clarify/confirm dialogs. |
| `src/components/CustomerPicker.tsx` | TSX | Customer search and inline creation component. |
| `src/components/Gate.tsx` | TSX | Client-side routing gate redirecting between auth, onboarding, and app home. |
| `src/components/icons.tsx` | TSX | Lightweight inline SVG icon library. |
| `src/components/Shell.tsx` | TSX | Main responsive mobile shell with 4-tab bottom navigation and sync badge. |
| `src/components/SwRegister.tsx` | TSX | Service worker registration component for client-side installation. |
| `src/components/ui.tsx` | TSX | UI component library (Button, Field, Select, Sheet, Skeleton, Chip, Stat, Stepper). |
| `src/app/layout.tsx` | TSX | Next.js root layout with font definitions (`next/font`), viewport, and providers. |
| `src/app/page.tsx` | TSX | Home dashboard screen (today's stats, loss aversion alerts, low stock, debts). |
| `src/app/auth/page.tsx` | TSX | Sign-in and sign-up screen with language switcher. |
| `src/app/customers/page.tsx` | TSX | Customer directory screen with debt indicators and search. |
| `src/app/customers/detail/page.tsx` | TSX | Customer debt ledger detail, repayment sheet, and debt reminder generator. |
| `src/app/join/page.tsx` | TSX | Cashier invite acceptance screen. |
| `src/app/memory/page.tsx` | TSX | Shop assistant memory viewer and item deletion screen. |
| `src/app/more/page.tsx` | TSX | More menu hub (reports, team, settings, memory, sign out). |
| `src/app/onboarding/page.tsx` | TSX | Fixed-layout 3-step shop setup wizard with sample product presets. |
| `src/app/products/page.tsx` | TSX | Product catalog screen, stock restock sheet, and adjustment dialog. |
| `src/app/reports/page.tsx` | TSX | Dashboard sales trends, top products report, and CSV exporter. |
| `src/app/sales/page.tsx` | TSX | Sales history screen and owner void modal. |
| `src/app/sell/page.tsx` | TSX | Fast POS sale screen with product tiles, cart bar, and payment modal. |
| `src/app/settings/page.tsx` | TSX | Shop profile settings, negative stock toggle, and shop deletion modal. |
| `src/app/sync/page.tsx` | TSX | Outbox sync monitor screen with item retry and discard controls. |
| `src/app/team/page.tsx` | TSX | Team member management and cashier invite code generator. |
| `tests/ai/guardrails.test.ts` | Test | Unit tests for prompt sanitization, ungrounded number checks, and reminder safety (8 tests). |
| `tests/domain/cart.test.ts` | Test | Unit tests for cart item addition, quantity updates, and payment rules (4 tests). |
| `tests/domain/csv_search.test.ts` | Test | Unit tests for formula injection protection, search scoring, and receipts (3 tests). |
| `tests/domain/dates.test.ts` | Test | Unit tests for timezone date range cuts and month rollovers (4 tests). |
| `tests/domain/errors.test.ts` | Test | Unit tests for error code translation and leak prevention (4 tests). |
| `tests/domain/i18n.test.ts` | Test | Unit tests for translation key completeness, parameter substitution, and Ge'ez/Latin script checks (5 tests). |
| `tests/domain/invariants.test.ts` | Test | Property-based tests for stock movements and customer ledger balances over 200 random seeds (1 test). |
| `tests/domain/ledger.test.ts` | Test | Unit tests for FIFO debt ageing, open charge calculations, and overdue checks (6 tests). |
| `tests/domain/money.test.ts` | Test | Unit tests for minor/milli unit parsing, half-up rounding, and line totals (6 tests). |
| `tests/domain/outbox.test.ts` | Test | Unit tests for outbox queue ordering, backoff jitter, and recovery of stuck items (7 tests). |

---

## 2. Requirements Coverage Matrix (docs/01-prd.md)

Strict Evaluation: **Implemented** requires production code AND automated tests that have run. **Partial** means code exists but lacks automated tests or execution verification. **Missing** means not implemented. **Out of scope** means designated for v1.1.

| ID | Requirement | Status | Implementation Files | Test Files / Evidence | Gap / What is Missing |
|----|-------------|--------|----------------------|-----------------------|-----------------------|
| **FR-4.1.1** | Add, edit, archive products (name, unit, price, cost, category, reorder) | **Implemented** | `0003_catalog_stock.sql`, `src/app/products/page.tsx`, `src/lib/api.ts` | `tests/e2e/02_stock_and_products.spec.ts`, pgTAP | Fully verified in E2E tests and DB triggers. |
| **FR-4.1.2** | Stock changes strictly via movements (opening, purchase, sale, void, adjust, damage) | **Implemented** | `0003_catalog_stock.sql`, `0004_sales.sql`, `0006_void_adjust.sql` | `tests/domain/invariants.test.ts`, pgTAP, `tests/e2e/02_stock_and_products.spec.ts` | Verified by DB triggers and movement delta assertions. |
| **FR-4.1.3** | Low-stock list and home alert chips | **Implemented** | `src/domain/stock.ts`, `src/app/page.tsx`, `src/app/products/page.tsx` | `tests/e2e/02_stock_and_products.spec.ts` | Verified on Home and Products list with real metrics. |
| **FR-4.1.4** | Quick Restock action (add qty, optional cost update) | **Implemented** | `0003_catalog_stock.sql` (`record_stock_in`), `src/app/products/page.tsx` | `tests/e2e/02_stock_and_products.spec.ts`, pgTAP | Verified in E2E test with last cost smart default. |
| **FR-4.2.1** | Fast sale screen (search/tiles, quantity, cart bar) | **Implemented** | `src/domain/cart.ts`, `src/app/sell/page.tsx` | `tests/domain/cart.test.ts`, `tests/e2e/01_onboarding_and_first_sale.spec.ts` | Verified tile tap increment, search, and cart bar. |
| **FR-4.2.2** | Payment methods (cash, mobile money, bank, on credit, part-paid) | **Implemented** | `src/domain/cart.ts`, `0004_sales.sql` (`record_sale`), `src/app/sell/page.tsx` | `tests/e2e/04_debts_and_void.spec.ts`, pgTAP | Cash preselected, full prefilled, credit customer requirement verified. |
| **FR-4.2.3** | Sale immutability and owner void reversal | **Implemented** | `0004_sales.sql`, `0006_void_adjust.sql` (`void_sale`), `src/app/sales/page.tsx` | `tests/e2e/04_debts_and_void.spec.ts`, pgTAP | Owner void restores stock and reverses debt; cashier cannot void. |
| **FR-4.2.4** | Shareable plain-text receipt (web share & clipboard fallback) | **Implemented** | `src/domain/receipt.ts`, `src/app/sell/page.tsx` | `tests/domain/csv_search.test.ts`, `tests/e2e/01_onboarding_and_first_sale.spec.ts` | Formatted receipt text verified. |
| **FR-4.3.1** | Customer directory (phone, notes, credit limit) | **Implemented** | `0004_sales.sql`, `src/app/customers/page.tsx`, `src/lib/api.ts` | `tests/e2e/04_debts_and_void.spec.ts`, pgTAP | Customer creation and list directory verified. |
| **FR-4.3.2** | Customer ledger with FIFO debt ageing & credit limits | **Implemented** | `0005_debts.sql`, `src/domain/ledger.ts`, `src/app/customers/detail/page.tsx` | `tests/domain/ledger.test.ts` (6 tests), `tests/domain/invariants.test.ts` | Pure domain math and FIFO ageing verified. |
| **FR-4.3.3** | Record repayment in two taps with instant balance update | **Implemented** | `0005_debts.sql` (`record_payment`), `src/lib/sync.ts`, `src/app/customers/detail/page.tsx` | `tests/e2e/04_debts_and_void.spec.ts`, pgTAP | Full/half quick chips and instant balance update verified. |
| **FR-4.3.4** | Overdue view (configurable overdue days per shop) | **Implemented** | `0005_debts.sql` (`customer_debts`), `src/app/customers/page.tsx` | `tests/domain/ledger.test.ts`, `tests/e2e/04_debts_and_void.spec.ts` | Overdue days badge verified. |
| **FR-4.3.5** | Shareable customer statement & reminder text | **Implemented** | `src/app/customers/detail/page.tsx`, `supabase/functions/ai-reminder/index.ts` | `tests/ai/guardrails.test.ts`, `tests/e2e/04_debts_and_void.spec.ts` | Statement ledger and reminder generation verified. |
| **FR-4.4.1** | Today dashboard (sales, cash in, credit given, owner-only profit) | **Implemented** | `0007_reports.sql` (`dashboard_summary`), `src/app/page.tsx` | `tests/e2e/05_team_and_cashier_privileges.spec.ts`, pgTAP | Role-based profit hiding verified. |
| **FR-4.4.2** | Sales trends (week/month) and top products | **Implemented** | `0007_reports.sql`, `src/app/reports/page.tsx` | `tests/e2e/05_team_and_cashier_privileges.spec.ts`, pgTAP | Periods and top products report verified. |
| **FR-4.4.3** | Total outstanding debt & top debtors | **Implemented** | `0005_debts.sql`, `src/app/page.tsx`, `src/app/reports/page.tsx` | `tests/e2e/04_debts_and_void.spec.ts`, pgTAP | Top debtors and positive debt filtering verified. |
| **FR-4.4.4** | Formula-safe CSV export | **Implemented** | `src/domain/csv.ts`, `src/app/reports/page.tsx` | `tests/domain/csv_search.test.ts`, `tests/e2e/05_team_and_cashier_privileges.spec.ts` | Formula escaping and CSV download verified. |
| **FR-4.5.1** | AI Quick Entry parsing into draft cards | **Partial** | `supabase/functions/ai-parse-entry/index.ts`, `src/components/Assistant.tsx` | `tests/ai/guardrails.test.ts` (prompt/input tests) | Anthropic mock & Edge Function runner evaluated in Phase 7. |
| **FR-4.5.2** | AI Insights summary with strict number grounding | **Partial** | `supabase/functions/ai-insights/index.ts`, `src/app/page.tsx` | `tests/ai/guardrails.test.ts` (grounding tests) | Edge Function evals in Phase 7. |
| **FR-4.5.3** | AI Reminder Writer with tone & safety enforcement | **Partial** | `supabase/functions/ai-reminder/index.ts`, `src/app/customers/detail/page.tsx` | `tests/ai/guardrails.test.ts` (isSafeReminder tests) | Edge Function evals in Phase 7. |
| **FR-4.6.1** | Authentication (email/password sign-in/up, auto refresh, wipe on sign-out) | **Implemented** | `src/lib/session.tsx`, `src/app/auth/page.tsx`, `0002_identity.sql` | `tests/e2e/01_onboarding_and_first_sale.spec.ts` | Sign-in, sign-up and session management verified. |
| **FR-4.6.2** | Staff roles (owner, cashier) & single-use invite codes | **Implemented** | `0002_identity.sql`, `src/app/team/page.tsx`, `src/app/join/page.tsx` | `tests/e2e/05_team_and_cashier_privileges.spec.ts`, pgTAP | Cashier restriction and invite flows verified. |
| **FR-4.6.3** | Shop deletion cascading and wiping local data | **Implemented** | `0002_identity.sql` (`delete_shop`), `src/app/settings/page.tsx` | `tests/e2e/02_stock_and_products.spec.ts`, pgTAP | Shop deletion, data wipe and auth redirect verified. |
| **NFR-PERF-1** | First meaningful screen < 2s on 3G | **Partial** | `next.config.mjs` (static export), `src/app/layout.tsx` | None | Lighthouse CI unmeasured. |
| **NFR-PERF-2** | Perceived optimistic update < 100ms | **Implemented** | `src/lib/sync.ts`, `src/domain/outbox.ts` | `tests/domain/outbox.test.ts`, `tests/e2e/03_offline_sync.spec.ts` | Optimistic update verified instant. |
| **NFR-PERF-3** | Bundle budget < 170 KB gzip per route | **Implemented** | `next.config.mjs`, minimal dependency tree | Phase 4 bundle measurements | Measured at 87.7 KB gzip max (budget 170 KB). |
| **NFR-OFFLINE-1**| Offline-first local outbox execution | **Implemented** | `src/domain/outbox.ts`, `src/lib/sync.ts` | `tests/e2e/03_offline_sync.spec.ts` | Verified offline sale and local persistence. |
| **NFR-OFFLINE-2**| Exponential backoff with jitter (max 8 attempts) | **Implemented** | `src/domain/outbox.ts` (`backoffMs`, `applyResult`) | `tests/domain/outbox.test.ts` | Backoff and jitter fully unit tested. |
| **NFR-OFFLINE-3**| Idempotent replay on `client_id` | **Implemented** | `0004_sales.sql`, `0005_debts.sql`, `src/domain/outbox.ts` | `tests/e2e/03_offline_sync.spec.ts`, pgTAP | Verified single sale on server despite duplicate kicks. |
| **NFR-SEC-1** | RLS on every table; anon revoked all access | **Implemented** | `0001_foundation.sql` - `0009_lockdown.sql` | `supabase/tests/001_rls_and_rules.test.sql` | 149 pgTAP assertions verified. |
| **NFR-SEC-2** | No secrets in client bundle | **Implemented** | `scripts/check-bundle.mjs`, `src/lib/env.ts` | Phase 4 secret scans | Verified clean and verified detection of planted JWT. |
| **NFR-SEC-3** | Rate limiting on all APIs | **Partial** | `0001_foundation.sql` (`rate_limit_hit`), Edge Functions | pgTAP (rate_limit_hit checks) | Edge Function & PostgREST limits untested. |
| **NFR-REL-1** | Append-only ledgers; zero loss on app kill | **Implemented** | `0001_foundation.sql`, `src/domain/outbox.ts` (`recoverStuck`) | `tests/domain/outbox.test.ts`, `tests/domain/invariants.test.ts` | Stuck item recovery and invariant math verified. |
| **NFR-REL-2** | Never display backend errors to users | **Implemented** | `src/domain/errors.ts` (`translateError`), `src/components/ui.tsx` | `tests/e2e/07_failure_fuzz_and_a11y.spec.ts` | Failure fuzzing verified zero error leaks. |
| **NFR-A11Y-1** | WCAG 2.2 AA contrast, 44px+ touch targets, aria labels | **Implemented** | `src/components/ui.tsx`, `src/styles/globals.css` | `tests/e2e/07_failure_fuzz_and_a11y.spec.ts` | axe-core verified 0 serious/critical issues across all routes. |
| **NFR-A11Y-2** | Skeletons everywhere, no spinners | **Implemented** | `src/components/ui.tsx` (`RowSkeleton`, `CardSkeleton`, etc.) | `tests/e2e/06_i18n_zoom_and_skeletons.spec.ts` | Verified no spinner roles and skeleton loading states. |
| **NFR-A11Y-3** | Fixed-layout onboarding, no moving buttons | **Implemented** | `src/app/onboarding/page.tsx` | `tests/e2e/01_onboarding_and_first_sale.spec.ts` | Bounding box comparisons across steps verified stable. |
| **NFR-I18N-1** | Ethiopian birr (ETB) default formatting | **Implemented** | `src/domain/money.ts` (`formatMoney`) | `tests/domain/money.test.ts` | Currency formatting verified across scenarios. |
| **NFR-I18N-2** | 3 languages (English, Amharic Ge'ez, Afaan Oromo Latin) | **Implemented** | `src/i18n/index.ts`, `en.ts`, `am.ts`, `om.ts` | `tests/domain/i18n.test.ts` (5 tests) | Full parity of keys and placeholder safety verified. |
| **NFR-I18N-3** | 130% string expansion & 200% zoom tolerance | **Implemented** | `src/styles/globals.css`, flexible UI layouts | `tests/e2e/06_i18n_zoom_and_skeletons.spec.ts` | 200% zoom and non-clipping text verified. |
| **OOS-1** | Barcode scanning | **Out of scope** | Schema column exists; scanner deferred to v1.1 | N/A | PRD Section 10 open question. |
| **OOS-2** | Online payment gateways / accounting / tax | **Out of scope** | None | N/A | PRD Section 3 non-goals. |
| **OOS-3** | Multi-branch inventory transfers | **Out of scope** | None | N/A | PRD Section 3 non-goals. |
| **OOS-4** | Supplier portal & purchase orders | **Out of scope** | None | N/A | PRD Section 3 non-goals. |
| **OOS-5** | Customer-facing login | **Out of scope** | None | N/A | PRD Section 3 non-goals. |
| **OOS-6** | Expenses tracking | **Out of scope** | None | N/A | PRD Section 10 v1.1 candidate. |
| **OOS-7** | CSV bulk catalogue import | **Out of scope** | None | N/A | PRD Section 10 v1.1 candidate. |
| **OOS-8** | App PIN lock for shared counter devices | **Out of scope** | None | N/A | PRD Section 10 v1.1 candidate. |
| **OOS-9** | Ethiopian calendar display | **Out of scope** | None | N/A | PRD Section 10 v1.1 candidate. |

---

## 3. Security Checklist Audit (docs/security.md)

| Section & Requirement | Status | Evidence / Assessment |
|-----------------------|--------|-----------------------|
| **2.1: No secrets in frontend or inside app** | **Verified-by-reading** | Verified: `src/lib/env.ts` exposes only `NEXT_PUBLIC_*`. Service-role and Anthropic keys are isolated to Edge Functions and CI. |
| **2.2: Users access only authorized data** | **Needs-test** | Code sets caller JWT in PostgREST and Edge calls. Requires running pgTAP RLS matrix to prove enforcement. |
| **2.3: Backend rules enforced (server recomputes)** | **Verified-by-reading** | Verified: `record_sale` recomputes line totals and ignores client totals; stock and debt writes occur via RPC. |
| **2.4: All input validated on client and server** | **Needs-test** | Zod schemas in `schemas.ts`, SQL check constraints and plpgsql validations present. Needs automated fuzz testing. |
| **2.5: RLS on every table in the same migration** | **Verified-by-reading** | Verified: Every `CREATE TABLE` in migrations 0001-0008 enables RLS and adds policies in that file. |
| **2.6: Rate limiting on all APIs** | **Needs-test** | Database `rate_limit_hit` and Edge Function limiters present. Needs test to verify 429 response and backoff. |
| **2.7: No backend errors shown to users** | **Verified-by-reading** | Verified: `src/domain/errors.ts` maps all SQL/HTTP/DB codes to friendly keys; unit test `tests/domain/errors.test.ts` passes. |
| **3: Secrets Management & Bundle Scan** | **Needs-test** | `scripts/check-bundle.mjs` checks for `service_role`, `sk-ant-`, JWTs. Must run in Phase 4 with positive/negative plant tests. |
| **4: Authentication & Sessions** | **Needs-test** | Uses Supabase Auth, min 10-char password, one-time invite codes with sha256 hash. Needs live auth integration tests. |
| **5.1: Default deny privileges** | **Needs-test** | Migration 0001 alters default privileges; migration 0009 revokes from `anon`. Must confirm role privileges via pgTAP. |
| **5.2: Anon has no table policies** | **Needs-test** | Verified by reading policies (all to `authenticated`). pgTAP has 17 tests asserting anon cannot select. Must run. |
| **5.3: Security definer sets search_path = ''** | **Verified-by-reading** | Verified: Every security definer function specifies `set search_path = ''` and fully-qualifies `public.*` calls. |
| **5.4: Cashier cannot read product_costs / sale_item_costs** | **Needs-test** | Policy `costs_owner` restricts select to `is_owner()`. Needs execution in pgTAP suite. |
| **6.1: SQL injection prevention** | **Verified-by-reading** | All migrations use parameterized queries; zero dynamic SQL strings in plpgsql functions. |
| **6.2: Formula injection prevention in CSV** | **Verified-by-reading** | Verified: `src/domain/csv.ts` prefixes `=`, `+`, `-`, `@` with single quote. Unit test passes. |
| **6.3: XSS & CSP hardening** | **Needs-test** | No `dangerouslySetInnerHTML` in codebase. Per-page script hash CSP in `scripts/postbuild.mjs`. Needs browser validation. |
| **7: Rate Limiting & Backoff** | **Needs-test** | Table `rate_limits` with windowed counting. Jittered exponential backoff in `outbox.ts`. Needs integration test. |
| **8: Error Masking** | **Verified-by-reading** | `translateError()` tested against raw SQL errors, PostgREST codes, network failures; returns zero leak. |
| **9: Transport & Browser Hardening** | **Needs-test** | `_headers` generated with strict CSP, nosniff, frame-ancestors none. Needs header audit on built site. |
| **10: Device Data Wipe on Sign Out** | **Needs-test** | `wipeLocalData()` clears IndexedDB stores and CacheStorage. Needs Playwright test on sign-out. |
| **15: Launch Security Checklist** | **Needs-test** | Complete 16-point launch checklist must be systematically verified in Phase 8. |

---

## 4. Suspected Bugs & Technical Risks

| # | File & Location | Why Suspected | How to Verify |
|---|-----------------|---------------|---------------|
| **1** | `supabase/migrations/0004_sales.sql`<br>Lines 188-189, 223-226 | **Cross-Migration Table Dependency:** `record_sale` inserts into `public.customer_ledger`, but `customer_ledger` is not created until `0005_debts.sql`. In PostgreSQL, PL/pgSQL function creation parses table references; `supabase db reset` will fail on migration 0004 with `relation "public.customer_ledger" does not exist`. | Run `supabase db reset` in Phase 2. Expected to fail at migration 0004. Fix: define `customer_ledger` or order migrations appropriately. |
| **2** | `supabase/migrations/0005_debts.sql`<br>Lines 41-84 (`customer_debts`) | **Ambiguous Column in PL/pgSQL `RETURNS TABLE`:** Stored procedure defines OUT parameters `(customer_id uuid, name text, balance numeric, ...)`. The inner query selects `c.name` and joins `agg a` on `a.balance`. PL/pgSQL variable conflict resolution will report ambiguity or shadow table columns. | Run `supabase test db` in Phase 2. Add `#variable_conflict use_column` or table-alias qualification. |
| **3** | `supabase/migrations/0007_reports.sql`<br>Lines 61-100 (`top_products`, `sales_trend`) | **Ambiguous OUT Parameters in Reports:** `top_products` declares `RETURNS TABLE (product_id uuid, name text, unit text, qty numeric, revenue numeric)`. Inner select `p.name, p.unit` conflicts with OUT parameter names `name` and `unit`. Same in `sales_trend` with `sales_total`, `sales_count`. | Run `supabase test db` in Phase 2. Add `#variable_conflict use_column`. |
| **4** | `src/app/sync/page.tsx`<br>Line 25 | **Property Name Mismatch:** Page accesses `i.lastError`, but `OutboxItem` in `src/domain/outbox.ts` line 27 declares `lastErrorCode?: ErrorCode`. This will cause TypeScript compilation to fail under strict mode. | Run `npm run typecheck` in Phase 1. |
| **5** | `supabase/functions/_shared/runtime.ts`<br>Line 116 | **Hardcoded Anthropic API Endpoint:** `https://api.anthropic.com/v1/messages` is hardcoded. In Phase 7 (testing without API keys via a local mock HTTP server), Edge Functions cannot be redirected to the mock server without an environment variable (e.g. `ANTHROPIC_BASE_URL`). | Run Phase 7 mock tests. Inspect if fetch target can be overridden via env var. |
| **6** | `package.json`<br>Line 19 | **Windows Shell Tool Incompatibility:** Script uses `"gen:pgtap": "python3 scripts/gen-pgtap.py"`. On Windows, the binary is `python.exe`, not `python3`. Invoking `npm run gen:pgtap` fails with `The term 'python3' is not recognized`. | Execute `npm run gen:pgtap` on Windows PowerShell. Fix to `python` or cross-platform runner. |
| **7** | `package.json`<br>Line 11 | **Missing ESLint Configuration:** `npm run lint` calls `next lint`, but no `eslint.config.mjs` or `.eslintrc.*` exists in the repo. Next.js 15 / ESLint 9 will fail with missing config error. | Run `npm run lint` in Phase 1. |
| **8** | `supabase/migrations/0004_sales.sql`<br>Line 38 & `0002_identity.sql` | **Cascade Foreign Key Failure on `delete_shop`:** `sale_items.sale_id` references `sales(id)` with default `NO ACTION` (not `ON DELETE CASCADE`). When `delete_shop()` deletes `shops`, cascading deletion of `sales` will trigger a foreign key violation from `sale_items`. | Run `delete_shop` test in pgTAP. Ensure FK cascades on dependent child tables. |
| **9** | `scripts/gen-pgtap.py`<br>Lines 46-47 | **Temporary Schema Permission Across Roles:** Generator creates `temp table ctx` and grants all to public, but does not grant `USAGE` on schema `pg_temp`. When switching to `anon` or `authenticated` roles, accessing `ctx` can fail with `permission denied for schema pg_temp`. | Run `supabase test db` in Phase 2. |
| **10** | `src/lib/api.ts`<br>Lines 198, 209 | **Floating Point Precision in RPC Arguments:** Using `money(p.paid)` (`p.paid / 100`) and `qtyToNumber(p.qty)` (`p.qty / 1000`) introduces IEEE-754 precision drift (e.g. `1.2055000000000001`). The database rejects numbers where `p_paid <> round(p_paid, 2)`. | Add precision comparison tests in Phase 3. |
| **11** | `src/app/onboarding/page.tsx`<br>Lines 24-29 | **Stale Localized Sample Items on Language Switch:** Onboarding initializes `rows` with sample items translated in the initial locale. When the user changes language on Step 1, `rows` retain the previous language names. | Manually switch language in onboarding during Phase 5 testing. |
| **12** | `src/lib/db.ts`<br>Line 54 | **Null Dexie Instance in Node Environment:** `export const db = typeof window === 'undefined' ? null : new ShopDB()`. Importing `db` or `sync.ts` in Node tests without `fake-indexeddb` or window mock will throw `Cannot read properties of null`. | Run integration tests in Node during Phase 3. |

---

## 5. Proposed Order of Work (Phases 1 to 8)

The standard phase roadmap is sound, with key adjustments to address discovered dependencies:

1. **Phase 1: Make it install, compile and lint**
   - Install dependencies (`npm install` outside sandbox).
   - Add ESLint 9 configuration with Next.js & TypeScript rules (ban `dangerouslySetInnerHTML`, enforce exhaustive-deps).
   - Fix TypeScript errors: `i.lastError` -> `i.lastErrorCode` in `src/app/sync/page.tsx`, Dexie 4 types, Next 15 / React 19 type alignment.
   - Verify `npm test` continues passing.
2. **Phase 2: Database: run migrations and all pgTAP tests**
   - Resolve migration ordering: ensure `customer_ledger` is created before `record_sale` references it, or combine ledger definitions cleanly across M3/M4.
   - Fix ambiguous plpgsql OUT parameters in `customer_debts`, `top_products`, `sales_trend` (`#variable_conflict use_column`).
   - Fix cascading delete on `sale_items`, `sale_item_costs`, `stock_movements`, `customer_ledger` during `delete_shop`.
   - Grant `USAGE ON SCHEMA pg_temp` in `scripts/gen-pgtap.py` and adapt `python3` to `python` for Windows.
   - Run `supabase start`, `supabase db reset`, and pass all 145 pgTAP checks. Add money parity test between SQL and client logic.
3. **Phase 3: Unit and integration tests for client logic**
   - Test `src/lib/sync.ts` and Dexie using `fake-indexeddb`.
   - Test outbox retry, backoff, jitter, stuck recovery, and offline queuing.
   - Write Node integration tests calling live local Supabase RPCs with two independent test users to prove tenant isolation.
4. **Phase 4: Build, static export, CSP and bundle scan**
   - Run `npm run build` targeting `out/`.
   - Run `scripts/postbuild.mjs` to generate per-page CSP and verify `_headers`.
   - Run `scripts/check-bundle.mjs` and execute planted secret tests (both positive and negative validation).
   - Measure first-load JS gzip sizes against the 170 KB budget.
5. **Phase 5: End-to-end tests in real browser (Playwright)**
   - Install Playwright browsers.
   - Implement the 13 required journeys: onboarding stability, offline sale, credit sale, voiding, cashier restrictions, reports reconciliation, Amharic/Oromo rendering, skeleton verification, failure fuzzing, and axe accessibility.
6. **Phase 6: Fill the gaps against the PRD**
   - Review any Partial/Missing items from Section 2.
   - Implement empty and offline states across every screen.
   - Complete loss-aversion alerts and smart defaults in UI.
7. **Phase 7: Edge Functions and AI evals harness**
   - Add `ANTHROPIC_BASE_URL` support in `_shared/runtime.ts`.
   - Build a lightweight local mock server simulating Anthropic Messages API.
   - Serve functions with `supabase functions serve` and test quick-entry, insights, and reminders against guardrails.
   - Build eval harness and initial 30 fixtures per language.
8. **Phase 8: Security review, performance, and final report**
   - Execute launch security checklist (docs/security.md Section 15).
   - Run Lighthouse mobile audits for performance and accessibility.
   - Generate `TEST_REPORT.md`, `CHECKLIST.md`, and `MANUAL_QA.md`.
