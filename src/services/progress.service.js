const { MealPlan } = require('../models/plan.model');
const { CookLog } = require('../models/cook_log.model');
const { Recipe } = require('../models/recipe.model');
const userRepository = require('../repositories/user.repository');
const { dayNutrition } = require('./meal_plan.service');

const VEG_RE = /\b(spinach|broccoli|carrot|tomato|onion|pepper|zucchini|courgette|kale|lettuce|cabbage|cauliflower|peas|green beans|garlic|mushroom|cucumber|eggplant|aubergine|celery|corn|asparagus|pumpkin|squash|beet|leek|scallion|greens|okra|radish)\b/i;
const GRAIN_RE = /\b(oat|oats|quinoa|brown rice|wild rice|whole wheat|wholemeal|whole[- ]grain|barley|bulgur|farro|millet|rye|buckwheat|cornmeal|polenta|spelt)\b/i;

function computeBalance(logs, recipesById) {
  if (!logs.length) return { balance: null, aiInsight: null };
  let vegMeals = 0;
  let grainMeals = 0;
  const cuisines = new Set();
  const uniqueRecipes = new Set();

  for (const log of logs) {
    const id = String(log.recipeId);
    uniqueRecipes.add(id);
    if (log.cuisine) cuisines.add(String(log.cuisine).toLowerCase());
    const r = recipesById.get(id);
    if (!r) continue;
    for (const c of r.meta?.cuisines || []) {
      const name = typeof c === 'string' ? c : c?.name;
      if (name) cuisines.add(name.toLowerCase());
    }
    const ings = (r.ingredientGroups || []).flatMap((g) => g.ingredients || []);
    if (ings.some((i) => i.category === 'Produce' || VEG_RE.test(i.name || ''))) vegMeals++;
    if (ings.some((i) => GRAIN_RE.test(i.name || ''))) grainMeals++;
  }

  const total = logs.length;
  const vegetables = Math.round((vegMeals / total) * 100);
  const wholeGrains = Math.round((grainMeals / total) * 100);
  const varietyOfCuisines = Math.min(100, Math.round((cuisines.size / Math.min(total, 5)) * 100));
  const repeatDishes = Math.round(((total - uniqueRecipes.size) / total) * 100);

  let title = 'Great balance across your cooked meals this week';
  if (wholeGrains < 50) title = 'Try one more whole-grain side next week';
  else if (vegetables < 60) title = 'Add a vegetable side to one more meal';
  else if (varietyOfCuisines < 60) title = 'Explore a new cuisine this week';
  else if (repeatDishes > 40) title = 'Swap in one new dish for extra variety';

  return {
    balance: { vegetables, wholeGrains, varietyOfCuisines, repeatDishes },
    aiInsight: { title, subtitle: 'General guidance, not medical or dietary advice' },
  };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Monday of the week containing `date`, as a local YYYY-MM-DD key
const weekKey = (date) => {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

// Protein eaten per day this week (Mon-Sun): cooked/eaten meals with computed nutrition, same rule as the
// calorie ring (dayNutrition), newest plan wins when two plans cover a date. Days still to come stay 0.
const proteinByDay = (plans, monday) => {
  const byDate = new Map();
  for (const p of plans) for (const d of p.days || []) if (!byDate.has(d.date)) byDate.set(d.date, d);
  return DAY_LABELS.map((dayLabel, i) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    const day = byDate.get(ymd(date));
    return { dayLabel, date: ymd(date), protein: day ? Math.round(dayNutrition(day.meals).cooked.proteinG) : 0 };
  });
};

// Only reports what is actually known: cooked meals come from the cook log, protein from computed recipe
// nutrition. Balance and the AI insight stay empty instead of being invented.
class ProgressService {
  async getUserProgress(userId) {
    const user = await userRepository.findById(userId);
    const targetProtein = user?.nutritionTarget?.protein || 0;

    const now = new Date();
    const monday = new Date(weekKey(now) + 'T00:00:00');
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const weekLabel = `Week of ${MONTHS[monday.getMonth()]} ${monday.getDate()}–${sunday.getDate()}`;

    const plans = await MealPlan.find({ userId }).sort({ startDate: -1 }).limit(12).select('startDate days.meals.mealType').lean().exec();

    // meals planned this week
    const thisWeek = weekKey(now);
    const planned = plans
      .filter((p) => p.startDate && weekKey(new Date(p.startDate + 'T00:00:00')) === thisWeek)
      .reduce((sum, p) => sum + (p.days || []).reduce((n, d) => n + (d.meals?.length || 0), 0), 0);

    // consecutive weeks (ending this week) in which the user had a plan
    const weeks = new Set(plans.filter((p) => p.startDate).map((p) => weekKey(new Date(p.startDate + 'T00:00:00'))));
    let streak = 0;
    for (const cursor = new Date(monday); weeks.has(weekKey(cursor)); cursor.setDate(cursor.getDate() - 7)) streak++;

    // what the user actually cooked this week
    const logs = await CookLog.find({ userId, cookedAt: { $gte: monday } }).select('recipeId usedSoon cuisine').lean().exec();
    const weekPlans = await MealPlan.find({ userId, startDate: { $lte: ymd(sunday) }, endDate: { $gte: ymd(monday) } })
      .sort({ createdAt: -1 }).select('days.date days.meals').lean().exec();
    const days = proteinByDay(weekPlans, monday);
    const today = ymd(now);
    const counted = days.filter((d) => d.date <= today && d.protein > 0);
    const hits = targetProtein ? counted.filter((d) => d.protein >= targetProtein).length : 0;
    const cooked = logs.length;
    const recipeIds = [...new Set(logs.map((l) => String(l.recipeId)))];
    const [seenBefore, cookedRecipes] = await Promise.all([
      Promise.all(recipeIds.map((id) => CookLog.exists({ userId, recipeId: id, cookedAt: { $lt: monday } }))),
      recipeIds.length
        ? Recipe.find({ _id: { $in: recipeIds } }).select('meta.cuisines ingredientGroups.ingredients.name ingredientGroups.ingredients.category').lean().exec()
        : Promise.resolve([]),
    ]);
    const recipesById = new Map(cookedRecipes.map((r) => [String(r._id), r]));
    const { balance, aiInsight } = computeBalance(logs, recipesById);
    const newRecipes = seenBefore.filter((seen) => !seen).length;
    const total = Math.max(planned, cooked);
    const percentage = total ? Math.round((cooked / total) * 100) : 0;
    // tone: never punitive, no calorie streaks
    const tagline = !cooked ? null : percentage >= 80 ? 'A great rhythm this week' : 'Every meal you cook counts';

    return {
      weekLabel,
      hasData: cooked > 0,
      meals: { cookedCount: cooked, totalCount: total, percentage, tagline },
      proteinGoal: { target: targetProtein, unit: 'g', targetLabel: targetProtein ? `${targetProtein} g target` : null, hitText: counted.length && targetProtein ? `${hits} of ${counted.length} days on target` : null, days },
      // items, not kilograms: pantry quantities are free text, so we only know an item was used in time
      habits: { planningStreakWeeks: streak, newRecipesTried: newRecipes, itemsUsedBeforeUseBy: logs.reduce((n, l) => n + (l.usedSoon || 0), 0) },
      balance,
      aiInsight,
    };
  }
}

module.exports = new ProgressService();
module.exports.proteinByDay = proteinByDay;
module.exports.computeBalance = computeBalance;
