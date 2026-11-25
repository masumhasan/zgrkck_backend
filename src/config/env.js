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
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
    apiKey: process.env.CLOUDINARY_API_KEY || '',
    apiSecret: process.env.CLOUDINARY_API_SECRET || '',
  },
  // USDA FoodData Central downloads used by the nutrition refresh. Foundation Foods is dated:
  // bump USDA_FOUNDATION_URL when USDA publishes a newer release (see fdc.nal.usda.gov/download-datasets).
  usda: {
    srLegacyUrl: process.env.USDA_SR_LEGACY_URL || 'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip',
    foundationUrl: process.env.USDA_FOUNDATION_URL || 'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_foundation_food_csv_2025-12-18.zip',
  },
  adminEmail: (process.env.ADMIN_EMAIL || '').trim().toLowerCase(),
  adminPassword: process.env.ADMIN_PASSWORD || '',
};

module.exports = { config };

