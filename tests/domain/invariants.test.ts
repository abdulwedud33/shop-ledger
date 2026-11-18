import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addOne, cartTotal, creditPortion, emptyCart } from '../../src/domain/cart';
import { balance, openCharges } from '../../src/domain/ledger';
import { stockFromMovements } from '../../src/domain/stock';

// Small deterministic PRNG so failures are reproducible.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

test('random sequences: stock equals movements, balance equals ledger, open charges equal balance', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const r = rng(seed);
    let stock = 10_000;
    const movements: number[] = [stock];
    const ledger: { amount: number; at: string }[] = [];
    let day = 1;
    for (let step = 0; step < 60; step++) {
      const dice = r();
      const at = `2026-02-${String((day++ % 28) + 1).padStart(2, '0')}T08:00:00Z`;
      if (dice < 0.5) {
        const qty = Math.floor(r() * 5 + 1) * 1000;
        const cart = addOne(emptyCart, { id: 'p', name: 'P', unit: 'pcs', sellPrice: 1000 + Math.floor(r() * 5000) }, qty);
        const total = cartTotal(cart);
        const paid = r() < 0.5 ? total : Math.floor(total * r());
        stock -= qty;
        movements.push(-qty);
        if (creditPortion(total, paid) > 0) ledger.push({ amount: creditPortion(total, paid), at });
      } else if (dice < 0.8) {
        const owed = balance(ledger);
        if (owed > 0) ledger.push({ amount: -Math.min(owed, Math.floor(owed * r()) + 1), at });
      } else {
        const qty = Math.floor(r() * 10 + 1) * 1000;
        stock += qty;
        movements.push(qty);
      }
    }
    assert.equal(stockFromMovements(movements), stock);
    const owed = balance(ledger);
    assert.ok(owed >= 0);
    assert.equal(openCharges(ledger).reduce((s, o) => s + o.open, 0), owed);
  }
});
