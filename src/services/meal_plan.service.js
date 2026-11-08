const https = require('https');
const { config } = require('../config/env');
const recipeService = require('./recipe.service');
const userRepository = require('../repositories/user.repository');
const { MealPlan } = require('../models/plan.model');

class MealPlanService {
  async getCurrentPlan(userId) {
    const today = new Date().toISOString().split('T')[0];
    // Find active plan where endDate >= today
    const plan = await MealPlan.findOne({
      userId,
      endDate: { $gte: today },
    })
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    return plan;
  }

  async generateAndSavePlan(userId, options = {}) {
    const user = await userRepository.findById(userId);
    if (!user) {
      const err = new Error('User not found');
      err.statusCode = 404;
      throw err;
    }

    const onboarding = user.onboarding || {};
    const personalInfo = user.personalInfo || {};
    const nutritionTarget = user.nutritionTarget || {};

    // Get candidate recipes safe for user
    const safeCandidates = await recipeService.getSafeCandidateRecipes(onboarding, 60);
    if (!safeCandidates || safeCandidates.length === 0) {
      throw new Error('No recipes matched your dietary preferences and restrictions.');
    }

    // Generate 7-day schedule starting today
    const startDate = new Date();
    const days = [];
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    // Separate candidates by meal types for breakfast, lunch, and dinner
    const breakfasts = safeCandidates.filter((r) =>
      r.meta?.mealTypes?.includes('breakfast') || r.meta?.mealTypes?.includes('snack')
    );
    const lunches = safeCandidates.filter((r) =>
      r.meta?.mealTypes?.includes('lunch') || r.meta?.mealTypes?.includes('dinner')
    );
    const dinners = safeCandidates.filter((r) =>
      r.meta?.mealTypes?.includes('dinner') || r.meta?.mealTypes?.includes('lunch')
    );

    const bPool = breakfasts.length > 0 ? breakfasts : safeCandidates;
    const lPool = lunches.length > 0 ? lunches : safeCandidates;
    const dPool = dinners.length > 0 ? dinners : safeCandidates;

    for (let i = 0; i < 7; i++) {
      const currDate = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
      const dateStr = currDate.toISOString().split('T')[0];
      const dayNum = currDate.getDate();
      const dayName = dayNames[currDate.getDay()];
      const dayLabel = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : '3 meals planned';

      const bRecipe = bPool[i % bPool.length];
      const lRecipe = lPool[(i + 1) % lPool.length];
      const dRecipe = dPool[(i + 2) % dPool.length];

      const bKcal = Math.round((nutritionTarget.calories || 1900) * 0.25);
      const lKcal = Math.round((nutritionTarget.calories || 1900) * 0.38);
      const dKcal = Math.round((nutritionTarget.calories || 1900) * 0.37);

      const bProt = Math.round((nutritionTarget.protein || 130) * 0.25);
      const lProt = Math.round((nutritionTarget.protein || 130) * 0.40);
      const dProt = Math.round((nutritionTarget.protein || 130) * 0.35);

      const meals = [
        {
          mealType: 'BREAKFAST',
          time: '8:30 AM',
          recipeId: bRecipe._id,
          name: bRecipe.title,
          description: bRecipe.summary || `Nutritious breakfast prepared in ${bRecipe.timing?.totalMinutes || 20} mins.`,
          kcal: bKcal,
          proteinG: bProt,
          carbsG: Math.round(bKcal * 0.5 / 4),
          fatG: Math.round(bKcal * 0.25 / 9),
          servings: bRecipe.yield?.servings || 1,
          imageUrl: bRecipe.media?.imageUrl || '',
          cookTimeMinutes: bRecipe.timing?.totalMinutes || 20,
        },
        {
          mealType: 'LUNCH',
          time: '12:30 PM',
          recipeId: lRecipe._id,
          name: lRecipe.title,
          description: lRecipe.summary || `Energizing lunch crafted for ${onboarding.goal || 'healthy nutrition'}.`,
          kcal: lKcal,
          proteinG: lProt,
          carbsG: Math.round(lKcal * 0.45 / 4),
          fatG: Math.round(lKcal * 0.28 / 9),
          servings: lRecipe.yield?.servings || 2,
          imageUrl: lRecipe.media?.imageUrl || '',
          cookTimeMinutes: lRecipe.timing?.totalMinutes || 30,
        },
        {
          mealType: 'DINNER',
          time: '7:30 PM',
          recipeId: dRecipe._id,
          name: dRecipe.title,
          description: dRecipe.summary || `Wholesome dinner with balanced macros.`,
          kcal: dKcal,
          proteinG: dProt,
          carbsG: Math.round(dKcal * 0.4 / 4),
          fatG: Math.round(dKcal * 0.3 / 9),
          servings: dRecipe.yield?.servings || 2,
          imageUrl: dRecipe.media?.imageUrl || '',
          cookTimeMinutes: dRecipe.timing?.totalMinutes || 40,
        },
      ];

      days.push({
        date: dateStr,
        dayNumber: dayNum,
        dayName,
        dayLabel,
        meals,
      });
    }

    const endDate = days[6].date;
    const goalText = onboarding.goal ? `On track for ${onboarding.goal}` : 'On track for Weight Maintenance';

    const newPlan = await MealPlan.create({
      userId,
      startDate: days[0].date,
      endDate,
      days,
      overview: {
        avgKcalPerDay: nutritionTarget.calories || 1850,
        avgProteinPerDay: nutritionTarget.protein || 126,
        goalFitText: goalText,
      },
    });

    return newPlan.toObject();
  }
}

module.exports = new MealPlanService();
