const express = require('express');
const recipeService = require('../services/recipe.service');
const cuisineService = require('../services/cuisine.service');
const exploreController = require('../controllers/explore.controller');
const { Cuisine } = require('../models/cuisine.model');
const { Ingredient } = require('../models/ingredient.model');
const forYouService = require('../services/for_you.service');
const { escapeRegex } = require('../services/safety_filter.service');
const userRecipeService = require('../services/user_recipe.service');
const favoriteService = require('../services/favorite.service');
const { validate } = require('../middleware/validation.middleware');
const { createRecipeSchema, importLinkSchema, importTextSchema, draftStepsSchema } = require('../validators/user_recipe.validator');
const recipeStepsDraft = require('../services/recipe_steps_draft.service');
const recipeImportService = require('../services/recipe_import.service');
const { createRateLimiter } = require('../middleware/rate_limit.middleware');
const { authGuard, optionalAuth } = require('../middleware/auth.middleware');
const { successResponse, errorResponse } = require('../utils/response.util');

const recipeActions = require('../services/recipe_actions.service');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const result = await recipeService.searchRecipes(req.query);
    return successResponse(res, result, 'Recipes retrieved successfully');
  } catch (err) {
    next(err);
  }
});

// AI semantic search
router.post('/ai-search', optionalAuth, exploreController.aiSearch.bind(exploreController));
router.get('/ai-search', optionalAuth, exploreController.aiSearch.bind(exploreController));

// Personalized surprise me recommendation
router.get('/surprise-me', optionalAuth, exploreController.getSurpriseMe.bind(exploreController));

// Ranked recommendations (cached per user per day): Home shows [0], Explore shows the list
router.get('/for-you', authGuard, async (req, res, next) => {
  try {
    return successResponse(res, { recipes: await forYouService.getForYou(req.user.id) }, 'For You retrieved successfully');
  } catch (err) {
    next(err);
  }
});

router.get('/for-you/extras', authGuard, async (req, res, next) => {
  try {
    return successResponse(res, await forYouService.getExtras(req.user.id), 'For You extras retrieved successfully');
  } catch (err) {
    next(err);
  }
});

// Recipes the user added themselves
router.get('/mine', authGuard, async (req, res, next) => {
  try {
    return successResponse(res, await userRecipeService.listMine(req.user.id), 'Your recipes retrieved successfully');
  } catch (err) {
    next(err);
  }
});

// Imports return a DRAFT for the review screen (nothing is saved). They fetch pages / call AI, so they are rate limited per user.
const importLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 20, keyFn: (req) => req.user.id });
const importRoute = (run) => async (req, res, next) => {
  try {
    return successResponse(res, { draft: await run(req) }, 'Recipe read successfully');
  } catch (err) {
    // 5xx messages are hidden by the error handler; this one is meant for the user
    if (err.code === 'PHOTO_UNAVAILABLE') return errorResponse(res, err.message, 503);
    next(err);
  }
};
router.post('/import/link', authGuard, importLimiter, validate(importLinkSchema), importRoute((req) => recipeImportService.fromLink(req.body.url)));
router.post('/import/text', authGuard, importLimiter, validate(importTextSchema), importRoute((req) => recipeImportService.fromText(req.body.text)));
router.post('/import/photo', authGuard, importLimiter, express.raw({ type: ['image/*', 'application/octet-stream'], limit: '8mb' }), importRoute((req) => recipeImportService.fromPhoto(req.body)));

// AI-drafted preparation steps for the creator's ingredient list (a draft, nothing saved)
router.post('/draft-steps', authGuard, importLimiter, validate(draftStepsSchema), async (req, res, next) => {
  try {
    return successResponse(res, { steps: await recipeStepsDraft.draftSteps(req.body) }, 'Steps drafted');
  } catch (err) {
    if (err.statusCode === 503 || err.statusCode === 422) return errorResponse(res, err.message, err.statusCode);
    next(err);
  }
});

router.post('/', authGuard, validate(createRecipeSchema), async (req, res, next) => {
  try {
    const recipe = await userRecipeService.create(req.user.id, req.body);
    return successResponse(res, recipe, 'Recipe added successfully', 201);
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
    const search = escapeRegex(String(req.query.search || '').slice(0, 60));
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 30));
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
      .limit(limit)
      .lean()
      .exec();

    return successResponse(res, ingredients, 'Ingredients retrieved successfully');
  } catch (err) {
    next(err);
  }
});

router.post('/:id/save', authGuard, async (req, res, next) => {
  try {
    const saved = await userRecipeService.save(req.user.id, req.params.id);
    if (!saved) return errorResponse(res, 'Recipe not found', 404);
    return successResponse(res, { saved: true }, 'Recipe added to My Recipes');
  } catch (err) {
    next(err);
  }
});

router.get('/:id', optionalAuth, async (req, res, next) => {
  try {
    const recipe = await recipeService.getRecipeById(req.params.id, req.user?.id);
    if (!recipe) {
      return errorResponse(res, 'Recipe not found', 404);
    }
    recipe.isFavorite = await favoriteService.isFavorite(req.user?.id, recipe._id);
    Object.assign(recipe, await recipeActions.membership(req.user?.id, recipe));
    return successResponse(res, recipe, 'Recipe details retrieved successfully');
  } catch (err) {
    next(err);
  }
});

module.exports = router;

