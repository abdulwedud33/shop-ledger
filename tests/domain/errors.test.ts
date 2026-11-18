import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ERROR_CODES, translateError } from '../../src/domain/errors';

test('our coded RPC errors map directly', () => {
  assert.equal(translateError({ message: 'STOCK_LOW', code: 'P0001' }).code, 'STOCK_LOW');
  assert.equal(translateError({ message: 'RATE_LIMITED' }).code, 'RATE_LIMITED');
});

test('network failures become OFFLINE and are transient', () => {
  const t = translateError(new TypeError('Failed to fetch'));
  assert.equal(t.code, 'OFFLINE');
  assert.equal(t.transient, true);
});

test('status and database codes map to friendly categories', () => {
  assert.equal(translateError({ status: 429 }).code, 'RATE_LIMITED');
  assert.equal(translateError({ status: 401 }).code, 'SESSION_EXPIRED');
  assert.equal(translateError({ code: '42501', message: 'new row violates row-level security policy for table "sales"' }).code, 'FORBIDDEN');
  assert.equal(translateError({ code: '23505', message: 'duplicate key value violates unique constraint' }).code, 'DUPLICATE');
  assert.equal(translateError({ code: '23514', message: 'check constraint' }).code, 'VALIDATION');
});

test('no raw backend text can ever leak through the result', () => {
  const nasty = [
    { message: 'relation "public.sales" does not exist', code: '42P01' },
    { message: 'SELECT * FROM users WHERE 1=1; at Object.<anonymous> (/srv/app.js:10:5)' },
    new Error('500 Internal Server Error {"stack":"..."}'),
    'just a string',
    null,
    undefined,
    42,
  ];
  for (const n of nasty) {
    const t = translateError(n);
    assert.ok((ERROR_CODES as readonly string[]).includes(t.code));
    assert.equal(t.messageKey, `err.${t.code}`);
    assert.deepEqual(Object.keys(t).sort(), ['code', 'messageKey', 'transient']);
  }
  assert.equal(translateError({ message: 'relation "public.sales" does not exist', code: '42P01' }).code, 'UNKNOWN');
});
