const mongoose = require('mongoose');

const recipeSchema = new mongoose.Schema(
  {
    externalId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    summary: {
      type: String,
      trim: true,
      default: '',
    },
    media: {
      imageUrl: { type: String, default: null },
      thumbnailUrl: { type: String, default: null },
      videoUrl: { type: String, default: null },
      altText: { type: String, default: '' },
    },
    meta: {
      cuisines: [
        {
          id: { type: String },
          slug: { type: String, lowercase: true },
          name: { type: String },
        },
      ],
      tags: { type: [String], default: [] },
      mealTypes: { type: [String], default: [] }, // dinner, lunch, breakfast, snack
      courses: { type: [String], default: [] }, // main_course, side, dessert
      dietaryFlags: { type: [String], default: [] }, // vegetarian, vegan, etc.
      difficulty: { type: String, default: 'intermediate' },
    },
    timing: {
      prepMinutes: { type: Number, default: 0 },
      cookMinutes: { type: Number, default: 0 },
      totalMinutes: { type: Number, default: 0 },
    },
    yield: {
      servings: { type: Number, default: 4 },
      servingUnit: { type: String, default: 'servings' },
    },
    allergens: {
      contains: { type: [String], default: [] }, // dairy, gluten, peanuts, etc.
      freeFrom: { type: [String], default: [] },
      mayContain: { type: [String], default: [] },
    },
    ingredientGroups: [
      {
        groupName: { type: String, default: 'Ingredients' },
        ingredients: [
          {
            ingredientId: { type: String },
            name: { type: String, required: true },
            displayText: { type: String },
            quantity: { type: Number },
            unit: { type: String },
            metricQuantity: { type: Number },
            metricUnit: { type: String },
            category: { type: String },
            isOptional: { type: Boolean, default: false },
          },
        ],
      },
    ],
    instructionSteps: [
      {
        stepNumber: { type: Number, required: true },
        instruction: { type: String, required: true },
        timerSeconds: { type: Number, default: 0 },
      },
    ],
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

recipeSchema.index({ 'meta.cuisines.name': 1 });
recipeSchema.index({ 'meta.mealTypes': 1 });
recipeSchema.index({ 'allergens.contains': 1 });
recipeSchema.index({ 'timing.totalMinutes': 1 });
recipeSchema.index({ title: 'text', summary: 'text' });

const Recipe = mongoose.model('Recipe', recipeSchema);

module.exports = { Recipe };
