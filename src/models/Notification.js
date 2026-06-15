import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
  {
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', index: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    type: { 
      type: String, 
      enum: ['info', 'warning', 'success', 'danger', 'announcement', 'attendance', 'finance', 'exam', 'subscription', 'support', 'admission', 'promotion'],
      default: 'info' 
    },
    channels: [{
      type: String,
      enum: ['in_app', 'email', 'sms', 'whatsapp', 'push'],
      default: 'in_app'
    }],
    priority: {
      type: String,
      enum: ['low', 'normal', 'high', 'urgent'],
      default: 'normal'
    },
    status: { 
      type: String, 
      enum: ['unread', 'read', 'archived', 'delivered', 'failed'], 
      default: 'unread',
      index: true
    },
    actionLink: { type: String }, // Optional link to redirect user
    metadata: { type: mongoose.Schema.Types.Mixed }, // Extra data
  },
  { timestamps: true }
);

// Auto-delete read notifications after 30 days
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 2592000 });

const Notification = mongoose.model('Notification', notificationSchema);
export default Notification;
