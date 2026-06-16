import School from '../models/School.js';
import { isFeatureEnabled, getPlanFeaturesForSchool } from '../utils/featureAccess.js';

// List of all communication features that must never be restricted
const COMMUNICATION_FEATURES = [
  'announcements',
  'notifications',
  'push-notifications',
  'sms',
  'email-automation',
  'whatsapp',
  'bulk-messaging',
  'automated-alerts'
];

/**
 * Feature Control Middleware
 * Checks if a specific module/feature is enabled for the school's current plan.
 * 
 * @param {string} moduleCode - The code of the module to check (e.g., 'hostel', 'transport', 'library')
 */
export const checkModuleAccess = (moduleCode) => {
  return async (req, res, next) => {
    try {
      console.log(`[FeatureControl] Checking access for module: ${moduleCode}`);
      console.log(`[FeatureControl] req.schoolId:`, req.schoolId);
      
      // Always allow communication features - no checks needed
      if (COMMUNICATION_FEATURES.includes(moduleCode)) {
        console.log(`[FeatureControl] ${moduleCode} is a core communication feature - skipping check`);
        return next();
      }
      
      if (!req.schoolId) {
        console.log(`[FeatureControl] No schoolId found, skipping feature check`);
        return next(); // Skip for super-admins or non-tenant contexts if needed
      }

      // 1. Fetch school with its plan details
      const school = await School.findById(req.schoolId).populate('subscription.plan');
      console.log(`[FeatureControl] School found:`, school?.name, "sub status:", school?.subscription?.status);
      
      if (!school) {
        return res.status(404).json({
          success: false,
          message: 'School not found'
        });
      }

      // 2. Check if subscription is active
      const subStatus = school.subscription?.status;
      if (['Expired', 'Suspended', 'Cancelled'].includes(subStatus) && school.settings?.restrictedModeOnExpiry) {
        return res.status(403).json({
          success: false,
          message: 'Subscription Inactive',
          userMessage: 'Your subscription has expired. Please renew to access this module.'
        });
      }

      const enabled = await isFeatureEnabled(req.schoolId, moduleCode);
      const allFeatures = await getPlanFeaturesForSchool(req.schoolId);
      console.log(`[FeatureControl] Module ${moduleCode} enabled:`, enabled);
      console.log(`[FeatureControl] All plan features:`, allFeatures);
      
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
