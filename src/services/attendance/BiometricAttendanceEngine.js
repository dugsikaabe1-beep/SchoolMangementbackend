/**
 * BiometricAttendanceEngine — Processes raw BiometricAttendanceLogs into
 * Attendance records. Runs as background worker (BullMQ or memory queue).
 *
 * Flow:
 *   1. BiometricAttendanceLog inserted (from ZKTecoSyncService push/pull)
 *   2. Engine picks up unprocessed logs
 *   3. Looks up EmployeeBiometric → resolves deviceEmployeeId → User
 *   4. Checks rules engine (shift schedule, grace period, overtime)
 *   5. Creates/updates Attendance record (one per user per day)
 *   6. Marks BiometricAttendanceLog.processed = true
 *   7. Emits Socket.io event for live feed
 */
import BiometricAttendanceLog from '../../models/BiometricAttendanceLog.js';
import EmployeeBiometric from '../../models/EmployeeBiometric.js';
import Attendance from '../../models/Attendance.js';
import AttendanceRule from '../../models/AttendanceRule.js';
import { getIO } from '../../utils/socket.js';

class BiometricAttendanceEngine {
  constructor() {
    this._running = false;
    this._timer = null;
  }

  // ── Start background processor ────────────────────────────────────
  start(intervalMs = 10000) {
    if (this._running) return;
    this._running = true;
    this._timer = setInterval(() => this._processBatch(), intervalMs);
    console.log('[AttendanceEngine] Started — polling every', intervalMs, 'ms');
  }

  stop() {
    this._running = false;
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    console.log('[AttendanceEngine] Stopped');
  }

  // ── Process a batch of unprocessed logs ───────────────────────────
  async _processBatch(batchSize = 50) {
    try {
      const logs = await BiometricAttendanceLog.find({ processed: false })
        .sort({ timestamp: 1 })
        .limit(batchSize)
        .lean();

      if (logs.length === 0) return;

      for (const log of logs) {
        await this._processOne(log);
      }
    } catch (err) {
      console.error('[AttendanceEngine] Batch error:', err.message);
    }
  }

  // ── Process a single raw log ──────────────────────────────────────
  async _processOne(log) {
    try {
      // 1. Resolve deviceEmployeeId → User via EmployeeBiometric
      const employeeBiometric = await EmployeeBiometric.findOne({
        school: log.school,
        $or: [
          { 'rfid.uid': log.cardUid },
          { 'nfc.uid': log.cardUid },
          { 'rfid.uid': log.deviceEmployeeId },
          { 'nfc.uid': log.deviceEmployeeId },
        ],
      }).lean();

      if (!employeeBiometric) {
        // Try direct deviceEmployeeId lookup on User
        await BiometricAttendanceLog.findByIdAndUpdate(log._id, {
          processed: true, processedAt: new Date(), matched: false,
        });
        return;
      }

      const userId = employeeBiometric.employee;

      // 2. Find or create today's Attendance record
      const dayStart = new Date(log.timestamp);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setHours(23, 59, 59, 999);

      let attendance = await Attendance.findOne({
        user: userId, date: { $gte: dayStart, $lte: dayEnd },
        school: log.school, isDeleted: false,
      });

      if (!attendance) {
        // Check if staff role
        const STAFF_ROLES = ['teacher', 'schooladmin', 'school_admin', 'admin', 'accountant', 'branchmanager', 'branch_manager'];
        attendance = await Attendance.create({
          user: userId,
          date: log.timestamp,
          checkInTime: log.timestamp,
          method: log.method,
          school: log.school,
          branch: log.branch,
          status: 'Present',
          deviceInfo: { deviceId: String(log.device), deviceName: log.source },
        });
      } else {
        // Update existing — treat later timestamp as check-out
        if (log.timestamp > (attendance.checkInTime || 0)) {
          attendance.checkOutTime = log.timestamp;
        }
      }

      // 3. Compute working hours if check-out exists
      if (attendance.checkInTime && attendance.checkOutTime) {
        const ms = attendance.checkOutTime - attendance.checkInTime;
        attendance.workingHours = Math.round((ms / 3600000) * 100) / 100;
        attendance.overtimeHours = Math.max(0, attendance.workingHours - (attendance.expectedHours || 8));
      }

      // 4. Check late status
      const rule = await AttendanceRule.findOne({
        school: log.school, isActive: true,
        effectiveFrom: { $lte: log.timestamp },
        $or: [{ effectiveTo: null }, { effectiveTo: { $gte: log.timestamp } }],
      }).lean();

      if (rule && attendance.checkInTime) {
        const graceMs = (rule.gracePeriodMinutes || 0) * 60000;
        const workStart = this._parseTime(rule.workStartTime || '08:00', log.timestamp);
        if (attendance.checkInTime > workStart + graceMs) {
          attendance.status = 'Late';
          attendance.lateMinutes = Math.round((attendance.checkInTime - workStart) / 60000);
        }
      }

      attendance.updatedBy = userId;
      await attendance.save();

      // 5. Mark log as processed
      await BiometricAttendanceLog.findByIdAndUpdate(log._id, {
        processed: true,
        processedAt: new Date(),
        matched: true,
        employee: userId,
        attendanceId: attendance._id,
      });

      // 6. Emit Socket.io event for live feed
      this._emitEvent(log.school, {
        employeeId: userId,
        deviceEmployeeId: log.deviceEmployeeId,
        method: log.method,
        timestamp: log.timestamp,
        status: attendance.status,
        device: log.device,
      });
    } catch (err) {
      console.error('[AttendanceEngine] Process error:', err.message);
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────
  _parseTime(timeStr, referenceDate) {
    const [h, m] = timeStr.split(':').map(Number);
    const d = new Date(referenceDate);
    d.setHours(h, m, 0, 0);
    return d;
  }

  _emitEvent(schoolId, data) {
    try {
      const io = getIO();
      if (io) {
        io.to(`attendance_${schoolId}`).emit('attendance:check-in', {
          ...data,
          _serverTimestamp: Date.now(),
        });
      }
    } catch { /* socket not available */ }
  }
}

export default new BiometricAttendanceEngine();
