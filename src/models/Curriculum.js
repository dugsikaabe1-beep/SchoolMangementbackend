import mongoose from 'mongoose';

const curriculumSchema = new mongoose.Schema(
  {
    school:       { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    branch:       { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', index: true },
    academicYear: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', index: true },
    class:        { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
    subject:      { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
    title:        { type: String, required: true, trim: true },
    description:  { type: String, trim: true },
    terms: [{
      term:       { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicTerm' },
      topics:     [{ type: String }],
      objectives: [{ type: String }],
      resources:  [{ type: String }],
      assessment: { type: String },
    }],
    totalWeeks:   { type: Number, default: 0 },
    status:       { type: String, enum: ['draft', 'active', 'archived'], default: 'draft' },
    approvedBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    isDeleted:    { type: Boolean, default: false },
  },
  { timestamps: true }
);

curriculumSchema.index({ school: 1, class: 1, subject: 1, academicYear: 1 });

const Curriculum = mongoose.model('Curriculum', curriculumSchema);
export default Curriculum;
