const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema(
  {
    type: { type: String, required: true, trim: true, index: true },
    title: { type: String, required: true, trim: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false }
);

activitySchema.index({ createdAt: -1 });

const Activity = mongoose.model('Activity', activitySchema);

module.exports = { Activity };
