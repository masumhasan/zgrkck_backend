const { errorResponse } = require('../utils/response.util');

const errorHandler = (err, req, res, next) => {
  console.error(`Unhandled Error [${req.method}] ${req.url}:`, err);

  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal server error';

  return errorResponse(res, message, statusCode);
};

module.exports = { errorHandler };

