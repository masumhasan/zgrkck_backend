const { MealPlan } = require('../models/plan.model');
const { Recipe, PUBLISHED_FILTER } = require('../models/recipe.model');
const { CookLog } = require('../models/cook_log.model');
const { User } = require('../models/user.model');
const recipeService = require('./recipe.service');
const mealPlanService = require('./meal_plan.service');
const pantryService = require('./pantry.service');
const { filterSafe } = require('./safety_filter.service');
const { planProfile } = require('./household.service');
const safetyEscalation = require('./safety_escalation.service');
const { score, getWeights, applyTaste, cuisineOf } = require('./ranking.service');

const ORDER = { BREAKFAST: 1, LUNCH: 2, SNACK: 3, DINNER: 4 };
const httpError = (message, statusCode) => Object.assign(new Error(message), { statusCode });
const sortMeals = (meals) => meals.sort((a, b) => (ORDER[a.mealType] || 99) - (ORDER[b.mealType] || 99));
const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Actions on single plan slots. Every recipe that enters the plan is re-checked for safety in code.
class PlanSlotService {
  async _load(userId) {
    const plan = await MealPlan.findOne({ userId, endDate: { $gte: localToday() } }).sort({ createdAt: -1 });
    if (!plan) throw httpError('You have no active plan yet', 404);
    const user = await User.findById(userId).select('onboarding nutritionTarget').lean().exec();
    return { plan, onboarding: await planProfile(userId, user?.onboarding || {}), target: user?.nutritionTarget || {}, weights: await getWeights(userId) };
  }

  _day(plan, date) {
    const day = plan.days.find((d) => d.date === date);
    if (!day) throw httpError('That day is not in your plan', 404);
    return day;
  }

  _slot(plan, date, mealType) {
    const day = this._day(plan, date);
    const meal = day.meals.find((m) => m.mealType === mealType);
    if (!meal) throw httpError('That meal is not in your plan', 404);
    return { day, meal };
  }

  async _save(plan, userId) {
    plan.markModified('days');
    await plan.save();
    return mealPlanService.getCurrentPlan(userId);
  }

  async _safeRecipe(userId, recipeId, onboarding) {
    const recipe = await Recipe.findOne({ _id: recipeId, $or: [{ ...PUBLISHED_FILTER }, { createdBy: userId }] }).lean().exec();
    if (!recipe) throw httpError('Recipe not found', 404);
    if (!filterSafe([recipe], onboarding).length) {
      await safetyEscalation.record(userId, 'allergen_block');
      throw httpError('This recipe is not safe for your profile', 422);
    }
    return recipe;
  }

  // ranked, safe recipes not already in the plan
  async _candidates(plan, onboarding, weights, mealType) {
    const inPlan = new Set(plan.days.flatMap((d) => d.meals.map((m) => String(m.recipeId))));
    const safe = filterSafe(await recipeService.getSafeCandidateRecipes(onboarding, 60), onboarding).filter((r) => !inPlan.has(String(r._id)));
    const fits = safe.filter((r) => r.meta?.mealTypes?.includes(mealType.toLowerCase()));
    return (fits.length >= 3 ? fits : safe)
      .map((r) => ({ r, ...score(r, onboarding, weights) }))
      .sort((a, b) => b.match - a.match);
  }

  async alternatives(userId, { date, mealType }) {
    const { plan, onboarding, weights } = await this._load(userId);
    this._slot(plan, date, mealType);
    const ranked = (await this._candidates(plan, onboarding, weights, mealType)).slice(0, 8);
    return ranked.map(({ r, match, reason }) => ({
      id: String(r._id),
      title: r.title,
      time: r.timing?.totalMinutes ? `${r.timing.totalMinutes} min` : '',
      image: r.media?.imageUrl || '',
      match,
      reason,
    }));
  }

  // cooked: logs it, uses pantry items, teaches the ranking, marks the plan slot if there is one
  // a custom entry (no recipe) eaten: just marks the slot, so its calories count towards the day
  async _cookedCustom(userId, { date, mealType, rating }) {
    const { plan } = await this._load(userId);
    const { meal } = this._slot(plan, date, mealType);
    if (meal.recipeId) return this.cooked(userId, { recipeId: String(meal.recipeId), date, mealType, rating });
    const alreadyCooked = meal.status === 'cooked';
    if (!alreadyCooked) {
      meal.status = 'cooked';
      meal.cookedAt = new Date();
    }
    return { plan: await this._save(plan, userId), pantryUsed: [], alreadyCooked };
  }

  // "I ate this" from a recipe page. If the slot already holds this recipe it is marked cooked; otherwise the recipe
  // takes the slot (replacing a meal that was only planned there) and is marked cooked. Logged meals are never replaced.
  async eaten(userId, { recipeId, date, mealType }) {
    const { plan } = await this._load(userId);
    const { meals } = this._day(plan, date);
    const existing = meals.find((m) => m.mealType === mealType);
    if (existing?.status === 'cooked') throw httpError('You already logged this meal.', 409);
    if (!existing || String(existing.recipeId) !== String(recipeId)) {
      await this.addMeal(userId, { date, mealType, recipeId, servings: 1, replace: Boolean(existing) });
    }
    return this.cooked(userId, { recipeId, date, mealType });
  }

  async cooked(userId, { recipeId, date, mealType, rating }) {
    if (!recipeId) return this._cookedCustom(userId, { date, mealType, rating });
    const recipe = await Recipe.findById(recipeId).lean().exec();
    if (!recipe) throw httpError('Recipe not found', 404);

    let loaded = null;
    try {
      loaded = await this._load(userId);
    } catch (e) {
      if (e.statusCode !== 404) throw e;
    }

    let meal = null;
    if (loaded) {
      const { plan } = loaded;
      if (date && mealType) meal = this._slot(plan, date, mealType).meal;
      else {
        const today = localToday();
        const order = [...plan.days].sort((a, b) => (a.date === today ? -1 : b.date === today ? 1 : 0));
        for (const d of order) {
          meal = d.meals.find((m) => String(m.recipeId) === String(recipeId) && m.status !== 'cooked');
          if (meal) break;
        }
      }
    }

    const alreadyCooked = meal?.status === 'cooked';
    let pantryUsed = [];
    if (!alreadyCooked) {
      const pantry = await pantryService.consumeForRecipe(userId, recipe);
      pantryUsed = pantry.used;
      await CookLog.create({ userId, recipeId, rating: rating || null, planDate: date || null, mealType: mealType || null, cuisine: cuisineOf(recipe), usedSoon: pantry.soon });
      await applyTaste(userId, recipe, 1 + (rating ? (rating - 3) * 0.5 : 0));
    }
    if (!meal) return { plan: loaded ? await mealPlanService.getCurrentPlan(userId) : null, pantryUsed };

    if (!alreadyCooked) {
      meal.status = 'cooked';
      meal.cookedAt = new Date();
    }
    if (rating) meal.rating = rating;
    return { plan: await this._save(loaded.plan, userId), pantryUsed, alreadyCooked };
  }

  async skip(userId, { date, mealType }) {
    const { plan } = await this._load(userId);
    const { meal } = this._slot(plan, date, mealType);
    if (meal.status === 'skipped') return this._save(plan, userId);
    if (meal.status === 'cooked') throw httpError('You already cooked this meal', 409);
    meal.status = 'skipped';
    const recipe = meal.recipeId && (await Recipe.findById(meal.recipeId).select('meta').lean().exec());
    if (recipe) await applyTaste(userId, recipe, -1);
    return this._save(plan, userId);
  }

  // recipeId given = user's choice; otherwise regenerate just this slot with the best-ranked safe recipe
  async replace(userId, { date, mealType, recipeId }) {
    const { plan, onboarding, target, weights } = await this._load(userId);
    const { day, meal } = this._slot(plan, date, mealType);
    if (meal.status === 'cooked') throw httpError('You already cooked this meal', 409);

    let recipe;
    if (recipeId) recipe = await this._safeRecipe(userId, recipeId, onboarding);
    else {
      const best = (await this._candidates(plan, onboarding, weights, mealType))[0];
      if (!best) throw httpError('No other safe recipe found for this slot', 422);
      recipe = best.r;
    }

    const old = meal.recipeId && (await Recipe.findById(meal.recipeId).select('meta').lean().exec());
    if (old) await applyTaste(userId, old, -0.5);

    const fresh = mealPlanService._createMeal(mealType, recipe, target, onboarding, weights);
    fresh.time = meal.time;
    day.meals = sortMeals(day.meals.map((m) => (m === meal ? fresh : m)));
    return this._save(plan, userId);
  }

  async remove(userId, { date, mealType }) {
    const { plan } = await this._load(userId);
    const { day, meal } = this._slot(plan, date, mealType);
    day.meals = day.meals.filter((m) => m !== meal);
    return this._save(plan, userId);
  }

  // S28 slot target: "about 600 kcal · 45g protein to hit today's goal"
  async slotTarget(userId, { mealType }) {
    const user = await User.findById(userId).select('nutritionTarget').lean().exec();
    const { kcal, proteinG } = mealPlanService.slotBudget(mealType, user?.nutritionTarget || {});
    return { kcal, proteinG };
  }

  // S28 / S31: a recipe, a custom entry, or (neither) the best safe recipe for this slot
  async addMeal(userId, { date, mealType, recipeId, customName, kcal, servings, replace }) {
    const { plan, onboarding, target, weights } = await this._load(userId);
    const day = this._day(plan, date);
    const existing = day.meals.find((m) => m.mealType === mealType);
    if (existing && !replace) throw httpError('That slot already has a meal', 409);
    if (existing?.status === 'cooked') throw httpError('You already logged this meal.', 409); // never lose logged consumption

    let meal;
    if (customName) {
      meal = {
        mealType,
        time: mealPlanService.slotBudget(mealType, target).time,
        recipeId: null,
        name: customName,
        kcal: kcal ?? 0,
        proteinG: 0,
        carbsG: 0,
        fatG: 0,
        servings: 1,
        cookTimeMinutes: 0,
        isCustom: true,
        reason: 'Added by you',
        status: 'planned',
      };
    } else {
      const recipe = recipeId
        ? await this._safeRecipe(userId, recipeId, onboarding)
        : (await this._candidates(plan, onboarding, weights, mealType))[0]?.r;
      if (!recipe) throw httpError('No safe recipe fits this slot right now', 404);
      meal = mealPlanService._createMeal(mealType, recipe, target, onboarding, weights);
    }
    if (servings) meal.servings = servings;
    day.meals = sortMeals([...day.meals.filter((m) => m !== existing), meal]);
    return this._save(plan, userId);
  }

  async _relocate(userId, { date, mealType, toDate, toMealType }, keepSource) {
    const { plan } = await this._load(userId);
    const { day, meal } = this._slot(plan, date, mealType);
    const target = this._day(plan, toDate);
    const type = toMealType || mealType;
    if (target.meals.some((m) => m.mealType === type)) throw httpError('The target slot already has a meal', 409);
    const copy = { ...meal.toObject(), mealType: type };
    if (keepSource) Object.assign(copy, { status: 'planned', rating: null, cookedAt: null, isFavorite: false });
    else day.meals = day.meals.filter((m) => m !== meal);
    target.meals = sortMeals([...target.meals, copy]);
    return this._save(plan, userId);
  }

  move(userId, body) {
    return this._relocate(userId, body, false);
  }

  copy(userId, body) {
    return this._relocate(userId, body, true);
  }

  async setServings(userId, { date, mealType, servings }) {
    const { plan } = await this._load(userId);
    this._slot(plan, date, mealType).meal.servings = servings;
    return this._save(plan, userId);
  }
}

module.exports = new PlanSlotService();
