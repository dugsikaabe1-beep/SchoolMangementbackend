import mongoose from 'mongoose';

/**
 * AttendanceRule — Per-school configurable attendance rules.
 *
 * Schools define their working hours, late thresholds, overtime rules,
 * weekends, and holidays.  The attendance engine reads these rules when
 * computing Present / Late / Early Leave / Overtime / Absent status.
 *
 * Each school gets ONE AttendanceRule document.  Super Admin can set
 * global defaults; school admins customise within their plan limits.
 */
const attendanceRuleSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true, unique: true },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' }, // null = applies to all branches

    // ── Working Hours ────────────────────────────────────────────────
    workingHours: {
      startTime:  { type: String, default: '08:00' },   // HH:MM (24h)
      endTime:    { type: String, default: '16:00' },
      gracePeriodMinutes: { type: Number, default: 15 }, // minutes after startTime before marking Late
      earlyLeaveMinutes:  { type: Number, default: 30 }, // minutes before endTime = Early Leave
    },

    // ── Shifts (optional — overrides workingHours when enabled) ──────
    useShifts: { type: Boolean, default: false },
    shifts: [{
      name:       { type: String, required: true },     // e.g. "Morning", "Afternoon"
      startTime:  { type: String, required: true },     // HH:MM
      endTime:    { type: String, required: true },
      lateGraceMinutes: { type: Number, default: 10 },
    }],

    // ── Overtime ─────────────────────────────────────────────────────
    overtime: {
      enabled:            { type: Boolean, default: false },
      maxHoursPerDay:     { type: Number, default: 2 },
      maxHoursPerWeek:    { type: Number, default: 10 },
      rate:               { type: Number, default: 1.5 },  // multiplier
      minMinutesRequired: { type: Number, default: 30 },   // minimum extra minutes to count as OT
    },

    // ── Weekend Definition ──────────────────────────────────────────
    weekendDays: [{ type: Number, min: 0, max: 6 }],   // 0=Sun, 6=Sat  (default: [0, 5] = Sun+Fri for Islamic schools)

    // ── Holidays ────────────────────────────────────────────────────
    holidays: [{
      name:  { type: String, required: true },
      date:  { type: Date, required: true },            // specific date
      recurring: { type: Boolean, default: false },     // same date every year
    }],

    // ── Half-Day Rules ──────────────────────────────────────────────
    halfDay: {
      enabled:       { type: Boolean, default: false },
      cutoffMinutes: { type: Number, default: 240 },    // worked < 240 min = half day
    },

    // ── Allowed Methods (per-school toggle) ─────────────────────────
    allowedMethods: [{
      type: String,
      enum: ['MANUAL', 'QR', 'RFID', 'NFC', 'FACE_RECOGNITION', 'FINGERPRINT'],
    }],

    // ── Auto-Absent ─────────────────────────────────────────────────
    autoAbsent: {
      enabled:  { type: Boolean, default: true },       // auto-mark absent after end of day if no check-in
      time:     { type: String, default: '23:59' },     // when to run auto-absent
    },

    // ── Notifications ───────────────────────────────────────────────
    notifications: {
      lateCheckIn:    { type: Boolean, default: true },
      earlyCheckOut:  { type: Boolean, default: true },
      absentAlert:    { type: Boolean, default: true },
      overtimeAlert:  { type: Boolean, default: false },
    },

    // ── Audit ───────────────────────────────────────────────────────
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    isDeleted: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

attendanceRuleSchema.index({ school: 1, isDeleted: 1 });

const AttendanceRule = mongoose.model('AttendanceRule', attendanceRuleSchema);
export default AttendanceRule;
