const express = require('express');
const refreshService = require('../services/nutrition_refresh.service');
const recipeNutrition = require('../services/recipe_nutrition.service');
const { authGuard, requireRole } = require('../middleware/auth.middleware');
const { successResponse } = require('../utils/response.util');

const router = express.Router();

router.use(authGuard, requireRole('admin'));

// last run + the recalculation changes (over 10% in calories) waiting for approval
router.get('/status', async (req, res, next) => {
  try {
    return successResponse(res, await refreshService.status(), 'Nutrition status retrieved');
  } catch (err) {
    next(err);
  }
});

// USDA data refresh + recalculation of all recipes, runs in the background (409 if one is already running)
router.post('/refresh', async (req, res, next) => {
  try {
    await refreshService.start();
    return successResponse(res, { started: true }, 'Nutrition refresh started', 202);
  } catch (err) {
    next(err);
  }
});

router.post('/pending/:recipeId/approve', async (req, res, next) => {
  try {
    await recipeNutrition.approvePending(req.params.recipeId);
    return successResponse(res, { approved: true }, 'Change approved');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
