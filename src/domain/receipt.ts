import { formatMoney, formatQty, lineTotal } from './money';
import type { CartLine } from './cart';

/** Plain-text receipt for sharing through any app (no printer needed). */
export function receiptText(input: {
  shopName: string; lines: readonly CartLine[]; total: number; paid: number;
  customerName?: string | null; at: Date; locale: string; labels: { title: string; total: string; paid: string; credit: string; thanks: string };
}): string {
  const money = (n: number) => formatMoney(n, { locale: input.locale });
  const rows = input.lines.map((l) => `${l.name}  ${formatQty(l.qty, input.locale)} ${l.unit} x ${money(l.unitPrice)} = ${money(lineTotal(l.unitPrice, l.qty))}`);
  const out = [input.shopName, `${input.labels.title} - ${input.at.toLocaleString(input.locale)}`];
  if (input.customerName) out.push(input.customerName);
  out.push('', ...rows, '', `${input.labels.total}: ${money(input.total)}`, `${input.labels.paid}: ${money(input.paid)}`);
  if (input.paid < input.total) out.push(`${input.labels.credit}: ${money(input.total - input.paid)}`);
  out.push('', input.labels.thanks);
  return out.join('\n');
}
