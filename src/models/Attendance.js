import mongoose from 'mongoose';

const STAFF_ROLES = ['teacher', 'schooladmin', 'school_admin', 'admin', 'accountant', 'branchmanager', 'branch_manager'];

const attendanceSchema = new mongoose.Schema(
  {
    // Who
    user:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    userRole:    { type: String },          // snapshot at time of marking
    department:  { type: String, trim: true },
    designation: { type: String, trim: true },

    // When
    date:        { type: Date, required: true, index: true },
    checkInTime: { type: Date },
    checkOutTime:{ type: Date },

    // Working hours (computed on checkout)
    workingHours:  { type: Number, default: 0 },  // decimal hours
    overtimeHours: { type: Number, default: 0 },
    expectedHours: { type: Number, default: 8 },  // configured per school

    // Status
    status: {
      type: String,
      enum: ['Present', 'Absent', 'Late', 'Excused', 'Early_Leave', 'Half_Day'],
      default: 'Present',
    },
    isHalfDay:   { type: Boolean, default: false },
    lateMinutes: { type: Number, default: 0 },
    earlyLeaveMinutes: { type: Number, default: 0 },

    // Context (optional for staff attendance — class/subject only needed for student attendance)
    class:       { type: mongoose.Schema.Types.ObjectId, ref: 'Class' },
    section:     { type: mongoose.Schema.Types.ObjectId, ref: 'Section' },
    subject:     { type: mongoose.Schema.Types.ObjectId, ref: 'Subject' },

    // Tenant
    school:      { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    branch:      { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', index: true },
    academicYear:{ type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', index: true },

    // Who recorded it
    markedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    // Method
    method: {
      type: String,
      enum: ['MANUAL', 'QR', 'RFID', 'NFC', 'FACE_RECOGNITION', 'FINGERPRINT'],
      default: 'MANUAL',
    },

    // Location
    location: {
      latitude:           Number,
      longitude:          Number,
      accuracy:           Number,
      geofenceValid:      { type: Boolean, default: null },
      distanceFromSchool: Number,
    },

    // Device info
    deviceInfo: {
      type:       String,
      deviceId:   String,
      deviceName: String,
      userAgent:  String,
      platform:   String,
    },

    // Biometric verification metadata (no raw images/templates stored)
    verificationData: {
      type:              mongoose.Schema.Types.Mixed,
      qrCode:            String,
      rfidTag:           String,
      nfcId:             String,
      faceMatchScore:    Number,
      fingerprintScore:  Number,
      livenessScore:     Number,
      confidence:        Number,
    },

    // Notes
    remarks: { type: String, trim: true },

    // Soft delete
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

// ── Indexes ───────────────────────────────────────────────────────────────────
attendanceSchema.index({ school: 1, branch: 1, date: 1 });
attendanceSchema.index({ user: 1, date: 1 });
attendanceSchema.index({ school: 1, branch: 1, isDeleted: 1 });
attendanceSchema.index({ method: 1, date: 1 });
attendanceSchema.index({ school: 1, userRole: 1, date: 1 });
// Prevent duplicate attendance per user per day per method
attendanceSchema.index({ user: 1, date: 1, method: 1 }, { unique: false });

// ── Static helper: is this role a staff/employee role ────────────────────────
attendanceSchema.statics.STAFF_ROLES = STAFF_ROLES;

const Attendance = mongoose.model('Attendance', attendanceSchema);
export default Attendance;
