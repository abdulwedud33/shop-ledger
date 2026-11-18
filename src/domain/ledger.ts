import { sum, type Minor } from './money';

/**
 * Customer ledger rules (mirrored in SQL, see supabase/migrations/0005_debts.sql):
 * - positive amount = customer owes more (charge, positive adjustment)
 * - negative amount = customer owes less (payment, void reversal)
 * - balance = sum of all lines
 * - FIFO: credits are applied to the oldest charges first; the oldest charge
 *   with an open remainder decides how overdue the customer is.
 */
export interface LedgerLine {
  amount: Minor;
  at: string; // ISO timestamp
}

export function balance(lines: readonly LedgerLine[]): Minor {
  return sum(lines.map((l) => l.amount));
}

export interface OpenCharge {
  at: string;
  open: Minor;
}

export function openCharges(lines: readonly LedgerLine[]): OpenCharge[] {
  const sorted = [...lines].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  const credits = -sum(sorted.filter((l) => l.amount < 0).map((l) => l.amount));
  let cumulative = 0;
  const result: OpenCharge[] = [];
  for (const line of sorted) {
    if (line.amount <= 0) continue;
    cumulative += line.amount;
    const open = Math.max(0, Math.min(line.amount, cumulative - credits));
    if (open > 0) result.push({ at: line.at, open });
  }
  return result;
}

export function oldestOpenChargeAt(lines: readonly LedgerLine[]): string | null {
  const open = openCharges(lines);
  return open.length ? open[0]!.at : null;
}

export function daysBetween(fromIso: string, toIso: string): number {
  const ms = Date.parse(toIso) - Date.parse(fromIso);
  return Math.max(0, Math.floor(ms / 86_400_000));
}

export type AgingBucket = 'current' | 'd8_30' | 'd31_plus';

export function agingBucket(days: number): AgingBucket {
  if (days <= 7) return 'current';
  if (days <= 30) return 'd8_30';
  return 'd31_plus';
}

export function isOverdue(days: number, overdueAfterDays: number): boolean {
  return days >= overdueAfterDays;
}
