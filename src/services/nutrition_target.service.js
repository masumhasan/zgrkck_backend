const userRepository = require('../repositories/user.repository');
const safetyEscalation = require('./safety_escalation.service');

// Daily calorie floor by sex (client safety rule). Never go below it.
const CALORIE_FLOOR = { female: 1200, male: 1500, other: 1350 };
const CALORIE_CEILING = 3800;

// Nutrition targets are decided by code only (AI-layer contract: the AI never sets targets).
class NutritionTargetService {
  calculateTarget(user) {
    const pInfo = user.personalInfo || {};
    const onboarding = user.onboarding || {};
    const goal = (onboarding.goal || '').toLowerCase();
    const focuses = (onboarding.nutritionFocuses || []).map((f) => f.toLowerCase());
    const gender = (pInfo.gender || '').toLowerCase();
    const sex = gender.includes('female') ? 'female' : gender === 'male' ? 'male' : 'other';

    let weightKg = pInfo.weight || 70;
    if (pInfo.weightUnit === 'lbs') weightKg = weightKg * 0.453592;

    let heightCm = pInfo.height || 175;
    if (pInfo.heightUnit === 'ft') heightCm = heightCm * 30.48;

    const age = pInfo.age || 28;

    // Basal Metabolic Rate - Mifflin-St Jeor; unspecified sex uses the midpoint of both constants
    const sexConstant = { female: -161, male: 5, other: -78 }[sex];
    const bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + sexConstant;

    // Activity multiplier estimate (moderately active standard: ~1.4)
    let tdee = Math.round(bmr * 1.4);

    // Goal adjustments. No weight-loss deficit under 18.
    if (age >= 18 && (goal.includes('lose weight') || goal.includes('reduce'))) {
      tdee -= 400;
    } else if (goal.includes('build muscle') || goal.includes('gain')) {
      tdee += 300;
    }

    const floorApplied = tdee < CALORIE_FLOOR[sex];
    tdee = Math.max(CALORIE_FLOOR[sex], Math.min(CALORIE_CEILING, Math.round(tdee / 50) * 50));

    // Protein calculation based on goal and focuses
    let proteinGramsPerKg = 1.6;
    if (goal.includes('build muscle') || focuses.some((f) => f.includes('protein'))) {
      proteinGramsPerKg = 2.0;
    } else if (goal.includes('lose weight')) {
      proteinGramsPerKg = 1.8;
    }
    const protein = Math.max(70, Math.min(240, Math.round(weightKg * proteinGramsPerKg)));

    // Fat calculation (approx 25-30% of total calories)
    const fatRatio = focuses.some((f) => f.includes('low carb') || f.includes('keto')) ? 0.38 : 0.28;
    const fat = Math.round((tdee * fatRatio) / 9);

    // Carbs from remaining calories (4 kcal per g carb & protein, 9 per g fat)
    const carbs = Math.max(50, Math.round((tdee - (protein * 4 + fat * 9)) / 4));

    // Nothing is eaten/logged yet, so consumed starts at zero (no invented intake).
    return {
      calories: tdee,
      protein,
      carbs,
      fat,
      caloriesConsumed: 0,
      proteinConsumed: 0,
      carbsConsumed: 0,
      fatConsumed: 0,
      lastCalculatedAt: new Date(),
      floorApplied, // not stored: updateNutritionTarget copies named fields only
    };
  }

  async regenerateUserTarget(userId) {
    const user = await userRepository.findById(userId);
    if (!user) {
      const err = new Error('User not found');
      err.statusCode = 404;
      throw err;
    }

    const target = this.calculateTarget(user);
    if (target.floorApplied) await safetyEscalation.record(userId, 'floor_trigger');
    const updatedUser = await userRepository.updateNutritionTarget(userId, target);
    return updatedUser.nutritionTarget;
  }
}

module.exports = new NutritionTargetService();
