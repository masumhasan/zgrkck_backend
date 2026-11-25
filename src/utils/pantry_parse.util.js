// "2 litres milk, a dozen eggs, bananas" -> [{name, qty, unit}]. Pure code, no AI: the AI only ever reads a
// receipt photo (pantry_bulk.service) and its lines come through cleanItem like everything else.
const NUMBER_WORDS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, half: 0.5 };

const UNIT_ALIASES = {
  g: 'g', gr: 'g', gram: 'g', grams: 'g',
  kg: 'kg', kilo: 'kg', kilos: 'kg', kilogram: 'kg', kilograms: 'kg',
  ml: 'ml', millilitre: 'ml', millilitres: 'ml', milliliter: 'ml', milliliters: 'ml',
  l: 'L', litre: 'L', litres: 'L', liter: 'L', liters: 'L',
  oz: 'oz', ounce: 'oz', ounces: 'oz',
  lb: 'lb', lbs: 'lb', pound: 'lb', pounds: 'lb',
  cup: 'cup', cups: 'cup',
  bottle: 'bottle', bottles: 'bottle',
  bag: 'bag', bags: 'bag',
  pack: 'pack', packs: 'pack', packet: 'pack', packets: 'pack', box: 'pack', boxes: 'pack',
  bunch: 'bunch', bunches: 'bunch',
  can: 'can', cans: 'can', tin: 'can', tins: 'can',
  pcs: 'pcs', pc: 'pcs', piece: 'pcs', pieces: 'pcs',
};
const UNITS = [...new Set(Object.values(UNIT_ALIASES))];
const MAX_ITEMS = 60;

const unitOf = (word) => UNIT_ALIASES[String(word || '').toLowerCase().replace(/\.$/, '')] || null;
const round = (n) => String(Math.round(n * 100) / 100);

// "1.2" | "1/2" | "12" -> number, else null
const numberOf = (token) => {
  const frac = String(token).match(/^(\d+)\s*\/\s*(\d+)$/);
  if (frac) return Number(frac[2]) ? Number(frac[1]) / Number(frac[2]) : null;
  return /^\d+(\.\d+)?$/.test(token) ? Number(token) : null;
};

// a typed name: no stray punctuation, one capital, sane length
const tidy = (name) => {
  const n = String(name || '').replace(/[^\p{L}\p{N}\s'&%-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 100);
  return n ? n[0].toUpperCase() + n.slice(1) : '';
};

// one comma-separated piece. Quantity first ("2 litres milk", "a dozen eggs", "1.2kg chicken") or last
// ("milk 2L", "eggs x12"). No quantity at all means one piece.
function parseLine(line) {
  const text = String(line || '').replace(/^[-*•\s]+/, '').trim();
  if (!text) return null;
  const tokens = text.split(/\s+/);
  let qty = null;
  let unit = null;
  let i = 0;

  const first = tokens[0].toLowerCase();
  const fused = first.match(/^(\d+(?:\.\d+)?)([a-z]+)$/); // 1.2kg
  if (fused && unitOf(fused[2])) {
    qty = Number(fused[1]);
    unit = unitOf(fused[2]);
    i = 1;
  } else if (tokens.length > 1 && (numberOf(first) !== null || first in NUMBER_WORDS)) {
    qty = numberOf(first) ?? NUMBER_WORDS[first];
    i = 1;
    const next = (tokens[1] || '').toLowerCase();
    if (next === 'dozen') { qty *= 12; i = 2; } // "a dozen", "2 dozen"
    else if (unitOf(next) && tokens.length > 2) { unit = unitOf(next); i = 2; }
    if (tokens[i]?.toLowerCase() === 'of') i += 1;
  } else if (tokens.length > 1) {
    const last = tokens[tokens.length - 1].toLowerCase().replace(/^x/, '');
    const tail = last.match(/^(\d+(?:\.\d+)?)([a-z]*)$/);
    if (tail && (!tail[2] || unitOf(tail[2]))) {
      qty = Number(tail[1]);
      unit = unitOf(tail[2]);
      tokens.pop();
    }
  }

  const name = tidy(tokens.slice(i).join(' '));
  if (!name) return null;
  return { name, ...(qty > 0 ? { qty: round(qty), unit: unit || 'pcs' } : { qty: '1', unit: 'pcs' }) };
}

// shortcut: splits on "and" too, so "mac and cheese" becomes two items; the user can fix it on the review list.
const parseList = (text) =>
  String(text || '').split(/[\n,;]+|\s+(?:and|&)\s+/i).map(parseLine).filter(Boolean).slice(0, MAX_ITEMS);

// an item read by something else (the receipt reader): same limits as typed ones, unit forced to a known one
function cleanItem(raw) {
  const name = tidy(raw?.name);
  if (!name) return null;
  const n = Number(raw.quantity ?? raw.qty);
  return { name, qty: n > 0 && n < 10000 ? round(n) : '1', unit: unitOf(raw.unit) || 'pcs' };
}

// ---- where it lives and how long it keeps (dataset ingredient category -> storage / shelf life)
const AISLE = {
  dairy: 'Dairy', eggs: 'Dairy', produce: 'Produce', meat: 'Meat', poultry: 'Meat', fish: 'Seafood', seafood: 'Seafood', frozen_foods: 'Frozen',
};
const aisleOf = (category) => AISLE[category] || 'Pantry';

// shortcut: a short room-temperature list; everything else fresh goes to the fridge. Items can be moved on the review list.
const ROOM_TEMP = /\b(banana|onion|potato|garlic|pumpkin|squash|ginger|avocado|pineapple|mango|melon|lemon|lime|orange|apple)s?\b/i;
function storageOf(category, name = '') {
  if (category === 'frozen_foods') return 'Freezer';
  if (['dairy', 'eggs', 'meat', 'poultry', 'fish', 'seafood'].includes(category)) return 'Fridge';
  if (category === 'produce') return ROOM_TEMP.test(name) ? 'Pantry' : 'Fridge';
  return 'Pantry';
}

// typical days before it should be used; shortcut: by category only, upgrade with per-ingredient shelf life.
const FRIDGE_DAYS = { meat: 2, poultry: 2, fish: 2, seafood: 2, dairy: 7, eggs: 21, produce: 7 };
const LEAFY = /\b(spinach|lettuce|salad|rocket|arugula|basil|coriander|cilantro|parsley|mint|dill)\b/i;
function estimateUseBy(storedIn, category, name = '', today = new Date()) {
  let days = null;
  if (storedIn === 'Fridge') days = LEAFY.test(name) ? 4 : FRIDGE_DAYS[category] ?? null;
  else if (storedIn === 'Freezer') days = ['meat', 'poultry', 'fish', 'seafood'].includes(category) ? 90 : null;
  if (!days) return null; // dry goods and anything unknown: no date is better than a made-up one
  const d = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate() + days));
  return d.toISOString().slice(0, 10);
}

module.exports = { parseLine, parseList, cleanItem, aisleOf, storageOf, estimateUseBy, unitOf, UNITS, MAX_ITEMS };
