import asyncHandler from 'express-async-handler';
import { logAction } from '../utils/auditLogger.js';
import User from '../models/User.js';
import Payment from '../models/Payment.js';
import Class from '../models/Class.js';
import Exam from '../models/Exam.js';

const modelsMap = {
  students: { model: User, roleFilter: 'student', displayName: 'Students' },
  teachers: { model: User, roleFilter: 'teacher', displayName: 'Teachers' },
  payments: { model: Payment, displayName: 'Payments' },
  classes: { model: Class, displayName: 'Classes' },
  exams: { model: Exam, displayName: 'Exams' }
};

// @desc    Get deleted records by type
// @route   GET /api/enterprise/data-recovery/deleted/:type
// @access  Private (School Admin/Super Admin only)
export const getDeletedRecords = asyncHandler(async (req, res) => {
  const school = req.user.school;
  const { type } = req.params;

  if (!school) {
    res.status(400);
    throw new Error('School not found for user');
  }

  const config = modelsMap[type];
  if (!config) {
    res.status(400);
    throw new Error('Invalid record type');
  }

  const query = {
    school,
    isDeleted: true
  };

  if (config.roleFilter) {
    query.role = config.roleFilter;
  }

  if (req.branchId) {
    query.branch = req.branchId;
  }

  const records = await config.model.find(query)
    .sort({ deletedAt: -1 })
    .populate('deletedBy', 'name email');

  res.json({
    type,
    displayName: config.displayName,
    count: records.length,
    records
  });
});

// @desc    Restore a deleted record
// @route   POST /api/enterprise/data-recovery/restore/:type/:id
// @access  Private (School Admin/Super Admin only)
export const restoreRecord = asyncHandler(async (req, res) => {
  const school = req.user.school;
  const { type, id } = req.params;

  if (!school) {
    res.status(400);
    throw new Error('School not found for user');
  }

  const config = modelsMap[type];
  if (!config) {
    res.status(400);
    throw new Error('Invalid record type');
  }

  const query = {
    _id: id,
    school,
    isDeleted: true
  };

  if (config.roleFilter) {
    query.role = config.roleFilter;
  }

  const record = await config.model.findOne(query);

  if (!record) {
    res.status(404);
    throw new Error(`${config.displayName.slice(0, -1)} not found or not deleted`);
  }

  record.isDeleted = false;
  record.deletedAt = undefined;
  record.deletedBy = undefined;

  await record.save();

  logAction(req, {
    action: 'RESTORE_RECORD',
    module: 'DATA_RECOVERY',
    targetId: id,
    details: {
      type,
      recordId: id
    }
  });

  res.json({
    message: `${config.displayName.slice(0, -1)} restored successfully`,
    record
  });
});

// @desc    Get all deleted records summary
// @route   GET /api/enterprise/data-recovery/summary
// @access  Private (School Admin/Super Admin only)
export const getRecoverySummary = asyncHandler(async (req, res) => {
  const school = req.user.school;

  if (!school) {
    res.status(400);
    throw new Error('School not found for user');
  }

  const summary = [];

  for (const [type, config] of Object.entries(modelsMap)) {
    const query = {
      school,
      isDeleted: true
    };

    if (config.roleFilter) {
      query.role = config.roleFilter;
    }

    if (req.branchId) {
      query.branch = req.branchId;
    }

    const count = await config.model.countDocuments(query);
    summary.push({
      type,
      displayName: config.displayName,
      count
    });
  }

  res.json({ summary });
});

// @desc    Permanently delete a record (hard delete)
// @route   DELETE /api/enterprise/data-recovery/permanent/:type/:id
// @access  Private (Super Admin only)
export const permanentDeleteRecord = asyncHandler(async (req, res) => {
  const school = req.user.school;
  const { type, id } = req.params;

  if (!school) {
    res.status(400);
    throw new Error('School not found for user');
  }

  const config = modelsMap[type];
  if (!config) {
    res.status(400);
    throw new Error('Invalid record type');
  }

  const query = {
    _id: id,
    school,
    isDeleted: true
  };

  if (config.roleFilter) {
    query.role = config.roleFilter;
  }

  const record = await config.model.findOne(query);

  if (!record) {
    res.status(404);
    throw new Error(`${config.displayName.slice(0, -1)} not found or not deleted`);
  }

  await config.model.deleteOne({ _id: id });

  logAction(req, {
    action: 'PERMANENT_DELETE',
    module: 'DATA_RECOVERY',
    targetId: id,
    details: {
      type,
      recordId: id
    }
  });

  res.json({
    message: `${config.displayName.slice(0, -1)} permanently deleted`
  });
});
