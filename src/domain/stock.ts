import { sum, type Milli } from './money';

/** Stock is always the sum of its movements (never typed in directly). */
export function stockFromMovements(deltas: readonly Milli[]): Milli {
  return sum(deltas);
}

export function isLowStock(stockQty: Milli, reorderLevel: Milli): boolean {
  return stockQty <= reorderLevel;
}

export type StockWarning = 'NONE' | 'LOW_AFTER_SALE' | 'INSUFFICIENT';

/** Warning for a sale of `requested`. Blocks only when the shop setting says so. */
export function stockCheck(
  stockQty: Milli,
  requested: Milli,
  reorderLevel: Milli,
  allowNegative: boolean,
): { warning: StockWarning; blocked: boolean } {
  const after = stockQty - requested;
  const warning: StockWarning = after < 0 ? 'INSUFFICIENT' : after <= reorderLevel ? 'LOW_AFTER_SALE' : 'NONE';
  return { warning, blocked: !allowNegative && after < 0 };
}
