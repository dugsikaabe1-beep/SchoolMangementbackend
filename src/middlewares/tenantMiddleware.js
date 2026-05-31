import School from '../models/School.js';
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

/** Loopback API (e.g. http://localhost:5000) — not the super-admin product host */
const isBareLocalDevHost = (host) =>
  Boolean(host) && (host === 'localhost' || host.startsWith('127.0.0.1') || /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(host));

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
    process.env.NODE_ENV !== 'production' &&
    process.env.ALLOW_DEV_TENANT_HEADER === 'true';
  const allowMobile = process.env.ALLOW_MOBILE_TENANT_HEADER === 'true';

  if (!allowDev && !allowMobile) return null;

  const candidates = [];
  if (allowDev) {
    candidates.push(req.headers['x-dev-tenant-subdomain']);
  }
  if (allowDev || allowMobile) {
    candidates.push(req.headers['x-tenant-id']);
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
    subdomain = mobileHeaderSubdomain(req);
  }

  // Debugging: Log the detection process
  if (process.env.NODE_ENV === 'development') {
    console.log(`[Tenant] Detection: host=${host}, root=${rootDomain}, resolved_subdomain=${subdomain || 'none'}`);
  }

  // Bare localhost / 127.0.0.1 / IP: no tenant on host — use "dev" tenant UX, not super-admin portal
  if (
    (!subdomain || !isValidSubdomainLabel(subdomain)) &&
    isBareLocalDevHost(host)
  ) {
    req.isSuperAdminRoute = false;
    return next();
  }

  if (!subdomain || RESERVED.has(subdomain) || !isValidSubdomainLabel(subdomain)) {
    req.isSuperAdminRoute = true;
    return next();
  }

  try {
    const school = await School.findOne({
      subdomain,
      isActive: true,
    }).select('_id name subdomain isActive subscription');

    if (!school) {
      securityLog('tenant_unknown_subdomain', { subdomain, host });
      return res.status(404).json({
        success: false,
        message: 'School not found',
        userMessage:
          'The school you are trying to access does not exist or is inactive.',
      });
    }

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
 * Super-admin auth and APIs must not run in an active school tenant context
 * (prevents confused-deputy / cross-context token use on school hosts).
 */
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
