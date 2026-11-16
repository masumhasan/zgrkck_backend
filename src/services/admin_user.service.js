const { User, UserStatus } = require('../models/user.model');
const { SubscriptionPlan } = require('../models/subscription_plan.model');
const { MealPlan } = require('../models/plan.model');
const { PantryItem } = require('../models/pantry.model');
const { ShoppingItem } = require('../models/shopping.model');
const { Otp } = require('../models/otp.model');
const { mapUserSummary, displayStatus } = require('../utils/admin_mapper.util');
const { parsePagination, buildPagination, escapeRegex } = require('../utils/pagination.util');
const planService = require('./subscription_plan.service');
const activityService = require('./activity.service');

const httpError = (message, statusCode) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};

const EXPORT_LIMIT = 10000;
// Legacy accounts have no status field, so "active" means "not blocked".
const NOT_BLOCKED = { $nin: [UserStatus.INACTIVE, UserStatus.SUSPENDED] };

class AdminUserService {
  async buildFilter({ search, status, planId }) {
    const filter = { role: 'user' };

    if (search && search.trim()) {
      const rx = new RegExp(escapeRegex(search.trim()), 'i');
      filter.$or = [{ firstName: rx }, { lastName: rx }, { email: rx }];
      // Also match "First Last" typed as a full name.
      const parts = search.trim().split(/\s+/);
      if (parts.length > 1) {
        filter.$or.push({
          $and: [
            { firstName: new RegExp(escapeRegex(parts[0]), 'i') },
            { lastName: new RegExp(escapeRegex(parts.slice(1).join(' ')), 'i') },
          ],
        });
      }
    }

    if (status === 'Active') {
      Object.assign(filter, { status: NOT_BLOCKED, onboardingCompleted: true });
    } else if (status === 'Pending') {
      Object.assign(filter, { status: NOT_BLOCKED, onboardingCompleted: { $ne: true } });
    } else if (status === 'Inactive') {
      filter.status = UserStatus.INACTIVE;
    } else if (status === 'Suspended') {
      filter.status = UserStatus.SUSPENDED;
    }

    if (planId) {
      const defaultPlan = await planService.getDefaultPlan();
      filter.planId =
        defaultPlan && String(defaultPlan._id) === planId ? { $in: [defaultPlan._id, null] } : planId;
    }
    return filter;
  }

  async planLookup() {
    const [plans, defaultPlan] = await Promise.all([
      SubscriptionPlan.find().lean().exec(),
      planService.getDefaultPlan(),
    ]);
    const byId = {};
    plans.forEach((p) => {
      byId[String(p._id)] = p;
    });
    return (user) => byId[String(user.planId)] || defaultPlan;
  }

  async list(query, req) {
    const { page, limit, skip } = parsePagination(query);
    const filter = await this.buildFilter(query);
    const [users, total, planFor] = await Promise.all([
      User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean().exec(),
      User.countDocuments(filter),
      this.planLookup(),
    ]);
    return {
      items: users.map((u) => mapUserSummary(u, planFor(u), req)),
      pagination: buildPagination(page, limit, total),
    };
  }

  async exportCsv(query, req) {
    const filter = await this.buildFilter(query);
    const [users, planFor] = await Promise.all([
      User.find(filter).sort({ createdAt: -1 }).limit(EXPORT_LIMIT).lean().exec(),
      this.planLookup(),
    ]);
    // Neutralise spreadsheet formula injection and escape CSV delimiters.
    const cell = (value) => {
      let text = String(value ?? '');
      if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
      return `"${text.replace(/"/g, '""')}"`;
    };
    const rows = users.map((u) => {
      const s = mapUserSummary(u, planFor(u), req);
      return [s.name, s.email, s.plan, s.status, new Date(s.joinedAt).toISOString().split('T')[0]]
        .map(cell)
        .join(',');
    });
    return ['Name,Email,Plan,Status,Joined', ...rows].join('\n');
  }

  async findUserOrFail(id) {
    const user = await User.findOne({ _id: id, role: 'user' }).lean().exec();
    if (!user) throw httpError('User not found', 404);
    return user;
  }

  async getDetail(id, req) {
    const user = await this.findUserOrFail(id);
    const planFor = await this.planLookup();
    const plan = planFor(user);

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const [plansGenerated, plansThisMonth, mealsAgg, pantryItems, shoppingItems] = await Promise.all([
      MealPlan.countDocuments({ userId: user._id }),
      MealPlan.countDocuments({ userId: user._id, createdAt: { $gte: monthStart } }),
      MealPlan.aggregate([
        { $match: { userId: user._id } },
        {
          $project: {
            n: { $sum: { $map: { input: '$days', as: 'd', in: { $size: { $ifNull: ['$$d.meals', []] } } } } },
          },
        },
        { $group: { _id: null, total: { $sum: '$n' } } },
      ]),
      PantryItem.countDocuments({ userId: user._id }),
      ShoppingItem.countDocuments({ userId: user._id }),
    ]);

    return {
      ...mapUserSummary(user, plan, req),
      productActivity: {
        plansGenerated,
        mealsPlanned: mealsAgg[0]?.total || 0,
        pantryItems,
        shoppingItems,
      },
      usage: {
        aiGenerations: {
          used: plansThisMonth,
          limit: plan ? plan.aiLimit : 0,
          resetAt: nextMonthStart,
        },
        pantryItems: { used: pantryItems },
        shoppingItems: { used: shoppingItems },
        excludedIngredients: { used: (user.onboarding?.specificIngredients || []).length },
      },
    };
  }

  async setStatus(id, status, req) {
    await this.findUserOrFail(id);
    const updated = await User.findByIdAndUpdate(id, { status }, { returnDocument: 'after' })
      .lean()
      .exec();
    const name = `${updated.firstName} ${updated.lastName}`;
    const verb = { active: 'reactivated', inactive: 'blocked', suspended: 'suspended' }[status];
    activityService.log('user_status', `User ${name} ${verb}`);
    const planFor = await this.planLookup();
    return mapUserSummary(updated, planFor(updated), req);
  }

  async setPlan(id, planId, req) {
    await this.findUserOrFail(id);
    const plan = await SubscriptionPlan.findById(planId).lean().exec();
    if (!plan) throw httpError('Plan not found', 404);
    const stored = plan.isDefault ? null : plan._id;
    const updated = await User.findByIdAndUpdate(id, { planId: stored }, { returnDocument: 'after' })
      .lean()
      .exec();
    activityService.log('user_plan', `${updated.firstName} ${updated.lastName} moved to ${plan.name}`);
    return mapUserSummary(updated, plan, req);
  }

  async remove(id) {
    const user = await this.findUserOrFail(id);
    await Promise.all([
      MealPlan.deleteMany({ userId: user._id }),
      PantryItem.deleteMany({ userId: user._id }),
      ShoppingItem.deleteMany({ userId: user._id }),
      Otp.deleteMany({ email: user.email }),
    ]);
    await User.deleteOne({ _id: user._id });
    activityService.log('user_deleted', `User ${user.firstName} ${user.lastName} permanently deleted`);
    return { deleted: true, status: displayStatus(user) };
  }
}

module.exports = new AdminUserService();
