const fs = require('fs');
const path = require('path');
const { connectDB } = require('../config/database');
const { Cuisine } = require('../models/cuisine.model');
const { Ingredient } = require('../models/ingredient.model');
const { Recipe } = require('../models/recipe.model');

const DATASET_DIR = path.resolve(__dirname, '../../dataset');

async function seedCuisines() {
  const filePath = path.join(DATASET_DIR, 'cuisines', 'cuisines.json');
  if (!fs.existsSync(filePath)) {
    console.warn(`Cuisines file not found at ${filePath}`);
    return;
  }

  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const cuisines = raw.cuisines || [];

  const operations = cuisines.map((item) => ({
    updateOne: {
      filter: { slug: item.slug },
      update: {
        $set: {
          externalId: item.id,
          slug: item.slug,
          name: item.name,
          countries: item.countries || [],
          recipeCount: item.recipe_count || 0,
        },
      },
      upsert: true,
    },
  }));

  if (operations.length > 0) {
    const res = await Cuisine.bulkWrite(operations);
    console.log(`✅ Cuisines seeded: ${operations.length} records processed.`);
  }
}

async function seedIngredients() {
  const filePath = path.join(DATASET_DIR, 'ingredient', 'ingredients.json');
  if (!fs.existsSync(filePath)) {
    console.warn(`Ingredients file not found at ${filePath}`);
    return;
  }

  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const ingredients = raw.ingredients || [];

  const operations = ingredients.map((item) => ({
    updateOne: {
      filter: { slug: item.slug },
      update: {
        $set: {
          externalId: item.id,
          slug: item.slug,
          name: item.name,
          category: item.category || 'other',
          aliases: item.aliases || [],
          description: item.description || '',
          imageUrl: item.image?.url || null,
          recipeCount: item.recipe_count || 0,
        },
      },
      upsert: true,
    },
  }));

  if (operations.length > 0) {
    const res = await Ingredient.bulkWrite(operations);
    console.log(
      `✅ Ingredients seeded: ${operations.length} records processed.`
    );
  }
}

async function seedRecipes() {
  const recipesDir = path.join(DATASET_DIR, 'recipes');
  if (!fs.existsSync(recipesDir)) {
    console.warn(`Recipes dir not found at ${recipesDir}`);
    return;
  }

  const files = fs
    .readdirSync(recipesDir)
    .filter((f) => f.endsWith('.json'));

  console.log(`Found ${files.length} recipe files to ingest...`);

  const BATCH_SIZE = 100;
  let processed = 0;

  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const batchFiles = files.slice(i, i + BATCH_SIZE);
    const operations = [];

    for (const file of batchFiles) {
      try {
        const content = JSON.parse(
          fs.readFileSync(path.join(recipesDir, file), 'utf8')
        );

        operations.push({
          updateOne: {
            filter: { slug: content.slug },
            update: {
              $set: {
                externalId: content.id,
                title: content.title,
                slug: content.slug,
                summary: content.summary || '',
                media: {
                  imageUrl: content.media?.primary_image?.url || null,
                  thumbnailUrl:
                    content.media?.primary_image?.thumbnail_url || null,
                  videoUrl: content.media?.video?.url || null,
                  altText: content.media?.primary_image?.alt_text || '',
                },
                meta: {
                  cuisines: content.meta?.cuisines || [],
                  tags: content.meta?.tags || [],
                  mealTypes: content.meta?.meal_types || [],
                  courses: content.meta?.courses || [],
                  dietaryFlags: content.meta?.dietary_flags || [],
                  difficulty: content.meta?.difficulty || 'intermediate',
                },
                timing: {
                  prepMinutes: content.timing?.prep_time_minutes || 0,
                  cookMinutes: content.timing?.cook_time_minutes || 0,
                  totalMinutes: content.timing?.total_time_minutes || 0,
                },
                yield: {
                  servings: content.yield?.servings || 4,
                  servingUnit: content.yield?.serving_unit || 'servings',
                },
                allergens: {
                  contains: content.allergens?.contains || [],
                  freeFrom: content.allergens?.free_from || [],
                  mayContain: content.allergens?.may_contain || [],
                },
                ingredientGroups: (content.ingredient_groups || []).map(
                  (grp) => ({
                    groupName: grp.group_name || 'Ingredients',
                    ingredients: (grp.ingredients || []).map((ing) => ({
                      ingredientId: ing.ingredient_id,
                      name: ing.name,
                      displayText: ing.display_text,
                      quantity: ing.quantity,
                      unit: ing.unit,
                      metricQuantity: ing.metric_quantity,
                      metricUnit: ing.metric_unit,
                      category: ing.category,
                      isOptional: ing.is_optional || false,
                    })),
                  })
                ),
                instructionSteps: (content.instruction_steps || []).map(
                  (step) => ({
                    stepNumber: step.step_number,
                    instruction: step.instruction,
                    timerSeconds: step.timer_seconds || 0,
                  })
                ),
              },
            },
            upsert: true,
          },
        });
      } catch (err) {
        console.error(`Error parsing recipe file ${file}:`, err.message);
      }
    }

    if (operations.length > 0) {
      await Recipe.bulkWrite(operations);
      processed += operations.length;
      console.log(`Ingested ${processed} / ${files.length} recipes...`);
    }
  }

  console.log(`✅ Recipes ingestion complete. Total ingested: ${processed}`);
}

async function runSeed() {
  try {
    console.log('Connecting to database...');
    await connectDB();
    console.log('Starting dataset seed...');

    await seedCuisines();
    await seedIngredients();
    await seedRecipes();

    console.log('🎉 Dataset ingestion finished successfully!');
    process.exit(0);
  } catch (err) {
    console.error('Fatal seed error:', err);
    process.exit(1);
  }
}

runSeed();

