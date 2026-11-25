const express = require('express');
const Joi = require('joi');
const adapt = require('../services/recipe_adapt.service');
const actions = require('../services/recipe_actions.service');
const { authGuard } = require('../middleware/auth.middleware');
const { validate } = require('../middleware/validation.middleware');
const { createRateLimiter } = require('../middleware/rate_limit.middleware');
const { successResponse } = require('../utils/response.util');

const router = express.Router();
// auth per route, not router.use: this router shares the /recipes prefix with public catalogue routes

// Ask Mealist is code-only today, but cheap to hammer: per signed-in user
const adaptLimit = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 60, keyFn: (req) => String(req.user.id) });
const reportLimit = createRateLimiter({ windowMs: 60 * 60 * 1000, max: 10, keyFn: (req) => String(req.user.id) });

const promptSchema = Joi.object({ prompt: Joi.string().trim().min(2).max(300).required() });
const reportSchema = Joi.object({
  kind: Joi.string().valid('quantity', 'allergen', 'instructions', 'other').required(),
  note: Joi.string().trim().allow('').max(500),
});

const handle = (message, status, run) => async (req, res, next) => {
  try {
    return successResponse(res, await run(req), message, status);
  } catch (err) {
    return next(err);
  }
};

router.post('/:id/adapt', authGuard, adaptLimit, validate(promptSchema), handle('Here is what would change', 200, (req) => adapt.preview(req.user.id, req.params.id, req.body.prompt)));
router.post('/:id/versions', authGuard, adaptLimit, validate(promptSchema), handle('Saved as a new version', 201, (req) => adapt.saveVersion(req.user.id, req.params.id, req.body.prompt)));
router.get('/:id/versions', authGuard, handle('Versions retrieved', 200, (req) => adapt.versions(req.user.id, req.params.id)));
router.post('/:id/duplicate', authGuard, handle('Recipe duplicated', 201, (req) => actions.duplicate(req.user.id, req.params.id)));
router.post('/:id/report', authGuard, reportLimit, validate(reportSchema), handle('Thanks, we will take a look', 201, (req) => actions.report(req.user.id, req.params.id, req.body)));
router.delete('/:id/mine', authGuard, handle('Removed from My Recipes', 200, (req) => actions.removeFromMine(req.user.id, req.params.id)));
router.delete('/:id', authGuard, handle('Recipe deleted', 200, (req) => actions.remove(req.user.id, req.params.id)));

module.exports = router;
