const { Ingredient } = require('../models/ingredient.model');

class IngredientService {
  async searchIngredients(query = '', limit = 30, category = null) {
    const filter = {};

    if (query && query.trim().length > 0) {
      const escaped = query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { name: { $regex: escaped, $options: 'i' } },
        { aliases: { $regex: escaped, $options: 'i' } },
      ];
    }

    if (category && category.trim().length > 0) {
      filter.category = category.trim().toLowerCase();
    }

    const maxLimit = Math.min(parseInt(limit, 10) || 30, 100);

    const ingredients = await Ingredient.find(filter)
      .select('_id name category imageUrl recipeCount aliases description')
      .sort(query ? { recipeCount: -1, name: 1 } : { recipeCount: -1 })
      .limit(maxLimit)
      .lean()
      .exec();

    return ingredients;
  }

  async getIngredientById(id) {
    return Ingredient.findById(id).lean().exec();
  }
}

module.exports = new IngredientService();

