import mongoose from 'mongoose';

const deliveryLogSchema = new mongoose.Schema(
  {
    notificationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Notification' },
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'School' },
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School' },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
    channel: { type: String, enum: ['email', 'sms', 'whatsapp', 'push'], required: true },
    provider: { type: String, required: true },
    providerMessageId: { type: String },
    
    // CRITICAL: Recipient details (always from database, never manual)
    to: {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
      name: { type: String, required: true },
      role: { type: String, enum: ['student', 'teacher', 'parent', 'admin', 'schooladmin', 'branchmanager', 'accountant', 'superadmin'], required: true },
      email: { type: String },
      phone: { type: String },
      whatsappNumber: { type: String }
    },
    
    status: { type: String, enum: ['queued', 'sent', 'delivered', 'opened', 'failed', 'bounced'], default: 'queued', index: true },
    attempt: { type: Number, default: 0 },
    response: { type: mongoose.Schema.Types.Mixed },
    sentAt: { type: Date },
    deliveredAt: { type: Date },
    openedAt: { type: Date },
    failedAt: { type: Date },
    lastError: { type: String },
    lastAttemptAt: { type: Date },
    
    // Audit
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

deliveryLogSchema.index({ notificationId: 1 });
deliveryLogSchema.index({ providerMessageId: 1 });
deliveryLogSchema.index({ tenantId: 1, school: 1 });
deliveryLogSchema.index({ 'to.userId': 1 });
deliveryLogSchema.index({ channel: 1, status: 1 });
deliveryLogSchema.index({ createdAt: -1 });

const DeliveryLog = mongoose.model('DeliveryLog', deliveryLogSchema);
export default DeliveryLog;
