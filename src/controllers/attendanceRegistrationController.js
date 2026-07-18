import asyncHandler from 'express-async-handler';
import EmployeeBiometric from '../models/EmployeeBiometric.js';
import BiometricDevice from '../models/BiometricDevice.js';
import BiometricAttendanceLog from '../models/BiometricAttendanceLog.js';
import Attendance from '../models/Attendance.js';
import AttendanceRule from '../models/AttendanceRule.js';
import User from '../models/User.js';
import { logAction } from '../utils/auditLogger.js';
import { emitAttendanceEvent } from '../utils/socket.js';
import zktecoSync from '../services/attendance/ZKTecoSyncService.js';
import attendanceEngine from '../services/attendance/BiometricAttendanceEngine.js';

const STAFF_ROLES = ['teacher', 'schooladmin', 'school_admin', 'admin', 'accountant', 'branchmanager', 'branch_manager'];

// ═══════════════════════════════════════════════════════════════════
// ATTENDANCE REGISTRATIONS — Central biometric enrollment
// ═══════════════════════════════════════════════════════════════════

// GET /api/attendance/registrations — List all employee biometric registrations
export const listRegistrations = asyncHandler(async (req, res) => {
  const schoolId = req.user.school || req.params.schoolId;
  const { branch, method, status, search, page = 1, limit = 20 } = req.query;

  const filter = { school: schoolId };
  if (branch) filter.branch = branch;
  if (method) filter.enrolledMethods = method;

  const skip = (Number(page) - 1) * Number(limit);

  const [registrations, total] = await Promise.all([
    EmployeeBiometric.find(filter)
      .populate('employee', 'firstName lastName email role department designation')
      .populate('branch', 'name')
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    EmployeeBiometric.countDocuments(filter),
  ]);

  // Enrich with enrollment status summary
  const enriched = registrations.map((r) => ({
    ...r,
    enrollmentSummary: {
      rfid: !!r.rfid?.uid,
      nfc: !!r.nfc?.uid,
      face: (r.face?.templateCount || 0) > 0,
      fingerprint: (r.fingerprint?.templates?.length || 0) > 0,
      totalMethods: r.enrolledMethods?.length || 0,
    },
  }));

  res.json({
    success: true,
    data: enriched,
    pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) },
  });
});

// GET /api/attendance/registrations/:employeeId — Get single employee registration
export const getRegistration = asyncHandler(async (req, res) => {
  const { employeeId } = req.params;
  const schoolId = req.user.school || req.params.schoolId;

  const registration = await EmployeeBiometric.findOne({ employee: employeeId, school: schoolId })
    .populate('employee', 'firstName lastName email role department designation phone')
    .populate('branch', 'name')
    .populate('rfid.device', 'name model serialNo')
    .populate('nfc.device', 'name model serialNo')
    .populate('face.device', 'name model serialNo')
    .populate('fingerprint.device', 'name model serialNo')
    .lean();

  if (!registration) {
    return res.status(404).json({ success: false, message: 'No biometric registration found for this employee' });
  }

  res.json({ success: true, data: registration });
});

// POST /api/attendance/registrations — Create/update biometric registration
export const createOrUpdateRegistration = asyncHandler(async (req, res) => {
  const schoolId = req.user.school || req.params.schoolId;
  const { employeeId, method, cardUid, templateData, deviceId } = req.body;

  if (!employeeId || !method) {
    return res.status(400).json({ success: false, message: 'employeeId and method are required' });
  }

  // Verify employee exists and is staff
  const employee = await User.findOne({ _id: employeeId, school: schoolId });
  if (!employee) {
    return res.status(404).json({ success: false, message: 'Employee not found' });
  }
  if (!STAFF_ROLES.includes(employee.role)) {
    return res.status(400).json({ success: false, message: 'Biometric registration is only for staff/employees' });
  }

  // Find or create registration record
  let registration = await EmployeeBiometric.findOne({ employee: employeeId, school: schoolId });
  if (!registration) {
    registration = await EmployeeBiometric.create({
      employee: employeeId,
      school: schoolId,
      branch: employee.branch || req.body.branchId,
    });
  }

  // Update method-specific data
  const methodUpper = method.toUpperCase();
  const now = new Date();

  switch (methodUpper) {
    case 'RFID':
      if (!cardUid) return res.status(400).json({ success: false, message: 'cardUid is required for RFID' });
      if (registration.rfid?.uid) registration.rfid.previousUids = [...(registration.rfid.previousUids || []), registration.rfid.uid];
      registration.rfid = {
        uid: cardUid, cardNumber: req.body.cardNumber || cardUid,
        status: 'active', device: deviceId || undefined,
        enrolledAt: now, enrolledBy: req.user._id,
        previousUids: registration.rfid?.previousUids || [],
      };
      break;
    case 'NFC':
      if (!cardUid) return res.status(400).json({ success: false, message: 'cardUid is required for NFC' });
      if (registration.nfc?.uid) registration.nfc.previousUids = [...(registration.nfc.previousUids || []), registration.nfc.uid];
      registration.nfc = {
        uid: cardUid, status: 'active', device: deviceId || undefined,
        enrolledAt: now, enrolledBy: req.user._id,
        previousUids: registration.nfc?.previousUids || [],
      };
      break;
    case 'FACE':
      registration.face = {
        embeddings: templateData?.embeddings || [],
        templateCount: templateData?.templateCount || 0,
        device: deviceId || undefined,
        status: 'active',
        enrolledAt: now, enrolledBy: req.user._id,
        livenessScore: templateData?.livenessScore,
      };
      break;
    case 'FINGERPRINT':
      if (req.body.fingerIndex === undefined) return res.status(400).json({ success: false, message: 'fingerIndex is required for fingerprint' });
      registration.fingerprint = registration.fingerprint || { templates: [], status: 'active' };
      const existingIdx = registration.fingerprint.templates.findIndex(t => t.fingerIndex === req.body.fingerIndex);
      const tmpl = {
        fingerIndex: req.body.fingerIndex,
        fingerName: req.body.fingerName || `Finger ${req.body.fingerIndex}`,
        templateRef: templateData?.templateRef,
        quality: templateData?.quality,
        status: 'active', enrolledAt: now,
      };
      if (existingIdx >= 0) registration.fingerprint.templates[existingIdx] = tmpl;
      else registration.fingerprint.templates.push(tmpl);
      registration.fingerprint.device = deviceId || registration.fingerprint.device;
      registration.fingerprint.enrolledBy = req.user._id;
      break;
    default:
      return res.status(400).json({ success: false, message: `Unsupported method: ${method}` });
  }

  // Update enrolled methods list
  const allMethods = new Set([...(registration.enrolledMethods || []), methodUpper]);
  registration.enrolledMethods = [...allMethods];
  registration.lastUpdated = now;
  registration.updatedBy = req.user._id;
  await registration.save();

  // Push enrollment to device if specified
  if (deviceId && methodUpper !== 'RFID' && methodUpper !== 'NFC') {
    try {
      await zktecoSync.pushEnrollment(deviceId, employee.deviceEmployeeId || employeeId, methodUpper, templateData);
    } catch {
      // Device push failed — registration saved locally, will sync later
    }
  }

  await logAction({ action: 'BIOMETRIC_REGISTRATION_UPDATE', user: req.user._id, school: schoolId, meta: { employeeId, method: methodUpper } });

  res.json({
    success: true,
    data: registration,
    message: `${methodUpper} enrollment saved for ${employee.firstName} ${employee.lastName}`,
  });
});

// DELETE /api/attendance/registrations/:employeeId/:method — Unregister a method
export const unregisterMethod = asyncHandler(async (req, res) => {
  const { employeeId, method } = req.params;
  const schoolId = req.user.school || req.params.schoolId;

  const registration = await EmployeeBiometric.findOne({ employee: employeeId, school: schoolId });
  if (!registration) return res.status(404).json({ success: false, message: 'Registration not found' });

  const methodUpper = method.toUpperCase();

  switch (methodUpper) {
    case 'RFID': registration.rfid = { uid: null, status: 'inactive' }; break;
    case 'NFC':  registration.nfc = { uid: null, status: 'inactive' }; break;
    case 'FACE': registration.face = { status: 'inactive', templateCount: 0, embeddings: [] }; break;
    case 'FINGERPRINT': registration.fingerprint = { templates: [], status: 'inactive' }; break;
  }

  registration.enrolledMethods = (registration.enrolledMethods || []).filter(m => m !== methodUpper);
  registration.lastUpdated = new Date();
  registration.updatedBy = req.user._id;
  await registration.save();

  res.json({ success: true, message: `${methodUpper} unregistered for employee` });
});

// GET /api/attendance/registrations/stats — Enrollment statistics
export const getRegistrationStats = asyncHandler(async (req, res) => {
  const schoolId = req.user.school || req.params.schoolId;

  const stats = await EmployeeBiometric.aggregate([
    { $match: { school: schoolId } },
    { $group: {
      _id: null,
      totalEmployees: { $sum: 1 },
      rfidCount: { $sum: { $cond: [{ $ne: ['$rfid.uid', null] }, 1, 0] } },
      nfcCount: { $sum: { $cond: [{ $ne: ['$nfc.uid', null] }, 1, 0] } },
      faceCount: { $sum: { $cond: [{ $gt: ['$face.templateCount', 0] }, 1, 0] } },
      fingerprintCount: { $sum: { $cond: [{ $gt: [{ $size: { $ifNull: ['$fingerprint.templates', []] } }, 0] }, 1, 0] } },
      fullyEnrolled: { $sum: { $cond: [{ $gte: [{ $size: { $ifNull: ['$enrolledMethods', []] } }, 2] }, 1, 0] } },
    }},
  ]);

  // Total staff count from User model
  const totalStaff = await User.countDocuments({ school: schoolId, role: { $in: STAFF_ROLES }, isDeleted: { $ne: true } });

  const s = stats[0] || { totalEmployees: 0, rfidCount: 0, nfcCount: 0, faceCount: 0, fingerprintCount: 0, fullyEnrolled: 0 };

  res.json({
    success: true,
    data: {
      totalStaff,
      enrolled: s.totalEmployees,
      unEnrolled: totalStaff - s.totalEmployees,
      byMethod: { rfid: s.rfidCount, nfc: s.nfcCount, face: s.faceCount, fingerprint: s.fingerprintCount },
      fullyEnrolled: s.fullyEnrolled,
    },
  });
});

// ═══════════════════════════════════════════════════════════════════
// ATTENDANCE DASHBOARD
// ═══════════════════════════════════════════════════════════════════

export const getAttendanceDashboard = asyncHandler(async (req, res) => {
  const schoolId = req.user.school || req.params.schoolId;
  const { branch, date } = req.query;

  const targetDate = date ? new Date(date) : new Date();
  const dayStart = new Date(targetDate); dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(targetDate); dayEnd.setHours(23, 59, 59, 999);

  const filter = { school: schoolId, date: { $gte: dayStart, $lte: dayEnd }, isDeleted: false };
  if (branch) filter.branch = branch;

  const [present, late, absent, total, deviceStats] = await Promise.all([
    Attendance.countDocuments({ ...filter, status: 'Present' }),
    Attendance.countDocuments({ ...filter, status: 'Late' }),
    Attendance.countDocuments({ ...filter, status: 'Absent' }),
    User.countDocuments({ school: schoolId, role: { $in: STAFF_ROLES }, isDeleted: { $ne: true }, ...(branch ? { branch } : {}) }),
    BiometricDevice.find({ school: schoolId, isDeleted: false }).select('name healthStatus lastSeen attendanceEnabled').lean(),
  ]);

  res.json({
    success: true,
    data: {
      date: dayStart,
      attendance: { present, late, absent, total, unaccounted: total - present - late - absent },
      attendanceRate: total > 0 ? Math.round(((present + late) / total) * 100) : 0,
      devices: deviceStats,
    },
  });
});

// ═══════════════════════════════════════════════════════════════════
// LIVE ATTENDANCE FEED
// ═══════════════════════════════════════════════════════════════════

export const getLiveAttendanceFeed = asyncHandler(async (req, res) => {
  const schoolId = req.user.school || req.params.schoolId;
  const { branch, limit = 50 } = req.query;

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const filter = { school: schoolId, date: { $gte: today }, isDeleted: false };
  if (branch) filter.branch = branch;

  const records = await Attendance.find(filter)
    .populate('user', 'firstName lastName role department designation')
    .populate('branch', 'name')
    .sort({ updatedAt: -1 })
    .limit(Number(limit))
    .lean();

  res.json({ success: true, data: records });
});

// ═══════════════════════════════════════════════════════════════════
// ATTENDANCE LOGS — Raw device event logs
// ═══════════════════════════════════════════════════════════════════

export const getAttendanceLogs = asyncHandler(async (req, res) => {
  const schoolId = req.user.school || req.params.schoolId;
  const { branch, device, method, date, startDate, endDate, employee, page = 1, limit = 50 } = req.query;

  const filter = { school: schoolId };
  if (branch) filter.branch = branch;
  if (device) filter.device = device;
  if (method) filter.method = method;
  if (employee) filter.employee = employee;

  if (date) {
    const d = new Date(date);
    const next = new Date(d); next.setDate(next.getDate() + 1);
    filter.timestamp = { $gte: d, $lt: next };
  } else if (startDate || endDate) {
    filter.timestamp = {};
    if (startDate) filter.timestamp.$gte = new Date(startDate);
    if (endDate) filter.timestamp.$lte = new Date(endDate);
  }

  const skip = (Number(page) - 1) * Number(limit);

  const [logs, total] = await Promise.all([
    BiometricAttendanceLog.find(filter)
      .populate('device', 'name model serialNo')
      .populate('employee', 'firstName lastName')
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    BiometricAttendanceLog.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: logs,
    pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) },
  });
});

// ═══════════════════════════════════════════════════════════════════
// ATTENDANCE REPORTS
// ═══════════════════════════════════════════════════════════════════

export const getAttendanceReport = asyncHandler(async (req, res) => {
  const schoolId = req.user.school || req.params.schoolId;
  const { startDate, endDate, branch, department, employee } = req.query;

  if (!startDate || !endDate) {
    return res.status(400).json({ success: false, message: 'startDate and endDate are required' });
  }

  const filter = {
    school: schoolId,
    date: { $gte: new Date(startDate), $lte: new Date(endDate) },
    isDeleted: false,
  };
  if (branch) filter.branch = branch;
  if (employee) filter.user = employee;

  const records = await Attendance.find(filter)
    .populate('user', 'firstName lastName role department designation')
    .populate('branch', 'name')
    .sort({ date: 1, checkInTime: 1 })
    .lean();

  // Group by employee for summary
  const byEmployee = {};
  for (const r of records) {
    const empId = r.user?._id?.toString();
    if (!empId) continue;
    if (!byEmployee[empId]) {
      byEmployee[empId] = {
        employee: r.user,
        present: 0, late: 0, absent: 0, halfDay: 0,
        totalWorkingHours: 0, totalOvertimeHours: 0, totalLateMinutes: 0,
      };
    }
    const e = byEmployee[empId];
    if (r.status === 'Present') e.present++;
    else if (r.status === 'Late') { e.late++; e.totalLateMinutes += r.lateMinutes || 0; }
    else if (r.status === 'Absent') e.absent++;
    else if (r.status === 'Half_Day') e.halfDay++;
    e.totalWorkingHours += r.workingHours || 0;
    e.totalOvertimeHours += r.overtimeHours || 0;
  }

  res.json({
    success: true,
    data: {
      records,
      summary: Object.values(byEmployee),
      period: { startDate, endDate },
    },
  });
});

// ═══════════════════════════════════════════════════════════════════
// LATE ANALYTICS
// ═══════════════════════════════════════════════════════════════════

export const getLateAnalytics = asyncHandler(async (req, res) => {
  const schoolId = req.user.school || req.params.schoolId;
  const { startDate, endDate, branch } = req.query;

  const start = startDate ? new Date(startDate) : new Date(new Date().setDate(1));
  const end = endDate ? new Date(endDate) : new Date();

  const filter = {
    school: schoolId,
    date: { $gte: start, $lte: end },
    status: 'Late',
    isDeleted: false,
  };
  if (branch) filter.branch = branch;

  const lateRecords = await Attendance.find(filter)
    .populate('user', 'firstName lastName role department')
    .populate('branch', 'name')
    .lean();

  // Aggregate by employee
  const byEmployee = {};
  for (const r of lateRecords) {
    const empId = r.user?._id?.toString();
    if (!empId) continue;
    if (!byEmployee[empId]) {
      byEmployee[empId] = { employee: r.user, lateCount: 0, totalLateMinutes: 0, avgLateMinutes: 0 };
    }
    byEmployee[empId].lateCount++;
    byEmployee[empId].totalLateMinutes += r.lateMinutes || 0;
  }

  const summary = Object.values(byEmployee).map(e => ({
    ...e,
    avgLateMinutes: e.lateCount > 0 ? Math.round(e.totalLateMinutes / e.lateCount) : 0,
  })).sort((a, b) => b.lateCount - a.lateCount);

  res.json({
    success: true,
    data: { summary, totalLateDays: lateRecords.length, period: { startDate: start, endDate: end } },
  });
});

// ═══════════════════════════════════════════════════════════════════
// PAYROLL ATTENDANCE INTEGRATION
// ═══════════════════════════════════════════════════════════════════

export const getPayrollAttendance = asyncHandler(async (req, res) => {
  const schoolId = req.user.school || req.params.schoolId;
  const { startDate, endDate, branch, department } = req.query;

  if (!startDate || !endDate) {
    return res.status(400).json({ success: false, message: 'startDate and endDate are required' });
  }

  const filter = {
    school: schoolId,
    date: { $gte: new Date(startDate), $lte: new Date(endDate) },
    isDeleted: false,
  };
  if (branch) filter.branch = branch;

  const records = await Attendance.find(filter)
    .populate('user', 'firstName lastName role department designation salary')
    .populate('branch', 'name')
    .lean();

  const byEmployee = {};
  for (const r of records) {
    const empId = r.user?._id?.toString();
    if (!empId) continue;
    if (!byEmployee[empId]) {
      byEmployee[empId] = {
        employee: r.user,
        workingDays: 0, presentDays: 0, lateDays: 0, absentDays: 0, halfDays: 0,
        totalWorkingHours: 0, totalOvertimeHours: 0, totalLateMinutes: 0,
        lateDeductions: 0, overtimePay: 0,
      };
    }
    const e = byEmployee[empId];
    e.workingDays++;
    if (r.status === 'Present') e.presentDays++;
    else if (r.status === 'Late') { e.lateDays++; e.totalLateMinutes += r.lateMinutes || 0; }
    else if (r.status === 'Absent') e.absentDays++;
    else if (r.status === 'Half_Day') e.halfDays++;
    e.totalWorkingHours += r.workingHours || 0;
    e.totalOvertimeHours += r.overtimeHours || 0;
  }

  // Calculate deductions/payments
  const result = Object.values(byEmployee).map(e => {
    const dailyRate = (e.employee?.salary || 0) / 30;
    e.lateDeductions = e.totalLateMinutes > 0 ? Math.round((e.totalLateMinutes / 60) * dailyRate) : 0;
    e.overtimePay = e.totalOvertimeHours > 0 ? Math.round(e.totalOvertimeHours * dailyRate * 1.5) : 0;
    e.netAttendancePay = (e.presentDays * dailyRate) + e.overtimePay - e.lateDeductions;
    return e;
  });

  res.json({ success: true, data: { employees: result, period: { startDate, endDate } } });
});

// ═══════════════════════════════════════════════════════════════════
// ATTENDANCE RULES
// ═══════════════════════════════════════════════════════════════════

export const listRules = asyncHandler(async (req, res) => {
  const schoolId = req.user.school || req.params.schoolId;
  const rules = await AttendanceRule.find({ school: schoolId, isActive: true }).sort({ name: 1 }).lean();
  res.json({ success: true, data: rules });
});

export const createRule = asyncHandler(async (req, res) => {
  const schoolId = req.user.school || req.params.schoolId;
  const rule = await AttendanceRule.create({ ...req.body, school: schoolId, createdBy: req.user._id });
  res.status(201).json({ success: true, data: rule });
});

export const updateRule = asyncHandler(async (req, res) => {
  const rule = await AttendanceRule.findByIdAndUpdate(req.params.ruleId, req.body, { new: true }).lean();
  if (!rule) return res.status(404).json({ success: false, message: 'Rule not found' });
  res.json({ success: true, data: rule });
});

export const deleteRule = asyncHandler(async (req, res) => {
  await AttendanceRule.findByIdAndUpdate(req.params.ruleId, { isActive: false });
  res.json({ success: true, message: 'Rule deactivated' });
});

// ═══════════════════════════════════════════════════════════════════
// SYNC TRIGGERS
// ═══════════════════════════════════════════════════════════════════

export const triggerSync = asyncHandler(async (req, res) => {
  const { deviceId } = req.params;
  const { since } = req.query;

  const logs = await zktecoSync.pullAttendanceLogs(deviceId, since ? new Date(since) : undefined);

  res.json({ success: true, data: { synced: logs.length }, message: `Synced ${logs.length} records from device` });
});

export const startDeviceEngine = asyncHandler(async (req, res) => {
  attendanceEngine.start(Number(req.body.intervalMs) || 10000);
  res.json({ success: true, message: 'Attendance engine started' });
});

export const stopDeviceEngine = asyncHandler(async (req, res) => {
  attendanceEngine.stop();
  res.json({ success: true, message: 'Attendance engine stopped' });
});

// ═══════════════════════════════════════════════════════════════════
// EMPLOYEE LOOKUP (for registration page)
// ═══════════════════════════════════════════════════════════════════

export const searchStaff = asyncHandler(async (req, res) => {
  const schoolId = req.user.school || req.params.schoolId;
  const { search, branch, page = 1, limit = 20 } = req.query;

  const filter = { school: schoolId, role: { $in: STAFF_ROLES }, isDeleted: { $ne: true } };
  if (branch) filter.branch = branch;
  if (search) {
    filter.$or = [
      { firstName: { $regex: search, $options: 'i' } },
      { lastName: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
    ];
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [users, total] = await Promise.all([
    User.find(filter).select('firstName lastName email role department designation branch').skip(skip).limit(Number(limit)).lean(),
    User.countDocuments(filter),
  ]);

  // Enrich with registration status
  const enriched = await Promise.all(users.map(async (u) => {
    const reg = await EmployeeBiometric.findOne({ employee: u._id, school: schoolId }).select('enrolledMethods rfid.face.nfc.fingerprint').lean();
    return { ...u, registeredMethods: reg?.enrolledMethods || [] };
  }));

  res.json({
    success: true,
    data: enriched,
    pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) },
  });
});
