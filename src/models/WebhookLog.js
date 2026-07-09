import mongoose from 'mongoose';

/**
 * WebhookLog Model
 * Tracks incoming webhooks to prevent replay attacks and duplicate processing.
 */
const webhookLogSchema = new mongoose.Schema(
  {
    provider: {
      type: String,
      required: true,
      index: true
    },
    school: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'School',
      required: true,
      index: true
    },
    eventId: {
      type: String,
      required: true,
      index: true
    },
    event: {
      type: String,
      trim: true
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      required: true
    },
    signature: {
      type: String,
      trim: true
    },
    signatureValid: {
      type: Boolean,
      default: false
    },
    processed: {
      type: Boolean,
      default: false,
      index: true
    },
    processingResult: {
      type: String,
      trim: true
    },
    replayDetected: {
      type: Boolean,
      default: false
    },
    receivedAt: {
      type: Date,
      default: Date.now,
      index: true
    },
    processedAt: {
      type: Date
    }
  },
  {
    timestamps: true
  }
);

// Compound index for idempotency: provider + eventId must be unique per school
webhookLogSchema.index({ provider: 1, eventId: 1, school: 1 }, { unique: true });

const WebhookLog = mongoose.model('WebhookLog', webhookLogSchema);
export default WebhookLog;
