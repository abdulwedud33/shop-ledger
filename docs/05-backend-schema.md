# 05. Backend Schema (Postgres / Supabase)

Design document. SQL here is the **planned** schema; it becomes migrations only when you say "start coding".

## 1. Principles

1. Every table has `shop_id` (except `shops`, `profiles`) and **RLS enabled with policies in the same migration**.
2. Ledgers (`stock_movements`, `customer_ledger`, `sales`, `sale_items`) are **append-only**. No update or delete. Corrections are reversing rows.
3. Derived numbers (stock, balances) come from rows, never typed in directly.
4. Business actions run through **RPC functions**, one transaction each, idempotent on `client_id`.
5. Cost and profit data lives in **owner-only tables**, so cashiers cannot read it even by mistake.
6. Money: `numeric(14,2)`. Quantity: `numeric(12,3)`. Timestamps: `timestamptz`, UTC.

## 2. Enums

```sql
create type member_role     as enum ('owner', 'cashier');
create type stock_move_type as enum ('opening','purchase','sale','return','adjustment','damage','void_reversal');
create type ledger_type     as enum ('charge','payment','adjustment','void_reversal');
create type pay_method      as enum ('cash','mobile_money','bank','credit');
create type sale_status     as enum ('completed','voided');
```

## 3. Tables

```sql
-- identity
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text, phone text, created_at timestamptz default now()
);

create table shops (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users,
  name text not null check (char_length(name) between 1 and 80),
  currency char(3) not null default 'ETB',
  locale text not null default 'en' check (locale in ('en','am','om')),
  timezone text not null default 'Africa/Addis_Ababa',
  allow_negative_stock boolean not null default true,
  overdue_days int not null default 30 check (overdue_days between 1 and 365),
  created_at timestamptz default now()
);

create table shop_members (
  shop_id uuid references shops on delete cascade,
  user_id uuid references auth.users on delete cascade,
  role member_role not null,
  created_at timestamptz default now(),
  primary key (shop_id, user_id)
);

-- catalog
create table categories (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops on delete cascade,
  name text not null check (char_length(name) <= 60),
  unique (shop_id, name)
);

create table products (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops on delete cascade,
  category_id uuid references categories,
  name text not null check (char_length(name) between 1 and 120),
  unit text not null default 'pcs',
  barcode text,
  sell_price numeric(14,2) not null check (sell_price >= 0),
  stock_qty numeric(12,3) not null default 0,       -- maintained ONLY by trigger
  reorder_level numeric(12,3) not null default 0,
  archived_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table product_costs (                         -- OWNER ONLY
  product_id uuid primary key references products on delete cascade,
  shop_id uuid not null references shops on delete cascade,
  cost_price numeric(14,2) not null check (cost_price >= 0)
);

-- customers and debts
create table customers (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  phone text,
  notes text check (char_length(notes) <= 500),
  credit_limit numeric(14,2) check (credit_limit >= 0),
  archived_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- sales (append-only)
create table sales (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops on delete cascade,
  client_id uuid not null,                           -- idempotency key
  customer_id uuid references customers,
  total numeric(14,2) not null check (total >= 0),
  paid_amount numeric(14,2) not null check (paid_amount >= 0),
  method pay_method not null,
  status sale_status not null default 'completed',
  voided_at timestamptz, void_reason text,
  created_by uuid not null references auth.users,
  created_at timestamptz default now(),
  unique (shop_id, client_id),
  check (paid_amount <= total)
);

create table sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references sales on delete restrict,
  shop_id uuid not null references shops on delete cascade,
  product_id uuid not null references products,
  qty numeric(12,3) not null check (qty > 0),
  unit_price numeric(14,2) not null check (unit_price >= 0)
);

create table sale_item_costs (                       -- OWNER ONLY, cost snapshot for profit
  sale_item_id uuid primary key references sale_items on delete restrict,
  shop_id uuid not null references shops on delete cascade,
  unit_cost numeric(14,2) not null
);

-- stock ledger (append-only)
create table stock_movements (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops on delete cascade,
  product_id uuid not null references products,
  type stock_move_type not null,
  qty_delta numeric(12,3) not null check (qty_delta <> 0),
  sale_id uuid references sales,
  reason text check (char_length(reason) <= 200),
  client_id uuid,
  created_by uuid not null references auth.users,
  created_at timestamptz default now(),
  unique (shop_id, client_id, product_id, type)
);

-- customer ledger (append-only)
create table customer_ledger (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops on delete cascade,
  customer_id uuid not null references customers,
  type ledger_type not null,
  amount numeric(14,2) not null check (amount <> 0),  -- charge +, payment -, as signed
  method pay_method,
  sale_id uuid references sales,
  note text check (char_length(note) <= 200),
  client_id uuid,
  created_by uuid not null references auth.users,
  created_at timestamptz default now(),
  unique (shop_id, client_id, type)
);

-- support
create table audit_log (
  id bigint generated always as identity primary key,
  shop_id uuid not null references shops on delete cascade,
  actor uuid, action text not null, entity text, entity_id uuid,
  meta jsonb, created_at timestamptz default now()
);

create table shop_memory (                           -- see memory.md
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops on delete cascade,
  kind text not null check (kind in ('alias','preference','fact')),
  key text not null check (char_length(key) <= 80),
  value text not null check (char_length(value) <= 300),
  created_by uuid references auth.users,
  created_at timestamptz default now(),
  unique (shop_id, kind, key)
);

create table ai_usage (
  id bigint generated always as identity primary key,
  shop_id uuid not null references shops on delete cascade,
  user_id uuid, agent text not null,
  input_tokens int, output_tokens int, ok boolean,
  created_at timestamptz default now()
);

create table rate_limits (                           -- used by edge functions
  key text not null, window_start timestamptz not null,
  hits int not null default 1,
  primary key (key, window_start)
);
```

## 4. Helper functions

```sql
create function is_member(p_shop uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.shop_members m
                 where m.shop_id = p_shop and m.user_id = (select auth.uid()));
$$;

create function is_owner(p_shop uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.shop_members m
                 where m.shop_id = p_shop and m.user_id = (select auth.uid())
                   and m.role = 'owner');
$$;
```

## 5. Row level security (enabled on **every** table)

```sql
alter table shops           enable row level security;
alter table shop_members    enable row level security;
alter table categories      enable row level security;
alter table products        enable row level security;
alter table product_costs   enable row level security;
alter table customers       enable row level security;
alter table sales           enable row level security;
alter table sale_items      enable row level security;
alter table sale_item_costs enable row level security;
alter table stock_movements enable row level security;
alter table customer_ledger enable row level security;
alter table audit_log       enable row level security;
alter table shop_memory     enable row level security;
alter table ai_usage        enable row level security;
alter table rate_limits     enable row level security;
alter table profiles        enable row level security;
```

### Policy matrix

| Table | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| profiles | self | self | self | none |
| shops | member | none (via `create_shop` RPC) | owner | none |
| shop_members | member | owner (via invite RPC) | owner | owner |
| categories, customers | member | member | member (customers), owner (categories) | none (soft archive) |
| products | member | owner | owner | none (archive) |
| product_costs, sale_item_costs | **owner** | owner (via RPC) | owner | none |
| sales, sale_items | member | **RPC only** | **RPC only** (void) | none |
| stock_movements, customer_ledger | member | **RPC only** | **none** | **none** |
| audit_log | owner | RPC/trigger only | none | none |
| shop_memory | member | member | member | member |
| ai_usage | owner | edge function | none | none |
| rate_limits | none | edge function (service) | edge function (service) | service |

Example policies:

```sql
create policy products_select on products for select using (is_member(shop_id));
create policy products_insert on products for insert with check (is_owner(shop_id));
create policy products_update on products for update
  using (is_owner(shop_id)) with check (is_owner(shop_id));

create policy costs_owner on product_costs for all
  using (is_owner(shop_id)) with check (is_owner(shop_id));

create policy customers_select on customers for select using (is_member(shop_id));
create policy customers_insert on customers for insert with check (is_member(shop_id));
create policy customers_update on customers for update
  using (is_member(shop_id)) with check (is_member(shop_id));

-- append-only ledgers: read only for clients; writes happen in RPC functions
create policy ledger_select on customer_ledger for select using (is_member(shop_id));
revoke insert, update, delete on customer_ledger, stock_movements, sales, sale_items from authenticated, anon;
```

`anon` has no policies on any table. Views use `security_invoker = true` so RLS applies.

## 5b. Triggers

- `stock_movements` AFTER INSERT: `products.stock_qty += qty_delta` (the only code that writes `stock_qty`).
- `products`, `customers` BEFORE UPDATE: set `updated_at`.
- Block `UPDATE`/`DELETE` on ledger tables with a trigger as defense in depth.
- Audit trigger on sensitive actions (void, adjustment, role change, price change).

## 6. RPC functions (all `security invoker`, so RLS still applies, except where noted)

| Function | Steps (single transaction) |
|----------|---------------------------|
| `create_shop(name, currency, locale, tz)` | `security definer`; inserts shop and owner membership; returns shop |
| `record_sale(shop, client_id, customer, items jsonb, paid, method)` | If `client_id` already exists, return the existing sale. Validate items and prices. Lock product rows (`for update`). Enforce stock rule. Insert sale, items, cost snapshots, `sale` stock movements. If `paid < total`, require customer, enforce credit limit, insert ledger `charge` for the unpaid part. Return sale |
| `record_payment(shop, client_id, customer, amount, method, note)` | Validate amount > 0 and <= balance (warn if over). Insert ledger `payment` (negative amount) |
| `record_stock_in(shop, client_id, product, qty, unit_cost)` | Insert `purchase` movement; update `product_costs` if given |
| `adjust_stock(shop, product, qty_delta, reason)` | Owner only; reason required; `adjustment`/`damage` movement; audit |
| `void_sale(shop, sale, reason)` | Owner only; mark voided; insert `void_reversal` stock movements and ledger reversal; audit |
| `dashboard_summary(shop, from, to)` | Aggregates; profit fields null for cashier |
| `invite_member(shop, email, role)` | Owner only; limited roles; audit |

All functions validate argument shapes and lengths and raise **coded errors** (e.g. `STOCK_LOW`, `LIMIT_EXCEEDED`) that the client translates to friendly text.

## 7. Views

```sql
create view customer_balances with (security_invoker = true) as
select shop_id, customer_id, sum(amount) as balance, min(created_at) filter (where type = 'charge') as oldest_charge
from customer_ledger group by shop_id, customer_id;
```

Oldest unpaid logic for the overdue view is calculated by the RPC with first-in-first-out matching of payments to charges.

## 8. Indexes

```sql
create index on products (shop_id, archived_at, name);
create index on products (shop_id) where stock_qty <= reorder_level;       -- low stock
create index on sales (shop_id, created_at desc);
create index on sales (shop_id, customer_id, created_at desc);
create index on sale_items (sale_id);
create index on stock_movements (shop_id, product_id, created_at desc);
create index on customer_ledger (shop_id, customer_id, created_at desc);
create index on customers (shop_id, name text_pattern_ops);
create index on shop_members (user_id);
create index on audit_log (shop_id, created_at desc);
```

Every RLS predicate column (`shop_id`, `user_id`) is indexed.

## 9. Test matrix for RLS (must pass in CI)

For **each table** and each actor (`anon`, outsider authenticated, cashier of shop A, owner of shop A, owner of shop B):

- SELECT returns only permitted rows
- INSERT/UPDATE/DELETE allowed or denied per the policy matrix
- Cross-shop reads and writes always fail
- Cashier cannot read `product_costs`, `sale_item_costs`, `ai_usage`, `audit_log`
- Ledger tables reject any direct write

## 10. Invariants checked by nightly job

1. `products.stock_qty = sum(stock_movements.qty_delta)` per product.
2. `customer balance = sum(customer_ledger.amount)`, and no negative balance unless the owner allowed overpayment.
3. `sales.total = sum(sale_items.qty * unit_price)`.
4. No orphan rows.
