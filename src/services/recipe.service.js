const { Recipe, PUBLISHED_FILTER } = require('../models/recipe.model');
const { withNutrition } = require('../utils/nutrition_public.util');
const { buildSafeFilter, escapeRegex } = require('./safety_filter.service');

class RecipeService {
  // all safety rules live in safety_filter.service.js (single choke point)
  buildFilterFromUserPreferences(onboarding = {}) {
    return buildSafeFilter(onboarding);
  }

  async getSafeCandidateRecipes(onboarding = {}, limit = 40) {
    const filter = this.buildFilterFromUserPreferences(onboarding);
    const fields = 'title summary media meta timing allergens yield nutrition';

    // If user has favourite cuisines, boost or match them
    if (Array.isArray(onboarding.favouriteCuisines) && onboarding.favouriteCuisines.length > 0) {
      const cuisineFilter = {
        ...filter,
        'meta.cuisines.name': {
          $in: onboarding.favouriteCuisines.map((c) => new RegExp(`^${escapeRegex(c)}$`, 'i')),
        },
      };
      const cuisineMatches = await Recipe.find(cuisineFilter).select(fields).limit(limit).lean().exec();

      if (cuisineMatches.length >= 14) {
        return cuisineMatches;
      }
    }

    // Fallback or fill with all safe candidate recipes matching filters
    return Recipe.find(filter).select(fields).limit(limit).lean().exec();
  }

  async searchRecipes({ query, cuisine, mealType, maxTime, page = 1, limit = 20 }) {
    const filter = { ...PUBLISHED_FILTER };
    if (query) {
      filter.$text = { $search: String(query) };
    }
    if (cuisine) {
      const clean = String(cuisine).trim();
      const slugVariant = clean.toLowerCase().replace(/\s+/g, '-');
      filter.$or = [
        { 'meta.cuisines.slug': clean.toLowerCase() },
        { 'meta.cuisines.slug': slugVariant },
        { 'meta.cuisines.name': new RegExp(`^${escapeRegex(clean)}$`, 'i') },
      ];
    }
    if (mealType) {
      filter['meta.mealTypes'] = String(mealType).toLowerCase();
    }
    const max = parseInt(maxTime, 10);
    if (max > 0) {
      filter['timing.totalMinutes'] = { $lte: max };
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const [recipes, total] = await Promise.all([
      Recipe.find(filter).skip(skip).limit(limitNum).lean().exec().then((docs) => docs.map(withNutrition)),
      Recipe.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(total / limitNum);

    return {
      recipes,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages,
        hasMore: pageNum < totalPages,
      },
    };
  }

  // only published catalogue recipes, or the viewer's own creations
  async getRecipeById(id, viewerId = null) {
    const visible = viewerId ? { $or: [{ ...PUBLISHED_FILTER }, { createdBy: viewerId }] } : { ...PUBLISHED_FILTER };
    const recipe = await Recipe.findOne({ _id: id, ...visible }).lean().exec();
    if (!recipe) return null;
    if (recipe.media) {
      const v = recipe.media.videoUrl;
      if (!v || typeof v !== 'string' || !v.trim() || v.trim().toLowerCase() === 'null') {
        recipe.media.videoUrl = null;
      } else {
        recipe.media.videoUrl = v.trim();
      }
    }
    return withNutrition(recipe);
  }
}

module.exports = new RecipeService();
