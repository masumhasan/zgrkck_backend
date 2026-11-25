const test = require('node:test');
const assert = require('node:assert');
const { composePlan, validateComposition, slotKey } = require('../src/services/plan_compose.service');

const r = (id, mealTypes) => ({ _id: id, title: `Recipe ${id}`, meta: { mealTypes, cuisines: [{ name: 'Thai' }] }, timing: { totalMinutes: 20 } });
const dinner = [r('a', ['dinner']), r('b', ['dinner']), r('c', ['dinner']), r('d', ['dinner'])];
const breakfast = r('x', ['breakfast']);
const candidates = [...dinner, breakfast];
const pools = { DINNER: dinner, BREAKFAST: [breakfast] };
const byId = new Map(candidates.map((c) => [c._id, c]));
const slots = [
  { date: '2026-11-25', type: 'DINNER' }, { date: '2026-11-26', type: 'DINNER' }, { date: '2026-11-27', type: 'DINNER' },
];
const entry = (date, mealType, recipeId) => ({ date, mealType, recipeId });

test('a valid arrangement is used as given', () => {
  const m = validateComposition({ slots: [entry('2026-11-25', 'DINNER', 'a'), entry('2026-11-26', 'DINNER', 'b'), entry('2026-11-27', 'DINNER', 'c')] }, slots, byId, pools);
  assert.deepStrictEqual([...m.values()].map((x) => x._id), ['a', 'b', 'c']);
});

test('anything the code cannot vouch for is dropped, slot by slot', () => {
  const m = validateComposition({
    slots: [
      entry('2026-11-25', 'DINNER', 'not-a-candidate'), // invented id
      entry('2026-11-26', 'DINNER', 'x'), // a breakfast recipe in a dinner slot
      entry('2026-11-27', 'DINNER', 'a'),
      entry('2026-11-27', 'DINNER', 'b'), // second answer for the same slot
      entry('2026-12-30', 'DINNER', 'c'), // a slot nobody asked for
      entry('2026-11-25', 'LUNCH', 'c'), // a meal type nobody asked for
    ],
  }, slots, byId, pools);
  assert.deepStrictEqual([...m.keys()], [slotKey('2026-11-27', 'DINNER')]);
  assert.strictEqual(m.get(slotKey('2026-11-27', 'DINNER'))._id, 'a');
});

test('no repeats while there are enough candidates, and never the same dinner two days running', () => {
  const m = validateComposition({ slots: [entry('2026-11-25', 'DINNER', 'a'), entry('2026-11-26', 'DINNER', 'a'), entry('2026-11-27', 'DINNER', 'b')] }, slots, byId, pools);
  assert.deepStrictEqual([...m.keys()], [slotKey('2026-11-25', 'DINNER'), slotKey('2026-11-27', 'DINNER')]);
  // with fewer candidates than slots a repeat is allowed, but still not on consecutive days
  const few = new Map([['a', dinner[0]], ['b', dinner[1]]]);
  const m2 = validateComposition({ slots: [entry('2026-11-25', 'DINNER', 'a'), entry('2026-11-26', 'DINNER', 'a'), entry('2026-11-27', 'DINNER', 'a')] }, slots, few, { DINNER: [dinner[0], dinner[1]] });
  assert.deepStrictEqual([...m2.keys()], [slotKey('2026-11-25', 'DINNER'), slotKey('2026-11-27', 'DINNER')]);
});

test('garbage answers produce an empty arrangement, not an error', () => {
  for (const raw of [null, {}, { slots: 'x' }, { slots: [null, 5, {}] }]) assert.strictEqual(validateComposition(raw, slots, byId, pools).size, 0);
});

test('composePlan: calls the model once with candidates only, no personal data', async () => {
  let call;
  const chat = async (args) => { call = args; return { slots: [entry('2026-11-25', 'DINNER', 'a')] }; };
  const m = await composePlan({ slots, candidates, pools, chat, isConfigured: () => true });
  assert.strictEqual(m.size, 1);
  const sent = JSON.parse(call.userText);
  assert.deepStrictEqual(Object.keys(sent).sort(), ['candidates', 'slots']);
  assert.ok(sent.candidates.every((c) => Object.keys(c).every((k) => ['id', 'title', 'mealTypes', 'cuisines', 'minutes', 'kcal'].includes(k))));
});

test('composePlan: no key, too few slots or a failing model all fall back quietly', async () => {
  let called = 0;
  const chat = async () => { called++; throw new Error('429'); };
  assert.strictEqual((await composePlan({ slots, candidates, pools, chat, isConfigured: () => false })).size, 0);
  assert.strictEqual((await composePlan({ slots: slots.slice(0, 2), candidates, pools, chat, isConfigured: () => true })).size, 0);
  assert.strictEqual(called, 0); // neither of those spent a call
  assert.strictEqual((await composePlan({ slots, candidates, pools, chat, isConfigured: () => true })).size, 0);
  assert.strictEqual(called, 1);
});
