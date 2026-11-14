const ingredientService = require('../services/ingredient.service');
const { successResponse } = require('../utils/response.util');

class IngredientController {
  async search(req, res, next) {
    try {
      const { q, limit, category } = req.query;
      const ingredients = await ingredientService.searchIngredients(q, limit, category);
      return successResponse(res, ingredients, 'Ingredients retrieved successfully');
    } catch (err) {
      next(err);
    }
  }

  async getById(req, res, next) {
    try {
      const ingredient = await ingredientService.getIngredientById(req.params.id);
      if (!ingredient) {
        return res.status(404).json({ success: false, message: 'Ingredient not found' });
      }
      return successResponse(res, ingredient, 'Ingredient retrieved successfully');
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new IngredientController();

