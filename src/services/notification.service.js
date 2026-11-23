const { Notification } = require('../models/notification.model');
const { User } = require('../models/user.model');

// type -> the switch that controls it (REQ-PRO-08); plan_conflict is safety-related, always on
const PREF_FOR_TYPE = {
  plan_ready: 'planReady',
  shopping_reminder: 'shoppingReminder',
  use_it_up: 'useItUp',
  weekly_report: 'weeklyReport',
};
const DEFAULT_PREFS = { planReady: true, shoppingReminder: true, useItUp: true, weeklyReport: true };

const httpError = (message, statusCode) => Object.assign(new Error(message), { statusCode });

const toDto = (n) => ({
  id: String(n._id),
  type: n.type,
  title: n.title,
  body: n.body,
  action: n.action,
  read: Boolean(n.readAt),
  createdAt: n.createdAt,
});

class NotificationService {
  async getPrefs(userId) {
    const user = await User.findById(userId).select('notificationPrefs').lean().exec();
    return { ...DEFAULT_PREFS, ...(user?.notificationPrefs || {}) };
  }

  async updatePrefs(userId, changes) {
    const $set = Object.fromEntries(Object.entries(changes).map(([k, v]) => [`notificationPrefs.${k}`, v]));
    await User.updateOne({ _id: userId }, { $set }).exec();
    return this.getPrefs(userId);
  }

  // Records one notification unless its type is switched off or the same event was already
  // recorded (dedupeKey). Returns true when a new one was created.
  async notify(userId, message, dedupeKey, prefs = null) {
    const pref = PREF_FOR_TYPE[message.type];
    if (pref && (prefs || (await this.getPrefs(userId)))[pref] === false) return false;
    try {
      const res = await Notification.updateOne(
        { userId, dedupeKey },
        { $setOnInsert: { userId, dedupeKey, ...message, readAt: null } },
        { upsert: true }
      ).exec();
      return res.upsertedCount > 0;
    } catch (err) {
      if (err.code === 11000) return false; // the same event raced in twice
      throw err;
    }
  }

  async list(userId, { page = 1, limit = 20, unreadOnly = false } = {}) {
    const filter = { userId, ...(unreadOnly ? { readAt: null } : {}) };
    const [items, total, unread] = await Promise.all([
      Notification.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean().exec(),
      Notification.countDocuments(filter).exec(),
      this.unreadCount(userId),
    ]);
    return { items: items.map(toDto), unread, page, limit, total, hasMore: page * limit < total };
  }

  unreadCount(userId) {
    return Notification.countDocuments({ userId, readAt: null }).exec();
  }

  // scoped by userId, so one user can never touch another's notifications
  async markRead(userId, id) {
    const n = await Notification.findOneAndUpdate({ _id: id, userId }, { $set: { readAt: new Date() } }, { returnDocument: 'after' }).lean().exec();
    if (!n) throw httpError('Notification not found', 404);
    return toDto(n);
  }

  async markAllRead(userId) {
    const res = await Notification.updateMany({ userId, readAt: null }, { $set: { readAt: new Date() } }).exec();
    return { updated: res.modifiedCount };
  }

  async remove(userId, id) {
    const res = await Notification.deleteOne({ _id: id, userId }).exec();
    if (!res.deletedCount) throw httpError('Notification not found', 404);
    return { deleted: true };
  }
}

module.exports = new NotificationService();
