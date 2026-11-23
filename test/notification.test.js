const test = require('node:test');
const assert = require('node:assert');
const msg = require('../src/services/notification_messages');
const v = require('../src/validators/notification.validator');

test('name lists stay short', () => {
  assert.strictEqual(msg.nameList(['Milk']), 'Milk');
  assert.strictEqual(msg.nameList(['Milk', 'Eggs']), 'Milk and Eggs');
  assert.strictEqual(msg.nameList(['A', 'B', 'C', 'D', 'E']), 'A, B, C and 2 more');
});

test('use it up names the items and the soonest day', () => {
  const today = '2026-11-23';
  assert.strictEqual(msg.useItUp([{ name: 'Spinach', useBy: today }], today).body, 'Spinach needs using today.');
  assert.strictEqual(
    msg.useItUp([{ name: 'Milk', useBy: '2026-11-25' }, { name: 'Eggs', useBy: '2026-11-24' }], today).body,
    'Milk and Eggs need using tomorrow.'
  );
  assert.strictEqual(msg.useItUp([{ name: 'Milk', useBy: '2026-11-25' }], today).body, 'Milk needs using by Nov 25.');
  assert.strictEqual(msg.useItUp([{ name: 'Milk', useBy: today }], today).action, 'pantry');
});

test('plan ready counts the real meals and dates', () => {
  const plan = { startDate: '2026-11-23', endDate: '2026-11-29', days: [{ meals: [{}, {}] }, { meals: [{}] }] };
  assert.strictEqual(msg.planReady(plan).body, '3 meals planned for Nov 23 – Nov 29.');
});

test('weekly report only states what happened', () => {
  assert.strictEqual(msg.weeklyReport({ cooked: 4, planned: 14, weekStart: '2026-11-16' }).body, 'You cooked 4 of 14 planned meals.');
  assert.strictEqual(msg.weeklyReport({ cooked: 1, planned: 0, weekStart: '2026-11-16' }).body, 'You cooked 1 meal.');
  assert.strictEqual(msg.weeklyReport({ cooked: 1, planned: 0, weekStart: '2026-11-16' }).title, 'Your week of Nov 16');
});

test('plan conflict points to the Plan tab', () => {
  const m = msg.planConflict(['Pad Thai']);
  assert.strictEqual(m.body, 'Pad Thai no longer fits your profile. Replace it in the Plan tab.');
  assert.strictEqual(m.action, 'plan');
});

test('validators', () => {
  assert.ok(v.prefsSchema.validate({}).error, 'empty preference update is rejected');
  assert.ifError(v.prefsSchema.validate({ useItUp: false }).error);
  assert.ok(v.prefsSchema.validate({ planConflict: false }).error, 'safety alerts cannot be switched off');
  assert.ok(v.idParamSchema.validate({ id: 'nope' }).error);
  assert.strictEqual(v.listQuerySchema.validate({}).value.limit, 20);
  assert.ok(v.listQuerySchema.validate({ limit: 500 }).error);
});
