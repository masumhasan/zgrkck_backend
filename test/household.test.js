const test = require('node:test');
const assert = require('node:assert');
const { unionProfile } = require('../src/services/household.service');
const { buildSafeFilter, isRecipeSafe } = require('../src/services/safety_filter.service');
const { makeCovers, stockOf, initials } = require('../src/services/what_can_i_cook.service');
const { createMemberSchema } = require('../src/validators/household.validator');

const jane = { allergies: [], excludedIngredients: [], diets: [], impliedAllergies: ['Gluten'] }; // Gluten-Free chip
const alex = { allergies: ['Shellfish'], excludedIngredients: [], diets: [] };
const leo = { allergies: ['Peanuts', 'Tree Nuts'], excludedIngredients: ['kiwi'], diets: ['vegetarian'] };

test('union: every eater\'s allergies, ingredients and diets apply, Gluten-Free counts as gluten', () => {
  const p = unionProfile([jane, alex, leo], '15–30 min');
  assert.deepStrictEqual(p.allergies.sort(), ['Gluten', 'Peanuts', 'Shellfish', 'Tree Nuts']);
  assert.deepStrictEqual(p.specificIngredients, ['kiwi']);
  assert.deepStrictEqual(p.dietaryRestrictions, ['vegetarian']);
});

test('union feeds the one safety filter: a recipe unsafe for any single eater is rejected', () => {
  const p = unionProfile([jane, alex, leo]);
  const f = buildSafeFilter(p);
  assert.deepStrictEqual([...f.$and[0]['allergens.contains'].$nin].sort(), ['gluten', 'peanuts', 'shellfish', 'tree_nuts']);
  const safe = { allergens: { contains: ['soy'], freeFrom: ['dairy'] }, meta: { dietaryFlags: ['vegetarian'] } };
  assert.strictEqual(isRecipeSafe(safe, p), true);
  for (const bad of ['gluten', 'shellfish', 'tree_nuts', 'peanuts']) {
    assert.strictEqual(isRecipeSafe({ ...safe, allergens: { contains: [bad], freeFrom: ['dairy'] } }, p), false, bad);
  }
});

test('a lone adult with no rules gets no allergy filter', () => {
  assert.strictEqual(buildSafeFilter(unionProfile([{ allergies: [], excludedIngredients: [], diets: [] }])).$and, undefined);
});

test('pantry matching: whole words, plurals, staples, optional items', () => {
  const covers = makeCovers(['Chicken breast', 'potato', 'Egg', 'onion', 'Pepper']);
  assert.ok(covers('chicken breast'));
  assert.ok(covers('potatoes'));
  assert.ok(covers('eggs'));
  assert.ok(covers('Chopped onions'));
  assert.ok(!covers('egg plants')); // the reported bug: pantry "egg" is not eggplant
  assert.ok(!covers('eggplant'));
  assert.ok(!covers('egg yolk'));
  assert.ok(!covers('chicken stock cube'));
  assert.ok(!covers('red pepper')); // pantry "pepper" is not a red pepper
  assert.ok(!covers('feta'));
  const recipe = {
    ingredientGroups: [{ ingredients: [
      { name: 'Chicken breast' }, { name: 'Salt' }, { name: 'olive oil' }, { name: 'Feta' }, { name: 'Parsley', isOptional: true },
    ] }],
  };
  assert.deepStrictEqual(stockOf(recipe, covers), { total: 2, missing: ['feta'] });
});

test('initials follow the design (JD, AL)', () => {
  assert.strictEqual(initials('Jane Doe'), 'JD');
  assert.strictEqual(initials('alex'), 'AL');
});

test('member validation rejects unknown allergies, odd portions and blank names', () => {
  const ok = { name: ' Leo ', role: 'child', portionFactor: 0.5, allergies: ['Tree Nuts'] };
  assert.strictEqual(createMemberSchema.validate(ok).value.name, 'Leo');
  assert.ok(createMemberSchema.validate({ ...ok, allergies: ['Nuts'] }).error);
  assert.ok(createMemberSchema.validate({ ...ok, portionFactor: 2 }).error);
  assert.ok(createMemberSchema.validate({ ...ok, name: '  ' }).error);
});

test('plans use the union once there are members, and the owner alone otherwise', () => {
  const { householdProfile } = require('../src/services/household.service');
  const me = { goal: 'Eat well', allergies: ['Soy'], hasNoRestrictions: false, cookingTime: '15–30 min' };
  assert.strictEqual(householdProfile(me, []), me);
  const p = householdProfile(me, [{ _id: 'a', name: 'Leo', role: 'child', portionFactor: 0.5, preferences: ['Dairy-Free'], allergies: ['Peanuts'], excludedIngredients: [] }]);
  assert.deepStrictEqual(p.allergies.sort(), ['Dairy', 'Peanuts', 'Soy']);
  assert.strictEqual(p.goal, 'Eat well'); // ranking inputs survive
  assert.strictEqual(p.cookingTime, '15–30 min');
  // "no restrictions" on the owner must not switch off a member's allergy
  const lax = householdProfile({ ...me, hasNoRestrictions: true }, [{ _id: 'a', name: 'Leo', role: 'child', portionFactor: 1, preferences: [], allergies: ['Peanuts'], excludedIngredients: [] }]);
  assert.deepStrictEqual(lax.allergies, ['Peanuts']);
  assert.strictEqual(lax.hasNoRestrictions, false);
});
