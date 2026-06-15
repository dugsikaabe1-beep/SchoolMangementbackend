import mongoose from 'mongoose';

const emailLogSchema = new mongoose.Schema(
  {
    to: { type: String, required: true, lowercase: true, trim: true, index: true },
    from: { type: String, trim: true },
    replyTo: { type: String, trim: true },
    subject: { type: String, trim: true },
    type: { type: String, trim: true, default: 'GENERAL', index: true },
    provider: { type: String, enum: ['resend', 'smtp'], required: true },
    status: {
      type: String,
      enum: ['queued', 'sent', 'delivered', 'failed', 'rejected'],
      default: 'queued',
      index: true,
    },
    messageId: { type: String, index: true },
    response: mongoose.Schema.Types.Mixed,
    error: String,
    metadata: mongoose.Schema.Types.Mixed,
    sentAt: Date,
  },
  { timestamps: true }
);

const EmailLog = mongoose.model('EmailLog', emailLogSchema);
export default EmailLog;
