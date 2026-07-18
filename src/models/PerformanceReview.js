import mongoose from 'mongoose';

const performanceReviewSchema = new mongoose.Schema(
  {
    school:       { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    branch:       { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', index: true },
    employee:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    reviewer:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    period:       { type: String, required: true, trim: true },
    academicYear: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', index: true },
    type:         { type: String, enum: ['quarterly', 'semi_annual', 'annual', 'probation', 'ad_hoc'], default: 'annual' },
    criteria: [{
      name:        { type: String, required: true },
      weight:      { type: Number, default: 1 },
      score:       { type: Number, min: 0, max: 10 },
      comments:    { type: String },
    }],
    overallScore: { type: Number, min: 0, max: 10 },
    rating:       { type: String, enum: ['excellent', 'good', 'satisfactory', 'needs_improvement', 'unsatisfactory'] },
    strengths:    [{ type: String }],
    improvements: [{ type: String }],
    goals:        [{ description: { type: String }, status: { type: String, enum: ['pending', 'in_progress', 'completed'] } }],
    comments:     { type: String, trim: true },
    status:       { type: String, enum: ['draft', 'submitted', 'acknowledged', 'completed'], default: 'draft' },
    acknowledgedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    acknowledgedAt: { type: Date },
    isDeleted:    { type: Boolean, default: false },
  },
  { timestamps: true }
);

performanceReviewSchema.index({ school: 1, employee: 1, period: 1 });

const PerformanceReview = mongoose.model('PerformanceReview', performanceReviewSchema);
export default PerformanceReview;
