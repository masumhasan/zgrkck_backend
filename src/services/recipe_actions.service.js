const mongoose = require('mongoose');
const { Recipe, PUBLISHED_FILTER } = require('../models/recipe.model');
const { User } = require('../models/user.model');
const { RecipeReport } = require('../models/recipe_report.model');
const activityService = require('./activity.service');

const httpError = (message, statusCode) => Object.assign(new Error(message), { statusCode });
const asId = (id) => {
  if (!mongoose.isValidObjectId(id)) throw httpError('Recipe not found', 404);
  return id;
};

// a copy the user owns and can change; independent of the original (no version link)
const duplicate = async (userId, recipeId) => {
  const r = await Recipe.findOne({ _id: asId(recipeId), $or: [{ ...PUBLISHED_FILTER }, { createdBy: userId }] }).lean().exec();
  if (!r) throw httpError('Recipe not found', 404);
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const { _id, createdAt, updatedAt, parentRecipeId, version, ...rest } = r;
  const copy = await Recipe.create({
    ...rest,
    externalId: `USR-${suffix.toUpperCase()}`,
    slug: `user-${suffix}`,
    title: `${r.title} (copy)`,
    status: 'Published',
    createdBy: userId,
    updatedBy: 'User',
    // a catalogue recipe's allergen data is trusted; a copy of the user's own keeps its own flag
    allergens: { ...(r.allergens || {}), verified: r.createdBy ? Boolean(r.allergens?.verified) : true },
    source: { type: 'adapted', name: `Copy of ${r.title}`.slice(0, 120), importedAt: new Date() },
  });
  return { id: String(copy._id), title: copy.title };
};

// only the user's own recipes; catalogue recipes cannot be deleted from the app
const remove = async (userId, recipeId) => {
  const gone = await Recipe.findOneAndDelete({ _id: asId(recipeId), createdBy: userId }).lean().exec();
  if (!gone) throw httpError('Recipe not found', 404);
  await User.updateOne({ _id: userId }, { $pull: { savedRecipes: gone._id, favoriteRecipes: gone._id } });
  return { deleted: true };
};

// "Remove from My Recipes" from the details screen. Your own recipe (created, imported or an Ask Mealist
// version) is deleted; a catalogue recipe you saved is only taken off the list, the recipe itself stays.
const removeFromMine = async (userId, recipeId) => {
  const id = asId(recipeId);
  const own = await Recipe.exists({ _id: id, createdBy: userId });
  if (own) {
    await remove(userId, id);
    return { removed: 'deleted' };
  }
  const user = await User.findOneAndUpdate({ _id: userId, savedRecipes: id }, { $pull: { savedRecipes: id } }).select('_id').lean().exec();
  if (!user) throw httpError('This recipe is not in My Recipes', 404);
  return { removed: 'unsaved' };
};

// is this recipe in the viewer's My Recipes (own or saved), and is it theirs to delete?
const membership = async (userId, recipe) => {
  if (!userId) return { inMyRecipes: false, isOwn: false };
  const isOwn = Boolean(recipe.createdBy) && String(recipe.createdBy) === String(userId);
  if (isOwn) return { inMyRecipes: true, isOwn };
  const saved = await User.exists({ _id: userId, savedRecipes: recipe._id });
  return { inMyRecipes: Boolean(saved), isOwn: false };
};

const report = async (userId, recipeId, { kind, note = '' }) => {
  const r = await Recipe.findOne({ _id: asId(recipeId), $or: [{ ...PUBLISHED_FILTER }, { createdBy: userId }] }).select('title').lean().exec();
  if (!r) throw httpError('Recipe not found', 404);
  await RecipeReport.create({ userId, recipeId: r._id, kind, note });
  activityService.log('recipe_report', `Problem reported on "${r.title}" (${kind})`);
  return { reported: true };
};

module.exports = { duplicate, remove, removeFromMine, membership, report };
