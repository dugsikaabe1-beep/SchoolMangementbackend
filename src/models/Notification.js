import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
  {
    // Backwards-compatible single recipient (deprecated)
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },

    // Tenant / school awareness
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', index: true },
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', index: true },

    // Recipients: expanded list or groups (resolved at queue time)
    recipients: [
      {
        kind: { type: String, enum: ['user', 'group'], required: true },
        id: { type: mongoose.Schema.Types.ObjectId, required: true },
      }
    ],

    title: { type: String, required: true },
    message: { type: String, required: true },
    messageType: {
      type: String,
      enum: ['info', 'warning', 'success', 'danger', 'announcement', 'attendance', 'finance', 'exam', 'subscription', 'support', 'admission', 'promotion'],
      default: 'info'
    },
    channels: [
      {
        type: String,
        enum: ['in_app', 'email', 'sms', 'whatsapp', 'push'],
        default: 'in_app'
      }
    ],
    priority: {
      type: String,
      enum: ['low', 'normal', 'high', 'urgent'],
      default: 'normal'
    },

    // overall status for the notification job
    status: {
      type: String,
      enum: ['created', 'queued', 'processing', 'completed', 'failed', 'cancelled'],
      default: 'created',
      index: true
    },

    // link or action to open from client
    actionLink: { type: String },
    metadata: { type: mongoose.Schema.Types.Mixed },

    // template reference and language
    templateCode: { type: String, index: true },
    language: { type: String, default: 'en' },

    // read tracking for in-app
    readBy: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        readAt: { type: Date }
      }
    ],

    // delivery summary aggregated from DeliveryLog updates
    deliverySummary: {
      total: { type: Number, default: 0 },
      sent: { type: Number, default: 0 },
      delivered: { type: Number, default: 0 },
      opened: { type: Number, default: 0 },
      failed: { type: Number, default: 0 }
    },

    // scheduling
    scheduling: {
      sendAt: { type: Date },
      timezone: { type: String },
      recurring: { type: mongoose.Schema.Types.Mixed } // e.g., rrule or cron expression
    },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

// Auto-delete read/archived notifications after 90 days to keep collection size bounded
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7776000 });

// Compound indexes for multi-tenant queries and recent activity
notificationSchema.index({ tenantId: 1, school: 1, branch: 1, createdAt: -1 });
notificationSchema.index({ status: 1, 'scheduling.sendAt': 1 });
notificationSchema.index({ title: 'text', message: 'text' });

const Notification = mongoose.model('Notification', notificationSchema);
export default Notification;
