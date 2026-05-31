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
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  },
  { timestamps: true }
);

const Exam = mongoose.model('Exam', examSchema);
export default Exam;
