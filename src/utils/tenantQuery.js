/**
 * Secure tenant-scoped query helpers for MongoDB / Mongoose.
 * Every collection that holds school data should filter with these patterns.
 */

import mongoose from 'mongoose';

/**
 * Require a school-scoped request and return a filter fragment `{ school: ObjectId }`.
 */
export const schoolScope = (req) => {
  if (!req?.schoolId) {
    throw new Error('CRITICAL SECURITY ERROR: school scope missing on request');
  }
  return { school: req.schoolId };
};

/**
 * Merge arbitrary filter with mandatory school scope and optional branch scope.
 */
export const withSchool = (req, query = {}) => {
  const filter = { ...query, school: req.schoolId };
  
  // If branch isolation is active on the request, apply it
  if (req.branchId) {
    filter.branch = req.branchId;
  }
  
  return filter;
};

/**
 * Build `{ school, ...query }` when school is stored as ObjectId ref `school`.
 */
export const tenantFilter = (req, extra = {}) => {
  if (!req?.schoolId) {
    throw new Error('CRITICAL SECURITY ERROR: tenant filter without schoolId');
  }
  
  const filter = { ...extra, school: req.schoolId };
  
  if (req.branchId) {
    filter.branch = req.branchId;
  }
  
  return filter;
};

/**
 * Verify a populated or lean document belongs to the active tenant.
 */
export const validateOwnership = (doc, req) => {
  if (!doc) return false;

  const docSchoolId =
    doc.school?.toString?.() ||
    (doc.school instanceof mongoose.Types.ObjectId ? doc.school.toString() : null) ||
    doc.schoolId?.toString?.();

  const reqSchoolId = req.schoolId?.toString();

  if (!docSchoolId || !reqSchoolId || docSchoolId !== reqSchoolId) {
    console.error(
      `SECURITY VIOLATION: cross-tenant document access attempt user=${req.user?._id} docSchool=${docSchoolId} reqSchool=${reqSchoolId}`
    );
    return false;
  }

  return true;
};

/** Patterns for common resources (use with Model.find / findOne / etc.) */
export const scoped = {
  students: (req, q = {}) => withSchool(req, { ...q, role: 'student' }),
  teachers: (req, q = {}) => withSchool(req, { ...q, role: 'teacher' }),
  classes: (req, q = {}) => withSchool(req, q),
  exams: (req, q = {}) => withSchool(req, q),
  attendance: (req, q = {}) => withSchool(req, q),
  finance: (req, q = {}) => withSchool(req, q),
  payroll: (req, q = {}) => withSchool(req, q),
  chat: (req, q = {}) => withSchool(req, q),
  notifications: (req, q = {}) => withSchool(req, q),
};

/**
 * @deprecated Use withSchool / tenantFilter instead (same behavior).
 */
export const secureQuery = (query = {}, req) => withSchool(req, query);
