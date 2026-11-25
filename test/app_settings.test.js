const test = require('node:test');
const assert = require('node:assert');
const { appSettingsSchema } = require('../src/validators/app_settings.validator');

const ok = (body) => !appSettingsSchema.validate(body).error;

test('accepts each settings field on its own', () => {
  assert.ok(ok({ units: 'imperial' }));
  assert.ok(ok({ mealSchedule: ['Breakfast', 'Snacks'] }));
  assert.ok(ok({ planningDay: 'Off' }));
  assert.ok(ok({ cookingReminder: { time: '07:05' } }));
});

test('rejects empty, unknown and malformed values', () => {
  assert.ok(!ok({}));
  assert.ok(!ok({ units: 'stone' }));
  assert.ok(!ok({ mealSchedule: [] }));
  assert.ok(!ok({ mealSchedule: ['Lunch', 'Lunch'] }));
  assert.ok(!ok({ planningDay: 'Someday' }));
  assert.ok(!ok({ cookingReminder: { time: '25:00' } }));
  assert.ok(!ok({ cookingReminder: {} }));
});
