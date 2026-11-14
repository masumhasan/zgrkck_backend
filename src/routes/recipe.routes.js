const express = require('express');
const recipeService = require('../services/recipe.service');
const cuisineService = require('../services/cuisine.service');
const { Cuisine } = require('../models/cuisine.model');
const { Ingredient } = require('../models/ingredient.model');
const { successResponse, errorResponse } = require('../utils/response.util');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const result = await recipeService.searchRecipes(req.query);
    return successResponse(res, result, 'Recipes retrieved successfully');
  } catch (err) {
    next(err);
  }
});

router.get('/cuisines', async (req, res, next) => {
  try {
    const cuisines = await cuisineService.getAllCuisines();
    return successResponse(res, cuisines, 'Cuisines retrieved successfully');
  } catch (err) {
    next(err);
  }
});

router.get('/ingredients', async (req, res, next) => {
  try {
    const { search = '', limit = 30 } = req.query;
    const filter = search
      ? {
          $or: [
            { name: { $regex: search, $options: 'i' } },
            { aliases: { $regex: search, $options: 'i' } },
          ],
        }
      : {};

    const ingredients = await Ingredient.find(filter)
      .sort({ recipeCount: -1 })
      .limit(parseInt(limit, 10))
      .lean()
      .exec();

    return successResponse(res, ingredients, 'Ingredients retrieved successfully');
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const recipe = await recipeService.getRecipeById(req.params.id);
    if (!recipe) {
      return errorResponse(res, 'Recipe not found', 404);
    }
    return successResponse(res, recipe, 'Recipe details retrieved successfully');
  } catch (err) {
    next(err);
  }
});

module.exports = router;

