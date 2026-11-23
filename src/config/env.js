require('dotenv').config();

const nodeEnv = process.env.NODE_ENV || 'development';
if (nodeEnv === 'production' && !process.env.JWT_TOKEN) {
  throw new Error('JWT_TOKEN must be set in production');
}

const config = {
  port: parseInt(process.env.PORT, 10) || 5000,
  nodeEnv,
  // comma-separated allowed browser origins for the dashboard; empty = allow all (dev)
  corsOrigins: (process.env.CORS_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean),
  // set to 1 when behind a reverse proxy so rate limits see the real client IP
  trustProxy: process.env.TRUST_PROXY || '',
  mongodbUri:
    process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/mealist_db',
  jwtSecret: process.env.JWT_TOKEN || 'mealist_jwt_secret_dev_key_2026',
  jwtExpiresIn: process.env.JWT_EXPIRES || '7d',
  otpEmail: process.env.OTP_EMAIL || '',
  appPassword: process.env.APP_PASSWORD || '',
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  adminEmail: (process.env.ADMIN_EMAIL || '').trim().toLowerCase(),
  adminPassword: process.env.ADMIN_PASSWORD || '',
};

module.exports = { config };

