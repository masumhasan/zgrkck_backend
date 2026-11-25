const mongoose = require('mongoose');

// one row per meal the user actually cooked: the source of truth for progress and taste learning
const cookLogSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    recipeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Recipe', required: true },
    cookedAt: { type: Date, default: Date.now },
    rating: { type: Number, min: 1, max: 5, default: null },
    planDate: { type: String, default: null }, // 'YYYY-MM-DD' of the plan slot it fulfilled, if any
    mealType: { type: String, default: null },
    cuisine: { type: String, default: '' },
    usedSoon: { type: Number, default: 0 }, // pantry items used while within 3 days of their use-by date
  },
  { versionKey: false }
);

cookLogSchema.index({ userId: 1, cookedAt: -1 });

const CookLog = mongoose.model('CookLog', cookLogSchema);

module.exports = { CookLog };
