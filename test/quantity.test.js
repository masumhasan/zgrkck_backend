const test = require('node:test');
const assert = require('node:assert');
const { amountOf, baseAmount, formatAmount, formatTotals } = require('../src/utils/quantity.util');

test('units fold into one family and format back sensibly', () => {
  const total = baseAmount(300, 'g').amount + baseAmount(0.4, 'kg').amount;
  assert.strictEqual(formatAmount('mass', total), '700 g');
  assert.strictEqual(formatAmount('mass', 250), '250 g');
  assert.strictEqual(formatAmount('volume', baseAmount(2, 'tbsp').amount), '30 ml');
  assert.strictEqual(formatAmount('volume', baseAmount(1.5, 'l').amount), '1.5 l');
});

test('counts round up (you cannot buy 2.2 onions) and odd units only add with themselves', () => {
  assert.strictEqual(formatAmount('count', baseAmount(1.1, '').amount * 2), '3');
  assert.strictEqual(formatAmount('unit:bunch', 2), '2 bunch');
  assert.strictEqual(baseAmount(1, 'bunch').family, 'unit:bunch');
  assert.notStrictEqual(baseAmount(1, 'bunch').family, baseAmount(1, 'clove').family);
});

test('metric fields win, servings scale, unreadable amounts are not invented', () => {
  const ing = { quantity: 2, unit: 'cups', metricQuantity: 480, metricUnit: 'ml' };
  assert.deepStrictEqual(amountOf(ing, 1.5), { family: 'volume', amount: 720 });
  assert.strictEqual(amountOf({ name: 'salt', displayText: 'to taste' }), null);
  assert.strictEqual(amountOf({ quantity: 0, unit: 'g' }), null);
  assert.strictEqual(formatTotals(new Map([['mass', 700], ['count', 2]])), '700 g + 2');
});

test('the dataset spells units out (gram, milliliter, kilogram); vague amounts stay unreadable', () => {
  assert.deepStrictEqual(baseAmount(500, 'gram'), { family: 'mass', amount: 500 });
  assert.deepStrictEqual(baseAmount(2, 'kilogram'), { family: 'mass', amount: 2000 });
  assert.deepStrictEqual(baseAmount(45, 'milliliter'), { family: 'volume', amount: 45 });
  assert.strictEqual(baseAmount(1, 'as_needed'), null);
  assert.strictEqual(baseAmount(1, 'to_taste'), null);
});
