const test = require('node:test');
const assert = require('node:assert');
const { buildSafeFilter, isRecipeSafe, normaliseAllergen } = require('../src/services/safety_filter.service');

const ALLERGIES = ['Dairy', 'Peanuts', 'Tree Nuts', 'Gluten', 'Eggs', 'Shellfish', 'Fish', 'Soy', 'Sesame', 'Sulfites'];

test('onboarding allergy labels map to dataset keys (tree nuts -> tree_nuts)', () => {
  assert.strictEqual(normaliseAllergen('Tree Nuts'), 'tree_nuts');
  const f = buildSafeFilter({ allergies: ['Tree Nuts'] });
  assert.deepStrictEqual(f.$and[0], { 'allergens.contains': { $nin: ['tree_nuts'] } });
});

test('allergic user is never served a recipe containing, possibly containing, or lacking allergen data', () => {
  const me = { allergies: ['Tree Nuts'] };
  assert.strictEqual(isRecipeSafe({ allergens: { contains: ['tree_nuts'] } }, me), false);
  assert.strictEqual(isRecipeSafe({ allergens: { contains: [], mayContain: ['tree_nuts'], freeFrom: ['soy'] } }, me), false);
  assert.strictEqual(isRecipeSafe({ allergens: {} }, me), false);
  assert.strictEqual(isRecipeSafe({ allergens: { contains: ['soy'], freeFrom: ['dairy'] } }, me), true);
});

test('vegan beats vegetarian and needs the vegan flag', () => {
  const me = { dietaryPreference: 'Vegetarian', dietaryRestrictions: ['Vegan'] };
  assert.deepStrictEqual(buildSafeFilter(me).$and[0], { 'meta.dietaryFlags': 'vegan' });
  assert.strictEqual(isRecipeSafe({ meta: { dietaryFlags: ['vegetarian'] } }, me), false);
});

test('blank or regex-special avoid entries cannot break or wipe the query', () => {
  const f = buildSafeFilter({ specificIngredients: ['  ', 'a.*(b'] });
  const rx = f.$and[0]['ingredientGroups.ingredients.name'].$nin;
  assert.strictEqual(rx.length, 1);
  assert.ok(rx[0].test('A.*(B sauce'));
  assert.ok(!rx[0].test('anything else'));
});

test('hasNoRestrictions skips allergy rules', () => {
  const f = buildSafeFilter({ hasNoRestrictions: true, allergies: ['Soy'] });
  assert.strictEqual(f.$and, undefined);
});

// Live-data matrix: needs MONGODB_URI, skipped otherwise.
test('live DB: no recipe returned for an allergy contains that allergen', async (t) => {
  require('dotenv').config();
  if (!process.env.MONGODB_URI) return t.skip('no MONGODB_URI');
  const mongoose = require('mongoose');
  const { Recipe } = require('../src/models/recipe.model');
  await mongoose.connect(process.env.MONGODB_URI);
  try {
    for (const a of ALLERGIES) {
      const docs = await Recipe.find(buildSafeFilter({ allergies: [a] })).select('allergens meta').limit(300).lean();
      const key = normaliseAllergen(a);
      assert.ok(docs.length > 0, `${a}: expected some safe recipes`);
      for (const d of docs) {
        assert.ok(!(d.allergens.contains || []).includes(key), `${a} leaked into ${d._id}`);
        assert.ok(isRecipeSafe(d, { allergies: [a] }), `${a}: code re-check failed for ${d._id}`);
      }
    }
  } finally {
    await mongoose.disconnect();
  }
});
