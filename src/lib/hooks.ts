'use client';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import { summarize, type OutboxSummary } from '../domain/outbox';

/** Live view of what is waiting to be sent. */
export function useSyncSummary(shopId: string | undefined): OutboxSummary & { loaded: boolean } {
  const items = useLiveQuery(() => (shopId ? db.outbox.where('shopId').equals(shopId).toArray() : []), [shopId]);
  if (!items) return { pending: 0, syncing: 0, failed: 0, allSynced: true, loaded: false };
  return { ...summarize(items), loaded: true };
}
