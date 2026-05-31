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

// Load environment variables
dotenv.config();

// Import routes
import authRoutes from './routes/authRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import teacherRoutes from './routes/teacherRoutes.js';
import studentRoutes from './routes/studentRoutes.js';
import superAdminRoutes from './routes/superAdminRoutes.js';
import schoolAdminRoutes from './routes/schoolAdminRoutes.js';
import schoolProfileRoutes from './routes/schoolProfileRoutes.js';
import publicRoutes from './routes/publicRoutes.js';
import schoolPublicContentRoutes from './routes/schoolPublicContentRoutes.js';
import mobileRoutes from './routes/mobileRoutes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { detectTenant } from './middlewares/tenantMiddleware.js';

// Initialize Express app
const app = express();

if (process.env.TRUST_PROXY === '1') {
  app.set('trust proxy', 1);
}

// --- 1. GLOBAL SECURITY MIDDLEWARE ---

// Security Headers (Helmet)
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:", "res.cloudinary.com"],
      connectSrc: ["'self'", "https://api.cloudinary.com"],
    },
  },
}));

// CORS — explicit allow-list via CORS_ALLOWED_ORIGINS (see config/corsConfig.js)
const allowedOrigins = parseAllowedOrigins();
if (!allowedOrigins) {
  console.error('Refusing to start: configure CORS_ALLOWED_ORIGINS for production.');
  process.exit(1);
}

app.use(
  cors({
    origin: originMatcher(allowedOrigins),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-tenant-id',
      'X-Tenant-ID',
      'x-dev-tenant-subdomain',
      'X-Dev-Tenant-Subdomain',
    ],
  })
);

// Rate Limiting - Prevent API Abuse
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.originalUrl?.startsWith('/api/health'),
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again after 15 minutes'
  }
});
app.use('/api/', apiLimiter);

// Auth Rate Limiting - Prevent Brute Force
const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // limit each IP to 20 login attempts per hour
  message: {
    success: false,
    message: 'Too many login attempts, please try again in an hour'
  }
});
app.use('/api/auth/login', authLimiter);

// Body Parsing & Sanitization
app.use(express.json({ limit: '1mb' })); // Limit body size to 1MB
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());

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

// API routes
app.use('/api/mobile', mobileRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/school-admin/public-content', schoolPublicContentRoutes);
app.use('/api/admin', schoolProfileRoutes);
app.use('/api/teachers', teacherRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/super-admin', superAdminRoutes);
app.use('/api/school-admin', schoolAdminRoutes);

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
  
  // If it's a 400 error and mapErrorMessage returned the default, 
  // use the original error message as it's likely a custom validation message
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
