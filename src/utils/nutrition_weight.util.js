// Turns one recipe ingredient line into grams. Pure; used by recipe_nutrition.service.js.

// quantities too small to matter nutritionally: left out, never counted as "unmatched"
const NEGLIGIBLE_UNITS = new Set(['to_taste', 'as_needed', 'pinch', 'dash', 'sprinkling', 'splash', 'drizzle', 'sprig']);
const VOLUME_ML = { cup: 236.588, tablespoon: 14.787, teaspoon: 4.929, 'fl oz': 29.574 };
// shortcut: typical weights for count units USDA has no portion for; approximate, replace with per-ingredient data if it matters
const UNIT_DEFAULT_G = { knob: 15, handful: 20, bunch: 60, stalk: 40, leaf: 1, stick: 5, head: 250, bulb: 60, can: 400, strip: 10 };
const MAX_G_PER_COUNT = 600; // a "piece" heavier than this is a whole-cut USDA portion (a whole loin), not one piece
const COUNT_WORDS = {
  clove: ['clove'],
  slice: ['slice'],
  can: ['can', 'tin'],
  bunch: ['bunch'],
  piece: ['medium', 'whole', 'each', 'large', 'small', 'piece', 'unit', 'item'],
  handful: ['cup'],
};
// portions that are a measure or a pack, never one piece
const NOT_A_PIECE = /^\s*(cup|tbsp|tsp|fl oz|cubic|pint|oz|lb|pound|package|pkg|container|carton|bottle|jar|bag|box|can)/;
// "slice, large" must not answer "large": the first pass skips these too, only the last-resort pass may use them
const SLICE_OR_SERVING = /^\s*(slice|serving)/;

// -> { skip: true } | { grams?, ml?, unit, qty }. grams/ml are set only when the recipe states a weight/volume.
function lineMeasure(line) {
  if (!line.metricUnit && NEGLIGIBLE_UNITS.has(line.unit)) return { skip: true };
  const m = { unit: line.unit, qty: line.quantity || 1 };
  if (line.metricUnit === 'gram') m.grams = line.metricQuantity;
  else if (line.metricUnit === 'kilogram') m.grams = line.metricQuantity * 1000;
  else if (line.metricUnit === 'milliliter') m.ml = line.metricQuantity;
  else if (line.metricUnit === 'liter') m.ml = line.metricQuantity * 1000;
  return m;
}

function countGrams(food, unit, qty) {
  for (const w of COUNT_WORDS[unit] || []) {
    const p = (food.portions || []).find(
      (x) => (x.text.includes(w) || x.unit === w) && (unit === 'handful' || !VOLUME_ML[x.unit]) && (unit !== 'piece' || !(NOT_A_PIECE.test(x.text) || SLICE_OR_SERVING.test(x.text)))
    );
    if (p) return (qty * p.g) / p.amount;
  }
  if (unit === 'piece') {
    const p = (food.portions || []).find((x) => !VOLUME_ML[x.unit] && !NOT_A_PIECE.test(x.text));
    if (p) return (qty * p.g) / p.amount;
  }
  return null;
}

// g per ml from a cup/tablespoon portion; water-like 1 g/ml when USDA gives none
function density(food) {
  const p = (food.portions || []).find((x) => VOLUME_ML[x.unit]);
  return p ? p.g / (p.amount * VOLUME_ML[p.unit]) : 1;
}

// siblings(food) = other USDA foods with the same first name segment (a Foundation entry without portions borrows SR Legacy's)
function gramsFor(measure, food, siblings = () => []) {
  if (measure.grams != null) return measure.grams;
  if (measure.ml != null) return measure.ml * density(food);
  const { unit, qty } = measure;
  let g = countGrams(food, unit, qty);
  if (g == null) for (const s of siblings(food)) { g = countGrams(s, unit, qty); if (g != null) break; }
  if (g != null) return g <= MAX_G_PER_COUNT * Math.max(qty, 1) ? g : null;
  return UNIT_DEFAULT_G[unit] != null ? qty * UNIT_DEFAULT_G[unit] : null;
}

module.exports = { lineMeasure, gramsFor };
