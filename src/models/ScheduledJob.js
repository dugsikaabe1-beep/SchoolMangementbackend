import mongoose from 'mongoose';

const scheduledJobSchema = new mongoose.Schema(
  {
    notificationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Notification', required: true, index: true },
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', index: true },
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', index: true },
    nextRunAt: { type: Date, index: true },
    recurrenceRule: { type: String }, // e.g., rrule or cron
    timezone: { type: String },
    status: { type: String, enum: ['scheduled', 'running', 'completed', 'failed', 'cancelled'], default: 'scheduled' },
    lastRunAt: { type: Date },
    attempts: { type: Number, default: 0 }
  },
  { timestamps: true }
);

scheduledJobSchema.index({ tenantId: 1, school: 1, nextRunAt: 1 });

const ScheduledJob = mongoose.model('ScheduledJob', scheduledJobSchema);
export default ScheduledJob;
