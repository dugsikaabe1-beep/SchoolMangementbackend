import mongoose from 'mongoose';

const calendarEventSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', index: true },
    title: { type: String, required: true },
    description: { type: String },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    type: {
      type: String,
      enum: ['holiday', 'exam', 'event', 'term_start', 'term_end', 'reopening'],
      default: 'event'
    },
    isPublic: { type: Boolean, default: true },
    targetRoles: [{ type: String }], // e.g. ['student', 'teacher', 'parent']
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

const CalendarEvent = mongoose.model('CalendarEvent', calendarEventSchema);
export default CalendarEvent;
