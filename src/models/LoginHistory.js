import mongoose from 'mongoose';

const loginHistorySchema = new mongoose.Schema(
  {
    school:     { type: mongoose.Schema.Types.ObjectId, ref: 'School', index: true },
    user:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    email:      { type: String, required: true, lowercase: true, trim: true },
    role:       { type: String },
    status:     { type: String, enum: ['success', 'failed', 'blocked'], required: true, index: true },
    ipAddress:  { type: String },
    userAgent:  { type: String },
    device:     { type: String },
    location:   { type: String },
    failureReason: { type: String },
  },
  { timestamps: true }
);

loginHistorySchema.index({ school: 1, createdAt: -1 });
loginHistorySchema.index({ user: 1, createdAt: -1 });
loginHistorySchema.index({ email: 1, createdAt: -1 });

const LoginHistory = mongoose.model('LoginHistory', loginHistorySchema);
export default LoginHistory;
