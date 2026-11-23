const mongoose = require('mongoose');

// In-app notification inbox (bell on Home). Types follow REQ-PRO-08 (individually switchable)
// plus plan_conflict (REQ-PLAN-08), which is safety-related and always on.
const TYPES = ['plan_ready', 'shopping_reminder', 'use_it_up', 'weekly_report', 'plan_conflict'];
// where a tap takes the user in the app (never a raw URL)
const ACTIONS = ['plan', 'pantry', 'shopping', 'progress', 'none'];

const notificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: TYPES, required: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    body: { type: String, default: '', trim: true, maxlength: 400 },
    action: { type: String, enum: ACTIONS, default: 'none' },
    // one notification per event (e.g. 'use_it_up:2026-11-23'); a repeat trigger is a no-op
    dedupeKey: { type: String, required: true },
    readAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false }
);

notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, dedupeKey: 1 }, { unique: true });
notificationSchema.index({ userId: 1, readAt: 1 });
// old notifications clean themselves up after 60 days
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 24 * 60 * 60 });

const Notification = mongoose.model('Notification', notificationSchema);

module.exports = { Notification, NOTIFICATION_TYPES: TYPES, NOTIFICATION_ACTIONS: ACTIONS };
