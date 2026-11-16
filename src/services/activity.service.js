const { Activity } = require('../models/activity.model');

class ActivityService {
  // Best-effort: activity logging must never break the primary action.
  async log(type, title) {
    try {
      await Activity.create({ type, title });
    } catch (err) {
      console.error('Failed to record activity:', err.message);
    }
  }

  async recent(limit = 10) {
    const items = await Activity.find()
      .sort({ createdAt: -1 })
      .limit(Math.min(Math.max(parseInt(limit, 10) || 10, 1), 50))
      .lean()
      .exec();
    return items.map((a) => ({
      id: String(a._id),
      type: a.type,
      title: a.title,
      createdAt: a.createdAt,
    }));
  }
}

module.exports = new ActivityService();
