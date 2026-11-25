const { ShoppingItem } = require('../models/shopping.model');
const { Recipe } = require('../models/recipe.model');
const { PantryItem } = require('../models/pantry.model');
const mealPlanService = require('./meal_plan.service');
const { ingredientKey } = require('../utils/ingredient_match.util');
const { amountOf, baseAmount, formatAmount, formatTotals } = require('../utils/quantity.util');

class ShoppingService {
  _classifyAisle(category = '') {
    const cat = (category || '').toLowerCase();
    if (['produce', 'vegetable', 'fruit', 'herb'].some((k) => cat.includes(k))) {
      return 'Produce';
    }
    if (['meat', 'poultry', 'chicken', 'beef', 'pork', 'fish', 'seafood'].some((k) => cat.includes(k))) {
      return 'Meat & Seafood';
    }
    if (['dairy', 'egg', 'cheese', 'milk', 'yogurt'].some((k) => cat.includes(k))) {
      return 'Dairy & Eggs';
    }
    return 'Pantry & Spices';
  }

  async getShoppingList(userId) {
    const [pantryItems, manualItems, plan] = await Promise.all([
      PantryItem.find({ userId }).lean().exec(),
      ShoppingItem.find({ userId }).lean().exec(),
      mealPlanService.getCurrentPlan(userId),
    ]);

    // strict ingredient matching (pantry "egg" is not "egg plants"), see utils/ingredient_match.util.js
    const pantryMap = new Map();
    for (const p of pantryItems) pantryMap.set(ingredientKey(p.name), p);

    const checkedMap = new Map();
    for (const m of manualItems) {
      checkedMap.set(m.name.toLowerCase().trim(), m.checked);
    }

    const plannedItemsMap = new Map();
    const byRecipe = [];
    let smartPantryApplied = 0;

    if (plan && Array.isArray(plan.days)) {
      const allRecipeIds = [];
      for (const day of plan.days) {
        for (const meal of day.meals || []) {
          if (meal.recipeId && meal.status !== 'cooked') allRecipeIds.push(meal.recipeId); // already eaten: nothing left to buy
        }
      }

      const uniqueRecipeIds = [...new Set(allRecipeIds.map((id) => id.toString()))];
      const recipes = await Recipe.find({ _id: { $in: uniqueRecipeIds } }).lean().exec();
      const recipeMap = new Map(recipes.map((r) => [r._id.toString(), r]));

      // one entry per ingredient across the whole plan: amounts add up per unit family and follow the
      // servings planned for each meal (meal.servings / the recipe's own servings)
      const merged = new Map();
      for (const day of plan.days) {
        for (const meal of day.meals || []) {
          if (meal.status === 'cooked') continue;
          const recipe = meal.recipeId ? recipeMap.get(meal.recipeId.toString()) : null;
          const recipeItems = [];

          if (recipe && Array.isArray(recipe.ingredientGroups)) {
            const factor = meal.servings > 0 && recipe.yield?.servings > 0 ? meal.servings / recipe.yield.servings : 1;
            for (const grp of recipe.ingredientGroups) {
              for (const ing of grp.ingredients || []) {
                const key = ingredientKey(ing.name) || ing.name.toLowerCase().trim();
                const normName = ing.name.toLowerCase().trim();
                const amount = amountOf(ing, factor);
                const text = amount ? formatAmount(amount.family, amount.amount) : ing.displayText || `${ing.quantity || 1} ${ing.unit || ''}`.trim();

                const have = pantryMap.get(key);
                recipeItems.push({
                  name: ing.name,
                  category: this._classifyAisle(ing.category),
                  qty: text,
                  pantry: have ? `${have.qty} ${have.unit || ''}`.trim() : null,
                  buy: have ? text : null,
                  checked: checkedMap.get(normName) || false,
                  recipeName: recipe.title,
                });

                let entry = merged.get(key);
                if (!entry) {
                  entry = { name: ing.name, normName, category: this._classifyAisle(ing.category), totals: new Map(), fallback: text, recipeName: recipe.title };
                  merged.set(key, entry);
                }
                if (amount) entry.totals.set(amount.family, (entry.totals.get(amount.family) || 0) + amount.amount);
              }
            }
          }

          if (recipeItems.length > 0) {
            byRecipe.push({
              recipeName: recipe?.title || meal.name,
              recipeId: meal.recipeId,
              items: recipeItems,
            });
          }
        }
      }

      for (const [key, entry] of merged) {
        const have = pantryMap.get(key);
        const need = new Map(entry.totals);
        let pantryStr = null;
        let buyStr = null;
        if (have) {
          smartPantryApplied += 1;
          pantryStr = `${have.qty} ${have.unit || ''}`.trim();
          // take the pantry amount off the matching unit family; other units are left as they are
          const owned = baseAmount(have.qty, have.unit);
          if (owned && need.has(owned.family)) {
            const left = need.get(owned.family) - owned.amount;
            if (left > 1e-6) need.set(owned.family, left);
            else need.delete(owned.family);
          }
          buyStr = need.size ? formatTotals(need) : null;
          if (entry.totals.size && !need.size) continue; // the pantry covers all of it: nothing to buy
        }
        plannedItemsMap.set(key, {
          name: entry.name,
          category: entry.category,
          qty: entry.totals.size ? formatTotals(entry.totals) : entry.fallback,
          pantry: pantryStr,
          buy: have && !buyStr ? entry.fallback : buyStr,
          checked: checkedMap.get(entry.normName) || false,
          recipeName: entry.recipeName,
        });
      }
    }

    // Merge manual items
    for (const m of manualItems) {
      if (m.isManual) {
        const normName = m.name.toLowerCase().trim();
        plannedItemsMap.set(`manual_${m._id}`, {
          _id: m._id,
          name: m.name,
          category: m.category || 'Produce',
          qty: `${m.qty} ${m.unit || ''}`.trim(),
          pantry: m.pantry,
          buy: m.buy,
          checked: m.checked,
          isManual: true,
        });
      }
    }

    const allItems = Array.from(plannedItemsMap.values());
    const aisleGroups = {
      Produce: [],
      'Meat & Seafood': [],
      'Dairy & Eggs': [],
      'Pantry & Spices': [],
    };

    for (const item of allItems) {
      const aisle = aisleGroups[item.category] ? item.category : 'Pantry & Spices';
      aisleGroups[aisle].push(item);
    }

    const categories = [
      { category: 'Produce', icon: 'eco_outlined', items: aisleGroups['Produce'] },
      { category: 'Meat & Seafood', icon: 'kebab_dining_outlined', items: aisleGroups['Meat & Seafood'] },
      { category: 'Dairy & Eggs', icon: 'egg_outlined', items: aisleGroups['Dairy & Eggs'] },
      { category: 'Pantry & Spices', icon: 'table_restaurant_outlined', items: aisleGroups['Pantry & Spices'] },
    ].filter((cat) => cat.items.length > 0);

    return {
      smartPantryApplied,
      categories,
      byRecipe,
      totalItems: allItems.length,
    };
  }

  async addItem(userId, data) {
    const { name, category = 'Produce', qty = '1', unit = '' } = data;
    // repeated taps (e.g. 'add missing to list') must not create duplicates
    const existing = await ShoppingItem.findOne({ userId, name: name.trim(), checked: false });
    if (existing) return existing;
    const item = await ShoppingItem.create({
      userId,
      name: name.trim(),
      category: this._classifyAisle(category),
      qty: String(qty).trim(),
      unit: String(unit).trim(),
      checked: false,
      isManual: true,
    });
    return item;
  }

  // Adds several items at once. A name already on the list (manual or from the plan, ticked or
  // not, any letter case) or repeated in the request is skipped, so nothing is listed twice.
  async addItems(userId, items) {
    const list = await this.getShoppingList(userId);
    const onList = new Set(
      list.categories.flatMap((c) => c.items).map((i) => String(i.name).toLowerCase().trim()),
    );
    const toCreate = [];
    const skipped = [];
    for (const { name, category = 'Produce', qty = '1', unit = '' } of items) {
      const key = name.toLowerCase().trim();
      if (onList.has(key)) {
        skipped.push(name.trim());
        continue;
      }
      onList.add(key);
      toCreate.push({
        userId,
        name: name.trim(),
        category: this._classifyAisle(category),
        qty: String(qty).trim(),
        unit: String(unit).trim(),
        checked: false,
        isManual: true,
      });
    }
    if (toCreate.length) await ShoppingItem.insertMany(toCreate);
    return { added: toCreate.map((i) => i.name), skipped };
  }

  async toggleItem(userId, { name, checked, itemId }) {
    if (itemId) {
      const updated = await ShoppingItem.findOneAndUpdate(
        { _id: itemId, userId },
        { $set: { checked: Boolean(checked) } },
        { new: true }
      );
      return updated;
    }

    if (name) {
      const updated = await ShoppingItem.findOneAndUpdate(
        { userId, name: name.trim() },
        { $set: { checked: Boolean(checked) } },
        { upsert: true, new: true }
      );
      return updated;
    }

    return null;
  }

  async clearChecked(userId) {
    await ShoppingItem.deleteMany({ userId, checked: true, isManual: true });
    await ShoppingItem.updateMany({ userId, checked: true }, { $set: { checked: false } });
    return { success: true };
  }
}

module.exports = new ShoppingService();

