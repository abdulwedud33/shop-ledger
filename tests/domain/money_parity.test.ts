import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lineTotal, toDecimalString, toMinor, numberToQty, Minor, Milli } from '../../src/domain/money';

/**
 * Exact Postgres NUMERIC multiplication and ROUND(x, 2) simulator.
 * In PostgreSQL, numeric multiplication is exact arbitrary-precision base-10 arithmetic.
 * ROUND(numeric, 2) rounds half-away-from-zero (half-up for non-negative values).
 */
function postgresNumericLineTotal(priceStr: string, qtyStr: string): string {
  // price has up to 2 decimal places, qty has up to 3 decimal places.
  // Parse into exact scaled BigInts
  const [pWhole, pFrac = ''] = priceStr.split('.');
  const pScaled = BigInt(pWhole + pFrac.padEnd(2, '0')); // * 100

  const [qWhole, qFrac = ''] = qtyStr.split('.');
  const qScaled = BigInt(qWhole + qFrac.padEnd(3, '0')); // * 1000

  // Exact product has scale 5 (100 * 1000)
  const product = pScaled * qScaled; // product in 10^-5 units

  // To round to scale 2 (cents, 10^-2 units), we inspect digit at scale 3 (10^-3)
  // Which corresponds to dividing by 1000 with half-up rounding:
  // If remainder when divided by 1000 is >= 500, round up.
  const quotient = product / 1000n;
  const remainder = product % 1000n;
  const roundedCents = remainder >= 500n ? quotient + 1n : quotient;

  const sign = roundedCents < 0n ? '-' : '';
  const abs = roundedCents < 0n ? -roundedCents : roundedCents;
  const whole = abs / 100n;
  const cents = abs % 100n;
  return `${sign}${whole}.${String(cents).padStart(2, '0')}`;
}

test('money parity: boundary half-up cases match Postgres numeric round()', () => {
  const cases: Array<{ price: string; qty: string; expected: string }> = [
    // 1.00 * 0.005 = 0.005 -> rounds to 0.01
    { price: '1.00', qty: '0.005', expected: '0.01' },
    // 1.00 * 0.004 = 0.004 -> rounds to 0.00
    { price: '1.00', qty: '0.004', expected: '0.00' },
    // 3.33 * 0.500 = 1.665 -> rounds to 1.67
    { price: '3.33', qty: '0.500', expected: '1.67' },
    // 10.00 * 2.500 = 25.000 -> 25.00
    { price: '10.00', qty: '2.500', expected: '25.00' },
    // 50.00 * 0.001 = 0.050 -> 0.05
    { price: '50.00', qty: '0.001', expected: '0.05' },
    // 0.01 * 0.001 = 0.00001 -> 0.00
    { price: '0.01', qty: '0.001', expected: '0.00' },
    // 0.01 * 50.000 = 0.500 -> 0.50
    { price: '0.01', qty: '50.000', expected: '0.50' },
    // 12.34 * 5.678 = 70.06652 -> rounds to 70.07
    { price: '12.34', qty: '5.678', expected: '70.07' },
    // 9999.99 * 999.999 = 9999980.00001 -> 9999980.00
    { price: '9999.99', qty: '999.999', expected: '9999980.00' },
  ];

  for (const c of cases) {
    const minorPrice = toMinor(c.price);
    const milliQty = numberToQty(c.qty);
    const clientResult = toDecimalString(lineTotal(minorPrice, milliQty));
    const pgResult = postgresNumericLineTotal(c.price, c.qty);

    assert.equal(clientResult, c.expected, `client lineTotal(${c.price}, ${c.qty}) should be ${c.expected}`);
    assert.equal(pgResult, c.expected, `pg simulator(${c.price}, ${c.qty}) should be ${c.expected}`);
    assert.equal(clientResult, pgResult, `parity check failed for ${c.price} * ${c.qty}`);
  }
});

test('money parity: 10,000 random inputs match exact Postgres numeric round(price * qty, 2)', () => {
  // Deterministic pseudo-random sequence for repeatability
  let seed = 42;
  function rnd(): number {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  }

  for (let i = 0; i < 10_000; i++) {
    // Price between 0.01 and 10000.00
    const priceCents = Math.floor(rnd() * 1_000_000) + 1; // 1 to 1,000,000 cents
    const priceWhole = Math.floor(priceCents / 100);
    const priceFrac = String(priceCents % 100).padStart(2, '0');
    const priceStr = `${priceWhole}.${priceFrac}`;

    // Qty between 0.001 and 1000.000
    const qtyMilli = Math.floor(rnd() * 1_000_000) + 1; // 1 to 1,000,000 milli
    const qtyWhole = Math.floor(qtyMilli / 1000);
    const qtyFrac = String(qtyMilli % 1000).padStart(3, '0');
    const qtyStr = `${qtyWhole}.${qtyFrac}`;

    const clientTotal = lineTotal(priceCents as Minor, qtyMilli as Milli);
    const clientStr = toDecimalString(clientTotal);
    const pgStr = postgresNumericLineTotal(priceStr, qtyStr);

    assert.equal(
      clientStr,
      pgStr,
      `Mismatch on iteration ${i}: price=${priceStr}, qty=${qtyStr} => client=${clientStr}, pg=${pgStr}`
    );
  }
});
