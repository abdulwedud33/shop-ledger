-- =============================================================================
-- Shop Ledger: Demo Account & Seed Data
-- Run this in your Supabase Dashboard SQL Editor (https://supabase.com/dashboard/project/uuqypwwpujibxqvvvywx/sql)
--
-- Demo Credentials Created:
-- Owner:   demo@shopledger.et    / Password123!
-- Cashier: cashier@shopledger.et / Password123!
-- =============================================================================

begin;

-- 1. Clean up any existing demo records
delete from auth.users where email in ('demo@shopledger.et', 'cashier@shopledger.et');

-- 2. Create Auth Users with confirmed email
-- Note: Uses standard pgcrypto bf salt
insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token
) values
(
  'd0000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'demo@shopledger.et',
  extensions.crypt('Password123!', extensions.gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"Abebe Demissie (Owner)"}',
  now(),
  now(),
  ''
),
(
  'd0000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'cashier@shopledger.et',
  extensions.crypt('Password123!', extensions.gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"Tigist Kassa (Cashier)"}',
  now(),
  now(),
  ''
);

-- Ensure profiles exist (handled by on_auth_user_created trigger, or fallback insert)
insert into public.profiles (id, full_name)
values
  ('d0000000-0000-0000-0000-000000000001', 'Abebe Demissie (Owner)'),
  ('d0000000-0000-0000-0000-000000000002', 'Tigist Kassa (Cashier)')
on conflict (id) do update set full_name = excluded.full_name;

-- 3. Create Shop
insert into public.shops (
  id,
  owner_id,
  name,
  currency,
  locale,
  timezone,
  allow_negative_stock,
  overdue_days
) values (
  'e0000000-0000-0000-0000-000000000001',
  'd0000000-0000-0000-0000-000000000001',
  'Bole Mart (ቦሌ ማርት)',
  'ETB',
  'en',
  'Africa/Addis_Ababa',
  true,
  30
);

-- 4. Assign Roles in shop_members
insert into public.shop_members (shop_id, user_id, role)
values
  ('e0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'owner'),
  ('e0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002', 'cashier');

-- 5. Products & Opening Stock
-- Product 1: Sugar (ስኳር)
insert into public.products (id, shop_id, name, unit, sell_price, stock_qty)
values ('f0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'Sugar (ስኳር)', 'kg', 120.00, 50.000);
insert into public.product_costs (product_id, shop_id, cost_price)
values ('f0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 95.00);
insert into public.stock_movements (shop_id, product_id, type, qty_delta, created_by)
values ('e0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', 'opening', 50.000, 'd0000000-0000-0000-0000-000000000001');

-- Product 2: Cooking Oil 5L (የምግብ ዘይት)
insert into public.products (id, shop_id, name, unit, sell_price, stock_qty)
values ('f0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000001', 'Cooking Oil 5L (የምግብ ዘይት)', 'pcs', 650.00, 20.000);
insert into public.product_costs (product_id, shop_id, cost_price)
values ('f0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000001', 540.00);
insert into public.stock_movements (shop_id, product_id, type, qty_delta, created_by)
values ('e0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000002', 'opening', 20.000, 'd0000000-0000-0000-0000-000000000001');

-- Product 3: Teff (ጤፍ)
insert into public.products (id, shop_id, name, unit, sell_price, stock_qty)
values ('f0000000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-000000000001', 'Magna Teff (ማኛ ጤፍ)', 'kg', 110.00, 100.000);
insert into public.product_costs (product_id, shop_id, cost_price)
values ('f0000000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-000000000001', 90.00);
insert into public.stock_movements (shop_id, product_id, type, qty_delta, created_by)
values ('e0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000003', 'opening', 100.000, 'd0000000-0000-0000-0000-000000000001');

-- Product 4: Coffee Beans (የቡና ፍሬ)
insert into public.products (id, shop_id, name, unit, sell_price, stock_qty)
values ('f0000000-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-000000000001', 'Yirgacheffe Coffee (ይርጋጨፌ ቡና)', 'kg', 400.00, 15.000);
insert into public.product_costs (product_id, shop_id, cost_price)
values ('f0000000-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-000000000001', 320.00);
insert into public.stock_movements (shop_id, product_id, type, qty_delta, created_by)
values ('e0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000004', 'opening', 15.000, 'd0000000-0000-0000-0000-000000000001');

-- Product 5: Milk (ወተት)
insert into public.products (id, shop_id, name, unit, sell_price, stock_qty)
values ('f0000000-0000-0000-0000-000000000005', 'e0000000-0000-0000-0000-000000000001', 'Fresh Milk 1L (ወተት)', 'pcs', 90.00, 30.000);
insert into public.product_costs (product_id, shop_id, cost_price)
values ('f0000000-0000-0000-0000-000000000005', 'e0000000-0000-0000-0000-000000000001', 75.00);
insert into public.stock_movements (shop_id, product_id, type, qty_delta, created_by)
values ('e0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000005', 'opening', 30.000, 'd0000000-0000-0000-0000-000000000001');

-- Product 6: Soap (ሳሙና)
insert into public.products (id, shop_id, name, unit, sell_price, stock_qty)
values ('f0000000-0000-0000-0000-000000000006', 'e0000000-0000-0000-0000-000000000001', 'Laundry Soap (ሳሙና)', 'pcs', 45.00, 60.000);
insert into public.product_costs (product_id, shop_id, cost_price)
values ('f0000000-0000-0000-0000-000000000006', 'e0000000-0000-0000-0000-000000000001', 32.00);
insert into public.stock_movements (shop_id, product_id, type, qty_delta, created_by)
values ('e0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000006', 'opening', 60.000, 'd0000000-0000-0000-0000-000000000001');

-- Product 7: Pasta (ፓስታ)
insert into public.products (id, shop_id, name, unit, sell_price, stock_qty)
values ('f0000000-0000-0000-0000-000000000007', 'e0000000-0000-0000-0000-000000000001', 'Pasta 500g (ፓስታ)', 'pcs', 55.00, 80.000);
insert into public.product_costs (product_id, shop_id, cost_price)
values ('f0000000-0000-0000-0000-000000000007', 'e0000000-0000-0000-0000-000000000001', 42.00);
insert into public.stock_movements (shop_id, product_id, type, qty_delta, created_by)
values ('e0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000007', 'opening', 80.000, 'd0000000-0000-0000-0000-000000000001');

-- 6. Customers
insert into public.customers (id, shop_id, name, phone, credit_limit, notes)
values
  ('c0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'Abebe Bikila (አበበ ቢቂላ)', '0911223344', 2500.00, 'Regular neighbor, pays on weekends'),
  ('c0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000001', 'Almaz Ayana (አልማዝ አያና)', '0922334455', 1500.00, 'Overdue account (>30 days)'),
  ('c0000000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-000000000001', 'Chaltu Gemechu (ጫልቱ ገመቹ)', '0933445566', 1000.00, 'Strict credit cap');

-- 7. Initial Customer Debts (FIFO ledger entries)
-- Almaz Ayana: 45 days old overdue charge of 450 ETB
insert into public.customer_ledger (shop_id, customer_id, type, amount, created_by, created_at, note)
values (
  'e0000000-0000-0000-0000-000000000001',
  'c0000000-0000-0000-0000-000000000002',
  'charge',
  450.00,
  'd0000000-0000-0000-0000-000000000001',
  now() - interval '45 days',
  'Opening balance migration'
);

-- Abebe Bikila: recent charge of 800 ETB, and partial payment of 300 ETB (Balance = 500 ETB)
insert into public.customer_ledger (shop_id, customer_id, type, amount, created_by, created_at, note)
values (
  'e0000000-0000-0000-0000-000000000001',
  'c0000000-0000-0000-0000-000000000001',
  'charge',
  800.00,
  'd0000000-0000-0000-0000-000000000001',
  now() - interval '5 days',
  'Groceries credit'
);
insert into public.customer_ledger (shop_id, customer_id, type, amount, method, created_by, created_at, note)
values (
  'e0000000-0000-0000-0000-000000000001',
  'c0000000-0000-0000-0000-000000000001',
  'payment',
  -300.00,
  'cash',
  'd0000000-0000-0000-0000-000000000001',
  now() - interval '2 days',
  'Partial cash payment'
);

commit;
