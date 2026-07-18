import mongoose from 'mongoose';

const DEVICE_TYPES = ['QR_SCANNER', 'RFID_READER', 'NFC_READER', 'FACE_SCANNER', 'FINGERPRINT_SCANNER', 'HYBRID'];
const DEVICE_STATUS = ['online', 'offline', 'maintenance', 'decommissioned'];

const attendanceDeviceSchema = new mongoose.Schema(
  {
    name:         { type: String, required: true, trim: true },
    deviceType:   { type: String, required: true, enum: DEVICE_TYPES },
    serialNumber: { type: String, required: true, trim: true },
    apiKey:       { type: String, required: true, unique: true },
    secret:       { type: String, required: true },

    school:       { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    branch:       { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', index: true },
    campus:       { type: String, trim: true },
    location:     { type: String, trim: true },

    firmware:     { type: String, default: '1.0.0' },
    status:       { type: String, enum: DEVICE_STATUS, default: 'offline', index: true },
    lastOnline:   { type: Date },
    lastSync:     { type: Date },
    ipAddress:    { type: String },
    macAddress:   { type: String },

    health: {
      cpuUsage:     { type: Number },
      memoryUsage:  { type: Number },
      temperature:  { type: Number },
      uptime:       { type: Number },
      lastHeartbeat:{ type: Date },
    },

    capabilities: [{ type: String, enum: DEVICE_TYPES }],
    settings: {
      autoSync:       { type: Boolean, default: true },
      syncIntervalMs: { type: Number, default: 30000 },
      matchThreshold: { type: Number, default: 0.85 },
    },

    isDeleted:   { type: Boolean, default: false },
    deletedAt:   { type: Date },
    deletedBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

attendanceDeviceSchema.index({ school: 1, branch: 1, status: 1 });
attendanceDeviceSchema.index({ school: 1, serialNumber: 1 }, { unique: true });
attendanceDeviceSchema.index({ apiKey: 1 }, { unique: true });

const AttendanceDevice = mongoose.model('AttendanceDevice', attendanceDeviceSchema);
export default AttendanceDevice;
