import { securityLog } from '../utils/securityUtils.js';

/**
 * Branch Isolation Middleware
 * Ensures branch users are restricted to their own data.
 * School Admins can switch between branches via X-Branch-ID header.
 */
export const branchIsolation = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Auth required' });
  }

  const { role, branch, branchScope } = req.user;

  // 1. Super Admin bypass
  if (role === 'superadmin' || role === 'super_admin') {
    return next();
  }

  // 2. School Admin / ALL_BRANCHES scope
  // They can specify a branch via header or view all
  if (role === 'schooladmin' || role === 'school_admin' || role === 'admin' || branchScope === 'ALL_BRANCHES') {
    const headerBranchId = req.headers['x-branch-id'] || req.headers['X-Branch-ID'];
    
    if (headerBranchId && headerBranchId !== 'all') {
      req.branchId = headerBranchId;
    } else {
      req.branchId = null; // View all branches in the tenant
    }
    return next();
  }

  // 3. Branch Specific Users
  if (branchScope === 'SPECIFIC') {
    if (!branch) {
      return res.status(403).json({
        success: false,
        message: 'No branch assigned',
        userMessage: 'You are not assigned to any branch.'
      });
    }

    // Hard-lock to their assigned branch
    req.branchId = branch._id || branch;
    
    // Security: If they tried to request a different branch via header, block them
    const headerBranchId = req.headers['x-branch-id'] || req.headers['X-Branch-ID'];
    if (headerBranchId && headerBranchId !== 'all' && headerBranchId.toString() !== req.branchId.toString()) {
      securityLog('branch_access_violation', {
        userId: req.user._id,
        userBranch: req.branchId,
        requestedBranch: headerBranchId,
        path: req.path
      });
      return res.status(403).json({
        success: false,
        message: 'Branch access denied',
        userMessage: 'You are not authorized to access data from other branches.'
      });
    }
  }

  next();
};
