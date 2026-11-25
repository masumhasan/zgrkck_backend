const test = require('node:test');
const assert = require('node:assert/strict');
const { eatenSchema, cookedSchema } = require('../src/validators/plan.validator');

const id = 'a'.repeat(24);

test('eaten: a recipe, a day and a meal slot are all required', () => {
  assert.equal(eatenSchema.validate({ recipeId: id, date: '2026-11-25', mealType: 'lunch' }).error, undefined);
  assert.equal(eatenSchema.validate({ recipeId: id, date: '2026-11-25', mealType: 'lunch' }).value.mealType, 'LUNCH');
  assert.ok(eatenSchema.validate({ date: '2026-11-25', mealType: 'LUNCH' }).error); // no recipe
  assert.ok(eatenSchema.validate({ recipeId: id, mealType: 'LUNCH' }).error); // no day
  assert.ok(eatenSchema.validate({ recipeId: id, date: '2026-11-25' }).error); // no slot
  assert.ok(eatenSchema.validate({ recipeId: id, date: '25/11/2026', mealType: 'LUNCH' }).error);
  assert.ok(eatenSchema.validate({ recipeId: id, date: '2026-11-25', mealType: 'BRUNCH' }).error);
});

test('cooked: a recipe alone, a recipe in a slot, or a slot alone (custom entry); nothing else', () => {
  assert.equal(cookedSchema.validate({ recipeId: id }).error, undefined); // cooking straight from a recipe
  assert.equal(cookedSchema.validate({ recipeId: id, date: '2026-11-25', mealType: 'DINNER', rating: 4 }).error, undefined);
  assert.equal(cookedSchema.validate({ date: '2026-11-25', mealType: 'SNACK' }).error, undefined); // custom entry eaten
  assert.ok(cookedSchema.validate({ mealType: 'SNACK' }).error); // slot needs its day
  assert.ok(cookedSchema.validate({ date: '2026-11-25' }).error); // and its meal type
  assert.ok(cookedSchema.validate({}).error); // neither a recipe nor a slot
});
