import asyncHandler from 'express-async-handler';
import User from '../models/User.js';

// @desc    Check for duplicates in student/teacher data
// @route   POST /api/enterprise/duplicate-check
// @access  Private (School Admin/Super Admin only)
export const checkDuplicates = asyncHandler(async (req, res) => {
  const schoolId = req.user.school?._id || req.user.school;
  const branchId = req.branchId || req.user.branch?._id || req.user.branch;
  const { type, data, excludeId } = req.body;

  if (!schoolId) {
    res.status(400);
    throw new Error('School not found for user');
  }

  const duplicates = [];
  const model = User;
  const roleFilter = type === 'student' ? 'student' : type === 'teacher' ? 'teacher' : null;

  if (!roleFilter) {
    res.status(400);
    throw new Error('Invalid type. Must be student or teacher.');
  }

  // CRITICAL: Include branchId in duplicate scope
  const baseQuery = {
    school: schoolId,
    role: roleFilter,
    isDeleted: false
  };

  // If branch is specified, scope the query to that branch
  if (branchId) {
    baseQuery.branch = branchId;
  }

  const query = { ...baseQuery };

  if (excludeId) {
    query._id = { $ne: excludeId };
  }

  // Check each field for duplicates (scoped to tenant + branch)
  const checkFields = [
    { key: 'customId', label: 'Student ID / Teacher ID', value: data.customId },
    { key: 'email', label: 'Email', value: data.email },
    { key: 'phone', label: 'Phone Number', value: data.phone },
    { key: 'nationalId', label: 'National ID', value: data.nationalId }
  ];

  for (const field of checkFields) {
    if (field.value) {
      const duplicate = await model.findOne({
        ...query,
        [field.key]: field.value
      });

      if (duplicate) {
        duplicates.push({
          field: field.key,
          label: field.label,
          value: field.value,
          duplicateRecord: {
            id: duplicate._id,
            name: duplicate.name,
            branch: duplicate.branch?.toString() || 'Main'
          }
        });
      }
    }
  }

  res.json({
    hasDuplicates: duplicates.length > 0,
    duplicates,
    scope: { school: schoolId.toString(), branch: branchId?.toString() || 'all' }
  });
});

// @desc    Check for duplicates in bulk import data
// @route   POST /api/enterprise/duplicate-check/bulk
// @access  Private (School Admin/Super Admin only)
export const checkBulkDuplicates = asyncHandler(async (req, res) => {
  const schoolId = req.user.school?._id || req.user.school;
  const branchId = req.branchId || req.user.branch?._id || req.user.branch;
  const { type, records } = req.body;

  if (!schoolId) {
    res.status(400);
    throw new Error('School not found for user');
  }

  const roleFilter = type === 'student' ? 'student' : type === 'teacher' ? 'teacher' : null;

  if (!roleFilter) {
    res.status(400);
    throw new Error('Invalid type. Must be student or teacher.');
  }

  const results = [];

  // CRITICAL: Base query includes tenant + branch scope
  const baseQuery = {
    school: schoolId,
    role: roleFilter,
    isDeleted: false
  };

  // If branch is specified, scope the query to that branch
  if (branchId) {
    baseQuery.branch = branchId;
  }

  for (let i = 0; i < records.length; i++) {
    const data = records[i];
    const duplicates = [];
    const query = { ...baseQuery };

    const checkFields = [
      { key: 'customId', label: 'Student ID / Teacher ID', value: data.customId },
      { key: 'email', label: 'Email', value: data.email },
      { key: 'phone', label: 'Phone Number', value: data.phone }
    ];

    for (const field of checkFields) {
      if (field.value) {
        const duplicate = await User.findOne({
          ...query,
          [field.key]: field.value
        });

        if (duplicate) {
          duplicates.push({
            field: field.key,
            label: field.label,
            value: field.value,
            duplicateRecord: {
              id: duplicate._id,
              name: duplicate.name,
              branch: duplicate.branch?.toString() || 'Main'
            }
          });
        }
      }
    }

    results.push({
      index: i,
      record: data,
      hasDuplicates: duplicates.length > 0,
      duplicates
    });
  }

  res.json({
    totalRecords: records.length,
    recordsWithDuplicates: results.filter(r => r.hasDuplicates).length,
    results,
    scope: { school: schoolId.toString(), branch: branchId?.toString() || 'all' }
  });
});
