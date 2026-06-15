import mongoose from 'mongoose';

const deliveryLogSchema = new mongoose.Schema(
  {
    notificationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Notification', index: true },
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', index: true },
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', index: true },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', index: true },
    channel: { type: String, enum: ['email', 'sms', 'whatsapp', 'push'], required: true, index: true },
    provider: { type: String, required: true, index: true },
    providerMessageId: { type: String, index: true },
    to: {
      phone: { type: String },
      email: { type: String },
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
    },
    status: { type: String, enum: ['queued', 'sent', 'delivered', 'opened', 'failed', 'bounced'], default: 'queued', index: true },
    attempt: { type: Number, default: 0 },
    response: { type: mongoose.Schema.Types.Mixed },
    sentAt: { type: Date },
    deliveredAt: { type: Date },
    openedAt: { type: Date },
    failedAt: { type: Date }
    ,lastError: { type: String },
    lastAttemptAt: { type: Date }
  },
  { timestamps: true }
);

deliveryLogSchema.index({ notificationId: 1 });
deliveryLogSchema.index({ providerMessageId: 1 });
deliveryLogSchema.index({ tenantId: 1, school: 1 });

const DeliveryLog = mongoose.model('DeliveryLog', deliveryLogSchema);
export default DeliveryLog;
