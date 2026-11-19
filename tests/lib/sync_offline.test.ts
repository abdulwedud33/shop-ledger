import 'fake-indexeddb/auto';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { db, wipeLocalData } from '../../src/lib/db';
import {
  queueSale, queuePayment, queueVoid, queueAdjust, queueStockIn,
  queueCustomer, queueProduct, pullAll
} from '../../src/lib/sync';
import type { Cart } from '../../src/domain/cart';

beforeEach(async () => {
  await wipeLocalData();
});

async function setupShop() {
  const shopId = crypto.randomUUID();
  const prod1 = crypto.randomUUID();
  const prod2 = crypto.randomUUID();
  const cust1 = crypto.randomUUID();
  await db.products.bulkPut([
    {
      id: prod1, shopId, name: 'Sugar', unit: 'kg', sellPrice: 5000,
      stockQty: 100000, reorderLevel: 10000, archived: 0, updatedAt: new Date().toISOString()
    },
    {
      id: prod2, shopId, name: 'Oil', unit: 'l', sellPrice: 12000,
      stockQty: 50000, reorderLevel: 5000, archived: 0, updatedAt: new Date().toISOString()
    }
  ]);
  await db.customers.put({
    id: cust1, shopId, name: 'Abel', phone: '+251911000000',
    creditLimit: 50000, archived: 0, updatedAt: new Date().toISOString()
  });
  return { shopId, prod1, prod2, cust1 };
}

test('queueSale updates local stock, balances, sales and enqueues outbox item', async () => {
  const { shopId, prod1 } = await setupShop();
  const cart: Cart = {
    lines: [
      { productId: prod1, name: 'Sugar', unit: 'kg', unitPrice: 5000, qty: 2000 }
    ]
  };

  // Cash sale (fully paid)
  const sale = await queueSale({
    shopId,
    cart,
    paid: 10000,
    method: 'cash',
    customerId: null,
    customerName: null
  });

  assert.equal(sale.shopId, shopId);
  assert.equal(sale.total, 10000);
  assert.equal(sale.paid, 10000);
  assert.equal(sale.status, 'completed');
  assert.equal(sale.sync, 'pending');

  // Verify stock decremented locally
  const p = await db.products.get(prod1);
  assert.equal(p?.stockQty, 98000); // 100,000 - 2,000

  // Verify outbox entry created for this shop
  const outbox = await db.outbox.where('shopId').equals(shopId).toArray();
  assert.equal(outbox.length, 1);
  assert.equal(outbox[0]?.kind, 'sale');
  assert.equal(outbox[0]?.id, sale.id);
});

test('queueSale with credit increases local customer balance', async () => {
  const { shopId, prod1, cust1 } = await setupShop();
  const cart: Cart = {
    lines: [
      { productId: prod1, name: 'Sugar', unit: 'kg', unitPrice: 5000, qty: 2000 }
    ]
  };

  // Part-paid sale: total 100.00, paid 40.00 => credit 60.00 (6000 minor)
  const sale = await queueSale({
    shopId,
    cart,
    paid: 4000,
    method: 'cash',
    customerId: cust1,
    customerName: 'Abel'
  });

  assert.equal(sale.total, 10000);
  assert.equal(sale.paid, 4000);

  // Check balance updated in IndexedDB
  const bal = await db.balances.get(cust1);
  assert.equal(bal?.balance, 6000);

  // Check outbox
  const outbox = await db.outbox.where('shopId').equals(shopId).toArray();
  assert.equal(outbox.length, 1);
  assert.equal(outbox[0]?.kind, 'sale');
});

test('queuePayment decrements local customer balance and records ledger row', async () => {
  const { shopId, cust1 } = await setupShop();
  // Setup existing balance
  await db.balances.put({
    customerId: cust1, shopId, balance: 6000,
    oldestOpenAt: new Date().toISOString(), daysOpen: 5, overdue: false
  });

  await queuePayment(shopId, {
    customerId: cust1,
    amount: 2000,
    method: 'cash',
    note: 'Partial payment'
  });

  // Balance should now be 4000
  const bal = await db.balances.get(cust1);
  assert.equal(bal?.balance, 4000);

  // Ledger should contain pending payment
  const ledger = await db.ledger.where('customerId').equals(cust1).toArray();
  assert.equal(ledger.length, 1);
  assert.equal(ledger[0]?.amount, -2000);
  assert.equal(ledger[0]?.pending, true);

  // Outbox should contain payment
  const outbox = await db.outbox.where('shopId').equals(shopId).toArray();
  const paymentItem = outbox.find((i) => i.kind === 'payment');
  assert.ok(paymentItem);
});

test('queuePayment clearing full balance deletes balance row', async () => {
  const { shopId, cust1 } = await setupShop();
  await db.balances.put({
    customerId: cust1, shopId, balance: 2000,
    oldestOpenAt: new Date().toISOString(), daysOpen: 1, overdue: false
  });

  await queuePayment(shopId, {
    customerId: cust1,
    amount: 2000,
    method: 'cash'
  });

  const bal = await db.balances.get(cust1);
  assert.equal(bal, undefined); // fully cleared balance is removed
});

test('queueVoid restores stock and reverses credit balance', async () => {
  const { shopId, prod1, cust1 } = await setupShop();
  // Existing synced sale with serverId
  const sale = await queueSale({
    shopId,
    cart: {
      lines: [{ productId: prod1, name: 'Sugar', unit: 'kg', unitPrice: 5000, qty: 2000 }]
    },
    paid: 4000, // credit = 6000
    method: 'cash',
    customerId: cust1,
    customerName: 'Abel'
  });

  // Simulate sale sync with serverId assigned
  const syncedSale = { ...sale, serverId: 'server-sale-uuid-1', sync: 'synced' as const };
  await db.sales.put(syncedSale);
  // Clear outbox from the sale to isolate void
  await db.outbox.where('shopId').equals(shopId).delete();

  // Stock before void is 98,000 (after 2,000 deduction)
  const pBefore = await db.products.get(prod1);
  assert.equal(pBefore?.stockQty, 98000);

  // Balance before void is 6,000
  const bBefore = await db.balances.get(cust1);
  assert.equal(bBefore?.balance, 6000);

  // Queue void
  await queueVoid(shopId, syncedSale, 'Customer returned goods');

  // Stock should be restored
  const pAfter = await db.products.get(prod1);
  assert.equal(pAfter?.stockQty, 100000);

  // Credit balance should be removed/cleared
  const bAfter = await db.balances.get(cust1);
  assert.equal(bAfter, undefined);

  // Sale marked voided locally
  const sAfter = await db.sales.get(sale.id);
  assert.equal(sAfter?.status, 'voided');

  // Outbox has void_sale item
  const outbox = await db.outbox.where('shopId').equals(shopId).toArray();
  assert.equal(outbox.length, 1);
  assert.equal(outbox[0]?.kind, 'void_sale');
});

test('queueVoid throws if sale has no serverId (unsynced sale)', async () => {
  const { shopId, prod1 } = await setupShop();
  const sale = await queueSale({
    shopId,
    cart: {
      lines: [{ productId: prod1, name: 'Sugar', unit: 'kg', unitPrice: 5000, qty: 1000 }]
    },
    paid: 5000,
    method: 'cash',
    customerId: null,
    customerName: null
  });

  await assert.rejects(
    async () => queueVoid(shopId, sale, 'Try to void offline unsynced sale'),
    /NOT_FOUND/
  );
});

test('queueStockIn updates product stockQty and enqueues stock_in', async () => {
  const { shopId, prod1 } = await setupShop();
  await queueStockIn(shopId, {
    productId: prod1,
    qty: 50000, // +50 kg
    unitCost: 3500
  });

  const p = await db.products.get(prod1);
  assert.equal(p?.stockQty, 150000); // 100,000 + 50,000
  assert.equal(p?.costPrice, 3500);

  const outbox = await db.outbox.where('shopId').equals(shopId).toArray();
  const stockItem = outbox.find((i) => i.kind === 'stock_in');
  assert.ok(stockItem);
});

test('queueAdjust modifies stock by qtyDelta and enqueues adjust_stock', async () => {
  const { shopId, prod1 } = await setupShop();
  await queueAdjust(shopId, {
    productId: prod1,
    qtyDelta: -5000, // -5 kg damaged
    reason: 'Water damage',
    type: 'damage'
  });

  const p = await db.products.get(prod1);
  assert.equal(p?.stockQty, 95000); // 100,000 - 5,000

  const outbox = await db.outbox.where('shopId').equals(shopId).toArray();
  const adjustItem = outbox.find((i) => i.kind === 'adjust_stock');
  assert.ok(adjustItem);
});

test('queueCustomer and queueProduct create pending local entries', async () => {
  const { shopId } = await setupShop();
  const custId = await queueCustomer(shopId, {
    name: 'Bekele',
    phone: '+251922000000',
    creditLimit: null
  });
  const c = await db.customers.get(custId);
  assert.equal(c?.name, 'Bekele');
  assert.equal(c?.pending, true);

  const prodId = await queueProduct(shopId, {
    name: 'Salt',
    unit: 'kg',
    sellPrice: 2000,
    costPrice: 1200,
    openingQty: 25000,
    reorderLevel: 5000
  });
  const p = await db.products.get(prodId);
  assert.equal(p?.name, 'Salt');
  assert.equal(p?.stockQty, 25000);
  assert.equal(p?.pending, true);
});

test('pullAll is skipped when outbox has pending items (preserves optimistic updates)', async () => {
  const { shopId, prod1 } = await setupShop();
  // Add a pending item to the outbox
  await queueSale({
    shopId,
    cart: {
      lines: [{ productId: prod1, name: 'Sugar', unit: 'kg', unitPrice: 5000, qty: 1000 }]
    },
    paid: 5000,
    method: 'cash',
    customerId: null,
    customerName: null
  });

  const openCount = await db.outbox.where('shopId').equals(shopId).filter((i) => i.status === 'pending').count();
  assert.equal(openCount, 1);

  // Modify stock locally to simulate optimistic update
  await db.products.update(prod1, { stockQty: 77777 });

  // pullAll must return early without touching local data because outbox is not empty
  await pullAll(shopId);

  const p = await db.products.get(prod1);
  assert.equal(p?.stockQty, 77777, 'Optimistic stock must not be overwritten while outbox has pending items');
});
