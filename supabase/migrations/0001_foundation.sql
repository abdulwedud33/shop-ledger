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
