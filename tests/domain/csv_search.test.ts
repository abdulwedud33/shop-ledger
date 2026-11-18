import { test } from 'node:test';
import assert from 'node:assert/strict';
import { csvCell, toCsv } from '../../src/domain/csv';
import { filterBy, matchScore, normalize } from '../../src/domain/search';
import { receiptText } from '../../src/domain/receipt';

test('csv blocks formula injection and escapes properly', () => {
  assert.equal(csvCell('=SUM(A1)'), "'=SUM(A1)");
  assert.equal(csvCell('+1'), "'+1");
  assert.equal(csvCell('@x'), "'@x");
  assert.equal(csvCell('-5'), "'-5");
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell(null), '');
  assert.equal(toCsv([['a', 1], ['=x', 'y']]), "a,1\r\n'=x,y\r\n");
});

test('search matches word starts first and supports Ge\'ez text', () => {
  assert.equal(normalize('  Sugar  1KG '), 'sugar 1kg');
  assert.ok(matchScore('sug', 'Sugar 1kg')! < matchScore('gar', 'Sugar 1kg')!);
  assert.equal(matchScore('xyz', 'Sugar'), null);
  const items = ['ስኳር', 'ዘይት', 'Sugar'];
  assert.deepEqual(filterBy(items, 'ስኳ', (x) => x), ['ስኳር']);
  assert.deepEqual(filterBy(items, '', (x) => x, 2), ['ስኳር', 'ዘይት']);
});

test('receipt text lists lines, total and the unpaid part', () => {
  const text = receiptText({
    shopName: 'Shop', at: new Date('2026-10-28T10:00:00Z'), locale: 'en', total: 10000, paid: 4000, customerName: 'Abel',
    lines: [{ productId: 'p', name: 'Sugar', unit: 'kg', unitPrice: 5000, qty: 2000 }],
    labels: { title: 'Receipt', total: 'Total', paid: 'Paid now', credit: 'On credit', thanks: 'Thanks' },
  });
  assert.match(text, /Sugar {2}2 kg x Br 50 = Br 100/);
  assert.match(text, /On credit: Br 60/);
  assert.match(text, /Abel/);
});
