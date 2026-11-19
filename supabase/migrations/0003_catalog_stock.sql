-- 0003_catalog_stock.sql  (Milestone M2: products and stock)

create table public.categories (
  id      uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops on delete cascade,
  name    text not null check (char_length(name) between 1 and 60),
  unique (shop_id, name)
);

create table public.products (
  id            uuid primary key default gen_random_uuid(),
  shop_id       uuid not null references public.shops on delete cascade,
  category_id   uuid references public.categories on delete set null,
  name          text not null check (char_length(name) between 1 and 120),
  unit          text not null default 'pcs' check (char_length(unit) between 1 and 20),
  barcode       text check (char_length(barcode) <= 64),
  sell_price    numeric(14,2) not null check (sell_price >= 0),
  stock_qty     numeric(12,3) not null default 0,        -- maintained ONLY by the stock_movements trigger
  reorder_level numeric(12,3) not null default 0 check (reorder_level >= 0),
  archived_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index products_shop_name_idx on public.products (shop_id, archived_at, name);
create index products_low_stock_idx on public.products (shop_id) where stock_qty <= reorder_level and archived_at is null;
create unique index products_barcode_uidx on public.products (shop_id, barcode) where barcode is not null and archived_at is null;
create index products_category_idx on public.products (category_id);

-- OWNER ONLY: cashiers can never read cost prices.
create table public.product_costs (
  product_id uuid primary key references public.products on delete cascade,
  shop_id    uuid not null references public.shops on delete cascade,
  cost_price numeric(14,2) not null check (cost_price >= 0)
);
create index product_costs_shop_idx on public.product_costs (shop_id);

-- Append-only stock ledger. sale_id gets its foreign key in 0004 when sales exists.
create table public.stock_movements (
  id         uuid primary key default gen_random_uuid(),
  shop_id    uuid not null references public.shops on delete cascade,
  product_id uuid not null references public.products on delete cascade,
  type       public.stock_move_type not null,
  qty_delta  numeric(12,3) not null check (qty_delta <> 0),
  sale_id    uuid,
  reason     text check (char_length(reason) <= 200),
  client_id  uuid,
  created_by uuid not null references auth.users,
  created_at timestamptz not null default now(),
  unique (shop_id, client_id, product_id, type)
);
create index stock_movements_product_idx on public.stock_movements (shop_id, product_id, created_at desc);
create index stock_movements_sale_idx on public.stock_movements (sale_id) where sale_id is not null;

alter table public.categories      enable row level security;
alter table public.products        enable row level security;
alter table public.product_costs   enable row level security;
alter table public.stock_movements enable row level security;

create policy categories_select on public.categories for select to authenticated using (public.is_member(shop_id));
create policy categories_insert on public.categories for insert to authenticated with check (public.is_member(shop_id));
create policy categories_update on public.categories for update to authenticated
  using (public.is_owner(shop_id)) with check (public.is_owner(shop_id));

create policy products_select on public.products for select to authenticated using (public.is_member(shop_id));
create policy products_insert on public.products for insert to authenticated with check (public.is_owner(shop_id));
create policy products_update on public.products for update to authenticated
  using (public.is_owner(shop_id)) with check (public.is_owner(shop_id));

create policy costs_owner on public.product_costs for all to authenticated
  using (public.is_owner(shop_id)) with check (public.is_owner(shop_id));

create policy stock_select on public.stock_movements for select to authenticated using (public.is_member(shop_id));

-- Privileges. stock_qty is never writable by clients; ledgers have no client writes.
grant select on public.categories, public.products, public.stock_movements to authenticated;
grant insert (shop_id, name) on public.categories to authenticated;
grant update (name) on public.categories to authenticated;
grant insert (shop_id, category_id, name, unit, barcode, sell_price, reorder_level) on public.products to authenticated;
grant update (category_id, name, unit, barcode, sell_price, reorder_level, archived_at) on public.products to authenticated;
grant select, insert, update on public.product_costs to authenticated;

create trigger products_updated_at before update on public.products
  for each row execute function public.set_updated_at();

-- The ONLY code that writes products.stock_qty.
create function public.apply_stock_movement() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.products set stock_qty = stock_qty + new.qty_delta where id = new.product_id;
  return new;
end $$;
create trigger stock_movements_apply after insert on public.stock_movements
  for each row execute function public.apply_stock_movement();

create trigger stock_movements_immutable before update or delete on public.stock_movements
  for each row execute function public.block_ledger_change();

-- Price changes are audited.
create function public.audit_product_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.sell_price is distinct from old.sell_price then
    perform public.write_audit(new.shop_id, 'price_changed', 'product', new.id,
      jsonb_build_object('old', old.sell_price, 'new', new.sell_price));
  end if;
  return new;
end $$;
create trigger products_audit after update on public.products
  for each row execute function public.audit_product_change();

-- ---------- RPC: create a product atomically (with optional cost and opening stock) ----------
-- p_id is a client-generated UUID, so a retry after a dropped connection cannot create a duplicate.
create function public.create_product(
  p_shop uuid, p_id uuid, p_name text, p_unit text, p_sell_price numeric,
  p_cost_price numeric default null, p_opening_qty numeric default 0,
  p_reorder_level numeric default 0, p_barcode text default null, p_category uuid default null
) returns public.products
language plpgsql security definer set search_path = '' as $$
declare
  v_uid  uuid := (select auth.uid());
  v_prod public.products;
  v_name text := btrim(coalesce(p_name, ''));
begin
  if not public.is_owner(p_shop) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  perform public.rate_limit_hit('rpc_write:' || v_uid, 120, 60);
  if p_id is null
     or char_length(v_name) not between 1 and 120
     or char_length(btrim(coalesce(p_unit, ''))) not between 1 and 20
     or p_sell_price is null or p_sell_price < 0 or p_sell_price <> round(p_sell_price, 2)
     or (p_cost_price is not null and (p_cost_price < 0 or p_cost_price <> round(p_cost_price, 2)))
     or p_opening_qty is null or p_opening_qty < 0 or p_opening_qty <> round(p_opening_qty, 3) or p_opening_qty > 999999
     or p_reorder_level is null or p_reorder_level < 0 or p_reorder_level <> round(p_reorder_level, 3) then
    raise exception 'VALIDATION' using errcode = '22023';
  end if;
  if p_category is not null and not exists (select 1 from public.categories c where c.id = p_category and c.shop_id = p_shop) then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;

  select * into v_prod from public.products where id = p_id;
  if found then
    if v_prod.shop_id <> p_shop then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
    return v_prod;                                          -- idempotent replay
  end if;

  insert into public.products (id, shop_id, category_id, name, unit, barcode, sell_price, reorder_level)
  values (p_id, p_shop, p_category, v_name, btrim(p_unit), nullif(btrim(p_barcode), ''), p_sell_price, p_reorder_level);
  if p_cost_price is not null then
    insert into public.product_costs (product_id, shop_id, cost_price) values (p_id, p_shop, p_cost_price);
  end if;
  if p_opening_qty > 0 then
    insert into public.stock_movements (shop_id, product_id, type, qty_delta, client_id, created_by)
    values (p_shop, p_id, 'opening', p_opening_qty, p_id, v_uid);
  end if;
  select * into v_prod from public.products where id = p_id;
  return v_prod;
end $$;

-- ---------- RPC: record stock bought (restock) ----------
create function public.record_stock_in(
  p_shop uuid, p_client_id uuid, p_product uuid, p_qty numeric, p_unit_cost numeric default null
) returns public.stock_movements
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_mov public.stock_movements;
begin
  if not public.is_member(p_shop) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  perform public.rate_limit_hit('rpc_write:' || v_uid, 120, 60);
  if p_client_id is null or p_qty is null or p_qty <= 0 or p_qty > 999999 or p_qty <> round(p_qty, 3)
     or (p_unit_cost is not null and (p_unit_cost < 0 or p_unit_cost <> round(p_unit_cost, 2))) then
    raise exception 'VALIDATION' using errcode = '22023';
  end if;
  if p_unit_cost is not null and not public.is_owner(p_shop) then
    raise exception 'FORBIDDEN' using errcode = '42501';     -- only the owner records cost prices
  end if;

  select * into v_mov from public.stock_movements
   where shop_id = p_shop and client_id = p_client_id and product_id = p_product and type = 'purchase';
  if found then return v_mov; end if;                        -- idempotent replay

  perform 1 from public.products where id = p_product and shop_id = p_shop and archived_at is null for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;

  insert into public.stock_movements (shop_id, product_id, type, qty_delta, client_id, created_by)
  values (p_shop, p_product, 'purchase', p_qty, p_client_id, v_uid) returning * into v_mov;
  if p_unit_cost is not null then
    insert into public.product_costs (product_id, shop_id, cost_price) values (p_product, p_shop, p_unit_cost)
    on conflict (product_id) do update set cost_price = excluded.cost_price;
  end if;
  return v_mov;
end $$;

revoke all on function public.create_product(uuid, uuid, text, text, numeric, numeric, numeric, numeric, text, uuid),
                       public.record_stock_in(uuid, uuid, uuid, numeric, numeric) from public, anon;
grant execute on function public.create_product(uuid, uuid, text, text, numeric, numeric, numeric, numeric, text, uuid),
                          public.record_stock_in(uuid, uuid, uuid, numeric, numeric) to authenticated;
