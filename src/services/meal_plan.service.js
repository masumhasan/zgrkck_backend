const recipeService = require('./recipe.service');
const userRepository = require('../repositories/user.repository');
const { MealPlan } = require('../models/plan.model');

function toDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const DAY_NAMES = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday',
  'Thursday', 'Friday', 'Saturday',
];

class MealPlanService {
  async getCurrentPlan(userId) {
    const today = new Date();
    const todayStr = toDateString(today);

    // Active plan must not have ended before today
    const plan = await MealPlan.findOne({
      userId,
      endDate: { $gte: todayStr },
    })
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    if (!plan) {
      return null;
    }

    const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    const tomorrowStr = toDateString(tomorrow);

    let activeDayIndex = 0;
    let foundToday = false;

    plan.days = (plan.days || []).map((day, idx) => {
      let label = '3 meals planned';
      if (day.date === todayStr) {
        label = 'Today';
        activeDayIndex = idx;
        foundToday = true;
      } else if (day.date === tomorrowStr) {
        label = 'Tomorrow';
      } else if (day.date < todayStr) {
        label = 'Completed';
      }

      return {
        ...day,
        dayLabel: label,
      };
    });

    if (!foundToday && plan.days.length > 0) {
      // If plan starts in the future, first day is active
      activeDayIndex = 0;
    }

    plan.activeDayIndex = activeDayIndex;
    plan.todayDate = todayStr;

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
    const nutritionTarget = user.nutritionTarget || {};

    const safeCandidates = await recipeService.getSafeCandidateRecipes(onboarding, 60);
    if (!safeCandidates || safeCandidates.length === 0) {
      throw new Error('No recipes matched your dietary preferences and restrictions.');
    }

    const now = new Date();
    const generationDate = toDateString(now);
    const startDateStr = generationDate;

    const breakfasts = safeCandidates.filter(
      (r) => r.meta?.mealTypes?.includes('breakfast') || r.meta?.mealTypes?.includes('snack')
    );
    const lunches = safeCandidates.filter(
      (r) => r.meta?.mealTypes?.includes('lunch') || r.meta?.mealTypes?.includes('dinner')
    );
    const dinners = safeCandidates.filter(
      (r) => r.meta?.mealTypes?.includes('dinner') || r.meta?.mealTypes?.includes('lunch')
    );

    const bPool = breakfasts.length > 0 ? breakfasts : safeCandidates;
    const lPool = lunches.length > 0 ? lunches : safeCandidates;
    const dPool = dinners.length > 0 ? dinners : safeCandidates;

    const days = [];

    for (let i = 0; i < 7; i++) {
      const currDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
      const dateStr = toDateString(currDate);
      const dayNum = currDate.getDate();
      const monthNum = currDate.getMonth() + 1;
      const monthName = MONTH_NAMES[currDate.getMonth()];
      const dayName = DAY_NAMES[currDate.getDay()];
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
        month: monthNum,
        monthName,
        year: currDate.getFullYear(),
        dayName,
        dayLabel,
        meals,
      });
    }

    const endDateStr = days[days.length - 1].date;
    const goalText = onboarding.goal ? `On track for ${onboarding.goal}` : 'On track for Weight Maintenance';

    const newPlan = await MealPlan.create({
      userId,
      generationDate,
      startDate: startDateStr,
      endDate: endDateStr,
      days,
      overview: {
        avgKcalPerDay: nutritionTarget.calories || 1850,
        avgProteinPerDay: nutritionTarget.protein || 126,
        goalFitText: goalText,
      },
    });

    const planObj = newPlan.toObject();
    planObj.activeDayIndex = 0;
    planObj.todayDate = generationDate;
    return planObj;
  }
}

module.exports = new MealPlanService();
