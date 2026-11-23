const crypto = require('crypto');
const { User } = require('../models/user.model');
const { Recipe, PUBLISHED_FILTER } = require('../models/recipe.model');
const recipeService = require('./recipe.service');
const { filterSafe, escapeRegex } = require('./safety_filter.service');
const { score } = require('./ranking.service');
const { PantryItem } = require('../models/pantry.model');

const LIST_SIZE = 10;
const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');

class ForYouService {
  // One ranked list per user per UTC day. The key includes a hash of the onboarding profile
  // so changing allergies/diet invalidates the cache immediately (never serve a stale unsafe pick).
  async getForYou(userId) {
    const user = await User.findById(userId).select('onboarding forYouCache tasteWeights').lean().exec();
    const weights = user?.tasteWeights || {};
    if (!user) return [];
    const onboarding = user.onboarding || {};
    const day = new Date().toISOString().slice(0, 10);
    // the key also covers what the user cooked/skipped, so the list refreshes after cooking
    const key = `${day}:${md5(JSON.stringify(onboarding) + JSON.stringify(weights))}`;

    let items = user.forYouCache?.key === key ? user.forYouCache.items : null;
    if (!items) {
      const candidates = await recipeService.getSafeCandidateRecipes(onboarding, 40);
      items = candidates
        .map((r) => ({ recipeId: r._id, ...score(r, onboarding, weights), tie: md5(`${userId}${day}${r._id}`) }))
        .sort((a, b) => b.match - a.match || a.tie.localeCompare(b.tie))
        .slice(0, LIST_SIZE)
        .map(({ tie, ...rest }) => rest);
      await User.updateOne({ _id: userId }, { $set: { forYouCache: { key, items } } });
    }

    // Re-read from the DB so admin-unpublished recipes drop out of a cached list.
    const recipes = await Recipe.find({ ...PUBLISHED_FILTER, _id: { $in: items.map((i) => i.recipeId) } })
      .select('title summary media meta timing allergens')
      .lean()
      .exec();
    // validate again in code before anything leaves the server
    const byId = new Map(filterSafe(recipes, onboarding).map((r) => [String(r._id), r]));
    return items
      .filter((i) => byId.has(String(i.recipeId)))
      .map((i) => ({ ...byId.get(String(i.recipeId)), match: i.match, reason: i.reason }));
  }

  // 'Use it up' (recipes built around pantry items expiring within a week) and
  // 'Faster meals' (<= 15 min). Both go through the same allergen/diet safety filter.
  async getExtras(userId) {
    const user = await User.findById(userId).select('onboarding').lean().exec();
    const onboarding = user?.onboarding || {};
    const safe = recipeService.buildFilterFromUserPreferences(onboarding);
    const slim = 'title media timing meta.mealTypes meta.dietaryFlags allergens';

    const today = new Date().toISOString().slice(0, 10);
    const weekOut = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
    const expiring = await PantryItem.find({ userId, useBy: { $gte: today, $lte: weekOut } })
      .select('name')
      .lean()
      .exec();
    const names = [...new Set(expiring.map((i) => i.name.trim().toLowerCase()).filter(Boolean))];

    let useItUp = [];
    if (names.length) {
      const rx = names.map((n) => new RegExp(escapeRegex(n), 'i'));
      const docs = await Recipe.find({ $and: [safe, { 'ingredientGroups.ingredients.name': { $in: rx } }] })
        .select(`${slim} ingredientGroups.ingredients.name`)
        .limit(30)
        .lean()
        .exec();
      useItUp = filterSafe(docs, onboarding)
        .map(({ ingredientGroups = [], ...r }) => {
          const have = ingredientGroups.flatMap((g) => g.ingredients.map((i) => i.name.toLowerCase()));
          return { ...r, used: names.filter((n) => have.some((h) => h.includes(n))) };
        })
        .filter((r) => r.used.length)
        .sort((a, b) => b.used.length - a.used.length)
        .slice(0, 6);
    }

    const quickDocs = await Recipe.find({ $and: [safe, { 'timing.totalMinutes': { $gt: 0, $lte: 15 } }] })
      .select(slim)
      .limit(6)
      .lean()
      .exec();
    return { useItUp, quick: filterSafe(quickDocs, onboarding) };
  }
}

module.exports = new ForYouService();
