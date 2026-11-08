const Joi = require('joi');

const registerSchema = Joi.object({
  firstName: Joi.string().trim().max(50).required(),
  lastName: Joi.string().trim().max(50).required(),
  email: Joi.string().email().trim().lowercase().required(),
  password: Joi.string().min(8).required(),
  confirmPassword: Joi.string().valid(Joi.ref('password')).required().messages({
    'any.only': 'Confirm password must match password',
  }),
});

const signInSchema = Joi.object({
  email: Joi.string().email().trim().lowercase().required(),
  password: Joi.string().required(),
});

const forgotPasswordSchema = Joi.object({
  email: Joi.string().email().trim().lowercase().required(),
});

const verifyOtpSchema = Joi.object({
  email: Joi.string().email().trim().lowercase().required(),
  otp: Joi.string().length(6).required(),
});

const resetPasswordSchema = Joi.object({
  email: Joi.string().email().trim().lowercase().required(),
  otp: Joi.string().length(6).required(),
  newPassword: Joi.string().min(8).required(),
});

module.exports = {
  registerSchema,
  signInSchema,
  forgotPasswordSchema,
  verifyOtpSchema,
  resetPasswordSchema,
};

