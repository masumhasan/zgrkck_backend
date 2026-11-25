const mongoose = require('mongoose');

// One document per USDA refresh + recalculation run (the dashboard shows the latest).
const nutritionRunSchema = new mongoose.Schema(
  {
    state: { type: String, enum: ['running', 'done', 'failed'], default: 'running' },
    startedAt: { type: Date, default: Date.now },
    finishedAt: { type: Date, default: null },
    message: { type: String, default: '' },
    error: { type: String, default: null },
    usda: { srLegacy: { type: Number, default: 0 }, foundation: { type: Number, default: 0 } },
    recipes: {
      total: { type: Number, default: 0 },
      complete: { type: Number, default: 0 },
      estimated: { type: Number, default: 0 },
      none: { type: Number, default: 0 },
      hidden: { type: Number, default: 0 }, // set to Needs Review by the 1,500 kcal rule
      held: { type: Number, default: 0 }, // changes over 10% waiting for approval
    },
  },
  { versionKey: false }
);

const NutritionRun = mongoose.model('NutritionRun', nutritionRunSchema);

// A recalculation that changed a recipe's calories by more than 10%: held here, not applied, until an admin approves.
const nutritionPendingSchema = new mongoose.Schema(
  {
    recipeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Recipe', required: true, unique: true },
    title: { type: String, default: '' },
    kcalWas: { type: Number, required: true },
    kcalNow: { type: Number, required: true },
    changePct: { type: Number, required: true },
    next: { type: mongoose.Schema.Types.Mixed, required: true }, // the full nutrition block to apply on approval
  },
  { timestamps: true, versionKey: false }
);

const NutritionPending = mongoose.model('NutritionPending', nutritionPendingSchema);

module.exports = { NutritionRun, NutritionPending };
