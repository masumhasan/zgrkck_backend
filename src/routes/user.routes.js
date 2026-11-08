const express = require('express');
const userRepository = require('../repositories/user.repository');
const { authGuard } = require('../middleware/auth.middleware');
const { validate } = require('../middleware/validation.middleware');
const { personalInfoSchema } = require('../validators/personal_info.validator');
const { successResponse, errorResponse } = require('../utils/response.util');

const router = express.Router();

router.use(authGuard);

router.get('/me', async (req, res, next) => {
  try {
    const user = await userRepository.findById(req.user.id);
    if (!user) {
      return errorResponse(res, 'User not found', 404);
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
      },
      'User profile fetched successfully'
    );
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

