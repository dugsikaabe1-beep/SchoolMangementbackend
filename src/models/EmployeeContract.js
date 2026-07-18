import mongoose from 'mongoose';

const employeeContractSchema = new mongoose.Schema(
  {
    school:        { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    branch:        { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', index: true },
    employee:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    contractType:  { type: String, enum: ['permanent', 'contract', 'temporary', 'internship', 'probation'], required: true },
    startDate:     { type: Date, required: true },
    endDate:       { type: Date },
    probationEndDate: { type: Date },
    designation:   { type: mongoose.Schema.Types.ObjectId, ref: 'Designation' },
    department:    { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
    salary:        { type: Number, min: 0 },
    terms:         { type: String },
    documents:     [{ url: String, name: String }],
    renewalCount:  { type: Number, default: 0 },
    status:        { type: String, enum: ['active', 'expired', 'terminated', 'renewed', 'on_notice'], default: 'active', index: true },
    terminatedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    terminatedAt:  { type: Date },
    terminationReason: { type: String },
    noticePeriodDays:  { type: Number, default: 30 },
    isDeleted:     { type: Boolean, default: false },
  },
  { timestamps: true }
);

employeeContractSchema.index({ school: 1, employee: 1, status: 1 });

const EmployeeContract = mongoose.model('EmployeeContract', employeeContractSchema);
export default EmployeeContract;
