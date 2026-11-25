const path = require('path');

const AVATAR_FILE = path.join(__dirname, '..', '..', 'user.jpg');

// The photo the user uploaded (Cloudinary URL); accounts without one get the placeholder.
const getAvatarUrl = (req, user) => user?.avatarUrl || `${req.protocol}://${req.get('host')}/assets/user.jpg`;

const initialsOf = (firstName = '', lastName = '') =>
  `${firstName[0] || ''}${lastName[0] || ''}`.toUpperCase();

// Display status shown in the dashboard, derived from stored status + onboarding progress.
const displayStatus = (user) => {
  if (user.status === 'suspended') return 'Suspended';
  if (user.status === 'inactive') return 'Inactive';
  return user.onboardingCompleted ? 'Active' : 'Pending';
};

const mapPlan = (plan, userCount = 0) => ({
  id: String(plan._id),
  name: plan.name,
  cycle: plan.cycle,
  price: plan.price,
  description: plan.description,
  status: plan.status,
  iconType: plan.iconType,
  aiLimit: plan.aiLimit,
  recipeLimit: plan.recipeLimit,
  features: plan.features || [],
  isDefault: Boolean(plan.isDefault),
  userCount,
});

const mapUserSummary = (user, plan, req) => ({
  id: String(user._id),
  name: `${user.firstName} ${user.lastName}`.trim(),
  email: user.email,
  initials: initialsOf(user.firstName, user.lastName),
  avatarUrl: getAvatarUrl(req, user),
  plan: plan ? plan.name : 'Free',
  planId: plan ? String(plan._id) : null,
  status: displayStatus(user),
  joinedAt: user.createdAt,
  lastActiveAt: user.lastActiveAt || user.createdAt,
});

module.exports = {
  AVATAR_FILE,
  getAvatarUrl,
  displayStatus,
  mapPlan,
  mapUserSummary,
};
