const { ShoppingItem } = require('../models/shopping.model');
const { Recipe } = require('../models/recipe.model');
const { PantryItem } = require('../models/pantry.model');
const mealPlanService = require('./meal_plan.service');

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

    const pantryMap = new Map();
    for (const p of pantryItems) {
      pantryMap.set(p.name.toLowerCase().trim(), p);
    }

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
          if (meal.recipeId) allRecipeIds.push(meal.recipeId);
        }
      }

      const uniqueRecipeIds = [...new Set(allRecipeIds.map((id) => id.toString()))];
      const recipes = await Recipe.find({ _id: { $in: uniqueRecipeIds } }).lean().exec();
      const recipeMap = new Map(recipes.map((r) => [r._id.toString(), r]));

      for (const day of plan.days) {
        for (const meal of day.meals || []) {
          const recipe = meal.recipeId ? recipeMap.get(meal.recipeId.toString()) : null;
          const recipeItems = [];

          if (recipe && Array.isArray(recipe.ingredientGroups)) {
            for (const grp of recipe.ingredientGroups) {
              for (const ing of grp.ingredients || []) {
                const normName = ing.name.toLowerCase().trim();
                const matchedPantry = pantryMap.get(normName);

                let buyStr = null;
                let pantryStr = null;

                if (matchedPantry) {
                  smartPantryApplied += 1;
                  pantryStr = `${matchedPantry.qty} ${matchedPantry.unit || ''}`.trim();
                  buyStr = `${ing.quantity || 1} ${ing.unit || ''}`.trim();
                }

                const itemData = {
                  name: ing.name,
                  category: this._classifyAisle(ing.category),
                  qty: ing.displayText || `${ing.quantity || 1} ${ing.unit || ''}`.trim(),
                  pantry: pantryStr,
                  buy: buyStr,
                  checked: checkedMap.get(normName) || false,
                  recipeName: recipe.title,
                };

                recipeItems.push(itemData);

                if (!plannedItemsMap.has(normName)) {
                  plannedItemsMap.set(normName, itemData);
                }
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

