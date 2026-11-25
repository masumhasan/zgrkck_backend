const fs = require('fs');
const path = require('path');
const { config } = require('../config/env');
const { UsdaFood } = require('../models/usda_food.model');
const { parseCsv } = require('../utils/csv.util');
const { readZipEntries } = require('../utils/zip.util');

// Downloads the USDA FoodData Central CSV releases (SR Legacy + Foundation Foods) and stores them in `usda_foods`.
const FILES = ['food.csv', 'food_nutrient.csv', 'food_portion.csv', 'measure_unit.csv'];
const NUTRIENT_IDS = { kcal: [1008, 2047, 2048], protein: [1003], carbs: [1005], fat: [1004], fibre: [1079], sugar: [2000, 1063], sodium: [1093] };
const SOURCES = [
  { key: 'srLegacy', dataType: 'sr_legacy', csvType: 'sr_legacy_food', url: () => config.usda.srLegacyUrl },
  { key: 'foundation', dataType: 'foundation', csvType: 'foundation_food', url: () => config.usda.foundationUrl },
];
const VOLUME_LEAD = /^\s*(cup|tbsp|tablespoon|tsp|teaspoon|fl oz)/;
const VOLUME_NAME = { tbsp: 'tablespoon', tsp: 'teaspoon' };

async function download(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(180000) });
  if (!res.ok) throw new Error(`USDA download failed (${res.status}) for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

const filesFromDir = (dir) => Object.fromEntries(FILES.map((f) => [f, fs.readFileSync(path.join(dir, f))]));

// files = { 'food.csv': Buffer, ... } -> [{ fdcId, description, dataType, nutrients, portions }] (foods without calories are dropped)
function parseUsdaFiles(files, source) {
  const text = (name) => files[name].toString('utf8');
  const foods = new Map();
  for (const r of parseCsv(text('food.csv'))) {
    if (r.data_type === source.csvType) foods.set(r.fdc_id, { fdcId: Number(r.fdc_id), description: r.description, dataType: source.dataType, raw: {}, portions: [] });
  }
  for (const r of parseCsv(text('food_nutrient.csv'))) {
    const f = foods.get(r.fdc_id);
    if (f && r.amount !== '') f.raw[r.nutrient_id] = Number(r.amount);
  }
  const unitNames = Object.fromEntries(parseCsv(text('measure_unit.csv')).map((r) => [r.id, r.name]));
  for (const r of parseCsv(text('food_portion.csv'))) {
    const f = foods.get(r.fdc_id);
    const g = Number(r.gram_weight);
    if (!f || !g) continue;
    const label = `${r.portion_description} ${r.modifier}`.toLowerCase();
    const lead = VOLUME_LEAD.exec(label);
    // SR Legacy stores most units as text ("cup, chopped") with measure_unit_id 9999
    const unit = lead ? VOLUME_NAME[lead[1]] || lead[1] : unitNames[r.measure_unit_id] || '';
    f.portions.push({ amount: Number(r.amount) || 1, unit, text: label, g });
  }
  const out = [];
  for (const f of foods.values()) {
    const nutrients = Object.fromEntries(Object.entries(NUTRIENT_IDS).map(([k, ids]) => [k, ids.map((i) => f.raw[i]).find((v) => v != null) ?? null]));
    if (nutrients.kcal == null) continue;
    out.push({ fdcId: f.fdcId, description: f.description, dataType: f.dataType, nutrients, portions: f.portions });
  }
  return out;
}

// dirs = { srLegacy, foundation } of already-extracted CSV folders (offline / tests); otherwise downloads the zips
async function importUsda(dirs = null) {
  const counts = {};
  for (const source of SOURCES) {
    const files = dirs ? filesFromDir(dirs[source.key]) : readZipEntries(await download(source.url()), FILES);
    const foods = parseUsdaFiles(files, source);
    for (let i = 0; i < foods.length; i += 1000) {
      await UsdaFood.bulkWrite(
        foods.slice(i, i + 1000).map((f) => ({ updateOne: { filter: { fdcId: f.fdcId }, update: { $set: f }, upsert: true } }))
      );
    }
    counts[source.key] = foods.length;
  }
  return counts;
}

module.exports = { importUsda, parseUsdaFiles };
