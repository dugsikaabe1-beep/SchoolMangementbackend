import mongoose from 'mongoose';

const payrollSchema = new mongoose.Schema(
  {
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true }, // Teacher or Staff
    academicYear: { type: String, required: true, index: true },
    month: { type: Number, required: true, min: 1, max: 12 },
    year: { type: Number, required: true },
    basicSalary: { type: Number, required: true, min: 0 },
    allowances: { type: Number, default: 0 },
    deductions: { type: Number, default: 0 },
    netSalary: { type: Number, required: true },
    status: { type: String, enum: ['Paid', 'Pending', 'Processing'], default: 'Pending' },
    paymentDate: { type: Date },
    paymentMethod: { type: String, enum: ['Cash', 'Bank Transfer', 'Cheque'], default: 'Bank Transfer' },
    remarks: { type: String, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    deletedAt: { type: Date },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

payrollSchema.index({ school: 1, branch: 1, year: 1, month: 1 });

const Payroll = mongoose.model('Payroll', payrollSchema);
export default Payroll;
