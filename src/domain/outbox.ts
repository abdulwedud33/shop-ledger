import { isTransient, type ErrorCode } from './errors';

/**
 * Offline outbox rules. Storage (IndexedDB) lives in src/data; this file is the
 * pure state machine so it can be tested without a browser.
 *
 * Guarantees:
 * - Items are sent in creation order (a customer created offline is sent before
 *   the sale that uses them).
 * - A transient failure blocks later items until it clears (order matters).
 * - A permanent failure marks that item `failed` and does NOT block the rest.
 * - Replays are safe: the server is idempotent on the item id (`client_id`).
 */
export type OutboxKind = 'sale' | 'payment' | 'stock_in' | 'customer' | 'product' | 'void_sale' | 'adjust_stock';
export type OutboxStatus = 'pending' | 'syncing' | 'synced' | 'failed';

export interface OutboxItem {
  id: string; // client-generated UUID, also the idempotency key
  shopId: string;
  kind: OutboxKind;
  payload: unknown;
  status: OutboxStatus;
  attempts: number;
  createdAt: number; // ms
  nextAttemptAt: number; // ms
  startedAt?: number; // ms, set while syncing
  lastErrorCode?: ErrorCode;
}

export const MAX_ATTEMPTS = 8;
export const STUCK_AFTER_MS = 60_000;

export function newItem(
  input: { id: string; shopId: string; kind: OutboxKind; payload: unknown },
  now: number,
): OutboxItem {
  return { ...input, status: 'pending', attempts: 0, createdAt: now, nextAttemptAt: now };
}

/** Exponential backoff with jitter: ~1s, 2s, 4s ... capped at 60s. */
export function backoffMs(attempts: number, rand: () => number = Math.random): number {
  const base = Math.min(60_000, 1000 * 2 ** Math.max(0, attempts - 1));
  return Math.round(base * (0.5 + rand() * 0.5));
}

/** The next item to send, or null. Order is preserved: a waiting transient failure blocks later items. */
export function pickNext(items: readonly OutboxItem[], now: number): OutboxItem | null {
  const ordered = [...items].sort((a, b) => a.createdAt - b.createdAt);
  for (const item of ordered) {
    if (item.status === 'synced' || item.status === 'failed') continue;
    if (item.status === 'syncing') return null; // one at a time
    return item.nextAttemptAt <= now ? item : null;
  }
  return null;
}

export function markSyncing(item: OutboxItem, now: number): OutboxItem {
  return { ...item, status: 'syncing', startedAt: now };
}

export type SendResult = { ok: true } | { ok: false; code: ErrorCode };

export function applyResult(item: OutboxItem, result: SendResult, now: number, rand: () => number = Math.random): OutboxItem {
  const { startedAt: _startedAt, ...rest } = item;
  if (result.ok || result.code === 'DUPLICATE') {
    return { ...rest, status: 'synced', attempts: item.attempts + 1, lastErrorCode: undefined };
  }
  const attempts = item.attempts + 1;
  if (isTransient(result.code) && attempts < MAX_ATTEMPTS) {
    return { ...rest, status: 'pending', attempts, nextAttemptAt: now + backoffMs(attempts, rand), lastErrorCode: result.code };
  }
  return { ...rest, status: 'failed', attempts, lastErrorCode: result.code };
}

/** After an app kill, items stuck in `syncing` go back to `pending` (replay is safe). */
export function recoverStuck(items: readonly OutboxItem[], now: number): OutboxItem[] {
  return items.map((i) => {
    if (i.status !== 'syncing') return i;
    if (i.startedAt !== undefined && now - i.startedAt < STUCK_AFTER_MS) return i;
    const { startedAt: _s, ...rest } = i;
    return { ...rest, status: 'pending' as const, nextAttemptAt: now };
  });
}

export interface OutboxSummary {
  pending: number;
  syncing: number;
  failed: number;
  allSynced: boolean;
}

export function summarize(items: readonly OutboxItem[]): OutboxSummary {
  const count = (s: OutboxStatus) => items.filter((i) => i.status === s).length;
  const pending = count('pending');
  const syncing = count('syncing');
  const failed = count('failed');
  return { pending, syncing, failed, allSynced: pending + syncing + failed === 0 };
}

/** Synced items older than this can be removed from local storage. */
export function purgeable(items: readonly OutboxItem[], now: number, keepMs = 7 * 86_400_000): OutboxItem[] {
  return items.filter((i) => i.status === 'synced' && now - i.createdAt > keepMs);
}
