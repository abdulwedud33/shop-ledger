import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ERROR_CODES, translateError } from '../../src/domain/errors';
import { en } from '../../src/i18n/en';
import { am } from '../../src/i18n/am';
import { om } from '../../src/i18n/om';

test('all coded exceptions in migrations 0001-0009 map to known ErrorCodes', () => {
  // Coded exceptions raised by custom PL/pgSQL functions
  const migrationCodes = [
    'VALIDATION',
    'RATE_LIMITED',
    'FORBIDDEN',
    'SESSION_EXPIRED',
    'NOT_FOUND',
    'LIMIT_EXCEEDED',
    'PRICE_CHANGED',
    'STOCK_LOW',
    'OVERPAYMENT',
    'CUSTOMER_REQUIRED'
  ];

  for (const code of migrationCodes) {
    const t = translateError({ message: code, code: 'P0001' });
    assert.equal(t.code, code, `Custom error ${code} must map directly`);
    assert.ok(ERROR_CODES.includes(t.code));
  }

  // Trigger-raised errors
  assert.equal(translateError({ message: 'LEDGER_IMMUTABLE', code: '42501' }).code, 'FORBIDDEN');
});

test('standard PostgreSQL error codes map cleanly to safety categories', () => {
  const pgCodes = [
    { code: '22023', expected: 'VALIDATION' }, // invalid_parameter_value
    { code: '22P02', expected: 'VALIDATION' }, // invalid_text_representation
    { code: '22003', expected: 'VALIDATION' }, // numeric_value_out_of_range
    { code: '23502', expected: 'VALIDATION' }, // not_null_violation
    { code: '23514', expected: 'VALIDATION' }, // check_violation
    { code: '23505', expected: 'DUPLICATE' },  // unique_violation
    { code: '23503', expected: 'NOT_FOUND' },  // foreign_key_violation
    { code: '42501', expected: 'FORBIDDEN' },  // insufficient_privilege
    { code: 'PGRST301', expected: 'SESSION_EXPIRED' },
    { code: 'PGRST116', expected: 'NOT_FOUND' },
  ];

  for (const { code, expected } of pgCodes) {
    const t = translateError({ code, message: 'Internal DB details' });
    assert.equal(t.code, expected, `Postgres code ${code} must map to ${expected}`);
  }
});

test('every ErrorCode has a translated message in en, am, and om catalogs', () => {
  for (const code of ERROR_CODES) {
    const key = `err.${code}`;
    const enText = en[key as keyof typeof en];
    const amText = am[key as keyof typeof am];
    const omText = om[key as keyof typeof om];

    assert.ok(enText && enText.trim().length > 0, `Missing English message for ${key}`);
    assert.ok(amText && amText.trim().length > 0, `Missing Amharic message for ${key}`);
    assert.ok(omText && omText.trim().length > 0, `Missing Afaan Oromo message for ${key}`);

    // No raw error codes or SQL keywords leaking into translation
    assert.doesNotMatch(enText, /sql|database|error code|exception/i);
    assert.doesNotMatch(amText, /sql|database|error code|exception/i);
    assert.doesNotMatch(omText, /sql|database|error code|exception/i);
  }
});
