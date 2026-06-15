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
import path from 'path';
import { fileURLToPath } from 'url';
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
const corsOptions = {
  origin: (origin, callback) => {
    // 1. Allow if no origin (non-browser)
    if (!origin) return callback(null, true);

    // 2. Explicitly allow the known frontend origin
    if (origin === 'https://dugsihub-lilac.vercel.app') {
      return callback(null, true);
    }

    // 3. In development, be very permissive
    if (process.env.NODE_ENV === 'development') {
      return callback(null, true);
    }

    // 4. Use the registry matcher
    return originMatcher(allowedOrigins || [])(origin, callback);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'Accept',
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
    'X-Requested-With',
  ],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  optionsSuccessStatus: 200,
};

// 1.1 Handle CORS and Preflight FIRST
if (process.env.NODE_ENV === 'development') {
  // Manual CORS — always works for local development
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      req.headers['access-control-request-headers'] ||
        'Content-Type, Authorization, Accept, x-tenant-id, X-Tenant-ID, x-school-slug, X-School-Slug, x-dev-tenant-subdomain, X-Dev-Tenant-Subdomain, x-branch-id, X-Branch-ID, x-academic-year-id, X-Academic-Year-ID, x-requested-with'
    );
    res.setHeader('Access-Control-Max-Age', '86400');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });
} else {
  app.use(cors(corsOptions));
}

// Explicitly handle preflight
app.use((req, res, next) => {
  const origin = req.headers.origin;

  // Allow known production origin or localhost during development
  const isAllowedOrigin =
    origin === 'https://dugsimaamul.vercel.app' ||
    origin === 'https://schoolmangementbackend-production.up.railway.app' ||
    (process.env.NODE_ENV === 'development' && origin && origin.startsWith('http://localhost:'));

  if (isAllowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, x-tenant-id, X-Tenant-ID, x-school-slug, X-School-Slug, x-dev-tenant-subdomain, X-Dev-Tenant-Subdomain, x-branch-id, X-Branch-ID, x-academic-year-id, X-Academic-Year-ID, x-requested-with');
  }

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  next();
});

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
import notificationWebhookRoutes from './routes/notificationWebhookRoutes.js';
import notificationTwilioWebhook from './routes/notificationTwilioWebhook.js';
import notificationTemplateRoutes from './routes/notificationTemplateRoutes.js';
import { runScheduler } from './services/scheduler.js';
import rbacRoutes from './routes/rbacRoutes.js';
import enterpriseRoutes from './routes/enterpriseRoutes.js';
import searchRoutes from './routes/searchRoutes.js';
import onboardingRoutes from './routes/onboardingRoutes.js';
import schoolFeatureRoutes from './routes/schoolFeatureRoutes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { detectTenant, injectOwnership } from './middlewares/tenantMiddleware.js';

// Security Headers (Helmet)
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      imgSrc: ["'self'", "data:", "https:", "res.cloudinary.com"],
      connectSrc: ["'self'", "https://api.cloudinary.com", "https://schoolmangementbackend-production.up.railway.app"],
    },
  },
}));

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
    req.headers.origin === 'https://dugsihub-lilac.vercel.app',
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
app.use(detectTenant);
app.use(injectAcademicYear);
app.use('/api/', apiActivityMiddleware);

// --- 2.5 PROFILE COMPLETION GUARD ---
// Blocks school admins from accessing the platform until their profile is complete
app.use(requireProfileCompletion);

// --- 3. ROUTES ---

// Static files
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
  });
});

// API Versioning (v1)
app.use('/api/v1/mobile', mobileRoutes);
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/branches', branchRoutes);
app.use('/api/v1/academic', academicRoutes);
app.use('/api/v1/subscription', subscriptionRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/notifications/webhooks', notificationWebhookRoutes);
app.use('/api/v1/notifications/webhooks', notificationTwilioWebhook);
app.use('/api/v1/notifications/templates', notificationTemplateRoutes);

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

// Legacy routes for backward compatibility
app.use('/api/mobile', mobileRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/branches', branchRoutes);
app.use('/api/academic', academicRoutes);
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/notifications', notificationRoutes);
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

// Mobile dev compatibility: some Expo builds use an API_URL without /api.
app.use('/mobile', mobileRoutes);

// --- 4. ERROR HANDLING ---

// Ensure all responses have user-friendly error messages
app.use(ensureUserMessage);

// 404 handler
app.use((req, res) => {
  // Ensure CORS headers for 404
  const origin = req.headers.origin;
  if (origin && process.env.NODE_ENV === 'development') {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
  }

  res.status(404).json({
    success: false,
    message: 'Route not found',
    userMessage: 'The page you are looking for does not exist. Please check the URL or contact support.'
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  // Ensure CORS headers are present even in error responses
  const origin = req.headers.origin;
  if (origin) {
    if (process.env.NODE_ENV === 'development') {
      res.header('Access-Control-Allow-Origin', origin);
      res.header('Access-Control-Allow-Credentials', 'true');
    } else {
      const allowed = parseAllowedOrigins();
      const ok = allowed?.some((rule) =>
        rule instanceof RegExp ? rule.test(origin) : rule === origin
      );
      if (ok) {
        res.header('Access-Control-Allow-Origin', origin);
        res.header('Access-Control-Allow-Credentials', 'true');
      }
    }
  }

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
