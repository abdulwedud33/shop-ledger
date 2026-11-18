# Shop Ledger (working title): Project 1 Docs Package

Inventory, debts and sales for small shops. Working title only; rename freely.

**Status:** planning docs only. No code is written until you say "start coding".

## Reading order

| # | File | Purpose |
|---|------|---------|
| 1 | `01-prd.md` | What we build and why, scope, success metrics |
| 2 | `02-technical-requirements.md` | Stack, architecture, performance, hosting |
| 3 | `03-app-flow.md` | Screens, navigation, and every key user flow |
| 4 | `04-ui-ux-design-brief.md` | Visual system, UX laws, psychology, loading and feedback rules |
| 4b | `DESIGN.md` | Machine-readable design system (tokens + prose) for agents and humans |
| 5 | `05-backend-schema.md` | Tables, RLS policies, RPCs, indexes |
| 6 | `06-implementation-plan.md` | Milestones, order of work, definition of done |
| 7 | `agents.md` | In-app AI agents + rules for coding agents |
| 8 | `tools.md` | Tools each agent may call |
| 9 | `memory.md` | What the AI may remember, and how |
| 10 | `evals.md` | How we test the AI and the critical flows |
| 11 | `guardrails.md` | Input/output validation and AI safety limits |
| 12 | `prompts.md` | Versioned prompts and output schemas |
| 13 | `security.md` | Security baseline (secrets, auth, RLS, rate limits) |

## Assumptions made (please confirm or correct)

1. **Web app installed as a PWA** (works offline, installs on a phone). Chosen because you asked for a statically hosted site.
2. **Supabase (Postgres) backend**, because you asked for row level security on every table.
3. **Two roles:** `owner` and `cashier`. Cashiers cannot see cost prices or profit.
4. **Decided:** currency is Ethiopian birr (ETB); languages are English, Amharic and Afaan Oromo (user-selectable, per-shop default). Settings stay per-shop so nothing is hard-coded. All other assumptions here are accepted.
5. **One shop per owner in v1** (the schema supports many).
6. The AI assistant only *proposes*; a human always confirms before anything is saved.

## Design sources you listed

Researched from their public docs and applied in `DESIGN.md` and `04-ui-ux-design-brief.md` (section 2). Install commands for coding agents are in `agents.md` section B.

- **Awesome DESIGN.md:** the plain-text design-system format; `DESIGN.md` follows it (YAML tokens + prose).
- **impeccable:** fixed six-section structure and anti-generic rules.
- **Taste Skill:** restraint and three dials; set to variance 3, motion 2, density 6.
- **Web Interface Guidelines:** review step at the end of every UI milestone.
- **UI UX Pro Max:** palette, font pairing and mobile-pattern checks.

I applied their principles; I did not copy any of their files. If you want a closer match to one of them, tell me which.

"Kabob's law" in your list was read as **Jakob's Law** (users expect your app to work like the apps they already know).

## Where each standing requirement lives

| Requirement | Files |
|-------------|-------|
| No secrets in frontend/app | `security.md` s3, `02-technical-requirements.md` s6, `guardrails.md` s9 |
| Users access only authorized data | `security.md` s4-5, `05-backend-schema.md`, `tools.md` |
| Backend and DB rules enforced | `security.md` s5-6, `05-backend-schema.md`, `06-implementation-plan.md` |
| User and AI input validated | `security.md` s6, `guardrails.md` s2 and s4, `02-technical-requirements.md` s5 |
| UX laws (Jakob, Hick, Proximity, Miller, Von Restorff) | `04-ui-ux-design-brief.md` s5, `DESIGN.md` |
| Skeleton loaders everywhere, no spinners | `04-ui-ux-design-brief.md` s7, `DESIGN.md` Components, `03-app-flow.md` s10 |
| Instant feedback, optimistic rendering | `04-ui-ux-design-brief.md` s7, `02-technical-requirements.md` s4 |
| No moving buttons in onboarding | `03-app-flow.md` s3, `04-ui-ux-design-brief.md` s7, `DESIGN.md` |
| No backend errors shown | `security.md` s8, `guardrails.md` s8, `04-ui-ux-design-brief.md` s7 |
| UX psychology (defaults, goal gradient, reciprocity, endowment, loss aversion) | `04-ui-ux-design-brief.md` s6, `guardrails.md` s10 |
| Simplicity, consistency, visual hierarchy | `04-ui-ux-design-brief.md` s8, `DESIGN.md` |
| Speed rules (compressed JSON, sane DB writes, no single bottleneck, optimistic, static hosting) | `02-technical-requirements.md` s4 |
| RLS on every table with policies | `security.md` s5, `05-backend-schema.md` s5 |
| Rate limiting on all APIs | `security.md` s7, `guardrails.md` s6 |
