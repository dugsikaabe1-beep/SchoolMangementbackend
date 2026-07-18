import mongoose from 'mongoose';

const employeeLoanSchema = new mongoose.Schema(
  {
    school:       { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    branch:       { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', index: true },
    employee:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    loanType:     { type: String, enum: ['salary_advance', 'emergency', 'education', 'housing', 'other'], required: true },
    amount:       { type: Number, required: true, min: 0 },
    outstandingAmount: { type: Number, required: true, min: 0 },
    monthlyDeduction:  { type: Number, required: true, min: 0 },
    startDate:    { type: Date, required: true },
    endDate:      { type: Date },
    reason:       { type: String, trim: true },
    status:       { type: String, enum: ['pending', 'approved', 'rejected', 'active', 'completed', 'defaulted'], default: 'pending', index: true },
    approvedBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedAt:   { type: Date },
    rejectedBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    rejectedAt:   { type: Date },
    payments: [{
      amount:     { type: Number },
      date:       { type: Date },
      reference:  { type: String },
    }],
    isDeleted:    { type: Boolean, default: false },
  },
  { timestamps: true }
);

employeeLoanSchema.index({ school: 1, employee: 1, status: 1 });

const EmployeeLoan = mongoose.model('EmployeeLoan', employeeLoanSchema);
export default EmployeeLoan;
