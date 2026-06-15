import mongoose from 'mongoose';

const examSessionSchema = new mongoose.Schema(
  {
    name: { 
      type: String, 
      required: true,
      enum: ['Monthly 1', 'Midterm', 'Monthly 2', 'Final']
    },
    date: { type: Date, required: true },
    maxMarks: { type: Number, required: true, default: 100 },
    classes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Class' }],
    subjects: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Subject' }],
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    academicYear: { type: String, required: true, index: true },
    status: { 
      type: String, 
      enum: ['Scheduled', 'Active', 'Completed'], 
      default: 'Scheduled' 
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    deletedAt: { type: Date },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

// Index for multi-tenant and multi-branch queries
examSessionSchema.index({ school: 1, branch: 1, academicYear: 1 });

const ExamSession = mongoose.model('ExamSession', examSessionSchema);
export default ExamSession;
