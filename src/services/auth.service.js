const crypto = require('crypto');
const bcrypt = require('bcrypt');
const userRepository = require('../repositories/user.repository');
const { Otp } = require('../models/otp.model');
const { generateToken } = require('../utils/token.util');
const { generateOtp } = require('../utils/otp.util');
const { sendOtpEmail } = require('../config/mailer');
const activityService = require('./activity.service');
const { User, UserStatus } = require('../models/user.model');

const MAX_OTP_ATTEMPTS = 5;
// bump when the Terms & Privacy text changes so we know which version each user accepted
const TERMS_VERSION = '2026-11';
// OTPs are stored hashed so a database leak doesn't expose live reset codes
const hashOtp = (code) => crypto.createHash('sha256').update(String(code)).digest('hex');

class AuthService {
  async register({ firstName, lastName, email, password, marketingOptIn = false }) {
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
      // the validator guarantees acceptTerms === true before we get here
      consents: {
        termsVersion: TERMS_VERSION,
        termsAcceptedAt: new Date(),
        marketingOptIn: Boolean(marketingOptIn),
        marketingUpdatedAt: new Date(),
      },
    });

    const token = generateToken({
      id: user._id,
      email: user.email,
      role: user.role,
    });

    activityService.log(
      'user_registered',
      `New user registered: ${user.firstName} ${user.lastName}`
    );

    return {
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        onboardingCompleted: user.onboardingCompleted,
        personalInfoCompleted: user.personalInfoCompleted || false,
        personalInfo: user.personalInfo || {},
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

    if (user.status && user.status !== UserStatus.ACTIVE) {
      const error = new Error('Your account has been suspended. Please contact support.');
      error.statusCode = 403;
      throw error;
    }

    User.updateOne({ _id: user._id }, { lastActiveAt: new Date() }).exec().catch(() => {});

    const token = generateToken({
      id: user._id,
      email: user.email,
      role: user.role,
    });

    const pInfo = user.personalInfo || {};
    const hasAllPersonalInfo = Boolean(
      pInfo.age != null &&
      pInfo.height != null &&
      pInfo.weight != null &&
      pInfo.gender
    );
    const personalInfoDone = Boolean(user.personalInfoCompleted || hasAllPersonalInfo);

    if (hasAllPersonalInfo && !user.personalInfoCompleted) {
      userRepository.updatePersonalInfo(user._id, pInfo).catch((err) =>
        console.error('Failed to sync personalInfoCompleted flag:', err.message)
      );
    }

    return {
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        onboardingCompleted: user.onboardingCompleted,
        personalInfoCompleted: personalInfoDone,
        personalInfo: pInfo,
        onboarding: user.onboarding || {},
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
    await Otp.create({ email, code: hashOtp(otpCode), expiresAt });

    await sendOtpEmail(email, otpCode);
    return { sent: true };
  }

  // Returns the matching OTP record. Wrong guesses are counted; after MAX_OTP_ATTEMPTS the code is burned.
  async _checkOtp(email, otp) {
    const invalid = () => Object.assign(new Error('Invalid or expired OTP code'), { statusCode: 400 });
    const record = await Otp.findOne({ email, consumed: false });
    if (!record || record.expiresAt < new Date() || record.attempts >= MAX_OTP_ATTEMPTS) throw invalid();
    const a = Buffer.from(record.code);
    const b = Buffer.from(hashOtp(otp));
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      await Otp.updateOne({ _id: record._id }, { $inc: { attempts: 1 } });
      throw invalid();
    }
    return record;
  }

  async verifyOtp(email, otp) {
    await this._checkOtp(email, otp);
    return { verified: true };
  }

  async resetPassword(email, otp, newPassword) {
    const record = await this._checkOtp(email, otp);

    const user = await userRepository.findByEmail(email);
    if (!user) {
      // same answer as a bad code, so this route doesn't reveal which emails have accounts
      throw Object.assign(new Error('Invalid or expired OTP code'), { statusCode: 400 });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);
    await userRepository.updatePassword(user._id, hashedPassword);

    await Otp.updateOne({ _id: record._id }, { consumed: true });
    return { success: true };
  }
}

module.exports = new AuthService();

