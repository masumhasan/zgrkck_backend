const express = require('express');
const userRepository = require('../repositories/user.repository');
const nutritionTargetService = require('../services/nutrition_target.service');
const progressService = require('../services/progress.service');
const avatarService = require('../services/avatar.service');
const appSettingsService = require('../services/app_settings.service');
const dataExportService = require('../services/data_export.service');
const { appSettingsSchema } = require('../validators/app_settings.validator');
const { authGuard } = require('../middleware/auth.middleware');
const { validate } = require('../middleware/validation.middleware');
const { personalInfoSchema } = require('../validators/personal_info.validator');
const { successResponse, errorResponse } = require('../utils/response.util');

const router = express.Router();

router.use(authGuard);

router.get('/progress', async (req, res, next) => {
  try {
    const data = await progressService.getUserProgress(req.user.id);
    return successResponse(res, data, 'User progress retrieved successfully');
  } catch (err) {
    next(err);
  }
});

router.get('/me', async (req, res, next) => {
  try {
    let user = await userRepository.findById(req.user.id);
    if (!user) {
      return errorResponse(res, 'User not found', 404);
    }

    // Auto-initialize nutrition target if not set yet
    if (user.personalInfoCompleted && !user.nutritionTarget?.lastCalculatedAt) {
      const initialTarget = nutritionTargetService.calculateTarget(user);
      user = await userRepository.updateNutritionTarget(user._id, initialTarget);
    }

    return successResponse(
      res,
      {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        avatarUrl: user.avatarUrl || null,
        role: user.role,
        onboardingCompleted: user.onboardingCompleted,
        personalInfoCompleted: user.personalInfoCompleted || false,
        personalInfo: user.personalInfo || {},
        onboarding: user.onboarding || {},
        nutritionTarget: user.nutritionTarget || {},
      },
      'User profile fetched successfully'
    );
  } catch (err) {
    next(err);
  }
});

router.get('/me/settings', async (req, res, next) => {
  try {
    return successResponse(res, await appSettingsService.get(req.user.id), 'Settings retrieved successfully');
  } catch (err) {
    next(err);
  }
});

router.put('/me/settings', validate(appSettingsSchema), async (req, res, next) => {
  try {
    return successResponse(res, await appSettingsService.update(req.user.id, req.body), 'Settings updated successfully');
  } catch (err) {
    next(err);
  }
});

router.post('/me/export', async (req, res, next) => {
  try {
    return successResponse(res, await dataExportService.emailExport(req.user.id), 'Your data export is on its way');
  } catch (err) {
    next(err);
  }
});

// profile photo: the raw image bytes as the request body (Content-Type image/jpeg|png|webp)
router.post('/me/avatar', express.raw({ type: ['image/*', 'application/octet-stream'], limit: '5mb' }), async (req, res, next) => {
  try {
    return successResponse(res, await avatarService.setAvatar(req.user.id, req.body), 'Profile photo updated');
  } catch (err) {
    next(err);
  }
});

router.post('/regenerate-target', async (req, res, next) => {
  try {
    const updatedTarget = await nutritionTargetService.regenerateUserTarget(req.user.id);
    return successResponse(res, updatedTarget, 'Nutrition target regenerated successfully');
  } catch (err) {
    next(err);
  }
});

router.post('/personal-info', validate(personalInfoSchema), async (req, res, next) => {
  try {
    const updatedUser = await userRepository.updatePersonalInfo(
      req.user.id,
      req.body
    );

    if (!updatedUser) {
      return errorResponse(res, 'User not found', 404);
    }

    return successResponse(
      res,
      {
        personalInfoCompleted: updatedUser.personalInfoCompleted,
        personalInfo: updatedUser.personalInfo,
      },
      'Personal info saved successfully'
    );
  } catch (err) {
    next(err);
  }
});

module.exports = router;

