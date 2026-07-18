import mongoose from 'mongoose';

/**
 * BiometricAttendanceLog — Raw attendance event from a biometric device.
 *
 * This is NOT the same as the unified Attendance model. This captures
 * the raw event BEFORE the attendance engine processes it into an
 * Attendance record. Enables offline replay, auditing, and dedup.
 */
const biometricAttendanceLogSchema = new mongoose.Schema(
  {
    device: { type: mongoose.Schema.Types.ObjectId, ref: 'BiometricDevice', required: true, index: true },
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', index: true },

    // Device-side employee ID (PIN on ZKTeco)
    deviceEmployeeId: { type: String, required: true },

    // Resolved employee (set after lookup)
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    matched:  { type: Boolean, default: false },

    // Event details
    timestamp:  { type: Date, required: true, index: true },
    method:     { type: String, enum: ['FACE', 'FINGERPRINT', 'RFID', 'NFC', 'PASSWORD'], required: true },
    verifyMode: { type: String },   // ZKTeco verify mode string
    matchScore: { type: Number },

    // RFID/NFC card UID if applicable
    cardUid:    { type: String },

    // Processing status
    processed:    { type: Boolean, default: false, index: true },
    attendanceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Attendance' },  // linked attendance record
    processedAt:  { type: Date },

    // Dedup
    eventHash: { type: String, unique: true, sparse: true },

    // Raw payload from device
    rawData: { type: mongoose.Schema.Types.Mixed },

    // Sync context
    source: { type: String, enum: ['PUSH', 'PULL'], default: 'PULL' },
    syncBatchId: { type: String, index: true },
  },
  { timestamps: true }
);

biometricAttendanceLogSchema.index({ school: 1, branch: 1, timestamp: -1 });
biometricAttendanceLogSchema.index({ employee: 1, timestamp: -1 });
biometricAttendanceLogSchema.index({ processed: 1, school: 1, timestamp: -1 });

const BiometricAttendanceLog = mongoose.model('BiometricAttendanceLog', biometricAttendanceLogSchema);
export default BiometricAttendanceLog;
