/**
 * Professional, email-client compatible templates for DugsiKabe
 * Designed for maximum deliverability and readability
 */

// System Colors (from the app)
const PRIMARY_COLOR = '#0A84FF';
const SECONDARY_COLOR = '#00C7BE';
const ACCENT_COLOR = '#FF9500';
const BACKGROUND_COLOR = '#F5F7FA';
const TEXT_COLOR = '#1D1D1F';
const TEXT_MUTED = '#6B7280';
const BORDER_COLOR = '#E5E7EB';
const WHITE = '#FFFFFF';

/**
 * Verification Email Template
 */
export const getVerificationEmailTemplate = (userName, verificationUrl) => {
  const preheader = 'Verify your email address to activate your DugsiKabe account';
  const currentYear = new Date().getFullYear();

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta http-equiv="X-UA-Compatible" content="IE=edge">
      <title>Verify your email - DugsiKabe</title>
      <!--[if mso]>
      <style type="text/css">
        body, table, td {font-family: Arial, sans-serif !important;}
      </style>
      <![endif]-->
      <style type="text/css">
        /* Reset styles */
        body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
        table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; border-collapse: collapse; }
        img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; display: block; }
        a[x-apple-data-detectors] {
            color: inherit !important;
            text-decoration: none !important;
            font-size: inherit !important;
            font-family: inherit !important;
            font-weight: inherit !important;
            line-height: inherit !important;
        }
        /* Custom styles */
        body {
            background-color: ${BACKGROUND_COLOR};
            margin: 0;
            padding: 20px;
        }
        .email-wrapper {
            background-color: ${BACKGROUND_COLOR};
            width: 100%;
            padding: 20px 0;
        }
        .email-container {
            max-width: 600px;
            margin: 0 auto;
            background-color: ${WHITE};
            border-radius: 16px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.08);
            overflow: hidden;
        }
        .email-header {
            background: linear-gradient(135deg, ${PRIMARY_COLOR} 0%, #6366F1 100%);
            padding: 36px 32px;
            text-align: center;
        }
        .email-header h1 {
            color: ${WHITE};
            margin: 0;
            font-size: 30px;
            font-family: 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            font-weight: 800;
            letter-spacing: -0.5px;
        }
        .email-body {
            padding: 40px 32px;
            font-family: 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            color: ${TEXT_COLOR};
            line-height: 1.8;
            font-size: 16px;
        }
        .email-body p {
            margin: 0 0 24px 0;
        }
        .email-body p.small {
            font-size: 14px;
            color: ${TEXT_MUTED};
            line-height: 1.6;
        }
        .button-wrapper {
            text-align: center;
            margin: 40px 0;
        }
        .verify-button {
            display: inline-block;
            background: linear-gradient(135deg, ${PRIMARY_COLOR} 0%, #6366F1 100%);
            color: ${WHITE} !important;
            text-decoration: none !important;
            padding: 18px 48px;
            border-radius: 12px;
            font-family: 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            font-size: 16px;
            font-weight: 700;
            border: none;
            cursor: pointer;
            box-shadow: 0 4px 12px rgba(10, 132, 255, 0.35);
            letter-spacing: 0.3px;
        }
        .link-text {
            word-break: break-all;
            color: ${PRIMARY_COLOR};
            text-decoration: none;
            font-weight: 600;
        }
        .divider {
            border-top: 1px solid ${BORDER_COLOR};
            margin: 40px 0;
        }
        .email-footer {
            padding: 32px;
            text-align: center;
            font-family: 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            font-size: 13px;
            color: ${TEXT_MUTED};
            line-height: 1.8;
            background-color: ${BACKGROUND_COLOR};
        }
        .email-footer a {
            color: ${TEXT_MUTED};
            text-decoration: none;
        }
      </style>
    </head>
    <body>
      <div class="email-wrapper">
        <div class="email-container">
          <div class="email-header">
            <h1>Welcome to DugsiKabe</h1>
          </div>
          <div class="email-body">
            <p>Hello ${userName},</p>
            <p>Thank you for joining DugsiKabe! To complete your account setup and start using all our features, please verify your email address.</p>
            
            <div class="button-wrapper">
              <a href="${verificationUrl}" class="verify-button" target="_blank">
                Verify Email Address
              </a>
            </div>
            
            <p>Or copy and paste this link into your browser:</p>
            <p class="small"><a href="${verificationUrl}" class="link-text">${verificationUrl}</a></p>
            
            <p class="small">This link will expire in <strong>15 minutes</strong> for security reasons.</p>
            
            <div class="divider"></div>
            
            <p class="small">If you did not create an account with DugsiKabe, please ignore this email or contact support if you have concerns.</p>
          </div>
          <div class="email-footer">
            <p>DugsiKabe<br>
            This is an automated message, please do not reply.</p>
            <p>&copy; ${currentYear} DugsiKabe. All rights reserved.</p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
};

/**
 * Password Reset Email Template
 */
export const getPasswordResetEmailTemplate = (userName, resetUrl) => {
  const currentYear = new Date().getFullYear();

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta http-equiv="X-UA-Compatible" content="IE=edge">
      <title>Reset your password - DugsiKabe</title>
      <!--[if mso]>
      <style type="text/css">
        body, table, td {font-family: Arial, sans-serif !important;}
      </style>
      <![endif]-->
      <style type="text/css">
        /* Reset styles */
        body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
        table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; border-collapse: collapse; }
        img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; display: block; }
        a[x-apple-data-detectors] {
            color: inherit !important;
            text-decoration: none !important;
            font-size: inherit !important;
            font-family: inherit !important;
            font-weight: inherit !important;
            line-height: inherit !important;
        }
        /* Custom styles */
        body {
            background-color: ${BACKGROUND_COLOR};
            margin: 0;
            padding: 20px;
        }
        .email-wrapper {
            background-color: ${BACKGROUND_COLOR};
            width: 100%;
            padding: 20px 0;
        }
        .email-container {
            max-width: 600px;
            margin: 0 auto;
            background-color: ${WHITE};
            border-radius: 16px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.08);
            overflow: hidden;
        }
        .email-header {
            background: linear-gradient(135deg, ${PRIMARY_COLOR} 0%, #6366F1 100%);
            padding: 36px 32px;
            text-align: center;
        }
        .email-header h1 {
            color: ${WHITE};
            margin: 0;
            font-size: 30px;
            font-family: 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            font-weight: 800;
            letter-spacing: -0.5px;
        }
        .email-body {
            padding: 40px 32px;
            font-family: 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            color: ${TEXT_COLOR};
            line-height: 1.8;
            font-size: 16px;
        }
        .email-body p {
            margin: 0 0 24px 0;
        }
        .email-body p.small {
            font-size: 14px;
            color: ${TEXT_MUTED};
            line-height: 1.6;
        }
        .button-wrapper {
            text-align: center;
            margin: 40px 0;
        }
        .reset-button {
            display: inline-block;
            background: linear-gradient(135deg, ${PRIMARY_COLOR} 0%, #6366F1 100%);
            color: ${WHITE} !important;
            text-decoration: none !important;
            padding: 18px 48px;
            border-radius: 12px;
            font-family: 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            font-size: 16px;
            font-weight: 700;
            border: none;
            cursor: pointer;
            box-shadow: 0 4px 12px rgba(10, 132, 255, 0.35);
            letter-spacing: 0.3px;
        }
        .link-text {
            word-break: break-all;
            color: ${PRIMARY_COLOR};
            text-decoration: none;
            font-weight: 600;
        }
        .divider {
            border-top: 1px solid ${BORDER_COLOR};
            margin: 40px 0;
        }
        .email-footer {
            padding: 32px;
            text-align: center;
            font-family: 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            font-size: 13px;
            color: ${TEXT_MUTED};
            line-height: 1.8;
            background-color: ${BACKGROUND_COLOR};
        }
      </style>
    </head>
    <body>
      <div class="email-wrapper">
        <div class="email-container">
          <div class="email-header">
            <h1>Password Reset Request</h1>
          </div>
          <div class="email-body">
            <p>Hello ${userName},</p>
            <p>We received a request to reset the password for your DugsiKabe account. Click the button below to proceed.</p>
            
            <div class="button-wrapper">
              <a href="${resetUrl}" class="reset-button" target="_blank">
                Reset Password
              </a>
            </div>
            
            <p>Or copy and paste this link into your browser:</p>
            <p class="small"><a href="${resetUrl}" class="link-text">${resetUrl}</a></p>
            
            <p class="small">This link will expire in <strong>1 hour</strong> for security reasons.</p>
            
            <div class="divider"></div>
            
            <p class="small">If you did not request a password reset, please ignore this email or contact support if you have concerns.</p>
          </div>
          <div class="email-footer">
            <p>DugsiKabe<br>
            This is an automated message, please do not reply.</p>
            <p>&copy; ${currentYear} DugsiKabe. All rights reserved.</p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
};

/**
 * OTP Email Template
 */
export const getOTPEmailTemplate = (userName, otp) => {
  const currentYear = new Date().getFullYear();

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta http-equiv="X-UA-Compatible" content="IE=edge">
      <title>Your verification code - DugsiKabe</title>
      <!--[if mso]>
      <style type="text/css">
        body, table, td {font-family: Arial, sans-serif !important;}
      </style>
      <![endif]-->
      <style type="text/css">
        /* Reset styles */
        body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
        table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; border-collapse: collapse; }
        img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; display: block; }
        a[x-apple-data-detectors] {
            color: inherit !important;
            text-decoration: none !important;
            font-size: inherit !important;
            font-family: inherit !important;
            font-weight: inherit !important;
            line-height: inherit !important;
        }
        /* Custom styles */
        body {
            background-color: ${BACKGROUND_COLOR};
            margin: 0;
            padding: 20px;
        }
        .email-wrapper {
            background-color: ${BACKGROUND_COLOR};
            width: 100%;
            padding: 20px 0;
        }
        .email-container {
            max-width: 600px;
            margin: 0 auto;
            background-color: ${WHITE};
            border-radius: 16px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.08);
            overflow: hidden;
        }
        .email-header {
            background: linear-gradient(135deg, ${PRIMARY_COLOR} 0%, #6366F1 100%);
            padding: 36px 32px;
            text-align: center;
        }
        .email-header h1 {
            color: ${WHITE};
            margin: 0;
            font-size: 30px;
            font-family: 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            font-weight: 800;
            letter-spacing: -0.5px;
        }
        .email-body {
            padding: 40px 32px;
            font-family: 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            color: ${TEXT_COLOR};
            line-height: 1.8;
            font-size: 16px;
            text-align: center;
        }
        .email-body p {
            margin: 0 0 24px 0;
        }
        .email-body p.small {
            font-size: 14px;
            color: ${TEXT_MUTED};
            line-height: 1.6;
        }
        .otp-box {
            background-color: ${BACKGROUND_COLOR};
            border: 2px dashed ${PRIMARY_COLOR};
            border-radius: 16px;
            padding: 32px;
            margin: 32px 0;
        }
        .otp-code {
            font-family: 'SF Mono', 'Courier New', Courier, monospace;
            font-size: 56px;
            font-weight: 900;
            color: ${TEXT_COLOR};
            letter-spacing: 16px;
        }
        .divider {
            border-top: 1px solid ${BORDER_COLOR};
            margin: 40px 0;
        }
        .email-footer {
            padding: 32px;
            text-align: center;
            font-family: 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            font-size: 13px;
            color: ${TEXT_MUTED};
            line-height: 1.8;
            background-color: ${BACKGROUND_COLOR};
        }
      </style>
    </head>
    <body>
      <div class="email-wrapper">
        <div class="email-container">
          <div class="email-header">
            <h1>Security Verification</h1>
          </div>
          <div class="email-body">
            <p>Hello ${userName},</p>
            <p>Your verification code for logging into DugsiKabe is:</p>
            
            <div class="otp-box">
              <span class="otp-code">${otp}</span>
            </div>
            
            <p class="small">This code is valid for <strong>10 minutes</strong>.</p>
            <p class="small">If you did not request this code, please secure your account immediately.</p>
            
            <div class="divider"></div>
            
          </div>
          <div class="email-footer">
            <p>DugsiKabe<br>
            This is an automated message, please do not reply.</p>
            <p>&copy; ${currentYear} DugsiKabe. All rights reserved.</p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
};

/**
 * Security Alert Email Template
 */
export const getSecurityAlertEmailTemplate = (userName, details) => {
  const currentYear = new Date().getFullYear();

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta http-equiv="X-UA-Compatible" content="IE=edge">
      <title>Security Alert - DugsiKabe</title>
      <!--[if mso]>
      <style type="text/css">
        body, table, td {font-family: Arial, sans-serif !important;}
      </style>
      <![endif]-->
      <style type="text/css">
        /* Reset styles */
        body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
        table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; border-collapse: collapse; }
        img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; display: block; }
        a[x-apple-data-detectors] {
            color: inherit !important;
            text-decoration: none !important;
            font-size: inherit !important;
            font-family: inherit !important;
            font-weight: inherit !important;
            line-height: inherit !important;
        }
        /* Custom styles */
        body {
            background-color: ${BACKGROUND_COLOR};
            margin: 0;
            padding: 20px;
        }
        .email-wrapper {
            background-color: ${BACKGROUND_COLOR};
            width: 100%;
            padding: 20px 0;
        }
        .email-container {
            max-width: 600px;
            margin: 0 auto;
            background-color: ${WHITE};
            border-radius: 16px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.08);
            overflow: hidden;
        }
        .email-header {
            background: linear-gradient(135deg, #EF4444 0%, #DC2626 100%);
            padding: 36px 32px;
            text-align: center;
        }
        .email-header h1 {
            color: ${WHITE};
            margin: 0;
            font-size: 30px;
            font-family: 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            font-weight: 800;
            letter-spacing: -0.5px;
        }
        .email-body {
            padding: 40px 32px;
            font-family: 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            color: ${TEXT_COLOR};
            line-height: 1.8;
            font-size: 16px;
        }
        .email-body p {
            margin: 0 0 24px 0;
        }
        .email-body p.small {
            font-size: 14px;
            color: ${TEXT_MUTED};
            line-height: 1.6;
        }
        .alert-box {
            background-color: #FEF2F2;
            border-left: 4px solid #EF4444;
            padding: 24px;
            margin: 32px 0;
            border-radius: 12px;
        }
        .alert-action {
            color: #991B1B;
            font-weight: 800;
            font-size: 18px;
            margin-bottom: 16px;
        }
        .alert-details {
            color: #7F1D1D;
            font-size: 15px;
            line-height: 2;
        }
        .divider {
            border-top: 1px solid ${BORDER_COLOR};
            margin: 40px 0;
        }
        .email-footer {
            padding: 32px;
            text-align: center;
            font-family: 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            font-size: 13px;
            color: ${TEXT_MUTED};
            line-height: 1.8;
            background-color: ${BACKGROUND_COLOR};
        }
      </style>
    </head>
    <body>
      <div class="email-wrapper">
        <div class="email-container">
          <div class="email-header">
            <h1>Security Alert</h1>
          </div>
          <div class="email-body">
            <p>Hello ${userName},</p>
            <p>We detected some unusual activity on your DugsiKabe account:</p>
            
            <div class="alert-box">
              <div class="alert-action">${details.action}</div>
              <div class="alert-details">
                <strong>Time:</strong> ${details.time}<br>
                <strong>IP Address:</strong> ${details.ip}<br>
                <strong>Device:</strong> ${details.device}
              </div>
            </div>
            
            <p class="small">If this was you, you can ignore this email. If not, please change your password immediately.</p>
            
            <div class="divider"></div>
            
          </div>
          <div class="email-footer">
            <p>DugsiKabe<br>
            This is an automated message, please do not reply.</p>
            <p>&copy; ${currentYear} DugsiKabe. All rights reserved.</p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
};
