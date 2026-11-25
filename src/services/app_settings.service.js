const { User } = require('../models/user.model');

const DEFAULTS = {
  units: 'metric',
  mealSchedule: ['Breakfast', 'Lunch', 'Dinner'],
  planningDay: 'Off',
  cookingReminder: { enabled: false, time: '17:00' },
};

// accounts created before the settings existed have no block: fill every missing field
const withDefaults = (s = {}) => ({ ...DEFAULTS, ...s, cookingReminder: { ...DEFAULTS.cookingReminder, ...(s.cookingReminder || {}) } });

class AppSettingsService {
  async get(userId) {
    const user = await User.findById(userId).select('appSettings').lean().exec();
    return withDefaults(user?.appSettings);
  }

  // changes are already validated; nested reminder fields are set one by one so a partial update keeps the rest
  async update(userId, changes) {
    const { cookingReminder, ...flat } = changes;
    const $set = { ...Object.fromEntries(Object.entries(flat).map(([k, v]) => [`appSettings.${k}`, v])) };
    for (const [k, v] of Object.entries(cookingReminder || {})) $set[`appSettings.cookingReminder.${k}`] = v;
    await User.updateOne({ _id: userId }, { $set }).exec();
    return this.get(userId);
  }
}

module.exports = new AppSettingsService();
