const mongoose = require('mongoose');
const { config } = require('./src/config/env');
const { Cuisine } = require('./src/models/cuisine.model');
const { Recipe } = require('./src/models/recipe.model');

async function check() {
  await mongoose.connect(config.mongodbUri);
  const cuisines = await Cuisine.find().lean();
  console.log('Cuisines count in DB:', cuisines.length);
  console.log('Sample cuisines:', JSON.stringify(cuisines.slice(0, 5), null, 2));

  const sampleRecipe = await Recipe.findOne({ 'meta.cuisines.0': { $exists: true } }, 'title meta.cuisines').lean();
  console.log('Sample recipe cuisines:', JSON.stringify(sampleRecipe, null, 2));

  // Count recipes per cuisine
  const italianCount = await Recipe.countDocuments({ 'meta.cuisines.name': { $regex: 'italian', $options: 'i' } });
  console.log('Italian recipes count:', italianCount);

  await mongoose.disconnect();
}
check();

