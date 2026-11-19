-- 0004_sales.sql  (Milestone M3: sales)
-- Customers are created here because sales reference them. The customer ledger arrives in 0005.

create table public.customers (
  id           uuid primary key default gen_random_uuid(),
  shop_id      uuid not null references public.shops on delete cascade,
  name         text not null check (char_length(name) between 1 and 100),
  phone        text check (char_length(phone) <= 30),
  notes        text check (char_length(notes) <= 500),
  credit_limit numeric(14,2) check (credit_limit >= 0),
  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index customers_shop_name_idx on public.customers (shop_id, name text_pattern_ops);

create table public.sales (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid not null references public.shops on delete cascade,
  client_id   uuid not null,                              -- idempotency key from the device
  customer_id uuid references public.customers on delete set null,
  total       numeric(14,2) not null check (total >= 0),
  paid_amount numeric(14,2) not null check (paid_amount >= 0),
  method      public.pay_method not null,
  status      public.sale_status not null default 'completed',
  voided_at   timestamptz,
  void_reason text check (char_length(void_reason) <= 200),
  created_by  uuid not null references auth.users,
  created_at  timestamptz not null default now(),
  unique (shop_id, client_id),
  check (paid_amount <= total)
);
create index sales_shop_created_idx on public.sales (shop_id, created_at desc);
create index sales_customer_idx on public.sales (shop_id, customer_id, created_at desc);

create table public.sale_items (
  id         uuid primary key default gen_random_uuid(),
  sale_id    uuid not null references public.sales on delete cascade,
  shop_id    uuid not null references public.shops on delete cascade,
  product_id uuid not null references public.products on delete cascade,
  qty        numeric(12,3) not null check (qty > 0),
  unit_price numeric(14,2) not null check (unit_price >= 0)
);
create index sale_items_sale_idx on public.sale_items (sale_id);
create index sale_items_shop_idx on public.sale_items (shop_id, product_id);

-- OWNER ONLY: cost snapshot at time of sale, used for profit.
create table public.sale_item_costs (
  sale_item_id uuid primary key references public.sale_items on delete cascade,
  shop_id      uuid not null references public.shops on delete cascade,
  unit_cost    numeric(14,2) not null check (unit_cost >= 0)
);
create index sale_item_costs_shop_idx on public.sale_item_costs (shop_id);

alter table public.stock_movements
  add constraint stock_movements_sale_fk foreign key (sale_id) references public.sales on delete cascade;

alter table public.customers       enable row level security;
alter table public.sales           enable row level security;
alter table public.sale_items      enable row level security;
alter table public.sale_item_costs enable row level security;

create policy customers_select on public.customers for select to authenticated using (public.is_member(shop_id));
create policy customers_insert on public.customers for insert to authenticated with check (public.is_member(shop_id));
create policy customers_update on public.customers for update to authenticated
  using (public.is_member(shop_id)) with check (public.is_member(shop_id));

create policy sales_select on public.sales for select to authenticated using (public.is_member(shop_id));
create policy sale_items_select on public.sale_items for select to authenticated using (public.is_member(shop_id));
create policy sale_item_costs_select on public.sale_item_costs for select to authenticated using (public.is_owner(shop_id));

grant select on public.customers, public.sales, public.sale_items, public.sale_item_costs to authenticated;
grant insert (id, shop_id, name, phone, notes, credit_limit) on public.customers to authenticated;
grant update (name, phone, notes, credit_limit, archived_at) on public.customers to authenticated;

create trigger customers_updated_at before update on public.customers
  for each row execute function public.set_updated_at();

-- sale_items and sale_item_costs are immutable. sales may only move completed -> voided.
create trigger sale_items_immutable before update or delete on public.sale_items
  for each row execute function public.block_ledger_change();
create trigger sale_item_costs_immutable before update or delete on public.sale_item_costs
  for each row execute function public.block_ledger_change();

create function public.guard_sales_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if current_setting('app.shop_deletion', true) = 'on' then return old; end if;
    raise exception 'LEDGER_IMMUTABLE' using errcode = '42501';
  end if;
  if old.status = 'completed' and new.status = 'voided'
     and new.id = old.id and new.shop_id = old.shop_id and new.client_id = old.client_id
     and new.customer_id is not distinct from old.customer_id
     and new.total = old.total and new.paid_amount = old.paid_amount and new.method = old.method
     and new.created_by = old.created_by and new.created_at = old.created_at then
    return new;
  end if;
  raise exception 'LEDGER_IMMUTABLE' using errcode = '42501';
end $$;
create trigger sales_guard before update or delete on public.sales
  for each row execute function public.guard_sales_change();

-- ---------- RPC: record a sale in one transaction ----------
-- p_items: [{ "product_id": uuid, "qty": number, "unit_price": number? }]
-- The server recomputes every total. A cashier's unit_price must equal the current price
-- (otherwise PRICE_CHANGED); the owner may override prices.
create function public.record_sale(
  p_shop uuid, p_client_id uuid, p_customer uuid, p_items jsonb,
  p_paid numeric, p_method public.pay_method
) returns public.sales
language plpgsql security definer set search_path = '' as $$
declare
  v_uid      uuid := (select auth.uid());
  v_owner    boolean;
  v_shop     public.shops;
  v_sale     public.sales;
  v_item     record;
  v_prod     public.products;
  v_price    numeric(14,2);
  v_total    numeric(14,2) := 0;
  v_seen     uuid[] := '{}';
  v_credit   numeric(14,2);
  v_method   public.pay_method;
  v_cust     public.customers;
  v_balance  numeric(14,2);
  v_item_id  uuid;
  v_cost     numeric(14,2);
begin
  if not public.is_member(p_shop) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  perform public.rate_limit_hit('rpc_write:' || v_uid, 120, 60);

  -- Idempotent replay: same client_id returns the stored sale untouched.
  select * into v_sale from public.sales where shop_id = p_shop and client_id = p_client_id;
  if found then return v_sale; end if;

  if p_client_id is null or p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) not between 1 and 100
     or p_paid is null or p_paid < 0 or p_paid <> round(p_paid, 2) or p_method is null then
    raise exception 'VALIDATION' using errcode = '22023';
  end if;

  v_owner := public.is_owner(p_shop);
  select * into v_shop from public.shops where id = p_shop;

  -- Pass 1: validate, lock products in id order (no deadlocks), compute the total.
  begin
    for v_item in
      select (e ->> 'product_id')::uuid as product_id,
             (e ->> 'qty')::numeric      as qty,
             (e ->> 'unit_price')::numeric as unit_price
        from jsonb_array_elements(p_items) e
       order by 1
    loop
      if v_item.product_id is null or v_item.product_id = any (v_seen) then
        raise exception 'VALIDATION' using errcode = '22023';
      end if;
      v_seen := v_seen || v_item.product_id;
      if v_item.qty is null or v_item.qty <= 0 or v_item.qty > 999999 or v_item.qty <> round(v_item.qty, 3) then
        raise exception 'VALIDATION' using errcode = '22023';
      end if;

      select * into v_prod from public.products
       where id = v_item.product_id and shop_id = p_shop and archived_at is null for update;
      if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;

      v_price := coalesce(v_item.unit_price, v_prod.sell_price);
      if v_price < 0 or v_price <> round(v_price, 2) then raise exception 'VALIDATION' using errcode = '22023'; end if;
      if v_price <> v_prod.sell_price and not v_owner then raise exception 'PRICE_CHANGED' using errcode = 'P0001'; end if;
      if not v_shop.allow_negative_stock and v_prod.stock_qty - v_item.qty < 0 then
        raise exception 'STOCK_LOW' using errcode = 'P0001';
      end if;
      v_total := v_total + round(v_price * v_item.qty, 2);
    end loop;
  exception
    when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'VALIDATION' using errcode = '22023';
  end;

  if v_total <= 0 then raise exception 'VALIDATION' using errcode = '22023'; end if;
  if p_paid > v_total then raise exception 'OVERPAYMENT' using errcode = 'P0001'; end if;
  v_credit := v_total - p_paid;
  if p_method = 'credit' and p_paid > 0 then raise exception 'VALIDATION' using errcode = '22023'; end if;
  v_method := case when p_paid = 0 then 'credit'::public.pay_method else p_method end;

  if p_customer is not null then
    select * into v_cust from public.customers where id = p_customer and shop_id = p_shop and archived_at is null for update;
    if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  end if;
  if v_credit > 0 then
    if p_customer is null then raise exception 'CUSTOMER_REQUIRED' using errcode = 'P0001'; end if;
    if v_cust.credit_limit is not null then
      select coalesce(sum(l.amount), 0) into v_balance
        from public.customer_ledger l where l.shop_id = p_shop and l.customer_id = p_customer;
      if v_balance + v_credit > v_cust.credit_limit then raise exception 'LIMIT_EXCEEDED' using errcode = 'P0001'; end if;
    end if;
  end if;

  insert into public.sales (shop_id, client_id, customer_id, total, paid_amount, method, created_by)
  values (p_shop, p_client_id, p_customer, v_total, p_paid, v_method, v_uid)
  on conflict (shop_id, client_id) do nothing
  returning * into v_sale;
  if not found then
    select * into v_sale from public.sales where shop_id = p_shop and client_id = p_client_id;
    return v_sale;                                          -- lost a race with an identical replay
  end if;

  -- Pass 2: items, cost snapshots, stock movements.
  for v_item in
    select (e ->> 'product_id')::uuid as product_id,
           (e ->> 'qty')::numeric      as qty,
           (e ->> 'unit_price')::numeric as unit_price
      from jsonb_array_elements(p_items) e
     order by 1
  loop
    select * into v_prod from public.products where id = v_item.product_id;
    v_price := coalesce(v_item.unit_price, v_prod.sell_price);
    insert into public.sale_items (sale_id, shop_id, product_id, qty, unit_price)
    values (v_sale.id, p_shop, v_item.product_id, v_item.qty, v_price) returning id into v_item_id;

    select c.cost_price into v_cost from public.product_costs c where c.product_id = v_item.product_id;
    insert into public.sale_item_costs (sale_item_id, shop_id, unit_cost) values (v_item_id, p_shop, coalesce(v_cost, 0));

    insert into public.stock_movements (shop_id, product_id, type, qty_delta, sale_id, client_id, created_by)
    values (p_shop, v_item.product_id, 'sale', -v_item.qty, v_sale.id, p_client_id, v_uid);
  end loop;

  if v_credit > 0 then
    insert into public.customer_ledger (shop_id, customer_id, type, amount, sale_id, client_id, created_by)
    values (p_shop, p_customer, 'charge', v_credit, v_sale.id, p_client_id, v_uid);
  end if;
  return v_sale;
end $$;

revoke all on function public.record_sale(uuid, uuid, uuid, jsonb, numeric, public.pay_method) from public, anon;
grant execute on function public.record_sale(uuid, uuid, uuid, jsonb, numeric, public.pay_method) to authenticated;
