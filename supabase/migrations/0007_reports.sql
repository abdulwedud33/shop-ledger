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
