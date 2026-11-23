const test = require('node:test');
const assert = require('node:assert');
const { score, tasteKey } = require('../src/services/ranking.service');

const recipe = (cuisine, minutes = 30) => ({ meta: { cuisines: [{ name: cuisine }], tags: [] }, timing: { totalMinutes: minutes } });

test('scoring is deterministic', () => {
  const a = score(recipe('Italian'), { favouriteCuisines: ['Italian'] }, {});
  assert.deepStrictEqual(a, score(recipe('Italian'), { favouriteCuisines: ['Italian'] }, {}));
});

test('cooking a cuisine raises it, skipping lowers it, and the reason says why', () => {
  const base = score(recipe('Thai'), {}, {});
  const liked = score(recipe('Thai'), {}, { [tasteKey('Thai')]: 3 });
  const disliked = score(recipe('Thai'), {}, { [tasteKey('Thai')]: -3 });
  assert.ok(liked.match > base.match && disliked.match < base.match);
  assert.match(liked.reason, /You enjoy Thai/);
});

test('taste learning is capped so one cuisine cannot dominate', () => {
  const huge = score(recipe('Thai'), {}, { thai: 1000 });
  const capped = score(recipe('Thai'), {}, { thai: 3 });
  assert.strictEqual(huge.match, capped.match);
});

test('every score carries a reason line', () => {
  assert.ok(score(recipe('Greek'), {}, {}).reason.length > 0);
});

test('taste keys are safe for Mongo map keys', () => {
  assert.strictEqual(tasteKey('Middle Eastern'), 'middle_eastern');
  assert.doesNotMatch(tasteKey('a.b$c'), /[.$]/);
});
