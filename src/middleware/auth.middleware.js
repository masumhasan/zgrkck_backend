const { verifyToken } = require('../utils/token.util');
const { errorResponse } = require('../utils/response.util');
const { User, UserStatus } = require('../models/user.model');

const authGuard = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return errorResponse(res, 'Authentication token required', 401);
  }

  const token = authHeader.split(' ')[1];
  const decoded = verifyToken(token);

  if (!decoded) {
    return errorResponse(res, 'Invalid or expired token', 401);
  }

  try {
    // Re-check the account so suspension/deletion revokes access immediately.
    const account = await User.findById(decoded.id).select('status role').lean().exec();
    if (!account) {
      return errorResponse(res, 'Account no longer exists', 401);
    }
    if (account.status && account.status !== UserStatus.ACTIVE) {
      return errorResponse(res, 'Your account has been suspended', 403);
    }
    req.user = { ...decoded, role: account.role };
  } catch (err) {
    return next(err);
  }
  next();
};

const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return errorResponse(res, 'Access forbidden: Insufficient permissions', 403);
    }
    next();
  };
};

const optionalAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);
    if (decoded) {
      req.user = decoded;
    }
  }
  next();
};

module.exports = { authGuard, requireRole, optionalAuth };

