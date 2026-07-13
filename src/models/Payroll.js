import mongoose from 'mongoose';

// ── Sub-schemas ───────────────────────────────────────────────────────────────

const allowanceItemSchema = new mongoose.Schema(
  {
    name:       { type: String, required: true, trim: true },
    type:       { type: String, enum: ['fixed', 'percentage'], default: 'fixed' },
    value:      { type: Number, required: true, min: 0 },
    amount:     { type: Number, required: true, min: 0 }, // computed: fixed=value, pct=basicSalary*value/100
    isTaxable:  { type: Boolean, default: false },
  },
  { _id: false }
);

const deductionItemSchema = new mongoose.Schema(
  {
    name:       { type: String, required: true, trim: true },
    type:       { type: String, enum: ['fixed', 'percentage'], default: 'fixed' },
    value:      { type: Number, required: true, min: 0 },
    amount:     { type: Number, required: true, min: 0 },
    isStatutory:{ type: Boolean, default: false }, // e.g., PAYE, NHIF
  },
  { _id: false }
);

// ── Main schema ───────────────────────────────────────────────────────────────

const payrollSchema = new mongoose.Schema(
  {
    school:          { type: mongoose.Schema.Types.ObjectId, ref: 'School',   required: true, index: true },
    branch:          { type: mongoose.Schema.Types.ObjectId, ref: 'Branch',   required: true, index: true },
    user:            { type: mongoose.Schema.Types.ObjectId, ref: 'User',     required: true, index: true },
    academicYear:    { type: String, index: true },

    // Period
    month:           { type: Number, required: true, min: 1, max: 12 },
    year:            { type: Number, required: true },

    // Earnings
    basicSalary:     { type: Number, required: true, min: 0 },
    allowanceItems:  { type: [allowanceItemSchema], default: [] },
    totalAllowances: { type: Number, default: 0 },    // sum of allowanceItems.amount
    grossSalary:     { type: Number, default: 0 },    // basicSalary + totalAllowances

    // Deductions
    deductionItems:  { type: [deductionItemSchema], default: [] },
    totalDeductions: { type: Number, default: 0 },    // sum of deductionItems.amount

    // Tax
    taxableIncome:   { type: Number, default: 0 },    // grossSalary minus non-taxable allowances
    taxRate:         { type: Number, default: 0, min: 0, max: 100 }, // %
    taxAmount:       { type: Number, default: 0 },

    // Net
    netSalary:       { type: Number, required: true, min: 0 },

    // Payslip reference
    payslipNumber:   { type: String, trim: true, index: true },

    // Payment info
    status:          { type: String, enum: ['Draft', 'Approved', 'Paid', 'Cancelled'], default: 'Draft' },
    paymentDate:     { type: Date },
    paymentMethod:   { type: String, enum: ['Cash', 'Bank Transfer', 'Cheque', 'Mobile Money'], default: 'Bank Transfer' },
    bankName:        { type: String, trim: true },
    accountNumber:   { type: String, trim: true },
    transactionRef:  { type: String, trim: true },

    // References
    salaryStructure: { type: mongoose.Schema.Types.ObjectId, ref: 'SalaryStructure' },
    payrollRun:      { type: mongoose.Schema.Types.ObjectId, ref: 'PayrollRun' },  // optional batch run

    remarks:         { type: String, trim: true },
    approvedBy:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedAt:      { type: Date },

    // Soft delete
    isDeleted:       { type: Boolean, default: false },
    deletedAt:       { type: Date },
    deletedBy:       { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdBy:       { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy:       { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

// Compound unique index: one payroll record per user per month/year within a school
payrollSchema.index({ school: 1, branch: 1, user: 1, month: 1, year: 1 }, { unique: true, sparse: true });
payrollSchema.index({ school: 1, branch: 1, year: 1, month: 1 });
payrollSchema.index({ school: 1, status: 1 });

const Payroll = mongoose.model('Payroll', payrollSchema);
export default Payroll;
