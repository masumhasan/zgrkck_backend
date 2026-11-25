// Amounts for the shopping list: convert to a base unit per family (mass g, volume ml, count pieces) so
// 300 g + 0.4 kg = 700 g. Anything else (a "bunch", "cloves") only adds up with the same unit.
// An amount we cannot read is never invented: amountOf returns null and the caller keeps the recipe's text.
const MASS = { g: 1, gram: 1, grams: 1, kg: 1000, kilogram: 1000, kilograms: 1000, kilo: 1000, kilos: 1000, oz: 28.35, ounce: 28.35, ounces: 28.35, lb: 453.6, lbs: 453.6, pound: 453.6, pounds: 453.6 };
const VOLUME = {
  ml: 1, milliliter: 1, milliliters: 1, millilitre: 1, millilitres: 1, l: 1000, litre: 1000, litres: 1000, liter: 1000, liters: 1000,
  tsp: 5, teaspoon: 5, teaspoons: 5, tbsp: 15, tablespoon: 15, tablespoons: 15,
  cup: 240, cups: 240, 'fl oz': 29.57,
};
const COUNT = new Set(['', 'pcs', 'pc', 'piece', 'pieces', 'whole', 'x']);

const unitInfo = (unit) => {
  const u = String(unit || '').trim().toLowerCase().replace(/\.$/, '');
  if (MASS[u]) return { family: 'mass', factor: MASS[u] };
  if (VOLUME[u]) return { family: 'volume', factor: VOLUME[u] };
  if (COUNT.has(u)) return { family: 'count', factor: 1 };
  return { family: `unit:${u}`, factor: 1 };
};

// no amount to add up: the recipe says "as needed" / "to taste"
const VAGUE = new Set(['as_needed', 'to_taste']);

const toNumber = (v) => {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
};

// { family, amount (base units) } for a plain amount + unit, or null when the amount is unreadable.
const baseAmount = (qty, unit, factor = 1) => {
  if (VAGUE.has(String(unit || '').trim().toLowerCase())) return null;
  const n = toNumber(qty);
  if (n === null || n <= 0) return null;
  const { family, factor: f } = unitInfo(unit);
  return { family, amount: n * f * factor };
};

// A recipe ingredient scaled by `factor`; the metric fields win because they are grams / millilitres.
const amountOf = (ing, factor = 1) =>
  toNumber(ing.metricQuantity) !== null ? baseAmount(ing.metricQuantity, ing.metricUnit, factor) : baseAmount(ing.quantity, ing.unit, factor);

const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

// 1200 g -> "1.2 kg", 250 ml -> "250 ml", 2.2 pieces -> "3", "unit:bunch" -> "2 bunch"
const formatAmount = (family, amount) => {
  if (family === 'mass') return amount >= 1000 ? `${round(amount / 1000)} kg` : `${round(amount, 0)} g`;
  if (family === 'volume') return amount >= 1000 ? `${round(amount / 1000)} l` : `${round(amount, 0)} ml`;
  if (family === 'count') return String(Math.ceil(amount - 1e-9));
  return `${round(amount)} ${family.slice(5)}`.trim();
};

const formatTotals = (totals) => [...totals].map(([family, amount]) => formatAmount(family, amount)).join(' + ');

module.exports = { baseAmount, amountOf, formatAmount, formatTotals, unitInfo };
