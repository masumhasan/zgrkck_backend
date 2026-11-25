const mongoose = require('mongoose');

// REQ-SAFE-13: counts only. Never store what the user typed or any health detail, just that it happened.
const KINDS = ['allergen_block', 'floor_trigger', 'escalation'];
const safetyEventSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    kind: { type: String, enum: KINDS, required: true },
    createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 400 }, // 400 days, then gone
  },
  { versionKey: false },
);
safetyEventSchema.index({ kind: 1, createdAt: -1 });

const SafetyEvent = mongoose.model('SafetyEvent', safetyEventSchema);

module.exports = { SafetyEvent, SAFETY_KINDS: KINDS };
