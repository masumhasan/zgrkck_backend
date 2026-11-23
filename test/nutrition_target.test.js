const test = require('node:test');
const assert = require('node:assert');
const svc = require('../src/services/nutrition_target.service');

const base = { personalInfo: { age: 30, weight: 45, weightUnit: 'kg', height: 150, heightUnit: 'cm' } };

test('calorie floor by sex is never undercut', () => {
  const female = svc.calculateTarget({ ...base, personalInfo: { ...base.personalInfo, gender: 'Female' }, onboarding: { goal: 'Lose weight' } });
  assert.strictEqual(female.calories, 1200);
  const male = svc.calculateTarget({ ...base, personalInfo: { ...base.personalInfo, gender: 'Male' }, onboarding: { goal: 'Lose weight' } });
  assert.ok(male.calories >= 1500);
});

test('no weight-loss deficit under 18', () => {
  const info = { gender: 'Male', age: 16, weight: 60, height: 170 };
  const lose = svc.calculateTarget({ personalInfo: info, onboarding: { goal: 'Lose weight' } });
  const keep = svc.calculateTarget({ personalInfo: info, onboarding: { goal: 'Eat healthier' } });
  assert.strictEqual(lose.calories, keep.calories);
});

test('consumed starts at zero (nothing invented)', () => {
  const t = svc.calculateTarget({ personalInfo: { gender: 'Male', age: 30, weight: 80, height: 180 }, onboarding: {} });
  assert.deepStrictEqual([t.caloriesConsumed, t.proteinConsumed, t.carbsConsumed, t.fatConsumed], [0, 0, 0, 0]);
});
