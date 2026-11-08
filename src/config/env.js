require('dotenv').config();

const config = {
  port: parseInt(process.env.PORT, 10) || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  mongodbUri:
    process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/mealist_db',
  jwtSecret: process.env.JWT_TOKEN || 'mealist_jwt_secret_dev_key_2026',
  jwtExpiresIn: process.env.JWT_EXPIRES || '7d',
  otpEmail: process.env.OTP_EMAIL || '',
  appPassword: process.env.APP_PASSWORD || '',
  openaiApiKey: process.env.OPENAI_API_KEY || '',
};

module.exports = { config };

