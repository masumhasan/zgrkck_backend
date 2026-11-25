const recipeService = require('./recipe.service');
const userRepository = require('../repositories/user.repository');
const { MealPlan } = require('../models/plan.model');
const { Recipe } = require('../models/recipe.model');
const { filterSafe } = require('./safety_filter.service');
const { planProfile } = require('./household.service');
const { composePlan, slotKey } = require('./plan_compose.service');
const { score, getWeights } = require('./ranking.service');
const { publicNutrition } = require('../utils/nutrition_public.util');

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

// Totals the app shows (ring, day card): counts Complete and Estimated recipes and custom entries,
// leaves out 'none' ones and lists them so the app can say they are not counted.
function dayNutrition(meals = []) {
  const zero = () => ({ kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 });
  const planned = zero();
  const cooked = zero();
  const excluded = [];
  let estimated = false;
  for (const m of meals) {
    if (m.nutritionStatus === 'none') {
      excluded.push({ mealType: m.mealType, name: m.name });
      continue;
    }
    if (m.nutritionStatus === 'estimated') estimated = true;
    for (const [k, v] of [['kcal', m.kcal], ['proteinG', m.proteinG], ['carbsG', m.carbsG], ['fatG', m.fatG]]) {
      planned[k] += v || 0;
      if (m.status === 'cooked') cooked[k] += v || 0;
    }
  }
  return { planned, cooked, estimated, excluded };
}

const MEAL_ORDER = {
  BREAKFAST: 1,
  LUNCH: 2,
  SNACK: 3,
  DINNER: 4,
};

class MealPlanService {
  async getCurrentPlan(userId) {
    const today = new Date();
    const todayStr = toDateString(today);

    const plan = await MealPlan.findOne({
      userId,
      endDate: { $gte: todayStr },
    })
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    if (!plan) return null;

    const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    const tomorrowStr = toDateString(tomorrow);
    let activeDayIndex = 0;
    let foundToday = false;

    plan.days = (plan.days || []).map((day, idx) => {
      let label = `${day.meals?.length || 0} meals planned`;
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
        nutrition: dayNutrition(day.meals),
      };
    });

    if (!foundToday && plan.days.length > 0) activeDayIndex = 0;
    plan.activeDayIndex = activeDayIndex;
    plan.todayDate = todayStr;
    return plan;
  }

  // the slot's share of the day's target (deterministic arithmetic, never the model's)
  slotBudget(type, nutritionTarget = {}) {
    const SLOTS = {
      BREAKFAST: { time: '8:30 AM', kcalPct: 0.25, protPct: 0.25 },
      LUNCH: { time: '12:30 PM', kcalPct: 0.35, protPct: 0.38 },
      SNACK: { time: '3:30 PM', kcalPct: 0.15, protPct: 0.12 },
      DINNER: { time: '7:30 PM', kcalPct: 0.35, protPct: 0.35 },
    };
    const { time, kcalPct, protPct } = SLOTS[type] || SLOTS.LUNCH;
    return {
      time,
      kcal: Math.round((nutritionTarget.calories || 1900) * kcalPct),
      proteinG: Math.round((nutritionTarget.protein || 130) * protPct),
    };
  }

  _createMeal(type, recipe, nutritionTarget, onboarding, weights = {}) {
    const { time } = this.slotBudget(type, nutritionTarget);
    const n = publicNutrition(recipe.nutrition);
    const per = n.perServing || {};

    return {
      mealType: type,
      time,
      recipeId: recipe._id,
      name: recipe.title,
      description: recipe.summary || `${type.charAt(0) + type.slice(1).toLowerCase()} prepared in ${recipe.timing?.totalMinutes || 25} mins.`,
      // snapshot at the moment it enters the plan; later recalculations never change it. 0 + 'none' = not counted.
      kcal: Math.round(per.kcal || 0),
      proteinG: Math.round(per.protein || 0),
      carbsG: Math.round(per.carbs || 0),
      fatG: Math.round(per.fat || 0),
      nutritionStatus: n.status,
      servings: recipe.yield?.servings || 2,
      imageUrl: recipe.media?.imageUrl || '',
      cookTimeMinutes: recipe.timing?.totalMinutes || 25,
      isFavorite: false,
      reason: score(recipe, onboarding, weights).reason,
      status: 'planned',
    };
  }

  async _unsafeRecipeIds(plan, onboarding) {
    const ids = [...new Set(plan.days.flatMap((d) => (d.meals || []).map((m) => m.recipeId && String(m.recipeId)).filter(Boolean)))];
    if (!ids.length) return new Set();
    const docs = await Recipe.find({ _id: { $in: ids } }).select('allergens meta.dietaryFlags status createdBy').lean().exec();
    const safe = new Set(
      filterSafe(docs.filter((r) => !['Draft', 'Needs Review'].includes(r.status)), onboarding).map((r) => String(r._id))
    );
    return new Set(ids.filter((id) => !safe.has(id)));
  }

  async generateAndSavePlan(userId, options = {}) {
    const user = await userRepository.findById(userId);
    if (!user) {
      const err = new Error('User not found');
      err.statusCode = 404;
      throw err;
    }

    const onboarding = await planProfile(userId, user.onboarding || {});
    const nutritionTarget = user.nutritionTarget || {};

    // retrieve with the safety filter, validate in code, then rank by fit (best 30 feed the rotation)
    const weights = await getWeights(userId);
    const safeCandidates = filterSafe(await recipeService.getSafeCandidateRecipes(onboarding, 60), onboarding)
      .map((r) => ({ r, m: score(r, onboarding, weights).match }))
      .sort((a, b) => b.m - a.m)
      .slice(0, 30)
      .map((x) => x.r);
    if (!safeCandidates || safeCandidates.length === 0) {
      const err = new Error('No recipes matched your dietary preferences and restrictions.');
      err.statusCode = 422;
      throw err;
    }

    const bPool = safeCandidates.filter((r) => r.meta?.mealTypes?.includes('breakfast') || r.meta?.tags?.includes('breakfast'));
    const lPool = safeCandidates.filter((r) => r.meta?.mealTypes?.includes('lunch') || r.meta?.mealTypes?.includes('dinner'));
    const dPool = safeCandidates.filter((r) => r.meta?.mealTypes?.includes('dinner') || r.meta?.mealTypes?.includes('lunch'));
    const sPool = safeCandidates.filter((r) => r.meta?.mealTypes?.includes('snack') || r.meta?.tags?.includes('snack') || r.meta?.courses?.includes('side') || r.meta?.courses?.includes('dessert'));

    const pools = {
      BREAKFAST: bPool.length > 0 ? bPool : safeCandidates,
      LUNCH: lPool.length > 0 ? lPool : safeCandidates,
      SNACK: sPool.length > 0 ? sPool : safeCandidates,
      DINNER: dPool.length > 0 ? dPool : safeCandidates,
    };

    const range = options.range || 'Next 3 days';
    const rawTypes = Array.isArray(options.mealTypes) && options.mealTypes.length > 0
      ? options.mealTypes.map((m) => String(m).toUpperCase())
      : ['BREAKFAST', 'LUNCH', 'DINNER'];
    const selectedTypes = rawTypes.map((m) => (m === 'SNACKS' ? 'SNACK' : m)).filter((m) => MEAL_ORDER[m] !== undefined);
    if (selectedTypes.length === 0) {
      const err = new Error('Choose at least one valid meal type.');
      err.statusCode = 400;
      throw err;
    }
    const keepPlanned = options.keepPlanned !== undefined ? Boolean(options.keepPlanned) : true;
    const keepFavourites = options.keepFavourites !== undefined ? Boolean(options.keepFavourites) : false;

    const today = new Date();
    const todayStr = toDateString(today);

    // Determine target dates
    const targetDates = [];
    if (range === 'Rest of today') {
      targetDates.push(todayStr);
    } else if (range === 'Tomorrow') {
      targetDates.push(toDateString(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)));
    } else if (range === 'Next 3 days') {
      for (let i = 0; i < 3; i++) {
        targetDates.push(toDateString(new Date(today.getFullYear(), today.getMonth(), today.getDate() + i)));
      }
    } else {
      for (let i = 0; i < 7; i++) {
        targetDates.push(toDateString(new Date(today.getFullYear(), today.getMonth(), today.getDate() + i)));
      }
    }

    // optional LLM arrangement of the safe candidates; validated in code, falls back slot by slot (plan_compose.service)
    const composed = await composePlan({
      slots: targetDates.flatMap((date) => selectedTypes.map((type) => ({ date, type }))),
      candidates: safeCandidates,
      pools,
    });
    const rotate = (type, i) => {
      const pool = pools[type] || safeCandidates;
      return pool[(i + (MEAL_ORDER[type] || 0)) % pool.length];
    };
    const pick = (type, date, i) => composed.get(slotKey(date, type)) || rotate(type, i);

    const existingPlan = await MealPlan.findOne({
      userId,
      endDate: { $gte: todayStr },
    }).sort({ createdAt: -1 });

    if (existingPlan && existingPlan.days && existingPlan.days.length > 0) {
      // re-validate meals already in the plan (allergies may have changed, recipes may be unpublished)
      const unsafeIds = await this._unsafeRecipeIds(existingPlan, onboarding);
      existingPlan.days = existingPlan.days.map((day, dIdx) => {
        const kept = (day.meals || []).filter((m) => !m.recipeId || !unsafeIds.has(String(m.recipeId)));
        if (!targetDates.includes(day.date)) {
          return kept.length === (day.meals || []).length ? day : { ...(day.toObject?.() || day), meals: kept };
        }

        let meals = [...kept];
        if (keepPlanned) {
          // Keep planned, only fill empty slots of selected types
          for (const type of selectedTypes) {
            const hasType = meals.some((m) => m.mealType === type);
            if (!hasType) {
              const recipe = pick(type, day.date, dIdx);
              meals.push(this._createMeal(type, recipe, nutritionTarget, onboarding, weights));
            }
          }
        } else {
          // Replace, preserving favourites if enabled
          const keptMeals = keepFavourites ? meals.filter((m) => m.isFavorite) : [];
          const newMeals = [];
          for (const type of selectedTypes) {
            const existingFav = keptMeals.find((m) => m.mealType === type);
            if (existingFav) {
              newMeals.push(existingFav);
            } else {
              const recipe = pick(type, day.date, dIdx);
              newMeals.push(this._createMeal(type, recipe, nutritionTarget, onboarding, weights));
            }
          }
          meals = newMeals;
        }

        meals.sort((a, b) => (MEAL_ORDER[a.mealType] || 99) - (MEAL_ORDER[b.mealType] || 99));
        return {
          ...day.toObject?.() || day,
          meals,
          dayLabel: day.date === todayStr ? 'Today' : `${meals.length} meals planned`,
        };
      });

      existingPlan.generationDate = todayStr;
      existingPlan.markModified('days');
      await existingPlan.save();

      const planObj = existingPlan.toObject();
      planObj.activeDayIndex = Math.max(0, planObj.days.findIndex((d) => d.date === todayStr));
      planObj.todayDate = todayStr;
      return planObj;
    }

    // Otherwise create full 7-day week plan
    const days = [];
    for (let i = 0; i < 7; i++) {
      const currDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
      const dateStr = toDateString(currDate);
      const isTargeted = targetDates.includes(dateStr);
      const activeTypes = isTargeted ? selectedTypes : ['BREAKFAST', 'LUNCH', 'DINNER'];

      const meals = activeTypes.map((type) => {
        const recipe = pick(type, dateStr, i);
        return this._createMeal(type, recipe, nutritionTarget, onboarding, weights);
      });

      meals.sort((a, b) => (MEAL_ORDER[a.mealType] || 99) - (MEAL_ORDER[b.mealType] || 99));
      days.push({
        date: dateStr,
        dayNumber: currDate.getDate(),
        month: currDate.getMonth() + 1,
        monthName: MONTH_NAMES[currDate.getMonth()],
        year: currDate.getFullYear(),
        dayName: DAY_NAMES[currDate.getDay()],
        dayLabel: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : `${meals.length} meals planned`,
        meals,
      });
    }

    // a plan is a plan, not a result: don't claim the user is 'on track' before anything is cooked
    const goalText = onboarding.goal ? `Planned around: ${onboarding.goal}` : 'Planned around a balanced week';
    const newPlan = await MealPlan.create({
      userId,
      generationDate: todayStr,
      startDate: days[0].date,
      endDate: days[days.length - 1].date,
      days,
      overview: {
        avgKcalPerDay: nutritionTarget.calories || 1850,
        avgProteinPerDay: nutritionTarget.protein || 126,
        goalFitText: goalText,
      },
    });

    const planObj = newPlan.toObject();
    planObj.activeDayIndex = 0;
    planObj.todayDate = todayStr;
    return planObj;
  }
}

module.exports = new MealPlanService();
module.exports.dayNutrition = dayNutrition;
