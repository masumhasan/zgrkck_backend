const { Recipe } = require('../models/recipe.model');
const { NutritionPending } = require('../models/nutrition_run.model');
const { lineMeasure, gramsFor } = require('../utils/nutrition_weight.util');

// Per-serving nutrition from ingredients x USDA, plus the client's rules. Deterministic arithmetic only (no AI).
const NUTRIENTS = ['kcal', 'protein', 'carbs', 'fat', 'fibre', 'sugar', 'sodium'];
const NO_DATA_ABOVE = 0.2; // more than 20% of the recipe weight unmatched -> "No nutrition data"
const HOLD_ABOVE = 0.1; // a recalculation moving calories by more than 10% waits for admin approval
const IMPLAUSIBLE_KCAL = 1500; // per serving: hidden from the app until the source data is fixed
const NUTRIENT_UNKNOWN_ABOVE = 0.2; // fibre/sugar is null (unknown, not 0) when USDA lacks it for >20% of the weight
const ASSUMED_LINE_G = 50; // shortcut: weight assumed for an unresolved line with no stated weight, only used for the 20% share

const round = (v, d = 1) => Math.round(v * 10 ** d) / 10 ** d;

// ctx.foodByIngredient: Map(ingredient externalId -> usda food); ctx.siblings(food) -> foods sharing its name
function computeRecipeNutrition(recipe, ctx) {
  const sums = Object.fromEntries(NUTRIENTS.map((k) => [k, 0]));
  const unknownG = Object.fromEntries(NUTRIENTS.map((k) => [k, 0]));
  let resolvedG = 0;
  let unresolvedG = 0;
  let unresolvedLines = 0;

  for (const group of recipe.ingredientGroups || []) {
    for (const line of group.ingredients || []) {
      const measure = lineMeasure(line);
      if (measure.skip) continue;
      const food = ctx.foodByIngredient.get(line.ingredientId);
      const grams = food ? gramsFor(measure, food, ctx.siblings) : null;
      if (grams == null) {
        unresolvedLines++;
        unresolvedG += measure.grams ?? measure.ml ?? ASSUMED_LINE_G;
        continue;
      }
      resolvedG += grams;
      for (const k of NUTRIENTS) {
        const per100 = food.nutrients[k];
        if (per100 == null) unknownG[k] += grams;
        else sums[k] += (per100 * grams) / 100;
      }
    }
  }

  const total = resolvedG + unresolvedG;
  const share = total ? unresolvedG / total : 1;
  const unmatchedPct = round(share * 100);
  const calculatedAt = new Date();
  if (resolvedG === 0 || share > NO_DATA_ABOVE) return { status: 'none', perServing: null, unmatchedPct, calculatedAt, source: 'usda' };

  const servings = recipe.yield?.servings || 1;
  const perServing = {};
  for (const k of NUTRIENTS) {
    const unknown = resolvedG ? unknownG[k] / resolvedG > NUTRIENT_UNKNOWN_ABOVE : true;
    const v = sums[k] / servings;
    perServing[k] = unknown ? null : k === 'kcal' || k === 'sodium' ? Math.round(v) : round(v);
  }
  return { status: unresolvedLines === 0 ? 'complete' : 'estimated', perServing, unmatchedPct, calculatedAt, source: 'usda' };
}

// Applies the client's rules to a freshly computed block. Returns the block to store, a held change (or null), and
// whether the recipe must be hidden for review.
function decideNutrition(old, next) {
  const oldKcal = old && old.status && old.status !== 'none' ? old.perServing?.kcal : null;
  let stored = next;
  let pending = null;
  if (oldKcal > 0) {
    const nowKcal = next.perServing?.kcal ?? 0;
    const change = (nowKcal - oldKcal) / oldKcal;
    if (Math.abs(change) > HOLD_ABOVE) {
      stored = old; // not applied silently
      pending = { kcalWas: oldKcal, kcalNow: nowKcal, changePct: round(change * 100), next };
    }
  }
  const hide = (stored.perServing?.kcal ?? 0) > IMPLAUSIBLE_KCAL;
  return { nutrition: { ...stored, flag: hide ? 'implausible' : null }, pending, hide };
}

// "Published" recipes that trip the 1,500 kcal rule go to Needs Review (the app already hides those); never unhidden automatically
const statusUpdate = (recipe, hide) => (hide && recipe.status === 'Published' ? { status: 'Needs Review' } : {});

async function recalculateAll(ctx) {
  const recipes = await Recipe.find({ createdBy: null }).select('title status yield ingredientGroups nutrition').lean().exec();
  const counts = { total: recipes.length, complete: 0, estimated: 0, none: 0, hidden: 0, held: 0 };
  const recipeOps = [];
  const pendingOps = [];

  for (const r of recipes) {
    const { nutrition, pending, hide } = decideNutrition(r.nutrition, computeRecipeNutrition(r, ctx));
    recipeOps.push({ updateOne: { filter: { _id: r._id }, update: { $set: { nutrition, ...statusUpdate(r, hide) } } } });
    counts[nutrition.status]++;
    if (hide) counts.hidden++;
    if (pending) {
      counts.held++;
      pendingOps.push({ updateOne: { filter: { recipeId: r._id }, update: { $set: { title: r.title, ...pending } }, upsert: true } });
    } else pendingOps.push({ deleteOne: { filter: { recipeId: r._id } } });
  }
  if (recipeOps.length) await Recipe.bulkWrite(recipeOps);
  if (pendingOps.length) await NutritionPending.bulkWrite(pendingOps);
  return counts;
}

async function listPending() {
  const rows = await NutritionPending.find().sort({ changePct: -1 }).lean().exec();
  return rows.map((p) => ({ recipeId: String(p.recipeId), title: p.title, kcalWas: p.kcalWas, kcalNow: p.kcalNow, changePct: p.changePct }));
}

async function approvePending(recipeId) {
  const pending = await NutritionPending.findOne({ recipeId }).lean().exec();
  if (!pending) throw Object.assign(new Error('No pending change for this recipe'), { statusCode: 404 });
  const recipe = await Recipe.findById(recipeId).select('status').lean().exec();
  const hide = (pending.next.perServing?.kcal ?? 0) > IMPLAUSIBLE_KCAL;
  await Recipe.updateOne({ _id: recipeId }, { $set: { nutrition: { ...pending.next, flag: hide ? 'implausible' : null }, ...statusUpdate(recipe || {}, hide) } });
  await NutritionPending.deleteOne({ recipeId });
}

module.exports = { computeRecipeNutrition, decideNutrition, recalculateAll, listPending, approvePending, IMPLAUSIBLE_KCAL };
