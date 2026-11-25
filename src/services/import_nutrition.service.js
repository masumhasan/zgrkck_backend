const { UsdaFood } = require('../models/usda_food.model');
const { buildIndex, matchIngredient, buildSiblings } = require('./usda_matcher.service');
const { computeRecipeNutrition } = require('./recipe_nutrition.service');
const { loadOverrides } = require('./nutrition_refresh.service');
const { lineFor } = require('../utils/recipe_parse.util');

// Estimated nutrition for a recipe the user imported or typed in, from the same USDA data and arithmetic as the
// catalogue. Never 'complete': a list the user supplied is an estimate (REQ-SAFE-11).
const TTL_MS = 30 * 60 * 1000;
let cache = null; // the USDA index is ~8k foods: load once and reuse

async function context() {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.ctx;
  const foods = await UsdaFood.find().lean().exec();
  cache = { at: Date.now(), ctx: foods.length ? { index: buildIndex(foods), overrides: loadOverrides(), siblings: buildSiblings(foods) } : null };
  return cache.ctx;
}

// ingredients: [{ name, quantity, unit }] -> a Recipe.nutrition-shaped block ({ status: 'estimated' | 'none', perServing, ... })
async function estimateNutrition(ingredients, servings) {
  return estimateFromLines(ingredients.map((ing) => lineFor(ing)), servings);
}

// lines already in stored shape ({ name, quantity, unit, metricQuantity, metricUnit }), e.g. an adapted catalogue recipe
async function estimateFromLines(storedLines, servings) {
  const ctx = await context();
  if (!ctx || !storedLines.length) return { status: 'none', perServing: null };
  const lines = storedLines.map((l, i) => ({ ingredientId: `i${i}`, ...l }));
  const foodByIngredient = new Map();
  for (const l of lines) {
    const m = matchIngredient(l.name, ctx.index, ctx.overrides);
    if (m) foodByIngredient.set(l.ingredientId, m.food);
  }
  const n = computeRecipeNutrition({ yield: { servings }, ingredientGroups: [{ ingredients: lines }] }, { foodByIngredient, siblings: ctx.siblings });
  return n.status === 'complete' ? { ...n, status: 'estimated' } : n;
}

// load the USDA index in the background at startup; failures just mean the first request pays for it
const warm = () => context().catch((err) => console.error("USDA warm-up skipped:", err.message));

module.exports = { estimateNutrition, estimateFromLines, warm };
