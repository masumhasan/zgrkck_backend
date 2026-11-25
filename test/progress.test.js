const test = require('node:test');
const assert = require('node:assert');
const { proteinByDay } = require('../src/services/progress.service');

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
