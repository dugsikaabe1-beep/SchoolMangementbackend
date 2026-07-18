import School from '../models/School.js';
import User from '../models/User.js';
import Branch from '../models/Branch.js';
import { broadcastNotification } from '../utils/notificationService.js';

/**
 * Helper to get current usage for a specific resource
 */
export const getCurrentUsage = async (schoolId, resourceType) => {
  switch (resourceType) {
    case 'students':
      return await User.countDocuments({ role: 'student', school: schoolId, status: 'active', isDeleted: { $ne: true }, deletedAt: { $exists: false } });
    case 'teachers':
      return await User.countDocuments({ role: 'teacher', school: schoolId, status: 'active', isDeleted: { $ne: true }, deletedAt: { $exists: false } });
    case 'parents':
      return await User.countDocuments({ role: 'parent', school: schoolId, status: 'active', isDeleted: { $ne: true }, deletedAt: { $exists: false } });
    case 'employees':
      return await User.countDocuments({ role: { $in: ['employee', 'staff', 'accountant', 'librarian'] }, school: schoolId, status: 'active', isDeleted: { $ne: true }, deletedAt: { $exists: false } });
    case 'branches':
      return await Branch.countDocuments({ tenant: schoolId, deletedAt: { $exists: false } });
    case 'campuses':
      return await Branch.countDocuments({ tenant: schoolId, deletedAt: { $exists: false } });
    case 'admins':
      return await User.countDocuments({ role: { $in: ['schooladmin', 'school_admin'] }, school: schoolId, status: 'active', isDeleted: { $ne: true }, deletedAt: { $exists: false } });
    case 'storage':
      // Simplified: Estimating storage based on uploaded assets or documents would be here.
      // For now, return 0 as real-time tracking across Cloudinary is complex and expensive.
      return 0;
    case 'sms':
    case 'email':
    case 'api':
    case 'devices':
      // For these, usage tracking would be separate, return 0 for now
      return 0;
    default:
      return 0;
  }
};

/**
 * Middleware to enforce SaaS plan limits
 */
export const checkPlanLimits = (resourceType) => {
  return async (req, res, next) => {
    try {
      const schoolId = req.user?.school || req.params?.id || req.body?.schoolId;
      if (!schoolId) return next(); // Skip if no school context

      const school = await School.findById(schoolId);
      if (!school) return next();

      const limit = school.subscription?.limits?.[resourceType];
      
      // If unlimited (-1) or no limit defined, allow
      if (limit === undefined || limit === null || limit === -1) {
        return next();
      }

      // Check current usage
      const currentUsage = await getCurrentUsage(schoolId, resourceType);

      if (currentUsage >= limit) {
        return res.status(403).json({
          success: false,
          message: `Plan limit reached for ${resourceType}.`,
          userMessage: `You have reached your plan's maximum limit of ${limit} ${resourceType}. Please upgrade your plan to add more.`,
          requiresUpgrade: true,
          limit,
          usage: currentUsage
        });
      }

      // Attach a listener to the response to check threshold AFTER successful creation
      res.on('finish', async () => {
        if (res.statusCode >= 200 && res.statusCode < 300 && ['POST'].includes(req.method)) {
          try {
            // Wait briefly to allow DB to save the new document
            setTimeout(async () => {
              const newUsage = await getCurrentUsage(schoolId, resourceType);
              const percentage = (newUsage / limit) * 100;
              
              let warningLevel = null;
              if (percentage >= 100) warningLevel = 100;
              else if (percentage >= 95) warningLevel = 95;
              else if (percentage >= 90) warningLevel = 90;
              else if (percentage >= 80) warningLevel = 80;

              // Only notify exactly when crossing these boundaries to prevent spam
              // A simple way is to check if the *previous* usage didn't hit this boundary
              const oldPercentage = ((newUsage - 1) / limit) * 100;
              
              let crossedBoundary = null;
              if (percentage >= 80 && oldPercentage < 80) crossedBoundary = 80;
              if (percentage >= 90 && oldPercentage < 90) crossedBoundary = 90;
              if (percentage >= 95 && oldPercentage < 95) crossedBoundary = 95;
              if (percentage >= 100 && oldPercentage < 100) crossedBoundary = 100;

              if (crossedBoundary) {
                const admins = await User.find({ school: schoolId, role: { $in: ['schooladmin', 'school_admin'] } });
                const adminIds = admins.map(a => a._id);
                
                if (adminIds.length > 0) {
                  let msg = `You have used ${crossedBoundary}% of your ${resourceType} limit (${newUsage}/${limit}).`;
                  if (crossedBoundary === 100) {
                    msg = `You have reached your ${resourceType} limit (${newUsage}/${limit}). You must upgrade your plan to add more.`;
                  }
                  
                  await broadcastNotification({
                    recipientIds: adminIds,
                    schoolId: schoolId,
                    title: `Plan Limit Warning: ${resourceType.toUpperCase()}`,
                    message: msg,
                    type: crossedBoundary === 100 ? 'alert' : 'warning'
                  });
                }
              }
            }, 1000); // 1s delay
          } catch (err) {
            console.error('[LimitCheck] Error calculating post-action limits:', err.message);
          }
        }
      });

      next();
    } catch (error) {
      console.error('[LimitMiddleware] Error:', error);
      next(); // Fail open so we don't break the app on a limit check failure
    }
  };
};
