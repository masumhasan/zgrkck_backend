const bcrypt = require('bcrypt');
const { User, UserRole } = require('../models/user.model');
const { MealPlan } = require('../models/plan.model');
const { PantryItem } = require('../models/pantry.model');
const { ShoppingItem } = require('../models/shopping.model');
const { HouseholdMember } = require('../models/household_member.model');
const { CookLog } = require('../models/cook_log.model');
const { Notification } = require('../models/notification.model');
const { Recipe } = require('../models/recipe.model');
const { Otp } = require('../models/otp.model');

const httpError = (message, statusCode) => Object.assign(new Error(message), { statusCode });

// Everything that belongs to one account. Shared by self-service deletion and the admin dashboard.
// shortcut: the Cloudinary avatar file is not destroyed (needs a signed destroy call); the user row and its
// URL are removed. Upgrade when avatars must be purged from Cloudinary as well.
const purgeUserData = async (user) => {
  await Promise.all([
    MealPlan.deleteMany({ userId: user._id }),
    PantryItem.deleteMany({ userId: user._id }),
    ShoppingItem.deleteMany({ userId: user._id }),
    HouseholdMember.deleteMany({ userId: user._id }),
    CookLog.deleteMany({ userId: user._id }),
    Notification.deleteMany({ userId: user._id }),
    Recipe.deleteMany({ createdBy: user._id }), // their own / imported recipes, never catalogue ones
    Otp.deleteMany({ email: user.email }),
  ]);
  await User.deleteOne({ _id: user._id });
};

// 400, not 401/403: the app treats those as "session expired" and would sign the user out on a typo
const verified = async (userId, password) => {
  const user = await User.findById(userId).select('+password').exec();
  if (!user) throw httpError('Account not found', 404);
  if (!(await bcrypt.compare(password, user.password))) throw httpError('Your password is incorrect', 400);
  return user;
};

const changePassword = async (userId, { currentPassword, newPassword }) => {
  const user = await verified(userId, currentPassword);
  user.password = await bcrypt.hash(newPassword, await bcrypt.genSalt(10));
  await user.save();
  return { changed: true };
};

const deleteAccount = async (userId, { password }) => {
  const user = await verified(userId, password);
  if (user.role === UserRole.ADMIN) throw httpError('Admin accounts cannot be deleted here', 400);
  await purgeUserData(user);
  return { deleted: true };
};

module.exports = { changePassword, deleteAccount, purgeUserData };
