import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_ATTEMPTS, applyResult, backoffMs, markSyncing, newItem, pickNext, purgeable, recoverStuck, summarize } from '../../src/domain/outbox';

const mk = (id: string, t: number) => newItem({ id, shopId: 's', kind: 'sale', payload: {} }, t);

test('backoff grows, is capped and jittered', () => {
  const mid = () => 1; // max jitter -> exact base
  assert.equal(backoffMs(1, mid), 1000);
  assert.equal(backoffMs(2, mid), 2000);
  assert.equal(backoffMs(4, mid), 8000);
  assert.equal(backoffMs(20, mid), 60000);
  assert.equal(backoffMs(3, () => 0), 2000); // half of 4000
});

test('items are sent in creation order, one at a time', () => {
  const items = [mk('b', 20), mk('a', 10)];
  assert.equal(pickNext(items, 100)?.id, 'a');
  const syncing = [markSyncing(items[1]!, 100), items[0]!];
  assert.equal(pickNext(syncing, 100), null);
});

test('transient failure retries later and blocks later items; permanent failure does not', () => {
  let a = mk('a', 10);
  const b = mk('b', 20);
  a = applyResult(markSyncing(a, 100), { ok: false, code: 'OFFLINE' }, 100, () => 1);
  assert.equal(a.status, 'pending');
  assert.equal(a.attempts, 1);
  assert.equal(pickNext([a, b], 100), null); // blocked until a is due
  assert.equal(pickNext([a, b], a.nextAttemptAt)?.id, 'a');

  const failed = applyResult(markSyncing(mk('c', 5), 100), { ok: false, code: 'VALIDATION' }, 100);
  assert.equal(failed.status, 'failed');
  assert.equal(pickNext([failed, b], 100)?.id, 'b'); // not blocked
});

test('duplicate means already stored, so it counts as synced', () => {
  const r = applyResult(markSyncing(mk('a', 1), 5), { ok: false, code: 'DUPLICATE' }, 6);
  assert.equal(r.status, 'synced');
});

test('gives up after MAX_ATTEMPTS transient failures', () => {
  let item = mk('a', 0);
  for (let i = 0; i < MAX_ATTEMPTS; i++) item = applyResult(markSyncing(item, i), { ok: false, code: 'OFFLINE' }, i, () => 1);
  assert.equal(item.status, 'failed');
});

test('stuck syncing items recover after an app kill', () => {
  const stuck = markSyncing(mk('a', 0), 0);
  assert.equal(recoverStuck([stuck], 10_000)[0]!.status, 'syncing'); // recent, leave alone
  assert.equal(recoverStuck([stuck], 70_000)[0]!.status, 'pending');
});

test('summary and purge', () => {
  const synced = applyResult(markSyncing(mk('a', 0), 1), { ok: true }, 2);
  const pending = mk('b', 3);
  assert.deepEqual(summarize([synced, pending]), { pending: 1, syncing: 0, failed: 0, allSynced: false });
  assert.equal(summarize([synced]).allSynced, true);
  assert.equal(purgeable([synced], 8 * 86_400_000).length, 1);
  assert.equal(purgeable([synced], 1000).length, 0);
});
