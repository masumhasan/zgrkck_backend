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

const router = express.Router();

router.post(
  '/register',
  validate(registerSchema),
  authController.register.bind(authController)
);

router.post(
  '/signin',
  validate(signInSchema),
  authController.signIn.bind(authController)
);

router.post(
  '/forgot-password',
  validate(forgotPasswordSchema),
  authController.forgotPassword.bind(authController)
);

router.post(
  '/verify-otp',
  validate(verifyOtpSchema),
  authController.verifyOtp.bind(authController)
);

router.post(
  '/reset-password',
  validate(resetPasswordSchema),
  authController.resetPassword.bind(authController)
);

module.exports = router;

