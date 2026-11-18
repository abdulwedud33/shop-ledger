import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rangeFor } from '../../src/domain/dates';

const TZ = 'Africa/Addis_Ababa'; // UTC+3, no daylight saving

test('today is cut at local midnight', () => {
  const now = Date.parse('2026-10-28T10:00:00Z'); // 13:00 local
  const r = rangeFor('today', TZ, now);
  assert.equal(r.from, '2026-10-27T21:00:00.000Z');
  assert.equal(r.to, '2026-10-28T21:00:00.000Z');
});

test('late evening UTC is already tomorrow locally', () => {
  const now = Date.parse('2026-10-28T22:30:00Z'); // 01:30 on the 29th local
  const r = rangeFor('today', TZ, now);
  assert.equal(r.from, '2026-10-28T21:00:00.000Z');
});

test('week starts on Monday and month on the 1st', () => {
  const now = Date.parse('2026-10-28T10:00:00Z'); // Wednesday
  const w = rangeFor('week', TZ, now);
  assert.equal(w.from, '2026-10-25T21:00:00.000Z'); // Monday 26th local midnight
  assert.equal(w.to, '2026-11-01T21:00:00.000Z');
  const m = rangeFor('month', TZ, now);
  assert.equal(m.from, '2026-09-30T21:00:00.000Z'); // 1 Oct local midnight
  assert.equal(m.to, '2026-10-31T21:00:00.000Z');
});

test('UTC works and December rolls into the next year', () => {
  const m = rangeFor('month', 'UTC', Date.parse('2026-12-15T12:00:00Z'));
  assert.equal(m.from, '2026-12-01T00:00:00.000Z');
  assert.equal(m.to, '2027-01-01T00:00:00.000Z');
});
