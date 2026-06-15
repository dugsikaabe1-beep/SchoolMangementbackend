import { isFeatureEnabled } from '../utils/featureAccess.js';

// Create a middleware that checks if a feature is enabled for the current school
export const requireFeatureEnabled = (featureKey) => {
  return async (req, res, next) => {
    // Skip for super admin routes
    if (req.isSuperAdminRoute) {
      return next();
    }

    // Skip if no school (e.g., auth routes)
    if (!req.school || !req.schoolId) {
      return next();
    }

    try {
      const enabled = await isFeatureEnabled(req.schoolId, featureKey);
      if (!enabled) {
        return res.status(403).json({
          success: false,
          message: `Feature ${featureKey} is not enabled for this school`,
          userMessage: 'This feature is not available for your school'
        });
      }
      next();
    } catch (error) {
      console.error('Feature access check error:', error);
      next(); // Don't block on errors, just log
    }
  };
};

export const injectEnabledFeatures = async (req, res, next) => {
  if (req.school && req.schoolId) {
    try {
      // We'll add this to req later if needed
    } catch (error) {
      console.error('Failed to inject enabled features:', error);
    }
  }
  next();
};
