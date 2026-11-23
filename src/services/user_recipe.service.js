const mongoose = require('mongoose');
const { Recipe, PUBLISHED_FILTER } = require('../models/recipe.model');
const { User } = require('../models/user.model');

// Recipes a user added themselves. Catalogue queries exclude these (PUBLISHED_FILTER).
class UserRecipeService {
  async create(userId, data) {
    const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const prep = data.prepMinutes || 0;
    const cook = data.cookMinutes || 0;
    const ingredients = data.ingredients || [];

    return Recipe.create({
      externalId: `USR-${suffix.toUpperCase()}`,
      title: data.title,
      slug: `user-${suffix}`,
      summary: data.summary || '',
      createdBy: userId,
      updatedBy: 'User',
      media: { imageUrl: data.imageUrl || null, altText: data.title },
      meta: {
        cuisines: data.cuisine ? [{ name: data.cuisine, slug: data.cuisine.toLowerCase().replace(/\s+/g, '-') }] : [],
        mealTypes: data.mealType ? [data.mealType] : [],
      },
      timing: { prepMinutes: prep, cookMinutes: cook, totalMinutes: prep + cook },
      ingredientGroups: ingredients.length
        ? [{ groupName: 'Ingredients', ingredients: ingredients.map((name) => ({ name, displayText: name })) }]
        : [],
      instructionSteps: (data.steps || []).map((instruction, i) => ({ stepNumber: i + 1, instruction })),
    });
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
