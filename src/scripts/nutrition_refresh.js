// Command-line version of the dashboard's "Refresh USDA data & recalculate all recipes".
//   npm run nutrition:refresh                     download USDA, match ingredients, recalculate recipes
//   npm run nutrition:refresh -- --skip-import    re-match + recalculate only (after editing usda_overrides.json)
//   npm run nutrition:refresh -- --sr <dir> --foundation <dir>   import from already-extracted CSV folders
const { connectDB } = require('../config/database');
const refreshService = require('../services/nutrition_refresh.service');
const { NutritionRun } = require('../models/nutrition_run.model');

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : null;
};

async function main() {
  await connectDB();
  const sr = arg('--sr');
  const foundation = arg('--foundation');
  const { run, done } = await refreshService.start({
    skipImport: process.argv.includes('--skip-import'),
    dirs: sr && foundation ? { srLegacy: sr, foundation } : null,
  });
  await done;
  const result = await NutritionRun.findById(run._id).lean().exec();
  console.log(JSON.stringify({ state: result.state, message: result.message, error: result.error, usda: result.usda, recipes: result.recipes }, null, 2));
  process.exit(result.state === 'done' ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
