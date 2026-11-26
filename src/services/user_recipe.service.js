const mongoose = require('mongoose');
const { Recipe, PUBLISHED_FILTER } = require('../models/recipe.model');
const { User } = require('../models/user.model');
const { detectAllergens } = require('./safety_filter.service');
const { estimateNutrition } = require('./import_nutrition.service');
const { parseIngredientLine, lineFor } = require('../utils/recipe_parse.util');

// legacy/plain lines ("2 cups flour") are parsed; { name, quantity, unit } from the editor is used as given
const toLine = (i) => (typeof i === 'string' ? parseIngredientLine(i) : i);

// numbers the user typed beat our estimate; anything else is estimated server-side (never trusted from the client)
async function nutritionFor(data, lines, servings) {
  const typed = data.nutrition;
  if (typed && Object.values(typed).some((v) => v != null)) {
    const { kcal = null, protein = null, carbs = null, fat = null } = typed;
    return { status: 'complete', perServing: { kcal, protein, carbs, fat, fibre: null, sugar: null, sodium: null }, unmatchedPct: 0, calculatedAt: new Date(), source: 'declared' };
  }
  try {
    return await estimateNutrition(lines.map(({ name, quantity, unit }) => ({ name, quantity, unit })), servings);
  } catch (err) {
    console.error('Recipe nutrition estimate failed:', err.message);
    return { status: 'none', perServing: null };
  }
}

// Recipes a user added themselves. Catalogue queries exclude these (PUBLISHED_FILTER).
class UserRecipeService {
  async _fieldsFromData(data, { isUpdate = false } = {}) {
    const prep = data.prepMinutes || 0;
    const cook = data.cookMinutes || 0;
    const servings = data.servings || 4;
    const lines = (data.ingredients || []).map(toLine);
    const fields = {
      title: data.title,
      summary: data.summary || '',
      media: { imageUrl: data.imageUrl || null, altText: data.title },
      meta: {
        cuisines: data.cuisine ? [{ name: data.cuisine, slug: data.cuisine.toLowerCase().replace(/\s+/g, '-') }] : [],
        mealTypes: data.mealType ? [data.mealType] : [],
      },
      timing: { prepMinutes: prep, cookMinutes: cook, totalMinutes: prep + cook },
      yield: { servings },
      // flagged by keywords for the user to confirm; unverified recipes are never served to allergic users
      allergens: { contains: detectAllergens(lines.map((l) => l.name)), verified: Boolean(data.allergensVerified) },
      nutrition: await nutritionFor(data, lines, servings),
      ingredientGroups: lines.length ? [{ groupName: 'Ingredients', ingredients: lines.map((l) => ({ ...lineFor(l), ...(l.displayText ? { displayText: l.displayText } : {}) })) }] : [],
      instructionSteps: (data.steps || []).map((instruction, i) => ({ stepNumber: i + 1, instruction })),
    };
    if (!isUpdate && data.source) fields.source = { ...data.source, importedAt: new Date() };
    return fields;
  }

  async create(userId, data) {
    const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const fields = await this._fieldsFromData(data);
    return Recipe.create({
      externalId: `USR-${suffix.toUpperCase()}`,
      slug: `user-${suffix}`,
      createdBy: userId,
      updatedBy: 'User',
      ...fields,
    });
  }

  async update(userId, recipeId, data) {
    if (!mongoose.isValidObjectId(recipeId)) return null;
    const fields = await this._fieldsFromData(data, { isUpdate: true });
    return Recipe.findOneAndUpdate(
      { _id: recipeId, createdBy: userId },
      { $set: { ...fields, updatedBy: 'User' } },
      { returnDocument: 'after' }
    ).lean().exec();
  }

  // Own recipes plus catalogue recipes the user saved (still published only).
  async listMine(userId) {
    const user = await User.findById(userId).select('savedRecipes').lean().exec();
    const recipes = await Recipe.find({
      $or: [{ createdBy: userId }, { ...PUBLISHED_FILTER, _id: { $in: user?.savedRecipes || [] } }],
    })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
    return { recipes };
  }

  // Idempotent: saving twice keeps one entry. Returns false if the recipe isn't saveable.
  async save(userId, recipeId) {
    if (!mongoose.isValidObjectId(recipeId)) return false;
    const recipe = await Recipe.findOne({ ...PUBLISHED_FILTER, _id: recipeId }).select('_id').lean().exec();
    if (!recipe) return false;
    await User.updateOne({ _id: userId }, { $addToSet: { savedRecipes: recipe._id } });
    return true;
  }
}

module.exports = new UserRecipeService();
