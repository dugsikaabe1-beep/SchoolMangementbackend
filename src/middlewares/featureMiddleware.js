import School from '../models/School.js';
import { isFeatureEnabled, COMMUNICATION_FEATURES } from '../utils/featureAccess.js';

/**
 * Feature Control Middleware
 * Checks if a specific module/feature is enabled for the school's current plan.
 * 
 * @param {string} moduleCode - The code of the module to check (e.g., 'hostel', 'transport', 'library')
 */
export const checkModuleAccess = (moduleCode) => {
  return async (req, res, next) => {
    try {
      if (COMMUNICATION_FEATURES.includes(moduleCode)) {
        return next();
      }
      
      if (!req.schoolId) {
        return next();
      }

      const school = await School.findById(req.schoolId).populate('subscription.plan');
      
      if (!school) {
        return res.status(404).json({
          success: false,
          message: 'School not found'
        });
      }

      const subStatus = school.subscription?.status;
      if (['Expired', 'Suspended', 'Cancelled'].includes(subStatus) && school.settings?.restrictedModeOnExpiry) {
        return res.status(403).json({
          success: false,
          message: 'Subscription Inactive',
          userMessage: 'Your subscription has expired. Please renew to access this module.'
        });
      }

      const enabled = await isFeatureEnabled(req.schoolId, moduleCode);
      
      if (!enabled) {
        return res.status(403).json({
          success: false,
          message: 'Module Disabled',
          userMessage: `The ${moduleCode} module is not available for your school.`
        });
      }

      next();
    } catch (error) {
      console.error(`[FeatureControl] Error checking access for ${moduleCode}:`, error.message);
      res.status(500).json({ success: false, message: 'Internal server error during feature validation' });
    }
  };
};
