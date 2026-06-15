import mongoose from 'mongoose';

const examSchema = new mongoose.Schema(
  {
    name: { type: String, required: true }, // e.g., Midterm 2026, Final 2026
    term: { 
      type: String, 
      enum: ['Monthly1', 'Midterm', 'Monthly2', 'Final'], 
      required: true 
    },
    date: { type: Date, required: true },
    class: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
    subject: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
    maxMarks: { type: Number, required: true, default: 100 },
    status: { 
      type: String, 
      enum: ['Pending', 'Scheduled', 'Published', 'Completed'], 
      default: 'Scheduled' 
    },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    academicYear: { type: String, required: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

// Index for multi-tenant and multi-branch queries
examSchema.index({ school: 1, branch: 1, academicYear: 1 });
examSchema.index({ school: 1, branch: 1, deletedAt: 1 });

const Exam = mongoose.model('Exam', examSchema);
export default Exam;
