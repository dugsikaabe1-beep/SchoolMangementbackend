import AcademicYear from '../models/AcademicYear.js';

/**
 * Get or initialize the current academic year for a school/branch
 */
export const getCurrentAcademicYear = async (schoolId, branchId) => {
  console.log('[getCurrentAcademicYear] Called with schoolId:', schoolId, 'branchId:', branchId);
  try {
    const query = { tenant: schoolId, isCurrent: true };
    if (branchId) query.branch = branchId;
    console.log('[getCurrentAcademicYear] Query 1:', query);

    let academicYear = await AcademicYear.findOne(query);
    console.log('[getCurrentAcademicYear] Result 1 (isCurrent):', academicYear);

    // Fallback: If no current year marked, get the most recent active one
    if (!academicYear) {
      const fallbackQuery = { tenant: schoolId, status: 'active' };
      if (branchId) fallbackQuery.branch = branchId;
      console.log('[getCurrentAcademicYear] Query 2 (fallback):', fallbackQuery);
      academicYear = await AcademicYear.findOne(fallbackQuery).sort({ startDate: -1 });
      console.log('[getCurrentAcademicYear] Result 2 (fallback):', academicYear);
    }

    // If no academic year exists at all, create a default one for the current year
    if (!academicYear) {
      console.log('[getCurrentAcademicYear] Creating new academic year');
      const currentDate = new Date();
      const currentYear = currentDate.getFullYear();
      const nextYear = currentYear + 1;
      
      academicYear = await AcademicYear.create({
        tenant: schoolId,
        branch: branchId,
        name: `${currentYear}-${nextYear}`,
        startDate: new Date(currentYear, 8, 1), // September 1st
        endDate: new Date(nextYear, 6, 30),    // June 30th
        isCurrent: true,
        status: 'active',
      });
      console.log('[getCurrentAcademicYear] Created new academic year:', academicYear);
    }

    return academicYear;
  } catch (error) {
    console.error('[AcademicYear] Error fetching/creating current year:', error.message);
    return null;
  }
};

/**
 * Middleware to inject the current academic year into the request
 */
export const injectAcademicYear = async (req, res, next) => {
  // Skip if super admin route
  if (req.isSuperAdminRoute) {
    return next();
  }

  const schoolId = req.schoolId || req.user?.school;
  const branchId = req.branchId || req.user?.branch;

  // 1. Check if overridden via header
  const headerAY = req.headers['x-academic-year-id'];
  if (headerAY) {
    req.academicYearId = headerAY;
    return next();
  }

  // 2. Otherwise get current active one (or create if needed)
  if (schoolId) {
    const currentYear = await getCurrentAcademicYear(schoolId, branchId);
    if (currentYear) {
      req.academicYearId = currentYear._id;
      req.academicYearName = currentYear.name;
    }
  }
  next();
};
