import { isFeatureEnabled } from '../utils/featureAccess.js';

export const requireFeature = (featureKey) => async (req, res, next) => {
  // Skip for super admin
  if (req.user?.role === 'superadmin' || req.user?.role === 'super_admin') {
    return next();
  }

  const schoolId = req.schoolId || req.user?.school;
  if (!schoolId) {
    return res.status(403).json({
      success: false,
      message: 'School context required',
      userMessage: 'Please log in again.'
    });
  }

  const enabled = await isFeatureEnabled(schoolId, featureKey);
  if (!enabled) {
    return res.status(403).json({
      success: false,
      message: `Feature ${featureKey} not enabled`,
      userMessage: 'This feature is not available for your school.'
    });
  }

  next();
};
