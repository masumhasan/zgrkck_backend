const express = require('express');
const mealPlanService = require('../services/meal_plan.service');
const { authGuard } = require('../middleware/auth.middleware');
const { successResponse, errorResponse } = require('../utils/response.util');

const router = express.Router();

router.use(authGuard);

router.get('/current', async (req, res, next) => {
  try {
    const plan = await mealPlanService.getCurrentPlan(req.user.id);
    return successResponse(res, plan, 'Current meal plan retrieved');
  } catch (err) {
    next(err);
  }
});

router.post('/generate', async (req, res, next) => {
  try {
    const plan = await mealPlanService.generateAndSavePlan(req.user.id, req.body);
    return successResponse(res, plan, 'Weekly meal plan generated and saved successfully');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
