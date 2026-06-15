import mongoose from 'mongoose';

const discountSnapshotSchema = new mongoose.Schema(
  {
    name: String,
    type: String,
    valueType: String,
    value: Number,
    code: String,
  },
  { _id: false }
);

const discountAssignmentSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', index: true },
    discount: { type: mongoose.Schema.Types.ObjectId, ref: 'Discount', required: true, index: true },
    discountSnapshot: discountSnapshotSchema,
    scope: {
      type: String,
      enum: ['student', 'students', 'class', 'grade'],
      required: true,
      index: true,
    },
    students: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true }],
    class: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', index: true },
    grade: { type: String, trim: true, index: true },
    duration: {
      type: String,
      enum: ['one_month', 'semester', 'academic_year', 'permanent', 'custom'],
      default: 'permanent',
    },
    startDate: { type: Date, required: true, index: true },
    endDate: { type: Date, default: null, index: true },
    reason: { type: String, trim: true, maxlength: 500 },
    isActive: { type: Boolean, default: true, index: true },
    assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    removedAt: { type: Date },
    removedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

discountAssignmentSchema.index({ school: 1, isActive: 1, startDate: 1, endDate: 1 });
discountAssignmentSchema.index({ school: 1, discount: 1 });

const DiscountAssignment = mongoose.model('DiscountAssignment', discountAssignmentSchema);
export default DiscountAssignment;
