const test = require('node:test');
const assert = require('node:assert');
const { parseList, parseLine, cleanItem, storageOf, estimateUseBy } = require('../src/utils/pantry_parse.util');

test('the prototype example reads as four items', () => {
  assert.deepStrictEqual(parseList('2 litres milk, a dozen eggs, bananas and coffee'), [
    { name: 'Milk', qty: '2', unit: 'L' },
    { name: 'Eggs', qty: '12', unit: 'pcs' },
    { name: 'Bananas', qty: '1', unit: 'pcs' },
    { name: 'Coffee', qty: '1', unit: 'pcs' },
  ]);
});

test('quantity can come first, fused to its unit, or last', () => {
  assert.deepStrictEqual(parseLine('1.2kg chicken breast'), { name: 'Chicken breast', qty: '1.2', unit: 'kg' });
  assert.deepStrictEqual(parseLine('Tomatoes 1kg'), { name: 'Tomatoes', qty: '1', unit: 'kg' });
  assert.deepStrictEqual(parseLine('eggs x12'), { name: 'Eggs', qty: '12', unit: 'pcs' });
  assert.deepStrictEqual(parseLine('a bunch of spinach'), { name: 'Spinach', qty: '1', unit: 'bunch' });
  assert.deepStrictEqual(parseLine('1/2 cup rice'), { name: 'Rice', qty: '0.5', unit: 'cup' });
});

test('newlines and bullets work; junk and empty input give nothing', () => {
  assert.deepStrictEqual(parseList('- rice\n- 3 onions').map((i) => i.name), ['Rice', 'Onions']);
  assert.deepStrictEqual(parseList('  , ;; '), []);
  assert.deepStrictEqual(parseList(''), []);
  assert.strictEqual(parseList('x, '.repeat(200) + 'milk').length <= 60, true);
});

test('a food word is not mistaken for a unit', () => {
  assert.deepStrictEqual(parseLine('3 eggs'), { name: 'Eggs', qty: '3', unit: 'pcs' });
});

test('receipt lines are cleaned: unknown unit falls back to pieces, bad quantity to one', () => {
  assert.deepStrictEqual(cleanItem({ name: 'milk', quantity: 2, unit: 'litres' }), { name: 'Milk', qty: '2', unit: 'L' });
  assert.deepStrictEqual(cleanItem({ name: 'bread', quantity: null, unit: 'loaf' }), { name: 'Bread', qty: '1', unit: 'pcs' });
  assert.deepStrictEqual(cleanItem({ name: 'x', quantity: -3 }), { name: 'X', qty: '1', unit: 'pcs' });
  assert.strictEqual(cleanItem({ name: '   ' }), null);
});

test('storage follows the ingredient category', () => {
  assert.strictEqual(storageOf('dairy', 'Milk'), 'Fridge');
  assert.strictEqual(storageOf('produce', 'Spinach'), 'Fridge');
  assert.strictEqual(storageOf('produce', 'Bananas'), 'Pantry');
  assert.strictEqual(storageOf('frozen_foods', 'Peas'), 'Freezer');
  assert.strictEqual(storageOf('grains_pasta', 'Rice'), 'Pantry');
  assert.strictEqual(storageOf(null, 'Coffee'), 'Pantry');
});

test('use-by is estimated for fresh food only', () => {
  const today = new Date(2026, 7, 13);
  assert.strictEqual(estimateUseBy('Fridge', 'produce', 'Spinach', today), '2026-08-17');
  assert.strictEqual(estimateUseBy('Fridge', 'poultry', 'Chicken', today), '2026-08-15');
  assert.strictEqual(estimateUseBy('Freezer', 'meat', 'Beef', today), '2026-11-11');
  assert.strictEqual(estimateUseBy('Pantry', 'grains_pasta', 'Rice', today), null);
  assert.strictEqual(estimateUseBy('Fridge', null, 'Mystery', today), null);
});
