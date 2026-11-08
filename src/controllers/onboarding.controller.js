const onboardingService = require('../services/onboarding.service');
const { successResponse } = require('../utils/response.util');

class OnboardingController {
  async saveOnboarding(req, res, next) {
    try {
      const userId = req.user.id;
      const updatedUser = await onboardingService.saveOnboarding(
        userId,
        req.body
      );
      return successResponse(
        res,
        updatedUser,
        'Onboarding preferences saved successfully'
      );
    } catch (err) {
      next(err);
    }
  }

  async getOnboardingStatus(req, res, next) {
    try {
      const userId = req.user.id;
      const status = await onboardingService.getOnboardingStatus(userId);
      return successResponse(res, status, 'Onboarding status fetched');
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new OnboardingController();

