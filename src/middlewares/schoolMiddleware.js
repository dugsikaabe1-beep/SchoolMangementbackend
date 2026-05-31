/**
 * School Isolation Middleware
 * Ensures all queries are filtered by the user's school_id
 * Super Admin can access all schools
 */

// Middleware to check if user has a school assigned
const requireSchool = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      message: 'Authentication required',
      userMessage: 'Please login to access this feature.'
    });
  }

  // Super Admin can access without school restriction
  if (req.user.role === 'superadmin') {
    return next();
  }

  // Check if user has a school assigned
  if (!req.user.school) {
    return res.status(403).json({
      message: 'No school assigned to user',
      userMessage: 'You are not assigned to any school. Please contact your administrator.'
    });
  }

  next();
};

// Middleware to add school filter to query
const filterBySchool = (req, res, next) => {
  if (!req.user) {
    return next();
  }

  // Super Admin can see all schools - don't add filter
  if (req.user.role === 'superadmin') {
    // Allow optional school filter via query param for super admin
    req.schoolFilter = req.query.schoolId ? { school: req.query.schoolId } : {};
    return next();
  }

  // Regular users only see their school's data
  req.schoolFilter = { school: req.user.school };
  next();
};

// Middleware to ensure user can only access their school's data
const restrictToSchool = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      message: 'Authentication required',
      userMessage: 'Please login to access this feature.'
    });
  }

  // Super Admin can access any school
  if (req.user.role === 'superadmin') {
    return next();
  }

  // Check if the requested resource belongs to user's school
  // This should be called after the resource is fetched
  const resourceSchoolId = req.resource?.school?.toString();
  const userSchoolId = req.user.school?.toString();

  if (resourceSchoolId && resourceSchoolId !== userSchoolId) {
    return res.status(403).json({
      message: 'Access denied - resource belongs to different school',
      userMessage: 'You do not have permission to access this resource.'
    });
  }

  next();
};

// Helper function to add school to request body
const addSchoolToBody = (req, res, next) => {
  if (!req.user) {
    return next();
  }

  // Super Admin must provide schoolId in body
  if (req.user.role === 'superadmin') {
    if (!req.body.schoolId && !req.body.school) {
      return res.status(400).json({
        message: 'School ID required',
        userMessage: 'Please specify a school for this operation.'
      });
    }
    req.body.school = req.body.schoolId || req.body.school;
    return next();
  }

  // Regular users automatically get their school assigned
  req.body.school = req.user.school;
  next();
};

// Helper to build query with school filter
const buildSchoolQuery = (req, additionalFilters = {}) => {
  // Super Admin with optional school filter
  if (req.user?.role === 'superadmin') {
    if (req.query.schoolId) {
      return { school: req.query.schoolId, ...additionalFilters };
    }
    return { ...additionalFilters };
  }

  // Regular users - always filter by their school
  return { school: req.user?.school, ...additionalFilters };
};

export {
  requireSchool,
  filterBySchool,
  restrictToSchool,
  addSchoolToBody,
  buildSchoolQuery
};
