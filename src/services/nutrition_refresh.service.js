const fs = require('fs');
const path = require('path');
const { Ingredient } = require('../models/ingredient.model');
const { UsdaFood } = require('../models/usda_food.model');
const { NutritionRun } = require('../models/nutrition_run.model');
const { importUsda } = require('./usda_import.service');
const { buildIndex, matchIngredient, buildSiblings } = require('./usda_matcher.service');
const recipeNutrition = require('./recipe_nutrition.service');

const OVERRIDES_FILE = path.join(__dirname, '../../dataset/nutrition/usda_overrides.json');
const STALE_AFTER_MS = 30 * 60 * 1000; // a "running" run older than this died with the server

const loadOverrides = () => (fs.existsSync(OVERRIDES_FILE) ? JSON.parse(fs.readFileSync(OVERRIDES_FILE, 'utf8')) : {});

// links every ingredient to a USDA food (or clears the link) and returns what recipe_nutrition needs to calculate
async function matchIngredients() {
  const foods = await UsdaFood.find().lean().exec();
  const index = buildIndex(foods);
  const overrides = loadOverrides();
  const ingredients = await Ingredient.find().select('externalId name').lean().exec();

  const foodByIngredient = new Map();
  const ops = ingredients.map((ing) => {
    const m = matchIngredient(ing.name, index, overrides);
    if (!m) return { updateOne: { filter: { _id: ing._id }, update: { $unset: { usda: '', nutritionPer100g: '' } } } };
    foodByIngredient.set(ing.externalId, m.food);
    const usda = { fdcId: m.food.fdcId, description: m.food.description, method: m.method };
    return { updateOne: { filter: { _id: ing._id }, update: { $set: { usda, nutritionPer100g: m.food.nutrients } } } };
  });
  if (ops.length) await Ingredient.bulkWrite(ops);

  return { foodByIngredient, siblings: buildSiblings(foods), matched: foodByIngredient.size, total: ingredients.length };
}

async function execute(run, dirs, skipImport) {
  try {
    if (!skipImport) {
      await NutritionRun.updateOne({ _id: run._id }, { message: 'Downloading and importing USDA data' });
      const usda = await importUsda(dirs);
      await NutritionRun.updateOne({ _id: run._id }, { usda });
    }
    await NutritionRun.updateOne({ _id: run._id }, { message: 'Matching ingredients' });
    const ctx = await matchIngredients();
    await NutritionRun.updateOne({ _id: run._id }, { message: 'Recalculating recipes' });
    const recipes = await recipeNutrition.recalculateAll(ctx);
    await NutritionRun.updateOne(
      { _id: run._id },
      { state: 'done', finishedAt: new Date(), recipes, message: `Matched ${ctx.matched} of ${ctx.total} ingredients` }
    );
  } catch (err) {
    console.error('Nutrition refresh failed:', err);
    await NutritionRun.updateOne({ _id: run._id }, { state: 'failed', finishedAt: new Date(), error: err.message, message: 'Failed' });
  }
}

class NutritionRefreshService {
  // starts the job in the background; the dashboard polls status()
  async start({ dirs = null, skipImport = false } = {}) {
    const live = await NutritionRun.findOne({ state: 'running' }).sort({ startedAt: -1 }).exec();
    if (live) {
      if (Date.now() - live.startedAt.getTime() < STALE_AFTER_MS) throw Object.assign(new Error('A refresh is already running'), { statusCode: 409 });
      live.state = 'failed';
      live.error = 'Interrupted (server restarted)';
      await live.save();
    }
    const run = await NutritionRun.create({ message: 'Starting' });
    const done = execute(run, dirs, skipImport);
    return { run, done };
  }

  async status() {
    const run = await NutritionRun.findOne().sort({ startedAt: -1 }).lean().exec();
    return { run: run ? { ...run, _id: undefined } : null, pending: await recipeNutrition.listPending() };
  }
}

module.exports = new NutritionRefreshService();
module.exports.matchIngredients = matchIngredients;
module.exports.loadOverrides = loadOverrides;
