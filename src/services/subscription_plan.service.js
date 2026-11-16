const { SubscriptionPlan } = require('../models/subscription_plan.model');
const { User } = require('../models/user.model');
const { mapPlan } = require('../utils/admin_mapper.util');
const activityService = require('./activity.service');

const httpError = (message, statusCode) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};

const translateDuplicate = (err) => {
  if (err.code === 11000) return httpError('A plan with this name already exists', 409);
  return err;
};

class SubscriptionPlanService {
  async getDefaultPlan() {
    return SubscriptionPlan.findOne({ isDefault: true }).lean().exec();
  }

  // Users without an explicit plan belong to the default (free) plan.
  async userCounts() {
    const [rows, defaultPlan] = await Promise.all([
      User.aggregate([
        { $match: { role: 'user' } },
        { $group: { _id: '$planId', count: { $sum: 1 } } },
      ]),
      this.getDefaultPlan(),
    ]);
    const counts = {};
    rows.forEach((r) => {
      const key = r._id ? String(r._id) : String(defaultPlan?._id);
      counts[key] = (counts[key] || 0) + r.count;
    });
    return counts;
  }

  async list() {
    const [plans, counts] = await Promise.all([
      SubscriptionPlan.find().sort({ isDefault: -1, price: 1, createdAt: 1 }).lean().exec(),
      this.userCounts(),
    ]);
    return plans.map((p) => mapPlan(p, counts[String(p._id)] || 0));
  }

  async create(data) {
    try {
      const plan = await SubscriptionPlan.create(data);
      activityService.log('plan_created', `Subscription plan "${plan.name}" created`);
      return mapPlan(plan.toObject(), 0);
    } catch (err) {
      throw translateDuplicate(err);
    }
  }

  async update(id, data) {
    let plan;
    try {
      plan = await SubscriptionPlan.findByIdAndUpdate(id, data, {
        returnDocument: 'after',
        runValidators: true,
      })
        .lean()
        .exec();
    } catch (err) {
      throw translateDuplicate(err);
    }
    if (!plan) throw httpError('Plan not found', 404);
    activityService.log('plan_updated', `Subscription plan "${plan.name}" updated`);
    const counts = await this.userCounts();
    return mapPlan(plan, counts[String(plan._id)] || 0);
  }
}

module.exports = new SubscriptionPlanService();
