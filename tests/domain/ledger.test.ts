import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agingBucket, balance, daysBetween, isOverdue, openCharges, oldestOpenChargeAt } from '../../src/domain/ledger';

const L = (amount: number, day: number) => ({ amount, at: `2026-01-${String(day).padStart(2, '0')}T08:00:00Z` });

test('balance is the sum of lines', () => {
  assert.equal(balance([L(1000, 1), L(500, 2), L(-300, 3)]), 1200);
  assert.equal(balance([]), 0);
});

test('FIFO applies payments to the oldest charge first', () => {
  const lines = [L(1000, 1), L(500, 5), L(-1200, 10)];
  const open = openCharges(lines);
  assert.deepEqual(open.map((o) => o.open), [300]); // first charge cleared, second has 300 left
  assert.equal(oldestOpenChargeAt(lines), '2026-01-05T08:00:00Z');
});

test('fully paid customer has no open charge', () => {
  assert.equal(oldestOpenChargeAt([L(1000, 1), L(-1000, 2)]), null);
});

test('void reversal behaves like a payment', () => {
  const lines = [L(800, 1), L(-800, 2), L(200, 3)];
  assert.equal(balance(lines), 200);
  assert.equal(oldestOpenChargeAt(lines), '2026-01-03T08:00:00Z');
});

test('open remainders always add up to the balance when balance is positive', () => {
  const lines = [L(700, 1), L(300, 2), L(-450, 3), L(250, 4), L(-100, 5)];
  const open = openCharges(lines).reduce((s, o) => s + o.open, 0);
  assert.equal(open, balance(lines));
});

test('aging buckets and overdue', () => {
  assert.equal(agingBucket(0), 'current');
  assert.equal(agingBucket(7), 'current');
  assert.equal(agingBucket(8), 'd8_30');
  assert.equal(agingBucket(30), 'd8_30');
  assert.equal(agingBucket(31), 'd31_plus');
  assert.equal(isOverdue(30, 30), true);
  assert.equal(isOverdue(29, 30), false);
  assert.equal(daysBetween('2026-01-01T00:00:00Z', '2026-01-31T12:00:00Z'), 30);
});
