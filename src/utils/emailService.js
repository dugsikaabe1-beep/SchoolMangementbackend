import { Resend } from 'resend';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import nodemailer from 'nodemailer';
import crypto from 'crypto';
import { logAction } from './auditLogger.js';
import EmailLog from '../models/EmailLog.js';
import { enqueueEmail } from '../jobs/emailQueue.js';
import {
  getVerificationEmailTemplate,
  getPasswordResetEmailTemplate,
  getOTPEmailTemplate,
  getSecurityAlertEmailTemplate,
} from './emailTemplates.js';

// Initialize Providers
let resendClient;
let sesClient;
let smtpTransporter;

// Minimal Headers polyfill for Node.js environments that lack global Headers
if (typeof globalThis.Headers === 'undefined') {
  class SimpleHeaders {
    constructor(init = {}) {
      this.map = new Map();
      if (init instanceof SimpleHeaders) {
        for (const [k, v] of init.map) this.map.set(k, v);
      } else if (typeof init === 'object' && init) {
        for (const [k, v] of Object.entries(init)) this.map.set(String(k).toLowerCase(), String(v));
      }
    }
    append(key, value) {
      const k = String(key).toLowerCase();
      const existing = this.map.get(k);
      this.map.set(k, existing ? `${existing}, ${value}` : String(value));
    }
    set(key, value) {
      this.map.set(String(key).toLowerCase(), String(value));
    }
    get(key) {
      return this.map.get(String(key).toLowerCase()) || null;
    }
    has(key) {
      return this.map.has(String(key).toLowerCase());
    }
    delete(key) {
      return this.map.delete(String(key).toLowerCase());
    }
    forEach(cb) {
      for (const [k, v] of this.map) cb(v, k, this);
    }
    entries() {
      return this.map.entries();
    }
  }
  globalThis.Headers = SimpleHeaders;
}

// Initialize all providers
const initializeProviders = () => {
  // Resend
  if (process.env.RESEND_API_KEY && process.env.RESEND_API_KEY.startsWith('re_')) {
    resendClient = new Resend(process.env.RESEND_API_KEY);
    console.log('[EmailService] ✅ Resend initialized');
  } else {
    console.log('[EmailService] ⚠️ Resend not configured');
  }
  // AWS SES
  // If running in production and Resend is configured, prefer Resend only and skip SES/SMTP
  const preferResendOnly = process.env.NODE_ENV === 'production' && !!resendClient;
  if (preferResendOnly) {
    console.log('[EmailService] ℹ️ Running in production with Resend configured - skipping SES/SMTP initialization');
  } else {
    if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY && process.env.AWS_REGION) {
    sesClient = new SESClient({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });
    console.log('[EmailService] ✅ SES initialized');
    } else {
      console.log('[EmailService] ⚠️ SES not configured');
    }
  }

  // SMTP (fallback)
  const hasSmtpConfig = process.env.EMAIL_HOST && process.env.EMAIL_PORT && process.env.EMAIL_USER && process.env.EMAIL_PASS;
  if (!preferResendOnly && hasSmtpConfig) {
    smtpTransporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: parseInt(process.env.EMAIL_PORT, 10),
      secure: process.env.EMAIL_SECURE === 'true',
      requireTLS: process.env.EMAIL_REQUIRE_TLS !== 'false' && process.env.EMAIL_SECURE !== 'true',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
      pool: true,
      maxConnections: Number(process.env.EMAIL_MAX_CONNECTIONS || 3),
      maxMessages: Number(process.env.EMAIL_MAX_MESSAGES || 100),
      connectionTimeout: Number(process.env.EMAIL_CONNECTION_TIMEOUT_MS || 15000),
      greetingTimeout: Number(process.env.EMAIL_GREETING_TIMEOUT_MS || 10000),
      socketTimeout: Number(process.env.EMAIL_SOCKET_TIMEOUT_MS || 30000),
      logger: process.env.NODE_ENV === 'development',
      debug: process.env.NODE_ENV === 'development',
    });
    console.log('[EmailService] ✅ SMTP initialized');
  } else {
    if (!preferResendOnly) console.log('[EmailService] ⚠️ SMTP not configured');
  }
};
// NOTE: Do NOT automatically initialize providers at module load time.
// Some environments load env vars after module evaluation. Callers should
// ensure `ensureEmailProvidersInitialized()` is called after dotenv has
// been configured (server startup) or rely on lazy init below.

let emailServiceInitialized = false;

export const ensureEmailProvidersInitialized = () => {
  if (!emailServiceInitialized) {
    initializeProviders();
    emailServiceInitialized = true;
  }
};

// Helper: Get default sender info
const getDefaultSender = () => {
  const address = process.env.EMAIL_FROM || 'noreply@dugsikabe.com';
  const name = process.env.EMAIL_FROM_NAME || 'DugsiKabe';
  return { name, address };
};

// Helper: Get reply-to address
const getReplyTo = () => {
  return process.env.EMAIL_REPLY_TO || process.env.EMAIL_FROM || 'noreply@dugsikabe.com';
};

// Helper: Get email domain
const getEmailDomain = () => {
  const from = getDefaultSender();
  return from.address.split('@')[1]?.toLowerCase() || 'dugsikabe.com';
};

// Create Email Log
const createEmailLog = async ({ to, from, replyTo, subject, type, provider, metadata, schoolId }) => {
  try {
    return await EmailLog.create({
      school: schoolId,
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

// Update Email Log
const updateEmailLog = async (logId, updates) => {
  if (!logId) return;
  try {
    await EmailLog.findByIdAndUpdate(logId, updates);
  } catch (error) {
    console.error('[EmailService] Failed to update email log:', error.message);
  }
};

// Provider-specific send functions
const sendWithResend = async ({ from, to, subject, html, text, replyTo }) => {
  if (!resendClient) throw new Error('Resend not configured');
  const result = await resendClient.emails.send({
    from,
    to,
    subject,
    html,
    text,
    replyTo,
  });
  if (result.error) throw new Error(`Resend error: ${result.error.message}`);
  return { messageId: result.data.id, provider: 'resend', response: result };
};

const sendWithSES = async ({ from, to, subject, html, text, replyTo }) => {
  if (!sesClient) throw new Error('SES not configured');
  const command = new SendEmailCommand({
    Source: from,
    Destination: { ToAddresses: [to] },
    Message: {
      Subject: { Data: subject },
      Body: {
        Html: { Data: html },
        Text: { Data: text },
      },
    },
    ReplyToAddresses: replyTo ? [replyTo] : undefined,
  });
  const result = await sesClient.send(command);
  return { messageId: result.MessageId, provider: 'ses', response: result };
};

const sendWithSMTP = async ({ from, to, subject, html, text, replyTo }) => {
  if (!smtpTransporter) throw new Error('SMTP not configured');
  const result = await smtpTransporter.sendMail({
    from,
    to,
    subject,
    html,
    text,
    replyTo,
  });
  return { messageId: result.messageId, provider: 'smtp', response: result };
};

// Select the best available provider
const selectProvider = () => {
  // Ensure providers have been initialized if possible
  if (!emailServiceInitialized) {
    try {
      initializeProviders();
      emailServiceInitialized = true;
    } catch (err) {
      console.warn('[EmailService] Provider initialization failed during selectProvider:', err.message);
    }
  }

  if (resendClient) return 'resend';
  if (sesClient) return 'ses';
  if (smtpTransporter) return 'smtp';
  throw new Error('No email providers configured');
};

// Core send function (called by worker)
export const sendEmailDirect = async (options) => {
  const { to, subject, html, text, type = 'GENERAL', metadata, emailLogId, schoolId } = options;
  const defaultSender = getDefaultSender();
  const from = `"${defaultSender.name}" <${defaultSender.address}>`;
  const replyTo = getReplyTo();
  const provider = selectProvider();

  console.log(`[EmailService] Sending to ${to} via ${provider}`);

  let result;
  try {
    if (provider === 'resend') {
      result = await sendWithResend({ from, to, subject, html, text, replyTo });
    } else if (provider === 'ses') {
      result = await sendWithSES({ from, to, subject, html, text, replyTo });
    } else {
      result = await sendWithSMTP({ from, to, subject, html, text, replyTo });
    }

    if (emailLogId) {
      await updateEmailLog(emailLogId, {
        status: 'sent',
        messageId: result.messageId,
        provider: result.provider,
        sentAt: new Date(),
        response: result.response,
      });
    }

    console.log(`[EmailService] ✅ Sent to ${to} via ${result.provider}`);
    return result;
  } catch (error) {
    console.error(`[EmailService] ❌ Failed to send to ${to}:`, error.message);
    if (emailLogId) {
      await updateEmailLog(emailLogId, {
        status: 'failed',
        error: error.message,
        provider,
      });
    }
    throw error;
  }
};

// Enqueue email function (use this from request handlers)
export const queueEmail = async (options) => {
  const { to, subject, html, text, type = 'GENERAL', metadata, schoolId } = options;
  const defaultSender = getDefaultSender();
  const from = `"${defaultSender.name}" <${defaultSender.address}>`;
  const replyTo = getReplyTo();

  const emailLog = await createEmailLog({
    to,
    from,
    replyTo,
    subject,
    type,
    provider: 'queued',
    metadata,
    schoolId,
  });

  await enqueueEmail({
    to,
    subject,
    html,
    text,
    type,
    metadata,
    emailLogId: emailLog?._id,
    schoolId,
  });

  return emailLog;
};

// Helper: Parse address
const parseAddress = (value, fallbackEmail = process.env.EMAIL_USER) => {
  const raw = (value || fallbackEmail || '').trim();
  const match = raw.match(/^(.*?)<([^>]+)>$/);
  if (match) {
    return { name: match[1].replace(/"/g, '').trim() || 'DugsiKabe', address: match[2].trim() };
  }
  return { name: process.env.EMAIL_FROM_NAME || 'DugsiKabe', address: raw };
};

// Specific email functions
export const sendVerificationEmail = async (user, token, schoolId = null) => {
  const frontendBase = process.env.PUBLIC_FRONTEND_URL || process.env.CLIENT_URL || 'http://localhost:5173';
  const verificationUrl = `${frontendBase.replace(/\/$/, '')}/verify-email?token=${token}`;
  const trimmedUserName = user.name ? user.name.trim() : 'User';
  const html = getVerificationEmailTemplate(trimmedUserName, verificationUrl);
  const text = `
Hello ${trimmedUserName},

Thank you for joining DugsiKabe! Please verify your email address by clicking the link below:

${verificationUrl}

This link will expire in 15 minutes for security reasons.

© ${new Date().getFullYear()} DugsiKabe. All rights reserved.
  `.trim();

  const emailLog = await queueEmail({
    to: user.email,
    subject: 'Verify your email address - DugsiKabe',
    html,
    text,
    type: 'VERIFICATION',
    metadata: { userId: user._id },
    schoolId,
  });

  await logAction(null, {
    action: 'VERIFICATION_QUEUED',
    module: 'EMAIL',
    targetId: user._id,
    details: {
      email: user.email,
      emailLogId: emailLog?._id,
    },
  });

  return true;
};

export const sendPasswordResetEmail = async (user, token, schoolId = null) => {
  const resetUrl = `${process.env.CLIENT_URL || 'http://localhost:5173'}/reset-password?token=${token}`;
  const trimmedUserName = user.name ? user.name.trim() : 'User';
  const html = getPasswordResetEmailTemplate(trimmedUserName, resetUrl);
  const text = `
Hello ${trimmedUserName},

We received a request to reset your password. Click the link below to proceed:

${resetUrl}

This link will expire in 1 hour.

© ${new Date().getFullYear()} DugsiKabe. All rights reserved.
  `.trim();

  const result = await queueEmail({
    to: user.email,
    subject: 'Password Reset Request - DugsiKabe',
    html,
    text,
    type: 'PASSWORD_RESET',
    metadata: { userId: user._id },
    schoolId,
  });

  await logAction(null, {
    action: 'PASSWORD_RESET_QUEUED',
    module: 'EMAIL',
    targetId: user._id,
    details: {
      email: user.email,
      emailLogId: result?._id,
    },
  });

  return true;
};

export const sendOTPEmail = async (email, otp, user, schoolId = null) => {
  const trimmedUserName = user?.name ? user.name.trim() : 'User';
  const html = getOTPEmailTemplate(trimmedUserName, otp);
  const text = `
Hello ${trimmedUserName},

Your verification code is: ${otp}

This code is valid for 10 minutes.

© ${new Date().getFullYear()} DugsiKabe. All rights reserved.
  `.trim();

  const result = await queueEmail({
    email,
    to: email,
    subject: 'Your Login Verification Code - DugsiKabe',
    html,
    text,
    type: 'OTP',
    metadata: { userId: user?._id },
    schoolId,
  });

  await logAction(null, {
    action: 'OTP_QUEUED',
    module: 'AUTH',
    details: {
      email,
      emailLogId: result?._id,
    },
  });

  return true;
};

export const sendSecurityAlertEmail = async (user, details, schoolId = null) => {
  const trimmedUserName = user.name ? user.name.trim() : 'User';
  const html = getSecurityAlertEmailTemplate(trimmedUserName, details);
  const text = `
Hello ${trimmedUserName},

We detected unusual activity: ${details.action}

Time: ${details.time}
IP: ${details.ip}
Device: ${details.device}

© ${new Date().getFullYear()} DugsiKabe. All rights reserved.
  `.trim();

  await queueEmail({
    to: user.email,
    subject: 'Security Alert - Unusual Activity Detected - DugsiKabe',
    html,
    text,
    type: 'SECURITY_ALERT',
    metadata: { userId: user._id },
    schoolId,
  });

  return true;
};

export const sendTestEmail = async (toEmail) => {
  const currentYear = new Date().getFullYear();
  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Test Email - DugsiKabe</title>
    </head>
    <body style="background-color: #f5f7fa; margin: 0; padding: 20px;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); overflow: hidden;">
        <div style="background: linear-gradient(135deg, #0A84FF 0%, #6366F1 100%); padding: 36px 32px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 30px; font-family: 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; font-weight: 800;">Welcome to DugsiKabe!</h1>
        </div>
        <div style="padding: 40px 32px; font-family: 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; color: #1D1D1F; line-height: 1.8; font-size: 16px; text-align: center;">
          <h2 style="color: #0A84FF;">✅ Test Email Successful!</h2>
          <p>If you're seeing this, your DugsiKabe email configuration is working perfectly!</p>
          <p style="font-size: 14px; color: #6B7280;">Sent at: ${new Date().toLocaleString()}</p>
        </div>
        <div style="padding: 32px; text-align: center; font-family: 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; font-size: 13px; color: #6B7280; background-color: #f5f7fa;">
          <p>DugsiKabe<br>This is an automated message.</p>
          <p>&copy; ${currentYear} DugsiKabe. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;
  const text = `Hello! Test email from DugsiKabe!`;

  await queueEmail({
    to: toEmail,
    subject: 'Test Email - DugsiKabe',
    html,
    text,
    type: 'TEST',
  });

  return true;
};

// Configuration validation
export const validateEmailDeliveryConfig = () => {
  const issues = [];
  const from = parseAddress(process.env.EMAIL_FROM);
  const domain = getEmailDomain();

  if (!resendClient && !sesClient && !smtpTransporter) {
    issues.push('No email providers configured (Resend/SES/SMTP)');
  }

  if (domain && ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com'].includes(domain)) {
    issues.push('Production email should use an authenticated school/platform domain, not a consumer mailbox domain');
  }

  return {
    ok: issues.length === 0,
    issues,
    requiredDnsRecords: {
      spf: `v=spf1 include:${process.env.EMAIL_SPF_INCLUDE || 'your-email-provider.example'} ~all`,
      dkim: 'Publish the DKIM TXT/CNAME record provided by your email provider for the sending domain.',
      dmarc: `v=DMARC1; p=${process.env.EMAIL_DMARC_POLICY || 'quarantine'}; rua=mailto:${process.env.DMARC_REPORT_EMAIL || `postmaster@${domain || 'your-domain.com'}`}; adkim=s; aspf=s`,
    },
  };
};

export { smtpTransporter };

// Health check for email delivery: reports configured providers and any issues
export const checkEmailHealth = async () => {
  const config = validateEmailDeliveryConfig();
  const providers = {
    resend: !!resendClient,
    ses: !!sesClient,
    smtp: !!smtpTransporter,
  };

  return {
    ok: config.ok,
    providers,
    issues: config.issues,
    requiredDnsRecords: config.requiredDnsRecords,
  };
};
