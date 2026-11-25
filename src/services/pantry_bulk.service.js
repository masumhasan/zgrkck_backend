const { PantryItem } = require('../models/pantry.model');
const { Ingredient } = require('../models/ingredient.model');
const pantryService = require('./pantry.service');
const openai = require('./openai_json.service');
const { imageType } = require('./avatar.service');
const { ingredientKey } = require('../utils/ingredient_match.util');
const { escapeRegex } = require('./safety_filter.service');
const { parseList, cleanItem, aisleOf, storageOf, estimateUseBy, MAX_ITEMS } = require('../utils/pantry_parse.util');

const httpError = (message, statusCode) => Object.assign(new Error(message), { statusCode });

const RECEIPT_PROMPT =
  'You read grocery receipts. Return JSON {"items":[{"name":string,"quantity":number|null,"unit":string|null}]} ' +
  'with only food and drink lines, one per product, using a clean generic name ("MLK 2L SEMI" -> name "Milk", quantity 2, unit "L"). ' +
  'Skip prices, totals, tax, discounts, carrier bags, store details and non-food. ' +
  'If you cannot read any items return {"items":[]}. Never invent items.';

// the dataset ingredient behind a typed name ("bananas" -> banana), for its category and picture
async function lookup(name) {
  const lower = name.toLowerCase();
  const forms = [...new Set([lower, lower.replace(/(es|s)$/, ''), lower.replace(/s$/, '')])].filter((f) => f.length > 1);
  const exact = forms.map((f) => new RegExp(`^${escapeRegex(f)}$`, 'i'));
  return Ingredient.findOne({ $or: [{ name: { $in: exact } }, { aliases: { $in: exact } }] })
    .select('_id category imageUrl').lean().exec();
}

// parsed/typed items -> rows the review list shows: where it goes (editable) and which aisle it is
async function review(items) {
  return Promise.all(items.map(async (it) => {
    const ing = await lookup(it.name).catch(() => null);
    const category = ing?.category || null;
    return {
      ...it,
      aisle: aisleOf(category),
      storedIn: storageOf(category, it.name),
      ...(ing ? { ingredientId: String(ing._id), ...(ing.imageUrl ? { imageUrl: ing.imageUrl } : {}) } : {}),
    };
  }));
}

const parse = async (text) => review(parseList(text));

// photo of a till receipt -> the same review rows. Nothing is saved here.
async function scanReceipt(buf) {
  const type = Buffer.isBuffer(buf) && buf.length ? imageType(buf) : null;
  if (!type) throw httpError('Please use a JPEG, PNG or WebP photo.', 415);
  if (!openai.configured()) throw httpError("Receipt scanning isn't available right now. Type your list instead.", 503);
  const out = await openai
    .chatJson({ system: RECEIPT_PROMPT, userText: 'List the groceries on this receipt.', imageDataUrl: `data:image/${type};base64,${buf.toString('base64')}` })
    .catch((err) => {
      console.error('Receipt AI failed:', err.message);
      throw httpError("Receipt scanning isn't available right now. Type your list instead.", 503);
    });
  const items = (Array.isArray(out?.items) ? out.items : []).map(cleanItem).filter(Boolean).slice(0, MAX_ITEMS);
  if (!items.length) throw httpError("We couldn't read any groceries from that receipt. Make sure it is flat, sharp and fully in view.", 422);
  return review(items);
}

// the reviewed list goes into the pantry. Buying what you already have adds to it (same unit and place);
// a use-by date is estimated from the shelf life unless the user gave one.
async function addMany(userId, items) {
  const clean = items.slice(0, MAX_ITEMS);
  const ids = clean.map((i) => i.ingredientId).filter(Boolean);
  const cats = new Map((await Ingredient.find({ _id: { $in: ids } }).select('category').lean().exec()).map((c) => [String(c._id), c.category]));
  const existing = await PantryItem.find({ userId }).lean().exec();
  const today = new Date().toISOString().slice(0, 10);
  const added = [];
  const updated = [];

  for (const it of clean) {
    const storedIn = it.storedIn || 'Pantry';
    const unit = String(it.unit || 'pcs');
    const qty = Number(it.qty);
    const useBy = it.useBy || estimateUseBy(storedIn, cats.get(it.ingredientId), it.name);
    const key = ingredientKey(it.name);
    const have = existing.find((p) => ingredientKey(p.name) === key && p.storedIn === storedIn && String(p.unit).toLowerCase() === unit.toLowerCase());

    if (have && Number.isFinite(Number(have.qty)) && Number.isFinite(qty)) {
      const sum = String(Math.round((Number(have.qty) + qty) * 100) / 100);
      const latest = [have.useBy, useBy].filter(Boolean).sort().pop() || null;
      await pantryService.updateItem(userId, have._id, { qty: sum, addedOn: today, useBy: latest });
      have.qty = sum; // a second line for the same item in this list keeps adding
      updated.push(it.name);
      continue;
    }
    const created = await pantryService.addItem(userId, { ...it, storedIn, unit, qty: String(it.qty ?? '1'), useBy });
    existing.push(created.toObject ? created.toObject() : created);
    added.push(it.name);
  }
  return { added, updated, count: added.length + updated.length };
}

module.exports = { parse, scanReceipt, addMany };
