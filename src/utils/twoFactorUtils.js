import bcrypt from 'bcryptjs';
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
