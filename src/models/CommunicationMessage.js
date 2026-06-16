import mongoose from 'mongoose';

const communicationMessageSchema = new mongoose.Schema(
  {
    // TENANT & BRANCH
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', index: true },

    // MESSAGE CONTENT
    title: { type: String, required: true, trim: true },
    subject: { type: String, trim: true },
    body: { type: String, required: true, trim: true },
    templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'NotificationTemplate' },
    
    // RECIPIENTS
    recipients: [
      {
        kind: { type: String, enum: ['user', 'class', 'branch', 'grade', 'school', 'group'], required: true },
        id: { type: mongoose.Schema.Types.ObjectId, required: true },
        name: { type: String, trim: true },
        role: { type: String, enum: ['student', 'teacher', 'parent', 'admin', 'schooladmin', 'branchmanager'] }
      }
    ],
    
    // CHANNELS
    channels: [
      {
        type: String,
        enum: ['in_app', 'email', 'sms', 'whatsapp', 'push'],
        default: 'in_app'
      }
    ],
    
    // STATUS
    status: {
      type: String,
      enum: ['draft', 'scheduled', 'queued', 'sending', 'sent', 'delivered', 'opened', 'failed', 'cancelled', 'archived'],
      default: 'draft',
      index: true
    },
    
    // SCHEDULING
    sendAt: { type: Date, index: true },
    timezone: { type: String, default: 'UTC' },
    isRecurring: { type: Boolean, default: false },
    recurrenceRule: { type: String }, // rrule or cron
    recurrenceEnd: { type: Date },
    
    // DELIVERY SUMMARY
    deliverySummary: {
      totalRecipients: { type: Number, default: 0 },
      sent: { type: Number, default: 0 },
      delivered: { type: Number, default: 0 },
      opened: { type: Number, default: 0 },
      failed: { type: Number, default: 0 }
    },
    
    // AUDIT
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    sentAt: { type: Date }
  },
  { timestamps: true }
);

// Indexes
communicationMessageSchema.index({ school: 1, status: 1, createdAt: -1 });
communicationMessageSchema.index({ school: 1, sendAt: 1 });
communicationMessageSchema.index({ school: 1, branch: 1 });
communicationMessageSchema.index({ templateId: 1 });

const CommunicationMessage = mongoose.model('CommunicationMessage', communicationMessageSchema);
export default CommunicationMessage;
