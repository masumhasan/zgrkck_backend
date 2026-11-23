const test = require('node:test');
const assert = require('node:assert');
const { parseQuantity } = require('../src/services/shopping_finish.service');

test('reads number and known unit', () => {
  assert.deepStrictEqual(parseQuantity('2 cups'), { qty: '2', unit: 'cups' });
  assert.deepStrictEqual(parseQuantity('500g'), { qty: '500', unit: 'g' });
  assert.deepStrictEqual(parseQuantity('1.5 kg'), { qty: '1.5', unit: 'kg' });
});

test('fractions become decimals', () => {
  assert.deepStrictEqual(parseQuantity('1/2 tsp'), { qty: '0.5', unit: 'tsp' });
});

test('a food word is not a unit, so it counts as pieces', () => {
  assert.deepStrictEqual(parseQuantity('1 onion, chopped'), { qty: '1', unit: 'pcs' });
  assert.deepStrictEqual(parseQuantity('3 eggs'), { qty: '3', unit: 'pcs' });
});

test('unreadable amounts never invent a quantity beyond one piece', () => {
  assert.deepStrictEqual(parseQuantity('to taste'), { qty: '1', unit: 'pcs' });
  assert.deepStrictEqual(parseQuantity(''), { qty: '1', unit: 'pcs' });
  assert.deepStrictEqual(parseQuantity('0 g'), { qty: '1', unit: 'pcs' });
});
