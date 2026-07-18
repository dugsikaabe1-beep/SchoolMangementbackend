import asyncHandler from 'express-async-handler';
import AttendanceRule from '../models/AttendanceRule.js';
import Attendance from '../models/Attendance.js';
import { logAction } from '../utils/auditLogger.js';

/**
 * Get attendance rules for the current school.
 * Creates default rules if none exist.
 */
export const getAttendanceRules = asyncHandler(async (req, res) => {
  const schoolId = req.user.school;
  let rules = await AttendanceRule.findOne({ school: schoolId, isDeleted: false });
  if (!rules) {
    rules = await AttendanceRule.create({
      school: schoolId,
      branch: req.user.branch,
      allowedMethods: ['MANUAL', 'QR'],
      createdBy: req.user._id,
    });
  }
  res.json({ success: true, data: rules });
});

/**
 * Update attendance rules for the current school.
 */
export const updateAttendanceRules = asyncHandler(async (req, res) => {
  const schoolId = req.user.school;
  const updates = req.body;

  // Fields that can be updated
  const allowedFields = [
    'workingHours', 'useShifts', 'shifts', 'overtime',
    'weekendDays', 'holidays', 'halfDay', 'allowedMethods',
    'autoAbsent', 'notifications',
  ];

  const setFields = {};
  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      setFields[field] = updates[field];
    }
  }
  setFields.updatedBy = req.user._id;

  let rules = await AttendanceRule.findOne({ school: schoolId, isDeleted: false });
  if (!rules) {
    rules = await AttendanceRule.create({
      school: schoolId,
      branch: req.user.branch,
      ...setFields,
      createdBy: req.user._id,
    });
  } else {
    Object.assign(rules, setFields);
    await rules.save();
  }

  await logAction({
    userId: req.user._id,
    schoolId,
    module: 'ATTENDANCE',
    action: 'ATTENDANCE_RULES_UPDATED',
    details: { updatedFields: Object.keys(setFields) },
  });

  res.json({ success: true, data: rules });
});

/**
 * Add a holiday.
 */
export const addHoliday = asyncHandler(async (req, res) => {
  const schoolId = req.user.school;
  const { name, date, recurring } = req.body;

  if (!name || !date) {
    return res.status(400).json({ success: false, message: 'Name and date are required' });
  }

  let rules = await AttendanceRule.findOne({ school: schoolId, isDeleted: false });
  if (!rules) {
    return res.status(404).json({ success: false, message: 'Attendance rules not configured' });
  }

  rules.holidays.push({ name, date: new Date(date), recurring: recurring || false });
  rules.updatedBy = req.user._id;
  await rules.save();

  res.json({ success: true, data: rules });
});

/**
 * Remove a holiday.
 */
export const removeHoliday = asyncHandler(async (req, res) => {
  const schoolId = req.user.school;
  const { holidayId } = req.params;

  const rules = await AttendanceRule.findOne({ school: schoolId, isDeleted: false });
  if (!rules) {
    return res.status(404).json({ success: false, message: 'Attendance rules not configured' });
  }

  rules.holidays = rules.holidays.filter(h => h._id.toString() !== holidayId);
  rules.updatedBy = req.user._id;
  await rules.save();

  res.json({ success: true, data: rules });
});

/**
 * Get attendance status using rules engine.
 * Computes Present / Late / Early Leave / Overtime for a given check-in/out.
 */
export const computeAttendanceStatus = async (schoolId, checkInTime, checkOutTime = null) => {
  const rules = await AttendanceRule.findOne({ school: schoolId, isDeleted: false });
  if (!rules) {
    // Default rules
    return computeWithDefaults(checkInTime, checkOutTime);
  }

  const dateStr = checkInTime.toISOString().split('T')[0];
  const checkInDate = new Date(dateStr);

  // Check weekend
  const dayOfWeek = checkInDate.getDay();
  if (rules.weekendDays && rules.weekendDays.includes(dayOfWeek)) {
    return { status: 'Weekend', lateMinutes: 0, workingHours: 0, overtimeHours: 0 };
  }

  // Check holiday
  if (rules.holidays && rules.holidays.length > 0) {
    const isHoliday = rules.holidays.some(h => {
      const hDate = new Date(h.date);
      if (h.recurring) {
        return hDate.getMonth() === checkInDate.getMonth() && hDate.getDate() === checkInDate.getDate();
      }
      return hDate.toISOString().split('T')[0] === dateStr;
    });
    if (isHoliday) {
      return { status: 'Holiday', lateMinutes: 0, workingHours: 0, overtimeHours: 0 };
    }
  }

  // Compute using shift or working hours
  let startTime, endTime, gracePeriodMinutes, earlyLeaveMinutes;

  if (rules.useShifts && rules.shifts && rules.shifts.length > 0) {
    // Find the matching shift (use first shift as default)
    const shift = rules.shifts[0];
    startTime = shift.startTime;
    endTime = shift.endTime;
    gracePeriodMinutes = shift.lateGraceMinutes || 10;
    earlyLeaveMinutes = rules.workingHours.earlyLeaveMinutes || 30;
  } else {
    startTime = rules.workingHours.startTime || '08:00';
    endTime = rules.workingHours.endTime || '16:00';
    gracePeriodMinutes = rules.workingHours.gracePeriodMinutes || 15;
    earlyLeaveMinutes = rules.workingHours.earlyLeaveMinutes || 30;
  }

  // Parse times
  const [startH, startM] = startTime.split(':').map(Number);
  const [endH, endM] = endTime.split(':').map(Number);

  const shiftStart = new Date(checkInDate);
  shiftStart.setHours(startH, startM, 0, 0);
  const shiftEnd = new Date(checkInDate);
  shiftEnd.setHours(endH, endM, 0, 0);

  const expectedHours = (shiftEnd - shiftStart) / (1000 * 60 * 60);

  // Late check
  const lateThreshold = new Date(shiftStart.getTime() + gracePeriodMinutes * 60 * 1000);
  const lateMinutes = checkInTime > lateThreshold
    ? Math.round((checkInTime - shiftStart) / (1000 * 60))
    : 0;

  let status = 'Present';
  if (lateMinutes > 0) status = 'Late';

  // Working hours & overtime
  let workingHours = 0;
  let overtimeHours = 0;

  if (checkOutTime) {
    workingHours = (checkOutTime - checkInTime) / (1000 * 60 * 60);

    // Early leave check
    const earlyLeaveThreshold = new Date(shiftEnd.getTime() - earlyLeaveMinutes * 60 * 1000);
    if (checkOutTime < earlyLeaveThreshold && workingHours < expectedHours / 2) {
      status = 'Half_Day';
    } else if (checkOutTime < earlyLeaveThreshold) {
      status = 'Early_Leave';
    }

    // Overtime
    if (rules.overtime && rules.overtime.enabled && workingHours > expectedHours) {
      overtimeHours = Math.round((workingHours - expectedHours) * 100) / 100;
      if (rules.overtime.minMinutesRequired && (overtimeHours * 60) < rules.overtime.minMinutesRequired) {
        overtimeHours = 0; // below minimum
      }
      if (rules.overtime.maxHoursPerDay && overtimeHours > rules.overtime.maxHoursPerDay) {
        overtimeHours = rules.overtime.maxHoursPerDay; // cap
      }
    }
  }

  return {
    status,
    lateMinutes,
    workingHours: Math.round(workingHours * 100) / 100,
    overtimeHours,
    expectedHours,
    shiftStart: startTime,
    shiftEnd: endTime,
  };
};

function computeWithDefaults(checkInTime, checkOutTime) {
  const dateStr = checkInTime.toISOString().split('T')[0];
  const [startH, startM] = [8, 0]; // default 8 AM
  const shiftStart = new Date(dateStr);
  shiftStart.setHours(startH, startM, 0, 0);

  const lateMinutes = checkInTime > new Date(shiftStart.getTime() + 15 * 60 * 1000)
    ? Math.round((checkInTime - shiftStart) / (1000 * 60))
    : 0;

  let status = lateMinutes > 0 ? 'Late' : 'Present';
  let workingHours = 0;
  let overtimeHours = 0;

  if (checkOutTime) {
    workingHours = (checkOutTime - checkInTime) / (1000 * 60 * 60);
    if (workingHours < 4) status = 'Half_Day';
    else if (workingHours < 7.5) status = 'Early_Leave';
    if (workingHours > 8) overtimeHours = workingHours - 8;
  }

  return { status, lateMinutes, workingHours: Math.round(workingHours * 100) / 100, overtimeHours };
}
