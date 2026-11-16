const express = require('express');
const adminAuthService = require('../services/admin_auth.service');
const { authGuard, requireRole } = require('../middleware/auth.middleware');
const { validate } = require('../middleware/validation.middleware');
const { createRateLimiter } = require('../middleware/rate_limit.middleware');
const {
  adminLoginSchema,
  profileSchema,
  notificationsSchema,
  changePasswordSchema,
} = require('../validators/admin.validator');
const { successResponse } = require('../utils/response.util');

const router = express.Router();
const loginLimiter = createRateLimiter({ max: 10 });

router.post('/login', loginLimiter, validate(adminLoginSchema), async (req, res, next) => {
  try {
    const result = await adminAuthService.login(req.body, req);
    return successResponse(res, result, 'Admin signed in successfully');
  } catch (err) {
    next(err);
  }
});

router.use(authGuard, requireRole('admin'));

router.get('/me', async (req, res, next) => {
  try {
    const admin = await adminAuthService.getProfile(req.user.id, req);
    return successResponse(res, admin, 'Admin profile retrieved');
  } catch (err) {
    next(err);
  }
});

router.patch('/profile', validate(profileSchema), async (req, res, next) => {
  try {
    const admin = await adminAuthService.updateProfile(req.user.id, req.body, req);
    return successResponse(res, admin, 'Profile updated');
  } catch (err) {
    next(err);
  }
});

router.patch('/notifications', validate(notificationsSchema), async (req, res, next) => {
  try {
    const admin = await adminAuthService.updateNotifications(req.user.id, req.body, req);
    return successResponse(res, admin, 'Notification preferences updated');
  } catch (err) {
    next(err);
  }
});

router.post('/change-password', validate(changePasswordSchema), async (req, res, next) => {
  try {
    const result = await adminAuthService.changePassword(req.user.id, req.body);
    return successResponse(res, result, 'Password updated successfully');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
