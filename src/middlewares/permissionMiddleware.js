import { securityLog } from '../utils/securityUtils.js';

/**
 * Dynamic Permission Middleware
 * Checks if the user has the required permission for the route.
 * Super Admins bypass all checks.
 * School Admins bypass most checks within their tenant (except specific system constraints).
 */
export const checkPermission = (requiredPermission) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const { role, effectivePermissions } = req.user;

    // 1. Super Admin bypass
    if (role === 'superadmin' || role === 'super_admin') {
      return next();
    }

    // 2. School Admin bypass (Tenant Owner)
    // School admins have full authority within their tenant
    if (role === 'schooladmin' || role === 'school_admin' || role === 'admin') {
      return next();
    }

    // 3. Permission Check
    // Handle both single permission string and array of permissions
    const permissions = Array.isArray(requiredPermission) 
      ? requiredPermission 
      : [requiredPermission];

    const userPermissions = effectivePermissions || [];

    // Check if user has ANY of the required permissions
    const hasPermission = permissions.some(p => {
      // Direct match
      if (userPermissions.includes(p)) return true;
      
      // Wildcard match (e.g., 'students.*' matches 'students.view')
      const [module, action] = p.split('.');
      if (userPermissions.includes(`${module}.*`)) return true;
      if (userPermissions.includes('*.manage')) return true; // Global manage
      
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
        userMessage: `You do not have permission (${Array.isArray(requiredPermission) ? requiredPermission.join(' or ') : requiredPermission}) to perform this action.`
      });
    }

    next();
  };
};

/**
 * Multi-Permission Check (Requires ALL of the listed permissions)
 */
export const requireAllPermissions = (requiredPermissions) => {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ success: false, message: 'Auth required' });
    
    if (['superadmin', 'schooladmin', 'school_admin', 'admin'].includes(req.user.role)) {
      return next();
    }

    const userPermissions = req.user.effectivePermissions || [];
    const hasAll = requiredPermissions.every(p => userPermissions.includes(p));

    if (!hasAll) {
      return res.status(403).json({
        success: false,
        message: 'Missing required permissions',
        userMessage: 'You do not have all the required permissions for this action.'
      });
    }

    next();
  };
};
