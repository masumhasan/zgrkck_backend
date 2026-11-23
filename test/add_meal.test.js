const test = require('node:test');
const assert = require('node:assert');
const { addMealSchema } = require('../src/validators/plan.validator');
const mealPlanService = require('../src/services/meal_plan.service');

const slot = { date: '2026-11-22', mealType: 'dinner' };
const check = (body) => addMealSchema.validate(body, { stripUnknown: true });

test('a recipe, a custom entry, or neither (let Mealist choose) are all valid', () => {
  assert.ifError(check({ ...slot, recipeId: 'a'.repeat(24) }).error);
  assert.ifError(check({ ...slot, customName: 'Leftover pizza', kcal: 600 }).error);
  const chosen = check(slot);
  assert.ifError(chosen.error);
  assert.strictEqual(chosen.value.mealType, 'DINNER');
  assert.strictEqual(chosen.value.replace, false);
});

test('a recipe and a custom name together are rejected', () => {
  assert.ok(check({ ...slot, recipeId: 'a'.repeat(24), customName: 'Pizza' }).error);
});

test('kcal only belongs to a custom entry', () => {
  assert.ok(check({ ...slot, recipeId: 'a'.repeat(24), kcal: 500 }).error);
  assert.ok(check({ ...slot, kcal: 500 }).error);
});

test('servings stay within 1-12', () => {
  assert.ok(check({ ...slot, servings: 0 }).error);
  assert.ok(check({ ...slot, servings: 13 }).error);
  assert.ifError(check({ ...slot, servings: 4 }).error);
});

test('slot budget is the slot share of the day target', () => {
  assert.deepStrictEqual(mealPlanService.slotBudget('DINNER', { calories: 2000, protein: 120 }), {
    time: '7:30 PM',
    kcal: 700,
    proteinG: 42,
  });
  assert.strictEqual(mealPlanService.slotBudget('BREAKFAST', {}).kcal, 475); // default 1900 target
});
