const mongoose = require('mongoose');

const ingredientSchema = new mongoose.Schema(
  {
    externalId: {
      type: String,
      required: true,
      unique: true,
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
    name: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    category: {
      type: String,
      trim: true,
      index: true,
    },
    aliases: {
      type: [String],
      default: [],
      index: true,
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    imageUrl: {
      type: String,
      trim: true,
      default: null,
    },
    recipeCount: {
      type: Number,
      default: 0,
    },
    // link to the USDA food used for nutrition + how it was chosen (null = unmatched)
    usda: {
      fdcId: Number,
      description: String,
      method: { type: String, enum: ['auto', 'curated'] },
    },
    // copy of that food's nutrients per 100 g (sodium in mg); null values = unknown
    nutritionPer100g: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

ingredientSchema.index({ name: 'text', aliases: 'text' });

const Ingredient = mongoose.model('Ingredient', ingredientSchema);

module.exports = { Ingredient };

