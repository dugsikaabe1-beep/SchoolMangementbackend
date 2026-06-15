import mongoose from 'mongoose';

const promotionHistorySchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
    promotionType: {
      type: String,
      enum: ['individual', 'class', 'grade', 'year_transition'],
      required: true,
    },
    fromClass: { type: mongoose.Schema.Types.ObjectId, ref: 'Class' },
    toClass: { type: mongoose.Schema.Types.ObjectId, ref: 'Class' },
    fromAcademicYear: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear' },
    toAcademicYear: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear' },
    studentIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    studentCount: { type: Number, default: 0 },
    promotedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    notes: { type: String, trim: true },
    metadata: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

promotionHistorySchema.index({ school: 1, branch: 1, createdAt: -1 });
promotionHistorySchema.index({ school: 1, branch: 1, fromAcademicYear: 1 });

const PromotionHistory = mongoose.model('PromotionHistory', promotionHistorySchema);
export default PromotionHistory;
