const mongoose = require('mongoose');

// REQ-REC-03: "Report a problem" on a recipe; the admin team reviews these.
const recipeReportSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    recipeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Recipe', required: true, index: true },
    kind: { type: String, enum: ['quantity', 'allergen', 'instructions', 'other'], required: true },
    note: { type: String, trim: true, maxlength: 500, default: '' },
    status: { type: String, enum: ['open', 'resolved'], default: 'open', index: true },
  },
  { timestamps: true, versionKey: false },
);

const RecipeReport = mongoose.model('RecipeReport', recipeReportSchema);

module.exports = { RecipeReport };
