const { errorResponse } = require('../utils/response.util');

// Minimal in-memory limiter used to slow down credential and OTP guessing.
// shortcut: counters live in this process, so they reset on restart and are not shared across
// instances; move to a shared store (e.g. Redis) before running more than one server.
// keyFn lets OTP routes limit per email (not just per IP) so guesses can't be spread over many IPs.
const createRateLimiter = ({ windowMs = 15 * 60 * 1000, max = 10, keyFn = (req) => req.ip } = {}) => {
  const hits = new Map();

  // drop expired entries so the map can't grow forever
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) if (entry.resetAt <= now) hits.delete(key);
  }, windowMs).unref();

  return (req, res, next) => {
    const now = Date.now();
    const key = keyFn(req);
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
