#!/usr/bin/env python3
"""Generates supabase/tests/001_rls_and_rules.test.sql (pgTAP). Run: python3 scripts/gen-pgtap.py"""
OA, CA, OB, OUT = ['00000000-0000-0000-0000-0000000000' + x for x in ('a1', 'a2', 'b1', 'c1')]
SA, SB = '10000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-0000000000b1'
PA1, PA2, PA3, PB1 = ['20000000-0000-0000-0000-0000000000' + x for x in ('a1', 'a2', 'a3', 'b1')]
CU1, CU2, CUB = ['30000000-0000-0000-0000-0000000000' + x for x in ('a1', 'a2', 'b1')]
def cid(n): return '40000000-0000-0000-0000-%012d' % n

out, n = [], 0
def raw(s): out.append(s.rstrip(';') + ';')
def t(s):
    global n; n += 1; out.append(s.rstrip(';') + ';')
def as_user(u):
    raw('reset role')
    raw(f"do $$ begin perform set_config('request.jwt.claims', '{{\"sub\":\"{u}\",\"role\":\"authenticated\"}}', true); perform set_config('request.jwt.claim.sub', '{u}', true); end $$")
    raw('set local role authenticated')
def as_anon():
    raw('reset role')
    raw("do $$ begin perform set_config('request.jwt.claims', '{\"role\":\"anon\"}', true); perform set_config('request.jwt.claim.sub', '', true); end $$")
    raw('set local role anon')
def as_pg(): raw('reset role')
def throws(sql, code, msg, desc):
    m = 'null' if msg is None else f"'{msg}'"
    t(f"select throws_ok($${sql}$$, '{code}', {m}, '{desc}')")
def eq(expr, val, desc): t(f"select is(({expr}), {val}, '{desc}')")
EMPTY = "'[]'::jsonb"
def items(*xs): return "'" + str(list(xs)).replace("'", '"') + "'::jsonb"
def sale(shop, c, cust, its, paid, method):
    cu = f"'{cust}'::uuid" if cust else 'null::uuid'
    return f"public.record_sale('{shop}', '{cid(c)}', {cu}, {its}, {paid}, '{method}')"
def it(p, q, price=None):
    d = {'product_id': p, 'qty': q}
    if price is not None: d['unit_price'] = price
    return d

raw('begin')
raw('select plan(__PLAN__)')
raw(f"insert into auth.users (id, aud, role, email) values ('{OA}','authenticated','authenticated','owner-a@test.dev'),('{CA}','authenticated','authenticated','cashier-a@test.dev'),('{OB}','authenticated','authenticated','owner-b@test.dev'),('{OUT}','authenticated','authenticated','outsider@test.dev')")
raw(f"insert into public.shops (id, owner_id, name) values ('{SA}','{OA}','Shop A'),('{SB}','{OB}','Shop B')")
raw(f"insert into public.shop_members (shop_id, user_id, role) values ('{SA}','{OA}','owner'),('{SA}','{CA}','cashier'),('{SB}','{OB}','owner')")
raw(f"insert into public.products (id, shop_id, name, unit, sell_price) values ('{PA1}','{SA}','Sugar','kg',50.00),('{PA2}','{SA}','Oil','l',120.00),('{PB1}','{SB}','Rice','kg',80.00)")
raw(f"insert into public.product_costs (product_id, shop_id, cost_price) values ('{PA1}','{SA}',30.00),('{PA2}','{SA}',90.00)")
raw(f"insert into public.customers (id, shop_id, name, credit_limit) values ('{CU1}','{SA}','Abel',500.00),('{CU2}','{SA}','Chaltu',null),('{CUB}','{SB}','Bekele',null)")
raw(f"insert into public.stock_movements (shop_id, product_id, type, qty_delta, created_by) values ('{SA}','{PA1}','opening',100,'{OA}'),('{SA}','{PA2}','opening',50,'{OA}'),('{SB}','{PB1}','opening',10,'{OB}')")
raw(f"insert into public.ai_usage (shop_id, user_id, agent, ok) values ('{SA}','{OA}','insights',true)")
raw("create temp table ctx (k text primary key, v text)")
raw("grant all on ctx to public")

TABLES = ['profiles','shops','shop_members','shop_invites','audit_log','categories','products','product_costs','stock_movements',
          'customers','sales','sale_items','sale_item_costs','customer_ledger','shop_memory','ai_usage','rate_limits']

# ---- structure ----
as_pg()
eq("select count(*)::int from pg_tables where schemaname = 'public' and not rowsecurity", '0', 'every public table has RLS enabled')
eq("select array_agg(t.tablename::text order by t.tablename) from pg_tables t where t.schemaname = 'public' and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = t.tablename)", "array['rate_limits']", 'only rate_limits has no policy (service role only)')

# ---- A. anon ----
as_anon()
for tb in TABLES:
    throws(f"select 1 from public.{tb}", '42501', None, f'anon cannot read {tb}')

# ---- B. outsider (signed in, member of nothing) ----
as_user(OUT)
for tb in ['shops','shop_members','shop_invites','audit_log','categories','products','product_costs','stock_movements','customers','sales','sale_items','sale_item_costs','customer_ledger','shop_memory','ai_usage']:
    eq(f"select count(*)::int from public.{tb}", '0', f'outsider sees no rows in {tb}')
throws("select 1 from public.rate_limits", '42501', None, 'authenticated cannot read rate_limits')
throws(f"insert into public.products (shop_id, name, sell_price) values ('{SA}','X',1)", '42501', None, 'outsider cannot insert products into a shop')
throws(f"insert into public.customers (shop_id, name) values ('{SA}','X')", '42501', None, 'outsider cannot insert customers into a shop')

# ---- C. owner of another shop ----
as_user(OB)
eq("select count(*)::int from public.products", '1', 'owner B sees only shop B products')
eq(f"select count(*)::int from public.products where shop_id = '{SA}'", '0', 'owner B cannot read shop A products')
throws(f"insert into public.products (shop_id, name, sell_price) values ('{SA}','X',1)", '42501', None, 'owner B cannot write products in shop A')
throws(f"select {sale(SA, 90, None, items(it(PA1, 1)), 50, 'cash')}", '42501', 'FORBIDDEN', 'owner B cannot record a sale in shop A')
throws(f"select public.record_payment('{SA}','{cid(91)}','{CU1}',5,'cash')", '42501', 'FORBIDDEN', 'owner B cannot record a payment in shop A')
throws(f"select public.create_invite('{SA}','cashier')", '42501', 'FORBIDDEN', 'owner B cannot invite into shop A')
throws(f"select public.delete_shop('{SA}')", '42501', 'FORBIDDEN', 'owner B cannot delete shop A')

# ---- D. cashier ----
as_user(CA)
eq("select count(*)::int from public.products", '2', 'cashier reads shop products')
eq("select count(*)::int from public.product_costs", '0', 'cashier cannot read product costs')
eq("select count(*)::int from public.audit_log", '0', 'cashier cannot read the audit log')
eq("select count(*)::int from public.ai_usage", '0', 'cashier cannot read AI usage')
throws(f"insert into public.products (shop_id, name, sell_price) values ('{SA}','X',1)", '42501', None, 'cashier cannot add products directly')
throws(f"update public.products set stock_qty = 5 where id = '{PA1}'", '42501', None, 'nobody can write stock_qty directly')
throws(f"insert into public.sales (shop_id, client_id, total, paid_amount, method, created_by) values ('{SA}','{cid(92)}',1,1,'cash','{CA}')", '42501', None, 'sales cannot be inserted directly')
throws(f"insert into public.stock_movements (shop_id, product_id, type, qty_delta, created_by) values ('{SA}','{PA1}','adjustment',5,'{CA}')", '42501', None, 'stock movements cannot be inserted directly')
throws(f"insert into public.customer_ledger (shop_id, customer_id, type, amount, created_by) values ('{SA}','{CU1}','payment',-5,'{CA}')", '42501', None, 'ledger rows cannot be inserted directly')
throws(f"delete from public.stock_movements where shop_id = '{SA}'", '42501', None, 'stock movements cannot be deleted')
throws(f"insert into public.ai_usage (shop_id, agent) values ('{SA}','insights')", '42501', None, 'clients cannot write AI usage')
throws(f"select public.create_product('{SA}','{PA3}','Salt','kg',20)", '42501', 'FORBIDDEN', 'cashier cannot create products')
throws(f"select public.record_stock_in('{SA}','{cid(93)}','{PA1}',5,10)", '42501', 'FORBIDDEN', 'cashier cannot record cost prices')
throws(f"select public.void_sale('{SA}','{PA1}','nope nope')", '42501', 'FORBIDDEN', 'cashier cannot void')
throws(f"select public.adjust_stock('{SA}','{cid(94)}','{PA1}',-1,'count fix')", '42501', 'FORBIDDEN', 'cashier cannot adjust stock')
throws(f"select public.create_invite('{SA}','cashier')", '42501', 'FORBIDDEN', 'cashier cannot create invites')
raw(f"update public.shops set name = 'Hacked' where id = '{SA}'")
raw(f"update public.products set sell_price = 1 where id = '{PA1}'")
as_pg()
eq(f"select name from public.shops where id = '{SA}'", "'Shop A'", 'cashier update of the shop was silently denied')
eq(f"select sell_price from public.products where id = '{PA1}'", '50.00::numeric', 'cashier update of a price was silently denied')

# ---- privileges ----
as_pg()
for tb in ['sales','sale_items','sale_item_costs','stock_movements','customer_ledger','audit_log','ai_usage']:
    t(f"select ok(not has_table_privilege('authenticated', 'public.{tb}', 'INSERT'), 'authenticated has no INSERT on {tb}')")
t("select ok(not has_column_privilege('authenticated', 'public.products', 'stock_qty', 'UPDATE'), 'stock_qty is not client-writable')")
t("select ok(not has_table_privilege('anon', 'public.products', 'SELECT'), 'anon has no SELECT on products')")

# ---- E. business rules ----
as_user(CA)
eq(f"({sale(SA, 1, None, items(it(PA1, 2)), 100, 'cash')}).total", '100.00::numeric', 'cash sale total is computed by the server')
eq(f"(select id from public.sales where client_id = '{cid(1)}') = ({sale(SA, 1, None, items(it(PA1, 2)), 100, 'cash')}).id", 'true', 'replaying the same client_id returns the stored sale')
eq(f"select count(*)::int from public.sales where client_id = '{cid(1)}'", '1', 'replay did not create a second sale')
eq(f"select stock_qty from public.products where id = '{PA1}'", '98.000::numeric', 'sale reduced stock once')
throws(f"select {sale(SA, 2, None, items(it(PA1, 1)), 0, 'cash')}", 'P0001', 'CUSTOMER_REQUIRED', 'credit sale needs a customer')
eq(f"({sale(SA, 3, CU1, items(it(PA1, 2)), 40, 'cash')}).total", '100.00::numeric', 'part-paid sale total')
eq(f"select balance from public.customer_balances where customer_id = '{CU1}'", '60.00::numeric', 'unpaid part became a debt')
eq(f"select stock_qty from public.products where id = '{PA1}'", '96.000::numeric', 'second sale reduced stock')
throws(f"select {sale(SA, 4, None, items(it(PA1, 1, 10)), 10, 'cash')}", 'P0001', 'PRICE_CHANGED', 'cashier cannot override a price')
throws(f"select {sale(SA, 5, CU1, items(it(PA2, 5)), 0, 'credit')}", 'P0001', 'LIMIT_EXCEEDED', 'credit limit is enforced')
throws(f"select {sale(SA, 6, None, items(it(PA1, 1)), 60, 'cash')}", 'P0001', 'OVERPAYMENT', 'paid more than total is rejected')
throws(f"select {sale(SA, 7, None, items(it(PA1, 0.0005)), 1, 'cash')}", '22023', 'VALIDATION', 'quantity precision is validated')
throws(f"select {sale(SA, 8, None, items(it(PA1, 1), it(PA1, 2)), 50, 'cash')}", '22023', 'VALIDATION', 'duplicate product lines are rejected')
throws(f"select {sale(SA, 9, None, EMPTY, 50, 'cash')}", '22023', 'VALIDATION', 'empty cart is rejected')
throws(f"select {sale(SA, 10, None, items(it(PB1, 1)), 80, 'cash')}", 'P0001', 'NOT_FOUND', 'a product from another shop is not found')
eq(f"(public.record_payment('{SA}','{cid(11)}','{CU1}',20,'cash')).amount", '-20.00::numeric', 'payment is stored as a negative ledger amount')
eq(f"(public.record_payment('{SA}','{cid(11)}','{CU1}',20,'cash')).amount", '-20.00::numeric', 'payment replay returns the stored row')
eq(f"select balance from public.customer_balances where customer_id = '{CU1}'", '40.00::numeric', 'balance after one payment (replay did not double count)')
throws(f"select public.record_payment('{SA}','{cid(12)}','{CU1}',100,'cash')", 'P0001', 'OVERPAYMENT', 'payment above the balance is rejected')
throws(f"select public.record_payment('{SA}','{cid(13)}','{CU1}',5,'credit')", '22023', 'VALIDATION', 'a payment cannot use the credit method')
as_user(OA)
eq(f"({sale(SA, 14, None, items(it(PA2, 1, 100)), 100, 'cash')}).total", '100.00::numeric', 'owner can override a price')
t(f"select lives_ok($$update public.shops set allow_negative_stock = false where id = '{SA}'$$, 'owner changes the stock rule')")
as_user(CA)
throws(f"select {sale(SA, 15, None, items(it(PA1, 1000)), 50000, 'cash')}", 'P0001', 'STOCK_LOW', 'stock rule blocks overselling when enabled')
as_user(OA)
t(f"select lives_ok($$update public.shops set allow_negative_stock = true where id = '{SA}'$$, 'owner restores the stock rule')")

# reports
as_user(CA)
eq(f"public.dashboard_summary('{SA}', now() - interval '1 day', now() + interval '1 day') ->> 'profit'", 'null::text', 'profit is hidden from cashiers')
as_user(OA)
eq(f"(public.dashboard_summary('{SA}', now() - interval '1 day', now() + interval '1 day') ->> 'sales_total')::numeric", '300.00::numeric', 'report sales total reconciles')
eq(f"(public.dashboard_summary('{SA}', now() - interval '1 day', now() + interval '1 day') ->> 'profit')::numeric", '90.00::numeric', 'owner sees profit (2x20 + 2x20 + 10)')
eq(f"(public.dashboard_summary('{SA}', now() - interval '1 day', now() + interval '1 day') ->> 'cash_in')::numeric", '260.00::numeric', 'cash in = paid now + debts collected')
eq(f"(public.dashboard_summary('{SA}', now() - interval '1 day', now() + interval '1 day') ->> 'total_owed')::numeric", '40.00::numeric', 'total owed matches the ledger')
throws(f"select public.dashboard_summary('{SA}', now(), now() - interval '1 day')", '22023', 'VALIDATION', 'bad report range is rejected')

# debts / ageing (fixture customer with an old charge and a later part payment)
as_pg()
raw(f"insert into public.customer_ledger (shop_id, customer_id, type, amount, created_by, created_at) values ('{SA}','{CU2}','charge',100,'{OA}', now() - interval '40 days'),('{SA}','{CU2}','payment',-30,'{OA}', now() - interval '10 days')")
as_user(OA)
eq(f"select count(*)::int from public.customer_debts('{SA}')", '2', 'debts overview lists customers with a balance')
eq(f"select is_overdue from public.customer_debts('{SA}') where customer_id = '{CU2}'", 'true', 'old unpaid charge is overdue')
eq(f"select balance from public.customer_debts('{SA}') where customer_id = '{CU2}'", '70::numeric', 'ageing customer balance')
eq(f"select is_overdue from public.customer_debts('{SA}') where customer_id = '{CU1}'", 'false', 'recent debt is not overdue')

# void
as_pg()
raw(f"insert into ctx select 'sale3', id::text from public.sales where client_id = '{cid(3)}'")
as_user(OA)
eq(f"(public.void_sale('{SA}', (select v::uuid from ctx where k = 'sale3'), 'Customer returned goods')).status::text", "'voided'", 'owner voids a sale')
eq(f"(public.void_sale('{SA}', (select v::uuid from ctx where k = 'sale3'), 'Customer returned goods')).status::text", "'voided'", 'voiding twice is harmless')
eq(f"select stock_qty from public.products where id = '{PA1}'", '98.000::numeric', 'void restored stock exactly once')
eq(f"select balance from public.customer_balances where customer_id = '{CU1}'", '-20.00::numeric', 'void reversed the unpaid part of the debt')

# adjust / stock in / create product
eq(f"(public.adjust_stock('{SA}','{cid(20)}','{PA1}',-3,'Count correction')).qty_delta", '-3.000::numeric', 'owner adjusts stock')
eq(f"(public.adjust_stock('{SA}','{cid(20)}','{PA1}',-3,'Count correction')).qty_delta", '-3.000::numeric', 'adjustment replay returns the stored row')
throws(f"select public.adjust_stock('{SA}','{cid(21)}','{PA1}',-1,'x')", '22023', 'VALIDATION', 'adjustment needs a real reason')
eq(f"select stock_qty from public.products where id = '{PA1}'", '95.000::numeric', 'stock after adjustment (replay did not double count)')
as_user(CA)
eq(f"(public.record_stock_in('{SA}','{cid(22)}','{PA1}',10)).qty_delta", '10.000::numeric', 'cashier records stock bought (no cost)')
as_user(OA)
eq(f"(public.record_stock_in('{SA}','{cid(23)}','{PA1}',10,32)).qty_delta", '10.000::numeric', 'owner records stock bought with cost')
eq(f"select cost_price from public.product_costs where product_id = '{PA1}'", '32.00::numeric', 'cost price updated by restock')
eq(f"(public.create_product('{SA}','{PA3}','Salt','kg',20,10,25)).name", "'Salt'", 'owner creates a product')
eq(f"(public.create_product('{SA}','{PA3}','Salt','kg',20,10,25)).stock_qty", '25.000::numeric', 'product create replay keeps opening stock')
eq(f"select count(*)::int from public.stock_movements where product_id = '{PA3}'", '1', 'opening stock recorded once')
eq("select count(*)::int from public.product_costs", '3', 'owner reads costs')
t("select ok((select count(*) from public.audit_log) > 0, 'owner reads the audit log')")
eq("select count(*)::int from public.ai_usage", '1', 'owner reads AI usage')

# memory
as_user(CA)
t(f"select lives_ok($$insert into public.shop_memory (shop_id, kind, key, value) values ('{SA}','alias','sukar','Sugar 1kg')$$, 'member can save a memory item')")
throws(f"insert into public.shop_memory (shop_id, kind, key, value) values ('{SA}','alias','sukar','dup')", '23505', None, 'duplicate memory key is rejected')
as_user(OUT)
eq("select count(*)::int from public.shop_memory", '0', 'outsider cannot read memory')

# invites
as_user(OA)
raw(f"insert into ctx select 'code', public.create_invite('{SA}','cashier')")
as_user(OUT)
throws("select public.accept_invite('0000000000000000')", 'P0001', 'NOT_FOUND', 'a wrong code fails generically')
eq(f"select public.accept_invite((select v from ctx where k = 'code'))", f"'{SA}'::uuid", 'valid code joins the shop')
throws("select public.accept_invite((select v from ctx where k = 'code'))", 'P0001', 'NOT_FOUND', 'a code works only once')
eq("select count(*)::int from public.products where archived_at is null", '3', 'new member sees the shop products')
eq("select count(*)::int from public.product_costs", '0', 'new cashier cannot read costs')

# invariants + immutability
as_pg()
eq("select count(*)::int from public.products p where p.stock_qty <> coalesce((select sum(m.qty_delta) from public.stock_movements m where m.product_id = p.id), 0)", '0', 'invariant: stock equals the sum of movements')
eq("select count(*)::int from public.sales s where s.total <> (select sum(round(i.qty * i.unit_price, 2)) from public.sale_items i where i.sale_id = s.id)", '0', 'invariant: sale total equals its items')
throws("update public.stock_movements set qty_delta = 1", '42501', 'LEDGER_IMMUTABLE', 'stock ledger is append-only (update)')
throws("delete from public.customer_ledger", '42501', 'LEDGER_IMMUTABLE', 'customer ledger is append-only (delete)')
throws("update public.sale_items set qty = 99", '42501', 'LEDGER_IMMUTABLE', 'sale items are immutable')
throws("delete from public.sales", '42501', 'LEDGER_IMMUTABLE', 'sales cannot be deleted')
throws("update public.sales set total = 1", '42501', 'LEDGER_IMMUTABLE', 'sale totals cannot be edited')
throws("update public.sales set status = 'completed' where status = 'voided'", '42501', 'LEDGER_IMMUTABLE', 'a voided sale cannot be revived')

# rate limiter
t("select lives_ok($$select public.rate_limit_hit('test:key', 2, 60)$$, 'first hit allowed')")
t("select lives_ok($$select public.rate_limit_hit('test:key', 2, 60)$$, 'second hit allowed')")
throws("select public.rate_limit_hit('test:key', 2, 60)", 'P0001', 'RATE_LIMITED', 'third hit is limited')
as_user(CA)
throws("select public.rate_limit_hit('x', 1, 1)", '42501', None, 'users cannot call the limiter directly')

# delete shop
as_user(OB)
t(f"select lives_ok($$select public.delete_shop('{SB}')$$, 'owner deletes the whole shop')")
as_pg()
eq(f"select count(*)::int from public.products where shop_id = '{SB}'", '0', 'shop deletion removed products')
eq(f"select count(*)::int from public.shops where id = '{SB}'", '0', 'shop deletion removed the shop')

raw('select * from finish()')
raw('rollback')
sql = '\n'.join(out).replace('__PLAN__', str(n))
header = "-- GENERATED by scripts/gen-pgtap.py. Do not edit by hand; change the generator and re-run it.\n-- Run with: supabase test db\n"
open('supabase/tests/001_rls_and_rules.test.sql', 'w').write(header + sql + '\n')
print('assertions:', n)
