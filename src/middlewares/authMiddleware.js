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
    const tokenTenantId = decoded.tenantId ? String(decoded.tenantId).toLowerCase() : null;
    const tokenSubdomain = decoded.subdomain ? String(decoded.subdomain).toLowerCase() : null;

    if (
      detectedTenant &&
      tokenTenantId &&
      detectedTenant.toLowerCase() !== tokenTenantId &&
      detectedTenant.toLowerCase() !== tokenSubdomain
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

    let user;
    if (decoded.role === 'branch_manager') {
      const Branch = (await import('../models/Branch.js')).default;
      const branch = await Branch.findById(decoded.id || decoded.userId).populate('tenant', 'name subdomain isActive');
      
      if (branch) {
        let branchPermissions = [
          'students.view', 'students.create', 'students.edit', 
          'teachers.view', 
          'classes.view', 
          'subjects.view', 
          'attendance.view', 'attendance.create', 
          'exams.view', 'exams.create', 
          'finance.view',
          'schedules.view',
          'settings.view'
        ];
        
        if (branch.rbacRole) {
          try {
            const Role = (await import('../models/Role.js')).default;
            const role = await Role.findById(branch.rbacRole);
            if (role && role.permissions) branchPermissions = role.permissions;
          } catch (e) {
            console.error('Error loading branch permissions', e);
          }
        }

        user = {
          _id: branch._id,
          name: branch.name,
          email: branch.loginEmail,
          role: 'branch_manager',
          branch: branch,
          school: branch.tenant,
          branchScope: 'SPECIFIC',
          rbacRole: branch.rbacRole,
          permissions: branchPermissions,
          tokenVersion: 0
        };
      }
    } else {
      user = await User.findById(decoded.id || decoded.userId)
        .select('-password')
        .populate('school', 'name subdomain isActive')
        .populate('branch', 'name status');
    }

    if (!user) {
      console.warn(`[Auth] User no longer exists for ID: ${decoded.id}`);
      return res.status(401).json({
        success: false,
        message: 'User no longer exists',
        userMessage: 'Your account was not found. Please contact support.',
      });
    }

    // Branch Validation
    if (user.branch && user.branch.status !== 'active') {
      return res.status(403).json({
        success: false,
        message: 'Branch is not active',
        userMessage: 'Your assigned branch is currently inactive. Please contact your administrator.',
      });
    }

    // Auto-assign Main Branch if user doesn't have a branch yet
    if (!user.branch && user.school) {
      const Branch = (await import('../models/Branch.js')).default;
      let mainBranch = await Branch.findOne({ 
        tenant: user.school._id, 
        isMain: true 
      });

      // If no Main Branch, create one
      if (!mainBranch) {
        mainBranch = await Branch.create({
          tenant: user.school._id,
          name: 'Main Branch',
          code: 'MAIN',
          isMain: true,
          status: 'active'
        });
        console.log(`✅ Auto-created Main Branch for school: ${user.school.name}`);
      }

      // Update user's branch
      if (user._id) { // Only update if it's a real User (not Branch login)
        await User.findByIdAndUpdate(user._id, { 
          branch: mainBranch._id 
        });
        user.branch = mainBranch;
        console.log(`✅ Assigned Main Branch to user: ${user.name}`);
      }
    }

    // Set context on request
    req.user = user;
    
    // Proactively load effective permissions for RBAC enforcement
    if (typeof user.getEffectivePermissions === 'function') {
      req.user.effectivePermissions = await user.getEffectivePermissions();
    } else {
      req.user.effectivePermissions = user.permissions || [];
    }
    
    req.schoolId = user.school?._id;
    req.branchId = user.branch?._id || decoded.branchId;

    const expectedTv = user.tokenVersion ?? 0;
    const tokenTv = decoded.tv ?? 0;
    if (expectedTv !== tokenTv) {
      console.warn(`[Auth] Stale token version for ${user.name}: Token=${tokenTv}, Expected=${expectedTv}`);
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
        console.log(`[Auth] No host tenant, applying user school scope: ${user.school.subdomain}`);
        effectiveSchoolId = user.school._id;
        req.schoolId = user.school._id;
        req.tenantId = user.school.subdomain;
      }

      if (!effectiveSchoolId) {
        console.warn(`[Auth] MISSING TENANT CONTEXT for ${user.name} at ${req.path}`);
        // Allow school admins to proceed without a tenant context IF they are on the profile setup routes
        // or uploading a logo during setup
        const isProfileSetupRoute =
          req.originalUrl &&
          (req.originalUrl.includes('/school-profile-status') ||
            req.originalUrl.includes('/profile-status') ||
            req.originalUrl.includes('/complete-school-profile') ||
            req.originalUrl.includes('/complete-profile') ||
            req.originalUrl.includes('/public-content/upload'));

        const isAdmin = ['schooladmin', 'school_admin', 'admin'].includes(user.role);

        if (isAdmin && isProfileSetupRoute) {
          // Allow proceeding to setup routes
        } else if (isAdmin && allowHostlessTenant) {
          // Senior Fix: Allow school admins to operate without a host-based subdomain 
          // when in development mode. This enables root-domain login.
          if (user.school?._id) {
            req.schoolId = user.school._id;
            req.tenantId = user.school.subdomain;
          }
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
        console.error(`[Auth] CROSS-TENANT BLOCK: User ${user.name} (${user.school?.subdomain}) -> Req ${req.tenantId}`);
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
 * branchIsolation — canonical implementation lives in branchContext.js.
 * Re-exported here for backward compatibility with routes that import from authMiddleware.
 */
export { checkBranchAccess as branchIsolation } from './branchContext.js';



export const checkPermission = (requiredPermission) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Auth required' });
    }

    const { role, effectivePermissions } = req.user;

    // Super Admin bypass
    if (role === 'superadmin' || role === 'super_admin') {
      return next();
    }

    // School Admin / Admin bypass
    if (['schooladmin', 'school_admin', 'admin'].includes(role)) {
      return next();
    }

    const permissions = Array.isArray(requiredPermission) ? requiredPermission : [requiredPermission];
    const userPermissions = effectivePermissions || [];

    const hasPermission = permissions.some(p => {
      if (userPermissions.includes(p)) return true;
      const [module] = p.split('.');
      if (userPermissions.includes(`${module}.*`)) return true;
      if (userPermissions.includes('*.manage') || userPermissions.includes('*.*')) return true;
      return false;
    });

    if (!hasPermission) {
      securityLog('rbac_permission_denied', {
        userId: String(req.user._id),
        path: req.path,
        role,
        requiredPermission,
        userPermissions: userPermissions.length > 20 ? 'too_many_to_log' : userPermissions
      });
      return res.status(403).json({
        success: false,
        message: 'Permission denied',
        userMessage: `You do not have permission (${Array.isArray(requiredPermission) ? requiredPermission.join(', ') : requiredPermission}) for this action.`
      });
    }

    next();
  };
};

/**
 * Legacy Role-based Authorization (for backward compatibility)
 */
export const authorizeRoles = (...roles) => {
  const allowedRoles = roles.flat();

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const userRole = req.user.role;
    if (isSuperRole(userRole)) {
      const allowed = allowedRoles.some((r) => isSuperRole(r));
      if (!allowed) {
        securityLog('rbac_superadmin_blocked', {
          userId: String(req.user._id),
          path: req.path,
          requiredRoles: allowedRoles,
        });
        return res.status(403).json({
          success: false,
          message: 'Access denied for super-admin on this route',
        });
      }
      return next();
    }

    if (!allowedRoles.includes(userRole)) {
      securityLog('rbac_role_denied', {
        userId: String(req.user._id),
        path: req.path,
        userRole,
        requiredRoles: allowedRoles,
      });
      return res.status(403).json({
        success: false,
        message: 'Unauthorized role',
        userMessage: 'You do not have the required role to access this resource.',
      });
    }

    next();
  };
};

export const authorize = authorizeRoles;
export const allowStudent = authorizeRoles('student');
export const allowTeacher = authorizeRoles('teacher');
export const allowAdmin = authorizeRoles('admin', 'schooladmin', 'school_admin');
export const allowAccountant = authorizeRoles(
  'accountant',
  'admin',
  'schooladmin',
  'school_admin'
);
export const allowParent = authorizeRoles('parent');
export const allowSuperAdmin = authorizeRoles('superadmin', 'super_admin');
