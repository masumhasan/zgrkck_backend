const express = require('express');
const household = require('../services/household.service');
const { authGuard } = require('../middleware/auth.middleware');
const { validate } = require('../middleware/validation.middleware');
const { createMemberSchema, updateMemberSchema, planModeSchema } = require('../validators/household.validator');
const { successResponse } = require('../utils/response.util');

const router = express.Router();

router.use(authGuard);

const handle = (message, status, run) => async (req, res, next) => {
  try {
    return successResponse(res, await run(req), message, status);
  } catch (err) {
    return next(err);
  }
};

router.get('/', handle('Household retrieved successfully', 200, (req) => household.listHousehold(req.user.id)));
router.put('/plan-mode', validate(planModeSchema), handle('Plan mode updated', 200, (req) => household.setPlanMode(req.user.id, req.body.planForHousehold)));
router.post('/members', validate(createMemberSchema), handle('Household member added', 201, (req) => household.createMember(req.user.id, req.body)));
router.put('/members/:id', validate(updateMemberSchema), handle('Household member updated', 200, (req) => household.updateMember(req.user.id, req.params.id, req.body)));
router.delete('/members/:id', handle('Household member removed', 200, (req) => household.deleteMember(req.user.id, req.params.id)));

module.exports = router;
