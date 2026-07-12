import School from '../models/School.js';
import Branch from '../models/Branch.js';
import User from '../models/User.js';
import { isValidSubdomainLabel, securityLog } from '../utils/securityUtils.js';

const RESERVED = new Set([
  'admin',
  'localhost',
  '127',
  'superadmin',
  'super-admin',
  'api',
  'www',
  'app',
  'cdn',
  'static',
  'mail',
]);

/**
 * Trusted hostname for tenant resolution (Cloudflare / Railway / reverse proxy).
 * Prefer X-Forwarded-Host only when trust proxy is enabled in Express.
 */
const getForwardedHost = (req) => {
  const xf = req.headers['x-forwarded-host'];
  if (!xf || typeof xf !== 'string') return null;
  // Multiple proxies may join hosts; use first hop only
  const first = xf.split(',')[0].trim().toLowerCase();
  return first.split(':')[0] || null;
};

const getHost = (req) => {
  const direct = (req.hostname || '').toLowerCase();
  if (req.app?.get?.('trust proxy')) {
    const forwarded = getForwardedHost(req);
    if (forwarded) return forwarded;
  }
  return direct;
};

/** Loopback API or Platform Host (e.g. Vercel) — not the super-admin product host */
const isBareLocalDevHost = (host) => {
  if (!host) return false;
  return (
    host === 'localhost' ||
    host.endsWith('.vercel.app') ||
    host.startsWith('127.0.0.1') ||
    /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(host)
  );
};

/**
 * Derive school subdomain from Host using ROOT_DOMAIN (e.g. ROOT_DOMAIN=mydomain.com
 * for hormuud.mydomain.com → hormuud).
 */
const subdomainFromRootDomain = (host, rootDomain) => {
  if (!host || !rootDomain) return null;
  const root = rootDomain.toLowerCase().replace(/^\.+/, '');
  if (host === root) return null;
  const suffix = `.${root}`;
  if (!host.endsWith(suffix)) return null;
  const sub = host.slice(0, -suffix.length);
  if (!sub || sub.includes('.')) return null;
  return sub.toLowerCase();
};

/**
 * Mobile / Expo Go: resolve tenant from trusted headers when host has no subdomain.
 * - Dev: ALLOW_DEV_TENANT_HEADER=true → x-dev-tenant-subdomain or x-tenant-id
 * - Prod mobile builds: ALLOW_MOBILE_TENANT_HEADER=true → x-tenant-id only
 */
const mobileHeaderSubdomain = (req) => {
  const allowDev =
    process.env.NODE_ENV !== 'production' ||
    process.env.ALLOW_DEV_TENANT_HEADER === 'true';
  const allowMobile = process.env.ALLOW_MOBILE_TENANT_HEADER === 'true' || process.env.NODE_ENV === 'development';

  if (!allowDev && !allowMobile) return null;

  const candidates = [];
  if (allowDev || process.env.NODE_ENV === 'development') {
    candidates.push(req.headers['x-dev-tenant-subdomain']);
  }
  if (allowDev || allowMobile) {
    candidates.push(req.headers['x-tenant-id']);
    candidates.push(req.headers['X-Tenant-ID']);
    candidates.push(req.headers['x-school-slug']);
  }

  for (const h of candidates) {
    if (typeof h !== 'string') continue;
    const v = h.trim().toLowerCase();
    if (isValidSubdomainLabel(v)) return v;
  }
  return null;
};

/**
 * Tenant Detection — production tenant MUST come from Host (or dev-only explicit header).
 * Never trust X-Tenant-ID / X-Tenant-Subdomain from clients in production.
 */
export const detectTenant = async (req, res, next) => {
  // Skip tenant detection for OPTIONS requests to avoid issues with CORS preflight
  if (req.method === 'OPTIONS') {
    return next();
  }

  // For auth routes, still process tenant from headers/body but don't require it for super admin
  const isAuthRoute = req.originalUrl && (
    req.originalUrl.includes('/api/auth') || 
    req.originalUrl.includes('/api/v1/auth') ||
    req.originalUrl.includes('/api/super-admin/login') ||
    req.originalUrl.includes('/api/v1/super-admin/login')
  );

  const host = getHost(req);
  const rootDomain = (process.env.ROOT_DOMAIN || '').trim().toLowerCase();

  let subdomain = null;

  if (rootDomain) {
    subdomain = subdomainFromRootDomain(host, rootDomain);
  } else {
    // Legacy: first label of host (fragile on multi-part TLDs — set ROOT_DOMAIN in production)
    // Only attempt this if host is not a bare IP or localhost
    if (host && !isBareLocalDevHost(host)) {
      const parts = host.split('.');
      if (parts.length >= 3) subdomain = parts[0].toLowerCase();
    }
  }

  if (!subdomain) {
    subdomain = mobileHeaderSubdomain(req) || req.query.school || req.query.tenantId || req.body.tenantId;
    if (subdomain && process.env.NODE_ENV === 'development') {
      console.log(`[Tenant] Subdomain found in headers/query/body: ${subdomain}`);
    }
  }

  // Debugging: Log the detection process
  if (process.env.NODE_ENV === 'development') {
    console.log(`[Tenant] Detection: host=${host}, root=${rootDomain}, resolved_subdomain=${subdomain || 'none'}, isAuthRoute=${isAuthRoute}`);
  }

  // Try to set school context even for auth routes
  if (subdomain) {
    try {
      const school = await School.findOne({
        subdomain,
        isActive: true,
      }).select('_id name subdomain isActive subscription');

      if (school) {
        console.log(`[Tenant] School FOUND: ${school.name} (${school._id})`);
        req.school = school;
        req.schoolId = school._id;
        req.tenantId = school.subdomain;
      }
    } catch (error) {
      console.warn('[Tenant] Error fetching school for auth route:', error);
    }
  }



  // Bare localhost / 127.0.0.1 / IP: skip school lookup entirely
  if (isBareLocalDevHost(host)) {
    console.log(`[Tenant] Bare local dev host detected, skipping school isolation.`);
    req.isSuperAdminRoute = false;
    return next();
  }

  if (!subdomain || RESERVED.has(subdomain) || !isValidSubdomainLabel(subdomain)) {
    console.log(`[Tenant] No valid subdomain or reserved keyword "${subdomain}", routing to Super Admin.`);
    req.isSuperAdminRoute = true;
    return next();
  }

  try {
    const school = await School.findOne({
      subdomain,
      isActive: true,
    }).select('_id name subdomain isActive subscription');

    if (!school) {
      console.warn(`[Tenant] School NOT FOUND for subdomain: ${subdomain} (skipping 404 for now)`);
      securityLog('tenant_unknown_subdomain', { subdomain, host });
      req.isSuperAdminRoute = false;
      return next();
    }

    console.log(`[Tenant] School FOUND: ${school.name} (${school._id})`);
    req.school = school;
    req.schoolId = school._id;
    req.tenantId = school.subdomain;
    req.isSuperAdminRoute = false;

    // Mass-assignment hardening: never accept tenant scope from JSON body
    // EXCEPT for login routes where tenantId might be provided explicitly on a shared domain
    const isAuthRoute = req.originalUrl && req.originalUrl.includes('/api/auth/login');
    if (req.body && typeof req.body === 'object' && !isAuthRoute) {
      delete req.body.schoolId;
      delete req.body.tenantId;
      delete req.body.school;
    }

    next();
  } catch (error) {
    console.error('CRITICAL: Tenant detection failure:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during tenant isolation',
    });
  }
};

export const requireTenant = (req, res, next) => {
  if (!req.schoolId) {
    return res.status(403).json({
      success: false,
      message: 'Access Denied: Tenant context required',
      userMessage: 'Please access this API via a valid school subdomain.',
    });
  }
  next();
};

/**
 * Helper function to resolve branch (can be called from anywhere)
 */
export const resolveBranch = async (schoolId, userId = null) => {
  console.log('[resolveBranch] Called with schoolId:', schoolId, 'userId:', userId);
  // Try to find main branch
  let branch = await Branch.findOne({ 
    tenant: schoolId, 
    status: 'active', 
    deletedAt: { $exists: false },
    isMain: true
  }).sort({ createdAt: 1 });
  console.log('[resolveBranch] Looked for isMain:true, found:', branch);

  if (!branch) {
    branch = await Branch.findOne({ 
      tenant: schoolId, 
      status: 'active', 
      deletedAt: { $exists: false },
      $or: [{ name: 'Main Branch' }, { code: 'MAIN' }]
    }).sort({ createdAt: 1 });
    console.log('[resolveBranch] Looked for name=Main Branch, found:', branch);
  }

  if (!branch) {
    branch = await Branch.findOne({ 
      tenant: schoolId, 
      status: 'active', 
      deletedAt: { $exists: false } 
    }).sort({ createdAt: 1 });
    console.log('[resolveBranch] Looked for any active branch, found:', branch);
  }

  if (!branch) {
    console.log('[resolveBranch] Creating new branch');
    branch = await Branch.create({
      tenant: schoolId,
      name: 'Main Branch',
      code: 'MAIN',
      isMain: true,
      status: 'active',
      createdBy: userId || null
    });
  }
  console.log('[resolveBranch] Returning branch:', branch._id, branch.name);
  return branch;
};

/**
 * Inject Branch Middleware
 * Sets req.branchId based on role + header, respecting School Admin's all-branches mode.
 *
 * Order of resolution:
 *  1. Super Admin → no branch set (unrestricted)
 *  2. School Admin with X-Branch-ID header → set to that branch
 *  3. School Admin without header → null (all branches)
 *  4. Branch-scoped user (teacher, branch_admin, etc.) → their assigned branch
 *  5. Branch-scoped user with no branch → resolve/create Main Branch & assign
 */
export const injectBranch = async (req, res, next) => {
  // Skip if super admin route
  if (req.isSuperAdminRoute) {
    return next();
  }

  // Set schoolId from user if not already set
  if (!req.schoolId && req.user?.school) {
    req.schoolId = req.user.school;
  }

  const schoolId = req.schoolId;
  if (!schoolId) {
    return next();
  }

  const user     = req.user;
  const role     = user?.role;
  const isSuperAdminRole = role === 'superadmin' || role === 'super_admin';
  const isSchoolAdminRole = ['schooladmin', 'school_admin', 'admin'].includes(role) ||
                             user?.branchScope === 'ALL_BRANCHES';

  // ── Super Admin: no branch filtering ──────────────────────────────────────
  if (isSuperAdminRole) {
    req.branchId = undefined;
    return next();
  }

  // ── School Admin: respect X-Branch-ID header, else null (all branches) ───
  if (isSchoolAdminRole) {
    const headerBranch = req.headers['x-branch-id'];
    req.branchId = (headerBranch && headerBranch !== 'all') ? headerBranch : null;
    return next();
  }

  // ── Branch-scoped user: use their assigned branch ─────────────────────────
  if (user?.branch) {
    req.branchId = user.branch._id?.toString() || user.branch.toString();
    return next();
  }

  // ── No branch yet: resolve or create Main Branch and assign to user ───────
  const branch = await resolveBranch(schoolId, user?._id);
  const branchId = branch._id;
  req.branchId = branchId;

  if (user?._id) {
    await User.findByIdAndUpdate(user._id, { branch: branchId }, { new: true });
  }

  next();
};


/**
 * Helper function to resolve branch ID for a request
 */
export const resolveBranchId = async (req) => {
  // If explicitly set to null (ALL_BRANCHES), return null
  if (req.branchId === null) {
    return null;
  }
  
  let branchId = req.branchId || req.user?.branch;
  
  if (!branchId) {
    const schoolId = req.schoolId || req.user.school?._id || req.user.school;
    const branch = await resolveBranch(schoolId, req.user?._id);
    branchId = branch._id;
  }
  return branchId;
};

/**
 * Ownership Middleware
 * Automatically injects tenantId (school), branchId, and academicYearId into req.body for creations.
 */
export const injectOwnership = (req, res, next) => {
  // Set schoolId from user if not set
  if (!req.schoolId && req.user?.school) {
    req.schoolId = req.user.school;
  }

  // Set branchId from user if not already set
  if (!req.branchId && req.user?.branch) {
    req.branchId = req.user.branch;
  }

  // Set academicYearId from headers
  const academicYearIdFromHeader = req.headers['x-academic-year-id'];
  if (academicYearIdFromHeader) {
    req.academicYearId = academicYearIdFromHeader;
  }

  // Inject school, branch, and academic year into POST/PUT/PATCH requests if not present
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
    if (req.schoolId && !req.body.school) {
      req.body.school = req.schoolId;
    }
    if (req.branchId && !req.body.branch) {
      req.body.branch = req.branchId;
    }
    if (req.academicYearId && !req.body.academicYear) {
      req.body.academicYear = req.academicYearId;
    }
  }
  next();
};

export const blockTenantContextForSuperAdminAuth = (req, res, next) => {
  if (req.schoolId) {
    securityLog('superadmin_auth_blocked_under_school_host', {
      host: getHost(req),
      schoolId: String(req.schoolId),
    });
    return res.status(403).json({
      success: false,
      message: 'Super admin authentication must use the platform hostname',
      userMessage:
        'Please open the super admin console from the platform URL, not a school subdomain.',
    });
  }
  next();
};
