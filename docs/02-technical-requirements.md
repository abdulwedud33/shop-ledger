# 02. Technical Requirements

## 1. Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Frontend | Next.js (TypeScript) with **static export** (`output: 'export'`) | Statically hosted, fast, matches your existing skills |
| Styling | Tailwind CSS + design tokens (see `04-ui-ux-design-brief.md`) | Consistent, small CSS output |
| State and data | TanStack Query + Dexie (IndexedDB) | Optimistic updates, offline cache and queue |
| Forms and validation | React Hook Form + Zod | One schema validates client and server |
| Backend | Supabase: Postgres, Auth, Edge Functions | RLS built in, no server to manage |
| AI | Anthropic API called **only from Edge Functions** | Key never reaches the client |
| Hosting | Cloudflare Pages (or Netlify/Vercel static) + Supabase | Static hosting on a CDN |
| PWA | Service worker (Workbox), web manifest | Install, offline shell |
| Monitoring | Sentry (client and functions), Supabase logs | Errors visible to us, never to users |
| CI | GitHub Actions: typecheck, lint, unit, RLS tests, build | Blocks unsafe merges |

You work in VS Code; a `.vscode/` recommended-extensions file will be included at project start.

## 2. Architecture

```
[PWA on CDN] ──HTTPS──> [Supabase Auth]
     │                        │
     │ (JWT)                  ▼
     ├──────────────> [Postgres + RLS]  <── RPC functions (record_sale, record_payment, ...)
     │
     └──────────────> [Edge Functions] ──> [AI provider]
                         │  rate limit, validate, log
                         ▼
                    [Postgres via user JWT, never service role for user data]
```

Rules:
1. The client talks to Postgres only through the Supabase client with the **user's JWT**. RLS decides access.
2. Multi-row business actions (sale, payment, void, restock) go through **RPC functions**, so they are atomic.
3. Edge Functions exist for AI calls, reminders, scheduled jobs, and anything needing a secret.
4. The service-role key exists only in server environments and is never used to answer a user request on user data.

## 3. Offline and sync design

- All writes first go to a local **outbox** (IndexedDB) with a client-generated UUID (`client_id`).
- UI updates optimistically from the outbox.
- A sync worker sends outbox items in order through the matching RPC. Each RPC is **idempotent** on `client_id`.
- Status per item: `pending`, `syncing`, `synced`, `failed`. Failed items show a plain-language fix, never a stack trace.
- Server is the source of truth. After sync, local cache refreshes by `updated_at` cursor.
- Conflict policy: ledgers and stock movements are append-only, so conflicts are rare. Product and customer edits use last-write-wins with `updated_at`, and the owner sees a note if a stale edit was overwritten.

## 4. Performance requirements

Applies to the whole app (these also appear in `security.md` and `04-ui-ux-design-brief.md` where relevant):

1. **No uncompressed JSON.** Enable Brotli/gzip at the CDN and API; select only needed columns; paginate lists (cursor pagination, 25 to 50 rows).
2. **No illogical DB write methods.** One business action = one RPC = one transaction. No loops of client-side inserts. Stock is changed only by a trigger on `stock_movements`.
3. **No single dependency bottleneck.** The app shell and last-known data work without the backend; AI features degrade gracefully when the provider is down; third-party scripts load async and are optional.
4. **No un-optimistic rendering.** Every write updates the UI instantly, then reconciles. Rollback with a clear message on rejection.
5. **No non-statically hosted site.** The frontend is a pure static export on a CDN. No server-side rendering at request time.
6. Budgets: JS < 170 KB gzip on first load per route, LCP < 2.5 s on 3G-class, CLS < 0.1, INP < 200 ms.
7. Images: product images optional, compressed on-device before upload (max 800 px, WebP), lazy loaded.
8. Reads use indexed queries only (see `05-backend-schema.md` index list).

## 5. API surface (logical)

| Name | Type | Role |
|------|------|------|
| `record_sale` | RPC | Create sale, items, stock movements, ledger charge for unpaid part |
| `record_payment` | RPC | Create ledger payment for a customer |
| `void_sale` | RPC (owner) | Reverse stock and ledger for a sale |
| `record_stock_in` | RPC | Purchase or restock movement |
| `adjust_stock` | RPC (owner) | Correction with required reason |
| `dashboard_summary` | RPC | Aggregates for a date range (owner sees profit) |
| `ai-parse-entry` | Edge Function | Text to draft sale/payment/stock-in |
| `ai-insights` | Edge Function | Summary and restock suggestions |
| `ai-reminder` | Edge Function | Draft debt reminder |
| `export-csv` | Edge Function | Owner export |

All inputs validated with Zod (client) and re-validated in the function or SQL constraints (server).

## 6. Environments

| Env | Purpose |
|-----|---------|
| `local` | Supabase CLI local stack, seeded demo data |
| `staging` | Preview deploys per PR, separate Supabase project |
| `production` | Locked, migrations applied by CI only |

Config via environment variables. Only the public anon key and project URL are allowed in the client bundle. A CI check fails the build if known secret patterns appear in the output.

## 7. Data and migrations

- All schema changes are SQL migrations in the repo, reviewed in PRs.
- Every migration that adds a table must also enable RLS and add policies in the same file.
- Daily automated backups; point-in-time recovery enabled on production.
- Soft delete (`deleted_at`) for products and customers; ledgers are never deleted.

## 7b. Testing requirements

- Unit: money math, stock math, Zod schemas.
- Database: pgTAP or SQL tests for RLS (owner, cashier, outsider, anonymous) on every table.
- Integration: offline sale then sync, duplicate sync, void sale.
- E2E (Playwright): sign-up, add product, sale, credit sale, repayment, offline sale.
- AI: eval suite in `evals.md`.

## 8. Money and number rules

- Store money as integers in the smallest unit (e.g. cents) or `numeric(14,2)`. Never floats.
- Quantities as `numeric(12,3)` to allow weights and litres.
- Rounding rule defined once in a shared helper and used everywhere.
- Display formatting uses the shop's locale and currency.

## 9. Browser and device support

Latest two versions of Chrome, Safari, Edge, Firefox; Android 8+ Chrome; iOS 16+ Safari (PWA). Layout is mobile-first, with a wider two-pane layout on tablet and desktop.

## 10. Observability

- Structured logs on functions with request id; no personal data or raw prompts in logs.
- Alerts: sync failure rate, RPC error rate, AI error rate and cost per shop per day.
- User-facing errors map to friendly messages through one error-translation module.

## 11. Localization (decided)

- Currency: Ethiopian birr (ETB), two decimals, shown as "Br" or "ETB" per locale; stored as `numeric(14,2)`.
- Languages: English (`en`), Amharic (`am`, Ge'ez script), Afaan Oromo (`om`, Latin script). UI strings live in message catalogs per locale (for example `next-intl` or `i18next`), lazy-loaded per language to protect the bundle budget.
- Fonts: self-hosted, subset per script. Bundle an Ethiopic-capable font (Noto Sans Ethiopic) as the Amharic fallback; Latin fonts cover Afaan Oromo.
- Formatting: use `Intl` with the locale for numbers and dates; keep one shared helper. Calendar display defaults to Gregorian; an Ethiopian-calendar option is a v1.1 candidate to confirm with shop owners.
- Search must match across scripts and typos: normalise Unicode, support Amharic and Latin product names, and allow a transliteration alias per product.
- Voice or dictation input is not assumed to work for Amharic or Afaan Oromo; typed entry is the supported path in v1.
- Translations are reviewed by native speakers before launch; machine translation alone is not acceptable for money terms (balance, owes, paid, credit).
