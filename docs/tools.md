# tools.md

Tools that the in-app AI agents may call. Tools run inside Edge Functions with the **caller's JWT**, so RLS applies to every call. Tools are either **read** (return data) or **propose** (return a draft; nothing is saved).

## Conventions

- Every tool has a Zod input schema and a Zod output schema; invalid input is rejected before execution.
- Strings are length-limited; arrays are capped; ids must be UUIDs.
- Results are trimmed to the fields the agent needs.
- Every call is rate limited and logged (name, outcome, latency; no raw content).
- Tool errors return a short coded result (`not_found`, `forbidden`, `too_many_results`); the agent never sees SQL or internal messages.
- No tool accepts a `shop_id` from the model. The shop comes from the verified session.

## Read tools

| Tool | Input | Output | Available to |
|------|-------|--------|--------------|
| `search_products` | `query` (<= 60 chars), `limit` (<= 10) | `[{id, name, unit, sell_price, stock_qty}]` | Entry Parser |
| `search_customers` | `query` (<= 60 chars), `limit` (<= 5) | `[{id, name}]` (no phone) | Entry Parser |
| `get_shop_memory` | `kinds?` | `[{kind, key, value}]` (aliases and preferences) | Entry Parser, Reminder Writer |
| `get_dashboard_summary` | `from`, `to` (max 92 days) | Totals: sales, cash in, credit given, profit, counts | Insights Analyst (owner) |
| `get_low_stock` | `limit` (<= 20) | `[{product, stock_qty, reorder_level}]` | Insights Analyst |
| `get_top_debtors` | `limit` (<= 10) | `[{customer, balance, oldest_charge_age_days}]` | Insights Analyst (owner) |
| `get_sales_trend` | `period` (`week`/`month`) | Daily totals array | Insights Analyst (owner) |
| `get_customer_balance` | `customer_id` | `{name, balance, oldest_charge_age_days}` | Reminder Writer (owner) |

## Propose tools (return drafts only)

| Tool | Input | Output |
|------|-------|--------|
| `propose_sale` | `items[{product_id, qty}]`, `customer_id?`, `payment{method, paid_amount}` | Draft with computed totals, warnings (low stock, credit limit) |
| `propose_payment` | `customer_id`, `amount`, `method` | Draft with resulting balance |
| `propose_stock_in` | `product_id`, `qty`, `unit_cost?` | Draft with resulting stock |

A propose tool **recomputes totals server-side from current prices**. It does not trust prices or totals supplied by the model.

## Tools agents must never have

- Any direct insert, update, or delete on the database.
- Sending SMS, email, or messages.
- Reading cost prices outside the owner-only Insights flow.
- Access to other shops, auth data, secrets, or raw logs.
- Arbitrary SQL, HTTP fetch, or code execution.

## Tool call limits per request

| Agent | Max tool calls | Max model turns |
|-------|----------------|-----------------|
| Entry Parser | 6 | 3 |
| Insights Analyst | 6 | 3 |
| Reminder Writer | 2 | 2 |

If a limit is reached, return `needs_clarification` or a short failure message and stop.

## Non-AI tool inventory (build and ops)

| Tool | Purpose |
|------|---------|
| Supabase CLI | Local stack, migrations, type generation |
| pgTAP / SQL tests | RLS and invariant tests |
| Playwright | End-to-end flows incl. offline |
| Vitest | Unit tests (money, stock math, schemas) |
| Lighthouse CI | Performance and accessibility budgets |
| gitleaks (or similar) | Secret scanning in CI |
| Sentry | Error tracking |
