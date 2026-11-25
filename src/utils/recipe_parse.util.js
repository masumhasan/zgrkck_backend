// Pure parsers for recipe imports: schema.org JSON-LD, pasted text, ingredient lines, durations.
// No network and no AI in here; the import service validates anything an AI returns through the same functions.

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '-', mdash: '-', rsquo: "'", lsquo: "'", ldquo: '"', rdquo: '"', deg: '°', frac12: '½' };
const decodeEntities = (s) =>
  String(s)
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z0-9]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
const stripHtml = (s) => decodeEntities(String(s).replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
const clip = (s, max) => String(s || '').trim().slice(0, max);

// app unit (what the Flutter dropdown uses) -> dataset unit + metric conversion (so nutrition can weigh the line)
const UNITS = [
  { words: ['g', 'gram', 'grams', 'gr'], app: 'g', unit: 'gram', metric: 'gram', f: 1 },
  { words: ['kg', 'kilo', 'kilos', 'kilogram', 'kilograms'], app: 'kg', unit: 'kilogram', metric: 'kilogram', f: 1 },
  { words: ['ml', 'millilitre', 'milliliter', 'millilitres', 'milliliters'], app: 'ml', unit: 'milliliter', metric: 'milliliter', f: 1 },
  { words: ['l', 'litre', 'liter', 'litres', 'liters'], app: 'L', unit: 'liter', metric: 'liter', f: 1 },
  { words: ['cup', 'cups'], app: 'cup', unit: 'cup', metric: 'milliliter', f: 236.588 },
  { words: ['tbsp', 'tbs', 'tablespoon', 'tablespoons'], app: 'tbsp', unit: 'tablespoon', metric: 'milliliter', f: 14.787 },
  { words: ['tsp', 'teaspoon', 'teaspoons'], app: 'tsp', unit: 'teaspoon', metric: 'milliliter', f: 4.929 },
  { words: ['oz', 'ounce', 'ounces'], app: 'oz', unit: 'ounce', metric: 'gram', f: 28.35 },
  { words: ['lb', 'lbs', 'pound', 'pounds'], app: 'lb', unit: 'pound', metric: 'gram', f: 453.6 },
  { words: ['clove', 'cloves'], app: 'clove', unit: 'clove' },
  { words: ['slice', 'slices'], app: 'slice', unit: 'slice' },
  { words: ['piece', 'pieces'], app: 'piece', unit: 'piece' },
  // counted things the dropdown has no entry for: shown as 'unit', named properly for the nutrition weights
  { words: ['can', 'cans', 'tin', 'tins'], app: 'unit', unit: 'can' },
  { words: ['pinch', 'pinches'], app: 'unit', unit: 'pinch' },
  { words: ['dash', 'dashes'], app: 'unit', unit: 'dash' },
  { words: ['bunch', 'bunches'], app: 'unit', unit: 'bunch' },
  { words: ['handful', 'handfuls'], app: 'unit', unit: 'handful' },
  { words: ['sprig', 'sprigs'], app: 'unit', unit: 'sprig' },
  { words: ['stalk', 'stalks'], app: 'unit', unit: 'stalk' },
  { words: ['knob'], app: 'unit', unit: 'knob' },
];
const UNIT_BY_WORD = new Map(UNITS.flatMap((u) => u.words.map((w) => [w, u])));
const UNIT_BY_APP = new Map(UNITS.map((u) => [u.app, u]));
UNIT_BY_APP.set('unit', { app: 'unit', unit: 'piece' }); // the dropdown's generic "unit" is a plain count

const FRACTIONS = { '¼': 0.25, '½': 0.5, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875 };
const QTY = /^\s*(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:[.,]\d+)?\s*[¼½¾⅓⅔⅛⅜⅝⅞]|[¼½¾⅓⅔⅛⅜⅝⅞]|\d+(?:[.,]\d+)?)(?:\s*(?:-|–|to)\s*\d+(?:[.,]\d+)?)?/;

function toNumber(raw) {
  const t = raw.trim();
  const frac = t.match(/^(\d+)?\s*([¼½¾⅓⅔⅛⅜⅝⅞])$/);
  if (frac) return Number(frac[1] || 0) + FRACTIONS[frac[2]];
  const mixed = t.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const simple = t.match(/^(\d+)\/(\d+)$/);
  if (simple) return Number(simple[1]) / Number(simple[2]);
  return Number(t.replace(',', '.'));
}

const NO_AMOUNT_NEEDED = /\b(to taste|as needed|for (serving|frying|garnish|greasing|dusting)|optional|pinch|dash)\b/i;

// "1 1/2 cups plain flour, sifted" -> { name, quantity, unit (app unit or ''), displayText, uncertain }
function parseIngredientLine(text) {
  const displayText = clip(stripHtml(text), 200);
  let rest = displayText;
  let quantity = null;
  const q = rest.match(QTY);
  if (q) {
    const n = toNumber(q[1]);
    if (Number.isFinite(n) && n >= 0) quantity = Math.round(n * 1000) / 1000;
    rest = rest.slice(q[0].length).trim();
  }
  let unit = '';
  // "1 x 400g can tomatoes": a pack count times a pack size
  const pack = quantity != null && rest.match(/^x\s*(\d+(?:[.,]\d+)?)\s*(g|kg|ml|l)\b\.?\s*/i);
  if (pack) {
    quantity = Math.round(quantity * Number(pack[1].replace(',', '.')) * 1000) / 1000;
    unit = UNIT_BY_WORD.get(pack[2].toLowerCase()).app;
    rest = rest.slice(pack[0].length).replace(/^(can|tin|pack|packet|jar)s?\s+/i, '').trim();
  }
  // unit, optionally followed by an alternative measure: "225 g/8oz flour", "1 cup/240ml milk"
  const word = !unit && rest.match(/^([a-zA-Z]+)\.?(?:\s*\/\s*\d+(?:[.,]\d+)?\s*[¼½¾]?\s*[a-zA-Z]+\.?(?:\s+oz\.?)?)?(?:\s+|$)/);
  const found = word && UNIT_BY_WORD.get(word[1].toLowerCase());
  if (found && quantity != null) {
    unit = found.app;
    rest = rest.slice(word[0].length).trim();
  }
  rest = rest.replace(/^\(.*?\)\s*/, '').replace(/^of\s+/i, ''); // "(400 g) tin of tomatoes"
  const name = clip(rest.split(',')[0], 200) || displayText;
  return { name, quantity, unit, displayText, uncertain: quantity == null && !NO_AMOUNT_NEEDED.test(displayText) };
}

// { name, quantity, unit(app unit) } -> the stored ingredient line (dataset shape, with metric for nutrition)
function lineFor({ name, quantity, unit }) {
  const u = unit ? UNIT_BY_APP.get(unit) : null;
  const qty = quantity == null ? null : Number(quantity);
  const shown = [qty == null ? '' : String(Math.round(qty * 100) / 100), unit && unit !== 'unit' ? unit : '', name].filter(Boolean).join(' ');
  // no unit = a count of the thing ("2 eggs"); no amount at all = salt/garnish, left out of the nutrition estimate
  const stored = u ? u.unit : unit || (qty == null ? 'as_needed' : 'piece');
  const line = { name, displayText: shown, quantity: qty ?? undefined, unit: stored };
  if (u && u.metric && qty != null) {
    line.metricQuantity = Math.round(qty * u.f * 100) / 100;
    line.metricUnit = u.metric;
  }
  return line;
}

const parseDuration = (iso) => {
  const m = String(iso || '').match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/i);
  if (!m) return 0;
  return Math.min(1440, Number(m[1] || 0) * 1440 + Number(m[2] || 0) * 60 + Number(m[3] || 0));
};

const firstInt = (v) => {
  const s = Array.isArray(v) ? v.join(' ') : String(v ?? '');
  const m = s.match(/\d+/);
  return m ? Number(m[0]) : null;
};

const asText = (v) => (Array.isArray(v) ? v.map(asText).find(Boolean) || '' : v && typeof v === 'object' ? asText(v.name || v.text || v.url || '') : String(v ?? ''));

function instructionTexts(v) {
  if (!v) return [];
  if (typeof v === 'string') return v.split(/\r?\n+/).map((x) => stripHtml(x)).filter(Boolean);
  if (Array.isArray(v)) return v.flatMap(instructionTexts);
  if (v.itemListElement) return instructionTexts(v.itemListElement); // HowToSection
  return instructionTexts(v.text || v.name || '');
}
const cleanStep = (s) => s.replace(/^\s*(step\s*)?\d+\s*[.):-]\s*/i, '').trim();

const isRecipeNode = (n) => n && typeof n === 'object' && [].concat(n['@type'] || []).some((t) => String(t).toLowerCase().endsWith('recipe'));
function findRecipeNode(node) {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) { for (const x of node) { const r = findRecipeNode(x); if (r) return r; } return null; }
  if (isRecipeNode(node)) return node;
  return findRecipeNode(node['@graph']);
}

// schema.org Recipe from a page's JSON-LD blocks -> raw recipe, or null when the page has none
function extractJsonLdRecipe(html) {
  const blocks = [...String(html).matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const b of blocks) {
    let node;
    try { node = findRecipeNode(JSON.parse(b[1].trim())); } catch { continue; }
    if (!node) continue;
    const og = String(html).match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
    return {
      title: stripHtml(asText(node.name)),
      summary: stripHtml(asText(node.description)),
      servings: firstInt(node.recipeYield),
      prepMinutes: parseDuration(node.prepTime),
      cookMinutes: parseDuration(node.cookTime) || (node.totalTime && !node.prepTime ? parseDuration(node.totalTime) : 0),
      cuisine: stripHtml(asText(node.recipeCuisine)),
      mealType: stripHtml(asText(node.recipeCategory)).toLowerCase(),
      imageUrl: asText(node.image) || (og ? decodeEntities(og[1]) : ''),
      ingredients: [].concat(node.recipeIngredient || []).map(String),
      steps: instructionTexts(node.recipeInstructions).map(cleanStep).filter(Boolean),
      sourceName: stripHtml(asText(node.publisher) || asText(node.author)),
    };
  }
  return null;
}

const HEAD_ING = /^\s*(?:#+\s*)?(ingredients?|what you(?:'ll| will)? need|you(?:'ll| will) need|for the [a-z ]+)\s*:?\s*$/i;
const HEAD_STEP = /^\s*(?:#+\s*)?(instructions?|directions?|method|steps?|preparation|how to make( it)?)\s*:?\s*$/i;
const BULLET = /^\s*(?:[-*•▪‣◦·]|\d+[.)])\s+/;

// pasted text -> raw recipe. Headings ("Ingredients", "Method") split it; without headings, lines that
// start with an amount are ingredients and longer sentences are steps. Best effort: the user reviews it.
function parseRecipeText(text) {
  const lines = String(text).replace(/\r/g, '').split('\n').map((l) => l.trim());
  const meta = String(text).match(/(?:serves?|servings?|makes|yield)[:\s]*(\d+)/i) || String(text).match(/(\d+)\s*servings?/i);
  // only a labelled line ("Cook time: 25 min", "Prep: 10 mins"), never a sentence inside a step ("cook 5 minutes")
  const mins = (label) => {
    const m = String(text).match(new RegExp(`^\\s*${label}(?:ing)?(?:\\s*time\\s*:?|\\s*:)\\s*(\\d+)\\s*(h|hr|hour|min)`, 'im'));
    return m ? Number(m[1]) * (/^h/i.test(m[2]) ? 60 : 1) : 0;
  };
  let mode = 'title';
  const raw = { title: '', summary: '', servings: meta ? Number(meta[1]) : null, prepMinutes: mins('prep'), cookMinutes: mins('cook'), ingredients: [], steps: [] };
  const hasHeads = lines.some((l) => HEAD_ING.test(l)) || lines.some((l) => HEAD_STEP.test(l));
  for (const line of lines) {
    if (!line) continue;
    if (HEAD_ING.test(line)) { mode = 'ing'; continue; }
    if (HEAD_STEP.test(line)) { mode = 'step'; continue; }
    // the title can only be the first line; an ingredient or a sentence further down is never promoted to one
    if (mode === 'title') {
      mode = hasHeads ? 'intro' : 'guess';
      if (!BULLET.test(line) && !QTY.test(line) && line.length <= 120) { raw.title = line.replace(/^#+\s*/, ''); continue; }
    }
    const body = line.replace(BULLET, '');
    if (mode === 'ing') raw.ingredients.push(body);
    else if (mode === 'step') raw.steps.push(cleanStep(body));
    else if (mode === 'intro') { if (!/^(serves?|servings?|prep|cook|total|makes|yield)\b/i.test(body)) raw.summary = raw.summary ? `${raw.summary} ${body}` : body; }
    else if (QTY.test(body) && body.length < 120) raw.ingredients.push(body);
    else if (body.length > 25) raw.steps.push(cleanStep(body));
  }
  if (!raw.ingredients.length && !raw.steps.length) parseOneParagraph(text, raw);
  return raw;
}

// "Lemon Pasta. 200 g spaghetti, 2 tbsp oil, juice of 1 lemon. Boil the pasta, toss with the oil." (no line breaks):
// first sentence = title, a sentence with several amounts = ingredients, the rest = steps
function parseOneParagraph(text, raw) {
  const sentences = String(text).replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s+/).filter(Boolean);
  if (sentences.length < 2) return;
  raw.title = sentences[0].replace(/[.!?]+$/, '').slice(0, 120);
  for (const s of sentences.slice(1)) {
    const parts = s.replace(/[.!?]+$/, '').split(/,\s*/);
    if (parts.filter((p) => QTY.test(p.trim())).length >= 2) raw.ingredients.push(...parts);
    else raw.steps.push(cleanStep(s));
  }
}

module.exports = { stripHtml, decodeEntities, clip, parseIngredientLine, lineFor, parseDuration, extractJsonLdRecipe, parseRecipeText, firstInt, UNITS };
