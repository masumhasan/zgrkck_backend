const test = require('node:test');
const assert = require('node:assert');
const { adaptRecipe, readIntent } = require('../src/services/recipe_adapt.service');

const ing = (name, quantity, unit, extra = {}) => ({ name, quantity, unit, displayText: `${quantity} ${unit} ${name}`, ...extra });
const recipe = () => ({
  yield: { servings: 4 },
  allergens: { contains: ['dairy', 'eggs', 'gluten', 'peanuts'] },
  ingredientGroups: [{
    groupName: 'Ingredients',
    ingredients: [
      ing('butter', 80, 'gram', { metricQuantity: 80, metricUnit: 'gram' }),
      ing('milk', 200, 'milliliter', { metricQuantity: 200, metricUnit: 'milliliter' }),
      ing('plain flour', 100, 'gram'),
      ing('eggs', 2, 'piece'),
      ing('peanut butter', 1, 'tablespoon'),
      ing('egg plants', 1, 'piece'),
      ing('chicken breast', 2, 'piece'),
      ing('soy sauce', 1, 'tablespoon'),
      ing('chicken stock', 500, 'milliliter'),
    ],
  }],
});
const names = (r) => r.lines.map((l) => l.name);

test('prompts are read by code: diets, scaling, and unsupported requests are refused', () => {
  assert.deepStrictEqual(readIntent('Make it dairy-free').tags, ['dairy_free']);
  assert.deepStrictEqual(readIntent('vegan and gluten free please').tags.sort(), ['gluten_free', 'vegan']);
  assert.deepStrictEqual(readIntent('Make it for 6 people').servings, { to: 6 });
  assert.deepStrictEqual(readIntent('double it').servings, { factor: 2 });
  assert.throws(() => adaptRecipe(recipe(), 'make it 20 minutes'), (e) => e.statusCode === 422 && /dairy-free/.test(e.message));
});

test('dairy-free swaps from the table, scales the amount, leaves peanut butter and egg plants alone', () => {
  const r = adaptRecipe(recipe(), 'dairy-free');
  const swap = (from) => r.changes.find((c) => c.from === from);
  assert.strictEqual(swap('butter').to, 'olive oil');
  assert.strictEqual(r.lines.find((l) => l.name === 'olive oil').metricQuantity, 60); // 80 g x 0.75
  assert.strictEqual(swap('milk').to, 'oat milk');
  assert.ok(names(r).includes('peanut butter') && names(r).includes('egg plants'));
  assert.deepStrictEqual(r.remaining, []);
  assert.strictEqual(r.complete, true);
  // dairy is provably gone; the swap's own allergen (oat milk -> gluten) is added, the rest is kept
  assert.ok(!r.contains.includes('dairy'));
  assert.ok(r.contains.includes('eggs') && r.contains.includes('peanuts') && r.contains.includes('gluten'));
});

test('a swap that would add an allergen the user avoids is skipped and the result is not "complete"', () => {
  const r = adaptRecipe(recipe(), 'dairy-free', new Set(['gluten'])); // oat milk would add gluten
  assert.ok(names(r).includes('milk'));
  assert.deepStrictEqual(r.remaining, ['milk']);
  assert.strictEqual(r.complete, false);
  assert.match(r.notes.join(' '), /oat milk/);
  assert.ok(r.contains.includes('dairy')); // milk is still there, so dairy stays listed
});

test('vegan replaces eggs but not eggplant; vegetarian replaces meat and meat stock', () => {
  const v = adaptRecipe(recipe(), 'vegan');
  assert.ok(names(v).includes('flax egg') && !names(v).includes('eggs') && names(v).includes('egg plants'));
  assert.ok(!names(v).some((n) => /chicken/.test(n)));
  assert.strictEqual(v.complete, true);
  const veg = adaptRecipe(recipe(), 'vegetarian');
  assert.ok(names(veg).includes('vegetable stock') && names(veg).includes('firm tofu'));
  assert.ok(veg.contains.includes('soy')); // tofu adds soy
});

test('gluten-free swaps flour and soy sauce, and says what it adds', () => {
  const r = adaptRecipe(recipe(), 'gluten free');
  assert.ok(names(r).includes('gluten-free flour') && names(r).includes('tamari'));
  assert.ok(!r.contains.includes('gluten') && r.contains.includes('soy'));
});

test('scaling only: servings change, every amount follows, nothing is swapped', () => {
  const r = adaptRecipe(recipe(), 'make it for 8 people');
  assert.deepStrictEqual(r.servings, { before: 4, after: 8 });
  assert.strictEqual(r.changes.length, 0);
  assert.strictEqual(r.lines[0].quantity, 160);
  assert.strictEqual(r.lines[0].metricQuantity, 160);
  assert.strictEqual(r.complete, true);
});

test('healthier trims sugar and swaps butter; asking for nothing the table has is not "complete"', () => {
  const sweet = recipe();
  sweet.ingredientGroups[0].ingredients.push(ing('caster sugar', 100, 'gram'));
  const r = adaptRecipe(sweet, 'make it healthier');
  assert.strictEqual(r.lines.find((l) => l.name === 'sugar').quantity, 75);
  const plain = { yield: { servings: 2 }, ingredientGroups: [{ ingredients: [ing('salmon', 2, 'piece')] }] };
  assert.strictEqual(adaptRecipe(plain, 'dairy-free').complete, false);
});

test('when nothing changes the user is told why, not shown a dead end', () => {
  const { nothingMessage } = require('../src/services/recipe_adapt.service');
  const beans = { yield: { servings: 4 }, ingredientGroups: [{ ingredients: [ing('fava beans', 400, 'gram'), ing('olive oil', 2, 'tablespoon')] }] };
  // already vegan: nothing violates it, so nothing needed swapping
  const vegan = adaptRecipe(beans, 'make it vegan');
  assert.deepStrictEqual(vegan.already, ['vegan']);
  assert.match(nothingMessage(vegan), /already looks vegan/);
  // healthier with no matching table entry: honest "no safe swap"
  const healthier = adaptRecipe(beans, 'make it healthier');
  assert.deepStrictEqual(healthier.already, []);
  assert.match(nothingMessage(healthier), /no safe swap for "healthier"/i);
  // a real change, or scaling, has nothing to explain
  assert.strictEqual(nothingMessage(adaptRecipe(recipe(), 'dairy-free')), null);
  assert.strictEqual(nothingMessage(adaptRecipe(beans, 'for 8 people')), null);
});
