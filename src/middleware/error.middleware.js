const { errorResponse } = require('../utils/response.util');

const errorHandler = (err, req, res, next) => {
  console.error(`Unhandled Error [${req.method}] ${req.url}:`, err);

  // Malformed ids (e.g. /users/not-an-id) are a client error, not a server fault.
  if (err.name === 'CastError') {
    return errorResponse(res, 'Resource not found', 404);
  }

  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal server error';

  return errorResponse(res, message, statusCode);
};

module.exports = { errorHandler };

