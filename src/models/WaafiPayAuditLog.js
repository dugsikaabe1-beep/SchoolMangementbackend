import mongoose from 'mongoose';

/**
 * WaafiPayAuditLog Model
 * Dedicated audit trail for all WaafiPay operations.
 */
const waafiPayAuditLogSchema = new mongoose.Schema(
  {
    school: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'School',
      required: true,
      index: true
    },
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      index: true
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true
    },
    operation: {
      type: String,
      enum: ['PURCHASE', 'REVERSAL', 'PREAUTH', 'COMMIT', 'CANCEL', 'HPP', 'WEBHOOK', 'SETTINGS_CHANGE', 'TEST_CONNECTION'],
      required: true,
      index: true
    },
    transactionId: {
      type: String,
      index: true
    },
    waafiTransactionId: {
      type: String,
      index: true
    },
    requestPayload: {
      type: mongoose.Schema.Types.Mixed
    },
    responsePayload: {
      type: mongoose.Schema.Types.Mixed
    },
    durationMs: {
      type: Number
    },
    success: {
      type: Boolean,
      required: true,
      index: true
    },
    errorCode: {
      type: String,
      trim: true
    },
    errorMessage: {
      type: String,
      trim: true
    },
    ip: {
      type: String,
      trim: true
    },
    userAgent: {
      type: String,
      trim: true
    }
  },
  {
    timestamps: true
  }
);

waafiPayAuditLogSchema.index({ createdAt: -1 });

const WaafiPayAuditLog = mongoose.model('WaafiPayAuditLog', waafiPayAuditLogSchema);
export default WaafiPayAuditLog;
