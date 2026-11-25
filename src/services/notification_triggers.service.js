const { User } = require('../models/user.model');
const { PantryItem } = require('../models/pantry.model');
const { ShoppingItem } = require('../models/shopping.model');
const { MealPlan } = require('../models/plan.model');
const { CookLog } = require('../models/cook_log.model');
const mealPlanService = require('./meal_plan.service');
const { planProfile } = require('./household.service');
const notificationService = require('./notification.service');
const msg = require('./notification_messages');

const MIN_GAP_MS = 5 * 60 * 1000; // don't re-check the same user more than every 5 minutes
const lastRun = new Map();

// Monday of the week containing d (local)
const mondayOf = (d) => msg.addDays(d, -((d.getDay() + 6) % 7));

// Checks the user's own data and records any notification that is due. Runs when the app asks
// for notifications (no scheduler needed); each event is recorded once thanks to its dedupe key.
class NotificationTriggers {
  async refresh(userId, now = new Date()) {
    const key = String(userId);
    if (now - (lastRun.get(key) || 0) < MIN_GAP_MS) return;
    lastRun.set(key, now.getTime());

    const user = await User.findById(userId).select('onboarding createdAt').lean().exec();
    if (!user) return;
    const prefs = await notificationService.getPrefs(userId);
    const today = msg.dateKey(now);
    const plan = await MealPlan.findOne({ userId, endDate: { $gte: today } }).sort({ createdAt: -1 }).lean().exec();

    await Promise.all([
      prefs.useItUp && this._useItUp(userId, today, now, prefs),
      prefs.shoppingReminder && plan && this._shopping(userId, today, prefs),
      prefs.weeklyReport && this._weekly(userId, user, now, prefs),
      plan && this._planConflict(userId, user, plan, today),
    ]);
  }

  async _useItUp(userId, today, now, prefs) {
    const items = await PantryItem.find({ userId, useBy: { $gte: today, $lte: msg.dateKey(msg.addDays(now, 2)) } })
      .select('name useBy')
      .lean()
      .exec();
    if (items.length) await notificationService.notify(userId, msg.useItUp(items, today), `use_it_up:${today}`, prefs);
  }

  async _shopping(userId, today, prefs) {
    const count = await ShoppingItem.countDocuments({ userId, checked: false }).exec();
    if (count) await notificationService.notify(userId, msg.shoppingReminder(count), `shopping_reminder:${today}`, prefs);
  }

  // last full week (Mon–Sun), only for accounts that existed then and only if something happened
  async _weekly(userId, user, now, prefs) {
    const thisMonday = mondayOf(now);
    const lastMonday = msg.addDays(thisMonday, -7);
    if (user.createdAt && new Date(user.createdAt) >= thisMonday) return;
    const from = msg.dateKey(lastMonday);
    const to = msg.dateKey(msg.addDays(thisMonday, -1));

    const [cooked, plans] = await Promise.all([
      CookLog.countDocuments({ userId, cookedAt: { $gte: lastMonday, $lt: thisMonday } }).exec(),
      MealPlan.find({ userId, startDate: { $lte: to }, endDate: { $gte: from } }).select('days.date days.meals.mealType').lean().exec(),
    ]);
    const planned = plans.reduce(
      (n, p) => n + (p.days || []).filter((d) => d.date >= from && d.date <= to).reduce((m, d) => m + (d.meals?.length || 0), 0),
      0
    );
    if (!cooked && !planned) return;
    await notificationService.notify(userId, msg.weeklyReport({ cooked, planned, weekStart: from }), `weekly_report:${from}`, prefs);
  }

  // REQ-PLAN-08: upcoming meals that the safety filter now rejects (allergies or diet changed,
  // recipe withdrawn). The plan is never rewritten silently; the user decides in the Plan tab.
  async _planConflict(userId, user, plan, today) {
    const unsafe = await mealPlanService._unsafeRecipeIds(plan, await planProfile(userId, user.onboarding || {}));
    if (!unsafe.size) return;
    const meals = plan.days
      .filter((d) => d.date >= today)
      .flatMap((d) => d.meals || [])
      .filter((m) => m.status !== 'cooked' && m.recipeId && unsafe.has(String(m.recipeId)));
    if (!meals.length) return;
    const ids = [...new Set(meals.map((m) => String(m.recipeId)))].sort().join(',');
    const names = [...new Set(meals.map((m) => m.name))];
    await notificationService.notify(userId, msg.planConflict(names), `plan_conflict:${plan._id}:${ids}`);
  }
}

module.exports = new NotificationTriggers();
