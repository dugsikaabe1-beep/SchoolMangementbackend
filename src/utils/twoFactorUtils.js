import bcrypt from 'bcryptjs';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import { sendOTPEmail as sendOTPEmailFromService } from './emailService.js';

/**
 * Generate a 6-digit numeric OTP
 */
export const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * Hash the OTP for secure storage
 */
export const hashOTP = async (otp) => {
  const salt = await bcrypt.genSalt(10);
  return await bcrypt.hash(otp, salt);
};

/**
 * Verify OTP against hashed version
 */
export const verifyOTP = async (otp, hashedOtp) => {
  return await bcrypt.compare(otp, hashedOtp);
};

/**
 * Send OTP via email using shared email service
 */
export const sendOTPEmail = async (email, otp, user) => {
  return await sendOTPEmailFromService(email, otp, user);
};

/**
 * Generate TOTP secret for MFA
 */
export const generateTOTPSecret = (user) => {
  return speakeasy.generateSecret({
    name: `SchoolERP:${user.email || user.customId}`,
    issuer: 'School ERP',
    length: 32
  });
};

/**
 * Generate QR code for TOTP setup
 */
export const generateTOTPQRCode = async (secret) => {
  try {
    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url, {
      width: 200,
      margin: 1,
      color: {
        dark: '#1e293b',
        light: '#ffffff'
      }
    });
    return qrCodeUrl;
  } catch (error) {
    console.error('Error generating QR code:', error);
    throw new Error('Failed to generate QR code');
  }
};

/**
 * Verify TOTP token
 */
export const verifyTOTP = (token, secret) => {
  return speakeasy.totp.verify({
    secret: secret,
    encoding: 'base32',
    token: token,
    window: 2 // Allow 2 time steps before/after for clock skew
  });
};

/**
 * Generate backup codes for MFA
 */
export const generateBackupCodes = (count = 10) => {
  const codes = [];
  for (let i = 0; i < count; i++) {
    codes.push(speakeasy.generateSecret({ length: 20 }).base32);
  }
  return codes;
};

/**
 * Hash backup codes for secure storage
 */
export const hashBackupCodes = async (codes) => {
  const salt = await bcrypt.genSalt(10);
  const hashedCodes = await Promise.all(
    codes.map(code => bcrypt.hash(code, salt))
  );
  return hashedCodes;
};

/**
 * Verify backup code
 */
export const verifyBackupCode = async (code, hashedCodes) => {
  for (const hashedCode of hashedCodes) {
    if (await bcrypt.compare(code, hashedCode)) {
      return true;
    }
  }
  return false;
};
