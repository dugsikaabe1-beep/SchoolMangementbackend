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
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    status: { 
      type: String, 
      enum: ['Scheduled', 'Active', 'Completed'], 
      default: 'Scheduled' 
    },
  },
  { timestamps: true }
);

const ExamSession = mongoose.model('ExamSession', examSessionSchema);
export default ExamSession;
