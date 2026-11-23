const { errorResponse } = require('../utils/response.util');

const validate = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const details = error.details.map((item) => item.message);
      return errorResponse(res, 'Validation error', 400, details);
    }

    req.body = value;
    next();
  };
};

// same contract for route params (e.g. ids); req.params is left as-is, only checked
const validateParams = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.params, { abortEarly: false, allowUnknown: true });
    if (error) {
      const details = error.details.map((item) => item.message);
      return errorResponse(res, 'Validation error', 400, details);
    }
    next();
  };
};

module.exports = { validate, validateParams };
