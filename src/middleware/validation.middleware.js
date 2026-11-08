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

module.exports = { validate };

