const mongoose = require('mongoose');
const { config } = require('./env');

let isConnected = false;

const connectDB = async () => {
  if (isConnected) return;

  const mongoUri = config.mongodbUri;

  try {
    const conn = await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 8000,
    });
    isConnected = true;
    console.log(`✅ MongoDB Atlas Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`❌ MongoDB Connection Error: ${error.message}`);
    throw error;
  }
};

module.exports = { connectDB };
