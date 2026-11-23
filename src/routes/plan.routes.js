const express = require('express');
const mealPlanService = require('../services/meal_plan.service');
const slots = require('../services/plan_slot.service');
const notificationService = require('../services/notification.service');
const { planReady } = require('../services/notification_messages');
const { authGuard } = require('../middleware/auth.middleware');
const { validate } = require('../middleware/validation.middleware');
const { successResponse, errorResponse } = require('../utils/response.util');
const v = require('../validators/plan.validator');

const router = express.Router();

router.use(authGuard);

// wraps a service call: validated body -> service -> { success, data }
const handle = (message, fn) => async (req, res, next) => {
  try {
    return successResponse(res, await fn(req), message);
  } catch (err) {
    next(err);
  }
};

router.get('/current', handle('Current meal plan retrieved', (req) => mealPlanService.getCurrentPlan(req.user.id)));

router.post(
  '/generate',
  handle('Weekly meal plan generated and saved successfully', async (req) => {
    const plan = await mealPlanService.generateAndSavePlan(req.user.id, req.body);
    // inbox record (REQ-PRO-08 "plan ready"); never fails the generation itself
    if (plan?.startDate) {
      notificationService
        .notify(req.user.id, planReady(plan), `plan_ready:${Date.now()}`)
        .catch((e) => console.error('plan_ready notification failed:', e.message));
    }
    return plan;
  })
);

// slot actions (one meal at a time, never the whole week)
router.get('/slot/alternatives', async (req, res, next) => {
  const { error, value } = v.alternativesQuerySchema.validate(req.query, { stripUnknown: true });
  if (error) return errorResponse(res, 'Validation error', 400, error.details.map((d) => d.message));
  try {
    return successResponse(res, await slots.alternatives(req.user.id, value), 'Alternatives retrieved');
  } catch (err) {
    next(err);
  }
});
router.get('/slot/target', async (req, res, next) => {
  const { error, value } = v.alternativesQuerySchema.validate(req.query, { stripUnknown: true });
  if (error) return errorResponse(res, 'Validation error', 400, error.details.map((d) => d.message));
  try {
    return successResponse(res, await slots.slotTarget(req.user.id, value), 'Slot target retrieved');
  } catch (err) {
    next(err);
  }
});
router.post('/cooked', validate(v.cookedSchema), handle('Marked as cooked', (req) => slots.cooked(req.user.id, req.body)));
router.post('/slot/skip', validate(v.slotSchema), handle('Meal skipped', (req) => slots.skip(req.user.id, req.body)));
router.post('/slot/replace', validate(v.replaceSchema), handle('Meal replaced', (req) => slots.replace(req.user.id, req.body)));
router.post('/slot/remove', validate(v.slotSchema), handle('Meal removed', (req) => slots.remove(req.user.id, req.body)));
router.post('/slot/move', validate(v.relocateSchema), handle('Meal moved', (req) => slots.move(req.user.id, req.body)));
router.post('/slot/copy', validate(v.relocateSchema), handle('Meal copied', (req) => slots.copy(req.user.id, req.body)));
router.post('/slot/servings', validate(v.servingsSchema), handle('Servings updated', (req) => slots.setServings(req.user.id, req.body)));
router.post('/add-meal', validate(v.addMealSchema), handle('Meal added to your plan', (req) => slots.addMeal(req.user.id, req.body)));

module.exports = router;
