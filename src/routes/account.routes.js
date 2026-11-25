const express = require('express');
const account = require('../services/account.service');
const { authGuard } = require('../middleware/auth.middleware');
const { validate } = require('../middleware/validation.middleware');
const { createRateLimiter } = require('../middleware/rate_limit.middleware');
const { changePasswordSchema, deleteAccountSchema } = require('../validators/account.validator');
const { successResponse } = require('../utils/response.util');

const router = express.Router();

router.use(authGuard);
// password guessing through these routes: per signed-in user, not per IP
const limit = createRateLimiter({ max: 5, keyFn: (req) => String(req.user.id) });

const handle = (message, run) => async (req, res, next) => {
  try {
    return successResponse(res, await run(req), message);
  } catch (err) {
    return next(err);
  }
};

router.post('/change-password', limit, validate(changePasswordSchema), handle('Password changed', (req) => account.changePassword(req.user.id, req.body)));
router.post('/delete', limit, validate(deleteAccountSchema), handle('Your account and data were deleted', (req) => account.deleteAccount(req.user.id, req.body)));

module.exports = router;
