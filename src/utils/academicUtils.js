import AcademicYear from '../models/AcademicYear.js';

/**
 * Get the current active academic year for a school/branch
 */
export const getCurrentAcademicYear = async (schoolId, branchId) => {
  try {
    const query = { tenant: schoolId, isCurrent: true };
    if (branchId) query.branch = branchId;

    let academicYear = await AcademicYear.findOne(query);

    // Fallback: If no current year marked, get the most recent active one
    if (!academicYear) {
      const fallbackQuery = { tenant: schoolId, status: 'active' };
      if (branchId) fallbackQuery.branch = branchId;
      academicYear = await AcademicYear.findOne(fallbackQuery).sort({ startDate: -1 });
    }

    return academicYear;
  } catch (error) {
    console.error('[AcademicYear] Error fetching current year:', error.message);
    return null;
  }
};

/**
 * Middleware to inject the current academic year into the request
 */
export const injectAcademicYear = async (req, res, next) => {
  const schoolId = req.schoolId || req.user?.school;
  const branchId = req.branchId || req.user?.branch;

  // 1. Check if overridden via header
  const headerAY = req.headers['x-academic-year-id'];
  if (headerAY) {
    req.academicYearId = headerAY;
    return next();
  }

  // 2. Otherwise get current active one
  if (schoolId) {
    const currentYear = await getCurrentAcademicYear(schoolId, branchId);
    if (currentYear) {
      req.academicYearId = currentYear._id;
      req.academicYearName = currentYear.name;
    }
  }
  next();
};
