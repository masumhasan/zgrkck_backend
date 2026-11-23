const { PantryItem } = require('../models/pantry.model');
const shoppingService = require('./shopping.service');
const pantryService = require('./pantry.service');

// REQ-SHOP-07: finishing a shopping trip moves what was collected into the pantry. This closes the
// plan -> list -> shop -> pantry loop. Pure code; amounts we cannot read are never invented.

const UNITS = new Set([
  'g', 'kg', 'mg', 'ml', 'l', 'tsp', 'tbsp', 'cup', 'cups', 'oz', 'lb', 'lbs',
  'pcs', 'pc', 'piece', 'pieces', 'clove', 'cloves', 'can', 'cans', 'pack', 'packs',
  'bunch', 'bunches', 'slice', 'slices', 'pinch', 'handful',
]);
const COUNTABLE = new Set(['', 'pcs', 'pc', 'piece', 'pieces']);

// '2 cups' -> {qty:'2', unit:'cups'}; '1/2 tsp' -> {qty:'0.5', unit:'tsp'};
// '1 onion, chopped' -> {qty:'1', unit:'pcs'}; 'to taste' -> {qty:'1', unit:'pcs'}
const parseQuantity = (text) => {
  const m = String(text || '').trim().match(/^(\d+(?:\.\d+)?)(?:\s*\/\s*(\d+))?\s*([a-zA-Z]+)?/);
  if (!m) return { qty: '1', unit: 'pcs' };
  let n = Number(m[1]);
  if (m[2]) n = n / Number(m[2]);
  if (!(n > 0)) return { qty: '1', unit: 'pcs' };
  const unit = (m[3] || '').toLowerCase();
  const qty = String(Math.round(n * 100) / 100);
  return { qty, unit: UNITS.has(unit) ? unit : 'pcs' };
};

// shortcut: storage location guessed from the shopping aisle; the user can move items in the pantry.
const storageFor = (aisle) => (aisle === 'Pantry & Spices' ? 'Pantry' : 'Fridge');

const sameUnit = (a, b) => {
  const x = String(a || '').toLowerCase();
  const y = String(b || '').toLowerCase();
  return x === y || (COUNTABLE.has(x) && COUNTABLE.has(y));
};

class ShoppingFinishService {
  // names: what the app shows as collected. Toggles are sent fire-and-forget while in the shop
  // (signal is often poor), so the client's view is applied first and is the source of truth here.
  async finish(userId, { names = [] } = {}) {
    const clean = [...new Set((Array.isArray(names) ? names : []).map((n) => String(n).trim()).filter(Boolean))].slice(0, 300);
    for (const name of clean) await shoppingService.toggleItem(userId, { name, checked: true });

    const list = await shoppingService.getShoppingList(userId);
    const collected = (list.categories || []).flatMap((c) =>
      (c.items || []).filter((i) => i.checked).map((i) => ({ ...i, aisle: c.category }))
    );

    const existing = await PantryItem.find({ userId }).lean().exec();
    const byName = new Map(existing.map((p) => [p.name.toLowerCase().trim(), p]));
    const today = new Date().toISOString().slice(0, 10);
    const added = [];
    const updated = [];

    for (const item of collected) {
      const key = String(item.name || '').toLowerCase().trim();
      if (!key) continue;
      const { qty, unit } = parseQuantity(item.qty);
      const have = byName.get(key);

      if (!have) {
        const created = await pantryService.addItem(userId, {
          name: item.name,
          storedIn: storageFor(item.aisle),
          qty,
          unit,
        });
        byName.set(key, created.toObject ? created.toObject() : created);
        added.push(item.name);
        continue;
      }

      // same item already at home: add the amounts only when they are comparable
      const set = { addedOn: today };
      const current = Number(have.qty);
      if (sameUnit(have.unit, unit) && Number.isFinite(current)) {
        set.qty = String(Math.round((current + Number(qty)) * 100) / 100);
      }
      await PantryItem.updateOne({ _id: have._id, userId }, { $set: set });
      updated.push(item.name);
    }

    await shoppingService.clearChecked(userId);
    return { added, updated, count: added.length + updated.length };
  }
}

module.exports = new ShoppingFinishService();
module.exports.parseQuantity = parseQuantity;
