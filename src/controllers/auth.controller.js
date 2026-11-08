const authService = require('../services/auth.service');
const { successResponse, errorResponse } = require('../utils/response.util');

class AuthController {
  async register(req, res, next) {
    try {
      const result = await authService.register(req.body);
      return successResponse(res, result, 'User registered successfully', 201);
    } catch (err) {
      next(err);
    }
  }

  async signIn(req, res, next) {
    try {
      const result = await authService.signIn(req.body);
      return successResponse(res, result, 'Signed in successfully');
    } catch (err) {
      next(err);
    }
  }

  async forgotPassword(req, res, next) {
    try {
      const result = await authService.requestPasswordReset(req.body.email);
      return successResponse(res, result, 'Verification code sent to your email');
    } catch (err) {
      next(err);
    }
  }

  async verifyOtp(req, res, next) {
    try {
      const result = await authService.verifyOtp(req.body.email, req.body.otp);
      return successResponse(res, result, 'OTP verified successfully');
    } catch (err) {
      next(err);
    }
  }

  async resetPassword(req, res, next) {
    try {
      const { email, otp, newPassword } = req.body;
      const result = await authService.resetPassword(email, otp, newPassword);
      return successResponse(res, result, 'Password reset successfully');
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new AuthController();

