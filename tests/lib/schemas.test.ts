import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  signInSchema, signUpSchema, shopNameSchema, productSchema, customerSchema,
  paymentSchema, restockSchema, adjustSchema, reasonSchema, inviteCodeSchema,
  validate
} from '../../src/lib/schemas';

test('signInSchema validates email and password length', () => {
  // Valid
  const v1 = validate(signInSchema, { email: 'user@example.com', password: 'password123' });
  assert.equal(v1.ok, true);

  // Invalid email
  const v2 = validate(signInSchema, { email: 'bad-email', password: 'password123' });
  assert.equal(v2.ok, false);
  if (!v2.ok) assert.equal(v2.errors['email'], 'v.email');

  // Password too short (<10)
  const v3 = validate(signInSchema, { email: 'user@example.com', password: 'short' });
  assert.equal(v3.ok, false);
  if (!v3.ok) assert.equal(v3.errors['password'], 'v.password');
});

test('signUpSchema requires name, email and password', () => {
  const v1 = validate(signUpSchema, { name: 'Abebe Bikila', email: 'abebe@ethio.dev', password: 'secure_password_10' });
  assert.equal(v1.ok, true);

  const v2 = validate(signUpSchema, { name: 'a'.repeat(101), email: 'abebe@ethio.dev', password: 'secure_password_10' });
  assert.equal(v2.ok, false);
  if (!v2.ok) assert.equal(v2.errors['name'], 'v.too_long');
});

test('shopNameSchema enforces 1-80 characters trimmed', () => {
  assert.equal(validate(shopNameSchema, { name: 'Merkato General Store' }).ok, true);
  assert.equal(validate(shopNameSchema, { name: '   ' }).ok, false);
  assert.equal(validate(shopNameSchema, { name: 'x'.repeat(81) }).ok, false);
});

test('productSchema validates name, unit, price, and optional cost/opening/reorder', () => {
  // Valid product with all fields
  const v1 = validate(productSchema, {
    name: 'Teff 1kg',
    unit: 'kg',
    price: '150.00',
    cost: '120.50',
    opening: '10',
    reorder: '5'
  });
  assert.equal(v1.ok, true);

  // Valid product with empty optional fields
  const v2 = validate(productSchema, {
    name: 'Coffee',
    unit: 'pcs',
    price: '25',
    cost: '',
    opening: '',
    reorder: '0'
  });
  assert.equal(v2.ok, true);

  // Invalid price format
  const v3 = validate(productSchema, {
    name: 'Bread',
    unit: 'pcs',
    price: 'free',
    cost: '',
    opening: '0',
    reorder: '0'
  });
  assert.equal(v3.ok, false);
  if (!v3.ok) assert.equal(v3.errors['price'], 'v.number');

  // Negative price
  const v4 = validate(productSchema, {
    name: 'Bread',
    unit: 'pcs',
    price: '-10',
    cost: '',
    opening: '0',
    reorder: '0'
  });
  assert.equal(v4.ok, false);

  // Too long name (>120 chars)
  const v5 = validate(productSchema, {
    name: 'z'.repeat(121),
    unit: 'pcs',
    price: '10',
    cost: '',
    opening: '',
    reorder: ''
  });
  assert.equal(v5.ok, false);
  if (!v5.ok) assert.equal(v5.errors['name'], 'v.too_long');
});

test('customerSchema validates name, phone, and optional credit limit', () => {
  const v1 = validate(customerSchema, {
    name: 'Chaltu Tadesse',
    phone: '+251911223344',
    limit: '500.00'
  });
  assert.equal(v1.ok, true);

  // Name empty
  const v2 = validate(customerSchema, { name: '', phone: '', limit: '' });
  assert.equal(v2.ok, false);
  if (!v2.ok) assert.equal(v2.errors['name'], 'v.required');

  // Phone too long (>30)
  const v3 = validate(customerSchema, { name: 'Almaz', phone: '1'.repeat(31), limit: '' });
  assert.equal(v3.ok, false);
  if (!v3.ok) assert.equal(v3.errors['phone'], 'v.too_long');
});

test('paymentSchema validates positive money amount', () => {
  assert.equal(validate(paymentSchema, { amount: '50.00' }).ok, true);
  assert.equal(validate(paymentSchema, { amount: '1,200.50' }).ok, true);
  assert.equal(validate(paymentSchema, { amount: '' }).ok, false);
  assert.equal(validate(paymentSchema, { amount: 'not_money' }).ok, false);
});

test('restockSchema requires positive qty and optional cost', () => {
  assert.equal(validate(restockSchema, { qty: '10', cost: '8.50' }).ok, true);
  assert.equal(validate(restockSchema, { qty: '0.5', cost: '' }).ok, true);
  assert.equal(validate(restockSchema, { qty: '0', cost: '' }).ok, false); // restock qty must be >0
  assert.equal(validate(restockSchema, { qty: '-5', cost: '' }).ok, false);
});

test('adjustSchema requires non-zero delta and min 3-char reason', () => {
  assert.equal(validate(adjustSchema, { delta: '-3', reason: 'Spoiled milk' }).ok, true);
  assert.equal(validate(adjustSchema, { delta: '5', reason: 'Found stock' }).ok, true);
  assert.equal(validate(adjustSchema, { delta: '0', reason: 'No change' }).ok, false); // 0 delta disallowed
  assert.equal(validate(adjustSchema, { delta: '-1', reason: 'no' }).ok, false); // reason too short (<3)
});

test('reasonSchema validates min 3 and max 200 chars', () => {
  assert.equal(validate(reasonSchema, { reason: 'Wrong price applied' }).ok, true);
  assert.equal(validate(reasonSchema, { reason: 'ab' }).ok, false);
  assert.equal(validate(reasonSchema, { reason: 'a'.repeat(201) }).ok, false);
});

test('inviteCodeSchema validates 8-32 character invite codes', () => {
  assert.equal(validate(inviteCodeSchema, { code: 'A1B2C3D4' }).ok, true);
  assert.equal(validate(inviteCodeSchema, { code: '1234567' }).ok, false); // <8 chars
  assert.equal(validate(inviteCodeSchema, { code: 'x'.repeat(33) }).ok, false); // >32 chars
});
