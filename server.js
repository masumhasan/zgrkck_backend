const app = require('./src/app');
const { connectDB } = require('./src/config/database');
const { config } = require('./src/config/env');

const startServer = async () => {
  await connectDB();

  const server = app.listen(config.port, () => {
    console.log(
      `🚀 Mealist Backend running in ${config.nodeEnv} mode on http://localhost:${config.port}`
    );
  });

  const gracefulShutdown = () => {
    console.log('Stopping server gracefully...');
    server.close(() => {
      console.log('HTTP server closed.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', gracefulShutdown);
  process.on('SIGINT', gracefulShutdown);
};

startServer();

