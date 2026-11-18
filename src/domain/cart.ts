import { lineTotal, sum, type Milli, type Minor } from './money';

export type PayMethod = 'cash' | 'mobile_money' | 'bank' | 'credit';

export interface CartLine {
  productId: string;
  name: string;
  unit: string;
  unitPrice: Minor;
  qty: Milli;
}

export interface Cart {
  lines: readonly CartLine[];
}

export const emptyCart: Cart = { lines: [] };
export const MAX_LINES = 100;

export interface ProductRef {
  id: string;
  name: string;
  unit: string;
  sellPrice: Minor;
}

/** Tap on a tile: +1 whole unit. The same product merges into one line. */
export function addOne(cart: Cart, product: ProductRef, step: Milli = 1000): Cart {
  const existing = cart.lines.find((l) => l.productId === product.id);
  if (existing) {
    return { lines: cart.lines.map((l) => (l.productId === product.id ? { ...l, qty: l.qty + step } : l)) };
  }
  if (cart.lines.length >= MAX_LINES) return cart;
  return {
    lines: [
      ...cart.lines,
      { productId: product.id, name: product.name, unit: product.unit, unitPrice: product.sellPrice, qty: step },
    ],
  };
}

export function removeLine(cart: Cart, productId: string): Cart {
  return { lines: cart.lines.filter((l) => l.productId !== productId) };
}

export function setQty(cart: Cart, productId: string, qty: Milli): Cart {
  if (qty <= 0) return removeLine(cart, productId);
  return { lines: cart.lines.map((l) => (l.productId === productId ? { ...l, qty } : l)) };
}

export function cartTotal(cart: Cart): Minor {
  return sum(cart.lines.map((l) => lineTotal(l.unitPrice, l.qty)));
}

export function creditPortion(total: Minor, paid: Minor): Minor {
  return Math.max(0, total - paid);
}

export type PaymentIssue = 'EMPTY_CART' | 'PAID_EXCEEDS_TOTAL' | 'NEGATIVE_AMOUNT' | 'CUSTOMER_REQUIRED';

export interface PaymentInput {
  total: Minor;
  paid: Minor;
  customerId: string | null;
}

/** Client-side mirror of the server rules, used only for instant feedback. The server decides. */
export function checkPayment(input: PaymentInput): PaymentIssue[] {
  const issues: PaymentIssue[] = [];
  if (input.total <= 0) issues.push('EMPTY_CART');
  if (input.paid < 0) issues.push('NEGATIVE_AMOUNT');
  if (input.paid > input.total) issues.push('PAID_EXCEEDS_TOTAL');
  if (input.paid < input.total && !input.customerId) issues.push('CUSTOMER_REQUIRED');
  return issues;
}

/** The method recorded for a sale: "credit" when nothing was paid now. */
export function effectiveMethod(paid: Minor, chosen: Exclude<PayMethod, 'credit'>): PayMethod {
  return paid === 0 ? 'credit' : chosen;
}
