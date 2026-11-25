const test = require('node:test');
const assert = require('node:assert');
const { flagged, MESSAGE } = require('../src/services/safety_escalation.service');

test('clear extreme-restriction and disordered-eating signals are flagged', () => {
  for (const q of [
    'meal plan for 500 calories a day', 'I want to eat 800 kcal daily', 'how to starve myself', 'water fast for 5 days',
    'recipes to lose 10 kg in 1 week', 'zero calories diet', 'I need laxatives after eating', 'make myself throw up',
  ]) assert.strictEqual(flagged(q), true, q);
});

test('normal searches are left alone, including ordinary calorie talk', () => {
  for (const q of [
    'high protein chicken under 30 min', 'low calorie dinner', 'a 500 calories lunch idea', 'dinner under 600 calories',
    'fasting-friendly breakfast', 'recipes with 1800 calories a day plan', 'sugar free dessert', 'lose weight healthy dinner',
  ]) assert.strictEqual(flagged(q), false, q);
});

test('the message is supportive, never a number or a body comment', () => {
  assert.match(MESSAGE, /doctor, a dietitian or an eating-disorder support service/);
  assert.doesNotMatch(MESSAGE, /\d/);
  assert.doesNotMatch(MESSAGE, /\b(fat|overweight|thin|skinny)\b/i);
});
