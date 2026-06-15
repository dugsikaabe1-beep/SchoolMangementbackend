import mongoose from 'mongoose';

const discountSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', index: true },
    name: { type: String, required: true }, // e.g. "Sibling Discount"
    type: {
      type: String,
      enum: ['scholarship', 'sibling', 'staff_child', 'special_needs', 'merit', 'financial_aid', 'promotional', 'custom'],
      required: true
    },
    valueType: { type: String, enum: ['fixed', 'percentage'], default: 'percentage' },
    value: { type: Number, required: true },
    code: { type: String, uppercase: true },
    description: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

discountSchema.index({ school: 1, branch: 1, code: 1 }, { unique: true, sparse: true });

const Discount = mongoose.model('Discount', discountSchema);
export default Discount;
