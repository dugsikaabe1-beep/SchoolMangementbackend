import mongoose from 'mongoose';

const notificationTemplateSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true }, // e.g., "Fee Reminder", "Attendance Alert"
    code: { type: String, required: true, unique: true, trim: true, lowercase: true }, // e.g., "fee_reminder", "attendance_alert"
    category: { 
      type: String, 
      enum: ['finance', 'academic', 'attendance', 'admission', 'general', 'events'], 
      default: 'general' 
    },
    subject: { type: String, required: true, trim: true }, // Email subject or SMS/WhatsApp first line
    body: { type: String, required: true, trim: true }, // Can include placeholders like {{studentName}}, {{amount}}, {{dueDate}}
    placeholders: [{ type: String }], // List of supported placeholders, e.g., ["studentName", "amount", "dueDate"]
    type: { 
      type: String, 
      enum: ['email', 'sms', 'whatsapp', 'push', 'all'], 
      default: 'all' 
    },
    isSystem: { type: Boolean, default: false }, // true = cannot be deleted (built-in templates)
    isActive: { type: Boolean, default: true },
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

// Indexes
notificationTemplateSchema.index({ school: 1, code: 1 }, { unique: true, partialFilterExpression: { isDeleted: false } });
notificationTemplateSchema.index({ school: 1, category: 1, isActive: 1 });

const NotificationTemplate = mongoose.model('NotificationTemplate', notificationTemplateSchema);
export default NotificationTemplate;
