import mongoose from 'mongoose';

const componentSchema = new mongoose.Schema(
  {
    name:       { type: String, required: true, trim: true },
    type:       { type: String, enum: ['allowance', 'deduction'], required: true },
    calcType:   { type: String, enum: ['fixed', 'percentage'], default: 'fixed' },
    value:      { type: Number, required: true, min: 0 },
    isTaxable:  { type: Boolean, default: false },
    isStatutory:{ type: Boolean, default: false },
    description:{ type: String, trim: true },
    isActive:   { type: Boolean, default: true },
  },
  { _id: true }
);

const salaryStructureSchema = new mongoose.Schema(
  {
    school:       { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    branch:       { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', index: true },
    name:         { type: String, required: true, trim: true },  // e.g. "Teacher Grade A"
    description:  { type: String, trim: true },
    basicSalary:  { type: Number, required: true, min: 0 },
    components:   { type: [componentSchema], default: [] },
    taxRate:      { type: Number, default: 0, min: 0, max: 100 },  // flat % tax on taxable income
    currency:     { type: String, default: 'USD', trim: true },
    isDefault:    { type: Boolean, default: false },
    isActive:     { type: Boolean, default: true },
    isDeleted:    { type: Boolean, default: false },
    deletedAt:    { type: Date },
    deletedBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

salaryStructureSchema.index({ school: 1, name: 1 });

const SalaryStructure = mongoose.model('SalaryStructure', salaryStructureSchema);
export default SalaryStructure;
