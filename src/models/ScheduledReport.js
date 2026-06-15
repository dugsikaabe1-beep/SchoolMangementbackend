import mongoose from 'mongoose';

const scheduledReportSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', index: true },
    name: { type: String, required: true, trim: true },
    reportType: {
      type: String,
      enum: ['revenue', 'attendance', 'risk', 'defaulters', 'teacher-performance'],
      required: true,
    },
    frequency: {
      type: String,
      enum: ['daily', 'weekly', 'monthly'],
      required: true,
    },
    dayOfWeek: { type: Number, min: 0, max: 6 },
    dayOfMonth: { type: Number, min: 1, max: 31 },
    deliveryChannels: [{
      type: String,
      enum: ['email', 'notification'],
    }],
    recipients: [{ type: String, trim: true }],
    isActive: { type: Boolean, default: true },
    lastRunAt: { type: Date },
    nextRunAt: { type: Date },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

scheduledReportSchema.index({ school: 1, branch: 1, reportType: 1, isActive: 1 });

const ScheduledReport = mongoose.model('ScheduledReport', scheduledReportSchema);
export default ScheduledReport;
