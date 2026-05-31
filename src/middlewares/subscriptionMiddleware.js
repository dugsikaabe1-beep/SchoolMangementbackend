import School from '../models/School.js';

/**
 * Subscription Check Middleware
 * Checks if school's subscription is active before allowing access
 */

export const checkSubscription = async (req, res, next) => {
  try {
    // Skip for Super Admin
    if (req.user?.role === 'superadmin') {
      return next();
    }

    // Skip if user doesn't have a school (shouldn't happen for school users)
    if (!req.user?.school) {
      return res.status(403).json({
        message: 'No school assigned',
        userMessage: 'You are not assigned to any school. Please contact your administrator.'
      });
    }

    // Get fresh school data with subscription info
    const school = await School.findById(req.user.school);

    if (!school) {
      return res.status(404).json({
        message: 'School not found',
        userMessage: 'Your school information could not be found. Please contact support.'
      });
    }

    // Check if school is manually blocked by admin
    if (school.subscription?.blockedByAdmin) {
      const blockReason = school.subscription.blockedReason || 'No specific reason provided';
      return res.status(403).json({
        message: 'School blocked by administrator',
        userMessage: `Your school "${school.name}" has been temporarily suspended by the super admin.\n\nReason: ${blockReason}\n\nPlease contact the super admin to discuss when your school can be reactivated.`
      });
    }

    // Check if school is inactive
    if (!school.isActive) {
      return res.status(403).json({
        message: 'School inactive',
        userMessage: 'Your school is currently inactive. Please contact the super admin to activate your school before you can access the system.'
      });
    }

    // Check subscription expiration
    if (school.subscription?.endDate) {
      const now = new Date();
      const endDate = new Date(school.subscription.endDate);
      
      if (now > endDate) {
        return res.status(403).json({
          message: 'Subscription expired',
          userMessage: 'Your subscription has expired. Please contact the administrator to renew your subscription.'
        });
      }

      // Optional: Warn if subscription expires soon (e.g., 7 days)
      const daysUntilExpiry = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));
      if (daysUntilExpiry <= 7 && daysUntilExpiry > 0) {
        // Attach warning to request for controllers to use
        req.subscriptionWarning = {
          daysUntilExpiry,
          message: `Your subscription will expire in ${daysUntilExpiry} day${daysUntilExpiry > 1 ? 's' : ''}. Please renew soon.`
        };
      }
    }

    // Attach school info to request for later use
    req.schoolInfo = school;
    
    next();
  } catch (error) {
    console.error('Subscription check error:', error);
    res.status(500).json({
      message: 'Error checking subscription',
      userMessage: 'An error occurred while checking your subscription status. Please try again later.'
    });
  }
};

/**
 * Check subscription status without blocking
 * Useful for dashboard/info endpoints
 */
export const getSubscriptionStatus = async (req, res, next) => {
  try {
    if (req.user?.role === 'superadmin' || !req.user?.school) {
      return next();
    }

    const school = await School.findById(req.user.school)
      .select('subscription isActive');

    if (school) {
      req.subscriptionStatus = {
        isActive: school.isActive && !school.isBlocked,
        isBlocked: school.isBlocked,
        blockedReason: school.subscription?.blockedReason,
        endDate: school.subscription?.endDate,
        daysUntilExpiry: school.daysUntilExpiry,
        paymentStatus: school.subscription?.paymentStatus,
        type: school.subscription?.type
      };
    }

    next();
  } catch (error) {
    console.error('Get subscription status error:', error);
    next();
  }
};

export default { checkSubscription, getSubscriptionStatus };
