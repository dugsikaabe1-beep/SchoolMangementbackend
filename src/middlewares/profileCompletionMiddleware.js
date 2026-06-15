import School from '../models/School.js';
import User from '../models/User.js';
import jwt from 'jsonwebtoken';

/**
 * Required School profile fields.
 * If any of these are empty/null, the school admin is blocked from the dashboard
 * and forced to complete their profile first.
 */
const REQUIRED_PROFILE_FIELDS = {
  name: 'School Name',
  schoolType: 'School Type',
  country: 'Country',
  city: 'City',
  logo: 'School Logo',
  address: 'Address',
  phone: 'Phone Number',
  email: 'School Email',
  merchantNumber: 'Merchant / Account Number',
};

/**
 * URL path prefixes that are ALWAYS allowed, even when profile is incomplete.
 * These include: profile status check, profile completion, auth, health, uploads.
 */
const EXEMPT_PATH_PREFIXES = [
  '/api/v1/school-admin/profile-status',
  '/api/v1/school-admin/complete-profile',
  '/api/v1/school-admin/school-profile',
  '/api/v1/school-admin/enabled-features',
  '/api/v1/school-admin/onboarding',
  '/api/v1/school-admin/upload',
  '/api/v1/school-admin/public-content/',
  '/api/v1/admin/school-profile-status',
  '/api/v1/admin/complete-school-profile',
  '/api/v1/admin/school-profile',
  '/api/v1/admin/upload',
  '/api/school-admin/profile-status',
  '/api/school-admin/complete-profile',
  '/api/school-admin/school-profile',
  '/api/school-admin/public-content/',
  '/api/admin/school-profile-status',
  '/api/admin/complete-school-profile',
  '/api/admin/school-profile',
  '/api/v1/auth/',
  '/api/auth/',
  '/api/v1/school-admin/login',
  '/api/v1/health',
  '/api/health',
  '/health',
  '/api/v1/public/',
  '/api/public/',
  '/uploads/',
];

const isExemptPath = (path) => {
  return EXEMPT_PATH_PREFIXES.some(prefix => path.startsWith(prefix));
};

/**
 * Try to identify the user from JWT when protect() hasn't run yet.
 * Returns { role, school, schoolProfileCompleted, isSuperAdmin } or null.
 */
const identifyUserFromToken = (req) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
    const token = authHeader.split(' ')[1];
    if (!token || !process.env.JWT_SECRET) return null;
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return {
      role: decoded.role,
      userId: decoded.id || decoded.userId,
      isSuperAdmin: decoded.role === 'superadmin' || decoded.role === 'super_admin' || decoded.isSuperAdmin === true,
    };
  } catch {
    return null;
  }
};

/**
 * Global middleware — blocks school admins from accessing the platform
 * until they have completed their school profile with all required fields:
 *   - School Name, Logo, Address, Phone, Email, Merchant/Account Number
 *
 * Can be applied globally (before protect) or per-route (after protect).
 * When applied globally, it extracts user info from the JWT directly.
 */
export const requireProfileCompletion = async (req, res, next) => {
  try {
    // 1. Skip OPTIONS (CORS preflight)
    if (req.method === 'OPTIONS') return next();

    // 2. Skip exempt paths (profile completion routes, auth, health, etc.)
    if (isExemptPath(req.path)) return next();

    // 3. Determine user identity — from req.user (protect already ran) or from JWT directly
    let role, schoolId, schoolProfileCompleted, isSuperAdmin;

    if (req.user) {
      // Auth middleware already ran
      role = req.user.role;
      schoolId = req.user.school;
      schoolProfileCompleted = req.user.schoolProfileCompleted;
      isSuperAdmin = role === 'superadmin' || role === 'super_admin' || req.user.isSuperAdmin;
    } else {
      // Auth middleware hasn't run yet (global application) — verify JWT ourselves
      const tokenInfo = identifyUserFromToken(req);
      if (!tokenInfo) return next(); // No valid token — let auth middleware handle it later
      role = tokenInfo.role;
      isSuperAdmin = tokenInfo.isSuperAdmin;

      // Load the user to get school and schoolProfileCompleted
      const user = await User.findById(tokenInfo.userId).select('school schoolProfileCompleted role');
      if (!user) return next();
      schoolId = user.school;
      schoolProfileCompleted = user.schoolProfileCompleted;
      role = user.role; // Use DB role, not just token role
    }

    // 4. Only apply to school admins — skip super admins and non-admin roles
    if (!role || isSuperAdmin) return next();
    const isSchoolAdmin = ['schooladmin', 'school_admin', 'admin'].includes(role);
    if (!isSchoolAdmin) return next();

    // 5. Quick flag check — if flag is NOT set or school doesn't exist, block
    if (!schoolProfileCompleted || !schoolId) {
      return blockWithMissingFields(res, null, Object.values(REQUIRED_PROFILE_FIELDS));
    }

    // 6. Load the school and check actual fields
    const school = await School.findById(schoolId)
      .select(Object.keys(REQUIRED_PROFILE_FIELDS).join(' '));

    if (!school) {
      return blockWithMissingFields(res, null, Object.values(REQUIRED_PROFILE_FIELDS));
    }

    const missingLabels = [];
    for (const [field, label] of Object.entries(REQUIRED_PROFILE_FIELDS)) {
      const val = school[field];
      if (field === 'logo') {
        // Logo is a Cloudinary subdocument — check for actual URL
        if (!val || !val.url) missingLabels.push(label);
      } else if (!val || (typeof val === 'string' && !val.trim())) {
        missingLabels.push(label);
      }
    }

    if (missingLabels.length > 0) {
      return blockWithMissingFields(res, school, missingLabels);
    }

    // 7. All good — profile is complete
    next();
  } catch (error) {
    console.error('[ProfileCompletionMiddleware] Error:', error);
    next(); // Don't lock out on errors
  }
};

/**
 * Send a 403 response telling the frontend to redirect to profile setup.
 */
function blockWithMissingFields(res, school, missingLabels) {
  return res.status(403).json({
    success: false,
    message: 'Profile incomplete',
    userMessage: `Please complete your school profile before accessing the dashboard. Missing: ${missingLabels.join(', ')}`,
    requiresProfileCompletion: true,
    missingFields: missingLabels,
    school: school ? { _id: school._id } : null,
  });
}

export default { requireProfileCompletion };
