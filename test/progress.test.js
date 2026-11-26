const test = require('node:test');
const assert = require('node:assert');
const { proteinByDay, computeBalance } = require('../src/services/progress.service');

const meal = (status, proteinG, nutritionStatus = 'complete') => ({ status, proteinG, nutritionStatus, kcal: 500, mealType: 'DINNER', name: 'x' });

test('protein by day: only cooked meals with computed nutrition count; newest plan wins; Mon-Sun labels', () => {
  const monday = new Date(2026, 10, 23); // Mon 2026-11-23
  const newer = { days: [{ date: '2026-11-23', meals: [meal('cooked', 40), meal('cooked', 25.4), meal('planned', 90), meal('cooked', 50, 'none')] }] };
  const older = { days: [{ date: '2026-11-23', meals: [meal('cooked', 999)] }, { date: '2026-11-24', meals: [meal('cooked', 30)] }] };
  const d = proteinByDay([newer, older], monday);
  assert.strictEqual(d.length, 7);
  assert.deepStrictEqual(d.map((x) => x.dayLabel), ['M', 'T', 'W', 'T', 'F', 'S', 'S']);
  assert.strictEqual(d[0].date, '2026-11-23');
  assert.strictEqual(d[0].protein, 65); // 40 + 25.4, not the planned 90, not the "none" meal, not the older plan
  assert.strictEqual(d[1].protein, 30);
  assert.strictEqual(d[6].protein, 0);
});

test('computeBalance: calculates veg, whole grains, cuisine variety, repeats and tip from cooked logs', () => {
  assert.deepStrictEqual(computeBalance([], new Map()), { balance: null, aiInsight: null });
  const logs = [
    { recipeId: 'r1', cuisine: 'Indian' },
    { recipeId: 'r1', cuisine: 'Indian' },
    { recipeId: 'r2', cuisine: 'Mexican' },
    { recipeId: 'r3', cuisine: 'Italian' },
  ];
  const recipes = new Map([
    ['r1', { ingredientGroups: [{ ingredients: [{ name: 'Spinach', category: 'Produce' }] }] }],
    ['r2', { ingredientGroups: [{ ingredients: [{ name: 'Black beans' }, { name: 'Quinoa' }] }] }],
    ['r3', { ingredientGroups: [{ ingredients: [{ name: 'Tomato', category: 'Produce' }] }] }],
  ]);
  const res = computeBalance(logs, recipes);
  assert.deepStrictEqual(res.balance, {
    vegetables: 75,
    wholeGrains: 25,
    varietyOfCuisines: 75,
    repeatDishes: 25,
  });
  assert.strictEqual(res.aiInsight.title, 'Try one more whole-grain side next week');
  assert.strictEqual(res.aiInsight.subtitle, 'General guidance, not medical or dietary advice');
});
