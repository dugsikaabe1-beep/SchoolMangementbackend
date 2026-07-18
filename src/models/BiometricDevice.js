import mongoose from 'mongoose';

const HEALTH_STATUS = ['ONLINE', 'OFFLINE', 'DEGRADED', 'MAINTENANCE', 'UNKNOWN'];

const biometricDeviceSchema = new mongoose.Schema(
  {
    name:       { type: String, required: true, trim: true },
    serialNo:   { type: String, required: true, unique: true, trim: true },
    model:      { type: String, required: true, trim: true },   // K14, K20, MB20, MB360, SpeedFace V5L, SpeedFace H5L
    manufacturer:{ type: String, default: 'ZKTeco' },

    // Connection
    ip:       { type: String, required: true, trim: true },
    port:     { type: Number, default: 4370 },
    password: { type: String, default: '0' },
    protocol: { type: String, enum: ['TCP', 'UDP', 'SERIAL'], default: 'TCP' },
    pushKey:  { type: String, default: 'push' },

    // Capabilities — determined by device model
    capabilities: {
      face:        { type: Boolean, default: false },
      fingerprint: { type: Boolean, default: false },
      rfid:        { type: Boolean, default: true },
      nfc:         { type: Boolean, default: false },
      password:    { type: Boolean, default: true },
    },

    // Capacity
    faceCapacity:     { type: Number, default: 0 },
    faceUsage:        { type: Number, default: 0 },
    fingerprintCapacity: { type: Number, default: 0 },
    fingerprintUsage:    { type: Number, default: 0 },
    cardCapacity:     { type: Number, default: 0 },
    cardUsage:        { type: Number, default: 0 },

    // Tenant
    school:   { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    branch:   { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', index: true },

    // Status
    healthStatus:  { type: String, enum: HEALTH_STATUS, default: 'UNKNOWN', index: true },
    lastSeen:      { type: Date },
    lastSyncAt:    { type: Date },
    firmware:      { type: String },
    platform:      { type: String },
    macAddress:    { type: String },

    // Attendance integration
    attendanceEnabled: { type: Boolean, default: true },
    syncInterval:      { type: Number, default: 60 },          // seconds
    pullMode:          { type: String, enum: ['PUSH', 'PULL', 'BOTH'], default: 'BOTH' },

    // Logs retention
    logsRetentionDays: { type: Number, default: 90 },

    // Metadata
    addedBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    isDeleted:  { type: Boolean, default: false },
    deletedAt:  { type: Date },
    deletedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

biometricDeviceSchema.index({ school: 1, branch: 1, isDeleted: 1 });
biometricDeviceSchema.index({ ip: 1, port: 1 }, { unique: true });

const BiometricDevice = mongoose.model('BiometricDevice', biometricDeviceSchema);
export default BiometricDevice;
