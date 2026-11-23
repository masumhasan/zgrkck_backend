const { errorResponse } = require('../utils/response.util');

const errorHandler = (err, req, res, next) => {
  console.error(`Unhandled Error [${req.method}] ${req.url}:`, err);

  // Malformed ids (e.g. /users/not-an-id) are a client error, not a server fault.
  if (err.name === 'CastError') {
    return errorResponse(res, 'Resource not found', 404);
  }

  // unique-index race (e.g. two simultaneous sign-ups with the same email)
  if (err.code === 11000) {
    return errorResponse(res, 'That already exists', 409);
  }

  const statusCode = err.statusCode || 500;
  // never leak internal error text (Mongoose, upstream APIs) to clients
  const message = statusCode >= 500 ? 'Something went wrong on our side. Please try again.' : err.message;

  return errorResponse(res, message, statusCode);
};

module.exports = { errorHandler };

