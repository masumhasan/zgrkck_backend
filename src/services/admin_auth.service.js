const bcrypt = require('bcrypt');
const { User, UserRole, UserStatus } = require('../models/user.model');
const { generateToken } = require('../utils/token.util');
const { getAvatarUrl } = require('../utils/admin_mapper.util');

const httpError = (message, statusCode) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};

const mapAdmin = (admin, req) => ({
  id: String(admin._id),
  name: `${admin.firstName} ${admin.lastName}`.trim(),
  email: admin.email,
  role: 'Super Admin',
  avatarUrl: getAvatarUrl(req),
  notifications: {
    safetyAlerts: admin.adminPreferences?.notifications?.safetyAlerts ?? true,
    recipeReviewAlerts: admin.adminPreferences?.notifications?.recipeReviewAlerts ?? true,
    systemAlerts: admin.adminPreferences?.notifications?.systemAlerts ?? false,
  },
});

class AdminAuthService {
  async login({ email, password }, req) {
    const admin = await User.findOne({ email }).select('+password').exec();
    const valid =
      admin &&
      admin.role === UserRole.ADMIN &&
      (await bcrypt.compare(password, admin.password));
    if (!valid) throw httpError('Invalid admin credentials', 401);
    if (admin.status !== UserStatus.ACTIVE) throw httpError('This admin account is disabled', 403);

    admin.lastActiveAt = new Date();
    await admin.save();

    const token = generateToken({ id: admin._id, email: admin.email, role: admin.role });
    return { token, admin: mapAdmin(admin, req) };
  }

  async getProfile(adminId, req) {
    const admin = await User.findById(adminId).lean().exec();
    if (!admin) throw httpError('Admin not found', 404);
    return mapAdmin(admin, req);
  }

  async updateProfile(adminId, { name, email }, req) {
    const [firstName, ...rest] = name.trim().split(/\s+/);
    const taken = await User.exists({ email, _id: { $ne: adminId } });
    if (taken) throw httpError('That email address is already in use', 409);

    const admin = await User.findByIdAndUpdate(
      adminId,
      { firstName, lastName: rest.join(' '), email },
      { returnDocument: 'after', runValidators: true }
    )
      .lean()
      .exec();
    return mapAdmin(admin, req);
  }

  async updateNotifications(adminId, prefs, req) {
    const $set = {};
    Object.entries(prefs).forEach(([key, value]) => {
      $set[`adminPreferences.notifications.${key}`] = value;
    });
    const admin = await User.findByIdAndUpdate(adminId, { $set }, { returnDocument: 'after' })
      .lean()
      .exec();
    return mapAdmin(admin, req);
  }

  async changePassword(adminId, { currentPassword, newPassword }) {
    const admin = await User.findById(adminId).select('+password').exec();
    if (!admin) throw httpError('Admin not found', 404);
    if (!(await bcrypt.compare(currentPassword, admin.password))) {
      throw httpError('Current password is incorrect', 400);
    }
    admin.password = await bcrypt.hash(newPassword, 10);
    await admin.save();
    return { success: true };
  }
}

module.exports = new AdminAuthService();
