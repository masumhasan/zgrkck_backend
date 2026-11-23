const express = require('express');
const authController = require('../controllers/auth.controller');
const { validate } = require('../middleware/validation.middleware');
const {
  registerSchema,
  signInSchema,
  forgotPasswordSchema,
  verifyOtpSchema,
  resetPasswordSchema,
} = require('../validators/auth.validator');
const { createRateLimiter } = require('../middleware/rate_limit.middleware');

const router = express.Router();

// per IP for credential routes; per email for OTP routes so guesses can't be spread across IPs
const byIp = createRateLimiter({ max: 20 });
const byEmail = (max) =>
  createRateLimiter({ max, keyFn: (req) => `${req.ip}:${String(req.body?.email || '').toLowerCase()}` });
const otpByEmail = createRateLimiter({ max: 10, keyFn: (req) => String(req.body?.email || '').toLowerCase() || req.ip });

router.post(
  '/register',
  byIp,
  validate(registerSchema),
  authController.register.bind(authController)
);

router.post(
  '/signin',
  byIp,
  validate(signInSchema),
  authController.signIn.bind(authController)
);

router.post(
  '/forgot-password',
  byEmail(5),
  validate(forgotPasswordSchema),
  authController.forgotPassword.bind(authController)
);

router.post(
  '/verify-otp',
  otpByEmail,
  validate(verifyOtpSchema),
  authController.verifyOtp.bind(authController)
);

router.post(
  '/reset-password',
  otpByEmail,
  validate(resetPasswordSchema),
  authController.resetPassword.bind(authController)
);

module.exports = router;

