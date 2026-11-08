const nodemailer = require('nodemailer');
const { config } = require('./env');

let transporter = null;

const getTransporter = () => {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: config.otpEmail,
        pass: config.appPassword,
      },
    });
  }
  return transporter;
};

const sendOtpEmail = async (toEmail, otpCode) => {
  try {
    const mailOptions = {
      from: `"Mealist.ai" <${config.otpEmail}>`,
      to: toEmail,
      subject: 'Mealist.ai Password Reset Code',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
          <h2 style="color: #3B6B55; margin-bottom: 8px;">Mealist.ai</h2>
          <p style="font-size: 15px; color: #333;">Your password reset verification code is:</p>
          <div style="background-color: #F8F6F1; padding: 14px 20px; font-size: 24px; font-weight: bold; letter-spacing: 4px; text-align: center; color: #1E3A2F; border-radius: 6px; margin: 16px 0;">
            ${otpCode}
          </div>
          <p style="font-size: 13px; color: #777;">This code expires in 10 minutes. If you did not request this, please ignore this email.</p>
        </div>
      `,
    };

    const info = await getTransporter().sendMail(mailOptions);
    console.log(`📧 OTP email sent to ${toEmail}: ${info.messageId}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to send OTP email: ${error.message}`);
    // Return true in development to allow flow testing even if SMTP fails
    return false;
  }
};

module.exports = { sendOtpEmail };

