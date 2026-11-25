const mongoose = require('mongoose');

// People the account owner cooks for (the owner themself is not stored here; their DNA is User.onboarding).
const householdMemberSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 40 },
    role: { type: String, enum: ['adult', 'child'], default: 'adult' },
    portionFactor: { type: Number, enum: [0.5, 1, 1.25, 1.5], default: 1 },
    // soft taste/diet chips (see household.validator.js)
    preferences: { type: [String], default: [] },
    // onboarding allergy labels ("Tree Nuts"): safety critical, fed to safety_filter.service.js
    allergies: { type: [String], default: [] },
    // custom "never in the food" ingredients, matched by name like User.onboarding.specificIngredients
    excludedIngredients: { type: [String], default: [] },
  },
  { timestamps: true, versionKey: false },
);

const HouseholdMember = mongoose.model('HouseholdMember', householdMemberSchema);

module.exports = { HouseholdMember };
