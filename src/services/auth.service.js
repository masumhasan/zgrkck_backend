const bcrypt = require('bcrypt');
const userRepository = require('../repositories/user.repository');
const { Otp } = require('../models/otp.model');
const { generateToken } = require('../utils/token.util');
const { generateOtp } = require('../utils/otp.util');
const { sendOtpEmail } = require('../config/mailer');

class AuthService {
  async register({ firstName, lastName, email, password }) {
    const existing = await userRepository.findByEmail(email);
    if (existing) {
      const error = new Error('A user with this email address already exists');
      error.statusCode = 409;
      throw error;
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = await userRepository.create({
      firstName,
      lastName,
      email,
      password: hashedPassword,
    });

    const token = generateToken({
      id: user._id,
      email: user.email,
      role: user.role,
    });

    return {
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        onboardingCompleted: user.onboardingCompleted,
      },
      token,
    };
  }

  async signIn({ email, password }) {
    const user = await userRepository.findByEmail(email, true);
    if (!user) {
      const error = new Error('Invalid email or password');
      error.statusCode = 401;
      throw error;
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      const error = new Error('Invalid email or password');
      error.statusCode = 401;
      throw error;
    }

    const token = generateToken({
      id: user._id,
      email: user.email,
      role: user.role,
    });

    return {
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        onboardingCompleted: user.onboardingCompleted,
        onboarding: user.onboarding,
      },
      token,
    };
  }

  async requestPasswordReset(email) {
    const user = await userRepository.findByEmail(email);
    if (!user) {
      // Security standard: don't reveal if user exists, return success
      return { sent: true };
    }

    const otpCode = generateOtp(6);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

    await Otp.deleteMany({ email });
    await Otp.create({ email, code: otpCode, expiresAt });

    await sendOtpEmail(email, otpCode);
    return { sent: true };
  }

  async verifyOtp(email, otp) {
    const record = await Otp.findOne({ email, code: otp, consumed: false });
    if (!record || record.expiresAt < new Date()) {
      const error = new Error('Invalid or expired OTP code');
      error.statusCode = 400;
      throw error;
    }
    return { verified: true };
  }

  async resetPassword(email, otp, newPassword) {
    await this.verifyOtp(email, otp);

    const user = await userRepository.findByEmail(email);
    if (!user) {
      const error = new Error('User not found');
      error.statusCode = 404;
      throw error;
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);
    await userRepository.updatePassword(user._id, hashedPassword);

    await Otp.updateOne({ email, code: otp }, { consumed: true });
    return { success: true };
  }
}

module.exports = new AuthService();

