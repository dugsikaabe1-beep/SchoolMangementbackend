import mongoose from 'mongoose';

const scheduleSchema = new mongoose.Schema({
  school: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'School',
    required: true,
    index: true
  },
  branch: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch',
    required: true,
    index: true
  },
  academicYear: { type: String, required: true, index: true },
  class: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class',
    required: true
  },
  subject: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subject',
    required: true
  },
  teacher: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  day: {
    type: String,
    enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
    required: true
  },
  startTime: {
    type: String, // format "HH:mm"
    required: true
  },
  endTime: {
    type: String, // format "HH:mm"
    required: true
  },
  color: {
    type: String, // for UI color coding
    default: '#4F46E5'
  },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  deletedAt: { type: Date },
  deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

// Index for multi-tenant and multi-branch queries
scheduleSchema.index({ school: 1, branch: 1, academicYear: 1, class: 1, day: 1 });

const Schedule = mongoose.model('Schedule', scheduleSchema);
export default Schedule;