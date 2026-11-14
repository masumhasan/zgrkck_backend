const { Recipe } = require('../models/recipe.model');

class RecipeService {
  buildFilterFromUserPreferences(onboarding = {}) {
    const filter = {};

    // 1. Allergies hard exclusion
    if (!onboarding.hasNoRestrictions && Array.isArray(onboarding.allergies) && onboarding.allergies.length > 0) {
      const lowerAllergies = onboarding.allergies.map((a) => a.toLowerCase().trim());
      filter['allergens.contains'] = { $nin: lowerAllergies };
    }

    // 2. Specific ingredients to avoid
    if (!onboarding.hasNoRestrictions && Array.isArray(onboarding.specificIngredients) && onboarding.specificIngredients.length > 0) {
      const regexPatterns = onboarding.specificIngredients.map((i) => new RegExp(i.trim(), 'i'));
      filter['ingredientGroups.ingredients.name'] = { $nin: regexPatterns };
    }

    // 3. Dietary & Religious restrictions
    const dietaryRestrictions = onboarding.dietaryRestrictions || [];
    if (dietaryRestrictions.includes('No Alcohol')) {
      filter['ingredientGroups.ingredients.category'] = { $ne: 'beverages' };
    }
    if (dietaryRestrictions.includes('Vegetarian') || onboarding.dietaryPreference === 'Vegetarian') {
      filter['meta.tags'] = { $in: ['vegetarian', 'vegan'] };
    } else if (dietaryRestrictions.includes('Vegan') || onboarding.dietaryPreference === 'Vegan') {
      filter['meta.tags'] = { $in: ['vegan'] };
    } else if (onboarding.dietaryPreference === 'Pescatarian') {
      filter['meta.tags'] = { $in: ['seafood', 'pescatarian', 'vegetarian', 'vegan'] };
    }

    // 4. Maximum Cooking Time filter
    if (onboarding.cookingTime) {
      const timeStr = onboarding.cookingTime.toLowerCase();
      if (timeStr.includes('15') && !timeStr.includes('30')) {
        filter['timing.totalMinutes'] = { $lte: 15 };
      } else if (timeStr.includes('30')) {
        filter['timing.totalMinutes'] = { $lte: 30 };
      } else if (timeStr.includes('45')) {
        filter['timing.totalMinutes'] = { $lte: 45 };
      } else if (timeStr.includes('60') && !timeStr.includes('+')) {
        filter['timing.totalMinutes'] = { $lte: 60 };
      }
    }

    return filter;
  }

  async getSafeCandidateRecipes(onboarding = {}, limit = 40) {
    const filter = this.buildFilterFromUserPreferences(onboarding);

    // If user has favourite cuisines, boost or match them
    if (Array.isArray(onboarding.favouriteCuisines) && onboarding.favouriteCuisines.length > 0) {
      const cuisineFilter = {
        ...filter,
        'meta.cuisines.name': {
          $in: onboarding.favouriteCuisines.map((c) => new RegExp(`^${c}$`, 'i')),
        },
      };
      const cuisineMatches = await Recipe.find(cuisineFilter)
        .select('title summary media meta timing allergens yield')
        .limit(limit)
        .lean()
        .exec();

      if (cuisineMatches.length >= 14) {
        return cuisineMatches;
      }
    }

    // Fallback or fill with all safe candidate recipes matching filters
    return Recipe.find(filter)
      .select('title summary media meta timing allergens yield')
      .limit(limit)
      .lean()
      .exec();
  }

  async searchRecipes({ query, cuisine, mealType, maxTime, page = 1, limit = 20 }) {
    const filter = {};
    if (query) {
      filter.$text = { $search: query };
    }
    if (cuisine) {
      const clean = cuisine.trim();
      const slugVariant = clean.toLowerCase().replace(/\s+/g, '-');
      filter.$or = [
        { 'meta.cuisines.slug': clean.toLowerCase() },
        { 'meta.cuisines.slug': slugVariant },
        { 'meta.cuisines.name': new RegExp(`^${clean}$`, 'i') },
      ];
    }
    if (mealType) {
      filter['meta.mealTypes'] = mealType.toLowerCase();
    }
    if (maxTime) {
      filter['timing.totalMinutes'] = { $lte: parseInt(maxTime, 10) };
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, parseInt(limit, 10) || 20);
    const skip = (pageNum - 1) * limitNum;

    const [recipes, total] = await Promise.all([
      Recipe.find(filter).skip(skip).limit(limitNum).lean().exec(),
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

  async getRecipeById(id) {
    return Recipe.findById(id).lean().exec();
  }
}

module.exports = new RecipeService();

