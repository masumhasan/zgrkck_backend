const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('zlib');
const { parseCsv } = require('../src/utils/csv.util');
const { readZipEntries } = require('../src/utils/zip.util');
const { lineMeasure, gramsFor } = require('../src/utils/nutrition_weight.util');
const { buildIndex, matchIngredient } = require('../src/services/usda_matcher.service');
const { computeRecipeNutrition, decideNutrition } = require('../src/services/recipe_nutrition.service');
const { dayNutrition } = require('../src/services/meal_plan.service');
const { publicNutrition } = require('../src/utils/nutrition_public.util');

const food = (fdcId, description, kcal, extra = {}) => ({
  fdcId,
  description,
  dataType: 'sr_legacy',
  nutrients: { kcal, protein: 10, carbs: 20, fat: 5, fibre: 2, sugar: 1, sodium: 100, ...extra.nutrients },
  portions: extra.portions || [],
});

test('csv: quotes, escaped quotes, BOM, CRLF', () => {
  const rows = parseCsv('﻿"a","b"\r\n"x, y","say ""hi"""\r\n');
  assert.deepEqual(rows, [{ a: 'x, y', b: 'say "hi"' }]);
});

test('zip: reads stored and deflated entries by base name', () => {
  const entry = (name, data, method) => {
    const body = method === 8 ? zlib.deflateRawSync(data) : data;
    const nameBuf = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(method, 8); local.writeUInt32LE(body.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameBuf.length, 26);
    return { nameBuf, body, local, method, size: data.length };
  };
  const entries = [entry('dir/food.csv', Buffer.from('id\n1\n'), 8), entry('dir/other.csv', Buffer.from('x'), 0)];
  let offset = 0;
  const chunks = [];
  const central = [];
  for (const e of entries) {
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(e.method, 10); c.writeUInt32LE(e.body.length, 20); c.writeUInt32LE(e.size, 24); c.writeUInt16LE(e.nameBuf.length, 28); c.writeUInt32LE(offset, 42);
    central.push(c, e.nameBuf);
    chunks.push(e.local, e.nameBuf, e.body);
    offset += 30 + e.nameBuf.length + e.body.length;
  }
  const centralBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(entries.length, 10); eocd.writeUInt32LE(centralBuf.length, 12); eocd.writeUInt32LE(offset, 16);
  const zip = Buffer.concat([...chunks, centralBuf, eocd]);
  assert.equal(readZipEntries(zip, ['food.csv'])['food.csv'].toString(), 'id\n1\n');
  assert.throws(() => readZipEntries(zip, ['missing.csv']), /missing/);
});

test('weights: metric, density from a volume portion, count portions, caps, negligible', () => {
  const oil = food(1, 'Oil, olive', 884, { portions: [{ amount: 1, unit: 'tablespoon', text: ' tbsp', g: 13.5 }] });
  const garlic = food(2, 'Garlic, raw', 143, { portions: [{ amount: 1, unit: '', text: ' clove', g: 3 }] });
  const loin = food(3, 'Pork, loin', 167, { portions: [{ amount: 1, unit: '', text: ' loin', g: 3950 }] });
  assert.equal(gramsFor(lineMeasure({ metricUnit: 'kilogram', metricQuantity: 1 }), garlic), 1000);
  assert.ok(Math.abs(gramsFor(lineMeasure({ metricUnit: 'milliliter', metricQuantity: 45 }), oil) - 41) < 0.5);
  assert.equal(gramsFor(lineMeasure({ unit: 'clove', quantity: 3 }), garlic), 9);
  assert.equal(gramsFor(lineMeasure({ unit: 'piece', quantity: 2 }), loin), null); // whole-cut portion rejected
  assert.equal(gramsFor(lineMeasure({ unit: 'knob', quantity: 1 }), oil), 15); // generic count weight
  assert.equal(lineMeasure({ unit: 'pinch', quantity: 1 }).skip, true);
  assert.equal(lineMeasure({ unit: 'to_taste', quantity: 0 }).skip, true);
});

test('matcher: exact name beats look-alikes, brackets are searchable, overrides win', () => {
  const index = buildIndex([
    food(1, 'Sugar-apples, (sweetsop), raw', 94),
    food(2, 'Sugars, granulated', 387),
    food(3, 'Coriander (cilantro) leaves, raw', 23),
    food(4, 'Milk, sheep, fluid', 108),
    food(5, 'Milk, whole, 3.25% milkfat', 61),
  ]);
  assert.equal(matchIngredient('sugar', index).food.fdcId, 2);
  assert.equal(matchIngredient('coriander', index).food.fdcId, 3);
  const pinned = matchIngredient('milk', index, { milk: 'Milk, whole' });
  assert.equal(pinned.food.fdcId, 5);
  assert.equal(pinned.method, 'curated');
  assert.equal(matchIngredient('dragon fruit', index), null);
});

const ingredient = (ingredientId, grams) => ({ ingredientId, unit: 'gram', quantity: grams, metricUnit: 'gram', metricQuantity: grams });
const ctxFor = (...foods) => ({ foodByIngredient: new Map(foods.map((f) => [f.id, f.food])), siblings: () => [] });

test('calculation: complete, estimated (<=20% unmatched), none (>20%), unknown fibre stays null', () => {
  const flour = food(1, 'Flour', 400); // 400 kcal / 100 g
  const noFibre = food(2, 'Odd', 100, { nutrients: { fibre: null } });
  const ctx = ctxFor({ id: 'flour', food: flour }, { id: 'odd', food: noFibre });
  const base = { yield: { servings: 2 } };

  const complete = computeRecipeNutrition({ ...base, ingredientGroups: [{ ingredients: [ingredient('flour', 500)] }] }, ctx);
  assert.equal(complete.status, 'complete');
  assert.equal(complete.perServing.kcal, 1000); // 500 g x 4 kcal/g / 2 servings

  const estimated = computeRecipeNutrition({ ...base, ingredientGroups: [{ ingredients: [ingredient('flour', 900), ingredient('mystery', 100)] }] }, ctx);
  assert.equal(estimated.status, 'estimated');
  assert.equal(estimated.unmatchedPct, 10);

  const none = computeRecipeNutrition({ ...base, ingredientGroups: [{ ingredients: [ingredient('flour', 500), ingredient('mystery', 500)] }] }, ctx);
  assert.equal(none.status, 'none');
  assert.equal(none.perServing, null);

  const unknown = computeRecipeNutrition({ ...base, ingredientGroups: [{ ingredients: [ingredient('odd', 100)] }] }, ctx);
  assert.equal(unknown.perServing.fibre, null);
  assert.equal(unknown.perServing.protein, 5);
});

const block = (kcal, status = 'complete') => ({ status, perServing: { kcal }, unmatchedPct: 0 });

test('rules: first calculation applies, >10% change is held, <=10% applies, >1500 kcal is hidden', () => {
  assert.equal(decideNutrition(undefined, block(500)).nutrition.perServing.kcal, 500);

  const held = decideNutrition(block(500), block(600));
  assert.equal(held.nutrition.perServing.kcal, 500); // old values kept
  assert.deepEqual([held.pending.kcalWas, held.pending.kcalNow, held.pending.changePct], [500, 600, 20]);

  const small = decideNutrition(block(500), block(540));
  assert.equal(small.nutrition.perServing.kcal, 540);
  assert.equal(small.pending, null);

  const big = decideNutrition(undefined, block(1600));
  assert.equal(big.hide, true);
  assert.equal(big.nutrition.flag, 'implausible');
  assert.equal(decideNutrition(undefined, block(1500)).hide, false);

  const lost = decideNutrition(block(400), { status: 'none', perServing: null });
  assert.equal(lost.pending.kcalNow, 0); // going to "no data" is also a significant change
});

test('plan day totals: none excluded and listed, estimated flagged, cooked sums only cooked', () => {
  const day = dayNutrition([
    { mealType: 'BREAKFAST', name: 'A', kcal: 300, proteinG: 10, carbsG: 30, fatG: 5, nutritionStatus: 'complete', status: 'cooked' },
    { mealType: 'LUNCH', name: 'B', kcal: 400, proteinG: 20, carbsG: 40, fatG: 10, nutritionStatus: 'estimated', status: 'planned' },
    { mealType: 'DINNER', name: 'C', kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, nutritionStatus: 'none', status: 'planned' },
    { mealType: 'SNACK', name: 'D', kcal: 100, proteinG: 0, carbsG: 0, fatG: 0, nutritionStatus: null, status: 'planned' },
  ]);
  assert.equal(day.planned.kcal, 800);
  assert.equal(day.cooked.kcal, 300);
  assert.equal(day.estimated, true);
  assert.deepEqual(day.excluded, [{ mealType: 'DINNER', name: 'C' }]);
});

test('public shape: missing, none and incomplete blocks all read as none', () => {
  assert.deepEqual(publicNutrition(undefined), { status: 'none', perServing: null });
  assert.deepEqual(publicNutrition({ status: 'none' }), { status: 'none', perServing: null });
  assert.equal(publicNutrition({ status: 'estimated', perServing: { kcal: 480, protein: 31 }, flag: 'x' }).status, 'estimated');
  assert.equal('flag' in publicNutrition({ status: 'complete', perServing: { kcal: 1 } }), false);
});
