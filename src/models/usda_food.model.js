const mongoose = require('mongoose');

// Local copy of USDA FoodData Central (SR Legacy + Foundation Foods). Nothing calls the USDA API at runtime.
// Nutrients are per 100 g (sodium in mg); null = USDA has no value (unknown, never 0).
const nutrient = { type: Number, default: null };

const usdaFoodSchema = new mongoose.Schema(
  {
    fdcId: { type: Number, required: true, unique: true },
    description: { type: String, required: true, index: true },
    dataType: { type: String, enum: ['sr_legacy', 'foundation'], required: true },
    nutrients: { kcal: nutrient, protein: nutrient, carbs: nutrient, fat: nutrient, fibre: nutrient, sugar: nutrient, sodium: nutrient },
    // household measures: "1 cup, chopped" = 160 g. unit is cup|tablespoon|teaspoon|fl oz when it is a volume.
    portions: [{ _id: false, amount: Number, unit: String, text: String, g: Number }],
  },
  { versionKey: false }
);

const UsdaFood = mongoose.model('UsdaFood', usdaFoodSchema);

module.exports = { UsdaFood };
