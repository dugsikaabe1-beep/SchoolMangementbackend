import mongoose from 'mongoose';

const errorLogSchema = new mongoose.Schema(
  {
    tenantId: { type: String, index: true }, // subdomain or schoolId
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    type: { type: String, enum: ['frontend', 'backend'], required: true, index: true },
    message: { type: String, required: true },
    stack: { type: String },
    url: { type: String },
    userAgent: { type: String },
    metadata: { type: mongoose.Schema.Types.Mixed },
    severity: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
    status: { type: String, enum: ['new', 'investigating', 'resolved', 'ignored'], default: 'new' },
    isDeleted: { type: Boolean, default: false }
  },
  { timestamps: true }
);

const ErrorLog = mongoose.model('ErrorLog', errorLogSchema);
export default ErrorLog;