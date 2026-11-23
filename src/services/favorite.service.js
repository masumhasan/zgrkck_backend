const mongoose = require('mongoose');
const { Recipe, PUBLISHED_FILTER } = require('../models/recipe.model');
const { User } = require('../models/user.model');
const { buildSafeFilter, filterSafe } = require('./safety_filter.service');

const LIST_FIELDS = 'title summary media meta timing allergens yield';

// Recipes the user hearted. Only published catalogue recipes can be favourites, and the list
// goes through the safety choke point like every other recipe list served to a user.
class FavoriteService {
  // most recently hearted first; recipes now unsafe for the user (allergy/diet changed) or
  // unpublished by an admin are left out and counted in `hiddenCount`
  async list(userId) {
    const user = await User.findById(userId).select('favoriteRecipes onboarding').lean().exec();
    const ids = user?.favoriteRecipes || [];
    if (!ids.length) return { recipes: [], hiddenCount: 0 };

    // cooking time is a preference, not safety: a hearted 60-min recipe stays visible
    const onboarding = { ...(user.onboarding || {}), cookingTime: null };
    const found = await Recipe.find({ ...buildSafeFilter(onboarding), _id: { $in: ids } })
      .select(LIST_FIELDS)
      .lean()
      .exec();
    const byId = new Map(filterSafe(found, onboarding).map((r) => [r._id.toString(), r]));
    const recipes = [...ids]
      .reverse()
      .map((id) => byId.get(id.toString()))
      .filter(Boolean)
      .map((r) => ({ ...r, isFavorite: true }));
    return { recipes, hiddenCount: ids.length - recipes.length };
  }

  // idempotent; false when the recipe isn't a published catalogue recipe
  async add(userId, recipeId) {
    const recipe = await Recipe.findOne({ ...PUBLISHED_FILTER, _id: recipeId }).select('_id').lean().exec();
    if (!recipe) return false;
    await User.updateOne({ _id: userId }, { $addToSet: { favoriteRecipes: recipe._id } });
    return true;
  }

  // idempotent; works for stale ids too (e.g. a recipe that was unpublished later)
  async remove(userId, recipeId) {
    await User.updateOne({ _id: userId }, { $pull: { favoriteRecipes: recipeId } });
    return true;
  }

  async isFavorite(userId, recipeId) {
    if (!userId || !mongoose.isValidObjectId(recipeId)) return false;
    return Boolean(await User.exists({ _id: userId, favoriteRecipes: recipeId }));
  }
}

module.exports = new FavoriteService();
