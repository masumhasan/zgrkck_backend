const { User } = require('../models/user.model');
const { publicNutrition } = require('../utils/nutrition_public.util');

// Deterministic scoring + taste learning. Safety filtering happens before this, never here.
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

// Mongo map keys can't contain '.' or '$'
const tasteKey = (cuisineName) => String(cuisineName || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

const cuisineOf = (recipe) => recipe.meta?.cuisines?.[0]?.name || '';

// One meal's share of the day's target. shortcut: flat 1/3 of the day, ignores the slot (breakfast vs dinner);
// pass a real slot budget instead if a screen ranks for a specific meal.
const mealBudget = (target) => (target?.calories > 0 ? { kcal: target.calories / 3, proteinG: (target.protein || 0) / 3 } : null);

// weights: plain object of tasteKey -> number (what the user cooked, rated, skipped, swapped)
// budget: optional { kcal, proteinG } per meal; recipes with no nutrition data get no goal term (never penalised for it)
const score = (recipe, onboarding = {}, weights = {}, budget = null) => {
  let points = 60;
  const reasons = [];
  const names = (recipe.meta?.cuisines || []).map((c) => (c.name || '').toLowerCase());

  const favourite = (onboarding.favouriteCuisines || []).find((c) => names.includes(c.toLowerCase()));
  if (favourite) {
    points += 20;
    reasons.push(`${favourite} cuisine you like`);
  }

  const learned = clamp((weights[tasteKey(cuisineOf(recipe))] || 0) * 4, -12, 12);
  points += learned;
  if (learned >= 4) reasons.push(`You enjoy ${cuisineOf(recipe)} meals`);

  const tags = (recipe.meta?.tags || []).map((t) => t.toLowerCase());
  const focus = (onboarding.nutritionFocuses || []).find((f) => tags.includes(f.toLowerCase().replace(/\s+/g, '-')) || tags.includes(f.toLowerCase()));
  if (focus) {
    points += 15;
    reasons.push(`Fits your ${focus.toLowerCase()} focus`);
  }

  const { perServing: per } = publicNutrition(recipe.nutrition);
  if (budget?.kcal > 0 && per) {
    // full marks within +-30% of the budget, fading to nothing at 0% / 200%; centred so a poor fit lowers the score
    const fit = clamp(1 - Math.max(0, Math.abs(per.kcal / budget.kcal - 1) - 0.3) / 0.7, 0, 1);
    points += (fit - 0.5) * 16;
    if (fit === 1) reasons.push('Fits your calorie goal');
    if (budget.proteinG > 0 && per.protein != null) {
      points += clamp(per.protein / budget.proteinG, 0, 1) * 6;
      if (per.protein >= budget.proteinG * 0.9) reasons.push('Hits your protein goal');
    }
  }

  const minutes = recipe.timing?.totalMinutes || 0;
  if (minutes > 0) {
    points += clamp((45 - minutes) / 9, 0, 5); // quicker meals rank a little higher
    if (minutes <= 20) reasons.push(`Ready in ${minutes} min`);
  }

  return {
    match: clamp(Math.round(points), 1, 99),
    reason: reasons.length ? reasons.join(' · ') : 'Picked for your tastes and restrictions',
  };
};

const getWeights = async (userId) => {
  const user = await User.findById(userId).select('tasteWeights').lean().exec();
  return user?.tasteWeights || {};
};

// delta: cooked +1 (± rating), skipped -1, swapped away -0.5
const applyTaste = async (userId, recipe, delta) => {
  const key = tasteKey(cuisineOf(recipe));
  if (!key || !delta) return;
  await User.updateOne({ _id: userId }, { $inc: { [`tasteWeights.${key}`]: delta } });
};

module.exports = { score, mealBudget, getWeights, applyTaste, tasteKey, cuisineOf };
