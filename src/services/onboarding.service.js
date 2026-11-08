const userRepository = require('../repositories/user.repository');

class OnboardingService {
  async saveOnboarding(userId, onboardingData) {
    const isCompleted =
      onboardingData.onboardingCompleted !== undefined
        ? onboardingData.onboardingCompleted
        : true;

    const updatedUser = await userRepository.updateOnboarding(
      userId,
      onboardingData,
      isCompleted
    );

    if (!updatedUser) {
      const error = new Error('User not found');
      error.statusCode = 404;
      throw error;
    }

    return updatedUser;
  }

  async getOnboardingStatus(userId) {
    const user = await userRepository.findById(userId);
    if (!user) {
      const error = new Error('User not found');
      error.statusCode = 404;
      throw error;
    }

    return {
      onboardingCompleted: user.onboardingCompleted,
      onboarding: user.onboarding,
    };
  }
}

module.exports = new OnboardingService();

