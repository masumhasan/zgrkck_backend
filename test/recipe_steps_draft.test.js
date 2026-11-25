const test = require('node:test');
const assert = require('node:assert');
const { cleanSteps } = require('../src/services/recipe_steps_draft.service');

test('cleanSteps keeps only clean, numbered-prefix-free strings and caps the count', () => {
  assert.deepStrictEqual(cleanSteps({ steps: ['1. Chop onions', '  Fry them ', '', 5, null] }), ['Chop onions', 'Fry them']);
  assert.strictEqual(cleanSteps({ steps: Array(30).fill('Stir') }).length, 12);
  assert.deepStrictEqual(cleanSteps({ steps: 'nope' }), []);
  assert.deepStrictEqual(cleanSteps(null), []);
});
