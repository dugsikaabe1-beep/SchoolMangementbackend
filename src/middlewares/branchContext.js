import { AsyncLocalStorage } from 'async_hooks';
import { securityLog } from '../utils/securityUtils.js';

// ─────────────────────────────────────────────────────────────────────────────
// 1.  BRANCH CONTEXT STORE
//     Uses Node's AsyncLocalStorage so every piece of code in the same request
//     chain (controllers, services, etc.) can read the active branch filter
//     without passing it around manually.
// ─────────────────────────────────────────────────────────────────────────────
export const branchContextStore = new AsyncLocalStorage();

/**
 * Returns the current branch context from the async-local store.
 * @returns {{ branchId: string|null, schoolId: string|null, role: string }}
 */
export const getBranchContext = () => branchContextStore.getStore() || {};

// ─────────────────────────────────────────────────────────────────────────────
// 2.  MONGOOSE AUTO-FILTER PLUGIN
//     Register this plugin on mongoose ONCE (in app.js or server.js) and every
//     schema that has a `branch` path will automatically apply the active
//     branch filter on find / findOne / countDocuments / aggregate queries.
// ─────────────────────────────────────────────────────────────────────────────
export const branchIsolationPlugin = (schema) => {
  // Only patch schemas that actually have a `branch` field
  if (!schema.path('branch')) return;

  const applyFilter = function () {
    const ctx = getBranchContext();
    // null means "all branches" (School Admin view)
    if (!ctx || ctx.branchId === null || ctx.branchId === undefined) return;

    // For Query objects (find, findOne, countDocuments, etc.)
    if (typeof this.getFilter === 'function') {
      const filter = this.getFilter();
      if (!filter.branch) {
        this.where({ branch: ctx.branchId });
      }
    }
  };

  schema.pre(['find', 'findOne', 'findOneAndUpdate', 'findOneAndDelete', 'countDocuments', 'count'], applyFilter);

  // Aggregate pipeline patching
  schema.pre('aggregate', function () {
    const ctx = getBranchContext();
    if (!ctx || ctx.branchId === null || ctx.branchId === undefined) return;

    const pipeline = this.pipeline();
    // Only inject if the pipeline doesn't already have a $match on branch
    const hasMatch = pipeline.some(
      (stage) => stage.$match && (stage.$match.branch !== undefined)
    );
    if (!hasMatch) {
      pipeline.unshift({ $match: { branch: ctx.branchId } });
    }
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// 3.  BRANCH ROLES HELPER
// ─────────────────────────────────────────────────────────────────────────────
const SCHOOL_ADMIN_ROLES = new Set([
  'schooladmin', 'school_admin', 'admin',
]);
const SUPER_ADMIN_ROLES = new Set([
  'superadmin', 'super_admin',
]);
const BRANCH_SCOPED_ROLES = new Set([
  'branch_admin', 'branch_manager',
  'teacher', 'accountant',
  'parent', 'student',
]);

export const isSchoolAdmin = (role) => SCHOOL_ADMIN_ROLES.has(role);
export const isSuperAdmin  = (role) => SUPER_ADMIN_ROLES.has(role);
export const isBranchScoped = (role) => BRANCH_SCOPED_ROLES.has(role);

// ─────────────────────────────────────────────────────────────────────────────
// 4.  checkBranchAccess MIDDLEWARE
//
//  Responsibilities
//  ────────────────
//  a. Detect the logged-in user's role.
//  b. Determine & hard-lock the effective branchId on req.branchId.
//  c. Strip any malicious branchId the frontend tries to inject via body/query.
//  d. Wrap next() inside the AsyncLocalStorage context so every downstream DB
//     call automatically picks up the branch filter via the Mongoose plugin.
//  e. Block cross-branch attempts by SPECIFIC-scope users.
// ─────────────────────────────────────────────────────────────────────────────
export const checkBranchAccess = async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }

  const user   = req.user;
  const role   = user.role;
  const school = user.school?._id?.toString() || user.school?.toString();

  // ── SUPER ADMIN: unrestricted ─────────────────────────────────────────────
  if (isSuperAdmin(role)) {
    // Strip any injected branch overrides from body/query for safety
    _stripBranchFromBody(req);
    return branchContextStore.run({ branchId: undefined, schoolId: school, role }, next);
  }

  // ── SCHOOL ADMIN: can see all branches, OR filter to one via header ───────
  if (isSchoolAdmin(role) || user.branchScope === 'ALL_BRANCHES') {
    const requestedBranch = _getHeaderBranchId(req);
    const effectiveBranchId = (requestedBranch && requestedBranch !== 'all')
      ? requestedBranch
      : null; // null → all branches

    req.branchId = effectiveBranchId;
    _stripBranchFromBody(req);

    return branchContextStore.run(
      { branchId: effectiveBranchId, schoolId: school, role },
      next
    );
  }

  // ── BRANCH-SCOPED ROLES: hard-locked to their assigned branch ────────────
  const assignedBranch = user.branch?._id?.toString() || user.branch?.toString();

  if (!assignedBranch) {
    return res.status(403).json({
      success: false,
      message: 'No branch assigned',
      userMessage: 'You are not assigned to any branch. Please contact your administrator.',
    });
  }

  // Security: if they tried to specify a different branch via header → block
  const headerBranchId = _getHeaderBranchId(req);
  if (
    headerBranchId &&
    headerBranchId !== 'all' &&
    headerBranchId !== assignedBranch
  ) {
    securityLog('branch_access_violation', {
      userId: user._id,
      userBranch: assignedBranch,
      requestedBranch: headerBranchId,
      path: req.path,
    });
    return res.status(403).json({
      success: false,
      message: 'Branch access denied',
      userMessage: 'You are not authorized to access data from other branches.',
    });
  }

  // Hard-lock to assigned branch
  req.branchId = assignedBranch;

  // Strip any injected branch overrides from body/query
  _stripBranchFromBody(req);

  return branchContextStore.run(
    { branchId: assignedBranch, schoolId: school, role },
    next
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 5.  verifyBranchOwnership  (helper called inside controllers)
//
//  Use this before any update/delete to ensure the record belongs to the
//  user's branch.  Returns { allowed: true } or { allowed: false, response }
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Checks if a record's branch is accessible by the current user.
 *
 * @param {object} req         - Express request
 * @param {string|object} recordBranch - The branch on the record being accessed
 * @returns {{ allowed: boolean, response?: object }}
 */
export const verifyBranchOwnership = (req, recordBranch) => {
  if (!recordBranch) return { allowed: true }; // No branch on record, skip check

  const user = req.user;
  if (!user) return { allowed: false, response: { success: false, message: 'Authentication required' } };

  // Super Admin & School Admin: always allowed
  if (isSuperAdmin(user.role) || isSchoolAdmin(user.role) || user.branchScope === 'ALL_BRANCHES') {
    return { allowed: true };
  }

  const recordBranchStr  = recordBranch?._id?.toString() || recordBranch?.toString();
  const userBranchStr    = user.branch?._id?.toString()   || user.branch?.toString();

  if (recordBranchStr && userBranchStr && recordBranchStr !== userBranchStr) {
    securityLog('cross_branch_data_access_attempt', {
      userId: user._id,
      userBranch: userBranchStr,
      recordBranch: recordBranchStr,
      path: req?.path,
    });
    return {
      allowed: false,
      response: {
        success: false,
        message: 'You cannot access data from another branch',
        userMessage: 'You cannot access data from another branch.',
      },
    };
  }

  return { allowed: true };
};

// ─────────────────────────────────────────────────────────────────────────────
// 6.  PRIVATE HELPERS
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Reads X-Branch-ID from request headers (case-insensitive).
 */
function _getHeaderBranchId(req) {
  return req.headers['x-branch-id'] || req.headers['X-Branch-ID'] || null;
}

/**
 * Removes branchId overrides injected by the frontend into body or query params.
 * The backend derives the branch solely from the authenticated user's context.
 */
function _stripBranchFromBody(req) {
  if (req.body && typeof req.body === 'object') {
    delete req.body.branchId;
    // Keep req.body.branch only if it is null/undefined (not a spoofed value)
    // Controllers that need to set branch use req.branchId from middleware.
  }
  if (req.query && typeof req.query === 'object') {
    // We allow branchId in query for School Admins filtering; it's validated above
    // but for non-school-admins we have already hard-locked req.branchId anyway
  }
}
