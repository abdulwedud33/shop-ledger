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
