const test = require('node:test');
const assert = require('node:assert/strict');
const { lineFor } = require('../src/utils/recipe_parse.util');

// the AI service and the USDA lookup are stubbed so these run offline and without a database
const stub = (rel, exports) => {
  const p = require.resolve(rel);
  require.cache[p] = { id: p, filename: p, loaded: true, exports };
};
let aiReply = async () => { throw new Error('OpenAI request failed (429)'); };
stub('../src/services/openai_json.service', { configured: () => true, chatJson: (args) => aiReply(args) });
stub('../src/services/import_nutrition.service', { estimateNutrition: async () => ({ status: 'none', perServing: null }) });
const svc = require('../src/services/recipe_import.service');

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const TEXT = 'Toast\nIngredients\n2 slices bread\n1 tbsp butter\nMethod\n1. Toast the bread until golden brown.\n2. Spread the butter on top while it is hot.';

test('stored lines: no unit = a count, no amount = left out of the estimate', () => {
  assert.equal(lineFor({ name: 'eggs', quantity: 2, unit: '' }).unit, 'piece');
  assert.equal(lineFor({ name: 'salt', quantity: null, unit: '' }).unit, 'as_needed');
});

test('AI down: pasted text still imports with the built-in parser', async () => {
  aiReply = async () => { throw new Error('429'); };
  const draft = await svc.fromText(TEXT);
  assert.equal(draft.title, 'Toast');
  assert.equal(draft.ingredients.length, 2);
  assert.equal(draft.steps.length, 2);
  assert.deepEqual(draft.allergens.contains.sort(), ['dairy', 'gluten']);
});

test('AI down: a photo import says it is unavailable (503), not "nothing found"', async () => {
  aiReply = async () => { throw new Error('429'); };
  await assert.rejects(svc.fromPhoto(PNG), (e) => e.statusCode === 503 && e.code === 'PHOTO_UNAVAILABLE' && /isn't available/.test(e.message));
});

test('photo that is not an image is refused before any AI call', async () => {
  let called = false;
  aiReply = async () => { called = true; return {}; };
  await assert.rejects(svc.fromPhoto(Buffer.from('plain text')), (e) => e.statusCode === 415);
  await assert.rejects(svc.fromPhoto(undefined), (e) => e.statusCode === 415);
  assert.equal(called, false);
});

test('AI result is validated: clipped, junk links dropped, nothing readable is refused', async () => {
  aiReply = async () => ({
    title: 'X'.repeat(500),
    servings: 1000,
    imageUrl: 'javascript:alert(1)',
    ingredients: ['2 cups flour', ...Array(200).fill('1 egg')],
    steps: ['Mix. '.repeat(500), ...Array(200).fill('Bake')],
  });
  const draft = await svc.fromPhoto(PNG);
  assert.equal(draft.title.length, 120);
  assert.equal(draft.servings, 4); // out of range -> default, flagged
  assert.ok(draft.uncertain.includes('servings'));
  assert.equal(draft.imageUrl, '');
  assert.equal(draft.ingredients.length, 100);
  assert.equal(draft.steps.length, 100);
  assert.ok(draft.steps[0].length <= 1000);
  assert.equal(draft.source.type, 'photo');

  aiReply = async () => ({ title: '', ingredients: [], steps: [] });
  await assert.rejects(svc.fromPhoto(PNG), (e) => e.statusCode === 422 && /photo/.test(e.message));
});
