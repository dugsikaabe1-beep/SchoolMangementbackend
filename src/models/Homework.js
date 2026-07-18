import mongoose from 'mongoose';

const homeworkSchema = new mongoose.Schema(
  {
    school:      { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    branch:      { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', index: true },
    academicYear:{ type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', index: true },
    title:       { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    class:       { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true, index: true },
    subject:     { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true, index: true },
    teacher:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    dueDate:     { type: Date, required: true },
    totalMarks:  { type: Number, default: 0 },
    attachments: [{ url: String, name: String }],
    status:      { type: String, enum: ['draft', 'published', 'closed'], default: 'draft' },
    submissions: [{
      student:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      submittedAt:{ type: Date },
      marks:      { type: Number },
      feedback:   { type: String },
      fileUrl:    { type: String },
      status:     { type: String, enum: ['submitted', 'graded', 'returned'], default: 'submitted' },
    }],
    isDeleted:   { type: Boolean, default: false },
  },
  { timestamps: true }
);

homeworkSchema.index({ school: 1, class: 1, subject: 1 });
homeworkSchema.index({ school: 1, teacher: 1 });

const Homework = mongoose.model('Homework', homeworkSchema);
export default Homework;
