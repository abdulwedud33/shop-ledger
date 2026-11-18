# agents.md

Two audiences: (A) the AI agents that run **inside the app**, and (B) the **coding agents** that build the app.

---

## A. In-app agents

All in-app agents run in Edge Functions, use the **caller's JWT** (never the service role) to read data, and can only **propose**. A human confirms in the UI before anything is saved. Tool lists are in `tools.md`; prompts in `prompts.md`; limits in `guardrails.md`.

### A1. Entry Parser

| Field | Value |
|-------|-------|
| Job | Turn a short sentence into a draft sale, payment, or stock-in |
| Trigger | User types or dictates in the quick-entry sheet |
| Inputs | User text, shop product list (names, ids, prices, units), customer names, shop memory aliases |
| Output | JSON draft matching the schema in `prompts.md`; unknowns flagged, never guessed |
| Tools | `search_products`, `search_customers`, `get_shop_memory`, `propose_sale`, `propose_payment`, `propose_stock_in` |
| Can write? | No. Returns a draft card |
| Model tier | Small and fast model (latency matters) |
| Failure mode | Returns `needs_clarification` with the specific missing item |

### A2. Insights Analyst

| Field | Value |
|-------|-------|
| Job | Daily and weekly plain-language summary; restock suggestions; slow-mover notes |
| Trigger | Home screen request or scheduled job |
| Inputs | Aggregates from `dashboard_summary`, low-stock list, top debtors |
| Output | Short text + structured list of suggestions, each with the numbers it used |
| Tools | `get_dashboard_summary`, `get_low_stock`, `get_top_debtors`, `get_sales_trend` |
| Can write? | No |
| Rule | Every number in the text must come from a tool result; the output includes the source figures for verification |
| Access | Owner only (profit data) |

### A3. Reminder Writer

| Field | Value |
|-------|-------|
| Job | Draft a polite message asking a customer to pay an outstanding balance |
| Trigger | Owner taps "Write reminder" on an overdue customer |
| Inputs | Customer name, balance, age of oldest debt, shop name, tone setting, language |
| Output | Message text only (copy and send by the owner) |
| Tools | `get_customer_balance` |
| Can write? | No. Never sends messages itself |
| Rule | Respectful, no threats, no mention of legal action, no personal data beyond name and amount |

### Agent design rules

1. **Propose, never commit.** Saving always goes through the normal UI and RPC with the user's confirmation.
2. **Least data.** Send the model only the fields needed (no phone numbers unless writing a reminder, no cost prices to non-owner flows).
3. **Grounded.** Numbers come from tools. If a tool fails, say so; do not estimate.
4. **Fail soft.** If the AI provider is down, the manual flow is fully usable (no single dependency bottleneck).
5. **Observable.** Each call logs agent name, token counts, outcome, latency (no raw prompt text, no personal data).
6. **Budgeted.** Per-shop daily call and token caps; see `guardrails.md`.

---

## B. Coding agents (for building this project)

Applies to any AI coding assistant working in the repo.

### Ground rules

1. **Do not write code until the owner of the project says "start coding".** Docs and planning only before that.
2. Read in order: `README.md`, `01-prd.md`, `02-technical-requirements.md`, `05-backend-schema.md`, `security.md`, then the milestone in `06-implementation-plan.md`.
3. Work **one milestone at a time**. Do not start the next until the current one meets its "Done when".
4. Never put secrets, API keys, or service-role keys in client code, config committed to git, logs, or examples.
5. Every new table ships with RLS enabled and policies plus tests, in the same migration.
6. Every input (user text, AI output, URL param, file) is validated with Zod and again server-side.
7. UI: follow `04-ui-ux-design-brief.md`. No spinners; skeletons that match layout. Never display backend error text.
8. Writes: one business action = one RPC. No client-side loops of inserts.
9. Money is never a float. Stock and balances are never edited directly.
10. Keep dependencies few; justify each new package (bundle budget in `02-technical-requirements.md`).
11. Before declaring done: run typecheck, lint, unit, RLS tests, E2E for the flow, bundle check.
12. If a requirement is ambiguous, list the options and the default you would pick; do not silently invent behaviour.

### Design skills for coding agents

Read `DESIGN.md` first for any UI work, then `04-ui-ux-design-brief.md`. These community skills may be installed in the coding environment as extra checks. Commands below were found in each project's public docs; confirm them against the project's current README before running, and review any skill's contents before trusting it.

| Skill | Use it for | Install (from its docs) |
|-------|-----------|-------------------------|
| Awesome DESIGN.md (VoltAgent) | Reference DESIGN.md files for structure and inspiration; adapt, do not copy | Clone `github.com/VoltAgent/awesome-design-md` and read files under its design folder |
| impeccable | Generating and auditing a DESIGN.md; anti-generic design commands | `/plugin install pbakaus-impeccable@pbakaus/impeccable` (Claude Code) |
| Taste Skill | Premium, non-generic frontend; keep dials at variance 3, motion 2, density 6 | `npx skills add https://github.com/Leonxlnx/taste-skill` |
| Web Interface Guidelines (`web-design-guidelines`) | Review UI code for accessibility, forms, focus, performance. Output is `file:line` findings | `npx skills add https://github.com/vercel-labs/agent-skills --skill web-design-guidelines` |
| UI UX Pro Max | Palette, font pairing and pattern checks | `npx skills add https://github.com/nextlevelbuilder/ui-ux-pro-max-skill --skill ui-ux-pro-max` |

Rules for using them:

1. `DESIGN.md` wins over any skill's default taste. Skills are checks and helpers, not a reason to change tokens.
2. Run the Web Interface Guidelines review and an accessibility pass at the end of every UI milestone; fix findings or log why not.
3. If a skill suggests a template look listed under "Don't" in `DESIGN.md`, ignore the suggestion.
4. Do not add a skill's generated assets or dependencies without checking the bundle budget and licence.

### Commit and PR conventions

- Small PRs per feature; title states the user-visible change.
- PR checklist: RLS tested, inputs validated, skeletons present, no secrets, budget ok, docs updated.

### Files agents must keep updated

`06-implementation-plan.md` (status), `05-backend-schema.md` (if the schema changes), `evals.md` (if AI behaviour changes), `prompts.md` (version bump on any prompt edit).
