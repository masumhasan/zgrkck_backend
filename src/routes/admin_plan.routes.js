const express = require('express');
const planService = require('../services/subscription_plan.service');
const { authGuard, requireRole } = require('../middleware/auth.middleware');
const { validate } = require('../middleware/validation.middleware');
const { createPlanSchema, updatePlanSchema } = require('../validators/admin.validator');
const { successResponse } = require('../utils/response.util');

const router = express.Router();

router.use(authGuard, requireRole('admin'));

router.get('/', async (req, res, next) => {
  try {
    return successResponse(res, await planService.list(), 'Plans retrieved');
  } catch (err) {
    next(err);
  }
});

router.post('/', validate(createPlanSchema), async (req, res, next) => {
  try {
    return successResponse(res, await planService.create(req.body), 'Plan created', 201);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', validate(updatePlanSchema), async (req, res, next) => {
  try {
    return successResponse(res, await planService.update(req.params.id, req.body), 'Plan updated');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
