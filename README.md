# Shop Ledger (working title)

Stock, sales and debts for small shops. Offline-first installable web app (PWA), statically hosted, with a Supabase backend.
Languages: English, Amharic, Afaan Oromo. Currency: Ethiopian birr (ETB).

Everything here follows the planning docs in [`docs/`](docs/README.md). Start with `docs/01-prd.md`, `docs/security.md` and `docs/05-backend-schema.md`.

## What is built

| Area | Status | Where |
|------|--------|-------|
| Database: identity, shops, roles, invites | Written | `supabase/migrations/0001-0002` |
| Database: products, stock ledger | Written | `0003` |
| Database: sales (one transaction, idempotent) | Written | `0004` |
| Database: customers, debts, FIFO ageing, payments | Written | `0005` |
| Database: void, stock correction, audit | Written | `0006` |
| Database: reports (profit hidden from cashiers) | Written | `0007` |
| Database: assistant memory, AI usage | Written | `0008` |
| Database: lockdown | Written | `0009` |
| DB tests (RLS matrix, ledger rules, limiter), 145 checks | Written, **not yet run** | `supabase/tests`, generator `scripts/gen-pgtap.py` |
| Domain logic (money, cart, ledger, outbox, stock, dates, csv, search, i18n) | Written, **48 unit tests pass** | `src/domain`, `src/i18n`, `tests/` |
| Offline sync engine (local-first queue, retries, pull cache) | Written | `src/lib/sync.ts`, `db.ts`, `api.ts` |
| Screens: sign in, onboarding, home, sell, products, customers, sales, reports, team, settings, sync, memory | Written, **not yet compiled** | `src/app`, `src/components` |
| AI Edge Functions (quick entry, daily summary, reminder) + guardrails | Written, **guardrails unit-tested, prompts not evaluated** | `supabase/functions` |
| PWA (manifest, service worker, icons), CSP generation, bundle secret scan, CI | Written | `public`, `scripts`, `.github` |

## Run it

Prerequisites: Node 22, Docker (for the local Supabase stack), the Supabase CLI.

```bash
npm install
cp .env.example .env.local          # fill in after `supabase start` prints the local URL and anon key
supabase start
supabase db reset                   # applies supabase/migrations
npm run test:db                     # RLS matrix and rules (pgTAP)
npm test                            # unit tests
npm run dev                         # http://localhost:3000
```

AI features (optional): `supabase secrets set ANTHROPIC_API_KEY=... ALLOWED_ORIGINS=http://localhost:3000`, then `supabase functions serve`.

Production build: `npm run build` writes the static site to `out/`, a per-page CSP to `out/_headers`, and fails if a secret ships in the bundle.

## Main design choices

- **Local first.** Every action is saved on the phone instantly and queued; the server confirms later. Each action carries a client-generated id, so retries never double-count.
- **The server is the judge.** Totals, stock and balances are recomputed in SQL. Ledgers are append-only; corrections are reversing rows.
- **RLS on every table**, default-deny privileges, cost and profit data in owner-only tables.
- **AI proposes, code decides, a human confirms.** AI tools never write; drafts come from server-recorded tool results; numbers in summaries must exist in tool output.

See `CHANGELOG.md` for where the build differs from the planning docs and why, and `CHECKLIST.md` for what only you can do.
