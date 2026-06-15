import mongoose from 'mongoose';

const subjectSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { 
      type: String, 
      required: true, 
      uppercase: true,
      trim: true,
      match: [/^[A-Z0-9]+$/, 'Subject code may only contain letters and numbers']
    },
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    academicYear: { type: String, required: true, index: true },
    timetable: [
      {
        day: { type: String, enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] },
        startTime: { type: String }, // e.g., "08:00 AM"
        endTime: { type: String },   // e.g., "09:00 AM"
        room: { type: String },
      }
    ],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

// Compound unique index: subject code must be unique per school per branch per academic year
subjectSchema.index({ school: 1, branch: 1, academicYear: 1, code: 1 }, { unique: true });

const Subject = mongoose.model('Subject', subjectSchema);
export default Subject;
