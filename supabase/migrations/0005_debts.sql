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
