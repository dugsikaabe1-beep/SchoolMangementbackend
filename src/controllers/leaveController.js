/**
 * Leave Management Controller
 * Handles leave requests, approval workflow, and leave balance tracking.
 */
import asyncHandler from 'express-async-handler';
import Leave from '../models/Leave.js';
import User from '../models/User.js';
import { tenantFilter } from '../utils/tenantQuery.js';
import { logAction } from '../utils/auditLogger.js';
import { sendNotification } from '../utils/notificationService.js';

const ok  = (res, data = {}) => res.json({ success: true, ...data });
const err = (res, status, msg) => res.status(status).json({ success: false, message: msg });

// ── Utility: compute total days (excluding weekends if configured) ─────────────
const calcWorkingDays = (startDate, endDate, isHalfDay = false) => {
  if (isHalfDay) return 0.5;
  const start = new Date(startDate);
  const end   = new Date(endDate);
  let days = 0;
  const current = new Date(start);
  while (current <= end) {
    const dow = current.getDay();
    if (dow !== 0 && dow !== 6) days++;          // skip Sat & Sun
    current.setDate(current.getDate() + 1);
  }
  return Math.max(0.5, days);
};

// ── Get all leave requests (admin view) ───────────────────────────────────────
export const getLeaves = asyncHandler(async (req, res) => {
  const { status, leaveType, userId, month, year, page = 1, limit = 50 } = req.query;
  const filter = { ...tenantFilter(req), isDeleted: { $ne: true } };

  if (status)    filter.status    = status;
  if (leaveType) filter.leaveType = leaveType;
  if (userId)    filter.user      = userId;

  if (month && year) {
    const y = Number(year), m = Number(month);
    filter.startDate = { $lte: new Date(y, m, 0) };   // last day of month
    filter.endDate   = { $gte: new Date(y, m - 1, 1) }; // first day of month
  } else if (year) {
    filter.startDate = { $gte: new Date(Number(year), 0, 1) };
    filter.endDate   = { $lte: new Date(Number(year), 11, 31) };
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [records, total] = await Promise.all([
    Leave.find(filter)
      .populate('user', 'name customId role profileImage')
      .populate('approvedBy', 'name')
      .populate('rejectedBy', 'name')
      .populate('substituteTeacher', 'name customId')
      .sort({ createdAt: -1 })
      .skip(skip).limit(Number(limit)),
    Leave.countDocuments(filter),
  ]);

  ok(res, { data: records, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
});

// ── Get my own leave requests (teacher self-view) ─────────────────────────────
export const getMyLeaves = asyncHandler(async (req, res) => {
  const { status, year } = req.query;
  const filter = { ...tenantFilter(req), user: req.user._id, isDeleted: { $ne: true } };
  if (status) filter.status = status;
  if (year)   filter.startDate = { $gte: new Date(Number(year), 0, 1) };

  const records = await Leave.find(filter)
    .populate('approvedBy', 'name')
    .populate('rejectedBy', 'name')
    .populate('substituteTeacher', 'name customId')
    .sort({ createdAt: -1 });

  ok(res, { data: records });
});

// ── Get leave by ID ───────────────────────────────────────────────────────────
export const getLeaveById = asyncHandler(async (req, res) => {
  const record = await Leave.findOne({
    ...tenantFilter(req), _id: req.params.id, isDeleted: { $ne: true },
  })
    .populate('user', 'name customId role email phone')
    .populate('approvedBy', 'name')
    .populate('rejectedBy', 'name')
    .populate('substituteTeacher', 'name customId');
  if (!record) return err(res, 404, 'Leave request not found');
  // Teachers may only see their own records
  const role = req.user.role;
  if (role === 'teacher' && record.user._id.toString() !== req.user._id.toString()) {
    return err(res, 403, 'Access denied');
  }
  ok(res, { data: record });
});

// ── Apply for leave (teacher) ─────────────────────────────────────────────────
export const applyLeave = asyncHandler(async (req, res) => {
  const { leaveType, startDate, endDate, reason, attachmentUrl, isHalfDay, halfDayPart, substituteTeacherId } = req.body;

  if (!leaveType || !startDate || !endDate || !reason?.trim()) {
    return err(res, 400, 'leaveType, startDate, endDate, and reason are required');
  }

  const start = new Date(startDate);
  const end   = new Date(endDate);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return err(res, 400, 'Invalid dates');
  if (end < start) return err(res, 400, 'End date cannot be before start date');

  // Prevent past leave applications (allow today)
  const today = new Date(); today.setHours(0, 0, 0, 0);
  if (start < today) return err(res, 400, 'Cannot apply for leave in the past');

  // Check for overlapping leaves for the same user
  const overlap = await Leave.findOne({
    ...tenantFilter(req), user: req.user._id, isDeleted: { $ne: true },
    status: { $in: ['Pending', 'Approved'] },
    startDate: { $lte: end }, endDate: { $gte: start },
  });
  if (overlap) return err(res, 400, 'You already have an overlapping leave request');

  const totalDays = calcWorkingDays(start, end, Boolean(isHalfDay));

  const leave = await Leave.create({
    school: req.schoolId, branch: req.branchId,
    user: req.user._id,
    leaveType, startDate: start, endDate: end, totalDays,
    isHalfDay: Boolean(isHalfDay), halfDayPart: isHalfDay ? halfDayPart : undefined,
    reason: reason.trim(), attachmentUrl,
    substituteTeacher: substituteTeacherId || undefined,
    createdBy: req.user._id,
  });

  logAction(req, { action: 'LEAVE_APPLY', module: 'LEAVE', targetId: leave._id,
    details: { leaveType, totalDays, startDate, endDate } });
  ok(res, { data: leave });
});

// ── Admin: create leave on behalf of employee ────────────────────────────────
export const createLeaveForEmployee = asyncHandler(async (req, res) => {
  const { userId, leaveType, startDate, endDate, reason, attachmentUrl, isHalfDay, halfDayPart,
    substituteTeacherId, isPaid } = req.body;

  if (!userId || !leaveType || !startDate || !endDate || !reason?.trim()) {
    return err(res, 400, 'userId, leaveType, startDate, endDate, and reason are required');
  }

  const employee = await User.findOne({ _id: userId, school: req.schoolId, isDeleted: { $ne: true } });
  if (!employee) return err(res, 404, 'Employee not found');

  const start = new Date(startDate), end = new Date(endDate);
  if (end < start) return err(res, 400, 'End date cannot be before start date');
  const totalDays = calcWorkingDays(start, end, Boolean(isHalfDay));

  const leave = await Leave.create({
    school: req.schoolId, branch: req.branchId,
    user: userId, leaveType, startDate: start, endDate: end, totalDays,
    isHalfDay: Boolean(isHalfDay), halfDayPart: isHalfDay ? halfDayPart : undefined,
    reason: reason.trim(), attachmentUrl,
    substituteTeacher: substituteTeacherId || undefined,
    isPaid: isPaid !== undefined ? Boolean(isPaid) : true,
    createdBy: req.user._id,
  });

  logAction(req, { action: 'LEAVE_CREATE_ADMIN', module: 'LEAVE', targetId: leave._id,
    details: { userId, leaveType, totalDays } });
  ok(res, { data: leave });
});

// ── Update a pending leave (self or admin) ────────────────────────────────────
export const updateLeave = asyncHandler(async (req, res) => {
  const leave = await Leave.findOne({
    ...tenantFilter(req), _id: req.params.id, isDeleted: { $ne: true },
  });
  if (!leave) return err(res, 404, 'Leave request not found');
  if (leave.status !== 'Pending') return err(res, 400, 'Can only edit pending leave requests');

  const role = req.user.role;
  const isAdmin = ['schooladmin', 'school_admin', 'admin'].includes(role);
  if (!isAdmin && leave.user.toString() !== req.user._id.toString()) {
    return err(res, 403, 'Access denied');
  }

  // Recalculate days if dates changed
  if (req.body.startDate || req.body.endDate) {
    const s = new Date(req.body.startDate || leave.startDate);
    const e = new Date(req.body.endDate   || leave.endDate);
    if (e < s) return err(res, 400, 'End date cannot be before start date');
    req.body.totalDays = calcWorkingDays(s, e, req.body.isHalfDay ?? leave.isHalfDay);
  }

  const updated = await Leave.findByIdAndUpdate(
    req.params.id,
    { ...req.body, updatedBy: req.user._id },
    { new: true, runValidators: true }
  );
  logAction(req, { action: 'LEAVE_UPDATE', module: 'LEAVE', targetId: updated._id });
  ok(res, { data: updated });
});

// ── Approve leave ─────────────────────────────────────────────────────────────
export const approveLeave = asyncHandler(async (req, res) => {
  const { reviewNote } = req.body;
  const leave = await Leave.findOneAndUpdate(
    { ...tenantFilter(req), _id: req.params.id, status: 'Pending', isDeleted: { $ne: true } },
    { status: 'Approved', approvedBy: req.user._id, approvedAt: new Date(),
      reviewNote: reviewNote || undefined, updatedBy: req.user._id },
    { new: true }
  ).populate('user', 'name email');
  if (!leave) return err(res, 404, 'Leave request not found or already processed');

  // Notify the teacher
  try {
    await sendNotification({
      school: req.schoolId, branch: req.branchId, recipients: [leave.user._id],
      title: 'Leave Approved',
      message: `Your ${leave.leaveType} leave from ${leave.startDate.toDateString()} to ${leave.endDate.toDateString()} has been approved.`,
      type: 'info',
    });
  } catch (_) {}

  logAction(req, { action: 'LEAVE_APPROVE', module: 'LEAVE', targetId: leave._id });
  ok(res, { data: leave });
});

// ── Reject leave ──────────────────────────────────────────────────────────────
export const rejectLeave = asyncHandler(async (req, res) => {
  const { reviewNote } = req.body;
  if (!reviewNote?.trim()) return err(res, 400, 'A rejection reason is required');

  const leave = await Leave.findOneAndUpdate(
    { ...tenantFilter(req), _id: req.params.id, status: 'Pending', isDeleted: { $ne: true } },
    { status: 'Rejected', rejectedBy: req.user._id, rejectedAt: new Date(),
      reviewNote: reviewNote.trim(), updatedBy: req.user._id },
    { new: true }
  ).populate('user', 'name email');
  if (!leave) return err(res, 404, 'Leave request not found or already processed');

  try {
    await sendNotification({
      school: req.schoolId, branch: req.branchId, recipients: [leave.user._id],
      title: 'Leave Rejected',
      message: `Your ${leave.leaveType} leave request has been rejected. Reason: ${reviewNote}`,
      type: 'warning',
    });
  } catch (_) {}

  logAction(req, { action: 'LEAVE_REJECT', module: 'LEAVE', targetId: leave._id });
  ok(res, { data: leave });
});

// ── Cancel leave (self) ───────────────────────────────────────────────────────
export const cancelLeave = asyncHandler(async (req, res) => {
  const leave = await Leave.findOne({
    ...tenantFilter(req), _id: req.params.id,
    user: req.user._id, isDeleted: { $ne: true },
    status: { $in: ['Pending', 'Approved'] },
  });
  if (!leave) return err(res, 404, 'Leave request not found or cannot be cancelled');

  // Cannot cancel if leave already started
  if (new Date(leave.startDate) <= new Date()) return err(res, 400, 'Cannot cancel a leave that has already started');

  leave.status      = 'Cancelled';
  leave.cancelledAt = new Date();
  leave.updatedBy   = req.user._id;
  await leave.save();

  logAction(req, { action: 'LEAVE_CANCEL', module: 'LEAVE', targetId: leave._id });
  ok(res, { data: leave });
});

// ── Delete leave (admin, soft delete) ────────────────────────────────────────
export const deleteLeave = asyncHandler(async (req, res) => {
  const leave = await Leave.findOneAndUpdate(
    { ...tenantFilter(req), _id: req.params.id, isDeleted: { $ne: true } },
    { isDeleted: true, deletedAt: new Date(), deletedBy: req.user._id },
    { new: true }
  );
  if (!leave) return err(res, 404, 'Leave request not found');
  logAction(req, { action: 'LEAVE_DELETE', module: 'LEAVE', targetId: leave._id });
  ok(res, { message: 'Leave request deleted' });
});

// ── Leave statistics ──────────────────────────────────────────────────────────
export const getLeaveStats = asyncHandler(async (req, res) => {
  const { year } = req.query;
  const filter = { ...tenantFilter(req), isDeleted: { $ne: true } };
  if (year) {
    filter.startDate = { $gte: new Date(Number(year), 0, 1) };
    filter.endDate   = { $lte: new Date(Number(year), 11, 31) };
  }

  const [byStatus, byType, byMonth] = await Promise.all([
    Leave.aggregate([{ $match: filter }, { $group: { _id: '$status', count: { $sum: 1 }, totalDays: { $sum: '$totalDays' } } }]),
    Leave.aggregate([{ $match: filter }, { $group: { _id: '$leaveType', count: { $sum: 1 }, totalDays: { $sum: '$totalDays' } } }]),
    Leave.aggregate([
      { $match: filter },
      { $group: { _id: { $month: '$startDate' }, count: { $sum: 1 } } },
      { $sort: { '_id': 1 } },
    ]),
  ]);

  ok(res, { data: { byStatus, byType, byMonth } });
});
