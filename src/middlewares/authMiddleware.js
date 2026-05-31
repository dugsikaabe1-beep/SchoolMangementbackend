import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { securityLog } from '../utils/securityUtils.js';

const isSuperRole = (role) => role === 'superadmin' || role === 'super_admin';

/**
 * Authentication Middleware
 * Verifies JWT and ensures the user belongs to the current tenant
 */
export const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Not authorized, no token provided',
      userMessage: 'Please login to access this resource.',
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.type && decoded.type !== 'access') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token type',
        userMessage: 'Please login again.',
      });
    }

    const detectedTenant = req.tenantId;
    if (
      detectedTenant &&
      decoded.tenantId != null &&
      String(decoded.tenantId).length > 0 &&
      detectedTenant.toLowerCase() !== String(decoded.tenantId).toLowerCase()
    ) {
      securityLog('jwt_tenant_mismatch', {
        detectedTenant,
        tokenTenant: decoded.tenantId,
        path: req.path,
      });
      return res.status(403).json({
        success: false,
        message: 'Security Alert: Tenant mismatch',
        userMessage: 'You are not authorized to use this session for this school.',
      });
    }

    const user = await User.findById(decoded.id)
      .select('-password')
      .populate('school', 'name subdomain isActive');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User no longer exists',
        userMessage: 'Your account was not found. Please contact support.',
      });
    }

    if (user.status === 'inactive' || user.status === 'suspended') {
      return res.status(401).json({
        success: false,
        message: 'User account is inactive',
        userMessage:
          'Your account has been deactivated. Please contact your administrator.',
      });
    }

    const expectedTv = user.tokenVersion ?? 0;
    const tokenTv = decoded.tv ?? 0;
    if (expectedTv !== tokenTv) {
      securityLog('jwt_token_version_stale', { userId: String(user._id), path: req.path });
      return res.status(401).json({
        success: false,
        message: 'Session invalidated',
        userMessage: 'Your session was ended. Please login again.',
      });
    }

    if (!isSuperRole(user.role)) {
      const allowHostlessTenant =
        process.env.NODE_ENV !== 'production' ||
        process.env.ALLOW_API_WITHOUT_HOST_TENANT === 'true';

      let effectiveSchoolId = req.schoolId;

      // Local / single-origin API: Host has no school subdomain; scope from verified user + JWT
      if (!effectiveSchoolId && allowHostlessTenant && user.school?._id) {
        const tokenSchool = decoded.schoolId
          ? String(decoded.schoolId)
          : null;
        if (
          tokenSchool &&
          user.school._id.toString() !== tokenSchool
        ) {
          securityLog('jwt_school_mismatch_no_host_tenant', {
            userId: String(user._id),
            path: req.path,
          });
          return res.status(403).json({
            success: false,
            message: 'Security Alert: School scope mismatch',
            userMessage: 'You are not authorized to use this session for this request.',
          });
        }
        effectiveSchoolId = user.school._id;
        req.schoolId = user.school._id;
        req.tenantId = user.school.subdomain;
      }

      if (!effectiveSchoolId) {
        // Allow school admins to proceed without a tenant context IF they are on the profile setup routes
        // or uploading a logo during setup
        const isProfileSetupRoute =
          req.originalUrl &&
          (req.originalUrl.includes('/school-profile-status') ||
            req.originalUrl.includes('/complete-school-profile') ||
            req.originalUrl.includes('/public-content/upload'));

        const isAdmin = ['schooladmin', 'school_admin', 'admin'].includes(user.role);

        if (isAdmin && isProfileSetupRoute) {
          // Allow proceeding to setup routes
        } else {
          return res.status(403).json({
            success: false,
            message: 'Tenant context missing',
            userMessage: 'Please access this via your school subdomain.',
          });
        }
      }

      if (
        effectiveSchoolId &&
        (!user.school || user.school._id.toString() !== effectiveSchoolId.toString())
      ) {
        securityLog('cross_tenant_user_blocked', {
          userId: String(user._id),
          role: user.role,
          requestSchoolId: String(effectiveSchoolId),
        });
        return res.status(403).json({
          success: false,
          message: 'Cross-tenant access forbidden',
          userMessage: 'You are not authorized to access data for this school.',
        });
      }
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Auth Error:', error.message);

    let userMessage =
      'Your session has expired or is invalid. Please login again.';
    if (error.name === 'TokenExpiredError')
      userMessage = 'Your session has expired. Please login again.';

    return res.status(401).json({
      success: false,
      message: 'Not authorized, token failed',
      userMessage,
    });
  }
};

/**
 * RBAC — super-admin does NOT implicitly pass school-scoped role checks.
 * List `superadmin` or `super_admin` in `roles` only for platform-level routes that should allow it.
 */
export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required for authorization check',
      });
    }

    const userRole = req.user.role;
    if (isSuperRole(userRole)) {
      const allowed = roles.some((r) => isSuperRole(r));
      if (!allowed) {
        securityLog('rbac_superadmin_blocked', {
          userId: String(req.user._id),
          path: req.path,
          requiredRoles: roles,
        });
        return res.status(403).json({
          success: false,
          message: 'Super admin cannot access this school API',
          userMessage: 'You do not have the required permissions to perform this action.',
        });
      }
      return next();
    }

    if (!roles.includes(userRole)) {
      securityLog('rbac_role_denied', {
        userId: String(req.user._id),
        role: userRole,
        path: req.path,
        requiredRoles: roles,
      });
      return res.status(403).json({
        success: false,
        message: `User role ${userRole} is not authorized to access this route`,
        userMessage: 'You do not have the required permissions to perform this action.',
      });
    }
    next();
  };
};

export const allowStudent = authorize('student');
export const allowTeacher = authorize('teacher');
export const allowAdmin = authorize('admin', 'schooladmin', 'school_admin');
export const allowAccountant = authorize(
  'accountant',
  'admin',
  'schooladmin',
  'school_admin'
);
export const allowParent = authorize('parent');
export const allowSuperAdmin = authorize('superadmin', 'super_admin');
