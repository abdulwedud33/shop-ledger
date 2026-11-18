# 06. Implementation Plan

**Rule:** nothing in this plan starts until you say "start coding". Milestones are built one at a time. Per your working preference, I finish each milestone on my side, move to the next without waiting for you to test each one, and finish with a checklist of what only you can do.

## Milestones

### M0. Foundation
- Repo, TypeScript, lint, formatting, CI skeleton, `.vscode` settings.
- Design tokens and base components from `04-ui-ux-design-brief.md`.
- Supabase local project, environment handling, secret-scan CI check.
- **Done when:** app shell builds as a static export; CI green; no secrets in bundle.

### M1. Auth, shops, roles
- Sign-up/sign-in, `create_shop`, membership, role checks.
- RLS and policies for `profiles`, `shops`, `shop_members`.
- RLS test harness (outsider, cashier, owner).
- **Done when:** RLS tests pass; owner can invite a cashier.

### M2. Products and stock
- Schema for categories, products, costs, stock movements, trigger.
- Product list, add/edit, archive, restock, low-stock list.
- Skeleton loaders for all lists.
- **Done when:** stock always equals movements (invariant test); cashier cannot read costs.

### M3. Sales
- `record_sale`, sale screen, payment sheet, receipt, sales history.
- Optimistic UI and local outbox (online path first).
- **Done when:** sale is atomic, idempotent on `client_id`, and under the speed targets.

### M4. Customers and debts
- Customers, ledger, `record_payment`, balances view, overdue view, statements.
- Credit sale flow with limit check.
- **Done when:** balance equals ledger sum; repayment updates instantly.

### M5. Offline and sync
- Full outbox for sales, payments, stock-in; sync status sheet; retry and failure copy.
- Service worker, installable PWA, offline shell.
- **Done when:** airplane-mode test passes; duplicate sync stores once.

### M6. Void, adjust, audit
- `void_sale`, `adjust_stock`, audit log, owner-only screens.
- **Done when:** void restores stock and balance exactly.

### M7. Dashboard and reports
- `dashboard_summary`, today/week/month, top sellers, debtors, CSV export.
- Profit only for owner.
- **Done when:** report numbers reconcile with raw rows in tests.

### M8. AI assistant
- Edge functions: `ai-parse-entry`, `ai-insights`, `ai-reminder`.
- Guardrails, rate limits, memory table, usage logging.
- Eval suite passing thresholds in `evals.md`.
- **Done when:** eval gates met; AI can never write data without confirmation.

### M9. Hardening and launch
- Security review against `security.md`, rate limits on every endpoint, accessibility audit, performance budget check, backup/restore drill.
- Onboarding polish; error-message audit (no backend text anywhere).
- **Done when:** launch checklist green.

## Order of work inside each milestone

1. Schema and RLS (with tests)
2. RPC functions (with tests)
3. UI with skeletons and optimistic updates
4. Error and empty states
5. E2E test for the milestone's main flow
6. Docs update (`CHANGELOG`, this file)

## Definition of done (every milestone)

- Migrations include RLS and policies for every new table.
- Inputs validated on client and server.
- Skeleton loaders match layout; no spinners.
- No raw backend errors can reach the UI.
- Tests pass; bundle budget not exceeded.
- No secrets, keys or tokens in the client.

## What you must do yourself (will become the final checklist file)

Items only you can do. Added to as milestones complete:

- Create the Supabase project and paste the project URL and anon key into the hosting dashboard.
- Create the hosting project (Cloudflare Pages or similar) and connect the repo.
- Add the AI provider API key as a **server-side** secret in Supabase.
- Set up the domain and DNS if you want a custom domain.
- Decide currency, language and the open questions in `01-prd.md`.
- Test with a real shopkeeper and share feedback.

## Risks to schedule around

| Risk | Plan |
|------|------|
| Offline sync is the hardest part | Design the outbox in M3 so M5 only extends it |
| RLS mistakes | Policy tests written before UI; CI blocks merges |
| Scope creep | New ideas go into a "v1.1" list, not into milestones |
