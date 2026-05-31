import mongoose from 'mongoose';

const classSubjectSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    class: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
    subject: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
    teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

classSubjectSchema.index({ school: 1, class: 1, subject: 1 }, { unique: true });

const ClassSubject = mongoose.model('ClassSubject', classSubjectSchema);
export default ClassSubject;
