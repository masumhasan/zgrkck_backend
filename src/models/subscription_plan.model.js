const mongoose = require('mongoose');

const subscriptionPlanSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60, unique: true },
    cycle: { type: String, enum: ['Monthly', 'Quarterly', 'Yearly'], default: 'Monthly' },
    price: { type: Number, required: true, min: 0, default: 0 },
    description: { type: String, trim: true, default: '' },
    status: { type: String, enum: ['Active', 'Draft', 'Hidden'], default: 'Draft', index: true },
    iconType: { type: String, enum: ['leaf', 'calendar', 'award'], default: 'calendar' },
    aiLimit: { type: Number, min: 0, default: 100 },
    recipeLimit: { type: String, trim: true, default: 'Unlimited' },
    features: { type: [String], default: [] },
    isDefault: { type: Boolean, default: false, index: true },
  },
  { timestamps: true, versionKey: false }
);

const SubscriptionPlan = mongoose.model('SubscriptionPlan', subscriptionPlanSchema);

module.exports = { SubscriptionPlan };
