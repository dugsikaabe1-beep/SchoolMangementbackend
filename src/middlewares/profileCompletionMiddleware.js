/**
 * Middleware to check if School Admin has completed their profile
 * Redirects to profile completion if not done
 */

export const requireProfileCompletion = (req, res, next) => {
  // Skip for Super Admin
  if (req.user?.role === 'superadmin') {
    return next();
  }

  // Only check for school admins
  if (req.user?.role === 'schooladmin') {
    // Check if profile is completed
    if (!req.user.schoolProfileCompleted) {
      return res.status(403).json({
        message: 'Profile incomplete',
        userMessage: 'Please complete your school profile before accessing this resource.',
        requiresProfileCompletion: true
      });
    }
  }

  next();
};

/**
 * Middleware to allow access only for profile completion
 * Used for routes that should be accessible when profile is NOT completed
 */
export const allowForProfileCompletion = (req, res, next) => {
  // Skip for Super Admin
  if (req.user?.role === 'superadmin') {
    return next();
  }

  // Only check for school admins
  if (req.user?.role === 'schooladmin') {
    // Attach profile status to request
    req.profileStatus = {
      completed: req.user.schoolProfileCompleted,
      schoolId: req.user.school
    };
  }

  next();
};

export default { requireProfileCompletion, allowForProfileCompletion };
