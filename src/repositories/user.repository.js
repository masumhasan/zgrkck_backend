const { User } = require('../models/user.model');

class UserRepository {
  async findByEmail(email, includePassword = false) {
    const query = User.findOne({ email });
    if (includePassword) query.select('+password');
    return query.exec();
  }

  async findById(id) {
    return User.findById(id).lean().exec();
  }

  async create(userData) {
    const user = new User(userData);
    return user.save();
  }

  async updateNutritionTarget(userId, targetData) {
    const update = {
      $set: {
        'nutritionTarget.calories': targetData.calories,
        'nutritionTarget.protein': targetData.protein,
        'nutritionTarget.carbs': targetData.carbs,
        'nutritionTarget.fat': targetData.fat,
        'nutritionTarget.caloriesConsumed': targetData.caloriesConsumed,
        'nutritionTarget.proteinConsumed': targetData.proteinConsumed,
        'nutritionTarget.carbsConsumed': targetData.carbsConsumed,
        'nutritionTarget.fatConsumed': targetData.fatConsumed,
        'nutritionTarget.lastCalculatedAt': targetData.lastCalculatedAt || new Date(),
      },
    };
    return User.findByIdAndUpdate(userId, update, { returnDocument: 'after' })
      .lean()
      .exec();
  }

  async updatePassword(userId, hashedPassword) {
    return User.findByIdAndUpdate(userId, { password: hashedPassword }).exec();
  }

  async updatePersonalInfo(userId, personalInfoData) {
    const update = {
      $set: {
        'personalInfo.age': personalInfoData.age,
        'personalInfo.height': personalInfoData.height,
        'personalInfo.heightUnit': personalInfoData.heightUnit || 'cm',
        'personalInfo.weight': personalInfoData.weight,
        'personalInfo.weightUnit': personalInfoData.weightUnit || 'kg',
        'personalInfo.gender': personalInfoData.gender,
        personalInfoCompleted: true,
      },
    };
    return User.findByIdAndUpdate(userId, update, { returnDocument: 'after' })
      .lean()
      .exec();
  }

  async updateOnboarding(userId, onboardingData, isCompleted = false) {
    const update = {
      $set: {
        'onboarding.goal': onboardingData.goal,
        'onboarding.dietaryPreference': onboardingData.dietaryPreference,
        'onboarding.nutritionFocuses': onboardingData.nutritionFocuses,
        'onboarding.favouriteCuisines': onboardingData.favouriteCuisines,
        'onboarding.hasNoRestrictions': onboardingData.hasNoRestrictions,
        'onboarding.allergies': onboardingData.allergies,
        'onboarding.dietaryRestrictions': onboardingData.dietaryRestrictions,
        'onboarding.specificIngredients': onboardingData.specificIngredients,
        'onboarding.cookingTime': onboardingData.cookingTime,
        'onboarding.cookingSkill': onboardingData.cookingSkill,
        'onboarding.householdType': onboardingData.householdType,
        'onboarding.adultsCount': onboardingData.adultsCount,
        'onboarding.childrenCount': onboardingData.childrenCount,
        onboardingCompleted: isCompleted,
      },
    };
    return User.findByIdAndUpdate(userId, update, { returnDocument: 'after' })
      .lean()
      .exec();
  }
}

module.exports = new UserRepository();
