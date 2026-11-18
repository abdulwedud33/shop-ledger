import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatMoney, formatQty, lineTotal, parseMoney, parseQty, toDecimalString, toMinor } from '../../src/domain/money';

test('parseMoney accepts valid input and rejects the rest', () => {
  assert.equal(parseMoney('12'), 1200);
  assert.equal(parseMoney('12.5'), 1250);
  assert.equal(parseMoney('1,200.05'), 120005);
  assert.equal(parseMoney(' 0.99 '), 99);
  for (const bad of ['', 'abc', '-5', '1.234', '1e5', '12.', '.5', '9999999999999']) {
    assert.equal(parseMoney(bad), null, `should reject ${JSON.stringify(bad)}`);
  }
});

test('toMinor handles server numerics without float drift', () => {
  assert.equal(toMinor('120.50'), 12050);
  assert.equal(toMinor(0.1 + 0.2), 30); // 0.30000000000000004 -> 30
  assert.equal(toMinor('19.995'), 2000); // half up
  assert.equal(toMinor('-3.20'), -320);
  assert.equal(toMinor(5), 500);
});

test('toDecimalString is exact', () => {
  assert.equal(toDecimalString(12050), '120.50');
  assert.equal(toDecimalString(5), '0.05');
  assert.equal(toDecimalString(-320), '-3.20');
});

test('lineTotal rounds half up and does not overflow', () => {
  assert.equal(lineTotal(1000, 1000), 1000); // 10.00 x 1
  assert.equal(lineTotal(1000, 2500), 2500); // 10.00 x 2.5
  assert.equal(lineTotal(333, 500), 167); // 3.33 x 0.5 = 1.665 -> 1.67
  assert.equal(lineTotal(1, 1), 0); // 0.01 x 0.001 -> 0
  assert.equal(lineTotal(99_999_999_999, 999_999), Number((99_999_999_999n * 999_999n + 500n) / 1000n)); // large values stay exact
});

test('formatMoney shows decimals only when needed', () => {
  assert.equal(formatMoney(120000), 'Br 1,200');
  assert.equal(formatMoney(120050), 'Br 1,200.50');
  assert.equal(formatMoney(120000, { alwaysDecimals: true }), 'Br 1,200.00');
  assert.equal(formatMoney(-5000), 'Br -50');
  assert.equal(formatMoney(5, { symbolAfter: true }), '0.05 Br');
});

test('quantity parsing and formatting', () => {
  assert.equal(parseQty('2'), 2000);
  assert.equal(parseQty('0,5'), 500);
  assert.equal(parseQty('2.250'), 2250);
  for (const bad of ['0', '-1', '1.2345', 'x', '']) assert.equal(parseQty(bad), null);
  assert.equal(formatQty(2500), '2.5');
  assert.equal(formatQty(3000), '3');
  assert.equal(formatQty(250), '0.25');
});
