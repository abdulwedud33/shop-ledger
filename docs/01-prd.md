# 01. Product Requirements Document (PRD)

**Product:** Shop Ledger (working title)
**Version:** 0.1 (planning)
**Platform:** Installable web app (PWA), offline-capable

## 1. Problem

Small shop owners track stock, sales and customer debts in paper notebooks, memory or scattered chat messages. They lose track of what is in stock, who owes what, and whether the shop is actually making money. Debts get forgotten, stock runs out unnoticed, and the end-of-day count never matches.

## 2. Target users

| User | Needs | Context |
|------|-------|---------|
| **Shop owner** | See stock, debts, daily sales and profit at a glance; control staff access | Often on a mid-range phone, unreliable internet |
| **Cashier / helper** | Record sales fast; see prices and stock | Busy counter, one hand free, customers waiting |
| **Customer (indirect)** | Gets a clear record of what they owe | Receives a reminder or statement, no login in v1 |

## 3. Goals and non-goals

**Goals (v1)**
1. Record a sale in under 10 seconds for a returning product.
2. Always know current stock per product, with low-stock alerts.
3. Track credit sales and repayments per customer with a trustworthy balance.
4. Give the owner a clear daily and weekly view of sales, profit and debts.
5. Work offline and sync without losing or duplicating records.

**Non-goals (v1)**
- Online payments processing, tax filing, full accounting.
- Customer-facing app or login.
- Multi-branch inventory transfers.
- Supplier portals or purchase-order approval flows.

## 4. Core features (MVP)

### 4.1 Products and stock
- Add, edit, archive products (name, unit, sell price, cost price, barcode optional, category, reorder level).
- Stock changes only through **stock movements** (opening, purchase, sale, return, adjustment, damage). Never edit a number directly.
- Low-stock list and alerts.
- Quick "Restock" action (add quantity bought, optional new cost).

### 4.2 Sales
- Fast sale screen: search or tap product, set quantity, pick customer (optional), pay cash / mobile money / bank / on credit, or part-paid.
- Each sale is immutable. Mistakes are fixed by **void** (owner only), which creates reversing entries.
- Receipt view (shareable as image or text).

### 4.3 Customers and debts
- Customer list with phone, notes, optional credit limit.
- **Customer ledger:** every credit sale (charge) and repayment (payment) is a line. Balance = sum of the lines.
- Record a repayment in two taps; show remaining balance instantly.
- Overdue view (debts older than N days, configurable).
- Shareable statement and reminder text.

### 4.4 Dashboard and reports
- Today: sales total, cash in, credit given, profit (owner only).
- Week and month trends; best sellers; slow movers.
- Total outstanding debt, top debtors.
- Export to CSV.

### 4.5 AI assistant (assistive, never autonomous)
- **Quick entry:** type or dictate "sold 2 sugar to Abel on credit" and get a draft sale to confirm.
- **Insights:** plain-language daily and weekly summary, restock suggestions.
- **Reminder writer:** drafts a polite debt reminder message for the owner to send.
- See `agents.md`, `guardrails.md`.

### 4.6 Accounts and staff
- Email or phone sign-in. Owner invites cashiers.
- Roles: `owner`, `cashier`. Cashiers cannot see cost prices, profit, or void sales.

## 5. User stories (priority order)

1. As an owner, I add my products with prices so I can start selling.
2. As a cashier, I record a cash sale quickly so customers don't wait.
3. As a cashier, I record a credit sale for a named customer so the debt is tracked.
4. As an owner, I see who owes me money and how much.
5. As an owner, I record a repayment and the balance updates immediately.
6. As an owner, I am warned before a product runs out.
7. As an owner, I see today's sales and profit without any calculation.
8. As a cashier, I keep working when the internet drops, and everything syncs later.
9. As an owner, I void a wrong sale and stock and debt are corrected.
10. As an owner, I type a sentence and get a draft entry instead of filling a form.

## 6. Acceptance criteria (headline)

- A sale never changes stock or debt partially: all-or-nothing.
- Stock quantity always equals the sum of its movements.
- Customer balance always equals the sum of its ledger lines.
- The same offline sale synced twice is stored once (idempotency key).
- Cashier cannot read cost price, profit, or other shops' data (verified by tests).
- No raw backend errors are shown to users, ever.

## 7. Non-functional requirements (summary)

| Area | Requirement |
|------|-------------|
| Performance | First meaningful screen < 2 s on mid-range phone over 3G-class network; sale saved optimistically in < 100 ms perceived |
| Offline | Sales, repayments and stock-ins work offline; sync queue with retry |
| Security | RLS on every table, no secrets in client, rate limit on all APIs (see `security.md`) |
| Reliability | No data loss on app kill; append-only ledgers |
| Accessibility | WCAG 2.2 AA contrast, 44 px touch targets, screen-reader labels |
| Localization | ETB default; English, Amharic (Ge'ez script) and Afaan Oromo (Latin script); all text externalized; language switch in Settings and onboarding; layouts tolerate 30% longer text |

## 8. Success metrics

| Metric | Target |
|--------|--------|
| Time to first recorded sale after sign-up | < 10 minutes |
| Median time to record a repeat sale | < 10 s |
| Weekly active shops after 30 days | > 60% of onboarded |
| Credit sales with a named customer | > 90% |
| Sync conflicts requiring manual fix | < 0.5% |
| AI draft accepted without edits | > 70% |

## 9. Risks

| Risk | Mitigation |
|------|------------|
| Owners distrust numbers | Append-only ledgers, visible history, simple math shown |
| Staff skip data entry when busy | Speed-first sale screen, smart defaults, offline support |
| Wrong AI parse creates bad data | AI only proposes; human confirms; eval gates (`evals.md`) |
| Data loss offline | Local queue, idempotent sync, sync status always visible |

## 10. Open questions

1. ~~Which currency and language should be the first default?~~ **Decided:** ETB; English, Amharic, Afaan Oromo. Default shop language is chosen at onboarding.
2. Is barcode scanning needed in v1, or search and tap only?
3. Do owners want SMS reminders sent from the app, or only copy-and-send text?
4. Should negative stock be blocked or allowed with a warning? (Default proposed: allowed with a warning, owner-configurable.)
