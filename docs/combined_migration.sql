-- >>>>> supabase/migrations\0001_foundation.sql <<<<<
-- 0001_foundation.sql
-- Enums, shared helpers, locked-down default privileges, and the DB-level rate limiter.
-- Rules: docs/05-backend-schema.md, docs/security.md sections 5 and 7.

-- Default deny: new tables and functions in public are not usable by API roles
-- until a migration grants exactly what is needed.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

create type public.member_role     as enum ('owner', 'cashier');
create type public.stock_move_type as enum ('opening', 'purchase', 'sale', 'return', 'adjustment', 'damage', 'void_reversal');
create type public.ledger_type     as enum ('charge', 'payment', 'adjustment', 'void_reversal');
create type public.pay_method      as enum ('cash', 'mobile_money', 'bank', 'credit');
create type public.sale_status     as enum ('completed', 'voided');

-- Keeps updated_at honest.
create function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- Rate limit storage. No client access at all (RLS on, no policies, no grants).
create table public.rate_limits (
  key          text        not null,
  window_start timestamptz not null,
  hits         int         not null default 1,
  primary key (key, window_start)
);
alter table public.rate_limits enable row level security;

-- Fixed-window limiter used inside RPC functions and by Edge Functions (service role).
-- Raises the coded error RATE_LIMITED. A rejected call rolls back its own increment,
-- so the counter simply stays at the limit until the window ends.
create function public.rate_limit_hit(p_key text, p_max int, p_window_seconds int)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_start timestamptz;
  v_hits  int;
begin
  if p_key is null or p_max < 1 or p_window_seconds < 1 then
    raise exception 'VALIDATION' using errcode = '22023';
  end if;
  v_start := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  insert into public.rate_limits as r (key, window_start, hits)
  values (p_key, v_start, 1)
  on conflict (key, window_start) do update set hits = r.hits + 1
  returning r.hits into v_hits;
  if v_hits > p_max then
    raise exception 'RATE_LIMITED' using errcode = 'P0001';
  end if;
end $$;
revoke all on function public.rate_limit_hit(text, int, int) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, int, int) to service_role;

-- Old windows are removed by a scheduled job (see supabase/README or pg_cron).
create function public.purge_rate_limits() returns void
language sql security definer set search_path = '' as $$
  delete from public.rate_limits where window_start < now() - interval '2 days';
$$;
revoke all on function public.purge_rate_limits() from public, anon, authenticated;
grant execute on function public.purge_rate_limits() to service_role;

-- Blocks UPDATE and DELETE on append-only ledgers (defense in depth next to revoked privileges).
-- delete_shop() sets app.shop_deletion so a whole shop can be removed on account deletion.
create function public.block_ledger_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' and current_setting('app.shop_deletion', true) = 'on' then
    return old;
  end if;
  raise exception 'LEDGER_IMMUTABLE' using errcode = '42501';
end $$;


-- >>>>> supabase/migrations\0002_identity.sql <<<<<
-- 0002_identity.sql  (Milestone M1: auth, shops, roles)
-- profiles, shops, shop_members, shop_invites, audit_log, helpers, RLS, RPCs.

create table public.profiles (
  id         uuid primary key references auth.users on delete cascade,
  full_name  text check (char_length(full_name) <= 100),
  phone      text check (char_length(phone) <= 30),
  created_at timestamptz not null default now()
);

create table public.shops (
  id                   uuid primary key default gen_random_uuid(),
  owner_id             uuid not null references auth.users,
  name                 text not null check (char_length(name) between 1 and 80),
  currency             char(3) not null default 'ETB' check (currency ~ '^[A-Z]{3}$'),
  locale               text not null default 'en' check (locale in ('en', 'am', 'om')),
  timezone             text not null default 'Africa/Addis_Ababa',
  allow_negative_stock boolean not null default true,
  overdue_days         int not null default 30 check (overdue_days between 1 and 365),
  created_at           timestamptz not null default now()
);

create table public.shop_members (
  shop_id    uuid not null references public.shops on delete cascade,
  user_id    uuid not null references auth.users on delete cascade,
  role       public.member_role not null,
  created_at timestamptz not null default now(),
  primary key (shop_id, user_id)
);
create index shop_members_user_idx on public.shop_members (user_id);
create index shops_owner_idx on public.shops (owner_id);

create table public.shop_invites (
  id         uuid primary key default gen_random_uuid(),
  shop_id    uuid not null references public.shops on delete cascade,
  code_hash  bytea not null unique,
  role       public.member_role not null check (role = 'cashier'),
  expires_at timestamptz not null,
  created_by uuid not null references auth.users,
  used_at    timestamptz,
  used_by    uuid references auth.users,
  created_at timestamptz not null default now()
);
create index shop_invites_shop_idx on public.shop_invites (shop_id);

create table public.audit_log (
  id         bigint generated always as identity primary key,
  shop_id    uuid not null references public.shops on delete cascade,
  actor      uuid,
  action     text not null,
  entity     text,
  entity_id  uuid,
  meta       jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_shop_idx on public.audit_log (shop_id, created_at desc);

-- Helpers used by every policy. security definer so they can read shop_members without recursion.
create function public.is_member(p_shop uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.shop_members m
    where m.shop_id = p_shop and m.user_id = (select auth.uid())
  );
$$;

create function public.is_owner(p_shop uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.shop_members m
    where m.shop_id = p_shop and m.user_id = (select auth.uid()) and m.role = 'owner'
  );
$$;
revoke all on function public.is_member(uuid), public.is_owner(uuid) from public, anon;
grant execute on function public.is_member(uuid), public.is_owner(uuid) to authenticated;

-- Internal audit writer (not callable by API roles).
create function public.write_audit(p_shop uuid, p_action text, p_entity text, p_entity_id uuid, p_meta jsonb)
returns void
language sql security definer set search_path = '' as $$
  insert into public.audit_log (shop_id, actor, action, entity, entity_id, meta)
  values (p_shop, (select auth.uid()), p_action, p_entity, p_entity_id, p_meta);
$$;
revoke all on function public.write_audit(uuid, text, text, uuid, jsonb) from public, anon, authenticated;

-- ---------- RLS: enabled on every table in this migration ----------
alter table public.profiles     enable row level security;
alter table public.shops        enable row level security;
alter table public.shop_members enable row level security;
alter table public.shop_invites enable row level security;
alter table public.audit_log    enable row level security;

create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy profiles_insert on public.profiles for insert to authenticated
  with check (id = (select auth.uid()));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy shops_select on public.shops for select to authenticated
  using (public.is_member(id));
create policy shops_update on public.shops for update to authenticated
  using (public.is_owner(id)) with check (public.is_owner(id));

create policy members_select on public.shop_members for select to authenticated
  using (public.is_member(shop_id));
create policy members_delete on public.shop_members for delete to authenticated
  using (public.is_owner(shop_id) and role <> 'owner');

create policy invites_select on public.shop_invites for select to authenticated
  using (public.is_owner(shop_id));

create policy audit_select on public.audit_log for select to authenticated
  using (public.is_owner(shop_id));

-- ---------- Privileges: only what the policy matrix needs ----------
grant select on public.profiles to authenticated;
grant update (full_name, phone) on public.profiles to authenticated;
grant insert (id, full_name, phone) on public.profiles to authenticated;

grant select on public.shops to authenticated;
grant update (name, locale, timezone, allow_negative_stock, overdue_days) on public.shops to authenticated;

grant select, delete on public.shop_members to authenticated;
grant select (id, shop_id, role, expires_at, created_by, used_at, created_at) on public.shop_invites to authenticated;
grant select on public.audit_log to authenticated;

-- ---------- Triggers ----------
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, left(new.raw_user_meta_data ->> 'full_name', 100))
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Removing a member is an audited action.
create function public.audit_member_delete() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if current_setting('app.shop_deletion', true) = 'on' then return old; end if;  -- whole shop is being deleted
  perform public.write_audit(old.shop_id, 'member_removed', 'shop_member', null,
                             jsonb_build_object('user_id', old.user_id, 'role', old.role));
  return old;
end $$;
create trigger shop_members_audit_delete after delete on public.shop_members
  for each row execute function public.audit_member_delete();

-- ---------- RPC functions (security definer, role re-checked inside) ----------
create function public.create_shop(p_name text, p_currency text default 'ETB',
                                   p_locale text default 'en', p_timezone text default 'Africa/Addis_Ababa')
returns public.shops
language plpgsql security definer set search_path = '' as $$
declare
  v_uid  uuid := (select auth.uid());
  v_shop public.shops;
  v_name text := btrim(coalesce(p_name, ''));
begin
  if v_uid is null then raise exception 'SESSION_EXPIRED' using errcode = '42501'; end if;
  perform public.rate_limit_hit('create_shop:' || v_uid, 5, 3600);
  if char_length(v_name) not between 1 and 80
     or p_currency !~ '^[A-Z]{3}$'
     or p_locale not in ('en', 'am', 'om')
     or not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = p_timezone) then
    raise exception 'VALIDATION' using errcode = '22023';
  end if;
  insert into public.shops (owner_id, name, currency, locale, timezone)
  values (v_uid, v_name, p_currency, p_locale, p_timezone) returning * into v_shop;
  insert into public.shop_members (shop_id, user_id, role) values (v_shop.id, v_uid, 'owner');
  perform public.write_audit(v_shop.id, 'shop_created', 'shop', v_shop.id, null);
  return v_shop;
end $$;

-- Owner creates a single-use, expiring invite code for a cashier. Only the hash is stored.
create function public.create_invite(p_shop uuid, p_role public.member_role default 'cashier')
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_uid  uuid := (select auth.uid());
  v_code text;
begin
  if not public.is_owner(p_shop) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  perform public.rate_limit_hit('invite_create:' || v_uid, 10, 3600);
  if p_role <> 'cashier' then raise exception 'VALIDATION' using errcode = '22023'; end if;
  if (select count(*) from public.shop_invites i
      where i.shop_id = p_shop and i.used_at is null and i.expires_at > now()) >= 10 then
    raise exception 'LIMIT_EXCEEDED' using errcode = 'P0001';
  end if;
  v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16));
  insert into public.shop_invites (shop_id, code_hash, role, expires_at, created_by)
  values (p_shop, sha256(convert_to(v_code, 'UTF8')), p_role, now() + interval '48 hours', v_uid);
  perform public.write_audit(p_shop, 'invite_created', 'shop_invite', null, jsonb_build_object('role', p_role));
  return v_code;
end $$;

-- A signed-in user joins a shop with a code. Generic failure so codes cannot be probed.
create function public.accept_invite(p_code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_inv public.shop_invites;
  v_code text := upper(btrim(coalesce(p_code, '')));
begin
  if v_uid is null then raise exception 'SESSION_EXPIRED' using errcode = '42501'; end if;
  perform public.rate_limit_hit('invite_accept:' || v_uid, 10, 900);
  if v_code !~ '^[0-9A-F]{16}$' then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  select * into v_inv from public.shop_invites i
   where i.code_hash = sha256(convert_to(v_code, 'UTF8')) and i.used_at is null and i.expires_at > now()
   for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  insert into public.shop_members (shop_id, user_id, role)
  values (v_inv.shop_id, v_uid, v_inv.role) on conflict (shop_id, user_id) do nothing;
  update public.shop_invites set used_at = now(), used_by = v_uid where id = v_inv.id;
  perform public.write_audit(v_inv.shop_id, 'invite_accepted', 'shop_invite', v_inv.id, null);
  return v_inv.shop_id;
end $$;

-- Account deletion: owner removes the whole shop and everything in it.
create function public.delete_shop(p_shop uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_owner(p_shop) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  perform public.rate_limit_hit('delete_shop:' || (select auth.uid()), 3, 3600);
  perform set_config('app.shop_deletion', 'on', true);
  delete from public.shops where id = p_shop;
end $$;

revoke all on function public.create_shop(text, text, text, text),
                       public.create_invite(uuid, public.member_role),
                       public.accept_invite(text),
                       public.delete_shop(uuid) from public, anon;
grant execute on function public.create_shop(text, text, text, text),
                          public.create_invite(uuid, public.member_role),
                          public.accept_invite(text),
                          public.delete_shop(uuid) to authenticated;


-- >>>>> supabase/migrations\0003_catalog_stock.sql <<<<<
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


-- >>>>> supabase/migrations\0004_sales.sql <<<<<
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


-- >>>>> supabase/migrations\0005_debts.sql <<<<<
-- 0005_debts.sql  (Milestone M4: customers and debts)
-- Sign convention (mirrors src/domain/ledger.ts):
--   charge / positive adjustment: amount > 0  (customer owes more)
--   payment / void reversal:      amount < 0  (customer owes less)
--   balance = sum(amount)

create table public.customer_ledger (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid not null references public.shops on delete cascade,
  customer_id uuid not null references public.customers on delete cascade,
  type        public.ledger_type not null,
  amount      numeric(14,2) not null check (amount <> 0),
  method      public.pay_method,
  sale_id     uuid references public.sales on delete cascade,
  note        text check (char_length(note) <= 200),
  client_id   uuid,
  created_by  uuid not null references auth.users,
  created_at  timestamptz not null default now(),
  unique (shop_id, client_id, type)
);
create index customer_ledger_customer_idx on public.customer_ledger (shop_id, customer_id, created_at desc);
create index customer_ledger_sale_idx on public.customer_ledger (sale_id) where sale_id is not null;

alter table public.customer_ledger enable row level security;
create policy ledger_select on public.customer_ledger for select to authenticated using (public.is_member(shop_id));
grant select on public.customer_ledger to authenticated;

create trigger customer_ledger_immutable before update or delete on public.customer_ledger
  for each row execute function public.block_ledger_change();

-- Balance per customer. security_invoker keeps RLS in force.
create view public.customer_balances with (security_invoker = true) as
select shop_id, customer_id, sum(amount) as balance,
       min(created_at) filter (where type = 'charge') as first_charge_at
  from public.customer_ledger
 group by shop_id, customer_id;
grant select on public.customer_balances to authenticated;

-- Debts overview: balance and the age of the oldest still-open charge (FIFO: payments clear the
-- oldest charges first). Overdue is decided by the shop's overdue_days.
create function public.customer_debts(p_shop uuid)
returns table (
  customer_id    uuid,
  name           text,
  phone          text,
  balance        numeric,
  oldest_open_at timestamptz,
  days_open      int,
  is_overdue     boolean
)
language plpgsql stable security invoker set search_path = '' as $$
#variable_conflict use_column
declare
  v_overdue int;
begin
  if not public.is_member(p_shop) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  select s.overdue_days into v_overdue from public.shops s where s.id = p_shop;
  return query
  with l as (
    select x.customer_id, x.id, x.created_at, x.amount,
           sum(x.amount) filter (where x.amount > 0)
             over (partition by x.customer_id order by x.created_at, x.id
                   rows between unbounded preceding and current row) as cum_charges,
           coalesce(-sum(x.amount) filter (where x.amount < 0) over (partition by x.customer_id), 0) as credits
      from public.customer_ledger x
     where x.shop_id = p_shop
  ), open_charges as (
    select l.customer_id, l.created_at,
           greatest(0, least(l.amount, l.cum_charges - l.credits)) as open_amount
      from l where l.amount > 0
  ), agg as (
    select b.customer_id, sum(b.amount) as balance
      from public.customer_ledger b where b.shop_id = p_shop group by b.customer_id
  )
  select c.id, c.name, c.phone, a.balance,
         (select min(o.created_at) from open_charges o where o.customer_id = c.id and o.open_amount > 0),
         coalesce((select floor(extract(epoch from (now() - min(o.created_at))) / 86400)::int
                     from open_charges o where o.customer_id = c.id and o.open_amount > 0), 0),
         coalesce((select floor(extract(epoch from (now() - min(o.created_at))) / 86400)::int >= v_overdue
                     from open_charges o where o.customer_id = c.id and o.open_amount > 0), false)
    from agg a
    join public.customers c on c.id = a.customer_id
   where a.balance > 0
   order by a.balance desc;
end $$;

-- ---------- RPC: record a payment against a customer's balance ----------
create function public.record_payment(
  p_shop uuid, p_client_id uuid, p_customer uuid, p_amount numeric,
  p_method public.pay_method, p_note text default null
) returns public.customer_ledger
language plpgsql security definer set search_path = '' as $$
declare
  v_uid     uuid := (select auth.uid());
  v_row     public.customer_ledger;
  v_balance numeric(14,2);
begin
  if not public.is_member(p_shop) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  perform public.rate_limit_hit('rpc_write:' || v_uid, 120, 60);
  if p_client_id is null or p_amount is null or p_amount <= 0 or p_amount <> round(p_amount, 2)
     or p_method is null or p_method = 'credit'
     or (p_note is not null and char_length(p_note) > 200) then
    raise exception 'VALIDATION' using errcode = '22023';
  end if;

  select * into v_row from public.customer_ledger
   where shop_id = p_shop and client_id = p_client_id and type = 'payment';
  if found then return v_row; end if;                       -- idempotent replay

  perform 1 from public.customers where id = p_customer and shop_id = p_shop for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;

  select coalesce(sum(amount), 0) into v_balance
    from public.customer_ledger where shop_id = p_shop and customer_id = p_customer;
  if p_amount > v_balance then raise exception 'OVERPAYMENT' using errcode = 'P0001'; end if;

  insert into public.customer_ledger (shop_id, customer_id, type, amount, method, note, client_id, created_by)
  values (p_shop, p_customer, 'payment', -p_amount, p_method, nullif(btrim(p_note), ''), p_client_id, v_uid)
  returning * into v_row;
  return v_row;
end $$;

revoke all on function public.customer_debts(uuid),
                       public.record_payment(uuid, uuid, uuid, numeric, public.pay_method, text) from public, anon;
grant execute on function public.customer_debts(uuid),
                          public.record_payment(uuid, uuid, uuid, numeric, public.pay_method, text) to authenticated;


-- >>>>> supabase/migrations\0006_void_adjust.sql <<<<<
-- 0006_void_adjust.sql  (Milestone M6: void, adjust, audit)
-- Corrections never edit history: they append reversing rows.

-- Owner-only. Marks the sale voided, restores stock, and reverses the unpaid part of the debt.
-- Money already handed over at the counter is a cash matter outside the ledger (the audit log keeps the record).
create function public.void_sale(p_shop uuid, p_sale uuid, p_reason text) returns public.sales
language plpgsql security definer set search_path = '' as $$
declare
  v_uid    uuid := (select auth.uid());
  v_sale   public.sales;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_charge numeric(14,2);
begin
  if not public.is_owner(p_shop) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  perform public.rate_limit_hit('rpc_write:' || v_uid, 120, 60);
  if char_length(v_reason) not between 3 and 200 then raise exception 'VALIDATION' using errcode = '22023'; end if;

  select * into v_sale from public.sales where id = p_sale and shop_id = p_shop for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  if v_sale.status = 'voided' then return v_sale; end if;   -- idempotent

  update public.sales set status = 'voided', voided_at = now(), void_reason = v_reason where id = v_sale.id
  returning * into v_sale;

  insert into public.stock_movements (shop_id, product_id, type, qty_delta, sale_id, client_id, reason, created_by)
  select p_shop, i.product_id, 'void_reversal', i.qty, v_sale.id, v_sale.id, 'Sale voided', v_uid
    from public.sale_items i where i.sale_id = v_sale.id;

  select coalesce(sum(l.amount), 0) into v_charge
    from public.customer_ledger l where l.sale_id = v_sale.id and l.type = 'charge';
  if v_charge > 0 then
    insert into public.customer_ledger (shop_id, customer_id, type, amount, sale_id, note, client_id, created_by)
    values (p_shop, v_sale.customer_id, 'void_reversal', -v_charge, v_sale.id, 'Sale voided', v_sale.id, v_uid);
  end if;

  perform public.write_audit(p_shop, 'sale_voided', 'sale', v_sale.id,
    jsonb_build_object('reason', v_reason, 'total', v_sale.total, 'paid', v_sale.paid_amount, 'debt_reversed', v_charge));
  return v_sale;
end $$;

-- Owner-only stock correction (count fix or damage). Reason is required.
create function public.adjust_stock(
  p_shop uuid, p_client_id uuid, p_product uuid, p_qty_delta numeric, p_reason text,
  p_type public.stock_move_type default 'adjustment'
) returns public.stock_movements
language plpgsql security definer set search_path = '' as $$
declare
  v_uid    uuid := (select auth.uid());
  v_mov    public.stock_movements;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if not public.is_owner(p_shop) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  perform public.rate_limit_hit('rpc_write:' || v_uid, 120, 60);
  if p_client_id is null or p_qty_delta is null or p_qty_delta = 0
     or abs(p_qty_delta) > 999999 or p_qty_delta <> round(p_qty_delta, 3)
     or p_type not in ('adjustment', 'damage')
     or char_length(v_reason) not between 3 and 200
     or (p_type = 'damage' and p_qty_delta > 0) then
    raise exception 'VALIDATION' using errcode = '22023';
  end if;

  select * into v_mov from public.stock_movements
   where shop_id = p_shop and client_id = p_client_id and product_id = p_product and type = p_type;
  if found then return v_mov; end if;                       -- idempotent

  perform 1 from public.products where id = p_product and shop_id = p_shop for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;

  insert into public.stock_movements (shop_id, product_id, type, qty_delta, reason, client_id, created_by)
  values (p_shop, p_product, p_type, p_qty_delta, v_reason, p_client_id, v_uid) returning * into v_mov;

  perform public.write_audit(p_shop, 'stock_adjusted', 'product', p_product,
    jsonb_build_object('qty_delta', p_qty_delta, 'type', p_type, 'reason', v_reason));
  return v_mov;
end $$;

revoke all on function public.void_sale(uuid, uuid, text),
                       public.adjust_stock(uuid, uuid, uuid, numeric, text, public.stock_move_type) from public, anon;
grant execute on function public.void_sale(uuid, uuid, text),
                          public.adjust_stock(uuid, uuid, uuid, numeric, text, public.stock_move_type) to authenticated;


-- >>>>> supabase/migrations\0007_reports.sql <<<<<
-- 0007_reports.sql  (Milestone M7: dashboard and reports)
-- Report numbers are computed from ledger rows only, so they always reconcile with the raw data.
-- Profit fields are null for cashiers. The window is [p_from, p_to) and may span at most 366 days.

create function public.dashboard_summary(p_shop uuid, p_from timestamptz, p_to timestamptz) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid       uuid := (select auth.uid());
  v_owner     boolean;
  v_sales     numeric(14,2);
  v_count     int;
  v_paid_now  numeric(14,2);
  v_credit    numeric(14,2);
  v_collected numeric(14,2);
  v_profit    numeric(14,2);
  v_low       int;
  v_owed      numeric(14,2);
begin
  if not public.is_member(p_shop) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  perform public.rate_limit_hit('report:' || v_uid, 30, 60);
  if p_from is null or p_to is null or p_to <= p_from or p_to - p_from > interval '366 days' then
    raise exception 'VALIDATION' using errcode = '22023';
  end if;
  v_owner := public.is_owner(p_shop);

  select coalesce(sum(total), 0), count(*), coalesce(sum(paid_amount), 0), coalesce(sum(total - paid_amount), 0)
    into v_sales, v_count, v_paid_now, v_credit
    from public.sales
   where shop_id = p_shop and status = 'completed' and created_at >= p_from and created_at < p_to;

  select coalesce(-sum(amount), 0) into v_collected
    from public.customer_ledger
   where shop_id = p_shop and type = 'payment' and created_at >= p_from and created_at < p_to;

  if v_owner then
    select coalesce(sum(round(i.qty * (i.unit_price - c.unit_cost), 2)), 0) into v_profit
      from public.sales s
      join public.sale_items i on i.sale_id = s.id
      join public.sale_item_costs c on c.sale_item_id = i.id
     where s.shop_id = p_shop and s.status = 'completed' and s.created_at >= p_from and s.created_at < p_to;
  end if;

  select count(*) into v_low from public.products
   where shop_id = p_shop and archived_at is null and stock_qty <= reorder_level;

  select coalesce(sum(amount), 0) into v_owed from public.customer_ledger where shop_id = p_shop;

  return jsonb_build_object(
    'sales_total', v_sales,
    'sales_count', v_count,
    'paid_now', v_paid_now,
    'credit_given', v_credit,
    'debt_collected', v_collected,
    'cash_in', v_paid_now + v_collected,
    'profit', v_profit,                -- null for cashiers
    'low_stock_count', v_low,
    'total_owed', v_owed
  );
end $$;

create function public.top_products(p_shop uuid, p_from timestamptz, p_to timestamptz, p_limit int default 5)
returns table (product_id uuid, name text, unit text, qty numeric, revenue numeric)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not public.is_member(p_shop) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  perform public.rate_limit_hit('report:' || (select auth.uid()), 30, 60);
  if p_from is null or p_to is null or p_to <= p_from or p_to - p_from > interval '366 days'
     or p_limit not between 1 and 20 then
    raise exception 'VALIDATION' using errcode = '22023';
  end if;
  return query
  select p.id, p.name, p.unit, sum(i.qty)::numeric, sum(round(i.qty * i.unit_price, 2))::numeric
    from public.sales s
    join public.sale_items i on i.sale_id = s.id
    join public.products p on p.id = i.product_id
   where s.shop_id = p_shop and s.status = 'completed' and s.created_at >= p_from and s.created_at < p_to
   group by p.id, p.name, p.unit
   order by sum(round(i.qty * i.unit_price, 2)) desc
   limit p_limit;
end $$;

-- Daily totals for charts. Days are cut in the shop's timezone.
create function public.sales_trend(p_shop uuid, p_from timestamptz, p_to timestamptz)
returns table (day date, sales_total numeric, sales_count int)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_tz text;
begin
  if not public.is_member(p_shop) then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  perform public.rate_limit_hit('report:' || (select auth.uid()), 30, 60);
  if p_from is null or p_to is null or p_to <= p_from or p_to - p_from > interval '92 days' then
    raise exception 'VALIDATION' using errcode = '22023';
  end if;
  select s.timezone into v_tz from public.shops s where s.id = p_shop;
  return query
  select (s.created_at at time zone v_tz)::date, sum(s.total)::numeric, count(*)::int
    from public.sales s
   where s.shop_id = p_shop and s.status = 'completed' and s.created_at >= p_from and s.created_at < p_to
   group by 1 order by 1;
end $$;

revoke all on function public.dashboard_summary(uuid, timestamptz, timestamptz),
                       public.top_products(uuid, timestamptz, timestamptz, int),
                       public.sales_trend(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.dashboard_summary(uuid, timestamptz, timestamptz),
                          public.top_products(uuid, timestamptz, timestamptz, int),
                          public.sales_trend(uuid, timestamptz, timestamptz) to authenticated;


-- >>>>> supabase/migrations\0008_ai_support.sql <<<<<
-- 0008_ai_support.sql  (Milestone M8: AI assistant support tables)
-- See docs/memory.md and docs/guardrails.md. The AI never writes business data; it only
-- reads through the caller's JWT and may suggest memory items that a human confirms.

create table public.shop_memory (
  id         uuid primary key default gen_random_uuid(),
  shop_id    uuid not null references public.shops on delete cascade,
  kind       text not null check (kind in ('alias', 'preference', 'fact')),
  key        text not null check (char_length(key) between 1 and 80),
  value      text not null check (char_length(value) between 1 and 300),
  created_by uuid references auth.users,
  created_at timestamptz not null default now(),
  unique (shop_id, kind, key)
);
create index shop_memory_shop_idx on public.shop_memory (shop_id);

create table public.ai_usage (
  id            bigint generated always as identity primary key,
  shop_id       uuid not null references public.shops on delete cascade,
  user_id       uuid,
  agent         text not null check (agent in ('entry_parser', 'insights', 'reminder')),
  input_tokens  int,
  output_tokens int,
  ok            boolean,
  created_at    timestamptz not null default now()
);
create index ai_usage_shop_idx on public.ai_usage (shop_id, created_at desc);

alter table public.shop_memory enable row level security;
alter table public.ai_usage    enable row level security;

create policy memory_select on public.shop_memory for select to authenticated using (public.is_member(shop_id));
create policy memory_insert on public.shop_memory for insert to authenticated with check (public.is_member(shop_id));
create policy memory_update on public.shop_memory for update to authenticated
  using (public.is_member(shop_id)) with check (public.is_member(shop_id));
create policy memory_delete on public.shop_memory for delete to authenticated using (public.is_member(shop_id));

-- Owners can read usage; only the service role (Edge Functions) writes it.
create policy ai_usage_select on public.ai_usage for select to authenticated using (public.is_owner(shop_id));

grant select, delete on public.shop_memory to authenticated;
grant insert (shop_id, kind, key, value, created_by) on public.shop_memory to authenticated;
grant update (value) on public.shop_memory to authenticated;
grant select on public.ai_usage to authenticated;

-- 200 items per shop, and every change is audited.
create function public.shop_memory_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if (select count(*) from public.shop_memory m where m.shop_id = new.shop_id) >= 200 then
      raise exception 'LIMIT_EXCEEDED' using errcode = 'P0001';
    end if;
    new.created_by := (select auth.uid());
    perform public.write_audit(new.shop_id, 'memory_created', 'shop_memory', new.id, jsonb_build_object('kind', new.kind));
    return new;
  elsif tg_op = 'UPDATE' then
    perform public.write_audit(new.shop_id, 'memory_edited', 'shop_memory', new.id, jsonb_build_object('kind', new.kind));
    return new;
  end if;
  if current_setting('app.shop_deletion', true) = 'on' then return old; end if;  -- whole shop is being deleted
  perform public.write_audit(old.shop_id, 'memory_deleted', 'shop_memory', old.id, jsonb_build_object('kind', old.kind));
  return old;
end $$;
create trigger shop_memory_guard_ins_upd before insert or update on public.shop_memory
  for each row execute function public.shop_memory_guard();
create trigger shop_memory_audit_del after delete on public.shop_memory
  for each row execute function public.shop_memory_guard();


-- >>>>> supabase/migrations\0009_lockdown.sql <<<<<
-- 0009_lockdown.sql  (Milestone M9: hardening)
-- Belt and braces: the anonymous role must never touch application data, whatever the
-- platform's default privileges were when the tables were created.
revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from anon;

-- Service role keeps full access for scheduled jobs and Edge Functions.
grant all on all tables    in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;


