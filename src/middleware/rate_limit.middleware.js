const { errorResponse } = require('../utils/response.util');

// Minimal in-memory limiter (per client IP) used to slow down credential guessing.
const createRateLimiter = ({ windowMs = 15 * 60 * 1000, max = 10 } = {}) => {
  const hits = new Map();

  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip;
    const entry = hits.get(key);

    if (!entry || entry.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    entry.count += 1;
    if (entry.count > max) {
      return errorResponse(res, 'Too many attempts. Please try again later.', 429);
    }
    return next();
  };
};

module.exports = { createRateLimiter };
