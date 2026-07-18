import mongoose from 'mongoose';

/**
 * AttendanceDeviceLog — Immutable audit log for every device interaction.
 *
 * Every heartbeat, attendance scan, enrollment push, firmware check, error,
 * and credential rotation is recorded here.  Never update — only insert.
 */
const attendanceDeviceLogSchema = new mongoose.Schema(
  {
    device:     { type: mongoose.Schema.Types.ObjectId, ref: 'AttendanceDevice', required: true, index: true },
    school:     { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    branch:     { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', index: true },

    action: {
      type: String,
      required: true,
      enum: [
        // Device lifecycle
        'REGISTERED', 'UPDATED', 'DELETED', 'CREDENTIALS_REGENERATED',
        'HEARTBEAT', 'FIRMWARE_CHECK', 'FIRMWARE_UPDATED',
        // Connection
        'CONNECTED', 'DISCONNECTED', 'CONNECTION_FAILED', 'TIMEOUT',
        // Attendance
        'SCAN_SUCCESS', 'SCAN_FAILED', 'SCAN_DUPLICATE', 'SCAN_UNAUTHORIZED',
        // Enrollment
        'ENROLL_FACE', 'ENROLL_FINGERPRINT', 'ENROLL_RFID', 'ENROLL_NFC',
        'ENROLL_QR',
        // Sync
        'SYNC_START', 'SYNC_COMPLETE', 'SYNC_FAILED',
        // General
        'ERROR', 'WARNING', 'INFO',
      ],
    },

    status: {
      type: String,
      enum: ['success', 'failure', 'warning', 'info'],
      required: true,
    },

    // What happened (human-readable)
    message:    { type: String },

    // Who was involved
    employee:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    // Attendance method used (if applicable)
    method:     { type: String, enum: ['MANUAL', 'QR', 'RFID', 'NFC', 'FACE_RECOGNITION', 'FINGERPRINT'] },

    // Technical details
    ipAddress:  { type: String },
    errorCode:  { type: String },
    stack:      { type: String },               // error stack trace (truncated)
    meta:       { type: mongoose.Schema.Types.Mixed },  // extra payload

    // Timing
    timestamp:  { type: Date, default: Date.now, index: true },
  },
  {
    timestamps: false,    // immutable log — no updatedAt
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Compound indexes for common queries
attendanceDeviceLogSchema.index({ device: 1, timestamp: -1 });
attendanceDeviceLogSchema.index({ school: 1, action: 1, timestamp: -1 });
attendanceDeviceLogSchema.index({ school: 1, status: 1, timestamp: -1 });
attendanceDeviceLogSchema.index({ employee: 1, timestamp: -1 });

// TTL index — auto-delete after 90 days (configurable per school later)
attendanceDeviceLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

const AttendanceDeviceLog = mongoose.model('AttendanceDeviceLog', attendanceDeviceLogSchema);
export default AttendanceDeviceLog;
