const app = require('../src/app');
const { connectDB } = require('../src/config/database');
const { bootstrapAdminData } = require('../src/services/admin_bootstrap.service');

let initPromise = null;

const ensureInitialized = async () => {
  if (!initPromise) {
    initPromise = (async () => {
      await connectDB();
      await bootstrapAdminData();
    })().catch((err) => {
      initPromise = null;
      throw err;
    });
  }
  return initPromise;
};

module.exports = async (req, res) => {
  if (req.method !== 'OPTIONS' && req.url !== '/health') {
    try {
      await ensureInitialized();
    } catch {
      const origin = req.headers.origin;
      if (origin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
      }
      return res.status(503).json({
        success: false,
        message: 'Database unavailable. Ensure MongoDB Atlas Network Access allows 0.0.0.0/0.',
      });
    }
  }
  return app(req, res);
};
