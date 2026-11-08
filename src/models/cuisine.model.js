const mongoose = require('mongoose');

const cuisineSchema = new mongoose.Schema(
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
    countries: {
      type: [String],
      default: [],
    },
    recipeCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

const Cuisine = mongoose.model('Cuisine', cuisineSchema);

module.exports = { Cuisine };

