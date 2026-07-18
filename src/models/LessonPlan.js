import mongoose from 'mongoose';

const lessonPlanSchema = new mongoose.Schema(
  {
    school:      { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    branch:      { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', index: true },
    academicYear:{ type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', index: true },
    title:       { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    class:       { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
    subject:     { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
    teacher:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    weekNumber:  { type: Number },
    dateFrom:    { type: Date },
    dateTo:      { type: Date },
    objectives:  [{ type: String }],
    topics:      [{
      name:        { type: String },
      description: { type: String },
      duration:    { type: String },
      resources:   [{ type: String }],
    }],
    teachingMethods: [{ type: String }],
    resources:       [{ type: String }],
    assessment:      { type: String },
    status:          { type: String, enum: ['draft', 'approved', 'active', 'completed'], default: 'draft' },
    approvedBy:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedAt:      { type: Date },
    isDeleted:       { type: Boolean, default: false },
  },
  { timestamps: true }
);

lessonPlanSchema.index({ school: 1, class: 1, subject: 1 });
lessonPlanSchema.index({ school: 1, teacher: 1 });

const LessonPlan = mongoose.model('LessonPlan', lessonPlanSchema);
export default LessonPlan;
