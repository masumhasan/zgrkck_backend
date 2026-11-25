// Merges the content team's reviewed mapping sheets (1_top150_ingredient_mapping.csv, 1b_top100_unmatched_ingredients.csv)
// into dataset/nutrition/usda_overrides.json, then run `npm run nutrition:refresh -- --skip-import`.
//   npm run nutrition:apply-review -- <reviewed.csv> [more.csv ...]
// Rule per row: "No" + a correct USDA food -> that food. "Yes" -> pins the food we proposed (so later matcher changes never move it).
// For sheets with no OK column (the unmatched list), any row that has a USDA food filled in is used.
const fs = require('fs');
const path = require('path');
const { parseCsv } = require('../utils/csv.util');

const OVERRIDES_FILE = path.join(__dirname, '../../dataset/nutrition/usda_overrides.json');
const find = (row, start) => row[Object.keys(row).find((k) => k.startsWith(start)) || ''] || '';

function mappingsFrom(file) {
  const out = {};
  for (const row of parseCsv(fs.readFileSync(file, 'utf8'))) {
    const name = find(row, 'Ingredient').trim().toLowerCase();
    const ok = find(row, 'Content team: OK').trim().toLowerCase();
    const corrected = find(row, 'Content team: correct USDA food').trim();
    const proposed = find(row, 'USDA food we matched').trim();
    if (!name) continue;
    if (corrected && ok !== 'yes') out[name] = /^\d+$/.test(corrected) ? Number(corrected) : corrected;
    else if (ok === 'yes' && proposed && proposed !== 'NOT MATCHED') out[name] = proposed;
  }
  return out;
}

const files = process.argv.slice(2);
if (!files.length) {
  console.error('Usage: npm run nutrition:apply-review -- <reviewed.csv> [more.csv ...]');
  process.exit(1);
}
const overrides = JSON.parse(fs.readFileSync(OVERRIDES_FILE, 'utf8'));
let changed = 0;
for (const f of files) {
  for (const [name, food] of Object.entries(mappingsFrom(f))) {
    if (overrides[name] !== food) changed++;
    overrides[name] = food;
  }
}
fs.writeFileSync(OVERRIDES_FILE, `${JSON.stringify(overrides, null, 2)}\n`);
console.log(`Updated ${changed} mappings (${Object.keys(overrides).length} total) in ${path.relative(process.cwd(), OVERRIDES_FILE)}`);
