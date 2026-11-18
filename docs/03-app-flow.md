# 03. App Flow

## 1. Navigation structure

Mobile uses a bottom bar with **4 items** (Hick's Law: few choices) and one prominent action.

```
Bottom bar:  Home | Products | [ + Sale ] | Customers | More
```

| Tab | Contents |
|-----|----------|
| **Home** | Today summary, low stock, debts due, AI daily summary |
| **Products** | List, search, add/edit, restock |
| **+ Sale** (center action) | New sale screen |
| **Customers** | List, balances, ledger, repayments |
| **More** | Reports, staff, settings, export, help, sign out |

Tablet/desktop: left rail with the same items, content in two panes (list + detail).

## 2. Screen inventory

1. Welcome / sign-in / sign-up
2. Onboarding (3 steps)
3. Home
4. Product list, product detail, add/edit product, restock
5. New sale (cart), payment sheet, receipt
6. Sales history, sale detail (void for owner)
7. Customer list, customer detail (ledger), add customer, record payment
8. Reports (day, week, month), top sellers, debtors
9. AI quick entry sheet (available from every main screen)
10. Staff (invite, roles)
11. Settings (shop profile, currency, language, low-stock rules, overdue days)
12. Sync status sheet
13. Empty, error and offline states (every list)

## 3. Onboarding flow

Goal: first sale recorded in under 10 minutes. Layout stays fixed; **no buttons move** between steps (primary button always in the same bottom position).

```
Sign up (email or phone)
  -> Step 1: Shop name, currency (pre-filled from locale)
  -> Step 2: Add products
        options: "Add a few now" | "Paste a list" | "Skip, use sample items"
        (smart default: sample items pre-selected for quick trial)
  -> Step 3: Opening stock quantities (steppers, default 0)
  -> Done screen: "Record your first sale" (single primary action)
```

Progress shown as "Step 2 of 3" with a filled bar (goal gradient). Back is always available and keeps typed data.

## 4. Core flow A: record a cash sale

```
Home or bottom bar [ + Sale ]
  -> Sale screen: product search at top, recent/frequent products as tiles
  -> Tap tile: +1 quantity (tap again: +1; long press or field: set quantity)
  -> Cart bar at bottom shows count and total (always visible)
  -> [ Charge 350 ] button
  -> Payment sheet: Cash preselected, amount pre-filled to total
  -> [ Confirm ]
  -> Instant success state (optimistic), receipt card, [ New sale ] [ Share ]
  -> In background: outbox -> record_sale RPC -> synced
```

Edge cases:
- Product out of stock: allowed with a warning chip (owner-configurable to block).
- Quantity above stock: warning, not error.
- Offline: same flow; a small "Saved on this phone" badge instead of any error.

## 5. Core flow B: credit sale

```
Sale screen -> cart -> [ Charge ]
  -> Payment sheet: choose "On credit" or "Part paid"
  -> Customer required: search existing or [ Add new ] inline (name + phone only)
  -> Show current balance and credit limit before confirming
  -> If limit exceeded: warning with owner override (cashier needs owner PIN or is blocked, per setting)
  -> [ Confirm ] -> instant success -> ledger charge created for unpaid part
```

## 6. Core flow C: record a repayment

```
Customers -> customer -> [ Record payment ]
  -> Amount field with quick chips: "Full balance", "Half"
  -> Method (default: last used)
  -> [ Save ] -> balance updates instantly, goal-gradient bar shows progress toward zero
  -> Option: [ Share receipt ]
```

## 7. Core flow D: restock

```
Products -> product -> [ Restock ]  (or Home low-stock card -> [ Restock ])
  -> Quantity stepper, cost per unit (default: last cost), date (default: today)
  -> [ Save ] -> stock movement 'purchase' -> stock updates instantly
```

## 8. Core flow E: void a sale (owner only)

```
Sales history -> sale -> [ Void sale ]
  -> Confirm sheet explains the effect in plain words:
     "Stock for 3 items will be returned. Abel's balance will drop by 120."
  -> Reason (required, short list + other)
  -> [ Void sale ] -> reversing entries, sale marked voided, history preserved
```

## 9. Core flow F: AI quick entry

```
Any screen -> mic/keyboard button -> sheet
  -> User types or dictates: "sold 2 sugar and 1 oil to Abel on credit"
  -> Skeleton of the draft card appears instantly
  -> Draft card: products matched, quantities, customer, payment type, total
     unknown items are highlighted with a one-tap "Pick product"
  -> [ Confirm ] (edits allowed) -> same path as normal sale
  -> [ Discard ] -> nothing saved
```

AI never saves by itself. See `guardrails.md`.

## 10. State handling (every list and screen)

| State | Behavior |
|-------|----------|
| Loading | Skeleton matching the final layout. No spinners |
| Empty | One sentence + one clear action ("Add your first product") |
| Offline | Quiet banner "Offline: changes are saved on this phone" |
| Syncing | Small status dot in header; sheet with details on tap |
| Error (recoverable) | Friendly sentence + [ Try again ]. Never show codes, SQL, or stack traces |
| Permission denied | "Only the owner can do this" + who to ask |
| Session expired | Return to sign-in, then back to where the user was, drafts kept |

## 11. Role differences

| Capability | Owner | Cashier |
|-----------|-------|---------|
| Create sale, add customer, record payment | Yes | Yes |
| See cost price and profit | Yes | No |
| Edit product prices | Yes | No (configurable) |
| Void sale, adjust stock | Yes | No |
| Manage staff, settings, export | Yes | No |

## 12. Notifications

- Low stock (in-app, optional push later).
- Debts overdue (weekly digest to owner).
- Sync problems needing attention (only when the user must act).
