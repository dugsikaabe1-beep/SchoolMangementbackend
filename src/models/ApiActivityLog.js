import mongoose from 'mongoose';

const apiActivityLogSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', index: true },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    method: { type: String, required: true },
    endpoint: { type: String, required: true, index: true },
    statusCode: { type: Number, required: true, index: true },
    durationMs: { type: Number, required: true },
    requestTime: { type: Date, default: Date.now, index: true },
    ipAddress: { type: String },
    userAgent: { type: String },
  },
  { timestamps: true }
);

apiActivityLogSchema.index({ school: 1, branch: 1, requestTime: -1 });

const ApiActivityLog = mongoose.model('ApiActivityLog', apiActivityLogSchema);
export default ApiActivityLog;
