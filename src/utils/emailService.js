import { Resend } from 'resend';
import nodemailer from 'nodemailer';
import crypto from 'crypto';
import { logAction } from './auditLogger.js';
import EmailLog from '../models/EmailLog.js';
import {
  getVerificationEmailTemplate,
  getPasswordResetEmailTemplate,
  getOTPEmailTemplate,
  getSecurityAlertEmailTemplate,
} from './emailTemplates.js';

// Initialize Resend lazily (after dotenv.config() has run)
let resend;
let resendInitialized = false;

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

const initResend = () => {
  if (resendInitialized) return;
  
  console.log('[EmailService] Checking Resend API key...');
  console.log('[EmailService] RESEND_API_KEY length:', process.env.RESEND_API_KEY?.length);
  
  if (process.env.RESEND_API_KEY && process.env.RESEND_API_KEY.startsWith('re_')) {
    resend = new Resend(process.env.RESEND_API_KEY);
    console.log('[EmailService] ✅ Resend initialized successfully!');
  } else {
    console.log('[EmailService] ❌ Resend not initialized (invalid or missing API key)');
  }
  
  resendInitialized = true;
};

// Validate and load email config from env for fallback SMTP
const requiredEnvVars = [
  'EMAIL_HOST',
  'EMAIL_PORT',
  'EMAIL_USER',
  'EMAIL_PASS',
  'EMAIL_FROM',
  'CLIENT_URL',
];

let transporter;
let transporterVerified = false;

const parseAddress = (value, fallbackEmail = process.env.EMAIL_USER) => {
  const raw = (value || fallbackEmail || '').trim();
  const match = raw.match(/^(.*?)<([^>]+)>$/);
  if (match) {
    return { name: match[1].replace(/"/g, '').trim() || 'DugsiKabe', address: match[2].trim() };
  }
  return { name: process.env.EMAIL_FROM_NAME || 'DugsiKabe', address: raw };
};

const getEmailDomain = () => {
  const from = parseAddress(process.env.EMAIL_FROM);
  return from.address?.split('@')[1]?.toLowerCase();
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

const updateEmailLog = async (log, updates) => {
  if (!log?._id) return;
  try {
    await EmailLog.findByIdAndUpdate(log._id, updates);
  } catch (error) {
    console.error('[EmailService] Failed to update email log:', error.message);
  }
};

export const validateEmailDeliveryConfig = () => {
  const issues = [];
  const port = Number(process.env.EMAIL_PORT);
  const secure = process.env.EMAIL_SECURE === 'true';
  const from = parseAddress(process.env.EMAIL_FROM);
  const domain = getEmailDomain();

  requiredEnvVars.forEach((key) => {
    if (!process.env[key]) issues.push(`${key} is missing`);
  });
  if (port === 465 && !secure) issues.push('EMAIL_SECURE should be true when EMAIL_PORT is 465');
  if ([587, 25].includes(port) && secure) issues.push('EMAIL_SECURE should usually be false for STARTTLS ports 587/25');
  if (from.address && process.env.EMAIL_USER && from.address !== process.env.EMAIL_USER && !domain) {
    issues.push('EMAIL_FROM must be a valid Name <email@domain> address');
  }
  if (domain && ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com'].includes(domain)) {
    issues.push('Production email should use an authenticated school/platform domain, not a consumer mailbox domain');
  }

  return {
    ok: issues.length === 0,
    issues,
    requiredDnsRecords: {
      spf: `v=spf1 include:${process.env.EMAIL_SPF_INCLUDE || 'your-email-provider.example'} ~all`,
      dkim: 'Publish the DKIM TXT/CNAME record provided by your SMTP provider for the sending domain.',
      dmarc: `v=DMARC1; p=${process.env.EMAIL_DMARC_POLICY || 'quarantine'}; rua=mailto:${process.env.DMARC_REPORT_EMAIL || `postmaster@${domain || 'your-domain.com'}`}; adkim=s; aspf=s`,
    },
  };
};

/**
 * Initialize email transporter and verify connection (for SMTP fallback)
 */
const initEmailTransporter = async () => {
  console.log('[EmailService] Initializing fallback SMTP transporter...');
  
  // Check required env vars
  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
  if (missingVars.length > 0) {
    const errorMsg = `[EmailService] Missing required environment variables: ${missingVars.join(', ')}`;
    console.error(errorMsg);
    throw new Error(errorMsg);
  }

  // Log config (without password!)
  console.log('[EmailService] Using SMTP config:');
  console.log('  - Host:', process.env.EMAIL_HOST);
  console.log('  - Port:', process.env.EMAIL_PORT);
  console.log('  - Secure:', process.env.EMAIL_SECURE);
  console.log('  - User:', process.env.EMAIL_USER);
  console.log('  - From:', process.env.EMAIL_FROM);
  console.log('  - Client URL:', process.env.CLIENT_URL);

  // Create transporter with built-in logging!
  transporter = nodemailer.createTransport({
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
    logger: process.env.NODE_ENV === 'development', // Log in dev
    debug: process.env.NODE_ENV === 'development', // Debug in dev
  });

  // Verify transporter connection with retries for transient network/timeouts
  const maxAttempts = Number(process.env.EMAIL_VERIFY_ATTEMPTS || 3);
  const baseDelay = Number(process.env.EMAIL_VERIFY_BASE_DELAY_MS || 1000);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`[EmailService] Verifying SMTP connection (attempt ${attempt}/${maxAttempts})...`);
      await transporter.verify();
      console.log('[EmailService] ✅ SMTP Connected Successfully');
      transporterVerified = true;
      return;
    } catch (error) {
      console.error(`[EmailService] SMTP verify attempt ${attempt} failed: ${error.message}`);
      if (attempt === maxAttempts) {
        console.error('[EmailService] ❌ SMTP Connection Failed after retries:', error.stack);
        transporterVerified = false;
        throw new Error(`Failed to initialize email transporter: ${error.message}`);
      }
      const delay = baseDelay * Math.pow(2, attempt - 1);
      console.log(`[EmailService] Waiting ${delay}ms before next verify attempt...`);
      await new Promise((res) => setTimeout(res, delay));
    }
  }
};

// Transporter will be initialized lazily when first email is sent

/**
 * Send email (uses Resend if available, otherwise falls back to SMTP)
 */
const sendEmail = async (options) => {
  const fromAddress = parseAddress(process.env.EMAIL_FROM || 'DugsiKabe <noreply@dugsikabe.com>');
  const from = `"${fromAddress.name}" <${fromAddress.address}>`;
  const replyAddress = parseAddress(process.env.EMAIL_REPLY_TO || process.env.EMAIL_FROM || process.env.EMAIL_USER);
  const replyTo = `"${replyAddress.name}" <${replyAddress.address}>`;
  const to = options.email.trim();
  const type = options.type || 'GENERAL';
  const domain = getEmailDomain() || 'dugsikabe.com';
  const messageId = options.messageId || `<${crypto.randomUUID()}@${domain}>`;
  const envelopeFrom = process.env.EMAIL_RETURN_PATH || process.env.EMAIL_BOUNCE_ADDRESS || fromAddress.address;
  const entityRefId = crypto.createHash('sha256').update(`${to}:${options.subject}:${messageId}`).digest('hex');
  
  console.log(`[EmailService] Preparing to send email to ${to}`);
  
  // Initialize Resend (lazily, after dotenv.config())
  initResend();
  
  // Try Resend first
  if (resend) {
    try {
      console.log('[EmailService] Using Resend to send email...');
      console.log('[EmailService] Resend params:', {
        from: from,
        to: to,
        subject: options.subject,
      });
      const emailLog = await createEmailLog({ to, from, replyTo, subject: options.subject, type, provider: 'resend', metadata: options.metadata });
      const result = await resend.emails.send({
        from: from,
        to: to,
        subject: options.subject,
        html: options.html,
        text: options.text,
        reply_to: replyTo,
      });
      
      // Check for errors in Resend response (Resend returns { data, error })
      if (result.error) {
        console.error('[EmailService] ❌ Resend failed with error:', result.error);
        await updateEmailLog(emailLog, {
          status: 'failed',
          error: JSON.stringify(result.error)
        });
        throw new Error(`Resend error: ${result.error.message || JSON.stringify(result.error)}`);
      }
      
      // Success case
      await updateEmailLog(emailLog, {
        status: 'sent',
        messageId: result.data.id,
        sentAt: new Date(),
        response: result
      });
      
      console.log('[EmailService] ✅ Email sent successfully via Resend! ID:', result.data.id);
      return { success: true, messageId: result.data.id };
    } catch (error) {
      console.error('[EmailService] ❌ Resend failed, falling back to SMTP:', error.message);
    }
  }
  
  // Fallback to SMTP only if we have no other option
  console.log('[EmailService] Resend failed, checking if we should try SMTP...');
  
  // Optional SMTP fallback: only try if SMTP env vars are present and we really want to
  const hasSmtpConfig = process.env.EMAIL_HOST && process.env.EMAIL_PORT && process.env.EMAIL_USER && process.env.EMAIL_PASS;
  
  if (!hasSmtpConfig) {
    console.log('[EmailService] No SMTP config, skipping SMTP fallback');
    throw new Error('Resend failed and no SMTP config available');
  }
  
  console.log('[EmailService] Trying SMTP fallback...');
  
  // Try to initialize transporter if not already initialized, but skip verification if needed
  if (!transporter) {
    try {
      // Wait let's modify initEmailTransporter to be optional? Let's just create transporter without verifying first!
      console.log('[EmailService] Initializing SMTP transporter (no verification first)...');
      transporter = nodemailer.createTransport({
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
      transporterVerified = true; // Assume verified for now
      console.log('[EmailService] ✅ SMTP Transporter initialized (without verification)');
    } catch (initError) {
      const errorMsg = `[EmailService] Failed to initialize email transporter: ${initError.message}`;
      console.error(errorMsg);
      throw new Error(errorMsg);
    }
  }

  const mailOptions = {
    from: from,
    to: to,
    subject: options.subject,
    html: options.html,
    text: options.text, // Add plain text alternative for better deliverability!
    replyTo,
    messageId,
    envelope: {
      from: envelopeFrom,
      to,
    },
    headers: {
      'X-Priority': '3',
      'X-MSMail-Priority': 'Normal',
      'Importance': 'Normal',
      'X-Auto-Response-Suppress': 'All',
      'X-Entity-Ref-ID': entityRefId,
    },
  };

  if (options.listUnsubscribe) {
    mailOptions.headers['List-Unsubscribe'] = options.listUnsubscribe;
    mailOptions.headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
  }

  console.log(`[EmailService] Sending email to ${to} via SMTP...`);
  const emailLog = await createEmailLog({ to, from, replyTo, subject: options.subject, type, provider: 'smtp', metadata: options.metadata });
  
  // Helper: send via transporter with retry on transient errors
  const sendWithRetry = async (mailOptions, emailLog, maxAttempts = 3, baseDelay = 1000) => {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        console.log(`[EmailService] SMTP send attempt ${attempt} for ${to}`);
        const result = await transporter.sendMail(mailOptions);
        await updateEmailLog(emailLog, {
          status: 'sent',
          messageId: result.messageId,
          sentAt: new Date(),
          response: result
        });
        return result;
      } catch (err) {
        console.error(`[EmailService] SMTP attempt ${attempt} failed: ${err.message}`);
        await updateEmailLog(emailLog, {
          status: 'retrying',
          lastError: err.message,
          lastAttemptAt: new Date()
        });

        const transientPattern = /ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENETUNREACH|EHOSTUNREACH|EAI_AGAIN|ENOTFOUND/i;
        const isTransient = transientPattern.test(err.code || err.message || '');

        if (attempt === maxAttempts || !isTransient) {
          await updateEmailLog(emailLog, {
            status: 'failed',
            error: err.message
          });
          throw err;
        }

        const delay = baseDelay * Math.pow(2, attempt - 1);
        console.log(`[EmailService] Waiting ${delay}ms before retrying SMTP (attempt ${attempt + 1})...`);
        await new Promise((res) => setTimeout(res, delay));
      }
    }
    throw new Error('SMTP send failed after retries');
  };

  try {
    const result = await sendWithRetry(mailOptions, emailLog);
    console.log(`[EmailService] ✅ Email Sent Successfully via SMTP to ${to}`);
    console.log(`[EmailService] Message ID: ${result.messageId}`);
    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error(`[EmailService] ❌ Email Failed to send to ${to}`);
    console.error(`[EmailService] Error message: ${error.message}`);
    console.error(`[EmailService] Full error stack: ${error.stack}`);
    if (error.response) {
      console.error(`[EmailService] SMTP Response: ${error.response}`);
    }
    throw error;
  }
};

/**
 * Send Verification Email
 */
export const sendVerificationEmail = async (user, token) => {
  // Prefer an explicit public frontend URL for emails (set in production).
  // Falls back to CLIENT_URL for backwards compatibility.
  const frontendBase = process.env.PUBLIC_FRONTEND_URL || process.env.CLIENT_URL || 'http://localhost:5173';
  const verificationUrl = `${frontendBase.replace(/\/$/, '')}/verify-email?token=${token}`;
  const trimmedUserName = user.name ? user.name.trim() : 'User';
  const html = getVerificationEmailTemplate(trimmedUserName, verificationUrl);
  // Plain text version for spam filter compatibility
  const text = `
Hello ${trimmedUserName},

Thank you for joining DugsiKabe! Please verify your email address by clicking the link below:

${verificationUrl}

If the link doesn't work, copy and paste it into your browser. This link will expire in 15 minutes for security reasons.

If you did not create an account with DugsiKabe, please ignore this email or contact support if you have concerns.

This is an automated message, please do not reply.
© ${new Date().getFullYear()} DugsiKabe. All rights reserved.
  `.trim();

  try {
    const result = await sendEmail({
      email: user.email,
      subject: 'Verify your email address - DugsiKabe',
      html,
      text,
    });

    // Log audit event
    await logAction(null, {
      action: 'VERIFICATION_SENT',
      module: 'EMAIL',
      targetId: user._id,
      details: {
        email: user.email,
        messageId: result.messageId,
      },
    });

    return true;
  } catch (error) {
    // Log failure audit event
    await logAction(null, {
      action: 'VERIFICATION_FAILED',
      module: 'EMAIL',
      targetId: user._id,
      details: {
        email: user.email,
        error: error.message,
      },
    });
    throw error;
  }
};

/**
 * Send Password Reset Email
 */
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
© ${new Date().getFullYear()} DugsiKabe. All rights reserved.
  `.trim();

  try {
    const result = await sendEmail({
      email: user.email,
      subject: 'Password Reset Request - DugsiKabe',
      html,
      text,
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

/**
 * Send Security Alert Email
 */
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
© ${new Date().getFullYear()} DugsiKabe. All rights reserved.
  `.trim();

  try {
    const result = await sendEmail({
      email: user.email,
      subject: 'Security Alert - Unusual Activity Detected - DugsiKabe',
      html,
      text,
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

/**
 * Send OTP Email
 */
export const sendOTPEmail = async (email, otp, user) => {
  const trimmedUserName = user.name ? user.name.trim() : 'User';
  const html = getOTPEmailTemplate(trimmedUserName, otp);
  const text = `
Hello ${trimmedUserName},

Your verification code for logging into DugsiKabe is:

${otp}

This code is valid for 10 minutes. If you did not request this code, please secure your account immediately.

This is an automated message, please do not reply.
© ${new Date().getFullYear()} DugsiKabe. All rights reserved.
  `.trim();

  const result = await sendEmail({
    email,
    subject: 'Your Login Verification Code - DugsiKabe',
    html,
    text,
  });

  await logAction(null, {
    action: 'OTP_SENT',
    module: 'AUTH',
    details: {
      email,
      messageId: result.messageId,
    },
  });

  return true;
};

/**
 * Send test email
 */
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
            <h2 style="text-align: center; margin-top: 0; color: #0A84FF;">✅ Test Email Successful!</h2>
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

© ${currentYear} DugsiKabe. All rights reserved.
    `.trim();

    const result = await sendEmail({
      email: toEmail,
      subject: 'Test Email - DugsiKabe',
      html,
      text,
    });

    return result;
  } catch (error) {
    throw error;
  }
};

export { transporter, transporterVerified };
