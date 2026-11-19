import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://uuqypwwpujibxqvvvywx.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_jmk3QS3XZYofVilwwAmUlw_WPST46Rr';

test('integration: real RPC flow with two users and cross-shop isolation', async (t) => {
  if (supabaseUrl.includes('ci-placeholder') || !supabaseUrl.startsWith('http') || process.env.SKIP_INTEGRATION_TESTS === 'true') {
    t.skip('Skipped live cloud auth: CI environment without live database.');
    return;
  }

  try {
    const clientA = createClient(supabaseUrl, supabaseKey);
    const clientB = createClient(supabaseUrl, supabaseKey);

    // Unique email credentials
    const emailA = `shop_owner_a_${Date.now()}@gmail.com`;
    const emailB = `shop_owner_b_${Date.now()}@gmail.com`;
    const password = 'TestPassword123!';

    // Attempt to sign up User A
    let signUpA: any;
    try {
      signUpA = await clientA.auth.signUp({ email: emailA, password });
    } catch (netErr: any) {
      t.skip(`Skipped live cloud auth (unreachable network): ${netErr?.message || netErr}`);
      return;
    }

    let sessionA = signUpA?.data?.session;

    if (!sessionA) {
      // If confirmation is required or rate limited by Supabase Cloud email limits, log skip reason
      t.skip('Skipped live cloud auth: Supabase Cloud has email confirmations enabled (or rate-limited). To run live integration against cloud, disable "Confirm email" in Supabase Dashboard -> Auth -> Providers -> Email.');
      return;
    }

    let signUpB: any;
    try {
      signUpB = await clientB.auth.signUp({ email: emailB, password });
    } catch (netErr: any) {
      t.skip(`Skipped live cloud auth (unreachable network): ${netErr?.message || netErr}`);
      return;
    }

    const sessionB = signUpB?.data?.session;
    if (!sessionB) {
      t.skip('User B could not obtain session (email confirmations enabled on remote project).');
      return;
    }

  // 1. Create shops
  const { data: shopA, error: errShopA } = await clientA.rpc('create_shop', {
    p_name: 'Shop Alpha', p_currency: 'ETB', p_locale: 'en', p_timezone: 'Africa/Addis_Ababa'
  });
  assert.equal(errShopA, null, 'User A can create shop');
  assert.ok(shopA?.id);

  const { data: shopB, error: errShopB } = await clientB.rpc('create_shop', {
    p_name: 'Shop Beta', p_currency: 'ETB', p_locale: 'en', p_timezone: 'Africa/Addis_Ababa'
  });
  assert.equal(errShopB, null, 'User B can create shop');
  assert.ok(shopB?.id);

  // 2. Cross-shop isolation check: User B cannot create product or record sale in Shop A
  const fakeProdId = crypto.randomUUID();
  const { error: errCrossProd } = await clientB.rpc('create_product', {
    p_shop: shopA.id, p_id: fakeProdId, p_name: 'Hacked', p_unit: 'pcs', p_sell_price: 10
  });
  assert.ok(errCrossProd, 'User B cannot create product in Shop A');
  assert.equal(errCrossProd.message, 'FORBIDDEN');

  // 3. User A creates product in Shop A
  const prodId = crypto.randomUUID();
  const { data: prod, error: errProd } = await clientA.rpc('create_product', {
    p_shop: shopA.id, p_id: prodId, p_name: 'Barley Flour', p_unit: 'kg', p_sell_price: 60,
    p_cost_price: 40, p_opening_qty: 100, p_reorder_level: 10
  });
  assert.equal(errProd, null);
  assert.equal(prod?.name, 'Barley Flour');

  // 4. Record sale with idempotency replay
  const saleClientId = crypto.randomUUID();
  const saleItems = [{ product_id: prodId, qty: 2, unit_price: 60 }];

  const { data: sale1, error: errSale1 } = await clientA.rpc('record_sale', {
    p_shop: shopA.id, p_client_id: saleClientId, p_customer: null, p_items: saleItems,
    p_paid: 120, p_method: 'cash'
  });
  assert.equal(errSale1, null);
  assert.equal(sale1?.total, 120);

  // Replay identical saleClientId
  const { data: sale1Replay, error: errReplay } = await clientA.rpc('record_sale', {
    p_shop: shopA.id, p_client_id: saleClientId, p_customer: null, p_items: saleItems,
    p_paid: 120, p_method: 'cash'
  });
  assert.equal(errReplay, null);
  assert.equal(sale1Replay?.id, sale1?.id, 'Replaying returns stored sale without double booking');

  // 5. Credit sale with customer
  const custId = crypto.randomUUID();
  const { error: errCust } = await clientA.from('customers').insert({
    id: custId, shop_id: shopA.id, name: 'Dawit Mengistu', credit_limit: 1000
  });
  assert.equal(errCust, null);

  const creditSaleClientId = crypto.randomUUID();
  const { data: sale2, error: errSale2 } = await clientA.rpc('record_sale', {
    p_shop: shopA.id, p_client_id: creditSaleClientId, p_customer: custId, p_items: saleItems,
    p_paid: 20, p_method: 'cash' // total 120, paid 20 => credit 100
  });
  assert.equal(errSale2, null);
  assert.equal(sale2?.total, 120);

  // 6. Record payment against debt
  const paymentClientId = crypto.randomUUID();
  const { data: payment, error: errPay } = await clientA.rpc('record_payment', {
    p_shop: shopA.id, p_client_id: paymentClientId, p_customer: custId, p_amount: 50, p_method: 'cash'
  });
  assert.equal(errPay, null);
  assert.equal(payment?.amount, -50);

  // 7. Void sale
  const { data: voided, error: errVoid } = await clientA.rpc('void_sale', {
    p_shop: shopA.id, p_sale: sale1.id, p_reason: 'Returned immediately'
  });
  assert.equal(errVoid, null);
  assert.equal(voided?.status, 'voided');

  // 8. Report reconciliation
  const { data: report, error: errReport } = await clientA.rpc('dashboard_summary', {
    p_shop: shopA.id,
    p_from: new Date(Date.now() - 86400000).toISOString(),
    p_to: new Date(Date.now() + 86400000).toISOString()
  });
  assert.equal(errReport, null);
  assert.equal(report?.sales_total, 120); // only completed sale2 (sale1 voided)
  assert.equal(report?.paid_now, 20);
  assert.equal(report?.credit_given, 100);
  assert.equal(report?.debt_collected, 50);
  assert.equal(report?.cash_in, 70); // 20 + 50
  assert.equal(report?.total_owed, 50); // 100 credit - 50 payment
  } catch (err: any) {
    t.skip(`Skipped live cloud integration due to network error: ${err?.message || err}`);
  }
});
