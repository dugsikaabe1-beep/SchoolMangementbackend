import mongoose from 'mongoose';

const markSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    subject: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
    class: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
    exam: { type: mongoose.Schema.Types.ObjectId, ref: 'ExamSession' }, // Added to link with ExamSession
    marks: { type: Number, default: 0 }, // Generic marks field for the linked exam
    monthly1: { type: Number, default: 0 },
    midterm: { type: Number, default: 0 },
    monthly2: { type: Number, default: 0 },
    final: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    remarks: { type: String, default: '' },
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    gradedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

// Auto-calculate total before save
markSchema.pre('save', function () {
  this.total = (this.monthly1 || 0) + (this.midterm || 0) + (this.monthly2 || 0) + (this.final || 0);
});

const Mark = mongoose.model('Mark', markSchema);
export default Mark;
