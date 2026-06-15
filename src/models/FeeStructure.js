import mongoose from 'mongoose';

const feeStructureSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', index: true },
    academicYear: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    name: { type: String, required: true }, // e.g. "Monthly Tuition Fee"
    type: { type: String, enum: ['standard', 'class_based', 'one_time'], default: 'standard' },
    baseAmount: { type: Number, required: true },
    classFees: [{
      class: { type: mongoose.Schema.Types.ObjectId, ref: 'Class' },
      amount: Number
    }],
    dueDate: { type: Number, default: 10 }, // Day of month
    lateFeePenalty: { type: Number, default: 0 },
    lateFeeType: { type: String, enum: ['fixed', 'percentage'], default: 'fixed' },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

const FeeStructure = mongoose.model('FeeStructure', feeStructureSchema);
export default FeeStructure;
