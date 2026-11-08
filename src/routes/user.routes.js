const express = require('express');
const userRepository = require('../repositories/user.repository');
const nutritionTargetService = require('../services/nutrition_target.service');
const { authGuard } = require('../middleware/auth.middleware');
const { validate } = require('../middleware/validation.middleware');
const { personalInfoSchema } = require('../validators/personal_info.validator');
const { successResponse, errorResponse } = require('../utils/response.util');

const router = express.Router();

router.use(authGuard);

router.get('/me', async (req, res, next) => {
  try {
    let user = await userRepository.findById(req.user.id);
    if (!user) {
      return errorResponse(res, 'User not found', 404);
    }

    // Auto-initialize nutrition target if not set yet
    if (!user.nutritionTarget || !user.nutritionTarget.calories) {
      const initialTarget = await nutritionTargetService.calculateAITarget(user);
      user = await userRepository.updateNutritionTarget(user._id, initialTarget);
    }

    return successResponse(
      res,
      {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
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

