const bcrypt = require('bcrypt');
const { User, UserRole, UserStatus } = require('../models/user.model');
const { SubscriptionPlan } = require('../models/subscription_plan.model');
const { config } = require('../config/env');

// Every user needs a plan, so a default free tier must always exist.
const ensureDefaultPlan = async () => {
  const existing = await SubscriptionPlan.findOne({ isDefault: true }).lean().exec();
  if (existing) return existing;
  return SubscriptionPlan.create({
    name: 'Free',
    cycle: 'Monthly',
    price: 0,
    description: 'Basic meal planning with standard catalog access',
    status: 'Active',
    iconType: 'leaf',
    aiLimit: 100,
    recipeLimit: '25',
    features: ['Basic Recipe Catalog', 'Weekly Plan Preview'],
    isDefault: true,
  });
};

// Creates the admin account from ADMIN_EMAIL / ADMIN_PASSWORD when none exists yet.
// An existing admin is never overwritten, so passwords changed in Settings persist.
const ensureAdminAccount = async () => {
  const { adminEmail, adminPassword } = config;
  if (!adminEmail || !adminPassword) {
    console.warn('⚠️  ADMIN_EMAIL / ADMIN_PASSWORD not set — dashboard login is disabled.');
    return null;
  }

  const hasAdmin = await User.exists({ role: UserRole.ADMIN });
  if (hasAdmin) return null;

  const hashed = await bcrypt.hash(adminPassword, 10);
  const existing = await User.findOne({ email: adminEmail }).exec();
  if (existing) {
    existing.role = UserRole.ADMIN;
    existing.password = hashed;
    existing.status = UserStatus.ACTIVE;
    return existing.save();
  }

  const admin = await User.create({
    firstName: 'Admin',
    lastName: 'User',
    email: adminEmail,
    password: hashed,
    role: UserRole.ADMIN,
    onboardingCompleted: true,
  });
  console.log(`✅ Admin account created for ${adminEmail}`);
  return admin;
};

const bootstrapAdminData = async () => {
  await ensureDefaultPlan();
  await ensureAdminAccount();
};

module.exports = { bootstrapAdminData, ensureDefaultPlan };
