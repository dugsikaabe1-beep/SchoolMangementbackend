import mongoose from 'mongoose';

const biometricDeviceLogSchema = new mongoose.Schema(
  {
    device: { type: mongoose.Schema.Types.ObjectId, ref: 'BiometricDevice', required: true, index: true },
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', index: true },

    type:    { type: String, required: true, index: true },   // DEVICE_ONLINE, DEVICE_OFFLINE, PULL_COMPLETE, PUSH_RECEIVED, SYNC_ERROR
    message: { type: String },
    meta:    { type: mongoose.Schema.Types.Mixed },

    isResolved:  { type: Boolean, default: false },
    resolvedAt:  { type: Date },
    resolvedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

biometricDeviceLogSchema.index({ device: 1, type: 1, createdAt: -1 });

const BiometricDeviceLog = mongoose.model('BiometricDeviceLog', biometricDeviceLogSchema);
export default BiometricDeviceLog;
