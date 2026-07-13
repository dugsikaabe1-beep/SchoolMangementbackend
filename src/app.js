// School Management Backend
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import mongoSanitize from 'express-mongo-sanitize';
import hpp from 'hpp';
import cookieParser from 'cookie-parser';
import { getValidationErrors, mapErrorMessage } from './utils/errorMapper.js';
import { ensureUserMessage } from './utils/errorMessageMapper.js';
import { parseAllowedOrigins, originMatcher } from './config/corsConfig.js';
import { checkMaintenanceMode } from './middlewares/maintenanceMiddleware.js';
import { requireProfileCompletion } from './middlewares/profileCompletionMiddleware.js';

// Load environment variables
dotenv.config();

import { injectAcademicYear } from './utils/academicUtils.js';
import { apiActivityMiddleware } from './middlewares/apiActivityMiddleware.js';

// Initialize Express app
const app = express();

// --- 1. GLOBAL SECURITY & CORS MIDDLEWARE ---

const allowedOrigins = parseAllowedOrigins();

// Single, consistent CORS configuration
const corsOptions = {
  origin: (origin, callback) => {
    // 1. Allow non-browser clients (curl, mobile native)
    if (!origin) return callback(null, true);

    // 2. Always allow development origins (localhost:5173, 127.0.0.1:5173)
    if (
      origin === 'http://localhost:5173' ||
      origin === 'http://127.0.0.1:5173' ||
      origin === 'http://localhost:5174' ||
      origin === 'http://127.0.0.1:5174'
    ) {
      return callback(null, true);
    }

    // 3. Allow known production frontends
    if (
      origin === 'https://dugsihub-lilac.vercel.app' ||
      origin === 'https://dugsimaamul.vercel.app' ||
      origin === 'https://dugsikabe.vercel.app'
    ) {
      return callback(null, true);
    }

    // 4. Use the origin matcher from corsConfig
    return originMatcher(allowedOrigins || [])(origin, callback);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'Accept',
    'Origin',
    'X-Requested-With',
    'x-tenant-id',
    'X-Tenant-ID',
    'x-school-slug',
    'X-School-Slug',
    'x-dev-tenant-subdomain',
    'X-Dev-Tenant-Subdomain',
    'x-branch-id',
    'X-Branch-ID',
    'x-academic-year-id',
    'X-Academic-Year-ID',
  ],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  optionsSuccessStatus: 200,
};

// 1.1 Apply CORS middleware globally
app.use(cors(corsOptions));

// 1.2 Explicitly handle preflight OPTIONS requests
app.options('*', cors(corsOptions));

// 1.2 Debug logging for CORS
app.use((req, res, next) => {
  if (process.env.NODE_ENV === 'development') {
    const origin = req.headers.origin;
    if (origin) {
      console.log(`[CORS-Debug] ${req.method} ${req.originalUrl} | Origin: ${origin}`);
    }
  }
  // No dev-only headers set in production
  next();
});

// 1.3 Maintenance Mode Check
app.use(checkMaintenanceMode);

// 1.4 Trust Proxy
if (process.env.TRUST_PROXY === '1') {
  app.set('trust proxy', 1);
}

// Import routes
import authRoutes from './routes/authRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import teacherRoutes from './routes/teacherRoutes.js';
import studentRoutes from './routes/studentRoutes.js';
import parentRoutes from './routes/parentRoutes.js';
import superAdminRoutes from './routes/superAdminRoutes.js';
import schoolAdminRoutes from './routes/schoolAdminRoutes.js';
import schoolProfileRoutes from './routes/schoolProfileRoutes.js';
import publicRoutes from './routes/publicRoutes.js';
import schoolPublicContentRoutes from './routes/schoolPublicContentRoutes.js';
import mobileRoutes from './routes/mobileRoutes.js';
import branchRoutes from './routes/branchRoutes.js';
import academicRoutes from './routes/academicRoutes.js';
import subscriptionRoutes from './routes/subscriptionRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';

import notificationTemplateRoutes from './routes/notificationTemplateRoutes.js';
import communicationSettingsRoutes from './routes/communicationSettingsRoutes.js';
import communicationRoutes from './routes/communicationRoutes.js';
import { runScheduler } from './services/scheduler.js';
import rbacRoutes from './routes/rbacRoutes.js';
import enterpriseRoutes from './routes/enterpriseRoutes.js';
import searchRoutes from './routes/searchRoutes.js';
import onboardingRoutes from './routes/onboardingRoutes.js';
import schoolFeatureRoutes from './routes/schoolFeatureRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';
import waafiPayRoutes from './routes/waafiPayRoutes.js';
import idCardRoutes from './routes/idCardRoutes.js';
import backupRoutes from './routes/backupRoutes.js';
import attendanceRoutes from './routes/attendanceRoutes.js';
import examRoutes from './routes/examRoutes.js';
import payrollRoutes from './routes/payrollRoutes.js';
import leaveRoutes from './routes/leaveRoutes.js';

import { detectTenant, injectBranch, injectOwnership } from './middlewares/tenantMiddleware.js';
import { asyncHandler } from './middlewares/asyncHandler.js';

// Security Headers (Helmet)
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      imgSrc: ["'self'", "data:", "https:", "res.cloudinary.com"],
      connectSrc: ["'self'", "https://api.cloudinary.com", "https://schoolmangementbackend-deployment.up.railway.app"],
    },
  },
}));

// Webhook raw body parser MUST come before global json parser
app.use('/api/v1/payments/waafipay/webhook', express.raw({ type: 'application/json' }));
app.use('/api/payments/waafipay/webhook', express.raw({ type: 'application/json' }));

// Body Parsing & Sanitization
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());

// Rate Limiting - Prevent API Abuse
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Increased to 1000
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => 
    req.originalUrl?.startsWith('/api/health') || 
    req.method === 'OPTIONS' ||
    req.headers.origin === 'https://dugsikabe.vercel.app',
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again after 15 minutes'
  }
});
app.use('/api/', apiLimiter);

// Auth Rate Limiting - Prevent Brute Force
const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  skip: (req) => req.method === 'OPTIONS',
  message: {
    success: false,
    message: 'Too many login attempts, please try again in an hour'
  }
});
app.use('/api/auth/login', authLimiter);

// Prevent MongoDB Injection
app.use(mongoSanitize());

// Prevent HTTP Parameter Pollution
app.use(hpp());

// Compression
app.use(compression());

// Logging
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined'));
}

// --- 2. TENANT ISOLATION ---
app.use(asyncHandler(detectTenant));
app.use('/api/', apiActivityMiddleware);

// --- 2.5 PROFILE COMPLETION GUARD ---
// Blocks school admins from accessing the platform until their profile is complete
app.use(asyncHandler(requireProfileCompletion));

// --- 3. ROUTES ---

// Local upload storage is intentionally disabled. All media must be uploaded to
// Cloudinary and persisted in MongoDB as URLs/metadata only.
app.use('/uploads', (req, res) => {
  res.status(410).json({
    success: false,
    message: 'Local uploads are disabled',
    userMessage: 'This file is no longer served locally. Please use a Cloudinary asset URL.',
  });
});

// Health check endpoints
import { checkEmailHealth, validateEmailDeliveryConfig } from './utils/emailService.js';

app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
  });
});

app.get('/api/health/email', async (req, res) => {
  try {
    const health = await checkEmailHealth();
    res.status(200).json({
      success: true,
      ...health
    });
  } catch (error) {
    console.error('[Health] Email health check failed:', error);
    res.status(500).json({
      success: false,
      message: 'Email health check failed',
      error: error.message
    });
  }
});

// API Versioning (v1)
app.use('/api/v1/mobile', mobileRoutes);
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/branches', branchRoutes);
app.use('/api/v1/academic', academicRoutes);
app.use('/api/v1/subscription', subscriptionRoutes);
app.use('/api/v1/notifications', notificationRoutes);

app.use('/api/v1/notifications/templates', notificationTemplateRoutes);
app.use('/api/v1/admin/communication-settings', communicationSettingsRoutes);
app.use('/api/v1/communication', communicationRoutes);

// Start in-process scheduler loop if enabled (not recommended for clustered production)
if (process.env.RUN_NOTIFICATION_SCHEDULER === '1') {
  const intervalMs = parseInt(process.env.NOTIFICATION_SCHEDULER_INTERVAL_MS || '60000', 10);
  console.log('[Scheduler] in-process scheduler enabled, intervalMs=', intervalMs);
  setInterval(async () => {
    try {
      const n = await runScheduler(100);
      if (n) console.log(`[Scheduler] processed ${n} jobs`);
    } catch (err) {
      console.error('[Scheduler] loop error', err.message);
    }
  }, intervalMs);
}
app.use('/api/v1/school-settings', schoolAdminRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/public', publicRoutes);
app.use('/api/v1/school-admin/public-content', schoolPublicContentRoutes);
app.use('/api/v1/admin', schoolProfileRoutes);
app.use('/api/v1/teachers', teacherRoutes);
app.use('/api/v1/students', studentRoutes);
app.use('/api/v1/parents', parentRoutes);
app.use('/api/v1/super-admin', superAdminRoutes);
app.use('/api/v1/school-admin', schoolAdminRoutes);
app.use('/api/v1/rbac', rbacRoutes);
app.use('/api/v1/enterprise', enterpriseRoutes);
app.use('/api/v1/search', searchRoutes);
app.use('/api/v1/onboarding', onboardingRoutes);
app.use('/api/v1/school-features', schoolFeatureRoutes);
app.use('/api/v1/payments', paymentRoutes);
app.use('/api/v1/payments/waafipay', waafiPayRoutes);
app.use('/api/v1/id-cards', idCardRoutes);
app.use('/api/v1/backups', backupRoutes);
app.use('/api/v1/attendance', attendanceRoutes);
app.use('/api/v1/exams', examRoutes);
app.use('/api/v1/payroll', payrollRoutes);
app.use('/api/v1/leaves', leaveRoutes);

// Legacy routes for backward compatibility
app.use('/api/school-features', schoolFeatureRoutes);
app.use('/api/backups', backupRoutes);
app.use('/api/payroll', payrollRoutes);
app.use('/api/leaves', leaveRoutes);

// Legacy routes for backward compatibility
app.use('/api/mobile', mobileRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/branches', branchRoutes);
app.use('/api/academic', academicRoutes);
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/admin/communication-settings', communicationSettingsRoutes);
app.use('/api/communication', communicationRoutes);
app.use('/api/school-settings', schoolAdminRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/school-admin/public-content', schoolPublicContentRoutes);
app.use('/api/admin', schoolProfileRoutes);
app.use('/api/teachers', teacherRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/parents', parentRoutes);
app.use('/api/super-admin', superAdminRoutes);
app.use('/api/school-admin', schoolAdminRoutes);
app.use('/api/rbac', rbacRoutes);
app.use('/api/enterprise', enterpriseRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/onboarding', onboardingRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/payments/waafipay', waafiPayRoutes);
app.use('/api/id-cards', idCardRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/exams', examRoutes);
app.use('/api/school-features', schoolFeatureRoutes);

// Mobile dev compatibility: some Expo builds use an API_URL without /api.
app.use('/mobile', mobileRoutes);

// --- 4. ERROR HANDLING ---

// Ensure all responses have user-friendly error messages
app.use(ensureUserMessage);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    userMessage: 'The page you are looking for does not exist. Please check the URL or contact support.'
  });
});

// Global Error Handler
app.use((err, req, res, next) => {

  // Log critical errors for monitoring
  if (err.status >= 500 || !err.status) {
    console.error('CRITICAL ERROR:', {
      message: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : 'REDACTED',
      path: req.path,
      method: req.method,
      tenant: req.tenantId,
      user: req.user?._id
    });
  }
  
  // Handle Mongoose Validation Errors
  if (err.name === 'ValidationError') {
    const errors = getValidationErrors(err);
    const firstError = Object.values(errors)[0] || 'Please check your information and try again.';
    
    return res.status(400).json({
      success: false,
      message: firstError,
      userMessage: firstError,
      errors: errors
    });
  }
  
  // Handle MongoDB Duplicate Key Errors
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    const fieldNames = {
      customId: 'ID',
      email: 'Email',
      name: 'Name'
    };
    const friendlyField = fieldNames[field] || field;
    const message = `This ${friendlyField.toLowerCase()} already exists. Please use a different ${friendlyField.toLowerCase()}.`;
    
    return res.status(400).json({
      success: false,
      message: message,
      userMessage: message
    });
  }
  
  // Handle MongoDB Cast Errors (Invalid ObjectId)
  if (err.name === 'CastError') {
    const message = 'Invalid ID format. Please check the ID and try again.';
    return res.status(400).json({
      success: false,
      message: message,
      userMessage: message
    });
  }
  
  // Handle JWT Errors
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    const message = 'Your session expired, please login again.';
    return res.status(401).json({
      success: false,
      message: message,
      userMessage: message
    });
  }
  
  // Default error response with user-friendly message
  const statusCode = err.status || err.statusCode || res.statusCode || 500;
  let userMessage = mapErrorMessage(err);
  
  if (statusCode === 400 && userMessage.includes('Something went wrong')) {
    userMessage = err.message;
  }
  
  res.status(statusCode === 200 ? 500 : statusCode).json({
    success: false,
    message: userMessage,
    userMessage: userMessage,
    ...(process.env.NODE_ENV === 'development' && { technicalMessage: err.message })
  });
});

export default app;
