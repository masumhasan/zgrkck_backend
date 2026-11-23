const { User } = require('../models/user.model');

// Deterministic scoring + taste learning. Safety filtering happens before this, never here.
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

// Mongo map keys can't contain '.' or '$'
const tasteKey = (cuisineName) => String(cuisineName || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

const cuisineOf = (recipe) => recipe.meta?.cuisines?.[0]?.name || '';

// weights: plain object of tasteKey -> number (what the user cooked, rated, skipped, swapped)
const score = (recipe, onboarding = {}, weights = {}) => {
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

module.exports = { score, getWeights, applyTaste, tasteKey, cuisineOf };
