import mongoose from 'mongoose';

const attendanceSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: Date, required: true },
    status: {
      type: String,
      enum: ['Present', 'Absent', 'Late', 'Excused', 'Early_Leave'],
      default: 'Present',
    },
    class: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
    section: { type: mongoose.Schema.Types.ObjectId, ref: 'Section' },
    subject: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    academicYear: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', required: true, index: true },
    markedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Who marked the attendance
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    
    // Advanced attendance methods
    method: {
      type: String,
      enum: ['MANUAL', 'QR', 'RFID', 'NFC', 'FACE_RECOGNITION', 'FINGERPRINT'],
      default: 'MANUAL'
    },
    checkInTime: { type: Date },
    checkOutTime: { type: Date },
    location: {
      latitude: Number,
      longitude: Number,
      accuracy: Number,
      geofenceValid: { type: Boolean, default: null },
      distanceFromSchool: Number
    },
    deviceInfo: {
      type: String,
      deviceId: String,
      deviceName: String
    },
    verificationData: {
      type: mongoose.Schema.Types.Mixed, // Store method-specific verification data
      qrCode: String,
      rfidTag: String,
      nfcId: String,
      faceMatchScore: Number,
      fingerprintTemplate: String
    },
    
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

// Index for multi-tenant and multi-branch queries
attendanceSchema.index({ school: 1, branch: 1, date: 1 });
attendanceSchema.index({ user: 1, date: 1 });
attendanceSchema.index({ school: 1, branch: 1, deletedAt: 1 });
attendanceSchema.index({ method: 1, date: 1 });

const Attendance = mongoose.model('Attendance', attendanceSchema);
export default Attendance;
