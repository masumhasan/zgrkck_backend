const { SYNONYMS, DROP_WORDS, STATE_WORDS } = require('../config/usda_aliases');

// Ingredient name -> USDA food. Pure functions (no DB): the refresh service loads the foods and the overrides.
// Order: 1) exact content-team overrides, 2) fuzzy token match. Never used for allergen decisions.

const SYNONYM_KEYS = Object.keys(SYNONYMS).sort((a, b) => b.length - a.length);
const MEAT = /^(beef|pork|turkey|lamb|chicken|veal)$/;
// brands, restaurants and special-purpose foods are never a sensible stand-in for a recipe ingredient
const BAD = /babyfood|infant|restaurant|fast food|school lunch|usda commodity|alcoholic|imitation|dehydrated|formula|candies|snacks,|cereals ready|pillsbury|mcdonald|burger king|kfc|campbell|kraft|keebler|nabisco|oscar mayer|pizza hut|taco bell|wendy|domino|subway/i;

const singular = (w) => (w.length > 3 && w.endsWith('ies') ? `${w.slice(0, -3)}y` : w.endsWith('oes') ? w.slice(0, -2) : w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);
// keepParen: USDA writes the common name inside brackets, e.g. "Coriander (cilantro) leaves"
const tokens = (s, keepParen) =>
  s.toLowerCase().replace(keepParen ? /[()]/g : /\(.*?\)/g, ' ').replace(/[^a-z\s-]/g, ' ').split(/[\s-]+/).filter(Boolean).map(singular);

function queryTokens(name) {
  let n = name.toLowerCase().replace(/\(.*?\)/g, ' ').trim();
  for (const k of SYNONYM_KEYS) {
    const re = new RegExp(`\\b${k}s?\\b`);
    if (re.test(n)) { n = n.replace(re, ` ${SYNONYMS[k]} `); break; }
  }
  const t = tokens(n);
  return t.some((w) => MEAT.test(w)) ? t : t.filter((w) => w !== 'ground'); // "ground" only matters for meat
}

function buildIndex(foods) {
  const usable = foods.filter((f) => f.nutrients && f.nutrients.kcal != null);
  const entries = usable.map((food) => {
    const t = tokens(food.description, true);
    return { food, all: new Set(t), first: new Set(tokens(food.description.split(',')[0], true)), n: t.length, state: t.filter((w) => STATE_WORDS.has(w)) };
  });
  return { entries, byFdc: new Map(usable.map((f) => [f.fdcId, f])), byDescription: new Map(usable.map((f) => [f.description, f])) };
}

// an override may be an exact USDA description, a description prefix, or an fdcId
function resolveOverride(index, value) {
  if (typeof value === 'number') return index.byFdc.get(value) || null;
  const exact = index.byDescription.get(value);
  if (exact) return exact;
  for (const [d, f] of index.byDescription) if (d.startsWith(value)) return f;
  return null;
}

function fuzzy(name, index) {
  const raw = tokens(name);
  const want = queryTokens(name).filter((w) => !DROP_WORDS.has(w) || raw.length === 1);
  if (!want.length) return null;
  const head = want[want.length - 1];
  const wantsState = want.some((w) => STATE_WORDS.has(w));
  const drink = want.some((w) => /^(wine|alcoholic)$/.test(w));
  let best = null;
  for (const e of index.entries) {
    if (BAD.test(e.food.description) && !(drink && /alcoholic/i.test(e.food.description))) continue;
    if (!e.all.has(head)) continue;
    const hit = want.filter((w) => e.all.has(w)).length;
    const coverage = hit / want.length;
    if (coverage < 0.7) continue;
    let s = coverage * 2 + hit / e.n + (e.first.has(head) ? 0.6 : 0) + (e.first.has(want[0]) ? 0.3 : 0);
    // the USDA entry whose first words are exactly the ingredient ("Sugars, granulated" for sugar)
    if (want.every((w) => e.first.has(w))) s += Math.max(1 - 0.35 * (e.first.size - want.length), 0) * 1.2;
    if (!wantsState) s += (e.all.has('raw') ? 0.4 : 0) - 0.15 * e.state.filter((w) => w !== 'oil').length;
    if (e.food.dataType === 'foundation') s += 0.05;
    if (!best || s > best.s) best = { s, food: e.food };
  }
  return best && best.food;
}

// -> { food, method: 'curated' | 'auto' } or null when nothing fits
function matchIngredient(name, index, overrides = {}) {
  const pinned = overrides[String(name).toLowerCase().trim()];
  if (pinned != null) {
    const food = resolveOverride(index, pinned);
    if (food) return { food, method: 'curated' };
  }
  const food = fuzzy(name, index);
  return food ? { food, method: 'auto' } : null;
}

// foods sharing a first name segment ("Garlic, raw" in SR Legacy and Foundation): one borrows the other's household portions
const firstName = (f) => f.description.split(',')[0].toLowerCase();
function buildSiblings(foods) {
  const byName = new Map();
  for (const f of foods) if (f.portions?.length) byName.set(firstName(f), [...(byName.get(firstName(f)) || []), f]);
  return (f) => (byName.get(firstName(f)) || []).filter((o) => o !== f);
}

module.exports = { buildIndex, matchIngredient, resolveOverride, buildSiblings };
