import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addOne, cartTotal, checkPayment, creditPortion, effectiveMethod, emptyCart, removeLine, setQty } from '../../src/domain/cart';

const sugar = { id: 's', name: 'Sugar 1kg', unit: 'pcs', sellPrice: 12000 };
const oil = { id: 'o', name: 'Oil 1L', unit: 'pcs', sellPrice: 25050 };

test('tapping the same product merges lines and totals are exact', () => {
  let cart = addOne(emptyCart, sugar);
  cart = addOne(cart, sugar);
  cart = addOne(cart, oil);
  assert.equal(cart.lines.length, 2);
  assert.equal(cartTotal(cart), 2 * 12000 + 25050);
});

test('setQty with zero removes the line; decimals work', () => {
  let cart = addOne(emptyCart, oil);
  cart = setQty(cart, 'o', 2500);
  assert.equal(cartTotal(cart), 62625); // 250.50 x 2.5 = 626.25
  cart = setQty(cart, 'o', 0);
  assert.equal(cart.lines.length, 0);
  assert.equal(removeLine(cart, 'x').lines.length, 0);
});

test('payment rules mirror the server', () => {
  assert.deepEqual(checkPayment({ total: 1000, paid: 1000, customerId: null }), []);
  assert.deepEqual(checkPayment({ total: 1000, paid: 400, customerId: null }), ['CUSTOMER_REQUIRED']);
  assert.deepEqual(checkPayment({ total: 1000, paid: 400, customerId: 'c' }), []);
  assert.deepEqual(checkPayment({ total: 1000, paid: 1500, customerId: 'c' }), ['PAID_EXCEEDS_TOTAL']);
  assert.deepEqual(checkPayment({ total: 0, paid: 0, customerId: null }), ['EMPTY_CART']);
  assert.equal(creditPortion(1000, 400), 600);
  assert.equal(creditPortion(1000, 1000), 0);
});

test('method becomes credit only when nothing is paid now', () => {
  assert.equal(effectiveMethod(0, 'cash'), 'credit');
  assert.equal(effectiveMethod(100, 'mobile_money'), 'mobile_money');
});
