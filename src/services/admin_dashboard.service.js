const { User } = require('../models/user.model');
const { Recipe } = require('../models/recipe.model');
const { MealPlan } = require('../models/plan.model');
const { PantryItem } = require('../models/pantry.model');
const { ShoppingItem } = require('../models/shopping.model');
const { SubscriptionPlan } = require('../models/subscription_plan.model');
const { mapUserSummary } = require('../utils/admin_mapper.util');
const planService = require('./subscription_plan.service');

// Normalise any billing cycle to a monthly amount.
const monthlyValue = (plan) => {
  if (!plan) return 0;
  if (plan.cycle === 'Yearly') return plan.price / 12;
  if (plan.cycle === 'Quarterly') return plan.price / 3;
  return plan.price;
};

class AdminDashboardService {
  async revenueSnapshot() {
    const [plans, counts] = await Promise.all([
      SubscriptionPlan.find().lean().exec(),
      planService.userCounts(),
    ]);
    let subscribers = 0;
    let monthlyRevenue = 0;
    plans.forEach((p) => {
      if (p.price > 0) {
        const n = counts[String(p._id)] || 0;
        subscribers += n;
        monthlyRevenue += n * monthlyValue(p);
      }
    });
    return { subscribers, monthlyRevenue: Math.round(monthlyRevenue * 100) / 100 };
  }

  async getOverview(req) {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [totalUsers, totalRecipes, activeUsers, newThisWeek, recentUsers, revenue, defaultPlan] =
      await Promise.all([
        User.countDocuments({ role: 'user' }),
        Recipe.countDocuments(),
        User.countDocuments({ role: 'user', status: { $nin: ['inactive', 'suspended'] } }),
        User.countDocuments({ role: 'user', createdAt: { $gte: weekAgo } }),
        User.find({ role: 'user' }).sort({ createdAt: -1 }).limit(3).lean().exec(),
        this.revenueSnapshot(),
        planService.getDefaultPlan(),
      ]);

    const plans = await SubscriptionPlan.find().lean().exec();
    const byId = Object.fromEntries(plans.map((p) => [String(p._id), p]));

    return {
      totalUsers,
      totalRecipes,
      totalSubscribers: revenue.subscribers,
      monthlyRevenue: revenue.monthlyRevenue,
      activeUsers,
      newThisWeek,
      recentUsers: recentUsers.map((u) => mapUserSummary(u, byId[String(u.planId)] || defaultPlan, req)),
    };
  }

  async getUsageOverview() {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [plansThisMonth, plansTotal, pantryItems, shoppingItems, totalUsers, revenue] = await Promise.all([
      MealPlan.countDocuments({ createdAt: { $gte: monthStart } }),
      MealPlan.countDocuments(),
      PantryItem.countDocuments(),
      ShoppingItem.countDocuments(),
      User.countDocuments({ role: 'user' }),
      this.revenueSnapshot(),
    ]);

    const usersWithPlansThisMonth = (
      await MealPlan.distinct('userId', { createdAt: { $gte: monthStart } })
    ).length;

    return {
      mealPlansThisMonth: plansThisMonth,
      mealPlansTotal: plansTotal,
      usersGeneratingThisMonth: usersWithPlansThisMonth,
      totalUsers,
      pantryItems,
      shoppingItems,
      monthlyRunRate: revenue.monthlyRevenue,
      subscribers: revenue.subscribers,
    };
  }
}

module.exports = new AdminDashboardService();
