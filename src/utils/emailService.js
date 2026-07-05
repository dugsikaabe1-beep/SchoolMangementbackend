import { Resend } from 'resend';
import crypto from 'crypto';
import { logAction } from './auditLogger.js';
import EmailLog from '../models/EmailLog.js';
import {
  getVerificationEmailTemplate,
  getPasswordResetEmailTemplate,
  getOTPEmailTemplate,
  getSecurityAlertEmailTemplate,
} from './emailTemplates.js';

/**
 * Email Provider Interface
 * Defines the contract all email providers must implement
 */
class EmailProvider {
  constructor() {
    if (this.constructor === EmailProvider) {
      throw new Error('EmailProvider is an abstract class and cannot be instantiated directly');
    }
  }

  async sendEmail(options) {
    throw new Error('sendEmail method must be implemented');
  }

  async checkConnection() {
    throw new Error('checkConnection method must be implemented');
  }

  getProviderName() {
    throw new Error('getProviderName method must be implemented');
  }
}

/**
 * Resend Email Provider Implementation
 */
class ResendEmailProvider extends EmailProvider {
  constructor() {
    super();
    this.apiKey = process.env.RESEND_API_KEY;
    this.resend = null;
    this.initialized = false;
  }

  initialize() {
    if (this.initialized) return;

    console.log('[ResendProvider] Initializing...');
    if (!this.apiKey || !this.apiKey.startsWith('re_')) {
      throw new Error('Invalid or missing RESEND_API_KEY');
    }

    this.resend = new Resend(this.apiKey);
    this.initialized = true;
    console.log('[ResendProvider] âœ… Initialized successfully');
  }

  getProviderName() {
    return 'resend';
  }

  async checkConnection() {
    try {
      this.initialize();
      const { error } = await this.resend.apiKeys.list();
      if (error) {
        console.error('[ResendProvider] Connection check failed:', error);
        return { ok: false, error: error.message };
      }
      return { ok: true };
    } catch (error) {
      console.error('[ResendProvider] Connection check error:', error);
      return { ok: false, error: error.message };
    }
  }

  async sendEmail(options) {
    this.initialize();

    const from = process.env.EMAIL_FROM || 'DugsiKabe <noreply@dugsikabe.com>';
    const replyTo = process.env.EMAIL_REPLY_TO || from;

    const params = {
      from: from,
      to: options.email.trim(),
      subject: options.subject,
      html: options.html,
      text: options.text,
      reply_to: replyTo,
    };

    console.log('[ResendProvider] Sending email...');

    const result = await this.resend.emails.send(params);

    if (result.error) {
      console.error('[ResendProvider] Failed to send email:', result.error);
      throw this._parseResendError(result.error);
    }

    console.log('[ResendProvider] âœ… Email sent successfully, ID:', result.data.id);
    return { success: true, messageId: result.data.id, data: result.data };
  }

  _parseResendError(error) {
    const errorMap = {
      invalid_api_key: new Error('Invalid Resend API Key'),
      unauthorized: new Error('Unauthorized: Check your Resend API Key'),
      not_found: new Error('Resource not found'),
      rate_limit_exceeded: new Error('Rate limit exceeded: Please try again later'),
      invalid_from_address: new Error('Invalid sender email address'),
      missing_required_fields: new Error('Missing required email fields'),
      validation_error: new Error('Email validation failed'),
    };

    if (error.type && errorMap[error.type]) {
      return errorMap[error.type];
    }

    return new Error(error.message || 'Unknown Resend error');
  }
}

let emailProvider = null;

const getEmailProvider = () => {
  if (!emailProvider) {
    emailProvider = new ResendEmailProvider();
  }
  return emailProvider;
};

const parseAddress = (value, fallbackEmail = 'noreply@dugsikabe.com') => {
  const raw = (value || fallbackEmail || '').trim();
  const match = raw.match(/^(.*?)<([^>]+)>$/);
  if (match) {
    return { name: match[1].replace(/"/g, '').trim() || 'DugsiKabe', address: match[2].trim() };
  }
  return { name: process.env.EMAIL_FROM_NAME || 'DugsiKabe', address: raw };
};

const createEmailLog = async ({ to, from, replyTo, subject, type, provider, metadata }) => {
  try {
    return await EmailLog.create({
      to,
      from,
      replyTo,
      subject,
      type,
      provider,
      status: 'queued',
      metadata,
    });
  } catch (error) {
    console.error('[EmailService] Failed to create email log:', error.message);
    return null;
  }
};

const updateEmailLog = async (emailLog, updates) => {
  if (!emailLog?._id) return;
  try {
    await EmailLog.findByIdAndUpdate(emailLog._id, updates);
  } catch (error) {
    console.error('[EmailService] Failed to update email log:', error.message);
  }
};

export const validateEmailDeliveryConfig = () => {
  const issues = [];
  const provider = getEmailProvider();

  if (!process.env.RESEND_API_KEY) {
    issues.push('RESEND_API_KEY is required');
  }

  if (!process.env.EMAIL_FROM) {
    issues.push('EMAIL_FROM is required');
  }

  return {
    ok: issues.length === 0,
    issues,
    provider: provider.getProviderName(),
    requiredDnsRecords: {
      spf: 'v=spf1 include:resend.com ~all',
      dkim: 'Publish DKIM record provided by Resend',
      dmarc: 'v=DMARC1; p=quarantine; rua=mailto:postmaster@yourdomain.com',
    },
  };
};

const sendEmail = async (options) => {
  const provider = getEmailProvider();
  const fromAddress = parseAddress(process.env.EMAIL_FROM || 'DugsiKabe <noreply@dugsikabe.com>');
  const from = `"${fromAddress.name}" <${fromAddress.address}>`;
  const replyAddress = parseAddress(process.env.EMAIL_REPLY_TO || from);
  const replyTo = `"${replyAddress.name}" <${replyAddress.address}>`;
  const to = options.email.trim();
  const type = options.type || 'GENERAL';

  const emailLog = await createEmailLog({
    to,
    from,
    replyTo,
    subject: options.subject,
    type,
    provider: provider.getProviderName(),
    metadata: options.metadata,
  });

  try {
    const result = await provider.sendEmail(options);

    await updateEmailLog(emailLog, {
      status: 'sent',
      messageId: result.messageId,
      sentAt: new Date(),
      response: result,
    });

    return result;
  } catch (error) {
    await updateEmailLog(emailLog, {
      status: 'failed',
      error: error.message,
    });
    console.error('[EmailService] Failed to send email:', error);
    throw error;
  }
};

export const sendVerificationEmail = async (user, token) => {
  const frontendBase = process.env.PUBLIC_FRONTEND_URL || process.env.CLIENT_URL || 'https://schoolmangementbackend-deployment.up.railway.app';
  const verificationUrl = `${frontendBase.replace(/\/$/, '')}/verify-email?token=${token}`;
  const trimmedUserName = user.name ? user.name.trim() : 'User';
  const html = getVerificationEmailTemplate(trimmedUserName, verificationUrl);
  const text = `
Hello ${trimmedUserName},

Thank you for joining DugsiKabe! Please verify your email address by clicking the link below:

${verificationUrl}

If the link doesn't work, copy and paste it into your browser. This link will expire in 15 minutes for security reasons.

If you did not create an account with DugsiKabe, please ignore this email or contact support if you have concerns.

This is an automated message, please do not reply.
Â© ${new Date().getFullYear()} DugsiKabe. All rights reserved.
  `.trim();

  try {
    const result = await sendEmail({
      email: user.email,
      subject: 'Verify your email address - DugsiKabe',
      html,
      text,
      type: 'VERIFICATION',
      metadata: { userId: user._id },
    });

    await logAction(null, {
      action: 'VERIFICATION_QUEUED',
      module: 'EMAIL',
      targetId: user._id,
      details: { email: user.email, messageId: result.messageId },
    });

    return true;
  } catch (error) {
    await logAction(null, {
      action: 'VERIFICATION_FAILED',
      module: 'EMAIL',
      targetId: user._id,
      details: { email: user.email, error: error.message },
    });
    throw error;
  }
};

export const sendPasswordResetEmail = async (user, token) => {
  const resetUrl = `${process.env.CLIENT_URL}/reset-password?token=${token}`;
  const trimmedUserName = user.name ? user.name.trim() : 'User';
  const html = getPasswordResetEmailTemplate(trimmedUserName, resetUrl);
  const text = `
Hello ${trimmedUserName},

We received a request to reset the password for your DugsiKabe account. Click the link below to proceed:

${resetUrl}

If the link doesn't work, copy and paste it into your browser. This link will expire in 1 hour for security reasons.

If you did not request a password reset, please ignore this email or contact support if you have concerns.

This is an automated message, please do not reply.
Â© ${new Date().getFullYear()} DugsiKabe. All rights reserved.
  `.trim();

  try {
    const result = await sendEmail({
      email: user.email,
      subject: 'Password Reset Request - DugsiKabe',
      html,
      text,
      type: 'PASSWORD_RESET',
      metadata: { userId: user._id },
    });

    await logAction(null, {
      action: 'EMAIL_SENT',
      module: 'EMAIL',
      targetId: user._id,
      details: {
        email: user.email,
        type: 'PASSWORD_RESET',
        messageId: result.messageId,
      },
    });

    return true;
  } catch (error) {
    await logAction(null, {
      action: 'EMAIL_FAILED',
      module: 'EMAIL',
      targetId: user._id,
      details: {
        email: user.email,
        type: 'PASSWORD_RESET',
        error: error.message,
      },
    });
    throw error;
  }
};

export const sendSecurityAlertEmail = async (user, details) => {
  const trimmedUserName = user.name ? user.name.trim() : 'User';
  const html = getSecurityAlertEmailTemplate(trimmedUserName, details);
  const text = `
Hello ${trimmedUserName},

We detected some unusual activity on your DugsiKabe account:
${details.action}

Details:
Time: ${details.time}
IP: ${details.ip}
Device: ${details.device}

If this was you, you can ignore this email. If not, please change your password immediately.

This is an automated message, please do not reply.
Â© ${new Date().getFullYear()} DugsiKabe. All rights reserved.
  `.trim();

  try {
    const result = await sendEmail({
      email: user.email,
      subject: 'Security Alert - Unusual Activity Detected - DugsiKabe',
      html,
      text,
      type: 'SECURITY_ALERT',
      metadata: { userId: user._id },
    });

    await logAction(null, {
      action: 'EMAIL_SENT',
      module: 'EMAIL',
      targetId: user._id,
      details: {
        email: user.email,
        type: 'SECURITY_ALERT',
        messageId: result.messageId,
      },
    });

    return true;
  } catch (error) {
    await logAction(null, {
      action: 'EMAIL_FAILED',
      module: 'EMAIL',
      targetId: user._id,
      details: {
        email: user.email,
        type: 'SECURITY_ALERT',
        error: error.message,
      },
    });
    throw error;
  }
};

export const sendOTPEmail = async (email, otp, user) => {
  const trimmedUserName = user.name ? user.name.trim() : 'User';
  const html = getOTPEmailTemplate(trimmedUserName, otp);
  const text = `
Hello ${trimmedUserName},

Your verification code for logging into DugsiKabe is:

${otp}

This code is valid for 10 minutes. If you did not request this code, please secure your account immediately.

This is an automated message, please do not reply.
Â© ${new Date().getFullYear()} DugsiKabe. All rights reserved.
  `.trim();

  try {
    const result = await sendEmail({
      email,
      subject: 'Your Login Verification Code - DugsiKabe',
      html,
      text,
      type: 'OTP',
      metadata: { userId: user?._id },
    });

    await logAction(null, {
      action: 'OTP_SENT',
      module: 'AUTH',
      details: { email, messageId: result.messageId },
    });

    return true;
  } catch (error) {
    await logAction(null, {
      action: 'EMAIL_FAILED',
      module: 'AUTH',
      details: { email, error: error.message },
    });
    throw error;
  }
};

export const sendTestEmail = async (toEmail) => {
  try {
    const currentYear = new Date().getFullYear();
    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="X-UA-Compatible" content="IE=edge">
        <title>Test Email - DugsiKabe</title>
      </head>
      <body style="background-color: #f5f7fa; margin: 0; padding: 20px;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); overflow: hidden;">
          <div style="background: linear-gradient(135deg, #0A84FF 0%, #6366F1 100%); padding: 36px 32px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 30px; font-family: 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; font-weight: 800; letter-spacing: -0.5px;">Welcome to DugsiKabe!</h1>
          </div>
          <div style="padding: 40px 32px; font-family: 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; color: #1D1D1F; line-height: 1.8; font-size: 16px;">
            <h2 style="text-align: center; margin-top: 0; color: #0A84FF;">âœ… Test Email Successful!</h2>
            <p style="text-align: center;">If you're seeing this, your DugsiKabe email configuration is working perfectly! Your emails will now go to the inbox, not spam!</p>
            <p style="text-align: center; font-size: 14px; color: #6B7280;">Sent at: ${new Date().toLocaleString()}</p>
          </div>
          <div style="padding: 32px; text-align: center; font-family: 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; font-size: 13px; color: #6B7280; line-height: 1.8; background-color: #f5f7fa;">
            <p>DugsiKabe<br>
            This is an automated message, please do not reply.</p>
            <p>&copy; ${currentYear} DugsiKabe. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
    const text = `
Hello!

If you're seeing this, your DugsiKabe email configuration is working perfectly! Your emails will now go to the inbox, not spam!
Sent at: ${new Date().toLocaleString()}

Â© ${currentYear} DugsiKabe. All rights reserved.
    `.trim();

    const result = await sendEmail({
      email: toEmail,
      subject: 'Test Email - DugsiKabe',
      html,
      text,
      type: 'TEST',
    });

    return result;
  } catch (error) {
    throw error;
  }
};

export const checkEmailHealth = async () => {
  const provider = getEmailProvider();
  const configCheck = validateEmailDeliveryConfig();
  const connectionCheck = await provider.checkConnection();

  return {
    provider: provider.getProviderName(),
    apiKeyConfigured: !!process.env.RESEND_API_KEY,
    apiKeyValid: connectionCheck.ok,
    connectionStatus: connectionCheck.ok ? 'connected' : 'disconnected',
    configurationStatus: configCheck.ok ? 'valid' : 'invalid',
    issues: configCheck.issues,
    lastChecked: new Date().toISOString(),
  };
};

export { getEmailProvider };