import SystemConfig from '../models/SystemConfig.js';
import jwt from 'jsonwebtoken';

/**
 * Paths that should NEVER be blocked by maintenance mode.
 * - Health checks
 * - Auth routes (login/register) so users can still authenticate
 * - Public routes
 * - The maintenance toggle endpoint itself (to prevent lockout)
 */
const SKIP_PATHS = [
  '/api/v1/health',
  '/api/health',
  '/health',
  '/api/v1/auth/login',
  '/api/v1/auth/register',
  '/api/v1/auth/tenant',
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/tenant',
  '/api/v1/super-admin/login',
  '/api/v1/super-admin/register',
  '/api/v1/super-admin/check-exists',
  '/api/super-admin/login',
  '/api/super-admin/check-exists',
  '/api/v1/super-admin/maintenance/toggle',
  '/api/super-admin/maintenance/toggle',
];

const isSkippedPath = (path) => {
  // Exact match
  if (SKIP_PATHS.includes(path)) return true;
  // All auth routes should be accessible during maintenance
  if (path.startsWith('/api/v1/auth/') || path.startsWith('/api/auth/')) return true;
  // Public routes
  if (path.includes('/public/') || path.includes('/public-content/')) return true;
  return false;
};

/**
 * Try to extract and verify JWT to determine if the requester is a super admin.
 * This is necessary because the maintenance middleware runs BEFORE the normal
 * auth middleware, so req.user is not yet populated.
 */
const isSuperAdminFromToken = (req) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return false;
    const token = authHeader.split(' ')[1];
    if (!token || !process.env.JWT_SECRET) return false;
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const role = decoded.role;
    return role === 'superadmin' || role === 'super_admin' || decoded.isSuperAdmin === true;
  } catch {
    return false;
  }
};

/**
 * Middleware to check if the system is in maintenance mode.
 * Super Admins bypass this check (verified via JWT directly since this
 * middleware runs before the normal auth middleware).
 */
export const checkMaintenanceMode = async (req, res, next) => {
  try {
    // Skip OPTIONS (CORS preflight) requests
    if (req.method === 'OPTIONS') return next();

    // Skip health, auth, public, and maintenance-toggle endpoints
    if (isSkippedPath(req.path)) return next();

    const maintenanceConfig = await SystemConfig.findOne({ key: 'maintenance_mode' });

    if (maintenanceConfig && maintenanceConfig.value === true) {
      // Check if already authenticated (rare, but in case auth ran earlier)
      if (req.user && (req.user.role === 'superadmin' || req.user.role === 'super_admin' || req.user.isSuperAdmin)) {
        return next();
      }

      // Verify JWT directly — this middleware runs before protect()
      if (isSuperAdminFromToken(req)) {
        return next();
      }

      // Block all other users
      return res.status(503).json({
        success: false,
        message: 'System Maintenance In Progress. Please try again later.',
        isMaintenance: true
      });
    }

    next();
  } catch (error) {
    console.error('[MaintenanceMiddleware] Error:', error);
    next(); // Proceed if check fails to avoid total lockout
  }
};
