const mongoose = require('mongoose');

const mealItemSchema = new mongoose.Schema(
  {
    mealType: {
      type: String,
      enum: ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK'],
      required: true,
    },
    time: { type: String, default: '12:00 PM' },
    recipeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Recipe', default: null },
    name: { type: String, required: true },
    description: { type: String, default: '' },
    kcal: { type: Number, default: 450 },
    proteinG: { type: Number, default: 30 },
    carbsG: { type: Number, default: 45 },
    fatG: { type: Number, default: 15 },
    servings: { type: Number, default: 1 },
    imageUrl: { type: String, default: '' },
    cookTimeMinutes: { type: Number, default: 30 },
  },
  { _id: false }
);

const dayPlanSchema = new mongoose.Schema(
  {
    date: { type: String, required: true }, // 'YYYY-MM-DD'
    dayNumber: { type: Number, required: true }, // e.g. 14
    month: { type: Number, required: true }, // 1-12
    monthName: { type: String, default: '' }, // 'Nov'
    year: { type: Number, required: true }, // 2026
    dayName: { type: String, required: true }, // 'Saturday'
    dayLabel: { type: String, default: '' }, // 'Today', 'Tomorrow', 'Completed', etc.
    meals: [mealItemSchema],
  },
  { _id: false }
);

const mealPlanSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    generationDate: { type: String, required: true }, // 'YYYY-MM-DD'
    generatedAt: { type: Date, default: Date.now },
    startDate: { type: String, required: true }, // 'YYYY-MM-DD'
    endDate: { type: String, required: true }, // 'YYYY-MM-DD'
    days: [dayPlanSchema],
    overview: {
      avgKcalPerDay: { type: Number, default: 1850 },
      avgProteinPerDay: { type: Number, default: 126 },
      goalFitText: { type: String, default: 'On track for Weight Maintenance' },
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

mealPlanSchema.index({ userId: 1, startDate: 1 });
mealPlanSchema.index({ userId: 1, endDate: 1 });

const MealPlan = mongoose.model('MealPlan', mealPlanSchema);

module.exports = { MealPlan };
